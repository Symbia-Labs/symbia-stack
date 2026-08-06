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
