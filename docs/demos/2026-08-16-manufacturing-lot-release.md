# Manufacturing Lot Release Gate — Working Demo + Capability Map

**Run:** live on `imagine:session:74af65810ab01b8d`, 2026-08-16
**Graph:** `lot-release-gate` v1.0.0 — `6c4067ca-f719-4719-a88b-28903bddbaf9` (12 nodes, 11 edges)
**Execution:** `5ec4b94c-2e71-4505-95d9-ef7a7fdf7879`
**Predictions:** registered before execution, ledger-chained

---

## 1. Measured capability map

Not what the docs claim — what this host actually did when asked.

| Capability | State | Evidence |
|---|---|---|
| Runtime graphs (16 components) | **Working** | 2 graphs, 21 nodes, 0 errors |
| Catalog writes | **Partial** | 201 returned; `content` silently dropped on read-back |
| **Local model inference** | **Working, no credentials** | `tinyllama-1-1b-chat-v1-0-q4-k-m` served completions |
| Model provenance | **Working** | `digest sha256:9fecc3b3…`, `verified: true`, `availability: standby` with reason |
| Logging sinks | **Working** | `sink.log` passed through |
| Assistants — authoring & execution | **Working** | actor principal + assistant + rule set authored; rules fire, replies signed |
| Assistants — LLM leg | **Blocked, two specific bugs** | `llm.invoke` gated on a 404 health probe; `service.call` can't address `models` |
| External LLM providers | **None configured** | openai / anthropic / huggingface / symbia-labs all `configured: false` |
| Network mesh | **Empty** | 0 nodes |
| control-center, api | **Not mounted** | 404 on spec |

**The headline capability is air-gapped inference against a content-addressed model.** I predicted this would fail — `brokered: true` plus zero configured providers looked like a credential error waiting to happen. It returned a completion. For OT networks, defense, and any plant that won't let production data egress, "no internet required, and here is the sha256 of the weights that answered you" is a stronger opening than the lane system.

**Assistants are not the gap — I was wrong about that.** The bootstrapped assistants return `404 Actor principal not found`, and I first read that as the platform being unable to run assistants. It isn't. The assistants service exposes `post_actors` (create actor principal), `post_assistants_admin` (create custom assistant) and `post_rules` (create rule set). Authoring one from scratch — exactly as the graphs were authored rather than borrowed — produced a **working assistant**:

- Actor principal `assistant:lot-release-qa` — created, `isActive: true`
- Assistant `lot-release-qa` — `status: active`, `hasHandler: true`, pointed at the local model
- Rule set with a deterministic control rule and an evidence-narration rule — `version 3`, active
- Rules evaluate and fire: `rulesEvaluated: 2, rulesMatched: 1`, reply delivered in 4 ms

**The reply carries a provenance envelope the graph lanes don't have.** This is a second, richer provenance vocabulary sitting at the assistant layer:

```json
"provenance": {
  "arena": "RETRIEVED",
  "sealedOver": "content",
  "signature": "ed25519:aZZXNNewOMkn27eUhFBHpbWA+rNyJzocne42gqQWsyWyd...",
  "signedBy": "symbia:service:397a981a92654243",
  "basis": "content returned verbatim from the rule \"Delivery control\" — authored text,
            not a computed value. No step produced it because none was needed.",
  "steps": [], "rule": "Delivery control",
  "hash": "5b493a0b98b243e8a4ad780cad5d93a2dd7a6b27e30df6a385ab1aaea3976826"
}
```

Every assistant reply is ed25519-signed, sealed over its content, and carries an `arena` plus a **plain-English `basis`** explaining why it can be trusted. That is a far better artifact to put in front of an auditor than a lane token, and neither demo so far has used it.

**Rule action vocabulary** (from the running bundle, not the docs): `message.send`, `llm.invoke`, `tool.invoke`, `service.call`, `assistant.route`, `integration.invoke`, `context.update`, `state.transition`, `embedding.route`, `webhook.call`, `handoff.create`, `handoff.assign`, `handoff.resolve`, `workspace.create`, `workspace.destroy`. `handoff.*` and `assistant.route` mean human escalation and multi-assistant delegation are first-class — directly relevant to a QA workflow where an incomplete lot must reach a person.

**What actually blocks the LLM leg — two independent bugs, both narrow and fixable:**

