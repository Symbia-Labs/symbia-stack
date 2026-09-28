import { createRequire as __symbiaCreateRequire } from "node:module";globalThis.require ??= __symbiaCreateRequire(import.meta.url);
import {
  addressFile
} from "../chunks/chunk-BYXEE73M.mjs";
import {
  GENESIS,
  advance,
  eventDigest,
  lineageLine,
  signEvent
} from "../chunks/chunk-X6QZCZWF.mjs";
import {
  canonicalJson,
  generateIdentity,
  identityId
} from "../chunks/chunk-2JVNKTJS.mjs";
import {
  require_express
} from "../chunks/chunk-WXJ3LX3E.mjs";
import "../chunks/chunk-SG5E4KLZ.mjs";
import "../chunks/chunk-QB3Z7RRP.mjs";
import "../chunks/chunk-MXWCS3YP.mjs";
import "../chunks/chunk-572SKMOA.mjs";
import {
  __toESM
} from "../chunks/chunk-JCYRGLK6.mjs";

// build/plugin/symbia-imagine/sidecar/sidecar.mjs
var import_express = __toESM(require_express(), 1);
import { createServer } from "node:http";
import { readFileSync as readFileSync2, readdirSync, existsSync as existsSync2, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdirSync, writeFileSync as writeFileSync2, openSync, writeSync, renameSync, mkdtempSync, rmSync, appendFileSync as appendFileSync2 } from "node:fs";
import { tmpdir } from "node:os";
import { createHash as createHash2 } from "node:crypto";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";

