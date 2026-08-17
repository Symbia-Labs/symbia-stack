/**
 * Symbia imagine sidecar — headless, stdio MCP, one process.
 *
 * What it is: a whole Symbia stack booted inside the process that Claude
 * Desktop spawns, exposed as MCP over stdin/stdout. No console, no ports
 * to configure, no Postgres, no containers. When the client quits, the
 * imagination goes with it — which is the mode's whole claim.
 *
 * Claude Desktop config:
 *
 *   "symbia-imagine": { "command": "node", "args": ["<repo>/imagine/shim.mjs", "--autostart"] }
 *
 * Three constraints shape this file:
 *
 * 1. STDOUT IS THE PROTOCOL. Every service in this stack logs with
 *    console.log, and a single stray line corrupts the MCP stream. All
 *    logging is redirected to stderr before any service is imported.
 * 2. SERVICES ARE HTTP. They call each other over URLs, so the sidecar
 *    still listens — on an EPHEMERAL loopback port nobody needs to know.
 *    One origin, `/svc/<id>`, the same convention the console uses.
 * 3. BOOTSTRAP IS NOT REACHABLE. Each service's seed logic is private to
 *    its index.ts (the spike's PS4 finding), so this seeds through the
 *    platform's own API instead — which is the rule anyway: if a piece
 *    cannot be built through the Symbia API alone, that is a defect.
 */
import express from "express";
import { createServer } from "node:http";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { canonicalJson } from "@symbia/crypto";
import { randomBytes } from "node:crypto";
import { ADDRESS_FILE as ADDRESS_FILE_PATH } from "./host-address.mjs";

/**
 * The session token, and what it is worth.
 *
 * 32 random bytes, minted once per spawn, never written anywhere but the
 * address file at 0600, gone when the process is. It authorises a local client
 * to reach this stack and asserts nothing else — not who the user is, not what
 * they may do, only that whoever presents it could read a file in this user's
 * home directory.
 *
 * Deliberately not a JWT, not signed, not scoped. A capability whose whole
 * lifetime is one process does not need structure; it needs to be unguessable
 * and to die on time.
 */
const HOST_TOKEN = process.env.IMAGINE_HOST_TOKEN || randomBytes(32).toString("base64url");

/**
 * What source this host was built from.
 *
 * Two of today's measurements were nearly filed against a bundle that predated
 * the code under test. On one machine that is a habit problem, caught by
 * grepping a marker by hand. Shipped to strangers it becomes a class of bug
 * report nobody can act on, so the marker moves into the handshake and the
 * shim refuses a host it does not match.
 */
const BUILD_MARKER = process.env.IMAGINE_BUILD || "dev";

/**
 * THE STACK HAS TO GET PAST ITS OWN GATE.
 *
 * Services here are ordinary HTTP clients of each other — the runtime reads
 * component manifests from the catalog, the assistant loader reads its roster —
 * and every one of those calls goes out through the same loopback origin an
 * outside process would use. There is no address, port or socket property that
 * separates them: same host, same port, same request.
 *
 * So the gate refused them. Measured immediately after it shipped:
 *
 *   start FAILED runtime: Catalog GET /api/resources?type=component -> 401
 *   [Assistant Loader] Catalog returned 401 for type=assistant (attempt 5/5)
 *
 * and the catalog held zero resources where it had held fifty-four. The
 * A-series predictions checked that an outsider was refused and never that an
 * insider still got through, which is the shape of the mistake rather than the
 * mistake itself.
 *
 * Patching fetch is the narrow fix: requests this process makes TO ITSELF carry
 * the token, everything else is untouched, and no service's code changes. The
 * alternative — exempting loopback — would exempt every other process on the
 * machine, which is the thing the gate exists to stop.
 */
function admitInternalCalls(base) {
  const original = globalThis.fetch;
  globalThis.fetch = (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    if (!url.startsWith(base)) return original(input, init);
    const headers = new Headers(init.headers ?? (typeof input === "object" ? input.headers : undefined));
    headers.set("x-imagine-token", HOST_TOKEN);
    return original(input, { ...init, headers });
  };
}
import { createSessionLedger, completenessOf } from "./session-ledger.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");

