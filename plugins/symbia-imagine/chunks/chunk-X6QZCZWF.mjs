import { createRequire as __symbiaCreateRequire } from "node:module";globalThis.require ??= __symbiaCreateRequire(import.meta.url);
import {
  canonicalJson,
  identityId,
  sha256Hex,
  signDocument,
  verifyDocument
} from "./chunk-2JVNKTJS.mjs";

// build/plugin/symbia-imagine/vendor/symbia-lineage/dist/chain.js
import { createHash } from "node:crypto";
var GENESIS = "0".repeat(64);
function advance(chainHex, digestHex) {
  return createHash("sha256").update(Buffer.from(chainHex, "hex")).update(Buffer.from(digestHex, "hex")).digest("hex");
}
function normalizeEvent(ev) {
  return {
    event_id: ev.event_id,
    timestamp: ev.timestamp,
    actor_identity: ev.actor_identity,
    event_type: ev.event_type,
    payload: ev.payload,
    continuity_context: ev.continuity_context ?? null,
    parent_links: ev.parent_links,
    checksum: ev.checksum,
    signature: ev.signature ?? null
  };
}
function eventDigest(ev) {
  const { checksum: _c, signature: _s, ...unsealed } = normalizeEvent(ev);
  return sha256Hex(canonicalJson(unsealed));
}
function signEvent(ev, identity) {
  if (!identity?.privateKey)
    return null;
  return signDocument(normalizeEvent(ev), identity);
}
function verifyEvent(ev, publicKey) {
  return verifyDocument(normalizeEvent(ev), publicKey);
}
function lineageLine(ev) {
  return JSON.stringify(normalizeEvent(ev)) + "\n";
}

// build/plugin/symbia-imagine/vendor/symbia-lineage/dist/artifact.js
import { createHash as createHash2 } from "node:crypto";
var ARTIFACT_CLAIMS = {
  registered: {
    asserts: "These exact bytes, named by this digest, were registered by this actor at this time, from the stated source.",
    does_not_assert: "Anything about what the bytes do, whether the stated source is authentic, or that the source would serve the same bytes again. A faithfully registered forgery is still a forgery."
  },
  derived_verified: {
    asserts: "The child bytes are the output of the stated deterministic recipe applied to the parent bytes. Anyone holding the parent and the recipe can recompute the child digest.",
    does_not_assert: "Anything about the parent's own provenance, or about the quality of the child. A perfect derivation of a corrupted parent is a perfect copy of the corruption."
  },
  derived_asserted: {
    asserts: "The producer states that the child was made from the parent by the stated process.",
    does_not_assert: "That the link can be recomputed or checked by anyone. Training-derived artifacts (distillation, fine-tuning) are always this, not `verified` \u2014 the process is not bit-reproducible."
  }
};
function derivedPayload(p) {
  if (p.parentLink === "verified" && p.deterministic === false) {
    throw new Error('parentLink "verified" with deterministic:false is a contradiction \u2014 a measured non-reproduction downgrades the link to "asserted"');
  }
  return {
    ...p,
    claim: p.parentLink === "verified" ? ARTIFACT_CLAIMS.derived_verified : ARTIFACT_CLAIMS.derived_asserted
  };
}
function registeredPayload(p) {
  return { ...p, claim: ARTIFACT_CLAIMS.registered };
}
function sealArtifactEvent(opts) {
  const ev = {
    event_id: opts.eventId ?? crypto.randomUUID(),
    timestamp: opts.timestamp ?? (/* @__PURE__ */ new Date()).toISOString(),
    actor_identity: opts.actor,
    event_type: opts.eventType,
    payload: opts.payload,
    parent_links: opts.parents,
    checksum: "",
    signature: null
  };
  const chain = advance(opts.chain, eventDigest(ev));
  ev.checksum = `sha256:${chain}`;
  ev.signature = signEvent(ev, opts.identity);
  return { event: ev, chain };
}
function artifactDigest(data) {
  return `sha256:${createHash2("sha256").update(data).digest("hex")}`;
}

// build/plugin/symbia-imagine/vendor/symbia-lineage/dist/claims.js
var CLAIMS = {
  capture: {
    asserts: "This instrument framed a region of a display and captured these bytes from it at this time.",
    does_not_assert: "Nothing about whether what was on screen was accurate, current, or itself genuine. A screen can show a forgery, and this would faithfully record the forgery."
  },
  upload: {
    asserts: "This instrument received these exact bytes from the named principal at this time, and they have not changed since.",
    does_not_assert: "Anything about the authenticity, authorship or origin of the file. This is a record of RECEIPT, not of provenance before receipt. A signed record of a forged document is a faithful record of a forged document."
  },
  retrieval: {
    asserts: "This endpoint returned these exact bytes to this instrument at this time, over the recorded transport.",
    does_not_assert: "That the content is true, that the endpoint is who its name suggests beyond what the TLS chain shows, or that the same request would return the same bytes again. A page can lie, and this records the lie exactly."
  }
};

