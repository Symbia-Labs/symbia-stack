/**
 * The imagine session ledger — receipts without enforcement.
 *
 * Ruling 15 Aug 2026 (Brian): imagine mode is lax about canon; the
 * downloaded artifacts get postprocessed in design mode. So this records
 * every mutation and refuses nothing.
 *
 * Why recording beats enforcing HERE, specifically: a rejection destroys
 * the information that a thing was attempted. A client that tried to
 * author a malformed component and got a 400 leaves no trace of the
 * attempt, so the design-mode audit cannot see what the session was
 * reaching for. Accepting-and-recording keeps the whole history — the
 * sketches, the mistakes, the abandoned shapes — which is what makes the
 * exported bundle worth auditing rather than merely worth loading.
 *
 * Each entry is a signed lineage event chained from GENESIS, so the trace
 * cannot be reordered or trimmed without breaking from that point on. The
 * signing key is the session's own ephemeral key: the seal attests
 * "this session did these things, unaltered", and asserts NOTHING about
 * who ran the session or whether any of it is sound. That distinction is
 * the whole reason imagine artifacts are safe to be lax with.
 */
import { createHash } from "node:crypto";
import { appendFileSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { generateIdentity, exportPrivatePem, identityId, canonicalJson } from "@symbia/crypto";
import { GENESIS, advance, eventDigest, signEvent, lineageLine } from "@symbia/lineage";

const sha = (v) =>
  "sha256:" + createHash("sha256").update(typeof v === "string" ? v : canonicalJson(v ?? null)).digest("hex");

export function createSessionLedger({ path, pubKeyPath }) {
  // Ephemeral by construction. A key that dies with the process is the
  // honest signer for a mode whose claim is that nothing here persists.
  const identity = generateIdentity();
  const actor = identityId("imagine:session", identity.fingerprint);
  let chain = GENESIS;
  let count = 0;

  if (pubKeyPath) writeFileSync(pubKeyPath, identity.publicKeyPem);
  if (path && existsSync(path)) writeFileSync(path, "");

  function append(eventType, payload) {
    const ev = {
      event_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actor_identity: actor,
      event_type: eventType,
      payload,
      parent_links: [null],
      checksum: "",
      signature: null,
    };
    chain = advance(chain, eventDigest(ev));
    ev.checksum = `sha256:${chain}`;
    ev.signature = signEvent(ev, identity);
    count += 1;
    if (path) appendFileSync(path, lineageLine(ev));
    return ev;
  }

  /**
   * Express middleware: records every mutating request and its outcome.
   *
   * Bodies are recorded as DIGESTS, not contents — the ledger says what
   * happened and lets the artifacts themselves carry the payload, which
   * keeps the trace small and means the same event verifies whether or
   * not the bundle ships the bodies.
   */
  function middleware(req, res, next) {
    if (req.method === "GET" || req.method === "HEAD") return next();
    const started = Date.now();
    const requestDigest = sha(req.body);
    let captured;
    const json = res.json.bind(res);
    res.json = (body) => {
      captured = body;
      return json(body);
    };
    res.on("finish", () => {
      append("imagine.mutation", {
        method: req.method,
        // originalUrl carries the /svc/<id> prefix the sub-app strips.
        path: req.originalUrl,
        status: res.statusCode,
        // A refusal is recorded exactly like a success: an audit needs to
        // see what the session tried and was told no.
        accepted: res.statusCode < 400,
        requestDigest,
        resultDigest: captured === undefined ? null : sha(captured),
        resourceKey: captured?.key ?? req.body?.key ?? null,
        ms: Date.now() - started,
      });
    });
    next();
  }

  return {
    middleware,
    append,
    actor,
    publicKeyPem: identity.publicKeyPem,
    get summary() {
      return { actor, entries: count, head: `sha256:${chain}`, ledger: path };
    },
    read() {
      if (!path || !existsSync(path)) return [];
      return readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    },
  };
}
