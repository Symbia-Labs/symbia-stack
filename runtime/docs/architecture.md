# Runtime — Architecture & Roadmap

The Runtime (port 5006) is Symbia's dataflow executor: it runs component graphs — validate → join → derive → sink — with typed ports, topological ordering, and per-execution metrics. This document describes what exists today, the target architecture, and the plan to get there, with phases mapped to the platform defects logged in [`docs/API-MEASUREMENTS.md`](../../docs/API-MEASUREMENTS.md) (D1–D5).

## Current architecture (as of Aug 2026)

A graph is a DAG of nodes (each bound to a registered `component`) connected by typed-port edges. Execution is Kahn topological ordering; an unregistered component is refused rather than silently passed through.

**Lifecycle today is push-driven and in-memory:**

- `POST /api/graphs` — load a `GraphDefinition` (or a `RoutineDefinition`, auto-compiled to graphs via the routine compiler; JSON or YAML).
- `POST /api/graphs/{id}/execute` — start an execution.
- `POST /api/ingress/{graphName}` — external producers deliver readings into a **running** graph (routed to `metadata.ingress` `{node, port}`, defaulting to `entry/in`).
- `POST /api/executions/{id}/inject` — inject a value directly into an execution; `pause` / `resume` / `stop`; `GET /api/executions/{id}/metrics`.

State lives in `GraphExecutor` as three in-memory `Map`s — `loadedGraphs`, `executions`, `timers`. Components (`symbia.io.*`, `symbia.logic.*`, `symbia.compute.*`, `symbia.state.*`, `symbia.sink.*`, `symbia.source.*`, `symbia.transform.*`, `symbia.routine.*`) are registered in-process at boot.

**The gap that used to be here (closed 6 Aug 2026):** the runtime held **no reference to the catalog**. Graphs existed only once something POSTed them, were lost on restart, and no external producer could reach a graph until an actor had first loaded *and* executed it. That single missing edge forced the external `feeder.py` scaffolding and sat underneath defects D1–D4. It is now built — see Phase 1 below. Graphs are still lost on restart in the sense that execution *state* is in-memory (Phase 3), but the graphs themselves rehydrate from the catalog.

## Target architecture

**The catalog is the source of truth; the runtime is the handler.** Graphs and component manifests are catalog resources. On boot the runtime hydrates published graphs, stands up the ones declared as pipelines/services, and continuously reconciles its loaded set against the catalog. Every component, graph, and ingress that enters does so through a gated, ledgered registration — not by writing a file. Delivery from outside collapses to a single authenticated POST to a declared ingress; the engine owns hydration, lifecycle, and dispatch.

## Roadmap

Ordered by dependency. The sequencing principle (Brian, 5 Aug): **enforcement first** — build the registration gate so the constraint is real, *then* rebuild energy underneath it and let it fail loudly wherever the API falls short. If registration stays optional, rebuilding correctly prevents nothing.

| Phase | Goal | Closes | Status |
|---|---|---|---|
| 0 | Registration is real and gated | D2b, D2, D1 | **Done** (6 Aug 2026) |
| 1 | Catalog → runtime hydration + reconciliation | D3, removes external load/execute | **Done** (6 Aug 2026) |
| 2 | Ingress as a declared, gated surface | D4 | **Done** (6 Aug 2026) |
| 3 | Durable executions | — | **Done** (6 Aug 2026) |
| 4 | Registry-derived topology / governance closure | D5 | Open |

### Phase 0 — Make registration real (critical path)

The blocker under everything is **D2b**: catalog refuses writes (403) even with logins disabled, so nothing can be registered by any means. Fix that first. Then:

- Land the catalog write path **with the gate**, not a bare route — registration must be enforced and ledgered, not decorative (this is the "property claimed with no mechanism to enforce it" defect, resolved at its root).
- Add a first-class `component` manifest resource (key, version, typed input/output ports, the capability/gate it requires) and a proper `graph` resource type (D2: catalog's type enum currently lacks these).

### Phase 1 — Hydration & reconciliation (kills the scaffolding) — **implemented**

Implemented in `server/src/catalog/` (`client.ts`, `manifests.ts`, `sync.ts`), wired at boot in `index.ts`.

- **Manifest self-registration.** On boot the runtime publishes a `ComponentManifest` for every component compiled into it — key, version, `implementation: builtin`, typed ports, required capability — as a gated, ledgered catalog resource under `components/<key>`. Idempotent: existing manifests are compared field-by-field and PATCHed only on real drift. 16 manifests register on a clean boot.
- **Load-time component resolution.** `validateGraph` now resolves every node twice: against the in-process implementation registry, and against the catalog's manifest set. Both checks are at *load* time — previously an unknown component was only discovered when a message reached that node, so a graph could sit "loaded" and apparently healthy containing a node that could never run. Enforcement is `RUNTIME_MANIFEST_ENFORCEMENT` = `strict` (default) | `warn` | `off`. In strict mode, an unreachable catalog fails graph loads rather than silently falling back to trusting the in-process registry — the fallback would be the "property claimed with no mechanism" defect again.
- **Hydration and auto-standing.** The runtime queries the catalog for published `graph` resources and loads each `metadata.definition`. Those declaring `role: pipeline|service` are auto-executed, so external producers can POST to the ingress immediately. `feeder.py`'s `ensure_pipeline()` is gone; delivery is a single POST.
- **Reconciliation.** A poll (`RUNTIME_RECONCILE_INTERVAL_MS`, default 30s) converges loaded graphs on catalog state: new and updated graphs load, removed or unpublished graphs unload. Passes never overlap. **Polling is interim** — driving this off Network service events is the target, and is named here rather than left to look like the design.

**Registration is now the only way in.** `scripts/register-graph.mjs` publishes a graph definition to the catalog; nothing loads a graph by reading the filesystem.

**Deliberate asymmetry: manifests are registered at boot, not re-asserted on every reconcile.** Deleting a component's manifest therefore disables that component for graph loads until the runtime restarts. That is the point — if the runtime silently re-created any manifest an operator removed, the registry would not be authoritative and the gate would be decorative. Verified: with `symbia.io.delay`'s manifest deleted, a graph using it is refused at load with *"no registered catalog manifest"*, even though the implementation is compiled into the running bundle.

### Phase 2 — Ingress as a declared, gated surface — **implemented**

Implemented in `server/src/catalog/ingress.ts`, enforced on the delivery route in `index.ts`.

Phase 1's `POST /api/ingress/{graphName}` was merely *authenticated*: any logged-in principal could deliver into any running graph. Authentication is not authorization, and an ingress nobody declared is a surface nobody governs.

- **Declared.** When a graph hydrates, its `metadata.ingress` is registered as a catalog `integration` resource under `ingress/<graphName>`, recording the endpoint, entry node/port, required capability, and — in plain text — the authorization rule in force. The gate is legible from the registry, not only from the code that enforces it. This is what makes D4's "an external ingress cannot be declared, so it cannot be gated" false.
- **Gated.** Delivery is checked in order: super admins pass; a capability declared by the ingress must be held; the caller must belong to the org that owns the graph. A graph with **neither an owning org nor a declared capability is an undeclared surface and is refused** under strict enforcement — allowing it would restore exactly the Phase 1 behaviour this phase removes. `RUNTIME_INGRESS_ENFORCEMENT` = `strict` (default) | `warn` | `off`.

Org membership was chosen as the primary gate because it works against the identity model that actually exists. The alternative — a bespoke entitlement per ingress — would have required granting capabilities that no principal currently holds, which in practice means either inventing a grant path or defaulting the gate open.

Verified live, in this order:
1. With `energy-pipeline` owned by no org, the feeder's delivery was refused: *"this graph declares no owning org and no ingress capability, so delivery cannot be authorised"*.
2. Re-registered under the feeder's org; the reconcile pass reloaded it and delivery succeeded (225 readings, PUE 1.3453).
3. A newly created authenticated user in a different org was refused: *"caller is not a member of the org that owns this graph"*, with a pointer to `catalog resource ingress/energy-pipeline`.

### Phase 3 — Durable executions — **implemented**

Implemented in `server/src/db.ts`, `server/src/memory-schema.ts` and `server/src/executor/state-store.ts`.

**The bug underneath this was structural, not incidental.** Operator state lived in a process `Map` keyed by **execution id** — and an execution id is minted fresh every time a graph is stood up. State could therefore never survive a restart *even in principle*: a rehydrated pipeline would look under a key that had never existed. Persisting the old structure would have persisted rows nothing could ever read.

State is now keyed by **(graphKey, nodeId)** — the graph's stable catalog key and the node inside it. Two different graphs cannot collide; the same graph across restarts deliberately does, which is the whole point. Phase 1 made the *graphs* survive a restart; this makes the *work* survive.

- Runtime gets its own Postgres database (already provisioned by `db-bootstrap`; only the schema was missing) with `operator_state` and `graph_executions`, following the `@symbia/db` + pg-mem pattern the other six services use.
- Writes are cached in memory and flushed asynchronously, so the execution path stays synchronous and a slow database cannot stall message processing. **The trade: a crash can lose up to one flush interval (`RUNTIME_STATE_FLUSH_MS`, default 2s) of operator state.** SIGTERM/SIGINT flush before exit, so a planned restart loses nothing.
- Operator state deliberately outlives its execution. It is dropped only when the graph is removed or unpublished from the catalog — not on stop, and not when a graph is updated in place.
- Without `DATABASE_URL` the runtime still starts, in-memory, and says so at boot rather than implying durability it does not have.

Verified live, with a negative control:

| | hops | result |
|---|---|---|
| Restart, then deliver **one** point of the two-way join | 11 | PUE **1.9997308** — exactly `5200.00 / 2600.35`, so `it_kw` came from restored state, not the delivery. Log: `restored 2 operator state entries` |
| Wipe `operator_state`, restart, deliver the identical payload | 3 | `join:pending`, no PUE, no restore line |

The roadmap's acceptance test for this phase was "restart the runtime mid-run; the pipeline resumes without re-seeding." That is what the first row shows.

### Phase 4 — Registry-derived topology & governance closure

Resolve D5: derive the service/proxy route table from a registry instead of hand-maintaining it, so the control-center and network topology reflect what's actually registered. At this point the platform's central claim holds by mechanism: no component, graph, or ingress enters without a recorded gate.

## Scalability & distribution

The engine is designed to shard and distribute by keeping three things cleanly separated: the **plan** (what to run), the **engine** (how/where it runs), and the **data plane** (how messages and state move). If those stay separate, sharding and pluggability fall out rather than being retrofitted.

### Compile the graph, resolve the components

On load, the runtime does a real compile pass producing an immutable, **serializable `ExecutionPlan`**: resolve each node's `component` to an implementation handle, validate port types across every edge, freeze the topological (Kahn) order and adjacency/in-degree, and compile the JS expressions in `filter`/`map`/`switch` **once** into reusable, sandboxed functions. The plan is content-addressed by hash (the Network service already does hash commitment), which makes it cacheable, verifiable, and shippable — **any worker can run any plan**. Components are not "compiled"; they are *resolved* to a handle. So: compile the graph and the expressions; resolve the components.

### Two execution modes (they shard differently)

Declared in graph `metadata`:

- **One-shot (job)** — plan + input → run to completion → result. Trivially distributable via a work queue; any worker pulls a job, stateless between jobs. Scale = add workers.
- **Long-running (service/pipeline)** — has an ingress, runs indefinitely, holds state (`state.join/window/latest`); needs placement, watchdog, and checkpointing. Scale = **partition by key**: run N copies of the whole graph and route ingress by partition key (data parallelism — energy is keyed by site/point). Operator-level distribution (edges as network channels, Flink/Timely-style) is only justified if a *single partition* saturates a core; it is a deliberately deferred jump, not the default.

### Tiered execution surface (not "V8 vs in-memory")

- **Orchestration/scheduling** is I/O-bound coordination — lightweight, in-process on the event loop.
- **Untrusted expressions and code-tool components** run in isolates (`isolated-vm`) or `worker_threads`/subprocesses — never `eval` in the main process. This one boundary buys security, fault isolation, and real CPU parallelism together.
- **Trusted built-ins** (`io/state/sink`) stay in-process for speed; **integration-backed components** are out-of-process by nature. The same handle abstraction that places a component in an isolate also lets it run on another node.

### Two pluggability seams

- **`ComponentRuntime`** — per-component implementation kind, declared in the catalog manifest: `builtin` (compiled TS), `expression` (sandboxed JS), `wasm`, `integration` (call an Integrations/MCP operation — this is how "a component *is* an integration" becomes first-class and how LLM/third-party work is offloaded to the gateway), `remote-service`.
- **`ExecutionBackend`** — per-graph or per-deployment: `embedded` (today), `worker-pool` (one box, real parallelism), `distributed` (cluster + scheduler), or `delegated` (hand the plan to an external durable/dataflow engine, e.g. Temporal or Ray/Flink). The runtime becomes a thin control surface that compiles plans and dispatches to a backend — and the backend is itself a registered, swappable capability.

### Constraints that make it shardable from day one

Lock these in before any distributed backend exists, because they are cheap now and expensive to retrofit:

- Components are **pure over typed ports** — no hidden global state; state exists only in `state.*` operators.
- Operator state is **externalized to a partitioned, durable store** (Postgres/Redis/log) keyed by partition, so a shard can move, die, and rehydrate — workers are cattle.
- Every message carries an envelope `{partitionKey, offset}`; **sinks are idempotent** (energy's metric sink already is). Together these make at-least-once delivery with replay/resume safe.

### Build sequence (each step useful alone)

1. Compile step + `ExecutionPlan` + `ComponentRuntime` interface with impl kinds; sandbox expressions in isolates. Single-process — a pure refactor, highest leverage. *(Folds into Roadmap Phase 1's resolve step.)*
2. `ExecutionBackend` abstraction with `embedded` + `worker-pool` — parallelism and isolation on one machine.
3. Control plane: catalog holds desired-state (which graphs, what parallelism); a scheduler places instances/partitions on worker processes, workers heartbeat, watchdog reschedules; state externalized + partitioned. Horizontal scale-out. *(Folds into Phase 3 durability.)*
4. Only if a workload demands it: operator-level distribution, or `delegated` to an external dataflow engine via the backend interface.

## How energy exercises this

Energy is the forcing function, not a demo. Each phase is validated by re-registering a piece of the energy pipeline through the API and watching it either succeed against a real gate or fail loudly:

- Phase 0/1: the `energy-pipeline` graph and its components register in the catalog and hydrate on runtime boot — no `POST /api/graphs` from an external script.
- Phase 2: the simulator delivers to a declared, gated ingress; the device twin is the only thing left outside the platform (correctly — a real site is not a Symbia component).
- Phase 3: restart the runtime mid-run; the pipeline resumes without re-seeding.

New defects found along the way are appended to `docs/API-MEASUREMENTS.md` (append-only; resolved items are marked with the commit, never deleted).
