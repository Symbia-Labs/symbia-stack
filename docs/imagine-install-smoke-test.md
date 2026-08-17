# Symbia Imagine — Install Smoke Test

**Purpose:** gate 1/7 of the launch plan. A *measured* pass on a fresh install — every check is a real call with an expected shape, and a green build proves nothing. Run this after installing the `.plugin` into Claude Desktop, in a **fresh conversation**, by pasting: *"Load symbia imagine and run the install smoke test in imagine-install-smoke-test.md."*

**Recording:** the agent should register checks 5–12 as MAP predictions (check 4) *before* running them, then fill the results table at the bottom. The smoke test practices the discipline it tests.

**Verdicts:** each check is `PASS` / `FAIL` / `KNOWN-ISSUE` (recorded, non-blocking). Any `FAIL` on a critical check (marked ✱) blocks release.

---

## Preconditions

- Plugin installed from the built `.plugin` artifact — not a dev tree. Record the artifact filename and its SHA-256.
- Fresh Claude Desktop conversation (no prior Symbia state in context).
- Note machine, macOS version, Node version (`node --version`).

## Checks

### 1 ✱ Attach and self-test
Call `symbia_selftest`.
**PASS:** `mode: "imagine"`, `loopback.ok: true`, status 200, a session actor is present.
**FAIL means:** sidecar didn't spawn, or connector can't reach it — nothing else can be trusted; stop and capture `host.log`.
**Also record:** whether the response carries a version/build-commit stamp. Today it does not (gate 6 work item) — its absence is expected, its presence means gate 6 landed.

### 2 ✱ Stack health — doubles as a build-provenance probe
Call `symbia_stack_health`.
**PASS:** ≥ 10 services healthy.
**Diagnostic:** exactly **3 healthy** means the installed connector predates the 16 Aug dual-path health fix — you are smoke-testing a stale artifact; stop and rebuild.
**KNOWN-ISSUE:** `control-center` and `api` unreachable is correct (not mounted on imagine); a "12 total" denominator is the open cosmetic defect.

### 3 ✱ Operation surface
Call `symbia_list_operations` (no filter).
**PASS:** total ≈ 390; `unavailable` lists only `control-center` and `api`.
**FAIL means:** one or more service bundles failed to mount — check `check-deps` output; this is the cookie-parser class of failure (deferred imports), the packaging pipeline's known weak spot.

