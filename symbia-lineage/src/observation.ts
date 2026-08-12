/**
 * An Observation: one artifact entering the system as context.
 *
 * The spyglass is an observer. So is a file a user drags into a chat, and so is
 * a page fetched from a URL. If an answer is going to be composed over any of
 * them, the same question applies to all three — how did these bytes get here,
 * and are they still the bytes that arrived?
 *
 * So they share one record and one cryptographic strength, and differ only in
 * what they CLAIM. That difference is carried in words inside the record
 * (see claims.ts) rather than smoothed into a single badge, because the
 * likeliest way to get this wrong is not a broken hash — it is a correct hash
 * presented as more than it is.
 *
 * Content is chunked and chained rather than hashed once. A single digest over
 * a whole file is simpler, and it fails badly: one flipped byte invalidates
 * everything, and a stream that dies halfway attests nothing at all. Chunking
 * keeps the damage local and lets a partial arrival still be evidence for the
 * part that arrived.
 */
import { randomBytes } from 'node:crypto';
import { type Identity, identityId } from '@symbia/crypto';
import {
  GENESIS, advance, sha256Hex, signEvent, lineageLine, type LineageEvent,
} from './chain.js';
import { CLAIMS, type ObserverKind, type ObservationSource } from './claims.js';
import { ATTESTATION_MEANS, type AttestationLevel, type Attestation } from './attestation.js';

export interface ObservationInit {
  kind: ObserverKind;
  /** Prefix for the observer's id, e.g. `spyglass:instrument`. */
  idPrefix: string;
  identity: Identity;
  level: AttestationLevel;
  genesis?: { id: string; epoch?: string; fingerprint?: string } | null;
  source: ObservationSource;
  /** Where lineage lines are written. Injected so this stays storage-agnostic. */
  sink: (line: string) => void;
  /** Overridable for tests. */
  now?: () => Date;
}

export class Observation {
  readonly id: string;
  readonly observer: string;
  private chain = GENESIS;
  private seq = 0;
  private bytes = 0;
  private lastEventId: string;
  private readonly init: ObservationInit;
  private readonly now: () => Date;

  constructor(init: ObservationInit) {
    this.init = init;
    this.now = init.now ?? (() => new Date());
    this.id = randomBytes(8).toString('hex');
    this.observer = identityId(init.idPrefix, init.identity.fingerprint);

    const claim = CLAIMS[init.kind];
    const attestation: Attestation = {
      level: init.level,
      observer: this.observer,
      public_key: init.identity.publicKeyPem,
      algorithm: 'ed25519',
      signature_scheme: 'canonical-event-v2',
      genesis: init.genesis ?? null,
      means: ATTESTATION_MEANS[init.level],
    };

    const ev: LineageEvent = {
      event_id: `event:${this.id}:0`,
      timestamp: this.now().toISOString(),
      actor_identity: this.observer,
      event_type: 'observation.open',
      payload: {
        observation_id: this.id,
        observer_kind: init.kind,
        // What this observer asserts, and what it does not. Both, always.
        claim,
        source: init.source,
        attestation,
      },
      continuity_context: { observation: this.id },
      parent_links: [],
      checksum: `sha256:${GENESIS}`,
    };
    ev.signature = signEvent(ev, init.identity);
    init.sink(lineageLine(ev));
    this.lastEventId = ev.event_id;
  }

  /** Append a chunk of the observed content. Hashed and chained on arrival. */
  chunk(buf: Buffer): { seq: number; digest: string; chain: string } {
    const digest = sha256Hex(buf);
    this.chain = advance(this.chain, digest);
    this.seq += 1;
    this.bytes += buf.length;

    const ev: LineageEvent = {
      event_id: `event:${this.id}:${this.seq}`,
      timestamp: this.now().toISOString(),
      actor_identity: this.observer,
      event_type: 'observation.chunk',
      payload: {
        observation_id: this.id,
        seq: this.seq,
        bytes: buf.length,
        digest: `sha256:${digest}`,
        offset: this.bytes - buf.length,
      },
      continuity_context: { observation: this.id },
      parent_links: [this.lastEventId],
      checksum: `sha256:${this.chain}`,
    };
    ev.signature = signEvent(ev, this.init.identity);
    this.init.sink(lineageLine(ev));
    this.lastEventId = ev.event_id;
    return { seq: this.seq, digest, chain: this.chain };
  }

  /**
   * Seal the observation.
   *
   * `complete` is explicit and is not inferred from the absence of an error.
   * A truncated download and a finished one produce identical-looking ledgers
   * otherwise, and "it stopped" must never read as "it finished" — that is the
   * failure this whole apparatus exists to prevent.
   */
  close(opts: { complete: boolean; note?: string } = { complete: true }) {
    const ev: LineageEvent = {
      event_id: `event:${this.id}:close`,
      timestamp: this.now().toISOString(),
      actor_identity: this.observer,
      event_type: 'observation.close',
      payload: {
        observation_id: this.id,
        chunks: this.seq,
        bytes: this.bytes,
        content_head: `sha256:${this.chain}`,
        complete: opts.complete,
        note: opts.note ?? null,
      },
      continuity_context: { observation: this.id },
      parent_links: [this.lastEventId],
      checksum: `sha256:${this.chain}`,
    };
    ev.signature = signEvent(ev, this.init.identity);
    this.init.sink(lineageLine(ev));
    this.lastEventId = ev.event_id;
    return { id: this.id, chunks: this.seq, bytes: this.bytes, head: this.chain, complete: opts.complete };
  }
}
