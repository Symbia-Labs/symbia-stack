# Platform defects — found by building Symbia Energy through the API alone

*Moved here from `energy/API-MEASUREMENTS.md` on 8 Aug 2026, when the energy app
was removed from the tree. The app was the instrument; this is the reading. The
app itself is recoverable from git history. Defect ids D1–D10 are cited by
comments in `runtime/server/src/catalog/client.ts` and
`logging/server/src/auth.ts`, which is why the ledger outlives what produced it.*

**The rule, Brian's, 5 August 2026:**

> If I cannot build a piece of this through the Symbia API alone, that is a
> platform defect to be logged, not a reason to reach outside.

This file is the primary deliverable. The energy app is the forcing function;
this list is what it produces. Append-only — a defect that gets fixed is marked
resolved with the commit, never deleted, because the record of what the
platform could not do is the record of what it claimed and hadn't built.

**Why this exists at all.** On 5 Aug an entire energy application — a new
service on :5010, a new external MQTT ingress, a 227-point data model, and a
new UI surface — was stood up inside Symbia with **zero registration, zero
gates and zero ledger entries**, by writing files and hand-editing a proxy map.
A platform whose central claim is that no capability enters without a recorded
gate offered no resistance at any point. That is the same defect as the
dashboard reporting 8/8 healthy without checking, and the Save button reporting
success without persisting, raised to the architectural layer: **a property
claimed with no mechanism to enforce it.**

---

## Measured, 5 August 2026 ~21:20

Every row was produced by calling the API and recording the response. Nothing
here is anticipated.

| id | attempt | result | what it means |
|---|---|---|---|
| **D1** | `POST :5006/api/components` — register a component | **404** | There is **no registration API at all**. The 9 components are compiled into the bundle. A component cannot enter the system at runtime, so the "uplift-gated capability" model has no entry point to gate. |
| **D2** | `POST :5003/api/resources` with `type: "point"` | **`You don't have permission to create resources`** | Two defects in one response. Catalog has no `point` type — its enum is `graph \| context \| assistant \| integration` — **and** it refused before it ever got to type validation. |
| **D2b** | same, with the allowed `type: "context"` | **403** | Confirms the refusal is authorization, not schema. **Writes to catalog are blocked even though logins are disabled**, so there is no path — authenticated or not — to register anything. |
| **D3** | `POST :5006/api/graphs` — load a graph | **400** | Reachable, unlike the others. The payload was minimal so 400 may be legitimate validation; **needs a valid GraphDefinition before this is called a defect.** Logged as *unconfirmed*. |
| **D4** | `POST :5007/api/integrations` — declare an MQTT ingress | **`Cannot POST /api/integrations`** | No route. Integrations can be *read* (13 exist, 486 MCP tools) but **not created through the API**. An external ingress cannot be declared, so it cannot be gated. |
| **D5** | `GET /api/services` on catalog and network | *(pending — cut short)* | Needed to answer whether the proxy route table could be *derived* from a registry instead of hand-maintained. Unresolved. |

### The pattern in one line

**Symbia is currently a read-only platform.** Every surface serves its
inventory and none of them accepts one. That is precisely why the ungoverned
path was not merely easier — it was the *only* path, and the platform's silence
about that fact is the defect underneath all five.

---

## Consequences to reverse

Built outside the API on 5 Aug and to be torn down or re-registered once D1–D4
are addressed:

1. `energy/service/server.py` on **:5010** — unregistered service.
2. `symbia-control-center/vite.config.ts` — hand-added `energy: 5010` route.
   The route table should be derived from a service registry (D5).
3. `energy/model/site.json` — 227 points in a file, not catalog resources (D2).
4. MQTT ingress hardcoded as constants in `server.py` (D4).
5. `energy/service/derive.py` — refusal semantics as Python functions rather
   than registered components with real ports (D1). **The strongest
   architectural claim in the product — that `incomplete` has no edge to a
   value — is currently enforced by a function that could be deleted.**
6. `EnergyPanel.tsx` renders values whose provenance envelopes the platform
   never validated. Honest by my convention alone.

## What legitimately stays outside

The **simulator** (`energy/sim/`). It models an external site publishing MQTT.
A real data center is not a Symbia component and should not be one. It is on
the correct side of the boundary.

---

## Open questions for Brian