// build/plugin/symbia-imagine/sidecar/session-ledger.mjs
import { createHash } from "node:crypto";
import { appendFileSync, writeFileSync, readFileSync, existsSync } from "node:fs";
var sha = (v) => "sha256:" + createHash("sha256").update(typeof v === "string" ? v : canonicalJson(v ?? null)).digest("hex");
function contentOf(events, blobs) {
  const addressable = /* @__PURE__ */ new Set();
  for (const e of events) {
    if (e.event_type !== "imagine.mutation") continue;
    for (const d of [e.payload?.requestDigest, e.payload?.resultDigest]) {
      if (typeof d === "string") addressable.add(d);
    }
  }
  const have = blobs && typeof blobs === "object" ? blobs : {};
  const missing = [...addressable].filter((d) => !(d in have));
  const held = addressable.size - missing.length;
  const complete = addressable.size > 0 && missing.length === 0;
  return {
    content: {
      held,
      addressable: addressable.size,
      complete,
      missing: missing.slice(0, 20),
      note: addressable.size === 0 ? "No mutation in this trace addresses a body." : complete ? `${held} of ${addressable.size} addressed bodies are present, so every digest in the trace resolves.` : `${held} of ${addressable.size} addressed bodies are present. The trace verifies without them; what it cannot do is tell you what was sent.`
    }
  };
}
function completenessOf(events) {
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
        note: `${held} events, no declared total. The session did not write a closing event, so it was killed or is still running. Every event present is chained and signed; whether any followed them cannot be known from this file.`
      }
    };
  }
  const whole = held === declared && gaps.length === 0;
  return {
    completeness: {
      held,
      declared,
      complete: whole,
      gaps,
      state: whole ? sealedNotClosed ? "sealed" : "complete" : "partial",
      note: whole ? sealedNotClosed ? `${held} of ${declared} events, up to the seal. The session continued after this point; later events are not in this bundle.` : `${held} of ${declared} events \u2014 the whole session, closed.` : `${held} of ${declared} events${gaps.length ? `, ${gaps.length} gap(s)` : ""}. The trace declared ${declared}; this holds ${held}.`
    }
  };
}
function digestOf({ events = [], authored = [], continues = null } = {}) {
  const mutations = events.filter((e) => e.event_type === "imagine.mutation");
  const refused = mutations.filter((e) => e.payload?.accepted === false).map((e) => ({
    seq: e.payload?.seq ?? null,
    method: e.payload?.method ?? null,
    path: e.payload?.path ?? null,
    status: e.payload?.status ?? null,
    resourceKey: e.payload?.resourceKey ?? null
  }));
  const notes = events.filter((e) => e.event_type === "imagine.observer.note").map((e) => ({
    seq: e.payload?.seq ?? null,
    observer: e.payload?.observer ?? null,
    note: e.payload?.note ?? null
  }));
  const tagged = (r, t) => Array.isArray(r?.tags) && r.tags.includes(t);
  const map = authored.filter((r) => tagged(r, "map")).map((r) => ({ key: r.key ?? null, name: r.name ?? null, createdAt: r.createdAt ?? null }));
  const artifacts = authored.map((r) => ({
    key: r.key ?? null,
    type: r.type ?? null,
    attribution: r.attribution ?? null
  }));
  return {
    lane: "apocryphal",
    continues,
    continuesNote: continues ? "The chain this session was opened after, by head. Verify each chain under its own key." : "No predecessor chain was found in the session directory when this session opened. Either this is a first run, or the predecessor's ledger was removed.",
    covers: "Events up to and not including this digest. The digest and the seal that follows it are in the bundle's trace and not in these counts.",
    counts: {
      events: events.length,
      mutations: mutations.length,
      refused: refused.length,
      notes: notes.length,
      artifacts: artifacts.length,
      mapResources: map.length
    },
    // Capped, and the cap is declared, because a digest that grows with the
    // session is the thing this replaces.
    refused: refused.slice(0, 50),
    refusedNote: refused.length === 0 ? "No mutation in this session was refused. This says nothing about whether the accepted ones were correct." : `${refused.length} refusal(s)${refused.length > 50 ? ", first 50 listed" : ""}. A refusal is what the session tried and was told no; the trace holds the request body behind each digest.`,
    notes: notes.slice(0, 50),
    notesNote: notes.length === 0 ? "This session recorded no observer note. Nothing in the chain states what it considered unresolved, so a successor inherits its findings without its doubts." : `${notes.length} note(s)${notes.length > 50 ? ", first 50 listed" : ""}, each signed at the position shown. The value is the position; the sentence is apocryphal.`,
    mapResources: map,
    mapNote: map.length === 0 ? "No MAP-tagged resource was authored. No prediction was registered in this chain, so nothing here was measured against one." : `${map.length} MAP-tagged resource(s). Whether each is a prediction or a result, and whether a result honoured its prediction, are readings this digest does not make.`,
    artifacts,
    does_not_assert: "that these are the session's important findings, that the notes are true, or that the artifacts are sound. It is a projection of the chain: what was refused, what was attested, what was authored, and in what order. A successor reading it inherits the predecessor's claims, not their correctness."
  };
}
function createSessionLedger({ path, pubKeyPath, continues }) {
  const identity = generateIdentity();
  const actor = identityId("imagine:session", identity.fingerprint);
  let chain = GENESIS;
  let count = 0;
  const suffix = identity.fingerprint.slice(0, 16);
  const scoped = (p) => p ? p.replace(/(\.[^.]+)$/, `.${suffix}$1`) : p;
  path = scoped(path);
  pubKeyPath = scoped(pubKeyPath);
  if (pubKeyPath) writeFileSync(pubKeyPath, identity.publicKeyPem);
  if (path && existsSync(path)) writeFileSync(path, "");
  const blobPath = path ? path.replace(/(^|\/)ledger\./, "$1blobs.") : null;
  const blobsSeen = /* @__PURE__ */ new Set();
  if (blobPath && existsSync(blobPath)) writeFileSync(blobPath, "");
  function recordBlob(digest, value) {
    if (!blobPath || !digest || blobsSeen.has(digest)) return;
    blobsSeen.add(digest);
    appendFileSync(blobPath, `${JSON.stringify({ d: digest, b: value ?? null })}
`);
  }
  function append(eventType, payload) {
    const seq = count + 1;
    const ev = {
      event_id: crypto.randomUUID(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      actor_identity: actor,
      event_type: eventType,
      payload: { ...payload, seq },
      parent_links: [null],
      checksum: "",
      signature: null
    };
    chain = advance(chain, eventDigest(ev));
    ev.checksum = `sha256:${chain}`;
    ev.signature = signEvent(ev, identity);
    count += 1;
    if (path) appendFileSync(path, lineageLine(ev));
    return ev;
  }
  function open(continues2) {
    return append("imagine.session.opened", {
      t0: (/* @__PURE__ */ new Date()).toISOString(),
      fingerprint: identity.fingerprint,
      lane: "apocryphal",
      // THE CHAIN THAT CAME BEFORE THIS ONE, NAMED BY ITS HEAD.
      //
      // A per-spawn key is the right construction for an ephemeral stack and
      // it has a cost nobody paid until 17 Aug: reloading the connector
      // mid-conversation kills the host, a successor opens with a new key and
      // a new ledger, and the two chains have no relation. A cold agent
      // running the t0 walkthrough registered its predictions, reloaded to
      // pick up a fix, and sealed a bundle that could not show the
      // predictions preceded the measurements — because they were in the
      // previous chain. Both halves were signed. Neither could reach the
      // other.
      //
      // Citing the predecessor's head does not merge the chains, and must not
      // pretend to: each remains verifiable only under its own key. It makes
      // the SEQUENCE checkable — this chain says which chain it follows and
      // at what digest, so a reader holding both can order them without
      // trusting anyone's account of which conversation they came from.
      ...continues2 ? { continues: continues2 } : {},
      does_not_assert: "anything about the contents of the session. This is a clock reading taken at spawn \u2014 one of the two anchors placement is derived between, not a measurement of anything that happened inside them."
    });
  }
  let closed = false;
  function close(reason) {
    if (closed) return null;
    closed = true;
    return append("imagine.session.closed", { reason, total: count + 1 });
  }
  function middleware(req, res, next) {
    if (req.method === "GET" || req.method === "HEAD") return next();
    const started = process.hrtime.bigint();
    const requestDigest = sha(req.body);
    let captured;
    const json = res.json.bind(res);
    res.json = (body) => {
      captured = body;
      return json(body);
    };
    res.on("finish", () => {
      const resultDigest = captured === void 0 ? null : sha(captured);
      recordBlob(requestDigest, req.body);
      recordBlob(resultDigest, captured);
      append("imagine.mutation", {
        method: req.method,
        // originalUrl carries the /svc/<id> prefix the sub-app strips.
        path: req.originalUrl,
        status: res.statusCode,
        // A refusal is recorded exactly like a success: an audit needs to
        // see what the session tried and was told no.
        accepted: res.statusCode < 400,
        requestDigest,
        resultDigest,
        resourceKey: captured?.key ?? req.body?.key ?? null,
        ms: Math.round(Number(process.hrtime.bigint() - started) / 1e6 * 1e3) / 1e3
      });
    });
    next();
  }
  open(continues);
  return {
    middleware,
    append,
    actor,
    publicKeyPem: identity.publicKeyPem,
    /**
     * The session's signing identity, for observers that chain their own work.
     *
     * Exposed so a retrieval observed by this session is signed by THIS
     * session's key rather than a second key invented for the purpose. Two
     * keys would mean two chains with nothing relating them, which is the
     * defect `continues` exists to avoid between successive sessions.
     */
    identity,
    /**
     * Address a body by its digest so the chain can commit to content it does
     * not inline. Used by the retrieval route: the event carries the digest,
     * the blob store carries the bytes, and a seal carries both.
     */
    recordBlob,
    get summary() {
      return {
        actor,
        entries: count,
        head: `sha256:${chain}`,
        ledger: path,
        // WHAT SURVIVES THIS PROCESS, SAID OUT LOUD.
        //
        // MEASURED 20 Aug 2026: an agent registered MAP predictions here,
        // did a day's work, and came back in a later turn to find the chain
        // reset — its predictions reachable only inside a sealed bundle on
        // disk. Nothing in any response had said the workspace was ephemeral.
        // The signing key has been per-spawn by deliberate construction since
        // the beginning and every response carried the consequence silently,
        // so the property could only be discovered by losing something.
        //
        // `continues` already existed and already answered half of this — it
        // names the predecessor chain by its head — but it was written into
        // the opened event and never surfaced anywhere a caller reads.
        lifetime: "ephemeral",
        lifetimeNote: "This chain and its signing key live and die with this process. Work recorded here does not survive a restart except inside a bundle written by /session/seal. Seal before you need it; a chain position is not storage.",
        ...continues ? { continues } : {}
      };
    },
    read() {
      if (!path || !existsSync(path)) return [];
      return readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    },
    /** digest -> body, for the digests this session's chain committed to. */
    blobs() {
      if (!blobPath || !existsSync(blobPath)) return {};
      const out = {};
      for (const line of readFileSync(blobPath, "utf8").split("\n")) {
        if (!line) continue;
        try {
          const { d, b } = JSON.parse(line);
          out[d] = b;
        } catch {
        }
      }
      return out;
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
          return {
            ok: false,
            at: i,
            of: events.length,
            event: ev.event_id,
            actor: ev.actor_identity,
            reason: "checksum does not follow from the previous head"
          };
        }
        head = expected;
      }
      return { ok: true, of: events.length, head: `sha256:${head}`, ...completenessOf(events) };
    },
    close
  };
}

