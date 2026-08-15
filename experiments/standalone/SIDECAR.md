# The imagine sidecar — headless, stdio MCP, one process

15 Aug 2026. Brian's direction: imagine mode is headless — no console, just
a banner — and runs as a sidecar to Claude Desktop and (later) Symbia
Desktop. Transport chosen: stdio first.

## It works

`node experiments/standalone/02-probe-mcp.mjs` spawns the sidecar exactly
as Claude Desktop would and speaks MCP to it. Measured:

    initialize: { name: 'symbia-mcp-server', version: '1.0.0' }
    tools/list: 11 tools
    symbia_stack_health -> identity healthy, catalog healthy (12ms, 7ms),
                           each at http://127.0.0.1:<ephemeral>/svc/<id>

Four services (identity, catalog, integrations, models) boot inside the
MCP server's own process, seeded through the platform API, with no
Docker, no Postgres, no configured ports, and no console.

## Claude Desktop config

    "symbia-imagine": {
      "command": "node",
      "args": ["<repo>/experiments/standalone/sidecar.mjs"]
    }

Prerequisite: `bash experiments/standalone/01-bundle-routes.sh` once (see
RESULTS.md for why bundles are the composable unit).

## Three constraints that shaped it

1. **stdout is the protocol.** Every service logs with `console.log`; one
   stray line corrupts the MCP stream. The sidecar redirects console.log,
   .info and .debug to stderr before importing any service. The probe
   client checks this actively — it prints "NON-JSON ON STDOUT" if
   anything ever leaks, and nothing did.
2. **Services are HTTP even when co-located.** They call each other by
   URL, so the sidecar still listens — on an EPHEMERAL loopback port
   (`listen(0)`) that nobody configures and nothing outside can reach.
   One origin, `/svc/<id>`.
3. **Address by id, not port.** `symbia-mcp-server` had a port map and so
   could only talk to a stack where every service owns a port — against
   CLAUDE.md's own rule. It now takes `SYMBIA_BASE_URL` and addresses
   `<base>/svc/<id>`, which is how it reaches the sidecar. Health output
   reports `endpoint` instead of `port` as a result.

## Open, and honest about it

- **No user can be created under pg-mem.** `POST /api/auth/register`
  fails with a foreign-key error between organizations and memberships —
  pg-mem's FK emulation, not the platform's logic. So the sidecar has no
  authenticated identity, and the eight MCP tools that require a bearer
  will fail; `symbia_stack_health` works because it skips auth. Imagine
  mode needs an auth story: either a seeded in-memory principal, or
  read-only tools that declare themselves unauthenticated.
- **Bootstrap is still unreachable** (PS4). The sidecar seeds 20 catalog
  resources through `/api/resources` rather than the 54 the container
  loads through `seedFromDataFiles`, because that function is private to
  `catalog/server/src/index.ts`. Extracting it is the fix for both.
- **Six services mount; five cannot, and the number is the finding.**
  Counted 15 Aug across eleven services:

  | shape | services | mountable |
  |---|---|---|
  | `export registerRoutes` in `routes.ts` | identity, catalog, integrations, models, logging | yes |
  | `export createRouter()` in `routes.ts` | directory | yes, via an adapter |
  | routes built inline in `index.ts` | assistants, messaging, runtime, network | **no** |
  | no server source | service-admin | n/a |

  Three shapes for one job, and the four that matter most for an MCP
  client — assistants above all — are in the shape that cannot be
  imported at all.

- **Mounted is not the same as complete.** `symbia_stack_health` reports
  2 of 12 healthy even with six mounted, because `/health`, readiness,
  telemetry and service identity are all provided by
  `createSymbiaServer`, which a composition root bypasses. The routes
  themselves work — catalog and models answered real requests on the
  earlier single-port run — but a service mounted this way is missing
  everything the server factory adds. That is the same PS4 gap as
  bootstrap, seen from another side: **the unit of composition should be
  the service, not its route table.**
- **Relay untouched.** Nothing calls `initServiceRelay` here. In one
  process it should short-circuit rather than dial a network service in
  the same heap.