1. **Enforcement first, or rebuild first?** If the ungoverned path stays open,
   rebuilding correctly prevents nothing — the next person, or the next me,
   takes the same shortcut. Recommendation: build the registration requirement
   first so the constraint is real, then rebuild energy underneath it and let
   it fail loudly wherever the API falls short.
2. **D2b's 403 is the blocker.** Logins are disabled and catalog still refuses
   writes. Until that is resolved nothing can be registered by any means, so it
   is the first fix regardless of the answer to (1).

---

## Update — 5 Aug 2026, evening (runtime roadmap Phase 0)

Work begun against the roadmap in `runtime/docs/architecture.md`. Findings and
changes, append-only:

- **D2b re-characterised (not the defect it looked like).** Catalog is **not**
  write-refusing by design. `authMiddleware` already grants `cap:registry.write`
  / `cap:registry.publish` to service-to-service callers via the `X-Service-Auth`
  header and to local API keys. The 5 Aug `403` came from a plain, unauthenticated
  `POST` — the capability gate was working, there was just no principal behind the
  request. The real weakness was that the service gate trusted a **plaintext
  header** (`X-Service-Auth: internal`), which any in-network caller could spoof.
  *Change:* the header is now checked against `CATALOG_INTERNAL_SERVICE_TOKEN`
  when that secret is set (real credential); it falls back to `internal` only for
  local dev. The gate is now enforceable in deployment. *Partially resolved —
  hardened; a signed service token from Identity is the eventual target.*

- **D2 (missing types) — `component` added, `point` deliberately deferred.**
  Catalog's resource-type enum was `context | integration | graph | assistant`.
  Added **`component`** as a first-class type with a required **manifest**
  (`ComponentManifest`: key, version, implementation kind, typed input/output
  ports, required capability) validated on create and stored under
  `metadata.manifest`. `graph` was already first-class. `point` (the 227-point
  model) is **not** added yet — whether a telemetry point is a catalog resource,
  a context, or belongs to a separate registry is an open modelling decision, not
  a silent default. *Resolved for `component`; `point` open.*

- **D1 (no component registration entry point) — entry point now exists in the
  catalog.** A component can now *enter the system* as a registered catalog
  resource carrying a validated contract (typed ports + capability). The runtime
  still executes compiled implementations; resolving a graph node's `component`
  against its catalog manifest **at load time** is Phase 1. So the gateable entry
  point exists; runtime enforcement of the contract is the next step. *Partially
  resolved — contract entry point landed; load-time resolution pending Phase 1.*

- **Ledger (the headline "zero ledger entries" defect).** Resource creation and
  publication now emit a structured `registry.ledger` event (principal, action,
  resource key/type, which gate authorised it, timestamp) to stdout, ingested by
  the Logging service. Registration is now an **auditable event**, not a silent
  write. *Resolved for create/publish; sign/certify still to instrument.*

Files touched: `catalog/shared/schema.ts`, `catalog/server/src/routes.ts`,
`catalog/server/src/auth.ts`, `catalog/server/src/openapi.ts`, `.env.example`.
Type-checked clean (`tsc --noEmit`). Not yet exercised against the live stack —
the running services must be restarted to pick up the changes, and re-running the
5 Aug probes (now with `X-Service-Auth` + a `component` payload) is the
confirmation step.

### Confirmed live — 6 Aug 2026

Phase 0 changes verified against the running stack (catalog image rebuilt and
container recreated — the services run as **production Docker images**, not
`tsx watch`, so source edits require `docker-compose build <svc> && docker-compose
up -d <svc>` to take effect; this was the reason an earlier "it hot-reloaded"
assumption was wrong). Probes against `:5003`:

- Register `type:component` with `X-Service-Auth` + valid manifest → **201**, manifest stored under `metadata.manifest`.
- Same write with no auth → **403** (gate holds; refused before validation).
- `type:component` with a broken manifest (missing `version`/`implementation`) → **400 "Invalid component manifest"** with field-level errors.
- `GET /api/resources?type=component` → **200**, lists the registered component.
- Catalog stdout emitted: `{"event":"registry.ledger","action":"register","resourceType":"component","principal":"service:internal","gate":"service",...}`.

Test resource deleted afterward (catalog left clean). D1/D2(`component`)/D2b/ledger
confirmed working end-to-end; `point` type and load-time manifest resolution in the
runtime remain open (Phase 1).