// build/plugin/symbia-imagine/sidecar/sidecar.mjs
var HOST_TOKEN = process.env.IMAGINE_HOST_TOKEN || randomBytes(32).toString("base64url");
var BUILD_MARKER = process.env.IMAGINE_BUILD || "dev";
function admitInternalCalls(base) {
  const original = globalThis.fetch;
  globalThis.fetch = (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    if (!url.startsWith(base)) return original(input, init);
    const headers = new Headers(init.headers ?? (typeof input === "object" ? input.headers : void 0));
    headers.set("x-imagine-token", HOST_TOKEN);
    return original(input, { ...init, headers });
  };
}
var here = dirname(fileURLToPath(import.meta.url));
var repo = join(here, "..", "..");
var RING = [];
var RING_MAX = Number(process.env.IMAGINE_LOG_RING || 2e3);
var inFlight = null;
var hostLogFd = null;
var logHash = createHash2("sha256");
var logBytes = 0;
var logStart = 0;
function writeLog(text) {
  if (hostLogFd === null) return;
  try {
    writeSync(hostLogFd, text);
    logHash.update(text);
    logBytes += Buffer.byteLength(text);
  } catch {
  }
}
function ring(args) {
  const line = args.map((a) => typeof a === "string" ? a : (() => {
    try {
      return JSON.stringify(a);
    } catch {
      return String(a);
    }
  })()).join(" ");
  RING.push({ at: Date.now(), line, during: inFlight });
  if (RING.length > RING_MAX) RING.shift();
  writeLog(`${(/* @__PURE__ */ new Date()).toISOString()} ${line}
`);
}
var realError = console.error.bind(console);
var log = (...a) => {
  ring(["[sidecar]", ...a]);
  realError("[sidecar]", ...a);
};
var tee = (...a) => {
  ring(a);
  realError(...a);
};
console.log = tee;
console.info = tee;
console.debug = tee;
console.error = tee;
console.warn = tee;
delete process.env.DATABASE_URL;
process.env.SYMBIA_MODE = "imagine";
process.env.NODE_ENV = process.env.NODE_ENV || "development";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || `imagine-${Math.random().toString(36).slice(2)}`;
process.env.NETWORK_HASH_SECRET = process.env.NETWORK_HASH_SECRET || `imagine-${randomBytes(16).toString("hex")}`;
process.env.MODELS_PATH = process.env.MODELS_PATH || join(here, ".models");
mkdirSync(process.env.MODELS_PATH, { recursive: true });
process.env.CATALOG_DATA_DIR = process.env.CATALOG_DATA_DIR || join(servicesDir(), "data");
process.env.RUNTIME_MANIFEST_ENFORCEMENT = process.env.RUNTIME_MANIFEST_ENFORCEMENT || "off";
process.env.RUNTIME_RECONCILE_INTERVAL_MS = process.env.RUNTIME_RECONCILE_INTERVAL_MS || "3000";
process.env.SYMBIA_ENFORCEMENT = "off";
var sessionDir = join(here, ".session");
mkdirSync(sessionDir, { recursive: true });
var runtimeDir = mkdtempSync(join(tmpdir(), "imagine-run-"));
var lineagePath = join(sessionDir, "lineage.jsonl");
try {
  const p = join(runtimeDir, `host.${process.pid}.log`);
  const CAP = Number(process.env.IMAGINE_LOG_CAP_BYTES || 32 * 1024 * 1024);
  if (existsSync2(p) && statSync(p).size > CAP) {
    try {
      renameSync(p, `${p}.1`);
    } catch {
    }
  }
  logStart = existsSync2(p) ? statSync(p).size : 0;
  hostLogFd = openSync(p, "a");
  for (const e of RING) writeLog(`${new Date(e.at).toISOString()} ${e.line}
`);
} catch {
}
function findPredecessor(dir) {
  try {
    if (existsSync2(lineagePath)) {
      const lines = readFileSync2(lineagePath, "utf8").split("\n").filter(Boolean);
      if (lines.length) {
        const last = JSON.parse(lines[lines.length - 1]);
        return {
          ...last,
          citedAt: (/* @__PURE__ */ new Date()).toISOString(),
          does_not_assert: "that the predecessor's chain is complete or that this session is its only successor. It names the head this chain was opened after; verify each chain under its own key, from its own bundle."
        };
      }
    }
  } catch {
  }
  try {
    const files = readdirSync(dir).filter((f) => f.startsWith("ledger.") && f.endsWith(".jsonl")).map((f) => ({ f, at: statSync(join(dir, f)).mtimeMs })).sort((a, b) => b.at - a.at);
    for (const { f } of files) {
      const lines = readFileSync2(join(dir, f), "utf8").split("\n").filter(Boolean);
      if (lines.length === 0) continue;
      const last = JSON.parse(lines[lines.length - 1]);
      return {
        session: last.actor_identity,
        head: last.checksum,
        endedWith: last.event_type,
        // A predecessor that closed declares its own total; one that was
        // killed declares nothing, and the difference is worth carrying.
        declaredTotal: last.payload?.total ?? null,
        heldAtCitation: lines.length,
        ledger: f,
        citedAt: (/* @__PURE__ */ new Date()).toISOString(),
        does_not_assert: "that the predecessor's chain is complete or that this session is its only successor. It names the head this chain was opened after; verify each chain under its own key."
      };
    }
  } catch {
  }
  return null;
}
var predecessor = findPredecessor(sessionDir);
if (predecessor) log(`continues ${predecessor.session} at ${String(predecessor.head).slice(0, 22)}\u2026 (${predecessor.endedWith})`);
var ledger = createSessionLedger({
  continues: predecessor,
  // Ephemeral filesystem, per spawn, removed on clean takedown.
  path: join(runtimeDir, "ledger.jsonl"),
  pubKeyPath: join(runtimeDir, "session.pub.pem")
});
var lastCheckpointBytes = -1;
function traceCheckpoint(reason) {
  if (hostLogFd === null || logBytes === lastCheckpointBytes) return null;
  lastCheckpointBytes = logBytes;
  return ledger.append("imagine.trace.checkpoint", {
    reason,
    from: logStart,
    to: logStart + logBytes,
    bytes: logBytes,
    prefixDigest: `sha256:${logHash.copy().digest("hex")}`
  });
}
setInterval(() => traceCheckpoint("interval"), Number(process.env.IMAGINE_CHECKPOINT_MS || 5e3)).unref();
for (const s of [process.stdout, process.stderr]) s.on("error", () => {
});
var inCrashHandler = false;
var crashRepeats = /* @__PURE__ */ new Map();
function recordCrash(kind, message) {
  if (inCrashHandler) return;
  inCrashHandler = true;
  try {
    const now = Date.now();
    let r = crashRepeats.get(message);
    if (!r || now - r.windowStart > 1e4) {
      r = { count: 0, windowStart: now };
      crashRepeats.set(message, r);
    }
    r.count++;
    if (r.count === 1) {
      log(`${kind.toUpperCase()}: ${message}`);
      ledger.append(`imagine.process.${kind}`, { message });
    } else if (r.count === 10 || r.count % 1e3 === 0) {
      ledger.append(`imagine.process.${kind}.repeated`, { message, count: r.count, windowMs: now - r.windowStart });
    }
    if (r.count >= 100) {
      ledger.append(`imagine.process.${kind}.storm`, { message, count: r.count, windowMs: now - r.windowStart });
      try {
        void takedown(`crash storm: "${message}" x${r.count} in ${now - r.windowStart}ms`, 1);
      } catch {
        process.exit(1);
      }
    }
  } finally {
    inCrashHandler = false;
  }
}
process.on("uncaughtException", (err) => recordCrash("uncaught", String(err?.message ?? err)));
process.on("unhandledRejection", (reason) => recordCrash("unhandled", reason instanceof Error ? reason.message : String(reason)));
var app = (0, import_express.default)();
var httpServer = createServer(app);
var mounted = [];
var ready = false;
app.use(import_express.default.json({ limit: process.env.IMAGINE_BODY_LIMIT || "2mb" }));
app.use((err, _req, res, next) => {
  if (err?.type === "entity.too.large") {
    return res.status(413).json({
      error: "request body too large for imagine mode",
      limit: process.env.IMAGINE_BODY_LIMIT || "2mb",
      hint: "imagine holds ten services in one process; a body big enough to strain it is refused rather than risked"
    });
  }
  return next(err);
});
var FAILURES = [];
app.use((req, res, next) => {
  const startedAt = Date.now();
  const prev = inFlight;
  inFlight = `${req.method} ${req.path}`;
  res.on("finish", () => {
    inFlight = prev;
    if (res.statusCode < 400) return;
    FAILURES.push({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      startedAt,
      endedAt: Date.now()
    });
    if (FAILURES.length > 200) FAILURES.shift();
  });
  next();
});
app.use((req, res, next) => {
  if (req.path === "/" || req.path === "/health") return next();
  const offered = req.get("x-imagine-token") || (req.get("authorization") || "").replace(/^Bearer\s+/i, "") || // A BROWSER CANNOT SET A HEADER ON A NAVIGATION.
  //
  // The observer routes exist to be opened by a person, in a browser, from
  // a link. Requiring a header there would mean no human could look, which
  // defeats the point of building them. The token still gates: it is in the
  // 0600 address file, so possession is the same proof it always was — the
  // query string just carries it where a header cannot go.
  (req.path.startsWith("/session/observe") || req.path.startsWith("/session/stream") ? String(req.query.token ?? "") : "");
  if (offered && offered === HOST_TOKEN) return next();
  return res.status(401).json({
    error: offered ? "session token does not match this host" : "no session token offered",
    detail: "This host authorises by possession of its session token, which is written only to its address file with mode 0600 and dies with the process. Read the token from that file and send it as x-imagine-token. There is no password and nothing to rotate.",
    // THE FILE THIS HOST WROTE, NOT THE DEFAULT ONE.
    //
    // `ADDRESS_FILE_PATH` is the fixed default; an owned host publishes to
    // IMAGINE_ADDRESS_FILE, a per-spawn path under /tmp. Measured 23 Aug: a
    // 401 from the running connector's host named `.session/host.json`, which
    // does not exist, while the token sat in `/tmp/imagine-V4DjdD/host.json`.
    // A refusal whose remedy points at a missing file reads as a broken host.
    addressFile: addressFile(),
    // In stdio mode no address file is written at all, because the token is
    // published only on the host-mode path. Say so rather than naming a file
    // that will never appear.
    ...existsSync2(addressFile()) ? {} : {
      note: "This host has not published an address file. A sidecar serving MCP on stdio mints a token and never writes it anywhere, so its HTTP routes are unreachable by any other process. Set IMAGINE_HOST_TOKEN at spawn if a harness needs to reach them."
    },
    hint: offered ? "A mismatch usually means the host restarted and minted a new token \u2014 re-read the file." : void 0
  });
});
app.use((_req, res, next) => {
  try {
    const s = ledger.summary;
    res.setHeader("x-symbia-ledger-head", s.head);
    res.setHeader("x-symbia-ledger-entries", String(s.entries));
    res.setHeader("x-symbia-session", s.actor ?? "");
    res.setHeader("x-symbia-mode", "imagine");
  } catch {
  }
  next();
});
app.use(ledger.middleware);
app.get("/", (_req, res) => {
  const failed = mounted.filter((m) => m.ok === false);
  return res.json({
    mode: "imagine",
    // Published on the one open route on purpose: a shim has to be able to
    // compare builds BEFORE it holds a token or issues a call, and a check
    // that requires authorisation cannot run at the moment it is needed.
    build: BUILD_MARKER,
    // READY IS NOT "BOOT FINISHED". IT IS "BOOT FINISHED AND NOTHING FAILED".
    //
    // Measured 16 Aug, booting the packaged copy with its dependencies absent:
    // two services mounted, eight did not, and this answered `ready: true`
    // with the cheerful line "every service that will mount has mounted". True
    // in the most useless sense — the eight that failed were never going to
    // mount, so the sentence held while the stack was unusable.
    //
    // The reload loop and the shim both wait on this flag, so a green light
    // over a broken stack is the confident negative this project keeps finding,
    // arriving in the one field everything downstream trusts.
    ready: ready && failed.length === 0,
    booted: ready,
    readiness: !ready ? "still booting \u2014 the socket is open because services address each other over it; this list is incomplete" : failed.length === 0 ? "boot complete \u2014 every service mounted" : `boot complete, ${failed.length} of ${mounted.length} services FAILED to mount: ${failed.map((f) => f.id).join(", ")}. The stack is answering and incomplete; read services[] for each failure's reason before relying on anything.`,
    transport: "stdio-mcp",
    enforcement: "off \u2014 canon is checked when this is grounded, not here",
    warning: "in-memory, ephemeral keys, restart-lossy \u2014 a sketch, not a record",
    services: mounted,
    session: ledger.summary
  });
});
app.get("/session/diagnostics", (req, res) => {
  const limit = Number(req.query.limit ?? 20);
  const failures = FAILURES.slice(-limit).map((f) => {
    const window = RING.filter((r) => r.at >= f.startedAt && r.at <= f.endedAt + 250);
    const tag = `${f.method} ${f.path}`;
    const tagged = window.filter((r) => r.during === tag);
    return {
      ...f,
      attribution: tagged.length ? "tagged: lines written while this request was in flight" : "window only: no line was tagged with this request",
      lines: (tagged.length ? tagged : window).map((r) => r.line)
    };
  });
  res.json({
    mode: "imagine",
    correlation: "time window, approximate",
    caveats: [
      "concurrent requests overlap and will both claim the same lines",
      "a service that logs after responding writes outside its own window; the 250ms tail is a guess, not a guarantee"
    ],
    failures,
    ringHeld: RING.length,
    ringMax: RING_MAX
  });
});
app.get(
  "/session",
  (_req, res) => res.json({ mode: "imagine", ...ledger.summary, entries: ledger.read() })
);
async function sealSession(trigger = "api", { skipIfEmpty = false } = {}) {
  try {
    const catalogUrl = process.env.CATALOG_SERVICE_URL;
    let rows = [];
    let readFailure = null;
    if (!catalogUrl) {
      readFailure = "CATALOG_SERVICE_URL is unset \u2014 the artifact list was never fetched";
    } else {
      try {
        const r = await fetch(`${catalogUrl}/api/resources`, {
          headers: { "X-Service-Auth": "internal" }
        });
        if (!r.ok) {
          readFailure = `catalog answered ${r.status} \u2014 the artifact list could not be read`;
        } else {
          const body = await r.json();
          if (Array.isArray(body)) rows = body;
          else readFailure = `catalog returned ${typeof body}, not an array \u2014 the artifact list could not be read`;
        }
      } catch (e) {
        readFailure = `catalog unreachable: ${e?.name ?? "Error"} \u2014 the artifact list could not be read`;
      }
    }
    const bootAt = globalThis.__imagineBootCompletedAt;
    const attribute = (r) => {
      if (r.isBootstrap) return null;
      if (!r.createdBy) return null;
      if (!String(r.createdBy).startsWith("service:")) return "client";
      if (bootAt && r.createdAt && new Date(r.createdAt) > new Date(bootAt)) return "caused";
      return null;
    };
    const authored = Array.isArray(rows) ? rows.map((r) => ({ r, how: attribute(r) })).filter((x) => x.how !== null).map(({ r, how }) => ({ ...r, attribution: how })) : [];
    if (skipIfEmpty && !readFailure && authored.length === 0) {
      return { ok: true, status: 200, skipped: true, result: {
        mode: "imagine",
        trigger,
        skipped: true,
        authoredCount: 0,
        reason: "nothing authored in this session, so no bundle was written"
      } };
    }
    const artifactsDigest = `sha256:${createHash2("sha256").update(canonicalJson(authored)).digest("hex")}`;
    const bodies = ledger.blobs();
    const bodiesDigest = `sha256:${createHash2("sha256").update(canonicalJson(bodies)).digest("hex")}`;
    traceCheckpoint("seal");
    let hostLog = null;
    try {
      const p = join(runtimeDir, `host.${process.pid}.log`);
      const buf = readFileSync2(p);
      const slice = buf.subarray(logStart, logStart + logBytes);
      hostLog = {
        from: logStart,
        bytes: logBytes,
        // The digest of the slice as sealed. A reader compares this against the
        // last checkpoint in the trace; agreement means the log in this bundle
        // is the log the chain committed to while it was being written.
        digest: `sha256:${createHash2("sha256").update(slice).digest("hex")}`,
        text: slice.toString("utf8"),
        covers: "The lines this session wrote, from the byte it started at. Earlier bytes in the file belong to other sessions and are not claimed."
      };
    } catch {
      hostLog = null;
    }
    const bundle = {
      mode: "imagine",
      sealedAt: (/* @__PURE__ */ new Date()).toISOString(),
      session: ledger.summary,
      publicKeyPem: ledger.publicKeyPem,
      claim: {
        asserts: "These artifacts, this trace, and the bodies its digests address came from one imagine session, unaltered since sealing.",
        does_not_assert: "Anything about who ran the session, whether the artifacts are sound, or whether their declared lanes are true. It also says nothing about work done INSIDE a service: the trace records mutations crossing the HTTP boundary, so a graph execution appears as the calls that triggered it and not as what it did. The signing key is ephemeral and travels inside the bundle; ground it to find out."
      },
      authoredCount: authored.length,
      // Present ONLY when the list could not be read. Its absence means the
      // catalog answered and the count is a measurement; its presence means the
      // count is zero because nothing was counted, which is a different claim.
      ...readFailure ? { artifactsUnread: readFailure } : {},
      artifactsDigest,
      artifacts: authored,
      bodiesDigest,
      bodies,
      hostLog,
      trace: ledger.read()
    };
    const digest = digestOf({
      events: bundle.trace,
      authored,
      continues: ledger.summary.continues ?? null
    });
    const digestEvent = ledger.append("imagine.session.digest", digest);
    bundle.digest = { ...digest, eventId: digestEvent.event_id, seq: digestEvent.payload.seq };
    const sealEvent = ledger.append("imagine.session.sealed", {
      trigger,
      authoredCount: authored.length,
      // Inside the signed event too, so a reader of the chain alone — without
      // the bundle — can still tell an unread list from an empty one.
      ...readFailure ? { artifactsUnread: readFailure } : {},
      traceEntries: bundle.trace.length,
      artifactsDigest,
      bodiesDigest,
      // The seal declares its own position as the total, so a bundle cut
      // here reads "40 of 40 at the seal" rather than "unterminated". A
      // session that is later killed still writes a closing event with a
      // higher total; the two do not conflict, they date-stamp different
      // moments.
      total: ledger.summary.entries + 1
    });
    bundle.seal = { eventId: sealEvent.event_id, checksum: sealEvent.checksum, artifactsDigest, bodiesDigest };
    const selfCheck = ledger.verify();
    if (!selfCheck.ok) {
      return { ok: false, status: 500, result: {
        error: "refusing to seal: this session's own ledger does not verify",
        detail: selfCheck,
        meaning: "The trace contains events this session did not write, or wrote under another key. Nothing was sealed."
      } };
    }
    bundle.trace = ledger.read();
    Object.assign(bundle, completenessOf(bundle.trace));
    Object.assign(bundle, contentOf(bundle.trace, bundle.bodies));
    const out = join(sessionDir, `bundle-${Date.now()}.json`);
    writeFileSync2(out, JSON.stringify(bundle, null, 2));
    return { ok: true, status: 200, result: {
      mode: "imagine",
      trigger,
      sealed: out,
      authoredCount: authored.length,
      ...readFailure ? { artifactsUnread: readFailure } : {},
      traceEntries: bundle.trace.length,
      seal: bundle.seal
    } };
  } catch (err) {
    return { ok: false, status: 500, result: { error: err instanceof Error ? err.message : String(err) } };
  }
}
app.post("/session/seal", async (_req, res) => {
  const s = await sealSession("api");
  res.status(s.status).json(s.result);
});
function readLedgerFrom(offset) {
  const p = ledger.summary.ledger;
  if (!p || !existsSync2(p)) return { offset, events: [] };
  const buf = readFileSync2(p);
  if (buf.length <= offset) return { offset, events: [] };
  const text = buf.subarray(offset).toString("utf8");
  const complete = text.lastIndexOf("\n");
  if (complete < 0) return { offset, events: [] };
  const events = text.slice(0, complete).split("\n").filter(Boolean).map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  }).filter(Boolean);
  return { offset: offset + Buffer.byteLength(text.slice(0, complete + 1)), events };
}
app.get("/session/stream", (req, res) => {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive"
  });
  let offset = req.query.from === "start" ? 0 : existsSync2(ledger.summary.ledger) ? statSync(ledger.summary.ledger).size : 0;
  res.write(`event: hello
data: ${JSON.stringify({ session: ledger.summary.actor, mode: "imagine" })}

`);
  const tick = setInterval(() => {
    try {
      const { offset: next, events } = readLedgerFrom(offset);
      offset = next;
      for (const e of events) res.write(`data: ${JSON.stringify(e)}

`);
    } catch {
    }
  }, 400);
  req.on("close", () => clearInterval(tick));
});
app.post("/session/fetch", import_express.default.json({ limit: "8kb" }), async (req, res) => {
  const url = String(req.body?.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: "url must be http or https" });
  }
  const maxBytes = Math.min(Number(req.body?.maxBytes ?? 5e6), 2e7);
  const timeoutMs = Math.min(Number(req.body?.timeoutMs ?? 2e4), 6e4);
  const t0 = process.hrtime.bigint();
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  try {
    const { retrieve } = await import("../chunks/dist-EJU4XW63.mjs");
    const chunks = [];
    const observerLines = [];
    const result = await retrieve({
      url,
      identity: ledger.identity,
      level: "self-attested",
      idPrefix: "imagine.retrieval",
      sink: (line) => observerLines.push(line),
      onData: (chunk) => chunks.push(chunk),
      maxBytes,
      timeoutMs,
      headers: { "user-agent": "symbia-imagine-retrieval/1.0 (+provenance observer)" }
    });
    const body = Buffer.concat(chunks);
    const digest = `sha256:${createHash2("sha256").update(body).digest("hex")}`;
    const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
    ledger.recordBlob(digest, body.toString("utf8"));
    const ev = ledger.append("imagine.retrieval", {
      url,
      digest,
      bytes: result.bytes,
      chunks: result.chunks,
      complete: result.complete,
      observation_id: result.observation_id,
      observationHead: result.head,
      source: result.source,
      startedAt,
      elapsedMs: Math.round(elapsedMs * 1e3) / 1e3,
      lane: "canonical",
      receipt: "witness",
      laneNote: "A remote body cannot be recomputed, so this is a witness rather than a recipe: the digest recognises the same bytes if anyone fetches them again, and does not reproduce them.",
      does_not_assert: "that the retrieved content is true, that the server was honest, or that the same URL would serve these bytes again. A fabricated page fetched cleanly gets a clean receipt. What is claimed: these bytes arrived from this URL over the recorded TLS chain, at this position in this session's signed chain."
    });
    res.json({
      url,
      digest,
      bytes: result.bytes,
      complete: result.complete,
      seq: ev.payload.seq,
      checksum: ev.checksum,
      tls: result.source?.tls ?? null,
      redirects: result.source?.redirects ?? null,
      observerEvents: observerLines.length,
      elapsedMs: Math.round(elapsedMs * 1e3) / 1e3,
      content: body.toString("utf8"),
      does_not_assert: "that this content is true. The receipt recognises these bytes; it does not vouch for them."
    });
  } catch (err) {
    const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
    const message = err instanceof Error ? err.message : String(err);
    ledger.append("imagine.retrieval.failed", {
      url,
      startedAt,
      elapsedMs: Math.round(elapsedMs * 1e3) / 1e3,
      error: message.slice(0, 300),
      lane: "apocryphal",
      does_not_assert: "anything about why it failed beyond the message the transport gave."
    });
    res.status(502).json({ error: "retrieval failed", url, message: message.slice(0, 300) });
  }
});
app.post("/session/note", import_express.default.json({ limit: "64kb" }), (req, res) => {
  const note = String(req.body?.note ?? "").slice(0, 2e3);
  if (!note.trim()) return res.status(400).json({ error: "a note needs text" });
  const ev = ledger.append("imagine.observer.note", {
    note,
    observer: String(req.body?.observer ?? "human"),
    lane: "apocryphal",
    does_not_assert: "that the note is true. A human said this, at this position in the chain. Its value is the position, not the sentence."
  });
  res.json({ seq: ev.payload.seq, checksum: ev.checksum, at: ev.timestamp });
});
var OBSERVER_HTML = `<!doctype html><meta charset="utf-8"><title>Symbia Imagine \u2014 observer</title>
<style>
:root{color-scheme:dark}
body{margin:0;background:#0e0e10;color:#e8e6e0;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
header{padding:12px 16px;border-bottom:1px solid #2a2a2e;display:flex;gap:16px;align-items:baseline;flex-wrap:wrap}
h1{font-size:14px;margin:0;font-weight:600;letter-spacing:.02em}
.dim{color:#7a7a82}
#feed{padding:8px 16px;height:calc(100vh - 168px);overflow:auto}
.ev{padding:3px 0;border-bottom:1px solid #1a1a1d;display:flex;gap:10px;align-items:baseline}
.seq{color:#5a5a62;min-width:52px;text-align:right}
.kind{min-width:170px}
.mut{color:#d8a657}.note{color:#a9b8ff}.open{color:#89b482}.seal{color:#d3869b}.close{color:#e78a4e}
.ok{color:#89b482}.bad{color:#ea6962}
.detail{color:#b8b6b0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
footer{position:fixed;bottom:0;left:0;right:0;background:#141417;border-top:1px solid #2a2a2e;padding:10px 16px;display:flex;gap:8px}
input{flex:1;background:#0e0e10;border:1px solid #34343a;color:#e8e6e0;padding:8px 10px;border-radius:5px;font:inherit}
button{background:#2a2a30;border:1px solid #3a3a42;color:#e8e6e0;padding:8px 14px;border-radius:5px;cursor:pointer;font:inherit}
button:hover{background:#34343c}
#said{padding:0 16px;color:#7a7a82;height:20px}
</style>
<header>
  <h1>Symbia Imagine \u2014 observer</h1>
  <span class="dim" id="sess">connecting\u2026</span>
  <span class="dim" id="count">0 events</span>
  <span class="dim">watching the signed ledger as it is written</span>
</header>
<div id="feed"></div>
<div id="said"></div>
<footer>
  <input id="note" placeholder="Attest something into the record \u2014 it becomes a signed, sequenced event" autocomplete="off">
  <button id="send">Sign into the ledger</button>
</footer>
<script>
const q = new URLSearchParams(location.search);
const token = q.get("token") || "";
const feed = document.getElementById("feed");
let n = 0;
const cls = t => t.includes("mutation") ? "mut" : t.includes("note") ? "note"
  : t.includes("opened") ? "open" : t.includes("sealed") ? "seal" : t.includes("closed") ? "close" : "";
function add(e){
  const p = e.payload || {};
  const row = document.createElement("div");
  row.className = "ev";
  let detail = "";
  if (e.event_type === "imagine.mutation") {
    const okc = p.accepted ? "ok" : "bad";
    detail = '<span class="' + okc + '">' + (p.method||"") + " " + (p.status||"") + "</span> " + (p.path||"");
  } else if (e.event_type === "imagine.observer.note") {
    detail = "\u201C" + (p.note||"") + "\u201D";
  } else {
    detail = Object.entries(p).filter(([k])=>k!=="seq"&&k!=="does_not_assert")
      .map(([k,v])=>k+"="+(typeof v==="object"?JSON.stringify(v):v)).join(" ").slice(0,220);
  }
  row.innerHTML = '<span class="seq">#'+(p.seq??"")+'</span>'
    + '<span class="kind '+cls(e.event_type)+'">'+e.event_type.replace("imagine.","")+'</span>'
    + '<span class="detail">'+detail+'</span>';
  const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 40;
  feed.appendChild(row);
  if (atBottom) feed.scrollTop = feed.scrollHeight;
  document.getElementById("count").textContent = (++n) + " events seen";
}
const es = new EventSource("/session/stream?from=start&token=" + encodeURIComponent(token));
es.addEventListener("hello", ev => {
  document.getElementById("sess").textContent = JSON.parse(ev.data).session;
});
es.onmessage = ev => { try { add(JSON.parse(ev.data)); } catch {} };
es.onerror = () => { document.getElementById("sess").textContent = "stream closed \u2014 the host has gone"; };
async function send(){
  const el = document.getElementById("note");
  const note = el.value.trim();
  if (!note) return;
  el.value = "";
  const r = await fetch("/session/note", {
    method: "POST",
    headers: { "content-type": "application/json", "x-imagine-token": token },
    body: JSON.stringify({ note, observer: "human observer" })
  });
  const b = await r.json();
  document.getElementById("said").textContent = r.ok
    ? "signed into the chain at seq " + b.seq + " \u2014 " + String(b.checksum).slice(0,26) + "\u2026"
    : "refused: " + (b.error || r.status);
}
document.getElementById("send").onclick = send;
document.getElementById("note").addEventListener("keydown", e => { if (e.key === "Enter") send(); });
</script>`;
app.get("/session/observe", (_req, res) => {
  res.type("html").send(OBSERVER_HTML);
});
var services = [];
function servicesDir() {
  for (const c of [join(here, "services"), join(here, "..", "services")]) {
    if (existsSync2(c)) return c;
  }
  return join(here, "services");
}
function bundlePath(id) {
  const owned = join(servicesDir(), `${id}.mjs`);
  if (existsSync2(owned)) return owned;
  return join(here, "..", "..", id, ".standalone-routes.mjs");
}
async function mount(id, spec, attach) {
  const sub = (0, import_express.default)();
  sub.use(import_express.default.json({ limit: "10mb" }));
  try {
    const mod = await import(spec);
    for (const mw of mod.middleware ?? []) sub.use(mw);
    if (attach) await attach(mod, sub);
    else await mod.registerRoutes(httpServer, sub);
    app.use(`/svc/${id}`, sub);
    mounted.push({ id, ok: true });
    services.push({ id, mod, app: sub });
    log(`mounted /svc/${id}`);
    return mod;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const OPTIONAL = {
      "googleapis": {
        capability: "sending mail through Gmail",
        why: "114 MB, and an ephemeral local stack never reaches the OAuth path"
      },
      "node-llama-cpp": {
        capability: "local inference on your own machine",
        why: "52 MB and a native build; nothing needs it before your first graph runs"
      }
    };
    const missing = Object.keys(OPTIONAL).find(
      (p) => detail.includes(`Cannot find package '${p}'`)
    );
    if (missing) {
      const { capability, why } = OPTIONAL[missing];
      const note = `'${id}' is not running because ${capability} is not installed. This is deliberate: ${why}. To enable it, run \`npm install ${missing}\` in the plugin directory and start a new session. Everything else on this stack is unaffected.`;
      mounted.push({ id, ok: false, optional: true, capability, install: missing, error: note });
      app.use(
        `/svc/${id}`,
        (_q, res) => res.status(503).json({ error: note, optionalCapability: capability, install: missing })
      );
      log(`/svc/${id} not started \u2014 optional: ${capability} (npm install ${missing})`);
      return;
    }
    mounted.push({ id, ok: false, error: detail });
    app.use(
      `/svc/${id}`,
      (_q, res) => res.status(503).json({ error: `service '${id}' did not mount`, detail })
    );
    log(`FAILED /svc/${id}: ${detail}`);
  }
}
var port = await new Promise((resolve) => {
  const wanted = process.env.IMAGINE_HOST_MODE && process.env.IMAGINE_OWNED !== "1" ? Number(process.env.IMAGINE_HOST_PORT || 7717) : 0;
  httpServer.listen(wanted, "127.0.0.1", () => resolve(httpServer.address().port));
});
var BASE = `http://127.0.0.1:${port}`;
admitInternalCalls(BASE);
log(`services on ${BASE} (ephemeral, loopback only)`);
for (const [k, id] of [
  ["IDENTITY_SERVICE_URL", "identity"],
  ["CATALOG_SERVICE_URL", "catalog"],
  ["INTEGRATIONS_SERVICE_URL", "integrations"],
  ["MODELS_SERVICE_URL", "models"],
  ["ASSISTANTS_SERVICE_URL", "assistants"],
  ["LOGGING_SERVICE_URL", "logging"],
  ["NETWORK_SERVICE_URL", "network"],
  ["MESSAGING_SERVICE_URL", "messaging"],
  ["RUNTIME_SERVICE_URL", "runtime"]
]) {
  process.env[k] = `${BASE}/svc/${id}`;
}
var IMAGINE_EMAIL = process.env.SYMBIA_EMAIL || "dev@example.com";
var IMAGINE_PASSWORD = process.env.SYMBIA_PASSWORD || randomBytes(24).toString("base64url");
process.env.IDENTITY_DEFAULT_ADMIN_PASSWORD = IMAGINE_PASSWORD;
var identityMod = await mount("identity", bundlePath("identity"));
var catalogMod = await mount("catalog", bundlePath("catalog"));
await mount("integrations", bundlePath("integrations"));
await mount("models", bundlePath("models"));
await mount("logging", bundlePath("logging"));
await mount("directory", bundlePath("directory"));
await mount("network", bundlePath("network"));
await mount("messaging", bundlePath("messaging"));
await mount("runtime", bundlePath("runtime"));
await mount("assistants", bundlePath("assistants"));
async function seed() {
  try {
    await identityMod?.bootstrap?.();
    log("identity bootstrap: ok");
    try {
      const jwt = await fetch(`${BASE}/svc/identity/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: IMAGINE_EMAIL, password: IMAGINE_PASSWORD })
      }).then((r) => r.ok ? r.json() : null);
      const me = jwt?.token ? await fetch(`${BASE}/svc/identity/api/auth/me`, {
        headers: { Authorization: `Bearer ${jwt.token}` }
      }).then((r) => r.ok ? r.json() : null) : null;
      const sys = ((me?.user ?? me)?.organizations ?? [])[0];
      if (sys?.id) {
        process.env.SYMBIA_SYSTEM_ORG_ID = sys.id;
        log(`system org: ${sys.id} (${sys.name})`);
      }
    } catch {
    }
  } catch (err) {
    log(`identity bootstrap failed: ${err.message}`);
  }
  try {
    await catalogMod?.bootstrap?.();
    log("catalog bootstrap: ok");
  } catch (err) {
    log(`catalog bootstrap failed: ${err.message}`);
  }
  for (const { id, mod } of services) {
    if (mod === identityMod || mod === catalogMod) continue;
    if (typeof mod?.bootstrap !== "function") continue;
    try {
      await mod.bootstrap();
      log(`${id} bootstrap: ok`);
    } catch (err) {
      log(`${id} bootstrap failed: ${err.message}`);
    }
  }
}
await seed();
for (const { id, mod, app: sub } of services) {
  if (typeof mod?.start !== "function") continue;
  try {
    const out = await mod.start({ app: sub });
    log(`started ${id}${out ? `: ${JSON.stringify(out)}` : ""}`);
  } catch (err) {
    log(`start FAILED ${id}: ${err instanceof Error ? err.message : err}`);
  }
}
process.env.SYMBIA_BASE_URL = BASE;
process.env.SYMBIA_EMAIL = IMAGINE_EMAIL;
process.env.SYMBIA_PASSWORD = IMAGINE_PASSWORD;
var shuttingDown = false;
var takedown = async (reason, code = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`takedown (${reason})`);
  try {
    const s = await Promise.race([
      sealSession(`takedown:${reason}`, { skipIfEmpty: true }),
      new Promise((r) => setTimeout(() => r({ ok: false, result: { error: "seal timed out at 5s" } }), 5e3))
    ]);
    log(
      s.skipped ? `takedown: ${s.result.reason}` : s.ok ? `sealed on takedown: ${s.result.sealed}` : `takedown seal FAILED: ${s.result.error}`
    );
  } catch (err) {
    log(`takedown seal threw: ${err instanceof Error ? err.message : err}`);
  }
  for (const { id, mod } of services) {
    if (typeof mod?.stop !== "function") continue;
    try {
      await mod.stop();
      log(`stopped ${id}`);
    } catch (err) {
      log(`stop FAILED ${id}: ${err instanceof Error ? err.message : err}`);
    }
  }
  let closed = null;
  try {
    closed = ledger.close(reason);
    if (closed) log(`ledger closed: ${closed.payload.total} events, head ${closed.checksum}`);
  } catch (err) {
    log(`ledger close FAILED: ${err instanceof Error ? err.message : err}`);
  }
  if (closed) {
    try {
      appendFileSync2(lineagePath, `${JSON.stringify({
        session: closed.actor_identity,
        head: closed.checksum,
        endedWith: closed.event_type,
        declaredTotal: closed.payload?.total ?? null,
        closedAt: (/* @__PURE__ */ new Date()).toISOString()
      })}
`);
    } catch (err) {
      log(`lineage write FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }
  try {
    rmSync(runtimeDir, { recursive: true, force: true });
    log(`runtime trace removed: ${runtimeDir}`);
  } catch (err) {
    log(`runtime trace NOT removed: ${err instanceof Error ? err.message : err}`);
  }
  process.exit(code);
};
process.on("SIGTERM", () => void takedown("SIGTERM"));
process.on("SIGINT", () => void takedown("SIGINT"));
if (!process.env.IMAGINE_HOST_MODE || process.env.IMAGINE_OWNED === "1") {
  process.stdin.resume();
  process.stdin.on("close", () => void takedown("stdin closed"));
  process.stdin.on("end", () => void takedown("stdin ended"));
  process.stdin.on("error", () => void takedown("stdin errored"));
}
ready = true;
var bootCompletedAt = (/* @__PURE__ */ new Date()).toISOString();
globalThis.__imagineBootCompletedAt = bootCompletedAt;
if (process.env.IMAGINE_HOST_MODE) {
  const { clearAddress, writeAddress } = await import("../chunks/host-address-U3NCOSX4.mjs");
  writeAddress({
    base: BASE,
    pid: process.pid,
    session: ledger.summary.actor,
    startedAt: (/* @__PURE__ */ new Date()).toISOString(),
    // The gate. Present only in this file, only at 0600, only for this
    // process. A shim that can read the file is a shim the user could have
    // read the file as — filesystem permission IS the authorisation, which
    // is the same trust boundary the user already relies on for their ssh
    // keys, rather than a second one invented here.
    token: HOST_TOKEN,
    // What this host is. A shim compares it against its own before issuing a
    // call, because a client talking to a host built from different source is
    // the stale-bundle failure promoted to something a stranger would hit on
    // install and have no way to diagnose.
    build: BUILD_MARKER
  });
  const wasTakedown = takedown;
  takedown = async (reason, code = 0) => {
    clearAddress();
    return wasTakedown(reason, code);
  };
  log(`host mode${process.env.IMAGINE_OWNED === "1" ? " (owned \u2014 dies with its shim)" : ""}: stack on ${BASE}, address at ${addressFile()}`);
  log("no MCP in this process \u2014 start a shim to attach a client");
} else {
  log("starting MCP on stdio \u2014 stdout is the protocol from here");
  const mcpCandidates = [
    join(here, "mcp-server", "index.mjs"),
    // packaged and vendored (0.21.0+)
    join(here, "mcp-server", "index.js"),
    join(here, "..", "symbia-mcp-server", "dist", "index.js")
  ];
  const canLoad = (p) => {
    try {
      createRequire(p).resolve("@modelcontextprotocol/sdk/server/mcp.js");
      return true;
    } catch {
      return false;
    }
  };
  const mcpEntry = mcpCandidates.filter(existsSync2).find(canLoad) ?? mcpCandidates.find(existsSync2);
  if (!mcpEntry) {
    log("could not find symbia-mcp-server. Tried:");
    for (const c of mcpCandidates) log(`  ${c}`);
    log("In a checkout: npm run build -w symbia-mcp-server. In a plugin: the archive was built without it.");
    process.exit(1);
  }
  await import(pathToFileURL(mcpEntry).href);
}