// build/plugin/symbia-imagine/vendor/symbia-lineage/dist/attestation.js
var ATTESTATION_MEANS = {
  "unsigned": "Nothing attests this record. The chain shows it is internally consistent; anyone could have written it.",
  "self-attested": "Signed by a key generated on the observing machine. Proves every event came from one holder of that key and has not been altered since. Does NOT establish which machine, which person, or any external trust.",
  "attested": "Signed by a key chaining to an imported genesis. Trust is only as good as that genesis and how it was obtained.",
  "hardware-attested": "Signed by a key that cannot be exported from the machine that holds it."
};
function substantiate(input) {
  if (!input.signaturesVerify) {
    return { level: "unsigned", why: "Signatures did not verify; treat this record as unattested." };
  }
  if (input.claimed !== "attested")
    return { level: input.claimed, why: null };
  if (input.genesisVouches === true)
    return { level: "attested", why: null };
  if (input.genesisVouches === false) {
    return {
      level: "self-attested",
      why: "This record claims to be attested, but the genesis offered does not vouch for the key that signed it. Importing a genesis does not reach backwards."
    };
  }
  return {
    level: "self-attested",
    why: "This record claims to be attested. Nothing here can confirm that, because no genesis was offered to check it against. Test the claim rather than accept it."
  };
}