---

## Update — 6 Aug 2026, repo rationalization

Consequences 1 and 5 reversed by deletion rather than re-registration, now that
the runtime can express what they were doing.

- **Consequence 1 — `energy/service/server.py` on :5010 (unregistered service): removed.**
  Its reason to exist was that the runtime had no way to hold state, derive across
  a joined stream, or write a result anywhere. It now does: `symbia.state.join`,
  `symbia.compute.arithmetic` and `symbia.sink.metric` run the same derivation
  inside the graph, as registered components on typed ports. An out-of-band
  Python service computing platform values no longer exists to drift from the
  platform. `service/sinks.py` removed with it. *Resolved.*

- **Consequence 5 — refusal semantics as deletable Python functions: partially
  reversed.** The derivation now runs in-graph, so the claim "`incomplete` has no
  edge to a value" is enforced by graph topology rather than by a function that
  could be deleted. `derive.py` is deliberately **kept** as the testable reference
  implementation — the semantics should be assertable without a container rebuild.
  Still open: the components carry no catalog manifest, so the contract is
  enforced by the compiled implementation and not by a registered gate (Phase 1).

- **`app/pipeline.py` removed.** Superseded by `feeder.py` + `POST /api/ingress/
  {graphName}`. `feeder.py` retains one concession — `ensure_pipeline()` loads and
  executes the graph if nothing is running — which Phase 1 hydration deletes.

- **`energy/data/` archived out of the repo** (94 MB of captured `.jsonl` streams,
  regenerable from `sim/`). Archived to `~/symbia-stack-backups/`, not in git.

---

## Update — 6 Aug 2026, Phase 1 (catalog → runtime edge) confirmed live

Measured against the running stack, not anticipated.

- **D1 fully resolved.** The runtime publishes a manifest for all 16 compiled
  components to the catalog on boot (`registered 16, failed 0`, each with a
  `registry.ledger` entry, principal `service:internal`, gate `service`). A
  graph node is now resolved against the **catalog's** manifest set at load
  time, not the in-process registry.
  **Proof the gate is real, not decorative:** with `symbia.io.delay`'s manifest
  deleted from the catalog, loading a graph that uses it returns
  `Graph references components with no registered catalog manifest: b -> symbia.io.delay`
  — even though the implementation is compiled into the running bundle. The
  registry, not the code, decides what may run.

- **D3 resolved.** `POST /api/graphs` with a valid `GraphDefinition` loads
  (confirmed 200 with a two-node control graph). The 5 Aug 400 was legitimate
  validation of a minimal payload, as suspected. Logged then as *unconfirmed*;
  now closed.

- **The external load/execute concession is gone.** `energy-pipeline` is
  registered as a published catalog `graph` resource with `role: pipeline`. The
  runtime hydrates and stands it up on boot (`loaded 1 graph(s), started 1`) and
  the 30s reconcile pass picks up newly registered graphs with no restart —
  observed standing the pipeline up 30s after registration. `feeder.py` no
  longer loads or executes anything: one POST delivers 225 readings, the graph
  derives PUE 1.3453 on the canonical lane, and `energy.v2.facility_kw`,
  `energy.v2.it_kw`, `energy.v2.pue` land in Logging with real data points
  (e.g. 3498.15, labels `{site: dc1}`). 680 messages processed, 0 errors.

### New defects found while verifying Phase 1

