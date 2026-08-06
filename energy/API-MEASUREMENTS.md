# Platform defects — found by building Symbia Energy through the API alone

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

**Consequences still open:** 2 (`symbia-control-center/vite.config.ts` hand-added
`energy: 5010` route — now pointing at a service that no longer exists), 3
(`model/site.json`: 227 points in a file, not catalog resources — D2 `point` type
still deferred), 4 (MQTT ingress as constants), 6 (`EnergyPanel.tsx` provenance).
Note that removing the :5010 service **breaks `EnergyPanel.tsx`**, which read from
it. That break is left visible rather than patched: the panel should read the
`energy.v2.*` metrics the graph now persists to Logging, and rebuilding it that
way is the honest fix.
