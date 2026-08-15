/**
 * Standalone imagine-mode runtime — one process, one port, no Docker.
 *
 * Every service is mounted as a sub-app at `/svc/<id>`, which is the
 * addressing convention the console already uses (`getServiceUrl(id)`
 * returns `/svc/${id}`, always). Cross-service calls keep working because
 * each service reads its peers' base URLs from env, and those are pointed
 * at this process with the matching path prefix.
 *
 * WHAT THIS IS NOT. There is no isolation here: one crash ends everything,
 * module state is shared, the database is in memory, and identities are
 * whatever this process happens to hold. Those are imagine-mode terms
 * (docs/proposals/operating-modes.md) and the banner below says so at
 * boot. A grounded run wants containers, Postgres, and persistent keys.
 *
 * Run: node experiments/standalone/server.mjs   (after npm run build:libs)
 */
import express from "express";
import { createServer } from "node:http";

const PORT = Number(process.env.STANDALONE_PORT || 7000);
const BASE = `http://localhost:${PORT}`;

// Peers resolve to THIS process, under their path prefix. Set before any
// service module is imported, because services read config at import time.
process.env.IDENTITY_SERVICE_URL = `${BASE}/svc/identity`;
process.env.CATALOG_SERVICE_URL = `${BASE}/svc/catalog`;
process.env.INTEGRATIONS_SERVICE_URL = `${BASE}/svc/integrations`;
process.env.MODELS_SERVICE_URL = `${BASE}/svc/models`;
process.env.ASSISTANTS_SERVICE_URL = `${BASE}/svc/assistants`;
process.env.LOGGING_SERVICE_URL = `${BASE}/svc/logging`;
// No DATABASE_URL on purpose — @symbia/db falls back to pg-mem, which is
// what imagine mode means. The library already says so loudly at boot.
delete process.env.DATABASE_URL;
process.env.SYMBIA_MODE = "imagine";
process.env.MODELS_PATH = process.env.MODELS_PATH || "/tmp/standalone-models";

console.log(`
┌─────────────────────────────────────────────────────────────┐
│  SYMBIA — IMAGINE MODE (standalone)                          │
│                                                              │
│  One process, one port, in-memory database, no isolation.    │
│  Nothing here survives a restart. Nothing here is signed by  │
│  a durable identity. Do not read anything this produces as   │
│  a record — it is a sketch.                                  │
│                                                              │
│  Ground it (containers + Postgres + persistent keys) before  │
│  any of it counts.                                           │
└─────────────────────────────────────────────────────────────┘
`);

const app = express();
const httpServer = createServer(app);

app.get("/", (_req, res) => {
  res.json({
    mode: "imagine",
    warning: "in-memory, unsigned, restart-lossy — not a record",
    services: mounted.map((m) => ({ id: m.id, base: `/svc/${m.id}`, ok: m.ok, error: m.error })),
  });
});

const mounted = [];

/**
 * Mount one service's routes as a sub-app.
 *
 * Only `registerRoutes` is reachable: each service's index.ts builds its
 * middleware, telemetry, relay and bootstrap inline and exports none of
 * it (PS4). Anything a service needs from that block is missing here, and
 * that gap is the spike's main finding rather than something to paper
 * over — so failures are recorded per service and the process keeps going.
 */
async function mount(id, importer, opts = {}) {
  const sub = express();
  sub.use(express.json({ limit: "10mb" }));
  try {
    const mod = await importer();
    if (opts.middleware) {
      for (const mw of await opts.middleware()) sub.use(mw);
    }
    await mod.registerRoutes(httpServer, sub);
    app.use(`/svc/${id}`, sub);
    mounted.push({ id, ok: true });
    console.log(`[standalone] mounted /svc/${id}`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    mounted.push({ id, ok: false, error });
    // Absent is recorded as absent — a service that failed to mount must
    // not look like one that was never asked for.
    app.use(`/svc/${id}`, (_req, res) =>
      res.status(503).json({ error: `service '${id}' did not mount in this process`, detail: error })
    );
    console.error(`[standalone] FAILED /svc/${id}: ${error}`);
  }
}

await mount("identity", () => import("../../identity/server/src/routes.js"));
await mount("catalog", () => import("../../catalog/server/src/routes.js"), {
  middleware: async () => {
    const { authMiddleware } = await import("../../catalog/server/src/auth.js");
    return [authMiddleware];
  },
});
await mount("integrations", () => import("../../integrations/server/src/routes.js"));
await mount("models", () => import("../../models/server/src/routes.js"));

httpServer.listen(PORT, () => {
  const ok = mounted.filter((m) => m.ok).length;
  console.log(`[standalone] listening on ${BASE} — ${ok}/${mounted.length} services mounted`);
  console.log(`[standalone] try: curl ${BASE}/ | jq`);
});
