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

const app = express();
const httpServer = createServer(app);
const mounted = [];

app.get("/", (_req, res) =>
  res.json({
    mode: "imagine",
    transport: "stdio-mcp",
    warning: "in-memory, unsigned, restart-lossy — not a record",
    services: mounted,
  })
);

async function mount(id, spec, attach) {
  const sub = express();
  sub.use(express.json({ limit: "10mb" }));
  try {
    const mod = await import(spec);
    if (attach) await attach(mod, sub);
    else await mod.registerRoutes(httpServer, sub);
    app.use(`/svc/${id}`, sub);
    mounted.push({ id, ok: true });
    log(`mounted /svc/${id}`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    mounted.push({ id, ok: false, error: detail });
    app.use(`/svc/${id}`, (_q, res) =>
      res.status(503).json({ error: `service '${id}' did not mount`, detail })
    );
    log(`FAILED /svc/${id}: ${detail}`);
  }
}

// Bundles, because `@shared/*` resolves per service — see RESULTS.md.
//
// Six of eleven services are mountable. The other five —  assistants,
// messaging, runtime, network, service-admin — build their routes inline
// inside index.ts and export nothing, so there is no module to import.
// Counted rather than glossed: that ratio IS the PS4 finding.
await mount("identity", "../../identity/.standalone-routes.mjs");
await mount("catalog", "../../catalog/.standalone-routes.mjs");
await mount("integrations", "../../integrations/.standalone-routes.mjs");
await mount("models", "../../models/.standalone-routes.mjs");
await mount("logging", "../../logging/.standalone-routes.mjs");
// directory exports `createRouter()` rather than `registerRoutes` — a
// third shape for the same job, adapted here instead of being argued with.
await mount("directory", "../../directory/.standalone-routes.mjs", (mod, sub) =>
  sub.use(mod.createRouter())
);

// 3. Listen on an ephemeral port — internal plumbing, not a product surface.
const port = await new Promise((resolve) => {
  httpServer.listen(0, "127.0.0.1", () => resolve(httpServer.address().port));
});
const BASE = `http://127.0.0.1:${port}`;
log(`services on ${BASE} (ephemeral, loopback only)`);

// Peers point at this process. Set AFTER listen so the port is known; the
// services read these lazily, per request.
for (const [k, id] of [
  ["IDENTITY_SERVICE_URL", "identity"],
  ["CATALOG_SERVICE_URL", "catalog"],
  ["INTEGRATIONS_SERVICE_URL", "integrations"],
  ["MODELS_SERVICE_URL", "models"],
]) {
  process.env[k] = `${BASE}/svc/${id}`;
}

// --- seed, through the API only --------------------------------------------
const IMAGINE_EMAIL = "imagine@symbia.local";
const IMAGINE_PASSWORD = `imagine-${Math.random().toString(36).slice(2, 10)}`;

async function seed() {
  // A user, so the MCP server has something to authenticate as.
  try {
    const r = await fetch(`${BASE}/svc/identity/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: IMAGINE_EMAIL, password: IMAGINE_PASSWORD, name: "Imagine" }),
    });
    log(`seed user: ${r.status === 201 || r.ok ? "created" : `register said ${r.status}`}`);
  } catch (err) {
    log(`seed user failed: ${err.message}`);
  }

  // Catalog contents, from the same bootstrap files the container reads —
  // but through /api/resources, because seedFromDataFiles is private.
  const dataDir = join(repo, "catalog", "data");
  if (!existsSync(dataDir)) return log("no catalog/data — starting empty");
  let loaded = 0;
  for (const file of readdirSync(dataDir).filter((f) => f.endsWith(".json"))) {
    let rows;
    try {
      const parsed = JSON.parse(readFileSync(join(dataDir, file), "utf8"));
      rows = Array.isArray(parsed) ? parsed : parsed.resources ?? [];
    } catch {
      continue;
    }
    for (const row of rows) {
      if (!row?.key || !row?.type) continue;
      try {
        const r = await fetch(`${BASE}/svc/catalog/api/resources`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Service-Auth": "internal" },
          body: JSON.stringify({
            key: row.key,
            name: row.name ?? row.key,
            description: row.description ?? undefined,
            type: row.type,
            status: row.status ?? "published",
            tags: row.tags ?? undefined,
            metadata: row.metadata ?? undefined,
          }),
        });
        if (r.ok) loaded += 1;
      } catch { /* keep going; a partial catalog is honest, a crash is not */ }
    }
  }
  log(`seed catalog: ${loaded} resources`);
}

await seed();

// --- MCP over stdio ---------------------------------------------------------
// The MCP server talks HTTP to services by id; SYMBIA_BASE_URL puts it in
// one-origin mode so it addresses this process rather than a port map.
process.env.SYMBIA_BASE_URL = BASE;
process.env.SYMBIA_EMAIL = IMAGINE_EMAIL;
process.env.SYMBIA_PASSWORD = IMAGINE_PASSWORD;

log("starting MCP on stdio — stdout is the protocol from here");
await import("../../symbia-mcp-server/dist/index.js");
