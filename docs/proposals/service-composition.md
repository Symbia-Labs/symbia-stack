# Service composition: the service is a value, the host is a choice

Status: PAPER, with measurements, and now the STATED DIRECTION for core
(Brian, 15 Aug 2026 — "move everything over to this model for core, and
build design and deploy off it"). Written after the standalone and sidecar
spikes (`imagine/RESULTS.md`, `SIDECAR.md`) and revised the
same night once five services had actually been extracted.

## The direction, in one line

**A service becomes a value that describes itself. A host decides what to
do with it.** Containers are one host, a single process is another, and
neither is privileged. Design and deploy are then not different
architectures — they are the same services handed different things (real
Postgres, persistent identity, signatures) and enclosed differently.

The distinction worth holding: *composition* is primary, not *single
process*. Making one-process the primary host would trade away per-service
isolation, resource limits, and independent restart — which deploy mode
genuinely needs. Making the service value primary costs nothing and gives
every host the same material.

## The problem, counted

A service today is a file that *runs* rather than a thing you can *hold*.
`index.ts` builds middleware, telemetry, database wiring, routes, health,
service identity, relay and bootstrap inline, executes `server.start()`
at import time, and exports none of it. Measured 15 Aug, before the work
below started:

| shape | services | importable |
|---|---|---|
| `export registerRoutes` in `routes.ts` | identity, catalog, integrations, models, logging | yes |
| `export createRouter()` | directory | yes, adapted |
| routes inline in `index.ts` | assistants, messaging, runtime, network | **no** |
| no server source | service-admin | n/a |

Even the importable ones arrived incomplete: with six mounted,
`symbia_stack_health` reported **2 of 12 healthy**, because health comes
from `createSymbiaServer`. The standalone catalog served **0 resources**
against the container's 54, because the seed was private to `index.ts`.

## What is already done (15 Aug, measured)

- Route tables extracted for **network, messaging, runtime, assistants**;
  runtime's shared `graphExecutor`/`catalogSync` moved to `executor.ts`.
  Ten services now mount in one process.
- **`service.ts` on identity and catalog** — routes AND bootstrap in one
  exported module. This is `createService()` in miniature and it fixed two
  real failures: registration died on a memberships FK because the system
  org is created by a bootstrap only `index.ts` called, and the sidecar's
  catalog was invisible because API-seeded rows differ from bootstrapped
  ones.
- **One hard constraint learned:** whatever a host needs must ship in ONE
  entry per service. Each esbuild bundle owns its module graph, so a
  separately bundled bootstrap holds a *second* pg-mem and seeds a store
  nobody reads. This is why `createService()` must return everything, not
  a set of separately importable helpers.
- Along the way, §4 of the 12 Aug EC2 findings was closed: the catalog
  bootstrap data directory now resolves across container, source and
  bundle layouts instead of only the first.

Result: 38 resources and 14 components readable through MCP over stdio,
from ten services in a single process with no Docker and no Postgres.

## What is NOT proven — and this is the half that is left

The extraction was easy because the services were uniform. These four are
where the uniformity ends, and each is now a first-class stage rather than
a footnote:

1. **Health, readiness, telemetry, service identity.** All provided by
   `createSymbiaServer`. A composed service currently has none of them —
   the 2/12 measurement. These must move onto the service value, or every
   host reimplements them differently, which is the defect this proposal
   exists to prevent.
2. **Relay.** Untouched. Ten services in one heap still believe they dial
   a network service over the wire. Needs an in-process transport, chosen
   by the host rather than detected by the client.
3. **Sockets.** messaging and network both set up socket.io handlers. Two
   services wanting sockets on one HTTP server is a namespace question
   nobody has answered; the sidecar mounts no sockets at all today.
4. **Per-service middleware.** Auth differs per service and lives in the
   `createSymbiaServer` config. The sidecar mounts almost none of it, so
   its services are less protected than their container equivalents —
   fine in imagine, unacceptable anywhere else.

Plus one that is independent but blocks tidiness: **`@shared/*` collides**
across catalog, identity and integrations, forcing the per-service bundle
step. Renaming to unique aliases or real package names deletes the
bundling entirely.

## The shape

```ts
// <service>/server/src/service.ts
export function createService(opts?: ServiceOptions): SymbiaService {
  return {
    id: ServiceId.CATALOG,
    middleware: [...],
    registerRoutes,
    health: { checks: [...] },
    sockets: (io) => { ... },          // stage 3
    database: { schema, migrations },
    bootstrap: async () => { ... },
    relay: { capabilities: [...] },    // transport supplied by the host
    shutdown: async () => { ... },
  };
}
```

Two hosts, equal:

- **Container entrypoint** — `createSymbiaServer(createService()).start()`.
  Behaviour identical to today; a move, not a redesign.
- **Composition root** — mounts many under `/svc/<id>`, calls `bootstrap()`,
  wires an in-process relay, and can run headless (the imagine sidecar).

## Stages

**S1 — the type.** `SymbiaService` and `ServiceOptions` in `@symbia/http`,
plus an overload of `createSymbiaServer` accepting it. No service moves.
Exit: `npm run check` clean.

**S2 — settle the shape on catalog.** Already half done (`service.ts`
exists with routes + bootstrap). Extend it to middleware, health and
database; make `index.ts` the three-line host. Exit: container behaviour
unchanged (38 resources on a fresh volume) AND the sidecar identical.

**S3 — health, telemetry and identity onto the value.** The 2/12
measurement becomes 10/10 in the sidecar and unchanged in containers.
This is the stage that makes a composed service a real service.

**S4 — the remaining nine services** adopt `createService()`. Mechanical
once S2 and S3 have settled the shape. `verify-assistants.mts` is the
evidence for assistants; each service re-measured against its container.

**S5 — relay in one process.** Host supplies the transport: loopback
in-process for the sidecar, wire for containers. The client must not
detect its own co-location.

**S6 — sockets.** Namespace per service on the shared server, or a
host-provided socket factory. Decide with messaging and network side by
side.

**S7 — delete the bundle step.** Rename `@shared/*` per service; the
composition root imports sources directly and `01-bundle-routes.sh` goes
away.

**S8 — hosts become thin, and modes become real.** imagine = composition
root, in-mem, ephemeral keys. design = composition root or containers,
grounded Postgres, persistent identity. deploy = containers, signed
composition, digest-pinned weights. Same services throughout; the mode is
what the host supplies and what the gates check
(`docs/proposals/operating-modes.md`).

## Risks

- **Eleven services, one pattern.** Broad and mechanical, but a
  half-migrated tree with two conventions is worse than one convention
  chosen badly. S1–S3 settle the shape before S4 starts.
- **Import-time side effects.** Several services do real work at module
  load (registry population, provider registration, seeding). Moving that
  into `createService()` changes *when* it happens; expect one boot-order
  bug per service and budget for it.
- **The easy half is done.** Route extraction took an hour; health,
  relay, sockets and middleware are the parts where services differ, and
  they are the parts that make a composed service trustworthy rather than
  merely reachable.
- **Container behaviour must not change.** Every stage carries a
  before/after measurement on a running stack, not an argument.

## Decisions before S1

1. Does `createService()` take injected options, or read `process.env` as
   services do today? (Options are testable; env is a smaller diff.)
2. Does the host own the relay transport (recommended) or does the relay
   client detect co-location?
3. Does the sidecar move out of `experiments/` into a real workspace
   (`symbia-imagine`) at S8, or earlier? It stops being an experiment the
   moment anyone configures Claude Desktop to spawn it.