// build/plugin/symbia-imagine/vendor/symbia-lineage/dist/observation.js
import { randomBytes } from "node:crypto";
var Observation = class {
  id;
  observer;
  chain = GENESIS;
  seq = 0;
  bytes = 0;
  lastEventId;
  init;
  now;
  constructor(init) {
    this.init = init;
    this.now = init.now ?? (() => /* @__PURE__ */ new Date());
    this.id = randomBytes(8).toString("hex");
    this.observer = identityId(init.idPrefix, init.identity.fingerprint);
    const claim = CLAIMS[init.kind];
    const attestation = {
      level: init.level,
      observer: this.observer,
      public_key: init.identity.publicKeyPem,
      algorithm: "ed25519",
      signature_scheme: "canonical-event-v2",
      genesis: init.genesis ?? null,
      means: ATTESTATION_MEANS[init.level]
    };
    const ev = {
      event_id: `event:${this.id}:0`,
      timestamp: this.now().toISOString(),
      actor_identity: this.observer,
      event_type: "observation.open",
      payload: {
        observation_id: this.id,
        observer_kind: init.kind,
        // What this observer asserts, and what it does not. Both, always.
        claim,
        source: init.source,
        attestation
      },
      continuity_context: { observation: this.id },
      parent_links: [],
      checksum: `sha256:${GENESIS}`
    };
    ev.signature = signEvent(ev, init.identity);
    init.sink(lineageLine(ev));
    this.lastEventId = ev.event_id;
  }
  /** Append a chunk of the observed content. Hashed and chained on arrival. */
  chunk(buf) {
    const digest = sha256Hex(buf);
    this.chain = advance(this.chain, digest);
    this.seq += 1;
    this.bytes += buf.length;
    const ev = {
      event_id: `event:${this.id}:${this.seq}`,
      timestamp: this.now().toISOString(),
      actor_identity: this.observer,
      event_type: "observation.chunk",
      payload: {
        observation_id: this.id,
        seq: this.seq,
        bytes: buf.length,
        digest: `sha256:${digest}`,
        offset: this.bytes - buf.length
      },
      continuity_context: { observation: this.id },
      parent_links: [this.lastEventId],
      checksum: `sha256:${this.chain}`
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
  close(opts = { complete: true }) {
    const ev = {
      event_id: `event:${this.id}:close`,
      timestamp: this.now().toISOString(),
      actor_identity: this.observer,
      event_type: "observation.close",
      payload: {
        observation_id: this.id,
        chunks: this.seq,
        bytes: this.bytes,
        content_head: `sha256:${this.chain}`,
        complete: opts.complete,
        note: opts.note ?? null
      },
      continuity_context: { observation: this.id },
      parent_links: [this.lastEventId],
      checksum: `sha256:${this.chain}`
    };
    ev.signature = signEvent(ev, this.init.identity);
    this.init.sink(lineageLine(ev));
    this.lastEventId = ev.event_id;
    return { id: this.id, chunks: this.seq, bytes: this.bytes, head: this.chain, complete: opts.complete };
  }
};

// build/plugin/symbia-imagine/vendor/symbia-lineage/dist/observers/retrieval.js
import { request } from "node:https";
import { request as httpRequest } from "node:http";
function normalizeCertField(v) {
  if (Array.isArray(v))
    return v[0] ?? null;
  return v ?? null;
}
function describeCert(cert) {
  if (!cert || !cert.subject)
    return null;
  let chain = 0;
  let node = cert;
  const seen = /* @__PURE__ */ new Set();
  while (node && !seen.has(node.fingerprint256 ?? String(chain))) {
    seen.add(node.fingerprint256 ?? String(chain));
    chain += 1;
    node = node.issuerCertificate && node.issuerCertificate !== node ? node.issuerCertificate : void 0;
  }
  return {
    subject: normalizeCertField(cert.subject?.CN),
    issuer: normalizeCertField(cert.issuer?.CN),
    fingerprint256: cert.fingerprint256 ?? null,
    // Newer @types/node types these as `string | string[]`; older ones as
    // `string`. The runtime value is a string, and a record that sometimes
    // holds an array here would be a different field. Narrowed explicitly
    // so this library builds from a CLEAN install — the version skew was
    // invisible locally (stale node_modules) and only surfaced in a docker
    // build on 15 Aug.
    valid_from: normalizeCertField(cert.valid_from),
    valid_to: normalizeCertField(cert.valid_to),
    chain_length: chain || null
  };
}
function retrieve(opts) {
  const maxRedirects = opts.maxRedirects ?? 5;
  const maxBytes = opts.maxBytes ?? 32 * 1024 * 1024;
  const timeoutMs = opts.timeoutMs ?? 3e4;
  const chunkBytes = opts.chunkBytes ?? 64 * 1024;
  const redirects = [];
  return new Promise((resolve, reject) => {
    const go = (url) => {
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        reject(new Error("invalid url: " + url));
        return;
      }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        reject(new Error("unsupported protocol: " + parsed.protocol));
        return;
      }
      const send = parsed.protocol === "https:" ? request : httpRequest;
      const req = send(parsed, { headers: opts.headers, timeout: timeoutMs }, (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
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
        const socket = res.socket;
        const tls = typeof socket.getPeerCertificate === "function" ? describeCert(socket.getPeerCertificate(true)) : null;
        const source = {
          kind: "retrieval",
          url_requested: opts.url,
          url_final: parsed.toString(),
          redirects,
          status,
          media_type: res.headers["content-type"] ?? null,
          bytes: 0,
          tls,
          // The origin's claim about the time. Recorded as a claim.
          server_date: res.headers["date"] ?? null
        };
        const obs = new Observation({
          kind: "retrieval",
          idPrefix: opts.idPrefix ?? "symbia:retriever",
          identity: opts.identity,
          level: opts.level,
          genesis: opts.genesis ?? null,
          source,
          sink: opts.sink
        });
        let bytes = 0;
        let aborted = null;
        let pending = [];
        let pendingBytes = 0;
        const flush = () => {
          if (!pendingBytes)
            return;
          obs.chunk(Buffer.concat(pending, pendingBytes));
          pending = [];
          pendingBytes = 0;
        };
        res.on("data", (chunk) => {
          if (aborted)
            return;
          bytes += chunk.length;
          if (bytes > maxBytes) {
            aborted = `body exceeded maxBytes (${maxBytes})`;
            pending.push(chunk);
            pendingBytes += chunk.length;
            flush();
            opts.onData?.(chunk);
            res.destroy();
            return;
          }
          pending.push(chunk);
          pendingBytes += chunk.length;
          if (pendingBytes >= chunkBytes)
            flush();
          opts.onData?.(chunk);
        });
        res.on("end", () => {
          flush();
          const sealed = obs.close({ complete: !aborted, note: aborted ?? void 0 });
          resolve({
            observation_id: sealed.id,
            source: { ...source, bytes },
            chunks: sealed.chunks,
            bytes: sealed.bytes,
            head: sealed.head,
            complete: sealed.complete,
            note: aborted
          });
        });
        res.on("error", (err) => {
          flush();
          const sealed = obs.close({ complete: false, note: "transport error: " + err.message });
          resolve({
            observation_id: sealed.id,
            source: { ...source, bytes },
            chunks: sealed.chunks,
            bytes: sealed.bytes,
            head: sealed.head,
            complete: false,
            note: "transport error: " + err.message
          });
        });
        res.on("close", () => {
          if (!aborted || res.readableEnded)
            return;
          flush();
          const sealed = obs.close({ complete: false, note: aborted ?? void 0 });
          resolve({
            observation_id: sealed.id,
            source: { ...source, bytes },
            chunks: sealed.chunks,
            bytes: sealed.bytes,
            head: sealed.head,
            complete: false,
            note: aborted ?? void 0
          });
        });
      });
      req.on("timeout", () => {
        req.destroy(new Error(`timeout after ${timeoutMs}ms`));
      });
      req.on("error", reject);
      req.end();
    };
    go(opts.url);
  });
}