// 1. stdout belongs to MCP. Everything else goes to stderr, starting now.
//
// AND INTO A RING BUFFER, so a host can ask WHY a service failed.
//
// D3 (16 Aug) took a shell to diagnose. Three logging endpoints returned
// generic 500s — "Failed to query logs" — while the cause (no tables in
// pg-mem) reached only stderr, which no API exposed. Services catch their
// own errors and answer with a sentence that names the operation rather
// than the fault, so the response can never carry the detail.
//
// Teeing every redirected line into a bounded buffer costs nothing and
// makes the detail reachable. Correlation with the request in flight is
// approximate on purpose — see `/session/diagnostics`.
const RING = [];
const RING_MAX = Number(process.env.IMAGINE_LOG_RING || 2000);
let inFlight = null;
function ring(args) {
  const line = args.map((a) => (typeof a === "string" ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })())).join(" ");
  RING.push({ at: Date.now(), line, during: inFlight });
  if (RING.length > RING_MAX) RING.shift();
}
const realError = console.error.bind(console);
const log = (...a) => { ring(["[sidecar]", ...a]); realError("[sidecar]", ...a); };
const tee = (...a) => { ring(a); realError(...a); };
console.log = tee;
console.info = tee;
console.debug = tee;
console.error = tee;
console.warn = tee;

// 2. imagine-mode environment, set before any service module is imported.
delete process.env.DATABASE_URL; // pg-mem; the library announces it
process.env.SYMBIA_MODE = "imagine";
process.env.NODE_ENV = process.env.NODE_ENV || "development";
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET || `imagine-${Math.random().toString(36).slice(2)}`;
// The network service refuses to mount without this, and has done so in every
// health check taken today — reported as "unreachable" beside nine healthy
// services and read past every time. It is an ephemeral stack with an
// ephemeral signing key already; a per-spawn secret is the same construction
// and the same lifetime.
process.env.NETWORK_HASH_SECRET =
  process.env.NETWORK_HASH_SECRET || `imagine-${randomBytes(16).toString("hex")}`;
// RELATIVE TO THIS FILE, NOT TO THE REPOSITORY.
//
// This read join(repo, "experiments/standalone/.models"). After the directory
// moved to imagine/, mkdirSync below happily RECREATED the old path and the
// stack booted 10 of 10 writing models somewhere nothing owns. A path built
// from a repository root also has no meaning in the packaged plugin, where
// there is no repository.
process.env.MODELS_PATH = process.env.MODELS_PATH || join(here, ".models");
// SETTING A PATH IS NOT CREATING ONE.
//
// Measured 16 Aug: POST /api/models/pull answered
// `500 ENOENT ... .models/<file>.gguf.partial`. The service was configured
// correctly and the directory had never existed, so the first thing a pull
// did was open a temp file into nothing. A filesystem error surfaced as a
// server error, for what is a setup step nobody had taken.
mkdirSync(process.env.MODELS_PATH, { recursive: true });

// A BUNDLE RESOLVES ITS DATA RELATIVE TO ITSELF, NOT ONLY ITS PACKAGES.
//
// Moving the bundles into ./services/ broke resolution twice, and the M-series
// predicted only once. Packages were the visible half, fixed by the
// package.json beside them. The second half surfaced as a catalog holding 16
// resources where it had held 54: `seedFromDataFiles` walks candidate paths
// relative to the bundle's own location, found none of them, and said so —
// "No bootstrap data found to load" — while every service reported healthy.
//
// A stack that boots clean with an empty catalog is the failure this project
// keeps naming: nothing errored, nothing was missing that anyone could see,
// and the assistant loader retried five times against a catalog that was
// simply empty.
//
// The service already publishes an escape hatch for exactly this. Using it is
// cheaper than teaching every bundle where it lives, and it keeps the fix
// inside the sidecar rather than in code the sidecar only borrows.
process.env.CATALOG_DATA_DIR = process.env.CATALOG_DATA_DIR || join(servicesDir(), "data");
// LAX ABOUT CANON, STRICT ABOUT RECORDING (ruling 15 Aug).
// The whole session is apocryphal, so enforcing lane and manifest
// contracts here would police a distinction that does not apply yet.
// Design mode postprocesses the exported bundle; that is where claims get
// checked. Imagine's job is to let a client build whatever the APIs
// allow — and to record every bit of it.
process.env.RUNTIME_MANIFEST_ENFORCEMENT = process.env.RUNTIME_MANIFEST_ENFORCEMENT || "off";
// The runtime reconciles the catalog every 30s by default, which suits a
// deployment where graphs are authored long before the process starts. In
// imagine every graph is authored after boot, by the client, during the
// session: a graph created at second 3 was invisible until second 30.
// Measured 16 Aug — the first run of this probe read loadedGraphs=0.
process.env.RUNTIME_RECONCILE_INTERVAL_MS =
  process.env.RUNTIME_RECONCILE_INTERVAL_MS || "3000";
