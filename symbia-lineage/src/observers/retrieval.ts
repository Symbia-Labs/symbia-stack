/**
 * Retrieval observer — a page or file fetched from a URL, observed.
 *
 * This is the second observer, and it exists to test whether the Observation
 * primitive is actually general or was quietly shaped around a screen. It is
 * also the observer most likely to be pointed at something hostile, so a few
 * things are done deliberately rather than conveniently:
 *
 *  - **The response body is chunked as it arrives**, and each chunk is chained
 *    on arrival. A retrieval that dies mid-body therefore still attests the
 *    part that arrived, and the close event says `complete: false` explicitly.
 *    Nothing infers completion from the absence of an error.
 *
 *  - **Redirects are recorded, not flattened.** The URL asked for and the URL
 *    that answered are different facts and are stored as different fields. A
 *    record that only kept the requested URL would describe a fetch that did
 *    not happen.
 *
 *  - **The TLS chain is captured**, which is the one place a third party's
 *    signature enters an observation. Everything else in this system is our own
 *    assertion about our own behaviour; the certificate is somebody else
 *    vouching for the name we connected to.
 *
 *  - **`server_date` is recorded as a claim, never as truth.** It is whatever
 *    the origin said the time was. It is not evidence of when anything
 *    happened; our own timestamp is.
 *
 * What this observer emphatically does NOT assert is that the content is true.
 * A page can lie, and this records the lie exactly and faithfully. See
 * CLAIMS.retrieval.
 */
import { request } from 'node:https';
import { request as httpRequest } from 'node:http';
import type { TLSSocket, DetailedPeerCertificate, PeerCertificate } from 'node:tls';
import type { Identity } from '@symbia/crypto';
import { Observation } from '../observation.js';
import type { RetrievalSource } from '../claims.js';
import type { AttestationLevel } from '../attestation.js';

export interface RetrieveOptions {
  url: string;
  identity: Identity;
  level: AttestationLevel;
  genesis?: { id: string; epoch?: string; fingerprint?: string } | null;
  idPrefix?: string;
  sink: (line: string) => void;
  /** Where the retrieved bytes go. Omit to observe without storing. */
  onData?: (chunk: Buffer) => void;
  maxRedirects?: number;
  /** Refuse bodies over this size rather than filling memory or disk. */
  maxBytes?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  /**
   * Target bytes per chained chunk. Arriving data is coalesced to roughly this
   * before a lineage event is written.
   *
   * This matters more than it looks. Signing each `data` event directly means
   * chunking at whatever size TCP happened to deliver — measured at ~1.4 KB,
   * which produced 11.4 KB of ledger for 19 KB of content, 60% overhead, and
   * 148 signatures for a 200 KB page. At 64 KB the same page is four events.
   *
   * The floor on this is the crash case: chunks are the granularity at which a
   * dead transfer stays attested, so a very large value trades recoverable
   * evidence for a smaller ledger.
   */
  chunkBytes?: number;
}

export interface RetrieveResult {
  observation_id: string;
  source: RetrievalSource;
  chunks: number;
  bytes: number;
  head: string;
  complete: boolean;
  note: string | null;
}

function describeCert(cert: DetailedPeerCertificate | undefined): RetrievalSource['tls'] {
  if (!cert || !cert.subject) return null;
  // Walk to the root, guarding against the self-referential last link — the
  // root's issuerCertificate points at itself, so a naive walk never ends.
  let chain = 0;
  let node: DetailedPeerCertificate | undefined = cert;
  const seen = new Set<string>();
  while (node && !seen.has(node.fingerprint256 ?? String(chain))) {
    seen.add(node.fingerprint256 ?? String(chain));
    chain += 1;
    node = node.issuerCertificate && node.issuerCertificate !== node
      ? node.issuerCertificate : undefined;
  }
  return {
    subject: cert.subject?.CN ?? null,
    issuer: cert.issuer?.CN ?? null,
    fingerprint256: cert.fingerprint256 ?? null,
    valid_from: cert.valid_from ?? null,
    valid_to: cert.valid_to ?? null,
    chain_length: chain || null,
  };
}

/**
 * Fetch a URL and produce a signed, chained observation of what came back.
 *
 * Resolves even when the retrieval fails partway: a truncated observation is
 * still evidence about what arrived, and throwing it away would lose exactly
 * the information a reader most needs.
 */
