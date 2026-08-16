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

/**
 * How much of a trace is present, said the way the rest of the platform
 * says it — a count against a declared total, not a verdict.
 *
 * `symbia_call` reports `_truncated: {of, shown}`. `symbia_list_operations`
 * reports `unavailable: [...]`. Both hand back what they have and name what
 * is missing rather than refusing. A trace is the same shape of problem, so
 * it gets the same shape of answer: "23 of 87" beats both "trust me" and
 * "refused".
 */
export function completenessOf(events) {
  // TWO EVENTS CAN DECLARE A TOTAL, AND THEY MEAN DIFFERENT THINGS.
  //
  // `closed` means the session ended and this is all of it. `sealed` means
  // a bundle was cut at that point while the session kept running — which
  // is the normal way a bundle is made, since the seal endpoint is
  // reachable at any time. Without counting `sealed`, every bundle ever
  // produced would report "unterminated" and the signal would be noise on
  // every artifact instead of a warning on the ones that matter.
  const closing = [...events].reverse().find(
    (e) => e.event_type === "imagine.session.closed" || e.event_type === "imagine.session.sealed"
  );
  const declared = closing?.payload?.total ?? null;
  const sealedNotClosed = closing?.event_type === "imagine.session.sealed";
  const seqs = events.map((e) => e.payload?.seq).filter((n) => Number.isInteger(n));
  const gaps = [];
  for (let i = 1; i < seqs.length; i += 1) {
    if (seqs[i] !== seqs[i - 1] + 1) gaps.push({ after: seqs[i - 1], before: seqs[i] });
  }
  const held = events.length;

  if (declared === null) {
    return {
      completeness: {
        held,
        declared: null,
        complete: false,
        gaps,
        state: "unterminated",
        note:
          `${held} events, no declared total. The session did not write a closing ` +
          `event, so it was killed or is still running. Every event present is ` +
          `chained and signed; whether any followed them cannot be known from this file.`,
      },
    };
  }
  const whole = held === declared && gaps.length === 0;
  return {
    completeness: {
      held,
      declared,
      complete: whole,
      gaps,
      state: whole ? (sealedNotClosed ? "sealed" : "complete") : "partial",
      note: whole
        ? sealedNotClosed
          ? `${held} of ${declared} events — everything up to the seal. The session ` +
            `continued after this point; a bundle is a cut, not an ending.`
          : `${held} of ${declared} events — the whole session, closed.`
        : `${held} of ${declared} events${gaps.length ? `, ${gaps.length} gap(s)` : ""}. ` +
          `The trace declared ${declared}; this holds ${held}.`,
    },
  };
}

export function createSessionLedger({ path, pubKeyPath }) {
  // Ephemeral by construction. A key that dies with the process is the
  // honest signer for a mode whose claim is that nothing here persists.
  const identity = generateIdentity();
  const actor = identityId("imagine:session", identity.fingerprint);
  let chain = GENESIS;
  let count = 0;

  // ONE FILE PER SESSION, NAMED BY THE SESSION'S OWN KEY.
  //
  // These paths were fixed names in a shared directory, and every sidecar
  // truncated the file on start and then appended to it. Measured 16 Aug:
  // one ledger.jsonl held 185 events under THREE session identities, first
  // appearing at lines 0, 1 and 15, because the connector keeps a sidecar
  // running while a script starts another. The public key file held
  // whichever key wrote last, so a sealed bundle carried one key and a
  // trace signed by three, and verification failed at event 0.
  //
  // The claim on the bundle is "these came from one imagine session".
  // Sharing a file with another session makes that false, and running more
  // than one sidecar is the normal case rather than the edge case. Suffix
  // both paths with the key fingerprint: sessions cannot collide, and a
  // stale file from a dead session is inert rather than contaminating.
  const suffix = identity.fingerprint.slice(0, 16);
  const scoped = (p) => (p ? p.replace(/(\.[^.]+)$/, `.${suffix}$1`) : p);
  path = scoped(path);
  pubKeyPath = scoped(pubKeyPath);

  if (pubKeyPath) writeFileSync(pubKeyPath, identity.publicKeyPem);
  // Truncate is now safe: this name belongs to this process alone.
  if (path && existsSync(path)) writeFileSync(path, "");

  /**
   * EVERY EVENT CARRIES ITS OWN POSITION.
   *
   * A hash chain proves each event follows the one before it. It cannot
   * prove that the last event you hold is the last event that happened —
   * a truncated chain is a valid chain. So a session that ended, a session
   * killed mid-write, and a trace someone cut the tail off are byte-
   * identical to a verifier.
   *
   * `seq` is inside the signed payload, so a gap in the middle is
   * detectable and a position cannot be forged. It does not by itself
   * catch truncation at the tail — that needs the declared total in the
   * closing event. Together they let a reader say "23 of 87" instead of
   * either trusting or refusing.
   */
  function append(eventType, payload) {
    const seq = count + 1;
    const ev = {
      event_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actor_identity: actor,
      event_type: eventType,
      payload: { ...payload, seq },
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
   * The last event a session writes: how many there were.
   *
   * Its own seq is included in the total it declares, so `total` equals the
   * seq of this event. A reader holding fewer events than the declared
   * total knows exactly how many are missing. A reader holding no closing
   * event at all knows only that the session did not end on its own terms,
   * which is a different and weaker statement — and one worth making rather
   * than hiding.
   */
  let closed = false;
  function close(reason) {
    if (closed) return null;
    closed = true;
    return append("imagine.session.closed", { reason, total: count + 1 });
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
    /**
     * Walk our own chain the way an importer will.
     *
     * The seal should never emit a bundle that fails its own claim. Before
     * the per-session file fix, sealing happily produced bundles that were
     * refused at event 0 by the first thing that checked them — the failure
     * surfaced minutes later, in a different tool, as a verification error
     * rather than as "this session's ledger is contaminated".
     */
    verify() {
      let head = GENESIS;
      const events = this.read();
      for (const [i, ev] of events.entries()) {
        const expected = advance(head, eventDigest(ev));
        if (ev.checksum !== `sha256:${expected}`) {
          return { ok: false, at: i, of: events.length, event: ev.event_id, actor: ev.actor_identity,
                   reason: "checksum does not follow from the previous head" };
        }
        head = expected;
      }
      return { ok: true, of: events.length, head: `sha256:${head}`, ...completenessOf(events) };
    },
    close,
  };
}