process.env.SYMBIA_ENFORCEMENT = "off";

const sessionDir = join(here, ".session");
mkdirSync(sessionDir, { recursive: true });
const ledger = createSessionLedger({
  path: join(sessionDir, "ledger.jsonl"),
  pubKeyPath: join(sessionDir, "session.pub.pem"),
});

// A CRASH IN ONE REQUEST MUST NOT END TEN SERVICES.
//
// Measured 16 Aug (security MAP, S19): an 11 MB body was accepted and the
// process was gone on the next probe, taking every mounted service with
// it — the single-process trade arriving as a fact. A sandbox that dies
// under load cannot host a long loop, which is the main thing imagine
// mode is for. These handlers keep the stack alive and say what happened;
// they do not pretend the request succeeded.
process.on("uncaughtException", (err) => {
  log(`UNCAUGHT: ${err?.message ?? err}`);
  ledger.append("imagine.process.uncaught", { message: String(err?.message ?? err), stack: undefined });
});
process.on("unhandledRejection", (reason) => {
  log(`UNHANDLED REJECTION: ${reason instanceof Error ? reason.message : String(reason)}`);
  ledger.append("imagine.process.unhandled", { reason: reason instanceof Error ? reason.message : String(reason) });
});

const app = express();
const httpServer = createServer(app);
const mounted = [];

// LISTENING IS NOT READY.
//
// Services call each other over HTTP, so the socket must be open before any
// of them is mounted — which means `/` answers while the stack is still
// assembling. Measured 16 Aug: a reload script polled `/`, got 200, and
// reported "7 services" for a stack that had ten a moment later. It read a
// half-built list and called it a result.
//
// A caller that waits for a 200 is waiting for the wrong thing. `ready`
// flips once boot has finished, so "answering" and "usable" are separable.
let ready = false;

// Recorded before anything is routed, so a mutation is in the trace even
// when the service it addressed refused it or does not exist.
// 2 MB, not 10: an imagine session authors artifacts, it does not upload
// blobs, and the smaller ceiling is what keeps a runaway body from
// exhausting a process that holds ten services.
app.use(express.json({ limit: process.env.IMAGINE_BODY_LIMIT || "2mb" }));
app.use((err, _req, res, next) => {
  if (err?.type === "entity.too.large") {
    return res.status(413).json({
      error: "request body too large for imagine mode",
      limit: process.env.IMAGINE_BODY_LIMIT || "2mb",
      hint: "imagine holds ten services in one process; a body big enough to strain it is refused rather than risked",
    });
  }
  return next(err);
});
// Non-2xx responses, kept with their timing so diagnostics can pair them
// with what the service logged. Bodies are not stored — the ledger already
// digests those, and a failing request's body is rarely the interesting part.
const FAILURES = [];
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
      endedAt: Date.now(),
    });
    if (FAILURES.length > 200) FAILURES.shift();
  });
  next();
});
// THE GATE. Everything below this line requires the session token.
//
// Measured before it existed: eight routes across four services answered an
// unauthenticated caller with 200 — runtime graphs, executions and components,
// the assistant roster, the model list, catalog stats. None of it exposed the
// user's own artifacts, because the catalog filters private resources by
// policy. All of it exposed the SHAPE of what they were doing to any process
// on the machine that could reach the port.
//
// That is acceptable on one developer's laptop and not acceptable in something
// a stranger installs. The token closes it without introducing a credential
// anybody has to manage: it is minted at spawn, lives only in a 0600 file, and
// dies with the process.
//
// `/` stays open on purpose. A shim must be able to ask "what are you, and are
// you ready" before it holds anything, and the answer names no artifact.
app.use((req, res, next) => {
  if (req.path === "/" || req.path === "/health") return next();
  const offered =
    req.get("x-imagine-token") ||
    (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (offered && offered === HOST_TOKEN) return next();
  // Say what is wrong and where the answer lives. A generic 401 here sends a
  // reader looking for a password that does not exist.
  return res.status(401).json({
    error: offered ? "session token does not match this host" : "no session token offered",
    detail:
      "This host authorises by possession of its session token, which is written only to " +
      "its address file with mode 0600 and dies with the process. Read the token from that " +
      "file and send it as x-imagine-token. There is no password and nothing to rotate.",
    addressFile: ADDRESS_FILE_PATH,
    hint: offered
      ? "A mismatch usually means the host restarted and minted a new token — re-read the file."
      : undefined,
  });
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
    readiness: !ready
      ? "still booting — the socket is open because services address each other over it; this list is incomplete"
      : failed.length === 0
        ? "boot complete — every service mounted"
        : `boot complete, ${failed.length} of ${mounted.length} services FAILED to mount: ` +
          `${failed.map((f) => f.id).join(", ")}. The stack is answering and incomplete; ` +
          `read services[] for each failure's reason before relying on anything.`,
    transport: "stdio-mcp",
    enforcement: "off — canon is checked when this is grounded, not here",
    warning: "in-memory, ephemeral keys, restart-lossy — a sketch, not a record",
    services: mounted,
    session: ledger.summary,
  });
});