### 4 ✱ Catalog write + the known content defect
Create a context resource: MAP predictions for checks 5–12 of this very run.
**PASS:** 201 with an id; the write appears in the session ledger with a `requestDigest`.
**KNOWN-ISSUE (record, don't block):** reading the resource back returns no `content`, `/versions` empty — open defect; the ledger digest is the proof of what was registered.

### 5 ✱ Deterministic compute, canonical lane
Load and execute a minimal graph: `passthrough → arithmetic (config.expression: "{value} * 2") → collect`. Inject `{ "value": 21 }` via ingress.
**PASS:** `result: 42`, `exact: true`, `lane: "canonical"`, receipt `kind: "recipe"` carrying the operation and resolved inputs.
**FAIL means:** runtime or lane machinery broken — this is the platform's core claim.

### 6 ✱ Demotion control — the probe must be able to see red
Load a rollup graph with `expected: ["a","b"]`; inject only `{ "key": "a", "value": 1 }`.
**PASS:** `lane: "apocryphal"`, `coverage: 0.5`, `missing: ["b"]`.
**Why critical:** this is the control for check 5. A run where every lane reads canonical is indistinguishable from a probe that isn't reading lanes. Two distinct lane values across checks 5–6, or the lane checks measured nothing.

### 7 — Local model
Call `symbia_list_models`, then request a chat completion from the local model (`temperature: 0, max_tokens: 16`).
**PASS:** model listed with a weights digest; completion returns non-empty content and names the model.
**Expected on a truly clean machine:** weights absent → this check becomes the receipted-pull test (workstream E). Record which path you hit — both are informative, neither is a FAIL unless the error is unhandled.

### 8 ✱ Assistant loop, end to end
`symbia_list_organizations` → use the real org id. Create an actor principal, an assistant, and a rule set containing a deterministic `^ping$ → message.send "pong"` rule. Execute rules for a `ping` message.
**PASS:** principal `isActive: true`; rule matches; reply `"pong"` carries a provenance envelope with `arena: "RETRIEVED"`, an ed25519 signature, and a plain-English `basis`.
**FAIL means:** the assistant layer or its signing is broken.
**Note:** a bare 500 on principal creation usually means a wrong `orgId` (known bad-error defect) — retry with the id from `list_organizations` before calling it a FAIL.

### 9 ✱ Regression: unknown action type must break the chain
Add a rule whose first action has a deliberately bogus type (e.g. `llm.complete`) followed by a `message.send` templating that step's result. Trigger it.
**PASS (fixed build):** the chain breaks or `onError` runs; **no message is emitted from the template**; the failed step appears in provenance with `ok: false`.
**FAIL (the 16 Aug bug):** an empty message is emitted, sealed `RETRIEVED` / "returned verbatim" with `steps: []` — a valid signature over a false claim. If you see this, the installed assistants bundle predates the fix. This check distinguishes fixed from unfixed builds better than any version string.

### 10 — Regression: llm.invoke availability gate
Add a rule using `llm.invoke` (provider `symbia-labs`, the local model). Trigger it.
**PASS:** anything except the old gate error — completion, or an honest provider/credential error.
**FAIL:** `"Integrations service is not available"` — the wrong-door health probe is back (or a stale bundle).

### 11 — Regression: service.call can address models
Add a rule using `service.call` with `service: "models"`, `basePath: "/v1"`, `path: "/chat/completions"`. Trigger it.
**PASS:** anything except `"Unknown service: models"`.

### 12 ✱ Seal, and verify the record
Call the **`symbia_seal` tool** — on an owned host (the default since 17 Aug)
the session token is private to the shim–host pair, so an external `curl`
cannot reach the seal endpoint and MUST NOT be used as the method here. The
curl-with-token path remains valid only against a shared dev host started by
hand.
**PASS:** seal succeeds; completeness reports `complete`/`sealed` with `gaps: []` and *held = declared*; bundle file exists on disk; the ledger's last event is the seal itself.
**Then check the ordering claim:** the predictions context (check 4) has a lower `seq` than every measurement it predicted. That's the platform's whole thesis, verified in the smoke test.

## Results

### Run 2026-08-17

**Preconditions.** Artifact `symbia-imagine-0.1.0.plugin`, SHA-256
`49f1bdec0820569a622b69ac6eefbdd48df83c75d4b38cffda240d8952b1b7e0`, built
09:59, installed 10:56–10:58. Fresh conversation. Sidecar node v25.2.1, pid
30199, host `http://127.0.0.1:7717`. Org `550e8400-e29b-41d4-a716-446655440000`
(Symbia Labs), created 11:01:12 — a clean store.

Predictions for checks 5–12 registered at 11:06:30 as
`contexts/smoke-test/2026-08-17-install-predictions`
(`f566717d-bce0-46d2-bf88-8b7439a1f5e9`), before any of those checks ran.
Results written back as `contexts/smoke-test/2026-08-17-install-results`
(`89efd08e-f95d-439a-86f2-192328e730ff`). Checks 1–3 and the connector tool
surface were measured **before** the predictions write; that is stated in the
predictions resource rather than concealed.

| # | Check | Verdict | Evidence (seq / id / value) |
|---|---|---|---|
| 1 | selftest | PASS (one criterion unmet) | `mode: imagine`, `loopback.ok true`, status 200. No session actor in the response; no version/build stamp either — the latter is the expected gate-6 gap, the former is not accounted for anywhere |
| 2 | stack health ✱ | **FAIL** | `healthy: 5, total: 12`, against a ≥10 threshold. Not the "exactly 3" stale-artifact signature. Unreachable: logging, integrations, models, network, directory, control-center, api |
| 3 | operations ✱ | PASS | `total: 390`; `unavailable` = control-center (404), api (404) only |
| 4 | catalog write ✱ | PASS, with the known defect and one new gap | 201, id `f566717d-…`. Read-back returns no `content` — known defect, confirmed. Ledger `requestDigest` **could not be checked**: no tool reads the ledger |
| 5 | canonical compute ✱ | PASS | execution `232a1979-…`: `result 42`, `exact true`, `lane canonical`, receipt `kind recipe`, recipe `{operation: "{value} * 2", inputs: {value: 21}}` |
| 6 | demotion control ✱ | PASS | execution `53acc12d-…`: `lane apocryphal`, `coverage 0.5`, `missing ["b"]`. Two distinct lanes across 5–6, so the lane checks read something |
| 7 | local model | Neither path | Registry empty: `/api/models` and `/v1/models` both return `data: []`. `/api/stats` returns `loadedModels 0` — the service answers, it has nothing to list. No weights to digest and no model id to pull |
| 8 | assistant loop ✱ | PASS | principal `a0be2948-…` `isActive true`; run `363cfbbf-…`, `rulesMatched 1`, reply `"pong"` with `arena: RETRIEVED`, `ed25519:Wp3782…`, `signedBy symbia:service:64044fd38e143462`, basis "content returned verbatim from the rule…" |
| 9 | unknown-action guard ✱ | PASS | run `d2b74cb9-…`: `llm.complete` → `success false`, `"Unknown action type: llm.complete"`. The downstream `message.send` did not execute; `actionsExecuted` has one entry. No empty message, no false seal. This build postdates the 16 Aug fix |
| 10 | llm.invoke gate | PASS | run `cd3e85e9-…`: `"No auth token available in execution context"`. An honest credential error, not `"Integrations service is not available"` |
| 11 | service.call models | PASS | run `1ff0107b-…`: `"models POST /chat/completions -> 500 (auth: NO TOKEN) - Model 'local' not found"`. Addressing resolved; the 500 is check 7's empty registry |
| 12 | seal + ordering ✱ | **CANNOT BE MEASURED** | The sidecar serves `POST /session/seal` and `GET /session` on the host root (`sidecar/sidecar.mjs:393,405`). None of the connector's 16 tools addresses a host-root path; `symbia_call` refuses any path outside a service spec (two attempts, both "No such operation"); `symbia_diagnose` reaches `/session/diagnostics` and gets 401 |

**Release verdict: BLOCKED.** Check 2 is a ✱ FAIL and check 12 is a ✱ that
cannot be run at all. No bundle was sealed, so there is no release evidence to
archive — which is itself the finding.

### What check 2 actually measured

`symbia_stack_health` calls `/api/health` on all twelve services. Five answer
it. The other seven are reported `unreachable` with a 404.

Those seven are not all down. `symbia_list_operations` read an OpenAPI spec
from ten of the twelve, and models answered `/api/stats` (`loadedModels 0`) and
`/api/models` normally while health called it unreachable. Network answered its
own `/api/platform/health` with a 503 body. Models declares `/health/live` in
its spec and that path returns 404.

So the 5/12 number is a mix of at least three conditions — services that serve
health on a different path, a service that declares a health route it does not
serve, and control-center and api which genuinely are not mounted. The threshold
in check 2 cannot distinguish them, and neither could this run without going to
`list_operations` for a second opinion. The check needs to name the condition,
not count the greens.

### Predictions that broke

**P10 broke.** I predicted `llm.invoke` would return the old
`"Integrations service is not available"` gate error, reasoning from integrations
showing unreachable in stack health. It returned a credential error instead. The
inference was wrong because the premise was wrong — integrations is not
unreachable, the health probe is looking at the wrong path. Check 10 passes; my
prediction did not.

**P7 broke in the direction it was written to break.** I predicted no local
weights digest and said so in advance. The registry turned out to be empty
altogether, so the discriminator I named — presence of `symbia.digest` on a
local entry — had nothing to range over. The prediction was too specific about a
world that did not exist.

The rest held: P0, P5, P6, P8, P9, P11, P12.

### Defects found

1. **Health probe uses one path for twelve services.** `symbia_stack_health`
   reports models, network, logging, integrations and directory unreachable
   while they answer other requests. A release gate reads this number.
2. **`symbia_call` ignores `service` on an operationId collision.** Called with
   `service: "runtime"`, `operationId: "get_graphs"`, it dispatched to catalog
   and returned catalog resources. Both services define `get_graphs`. The
   response's `called.service` said `catalog`, which is how this was caught —
   the field is doing real work and should stay.
3. **The session record is unreachable from the connector.** No tool addresses
   `POST /session/seal` or `GET /session`. `symbia_diagnose` reaches
   `/session/diagnostics` and gets 401. Checks 4 and 12 both depend on reading
   the ledger, and neither can. The smoke test instructs the agent to seal; the
   installed plugin gives it no way to.
4. **Context resources return no `content` on read-back.** Known, confirmed.
   Graph resources return `metadata` intact, so the gap is specific to
   `content`.
5. **`models` declares `/health/live` and `/health/ready`; both 404.** A spec
   that advertises routes the service does not serve.

### On the ordering claim

Check 12 asks whether the predictions resource has a lower `seq` than the
measurements it predicted. That could not be checked — the ledger is unreadable
from here.

What is available is wall-clock: predictions written 11:06:30, graphs 11:07:08
and 11:07:11, rule runs 11:08:34 through 11:08:48. That ordering is consistent
with the claim and proves less than the claim. A timestamp on a row I wrote is
not a position in a signed chain, and the whole point of check 12 is the
difference.

### Artifacts left in the session

`contexts/smoke-test/2026-08-17-install-predictions`,
`contexts/smoke-test/2026-08-17-install-results`,
`graphs/smoke-canonical-20260817`, `graphs/smoke-demotion-20260817`, actor
`assistant:smoke-ping`, and rules `smoke-ping`, `smoke-bogus`, `smoke-llmgate`,
`smoke-svccall` on org `550e8400-…`. They live in an imagine session and die
with it.
