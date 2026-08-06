# Runtime — Architecture & Roadmap

The Runtime (port 5006) is Symbia's dataflow executor: it runs component graphs — validate → join → derive → sink — with typed ports, topological ordering, and per-execution metrics. This document describes what exists today, the target architecture, and the plan to get there, with phases mapped to the platform defects logged in [`energy/API-MEASUREMENTS.md`](../../energy/API-MEASUREMENTS.md) (D1–D5).

## Current architecture (as of Aug 2026)

A graph is a DAG of nodes (each bound to a registered `component`) connected by typed-port edges. Execution is Kahn topological ordering; an unregistered component is refused rather than silently passed through.

**Lifecycle today is push-driven and in-memory:**

- `POST /api/graphs` — load a `GraphDefinition` (or a `RoutineDefinition`, auto-compiled to graphs via the routine compiler; JSON or YAML).
- `POST /api/graphs/{id}/execute` — start an execution.
- `POST /api/ingress/{graphName}` — external producers deliver readings into a **running** graph (routed to `metadata.ingress` `{node, port}`, defaulting to `entry/in`).
- `POST /api/executions/{id}/inject` — inject a value directly into an execution; `pause` / `resume` / `stop`; `GET /api/executions/{id}/metrics`.

State lives in `GraphExecutor` as three in-memory `Map`s — `loadedGraphs`, `executions`, `timers`. Components (`symbia.io.*`, `symbia.logic.*`, `symbia.compute.*`, `symbia.state.*`, `symbia.sink.*`, `symbia.source.*`, `symbia.transform.*`, `symbia.routine.*`) are registered in-process at boot.

**The gap in one line:** the runtime holds **no reference to the catalog**. Graphs exist only once something POSTs them, are lost on restart, and no external producer can reach a graph until an actor has first loaded *and* executed it. INTENT.md positions the Catalog as the registry (components, graphs, executors) and the Runtime as the executor — but the edge between them isn't built. That single missing edge is what forces the external `feeder.py` scaffolding (see the energy README) and sits underneath defects D1–D4.

## Target architecture

**The catalog is the source of truth; the runtime is the handler.** Graphs and component manifests are catalog resources. On boot the runtime hydrates published graphs, stands up the ones declared as pipelines/services, and continuously reconciles its loaded set against the catalog. Every component, graph, and ingress that enters does so through a gated, ledgered registration — not by writing a file. Delivery from outside collapses to a single authenticated POST to a declared ingress; the engine owns hydration, lifecycle, and dispatch.

## Roadmap

Ordered by dependency. The sequencing principle (Brian, 5 Aug): **enforcement first** — build the registration gate so the constraint is real, *then* rebuild energy underneath it and let it fail loudly wherever the API falls short. If registration stays optional, rebuilding correctly prevents nothing.

| Phase | Goal | Closes |
|---|---|---|
| 0 | Registration is real and gated | D2b, D2, D1 |
| 1 | Catalog → runtime hydration + reconciliation | D3, removes external load/execute |
| 2 | Ingress as a declared, gated surface | D4 |
| 3 | Durable executions | — |
| 4 | Registry-derived topology / governance closure | D5 |

### Phase 0 — Make registration real (critical path)

The blocker under everything is **D2b**: catalog refuses writes (403) even with logins disabled, so nothing can be registered by any means. Fix that first. Then:

- Land the catalog write path **with the gate**, not a bare route — registration must be enforced and ledgered, not decorative (this is the "property claimed with no mechanism to enforce it" defect, resolved at its root).
- Add a first-class `component` manifest resource (key, version, typed input/output ports, the capability/gate it requires) and a proper `graph` resource type (D2: catalog's type enum currently lacks these).

### Phase 1 — Hydration & reconciliation (kills the scaffolding)

- On boot, the runtime queries the catalog for published graphs; graphs tagged as pipelines/services with a declared `metadata.ingress` are auto-loaded and auto-executed. This directly removes the "someone must stand the execution up" concession — `feeder.py`'s `ensure_pipeline()` disappears, and delivery becomes a single POST to the ingress.
- Resolve each graph node's `component` against its catalog manifest at **load time** (implementations may stay compiled for now); a node referencing an unmanifested component is rejected on load, not at runtime. This defuses D1 without shipping a plugin loader on day one — the contract moves into the catalog even while the code stays in the bundle.
- A reconciliation loop converges loaded graphs to catalog state (load new/updated, unload removed), ideally driven by **Network service** events rather than polling.

### Phase 2 — Ingress as a declared, gated surface

The `POST /api/ingress/{graphName}` route already exists, but it requires a graph that is already running and isn't itself a declared, governed capability. Make a graph's `metadata.ingress` compile to an addressable, authenticated endpoint that is registered and gated like any other capability (D4: today an external ingress cannot be declared through the API, so it cannot be gated). End state: external delivery is one POST; the engine does the rest.

### Phase 3 — Durable executions

`loadedGraphs` / `executions` are in-memory `Map`s, so a restart silently drops running pipelines. Persist execution state (or make it deterministically re-hydratable from the catalog + last-known offsets) so restarts don't lose work. Execution state and per-execution metrics already exist and the energy graph already sinks to Logging; this is about making that state survive and stay queryable.

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

New defects found along the way are appended to `energy/API-MEASUREMENTS.md` (append-only; resolved items are marked with the commit, never deleted).