/**
 * Why did that fail?
 *
 * Pairs each non-2xx response with the log lines emitted while it was in
 * flight. The pairing is a TIME WINDOW, not a causal link: two concurrent
 * requests both claim lines written during their overlap, and a service
 * that logs after responding (batched telemetry flush) writes its
 * explanation outside its own window entirely. Both cases are stated in
 * the response rather than smoothed over, because a diagnostic that
 * quietly guesses is worse than one that says how it guessed.
 */
app.get("/session/diagnostics", (req, res) => {
  const limit = Number(req.query.limit ?? 20);
  const failures = FAILURES.slice(-limit).map((f) => {
    const window = RING.filter((r) => r.at >= f.startedAt && r.at <= f.endedAt + 250);
    // Every line records which request was in flight when it was written.
    // Preferring the ones tagged with THIS request cuts the boot noise that
    // otherwise dominates the window — measured 16 Aug, where a 503 came
    // back attached to four lines about the huggingface registry. Fall back
    // to the whole window when the tag matches nothing, and say which
    // happened rather than presenting them as the same thing.
    const tag = `${f.method} ${f.path}`;
    const tagged = window.filter((r) => r.during === tag);
    return {
      ...f,
      attribution: tagged.length ? "tagged: lines written while this request was in flight"
                                 : "window only: no line was tagged with this request",
      lines: (tagged.length ? tagged : window).map((r) => r.line),
    };
  });
  res.json({
    mode: "imagine",
    correlation: "time window, approximate",
    caveats: [
      "concurrent requests overlap and will both claim the same lines",
      "a service that logs after responding writes outside its own window; the 250ms tail is a guess, not a guarantee",
    ],
    failures,
    ringHeld: RING.length,
    ringMax: RING_MAX,
  });
});

// The session trace: every mutation this sidecar saw, signed and chained.
app.get("/session", (_req, res) =>
  res.json({ mode: "imagine", ...ledger.summary, entries: ledger.read() })
);

/**
 * Seal the session: artifacts + trace + the public key that verifies it.
 *
 * This is the imagine -> design handoff in one file. It asserts only that
 * these bytes came from this session unaltered; it asserts nothing about
 * authorship or soundness, because the signing key is ephemeral and
 * travels inside the bundle. Design mode postprocesses it.
 */