1. **`llm.invoke` is gated behind a health probe that 404s.** The handler calls `isIntegrationsAvailable()`, which does `fetch(INTEGRATIONS_SERVICE_URL + "/health")` and returns `response.ok`. The integrations service on this host does not serve `/health` — it 404s — so the check returns false and **every** `llm.invoke` fails with "Integrations service is not available." Meanwhile `POST /v1/chat/completions` on the models service returns completions in ~200 ms. The capability works; the gatekeeper is looking at the wrong door. This is the same wrong-path health-probe convention that makes `symbia_stack_health` report 3/12.
2. **`service.call` cannot address the models service.** Its `serviceMap` contains logging, catalog, identity, messaging, runtime, network, integrations — **`models` is absent**. So the obvious workaround (call `/v1/chat/completions` directly from a rule) fails with "Unknown service: models."

Together these strand a working inference capability behind the assistant layer. Fixing either one unblocks it: add `models` to the service map, or probe a path integrations actually serves.

## 2. The scenario

One decision — *can this lot ship?* — with two independent evidence streams converging, plus a model-generated narrative.

- **Torque SPC:** spec USL 14.0 Nm, LSL 10.0 Nm, target 12.0. Window size **30**. Only **8** readings taken.
- **Supplier certificates:** four required. Three arrive; `supplier.seal` never certifies.
- **Narrative:** produced by the local model, which also identifies itself.

```
                    ┌─ spcWindow(30) ─┬─→ cpk (capability proxy)
 readings ─ router ─┤                 └─→ fillGate(count > 29) ─→ held
                    └─ cocRollup(4 suppliers, op=min)
```

## 3. What happened — and the asymmetry that matters

Both streams are incomplete. **The platform treats them completely differently.**

| Stream | State | Output | Lane |
|---|---|---|---|
| Supplier certificates | 3 of 4 · `missing: ["supplier.seal"]` | min conformance 98.7 | **`apocryphal`** |
| Torque SPC window | **8 of 30** | mean 12.05, min 11.7, max 12.4 | **`canonical`** |
| Capability index from that window | derived from 8 samples | **Cpk proxy 5.56** | **`canonical`** |

Read that middle row again. **A capability index computed from 8 of 30 required samples came out `canonical`, with a clean, fully reproducible recipe receipt:**

```json
{ "result": 5.555555555555545,
  "expression": "(14 - 12.05) / (((12.4 - 11.7) / 2) + 0.001)",
  "exact": true, "lane": "canonical",
  "receipt": { "kind": "recipe", "inputs": { "mean": 12.05, "max": 12.4, "min": 11.7 } } }
```

Cpk 5.56 is an absurdly capable process. It is also computed on a quarter of the required sample and reads as trustworthy.

**The rule this establishes:**

> **Completeness of membership is enforced. Sufficiency of sample is not.**

The rollup knows *who* was supposed to report and demotes the total when someone doesn't. The window has no concept of "enough" — it publishes `count` and expects you to check. The component's own documentation admits this: *"a window that has not filled reports over fewer values without saying so — read `count` against `size`."*

**The good news:** the platform gives you the gate. My `fillGate` filter on `count > 29` correctly routed the 8-sample window to its `fail` port every single time. It caught it — **because I wired it.** Nothing would have complained if I hadn't.

That is the honest and more useful lesson than "the platform protects you." For a plant, the design rule is: *any aggregate over a sample must be explicitly gated on sufficiency; only membership is free.*

## 4. The model leg — and where the boundary belongs

The local model was asked to make the release call. Verbatim:

> "Lot A-4471, a supplier certificate, has been received but the supplier seal is missing. The remaining 3 of 4 certificates have been received, but the required torque samples have not been received. **It is recommended to ship or hold the lot.**"

It refused to decide, and it got a fact wrong — 8 torque samples *were* received; it said none were.

I am reporting this rather than reprompting until it looks good, because it demonstrates the boundary better than a polished answer would. In the same pipeline:

- The deterministic gates produced **crisp, defensible, receipted** answers — `missing: ["supplier.seal"]`, `count: 8` against `size: 30`.
- The generative layer produced **mush that misstated the inputs**.

**The release decision must come from the gates. The model may narrate; it must not adjudicate.** A 1.1B quantized model is at the low end of capability and a larger one would read better — but "read better" is not the same as "be accountable," and no model size changes which layer is recomputable.

Provenance available for the generated text: model `tinyllama-1-1b-chat-v1-0-q4-k-m`, weights `sha256:9fecc3b3cd76bba89d504f29b616eedf7da85b96540e490ca5824d3f7d2776a0`, `verified: true`, 118 tokens. You can prove which weights produced that sentence. You cannot prove the sentence is right — and the platform does not claim to.

## 5. Predictions vs results

Registered in the catalog and ledger-chained **before** execution.