| id | finding | evidence | status |
|---|---|---|---|
| **D6** | **Graph-written metrics are effectively write-only.** Sinks write via the runtime's telemetry client, which authenticates with the identity bootstrap secret and lands data in the **system org** (`…0001`). But the system secret is only accepted on `INGEST_PATHS`; `POST /api/metrics/query` rejects it (`401 Invalid or expired token`). A user JWT can read it, but only if the caller knows to pass `X-Org-Id: …0001` explicitly — nothing advertises that. So a graph can persist a series that the obvious read path cannot see. | Queried as user → 0 `energy.v2.*` series. Same query with explicit system org → 10 series with data. | **Open.** This is why rebuilding `EnergyPanel.tsx` against `energy.v2.*` is not just a UI job. |
| **D7** | **Duplicate metric series per runtime restart.** `ensureMetric` caches by name in-process only, and metric names are not unique per (org, service), so each restart creates a *new* `energy.v2.pue` series rather than reusing the existing one. Three now exist. Readers must union them or silently see a fraction of the data. | 3 × `energy.v2.pue`, 3 × `energy.v2.it_kw` after 3 restarts. | **Open.** |
| **D8** | **`GET /api/graphs` reports a count it does not return.** Responds `{"loadedGraphs":1,"activeExecutions":1,"graphs":[]}` — the summary says one graph is loaded and the array is empty. The same shape of defect as the dashboard reporting 8/8 healthy without checking. | Observed with the energy pipeline loaded and running. | **Open.** |
| **D9** | **Two catalog `graph` resources carry no graph.** `energy.graph.pue` and `energy.graph.ingest` are published `type: graph` resources whose metadata contains no `nodes`/`edges`. They were registered before a definition was required, so the registry asserts two graphs exist that cannot be run. Hydration now names them on every pass rather than skipping quietly. | `catalog sync error (energy.graph.pue): graph resource has no usable definition under metadata.definition` | **Open** — decide whether to populate or unregister. |

**Also corrected during this work:** the first manifest registration wrote all 16
resources under the catalog's *default private* access policy, making the
contracts unreadable to every caller that had not already authenticated as a
writer. The gate belongs on registration, not on discovery — manifests and
registered graphs now carry public-read / gated-write. A contract nobody can
read is not a contract.

**A parsing bug worth recording, because it cost a debug cycle:**
`GET /api/resources` returns a **bare array**; the MCP wrapper over the same
endpoint returns `{resources, total, has_more}`. The runtime's client assumed
the wrapper's envelope, silently parsed `[]`, concluded nothing was registered,
and every create came back `400 already exists`. Both shapes are now accepted.
The general lesson: probe the actual response shape of the surface you are
calling, not the one you saw through a different wrapper.

---

## Update — 6 Aug 2026, D6/D7 resolved and Phase 2 (gated ingress) landed

- **D6 resolved, both halves.**
  *Read symmetry:* the logging service now accepts the system bootstrap
  credential on a narrow set of telemetry read paths (`/api/metrics`,
  `/api/metrics/query`, logs, traces) with a read-only `telemetry:read`
  entitlement. A service can read back what it wrote. Confirmed: `POST
  /api/metrics/query` returns **200** where it previously returned *401 Invalid
  or expired token*, and the grant did not widen — `GET /api/data-sources` with
  the same credential still returns **401**.
  *Org attribution:* metric sinks now write through a runtime-local
  `MetricWriter` that attributes each series to the org owning the graph,
  taken from its catalog resource. `energy-pipeline` re-registered under the
  feeder's org; `energy.v2.facility_kw`, `energy.v2.it_kw` and `energy.v2.pue`
  are now returned by a **plain** authenticated query with no `X-Org-Id`
  gymnastics (3498.15, 2600.35, 1.3452612). A graph with no owning org logs a
  warning and falls back to the system org rather than doing so silently.

- **D7 resolved.** The writer resolves an existing series by (org, service,
  name) before creating one. Confirmed across a runtime restart: one series per
  metric name, not one per restart.

- **A related defect fixed while here:** the metric sink previously reported
  success whichever way the write went, because the shared telemetry client
  swallows errors after retries and returns null. The sink now routes a failed
  write to its `error` port — *"metric write path is failing; X was not
  persisted"*. A sink that reports success while the write path is broken is
  the same defect as a Save button that persists nothing.

- **D4 resolved — Phase 2.** A graph's `metadata.ingress` is registered on
  hydration as a catalog `integration` resource (`ingress/<graphName>`)
  recording endpoint, node/port, required capability, and the authorization
  rule in plain text. Delivery is gated: super admin, or the capability the
  ingress declares, or membership of the org that owns the graph. **A graph
  with neither an owning org nor a declared capability is an undeclared surface
  and is refused.**

  Measured, in this order:

  | step | result |
  |---|---|
  | Feeder delivers while `energy-pipeline` has no owning org | **403** — *"this graph declares no owning org and no ingress capability, so delivery cannot be authorised"* |
  | Re-register under the feeder's org; reconcile reloads it | delivery succeeds, 225 readings, PUE 1.3453 canonical |
  | A newly registered authenticated user in another org delivers | **403** — *"caller is not a member of the org that owns this graph"*, pointing at `catalog resource ingress/energy-pipeline` |

  Note what step 1 means: the previously working feeder was **broken by design**
  when the gate turned on, and stayed broken until the graph was given a real
  owner. That is the gate being load-bearing rather than decorative.