app.post("/session/seal", async (_req, res) => {
  try {
    const catalogUrl = process.env.CATALOG_SERVICE_URL;
    const rows = catalogUrl
      ? await fetch(`${catalogUrl}/api/resources`, { headers: { "X-Service-Auth": "internal" } })
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => [])
      : [];
    // AUTHORED BY THE CLIENT, not merely written through the API.
    //
    // This filtered on `isBootstrap === false`, which answers "did this come
    // from a bootstrap file" — a different question. Measured 16 Aug: 18
    // artifacts in a bundle for a session that authored 2, because the
    // runtime registers 16 component manifests through the catalog API at
    // boot and those are ordinary writes.
    //
    // `createdBy` is the author, recorded by the catalog from the
    // authenticated principal. Services register under their own identity;
    // a client authors under the session principal. The seed carries
    // isBootstrap and no author at all, so both are excluded.
    // Measured, not guessed: services write under `service:internal`, the
    // seed writes nothing at all, and a client writes under its user id.
    //
    //   integration  createdBy=null              isBootstrap=true    23
    //   component    createdBy=service:internal  isBootstrap=false   16
    //   context      createdBy=<user uuid>       isBootstrap=false    1
    // AUTHORSHIP IS NOT CAUSATION, AND A BUNDLE NEEDS BOTH.
    //
    // The first version excluded every service-authored row, which was right
    // for the runtime's boot-time component manifests and wrong for
    // everything a client CAUSES a service to write. Measured 16 Aug: a
    // model pulled through the API registered its card under
    // `service:internal`, so the model this session acquired was absent from
    // the bundle while the pull sat in the trace at seq 18. A recipient
    // could see that a model was fetched and not which one.
    //
    // The line is boot. A service writing before boot completed is
    // furniture; a service writing after it is acting on a client's
    // instruction, because nothing else is acting.
    const bootAt = globalThis.__imagineBootCompletedAt;
    const attribute = (r) => {
      if (r.isBootstrap) return null;
      if (!r.createdBy) return null;
      if (!String(r.createdBy).startsWith("service:")) return "client";
      if (bootAt && r.createdAt && new Date(r.createdAt) > new Date(bootAt)) return "caused";
      return null;
    };
    const authored = Array.isArray(rows)
      ? rows
          .map((r) => ({ r, how: attribute(r) }))
          .filter((x) => x.how !== null)
          // Each artifact says how it got here, so a reader can tell a thing
          // the client wrote from a thing the client caused a service to write.
          .map(({ r, how }) => ({ ...r, attribution: how }))
      : [];
    // THE ARTIFACTS MUST BE INSIDE THE SEAL, NOT BESIDE IT.
    //
    // Measured 16 Aug (experiments/imagine-import/tamper.mjs): editing one
    // artifact's metadata after sealing left the chain verifying, because
    // the chain covered the trace and the artifacts sat alongside it. The
    // claim below said "these artifacts and this trace"; the mechanism
    // covered only the trace. Digesting the artifacts into the sealed
    // event's payload makes the sentence true — the digest is now chain-
    // protected, so altering an artifact breaks verification.
    const artifactsDigest = `sha256:${createHash("sha256")
      .update(canonicalJson(authored))
      .digest("hex")}`;
    const bundle = {
      mode: "imagine",
      sealedAt: new Date().toISOString(),
      session: ledger.summary,
      publicKeyPem: ledger.publicKeyPem,
      claim: {
        asserts: "These artifacts and this trace came from one imagine session, unaltered since sealing.",
        does_not_assert:
          "Anything about who ran the session, whether the artifacts are sound, or whether their declared lanes are true. The signing key is ephemeral and travels inside the bundle; ground it to find out.",
      },
      authoredCount: authored.length,
      artifactsDigest,
      artifacts: authored,
      trace: ledger.read(),
    };
    const sealEvent = ledger.append("imagine.session.sealed", {
      authoredCount: authored.length,
      traceEntries: bundle.trace.length,
      artifactsDigest,
      // The seal declares its own position as the total, so a bundle cut
      // here reads "40 of 40 at the seal" rather than "unterminated". A
      // session that is later killed still writes a closing event with a
      // higher total; the two do not conflict, they date-stamp different
      // moments.
      total: ledger.summary.entries + 1,
    });
    bundle.seal = { eventId: sealEvent.event_id, checksum: sealEvent.checksum, artifactsDigest };
    // Check the claim before making it. A bundle that fails its own chain
    // walk should not be written — otherwise the contamination surfaces
    // later, in a different tool, as "verification failed" rather than as
    // "this session's ledger is not this session's alone".
    const selfCheck = ledger.verify();
    if (!selfCheck.ok) {
      return res.status(500).json({
        error: "refusing to seal: this session's own ledger does not verify",
        detail: selfCheck,
        meaning:
          "The trace contains events this session did not write, or wrote under another key. Nothing was sealed.",
      });
    }
    // Re-read so the bundle's trace ENDS with the seal event. Without this
    // the digest that protects the artifacts is not in the chain the
    // importer walks, and the protection is decorative.
    bundle.trace = ledger.read();
    // Say how much of the session this is. A bundle sealed mid-session is
    // legitimate and common — the seal endpoint is reachable at any time —
    // so "unterminated" is a description, not an accusation.
    Object.assign(bundle, completenessOf(bundle.trace));
    const out = join(sessionDir, `bundle-${Date.now()}.json`);
    writeFileSync(out, JSON.stringify(bundle, null, 2));
    res.json({ mode: "imagine", sealed: out, authoredCount: authored.length, traceEntries: bundle.trace.length, seal: bundle.seal });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

const services = [];

/**
 * Where a service's bundle is.
 *
 * `./services/<id>.mjs` first, and only then the old `../../<id>/` path.
 *
 * The old path is why this spike could not leave the machine it was built on:
 * it resolves inside a symbia-stack checkout and nowhere else, so the extracted
 * repository could be read and not run. Preferring a directory the sidecar owns
 * makes the bundles an INPUT — something dropped in a folder — rather than a
 * live dependency on somebody else's source tree.
 *
 * The fallback stays because removing it would change what this host does today
 * for no measurement. It is a compatibility path, not the design.
 *
 * Bundles keep their third-party imports external, so a bundle only works where
 * Node can resolve those upward from it. `./services/` sits beside this file's
 * own package.json, which declares the union of what the ten bundles import —
 * measured, not guessed: with the bundles copied here and nothing else changed,
 * 8 of 10 failed to resolve. `directory` and `models` survived by accident of
 * which packages happen to sit in the workspace root.
 */
// TWO LAYOUTS, ONE RESOLVER.
//
// In the repository this file sits beside ./services/. Packaged as a plugin it
// sits in sidecar/ with services/ as a SIBLING, because the bundles are not the
// sidecar's source and putting them under it would say they were. Checking both
// is three lines; discovering the mismatch at boot in somebody else's install
// is a bug report with no useful information in it.
function servicesDir() {
  for (const c of [join(here, "services"), join(here, "..", "services")]) {
    if (existsSync(c)) return c;
  }
  return join(here, "services");
}

function bundlePath(id) {
  const owned = join(servicesDir(), `${id}.mjs`);
  if (existsSync(owned)) return owned;
  return join(here, "..", "..", id, ".standalone-routes.mjs");
}

async function mount(id, spec, attach) {
  const sub = express();
  sub.use(express.json({ limit: "10mb" }));
  try {
    const mod = await import(spec);
    // A service's own middleware, when it declares any. Without it the
    // routes are reachable and wrong — catalog returned 403 on every write
    // because req.user was never populated (measured 15 Aug).
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
    mounted.push({ id, ok: false, error: detail });
    app.use(`/svc/${id}`, (_q, res) =>
      res.status(503).json({ error: `service '${id}' did not mount`, detail })
    );
    log(`FAILED /svc/${id}: ${detail}`);
  }
}

// 3. Listen FIRST, then point peers here, THEN mount.
//
// Order is load-bearing and cost a run to learn: services read their
// peers' URLs from config at IMPORT time, so mounting before the port was
// known left catalog calling identity on the default port with nothing
// behind it. Every authenticated write then failed 403 — the token was
// valid and the verifier was talking to no one.
const port = await new Promise((resolve) => {
  // Ephemeral by default. In HOST mode a fixed port is used so a shim can
  // find the stack again after the host restarts — an ephemeral port would
  // move on every restart, which is the thing this split exists to avoid.
  const wanted = process.env.IMAGINE_HOST_MODE ? Number(process.env.IMAGINE_HOST_PORT || 7717) : 0;
  httpServer.listen(wanted, "127.0.0.1", () => resolve(httpServer.address().port));
});
const BASE = `http://127.0.0.1:${port}`;
// Before any service is mounted, so no service can make a call that predates
// the patch. Order is load-bearing here for the same reason the listen-then-
// mount order is: services read and call at import time.
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
  ["RUNTIME_SERVICE_URL", "runtime"],
]) {
  process.env[k] = `${BASE}/svc/${id}`;
}

