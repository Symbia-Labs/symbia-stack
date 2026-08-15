# Service composition: `createService()` as the unit

Status: PAPER, with the measurements that motivate it. Proposed 15 Aug
2026 after the standalone and sidecar spikes
(`experiments/standalone/RESULTS.md`, `SIDECAR.md`). Nothing here is
built. This is the refactor that makes imagine mode real and pays for
itself in three other places.

## The problem, counted

A service today is a file that *runs* rather than a thing you can *hold*.
`index.ts` builds middleware, telemetry, database wiring, routes, health,
service identity, relay and bootstrap inline, executes `server.start()`
at import time, and exports none of it. Consequences measured 15 Aug:

| shape | services | importable |
|---|---|---|
| `export registerRoutes` in `routes.ts` | identity, catalog, integrations, models, logging | yes |
| `export createRouter()` in `routes.ts` | directory | yes, adapted |
| routes inline in `index.ts` | assistants, messaging, runtime, network | **no** |
| no server source | service-admin | n/a |

Three shapes for one job. And even the importable ones arrive
incomplete: with six services mounted, `symbia_stack_health` reported
**2 of 12 healthy**, because `/health`, readiness, telemetry and service
identity come from `createSymbiaServer`. The standalone catalog served
**0 resources** against the container's 54, because
`seedFromDataFiles()` is private to `catalog/server/src/index.ts`.

Nothing is wrong with any single `index.ts`. The defect is that the
composition root is not a value.

## The shape proposed

Each service exports one function; nothing runs at import.

```ts
// <service>/server/src/service.ts
export function createService(opts?: ServiceOptions): SymbiaService {
  return {
    id: ServiceId.CATALOG,
    middleware: [...],
    registerRoutes,          // what routes.ts already exports
    health: { checks: [...] },
    database: { schema, migrations },
    bootstrap: async () => { ... },   // seedFromDataFiles lives here
    relay: { capabilities: [...] },
    shutdown: async () => { ... },
  };
}
```

Two hosts consume it, and neither is privileged:

- **`index.ts`** (the container entrypoint) becomes three lines:
  `createSymbiaServer(createService()).start()`. Behaviour identical;
  this is a move, not a redesign.
- **A composition root** (the sidecar) takes many services, mounts each
  under `/svc/<id>` in one process, and can call `bootstrap()`,
  `health`, and `relay` because they are now values it can reach.

`createSymbiaServer` keeps doing exactly what it does today — it just
receives a `SymbiaService` rather than a hand-written object literal.

## Why it pays for itself outside imagine mode

1. **Testing.** A service becomes constructible in a test process
   without listening on a port or standing up Docker. There is no
   in-process integration test in this repo today, and this is why.
2. **Health becomes real everywhere.** Health checks declared by the
   service rather than assembled at the entrypoint means the sidecar,
   the container, and any future host report the same thing.
3. **Bootstrap stops being a boot-order secret.** `runFirstTimeBootstrap`
   and the identity default-admin seed are the two places where "how
   this stack gets its initial contents" is knowledge held only by a
   file that also happens to start a server. §6.1's bootstrap-vs-gated-
   write question gets easier to answer when bootstrap is a callable.
4. **It is the ground/deploy machinery.** operating-modes.md needs the
   same artifact runnable three ways. A service you can only start as a
   container cannot be run in imagine mode by definition.

## Stages, each independently landable

**S1 — the type.** Add `SymbiaService` and `ServiceOptions` to
`@symbia/http` beside `createSymbiaServer`, plus an overload accepting
it. No service changes. Exit: `npm run check` clean, nothing else moves.

**S2 — one service end to end.** Do `catalog` first: it has the worst
of the problem (private `seedFromDataFiles`, `isBootstrapCompleted`,
`markBootstrapCompleted`, 200 lines of bootstrap in `index.ts`). Extract
to `service.ts` + `bootstrap.ts`; `index.ts` becomes the three-line host.
Exit: container behaviour unchanged (54 resources on a fresh volume,
measured against the fresh stack), AND the sidecar seeds 54 rather than
20 through `bootstrap()`.

**S3 — the four that cannot be imported at all.** assistants, messaging,
runtime, network. Same extraction, in that order — assistants first
because it is what makes the sidecar interesting to an MCP client. Each
lands with its container behaviour re-measured (assistants has
`verify-assistants.mts` as its evidence; use it).

**S4 — the remainder.** identity, integrations, models, logging,
directory (which also drops `createRouter` for the common shape).
Smaller, because their routes already separate.

**S5 — relay in one process.** `initServiceRelay` currently dials the
network service. In a single process it must short-circuit to an
in-memory transport. Decide: does the composition root provide a loopback
relay, or does the relay client detect co-location? Recommendation: the
root provides it, because "am I co-located" is not a question a client
should answer about itself.

**S6 — the sidecar becomes the product.** All eleven mounted, real
health, `bootstrap()` called per service, relay short-circuited. Then
the two open items from SIDECAR.md are the only things left:
imagine-mode auth (pg-mem rejects `POST /api/auth/register` on an
organizations/memberships FK, so there is no principal), and packaging
it as one command.

## Risks, stated

- **Eleven services, one pattern, many hands.** The refactor is
  mechanical but broad; a half-migrated tree with two conventions is
  worse than one convention badly chosen. S1 and S2 should settle the
  shape before S3 starts.
- **Import-time side effects.** Several services do real work at module
  load (registry population, provider registration). Moving that into
  `createService()` changes *when* it happens; anything depending on the
  old timing will surface as a boot-order bug. Expect one per service.
- **`@shared/*` still collides.** Independent of this proposal, three
  services map the specifier to different files, so a composition root
  needs per-service bundles regardless. Fix separately with unique
  aliases or real package names; it is a small change and it removes the
  bundle step from the sidecar entirely.
- **The measurement to hold onto:** container behaviour must not change.
  Every stage carries a before/after on the fresh stack, not an argument.

## Decisions to make before S1

1. Does `createService()` take options (config injection), or read
   `process.env` as services do today? (Options are testable; env is
   a smaller diff.)
2. Does bootstrap belong on the service object, or stay a separate
   exported function the host may call? (On the object is tidier; separate
   keeps "who is allowed to seed" visible.)
3. Is the sidecar's home `experiments/` or a real workspace
   (`symbia-imagine`)? It stops being an experiment the moment anyone
   configures Claude Desktop to spawn it.