**Still open after this pass:** D8 (`GET /api/graphs` reports `loadedGraphs: 1`
alongside `graphs: []`), D9 (`energy.graph.pue` / `energy.graph.ingest` are
published `graph` resources containing no graph), consequence 3 (the 227-point
model is a file, not catalog resources — the `point` type decision), consequence
6 (`EnergyPanel.tsx`, now rebuildable against `energy.v2.*` since those series
are readable in a real org), and Phase 3 durability: executions are still
in-memory, so a restart drops running pipelines even though the graphs rehydrate.

---

## Update — 6 Aug 2026, D8/D9 closed and Phase 3 (durable executions) landed

- **D8 resolved.** `GET /api/graphs` returned `{"loadedGraphs":1, ..., "graphs":[]}`
  — a count contradicting the payload beside it — because the handler built an
  empty array under a comment reading *"In a real implementation, we'd have a
  method to list graphs."* `getAllGraphs()` had existed since Phase 1; the
  endpoint never called it. It now returns the graphs it counts, with org,
  role and ingress.

- **D9 resolved.** `energy.graph.pue` and `energy.graph.ingest` were published
  `graph` resources with **empty metadata** — the registry asserting two graphs
  exist that contain no graph. Both filled in place from their real definitions
  (`energy-pue`, 6 nodes; `energy-ingest`, 4 nodes) under the owning org, ids
  preserved. The runtime now hydrates 3 graphs instead of 1.

- **Phase 3 — durable executions.** The defect here was structural rather than
  a missing feature: operator state was held in a process `Map` keyed by
  **execution id**, and execution ids are minted fresh on every start. State
  could not survive a restart *even in principle* — a rehydrated pipeline would
  look under a key that had never existed. Persisting that structure would have
  persisted rows nothing could ever read.

  State is now keyed by (graph catalog key, node id) and stored in the runtime's
  own Postgres database. Measured, with a negative control:

  | | hops | result |
  |---|---|---|
  | Restart, deliver **one** point of the two-way join | 11 | PUE **1.9997308** = exactly `5200.00 / 2600.35` — `it_kw` came from restored state. Log: `restored 2 operator state entries` |
  | Wipe `operator_state`, restart, identical payload | 3 | `join:pending`, no PUE, no restore line |

  The second row is what makes the first meaningful.

  **Stated limits, not glossed:** writes are flushed asynchronously (default 2s),
  so an unclean crash can lose up to one interval of operator state; SIGTERM
  flushes, so planned restarts lose nothing. Executions themselves are still
  re-created by catalog hydration rather than resumed by id — what survives is
  the accumulated *work*, not the execution record's continuity.

### New defect

| id | finding | evidence | status |
|---|---|---|---|
| **D10** | **New service schemas never reach an existing dev install.** `docker-compose.override.yml` replaces the whole `db-bootstrap` step with `echo "Skipping bootstrap - tables already exist"`. The check is not "are *these* tables present" but "has bootstrap ever run", so adding a table to any service is silently a no-op locally — the service then starts and fails at first query. The runtime schema had to be applied by hand with `psql`. | `docker-compose up db-bootstrap` → `Skipping bootstrap - tables already exist`, with `runtime` DB present but empty. | **Open** — the real `bootstrap.sh` is already idempotent (`CREATE TABLE IF NOT EXISTS`), so the override could simply run it instead of stubbing it. |

---

## Update — 6 Aug 2026, D10 resolved and a generality audit

- **D10 resolved.** `docker-compose.override.yml` replaced the whole
  `db-bootstrap` step with an echo. Services no longer *wait* on bootstrap
  (which is what made restarts fast), but bootstrap itself now runs — it was
  already idempotent, so skipping it bought nothing the `depends_on` removals
  did not already buy. Verified by dropping `graph_executions` and re-running:
  the table was recreated and `operator_state`'s existing rows were untouched.

### The bigger finding: the platform had started to grow the shape of its test case

`energy/` is a **forcing function, not the product**. A single exercising
application creates a standing risk that nobody notices, because the only thing
running on the platform is the thing the platform grew around. That had already
begun:

| leak | where | why it matters |
|---|---|---|
| `symbia.state.join`'s published manifest documented `config.select` as `{"facility_kw": "dc1.elec.utility.main.kw"}` | the **catalog contract every consumer reads** | a general-purpose stream operator describing itself in data-centre electrical vocabulary |
| `symbia.state.latest`, `.join`, `.rollup` defaulted `config.keyField` to `"point"` | component defaults | a term from telemetry historians, inherited by every graph in every other domain |

Both fixed. The default is now `"key"`; `energy-pipeline` declares
`"keyField": "point"` **explicitly**, because a domain's vocabulary belongs to
the application, not the engine. Component contracts bumped to 1.2.0 and
re-published. Audited: **zero** domain-specific vocabulary remains across all 16
published manifests.

A second worked example was added in an unrelated domain
([`examples/order-margin/order-margin.graph.json`](../examples/order-margin/order-margin.graph.json),
commerce) which runs the identical path — registration → hydration → gated
ingress → durable state → metric sink — and uses the **default** `keyField`
with no domain configuration at all. Delivered `{revenue: 1000, cost: 420}`,
derived margin **0.58** on the canonical lane, 12 hops.

**An unplanned demonstration.** Changing the default broke `energy-pipeline`
(PUE went `null`) until it was re-registered — because the runtime hydrates from
the **catalog**, not from the file on disk. Editing `energy-pipeline.graph.json`
changed nothing at all until `register-graph.mjs` published it. That is Phase 1
working exactly as intended, observed by accident rather than by design.

---

## Update — 6 Aug 2026, the app model's first real use

`app` is now a catalog resource type with a validated manifest, registered
through the same gated, ledgered write as everything else. Three apps declared:
`apps/control-center`, `apps/energy` (a retrofit — it predates the model),
`apps/order-margin`.

Both gates confirmed against the live stack:

- unauthenticated `POST /api/resources` with `type: app` → **403**
- a manifest requesting `privilege.crossAppRead` with no `reason` → **400
  `privilege.reason is required when requesting crossAppRead or crossOrgRead`**

The second is deliberate. An operator console legitimately needs to read across
every app and org, which makes it the least isolated app there is. That
exception is now declared in the registry with a written justification rather
than assumed by virtue of being platform tooling — a privilege granted without
a stated reason is exactly the kind of exception that is invisible six months
later.

### Consequence 2 resolved — the hand-maintained route table (D5)

`symbia-control-center/vite.config.ts` held a hand-maintained map of service →
port, duplicating `@symbia/sys`, which the control center already depends on.
It is now derived from that registry. The duplicate had drifted in **both**
directions, which is the argument against hand-maintained registries in one
observation:

| drift | detail |
|---|---|
| stale entry | `energy: 5010` survived the deletion of that service on 6 Aug, pointing at nothing. Its comment noted the cross-origin problem it was working around "has now cost this project three separate debugging sessions" |
| missing entry | `models` (:5008) had never been added at all, so the console could not reach it |

Note what the app model removes rather than routes around: **apps no longer get
their own ports.** `energy: 5010` only existed because energy was, at that time,
an unregistered service. An app's delivery surface is a declared ingress on the
runtime, gated per Phase 2. So the route table is exactly the platform's
services and nothing else — which is why D5 largely dissolves instead of needing
a discovery mechanism built.

**Also measured, and not usable:** the Network service mesh was the obvious
candidate source for a route table. It is not one today — only **3 of 9**
services are registered in it (network, models, integrations; the rest fail with
`[Relay] Connection error: xhr poll error`), and the endpoints it reports are
`http://0.0.0.0:{port}` — container-internal addresses no browser can reach.
Logged rather than worked around.

### New defect

| id | finding | evidence | status |
|---|---|---|---|
| **D11** | **Three copies of the catalog's resource-type list, all different.** `catalog/shared/schema.ts` is the authority. `@symbia/catalog-client` kept a second copy that never learned about `component` (added 5 Aug) or `app` (6 Aug), so every consumer of that library saw a catalog with two fewer types than it has. `symbia-control-center/src/types/catalog.ts` keeps a third, which also lacked both — while its own `ResourceEditor` switches on an `executor` type the catalog has **never** defined. | `tsc` in the control center: `Type '"component"' is not comparable to type 'ResourceType'`, and the same for `"executor"`. | **Partially resolved** — both copies updated by hand. The real fix is for consumers to take the type from the client library and the library to track the catalog; the phantom `executor` branch remains. |