// Bundles, because `@shared/*` resolves per service — see RESULTS.md.
//
// Six of eleven services are mountable. The other five —  assistants,
// messaging, runtime, network, service-admin — build their routes inline
// inside index.ts and export nothing, so there is no module to import.
// Counted rather than glossed: that ratio IS the PS4 finding.
const identityMod = await mount("identity", bundlePath("identity"));
const catalogMod = await mount("catalog", bundlePath("catalog"));
await mount("integrations", bundlePath("integrations"));
await mount("models", bundlePath("models"));
await mount("logging", bundlePath("logging"));
// directory exported `createRouter()` and left the prefix to the caller, so
// this host mounted it at the root while the stack mounted it at /api. It
// exports registerRoutes now and the adapter is gone (16 Aug).
await mount("directory", bundlePath("directory"));
// Extracted from their index.ts on 15 Aug so they could be imported at all.
await mount("network", bundlePath("network"));
await mount("messaging", bundlePath("messaging"));
await mount("runtime", bundlePath("runtime"));
await mount("assistants", bundlePath("assistants"));

// --- seed, through the API only --------------------------------------------
// The principal is the one identity's own bootstrap creates. Registering a
// second user gave a member with no capabilities: writes came back 403
// "You don't have permission to create resources" (measured 15 Aug). In
// imagine mode the operator owns the sandbox outright — and the mode is
// stated in every response, so nobody mistakes that for a grounded grant.
const IMAGINE_EMAIL = process.env.SYMBIA_EMAIL || "dev@example.com";
const IMAGINE_PASSWORD = process.env.SYMBIA_PASSWORD || "password123";