// build/plugin/symbia-imagine/vendor/symbia-lineage/dist/bundle.js
var digestOf = (v) => `sha256:${sha256Hex(canonicalJson(v))}`;
function verifyBundle(bundle) {
  const problems = [];
  const notes = [];
  const trace = Array.isArray(bundle.trace) ? bundle.trace : [];
  let chain = { ok: true, of: trace.length };
  let head = GENESIS;
  for (const [i, ev] of trace.entries()) {
    head = advance(head, eventDigest(ev));
    if (ev.checksum !== `sha256:${head}`) {
      chain = { ok: false, at: i, of: trace.length, reason: "checksum does not follow from the previous head" };
      problems.push(`The chain breaks at event ${i} of ${trace.length}. Everything from there on is unattributable.`);
      break;
    }
  }
  if (trace.length === 0) {
    chain = { ok: false, of: 0, reason: "no trace" };
    problems.push("This bundle carries no trace, so there is nothing to verify.");
  }
  const sealEv = [...trace].reverse().find((e) => e.event_type === "imagine.session.sealed");
  const sealed = sealEv?.payload ?? {};
  const artifacts = { checked: false, ok: true };
  if (typeof sealed.artifactsDigest === "string") {
    artifacts.checked = true;
    artifacts.ok = sealed.artifactsDigest === digestOf(bundle.artifacts ?? []);
    if (!artifacts.ok)
      problems.push("An artifact has changed since sealing: the sealed artifacts digest no longer matches.");
  } else {
    notes.push("This bundle predates artifact digesting, so its artifacts are unprotected. Nothing is claimed about them.");
  }
  const bodies = { checked: false, ok: true };
  if (typeof sealed.bodiesDigest === "string") {
    bodies.checked = true;
    bodies.ok = sealed.bodiesDigest === digestOf(bundle.bodies ?? {});
    if (!bodies.ok)
      problems.push("A request or response body has changed since sealing: the sealed bodies digest no longer matches.");
  } else {
    notes.push("This bundle carries no bodies digest, so it was sealed before bodies were retained. Its digests address material it does not hold.");
  }
  const log = bundle.hostLog;
  if (log?.digest) {
    const checkpoints = trace.filter((e) => e.event_type === "imagine.trace.checkpoint");
    const last = checkpoints[checkpoints.length - 1];
    if (!last?.payload?.prefixDigest) {
      notes.push("The log in this bundle carries no checkpoint, so nothing pins it to the time it was written.");
    } else if (last.payload.bytes === log.bytes && last.payload.prefixDigest === log.digest) {
      notes.push(`The log matches the checkpoint the chain took at ${log.bytes} bytes, so every byte of it was committed to while it was being written.`);
    } else if (last.payload.bytes !== log.bytes) {
      notes.push(`The log holds ${log.bytes} bytes; the last checkpoint covers ${last.payload.bytes}. The difference was written after that checkpoint and is unpinned.`);
    } else {
      problems.push("The log does not match the checkpoint the chain took at the same length: it has been altered since.");
    }
  }
  if (bundle.completeness && bundle.completeness.complete === false) {
    notes.push(`The trace is partial: ${bundle.completeness.held} of ${bundle.completeness.declared} events.`);
  }
  if (bundle.content && bundle.content.complete === false) {
    notes.push(`Bodies are partial: ${bundle.content.held} of ${bundle.content.addressable} addressed bodies are held.`);
  }
  return { ok: problems.length === 0, chain, artifacts, bodies, problems, notes };
}

export {
  GENESIS,
  advance,
  eventDigest,
  signEvent,
  verifyEvent,
  lineageLine,
  ARTIFACT_CLAIMS,
  derivedPayload,
  registeredPayload,
  sealArtifactEvent,
  artifactDigest,
  CLAIMS,
  ATTESTATION_MEANS,
  substantiate,
  Observation,
  retrieve,
  verifyBundle
};