**Also noted, not fixed:** the control center does not typecheck — 50
pre-existing `tsc` errors, four of which were D11. `npm run build` runs
`tsc && vite build`, so the build has been failing on type errors; `vite build`
alone succeeds. And the control center is a **nested git repository** with one
commit and no remote, gitignored by the parent — so it has not been under shared
version control at all.

---

## Update — 6 Aug 2026, the app model made load-bearing

The three app manifests registered earlier today were **decorative**. They
declared `provides`, `requires` and `privilege`, and nothing checked any of it —
the same defect the ledger keeps recording, reproduced by the very work meant to
fix it. Measured before doing anything about it:

```
Apps registered: 3
apps/order-margin  claims: 0 graph(s), 0 ingress(es)
apps/energy        claims: 0 graph(s), 0 ingress(es)
apps/control-center claims: 0 graph(s), 0 ingress(es)

REGISTERED BUT UNCLAIMED (entered outside any app):
  graph graphs/energy-pipeline, graphs/order-margin,
        energy.graph.pue, energy.graph.ingest
  ingress ingress/energy-pipeline, ingress/order-margin

declared-but-missing: 0   unclaimed: 6
```

**`requires` is now enforced at registration**, catalog-side rather than in the
registration script — a gate that lives in a helper is skipped by not using the
helper. Three refusal modes confirmed live:

| attempt | result |
|---|---|
| `symbia.does.not.exist@^1.0.0` | **409** *no component manifest registered for "symbia.does.not.exist"* |
| `symbia.state.join@^9.0.0` | **409** *registered version 1.2.0 does not satisfy ^9.0.0* |
| `requires.services: ["telepathy"]` | **409** *"telepathy" is not a service this platform provides* |

This is the mechanism for the failure that actually happened: when `keyField`'s
default changed from `"point"` to `"key"`, energy silently derived `null`
instead of a PUE. A declared, checked requirement turns that into a refusal at
the boundary instead of a wrong answer at runtime.

**Ownership is now a fact on the resource, not a claim in a manifest.** Graphs
record `metadata.app`; the runtime propagates the owning app onto the ingress it
creates, since an ingress is created by the runtime rather than by whoever
registered the graph — without that the platform would manufacture exactly the
orphans it reports. After claiming, reconciliation is clean:

```
apps/order-margin   claims: 1 graph(s), 1 ingress(es)
apps/energy         claims: 3 graph(s), 1 ingress(es)
apps/control-center claims: 0 graph(s), 0 ingress(es)
No unclaimed app-layer resources.
declared-but-missing: 0   unclaimed: 0
```

`scripts/verify-apps.mjs` checks both directions and exits non-zero on either,
so it can gate a build. The 16 builtin components are excluded as platform
substrate — the platform is not an app, so they are expected to have no owner
rather than reported as orphans forever.

### Two defects found while building the gate

| id | finding | status |
|---|---|---|
| **D12** | **`PATCH /api/resources` validated nothing.** Component manifests had been checked on create since Phase 0 and never on update, so a resource could be registered with a valid manifest and then PATCHed into an invalid one — and every `--republish` bypassed the gate entirely. A gate that can be skipped by choosing a different verb is not a gate. | **Resolved.** Confirmed: PATCHing energy with `symbia.state.join@^9.0.0` → 409; PATCHing a garbage manifest → 400; the app itself left intact. |
| **D13** | **Updates were not ledgered.** `registryLedger` fired on create and publish only, so the ledger recorded first writes rather than what the registry currently asserts. Registration was auditable while every change after it was silent. | **Resolved.** `action: "update"` entries now emitted. |

**Consequences still open:** 2 (resolved above — was `symbia-control-center/vite.config.ts` hand-added
`energy: 5010` route — now pointing at a service that no longer exists), 3
(`model/site.json`: 227 points in a file, not catalog resources — D2 `point` type
still deferred), 4 (MQTT ingress as constants), 6 (`EnergyPanel.tsx` provenance).
Note that removing the :5010 service **breaks `EnergyPanel.tsx`**, which read from
it. That break is left visible rather than patched: the panel should read the
`energy.v2.*` metrics the graph now persists to Logging, and rebuilding it that
way is the honest fix.