async function seed() {
  // Bootstrap FIRST: the system org must exist before any membership can
  // reference it. Called on the service's own module, so it writes to the
  // same pg-mem the routes read (measured — a second bundle would not).
  try {
    await identityMod?.bootstrap?.();
    log("identity bootstrap: ok");
    // The assistants service needs to know which org to publish rules to.
    // Without it, assistants load and can never be triggered — see
    // publishRulesToOrg.
    // There is no /api/organizations — I guessed that path and got a 404.
    // The org travels on the principal, so ask who we are.
    try {
      const jwt = await fetch(`${BASE}/svc/identity/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: IMAGINE_EMAIL, password: IMAGINE_PASSWORD }),
      }).then((r) => (r.ok ? r.json() : null));
      const me = jwt?.token
        ? await fetch(`${BASE}/svc/identity/api/auth/me`, {
            headers: { Authorization: `Bearer ${jwt.token}` },
          }).then((r) => (r.ok ? r.json() : null))
        : null;
      const sys = ((me?.user ?? me)?.organizations ?? [])[0];
      if (sys?.id) {
        process.env.SYMBIA_SYSTEM_ORG_ID = sys.id;
        log(`system org: ${sys.id} (${sys.name})`);
      }
    } catch { /* publishRulesToOrg says so if this is missing */ }
  } catch (err) {
    log(`identity bootstrap failed: ${err.message}`);
  }

  // Catalog contents via the service's OWN bootstrap — the same call the
  // container makes. Seeding through /api/resources instead produced rows
  // the reader could not see (measured: 20 written, list_resources 0).
  try {
    await catalogMod?.bootstrap?.();
    log("catalog bootstrap: ok");
  } catch (err) {
    log(`catalog bootstrap failed: ${err.message}`);
  }

  // EVERY OTHER SERVICE THAT EXPORTS ONE, RATHER THAN A LIST TO MAINTAIN.
  //
  // identity and catalog are named above because their order matters —
  // the system org must exist before memberships reference it. The rest
  // are independent, and naming them individually is how logging came to
  // be missed: its schema lived in index.ts, so the sidecar mounted routes
  // over a database with no tables and answered every request with a 500
  // (D3, 16 Aug). A service that declares a bootstrap gets one called.
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

// --- start phase -----------------------------------------------------------
// Routes make a service reachable; loops make it work. Runtime hydrates
// catalog graphs here, assistants re-reads its roster now that the catalog
// has contents. Ordered AFTER bootstrap on purpose: a host should not have
// to know which service seeds which other one — it should be able to say
// "the stores are ready" and have each service respond.
for (const { id, mod, app: sub } of services) {
  if (typeof mod?.start !== "function") continue;
  try {
    const out = await mod.start({ app: sub });
    log(`started ${id}${out ? `: ${JSON.stringify(out)}` : ""}`);
  } catch (err) {
    log(`start FAILED ${id}: ${err instanceof Error ? err.message : err}`);
  }
}

// --- MCP over stdio ---------------------------------------------------------
// The MCP server talks HTTP to services by id; SYMBIA_BASE_URL puts it in
// one-origin mode so it addresses this process rather than a port map.
process.env.SYMBIA_BASE_URL = BASE;
process.env.SYMBIA_EMAIL = IMAGINE_EMAIL;
process.env.SYMBIA_PASSWORD = IMAGINE_PASSWORD;

// --- Takedown ---------------------------------------------------------------
//
// There was none. The process was killed and everything stopped mid-flight:
// the catalog reconcile interval, the state store's flush timer, any running
// execution — and, worse for a provenance system, the ledger simply ended
// wherever the process died. `runtime/service.ts` has exported a `stop()`
// since 15 Aug that nothing ever called.
//
// The ledger's closing event is the point. A chain proves each event follows
// the previous one; it cannot prove the last event you hold is the last one
// written. Declaring the total on the way out turns "trust this trace" into
// "23 of 87", which a reader can act on.
let shuttingDown = false;
let takedown = async (reason, code = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`takedown (${reason})`);

  for (const { id, mod } of services) {
    if (typeof mod?.stop !== "function") continue;
    try {
      await mod.stop();
      log(`stopped ${id}`);
    } catch (err) {
      // A service that cannot stop cleanly is worth saying so about; it does
      // not justify skipping the ledger close, which is the part that makes
      // the trace readable afterwards.
      log(`stop FAILED ${id}: ${err instanceof Error ? err.message : err}`);
    }
  }

  try {
    const ev = ledger.close(reason);
    if (ev) log(`ledger closed: ${ev.payload.total} events, head ${ev.checksum}`);
  } catch (err) {
    log(`ledger close FAILED: ${err instanceof Error ? err.message : err}`);
  }

  process.exit(code);
};

process.on("SIGTERM", () => void takedown("SIGTERM"));
process.on("SIGINT", () => void takedown("SIGINT"));
// The client going away is the ordinary end of an imagine session, not an
// error. Without this the common case — Claude Desktop closing — is the one
// that never writes a closing event.
if (!process.env.IMAGINE_HOST_MODE) {
  // Only a shim has a client on stdin. A host is nobody's child.
  process.stdin.on("close", () => void takedown("stdin closed"));
  process.stdin.on("end", () => void takedown("stdin ended"));
}

ready = true;
// Everything a service registers before this instant is furniture: the
// runtime's 16 component manifests, the seed, the network entries. Anything
// a service registers AFTER it was caused by a client request, because the
// client is the only thing that acts once boot is done.
const bootCompletedAt = new Date().toISOString();
globalThis.__imagineBootCompletedAt = bootCompletedAt;

if (process.env.IMAGINE_HOST_MODE) {
  // HOST MODE. No MCP here — a shim owns that, in the process Claude
  // Desktop spawned. Publish the address and stay up.
  const { ADDRESS_FILE, clearAddress, writeAddress } = await import("./host-address.mjs");
  writeAddress({
    base: BASE,
    pid: process.pid,
    session: ledger.summary.actor,
    startedAt: new Date().toISOString(),
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
    build: BUILD_MARKER,
  });
  // Removed on the way out so a stale file is a signal that the host died
  // badly rather than a lie about where to connect.
  const wasTakedown = takedown;
  takedown = async (reason, code = 0) => { clearAddress(); return wasTakedown(reason, code); };
  log(`host mode: stack on ${BASE}, address at ${ADDRESS_FILE}`);
  log("no MCP in this process — start a shim to attach a client");
} else {
  log("starting MCP on stdio — stdout is the protocol from here");
  await import("../../symbia-mcp-server/dist/index.js");
}