export function retrieve(opts: RetrieveOptions): Promise<RetrieveResult> {
  const maxRedirects = opts.maxRedirects ?? 5;
  const maxBytes = opts.maxBytes ?? 32 * 1024 * 1024;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const chunkBytes = opts.chunkBytes ?? 64 * 1024;
  const redirects: string[] = [];

  return new Promise((resolve, reject) => {
    const go = (url: string) => {
      let parsed: URL;
      try { parsed = new URL(url); } catch { reject(new Error('invalid url: ' + url)); return; }
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        reject(new Error('unsupported protocol: ' + parsed.protocol));
        return;
      }
      const send = parsed.protocol === 'https:' ? request : httpRequest;
      const req = send(parsed, { headers: opts.headers, timeout: timeoutMs }, (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;

        // Redirects are followed, and recorded. The URL asked for and the URL
        // that answered are different facts.
        if (status >= 300 && status < 400 && location) {
          res.resume();
          if (redirects.length >= maxRedirects) {
            reject(new Error(`too many redirects (${maxRedirects})`));
            return;
          }
          const next = new URL(location, parsed).toString();
          redirects.push(next);
          go(next);
          return;
        }

        // TLS details are read from the live socket before the body is
        // consumed — this is the only moment they exist.
        const socket = res.socket as TLSSocket;
        const tls = typeof socket.getPeerCertificate === 'function'
          ? describeCert(socket.getPeerCertificate(true)) : null;

        const source: RetrievalSource = {
          kind: 'retrieval',
          url_requested: opts.url,
          url_final: parsed.toString(),
          redirects,
          status,
          media_type: (res.headers['content-type'] as string) ?? null,
          bytes: 0,
          tls,
          // The origin's claim about the time. Recorded as a claim.
          server_date: (res.headers['date'] as string) ?? null,
        };

        const obs = new Observation({
          kind: 'retrieval',
          idPrefix: opts.idPrefix ?? 'symbia:retriever',
          identity: opts.identity,
          level: opts.level,
          genesis: opts.genesis ?? null,
          source,
          sink: opts.sink,
        });

        let bytes = 0;
        let aborted: string | null = null;
        // Coalesce arriving data to the target chunk size before chaining, so
        // the ledger is granular by design rather than by whatever TCP handed
        // us. Nothing is buffered beyond one chunk: everything already chained
        // is already committed, so a crash keeps the evidence up to the last
        // completed chunk.
        let pending: Buffer[] = [];
        let pendingBytes = 0;
        const flush = () => {
          if (!pendingBytes) return;
          obs.chunk(Buffer.concat(pending, pendingBytes));
          pending = [];
          pendingBytes = 0;
        };

        res.on('data', (chunk: Buffer) => {
          if (aborted) return;
          bytes += chunk.length;
          if (bytes > maxBytes) {
            aborted = `body exceeded maxBytes (${maxBytes})`;
            // Chain what did arrive before tearing down — a refused body is
            // still an observation of the part that got here.
            pending.push(chunk); pendingBytes += chunk.length;
            flush();
            opts.onData?.(chunk);
            res.destroy();
            return;
          }
          pending.push(chunk);
          pendingBytes += chunk.length;
          if (pendingBytes >= chunkBytes) flush();
          opts.onData?.(chunk);
        });

        res.on('end', () => {
          flush();
          const sealed = obs.close({ complete: !aborted, note: aborted ?? undefined });
          resolve({ observation_id: sealed.id, source: { ...source, bytes },
            chunks: sealed.chunks, bytes: sealed.bytes, head: sealed.head,
            complete: sealed.complete, note: aborted });
        });

        // A connection that drops mid-body is not an error to be swallowed —
        // it is an observation that is honestly incomplete.
        res.on('error', (err) => {
          flush();
          const sealed = obs.close({ complete: false, note: 'transport error: ' + err.message });
          resolve({ observation_id: sealed.id, source: { ...source, bytes },
            chunks: sealed.chunks, bytes: sealed.bytes, head: sealed.head,
            complete: false, note: 'transport error: ' + err.message });
        });
        res.on('close', () => {
          if (!aborted || res.readableEnded) return;
          flush();
          const sealed = obs.close({ complete: false, note: aborted ?? undefined });
          resolve({ observation_id: sealed.id, source: { ...source, bytes },
            chunks: sealed.chunks, bytes: sealed.bytes, head: sealed.head,
            complete: false, note: aborted ?? undefined });
        });
      });

      req.on('timeout', () => { req.destroy(new Error(`timeout after ${timeoutMs}ms`)); });
      req.on('error', reject);
      req.end();
    };
    go(opts.url);
  });
}
