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
`POST /session/seal` (or the imagine-session skill).
**PASS:** seal succeeds; completeness reports `complete`/`sealed` with `gaps: []` and *held = declared*; bundle file exists on disk; the ledger's last event is the seal itself.
**Then check the ordering claim:** the predictions context (check 4) has a lower `seq` than every measurement it predicted. That's the platform's whole thesis, verified in the smoke test.

## Results

| # | Check | Verdict | Evidence (seq / id / value) |
|---|---|---|---|
| 1 | selftest | | |
| 2 | stack health | | |
| 3 | operations | | |
| 4 | catalog write | | |
| 5 | canonical compute | | |
| 6 | demotion control | | |
| 7 | local model | | |
| 8 | assistant loop | | |
| 9 | unknown-action guard | | |
| 10 | llm.invoke gate | | |
| 11 | service.call models | | |
| 12 | seal + ordering | | |

**Release verdict:** PASS only if every ✱ check passed and the sealed bundle from this run is archived with the release. Attach the bundle — the smoke test's own session *is* the release evidence.