| ID | Prediction | Result |
|---|---|---|
| M1 | Unfilled window emits a lane other than `apocryphal` | **HELD** — `canonical` at 8/30 |
| M2 | Window output carries `count`, so underfill is detectable | **HELD** |
| M3 | Capability index from an unfilled window is non-apocryphal | **HELD** — `canonical`, the finding |
| M4 | Certificate rollup at 3 of 4 emits `apocryphal` | **HELD** — control passed |
| M5 | A filter on `count` can route an underfilled window away | **HELD** — `fail` port fired every time |
| Q1 | Local inference fails with no provider configured | **BROKEN — I was wrong**; it served a completion |

M4 is the control: had the rollup *not* demoted, the probe would not be reading lanes correctly and M1–M3 would be worthless. It demoted, so the `canonical` on the window is a real reading and not a blind probe.

## 6. Next vertical — Pharma GxP batch release

The same asymmetry, with a legal signature on the end of it.

**The pain:** a Qualified Person signs batch release. Under EU GMP Annex 16 that signature is a personal legal act. The batch record aggregates environmental monitoring, in-process checks, analytical results, deviations, and CoAs. Data integrity expectations (ALCOA+ — attributable, legible, contemporaneous, original, accurate, plus complete, consistent, enduring, available) make **completeness an explicit regulatory attribute**, and 21 CFR Part 11 governs the electronic record and signature.

**Why it maps cleanly:**

| GxP concept | Platform mechanic |
|---|---|
| "Complete" in ALCOA+ | `rollup.coverage` with named `missing` |
| Batch record with an open deviation | `apocryphal` until closed |
| Result computed from insufficient replicates | the window gap above — **needs an explicit gate** |
| Which analytical method version produced this result | recipe receipt |
| Which model flagged this deviation | model digest |
| QP signature over an incomplete record | a signature the system can refuse to let read as canonical |

**The demo:** a batch record assembling toward release where one environmental monitoring point never reports. The release packet computes, looks complete, and is emitted `apocryphal` naming the missing EM point — so the QP is shown what they would be signing over, before signing. Then the same record with a deviation still open, and with an analytical result computed over 2 of 3 required replicates — the case that *doesn't* self-flag and must be gated.

That last part is the honest and valuable bit: it demonstrates both what the platform catches for free and what you must design for. Which is exactly the conversation a pharma quality lead needs to have before believing any of it.

## 7. Other verticals, ranked by fit

1. **Financial services — BCBS 239.** Basel's risk data aggregation principles are literally a regulation about completeness and accuracy in aggregated risk reporting, and firms are cited for failing it repeatedly. The closest regulatory match to a mechanic already proven working.
2. **Energy / grid.** The component docs already reference an energy test case. Generation and emissions rollups where meters drop out and the total publishes anyway.
3. **ESG / Scope 3.** Famously estimated from partial supplier data and reported as a figure; assurance requirements are making the gap legally material.
4. **Clinical trials.** Endpoint aggregation with sites not reporting — same shape, very high consequence.

## 8. Defects and constraints found

1. **Catalog drops `content`** on context creation — three prediction resources created 201, all read back with no content, `/versions` empty. MAP predictions are provable only via ledger `requestDigest`.
2. **Artifact sandbox cannot reach the Symbia connector.** Every call shape — including a trivial read — returns 400 from inside a Cowork artifact, so live-calling tours aren't possible there today.
3. **`operationId` collisions ignore the `service` hint.** `get_graphs_id_` exists in catalog and runtime; `symbia_call` routes to catalog even when `service: "runtime"` is passed.
4. **Execution restart does not reset component state.** Stopping an execution and starting a new one preserved rollup state (coverage stayed 1.000). State is scoped to the graph. A second test run in the same graph is not a clean room.
5. **`symbia_stack_health` probes `/health`** where several services serve `/api/health`, understating health; `control-center` and `api` are genuinely unmounted.
6. **`llm.invoke` disabled by a wrong-path health probe** — `isIntegrationsAvailable()` checks `integrations/health`, which 404s on this host, so no assistant can ever reach an LLM even though inference works.
7. **`service.call` has no `models` entry** in its service map, blocking the direct workaround.
8. **A failed action can emit an empty message signed as faithfully retrieved.** When an action failed with `Unknown action type`, the rule's `onError` did **not** fire, the chain did **not** break, and the following `message.send` emitted `content: ""` carrying a valid ed25519 signature and `arena: "RETRIEVED"` with basis *"content returned verbatim from the rule … authored text, not a computed value."* Nothing was returned verbatim; nothing was authored. The signature is valid and the claim it seals is false. Notably a *handler* failure does break the chain correctly — only the unknown-action-type path skips the guard. This is the platform's own failure mode occurring inside its provenance layer, and it is the most important thing found in this session.
9. **`post_actors` returns a bare 500** when `orgId` doesn't reference a real org; the actual cause (a foreign-key violation on `bot_principals_org_id_fk`) is only visible in the host log.
