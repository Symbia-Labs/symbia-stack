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
 *   "symbia-imagine": { "command": "node", "args": ["<repo>/experiments/standalone/sidecar.mjs"] }
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
import { createSessionLedger } from "./session-ledger.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");

// 1. stdout belongs to MCP. Everything else goes to stderr, starting now.
const log = (...a) => console.error("[sidecar]", ...a);
console.log = console.error;
console.info = console.error;
console.debug = console.error;

// 2. imagine-mode environment, set before any service module is imported.
delete process.env.DATABASE_URL; // pg-mem; the library announces it
process.env.SYMBIA_MODE = "imagine";
process.env.NODE_ENV = process.env.NODE_ENV || "development";
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET || `imagine-${Math.random().toString(36).slice(2)}`;
process.env.MODELS_PATH = process.env.MODELS_PATH || join(repo, "experiments/standalone/.models");
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
app.use(ledger.middleware);

app.get("/", (_req, res) =>
  res.json({
    mode: "imagine",
    transport: "stdio-mcp",
    enforcement: "off — canon is checked when this is grounded, not here",
    warning: "in-memory, ephemeral keys, restart-lossy — a sketch, not a record",
    services: mounted,
    session: ledger.summary,
  })
);

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
    // Authored, not seeded: isBootstrap is the boundary between what the
    // sandbox shipped with and what this session made.
    const authored = Array.isArray(rows) ? rows.filter((r) => r.isBootstrap === false) : [];
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
      artifacts: authored,
      trace: ledger.read(),
    };
    const sealEvent = ledger.append("imagine.session.sealed", {
      authoredCount: authored.length,
      traceEntries: bundle.trace.length,
    });
    bundle.seal = { eventId: sealEvent.event_id, checksum: sealEvent.checksum };
    const out = join(sessionDir, `bundle-${Date.now()}.json`);
    writeFileSync(out, JSON.stringify(bundle, null, 2));
    res.json({ mode: "imagine", sealed: out, authoredCount: authored.length, traceEntries: bundle.trace.length, seal: bundle.seal });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

const services = [];

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
  httpServer.listen(0, "127.0.0.1", () => resolve(httpServer.address().port));
});
const BASE = `http://127.0.0.1:${port}`;
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
const identityMod = await mount("identity", "../../identity/.standalone-routes.mjs");
const catalogMod = await mount("catalog", "../../catalog/.standalone-routes.mjs");
await mount("integrations", "../../integrations/.standalone-routes.mjs");
await mount("models", "../../models/.standalone-routes.mjs");
await mount("logging", "../../logging/.standalone-routes.mjs");
// directory exported `createRouter()` and left the prefix to the caller, so
// this host mounted it at the root while the stack mounted it at /api. It
// exports registerRoutes now and the adapter is gone (16 Aug).
await mount("directory", "../../directory/.standalone-routes.mjs");
// Extracted from their index.ts on 15 Aug so they could be imported at all.
await mount("network", "../../network/.standalone-routes.mjs");
await mount("messaging", "../../messaging/.standalone-routes.mjs");
await mount("runtime", "../../runtime/.standalone-routes.mjs");
await mount("assistants", "../../assistants/.standalone-routes.mjs");

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

log("starting MCP on stdio — stdout is the protocol from here");
await import("../../symbia-mcp-server/dist/index.js");
