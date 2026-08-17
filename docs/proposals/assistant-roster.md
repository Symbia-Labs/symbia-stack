# The ten — internal assistants at role scale

**PAPER. 13 August 2026.** Supersedes `assistant-roster-brainstorm.md` (115
entries), which was cut on two grounds recorded in §7.

Companion: **`assistant-roster.json`** — ten loadable definitions, hand-authored
routines inside a mechanical wrapper.

---

## 1. The correction

The first pass produced 115 assistants. Most of them were **actions wearing an
assistant's clothes** — `hasher`, `linkcheck`, `jsonpath`, `datecalc`. Each was
one tool call and a prompt. That is not an assistant in this platform; it is a
`tool.invoke` with a name.

What the engine actually supports, and what the first pass ignored:

- **Routines** — `parallel` (all/any/settle), `loop` (`over`/`as`/`index`/
  `maxIterations`/`continueOnError`), `condition` (if/then/else, nestable),
  `wait`. Real control flow, nested arbitrarily deep.
- **Symbia Script** — `@service.logging./logs/query`,
  `@catalog.component[http/Request]`, and `@assistant.calc.routing.handles`, so
  a rule references another assistant's *declaration* rather than a copy of it.
  Grammar does not lapse; discipline does.
- **Context bindings** — standing data with `refresh: on_start | on_turn |
  <interval-ms>`, aliased into prompts.
- **Per-stage model tuning** — `llmConfigPreset: routing | conversational |
  code | reasoning`. A routing decision and a synthesis are not the same job.
- **Conversation memory** — typed referents (`{expression, result,
  computedBy}`) so "that" is a deterministic lookup, not a model inference.
- **OEP claim classes**, delegation records, handoff.

An assistant is a **role that runs a routine and holds a refusal**. Ten of
those cover this installation.

---

## 2. Two axes, and no collisions on either

Cut on one axis alone and you get either ten things that all fan out over
different services, or ten different routines competing for the same data. So
each assistant owns **one service surface and one routine shape**, and no shape
repeats:

| # | assistant | routine shape | service surface | level | kind |
|---|---|---|---|---|---|
| 1 | **Symbia** `symbia` | Cascade | assistants, catalog | 5 | P |
| 2 | **Calculator** `calc` | Single-shot deterministic | messaging (conversation memory) | 2 | D |
| 3 | **Warden** `warden` | Fan-out, settle, re-probe | network, logging, catalog, runtime | 4 | P |
| 4 | **Auditor** `auditor` | Backwards chain walk | messaging, catalog | 5 | P |
| 5 | **Curator** `curator` | Admission gate | catalog | 3 | D |
| 6 | **Marshal** `marshal` | Sweep and escalate | identity, integrations | 4 | P |
| 7 | **Chronicler** `chronicler` | Reconcile two sources of truth | catalog, all services (/openapi.json) | 4 | P |
| 8 | **Wright** `wright` | Downstream traversal | runtime, catalog | 4 | P |
| 9 | **Quartermaster** `quartermaster` | Budgeted poll and ledger | models, integrations, logging | 4 | P |
| 10 | **Envoy** `envoy` | Relay | network, identity | 5 | D |

The shape column is the load-bearing one. It is what makes this a set rather
than a list: together they exercise the whole engine, and a gap in the matrix
(§6) is a part of the engine nothing would have tested.

**Three are deterministic** (`calc`, `curator`, `envoy`) and that is deliberate
— each is a place where a model in the path would destroy the property the
assistant exists to provide. A gate a model can talk its way through is not a
gate; a relay that rewords is not a relay.

---

## 3. Scope — internal only

These address **this installation's own services**: identity, logging, catalog,
messaging, network, directory, runtime, assistants, integrations, models. Not
one of them calls `integration.invoke` (§6 — that column is empty by design).

Third-party assistants are a **fork of one of these**, not a new category. §8
gives the diff. The reason to hold the line here: the governing rule says if a
piece cannot be built through the Symbia API alone, that is a platform defect
to log. A roster that starts with third-party integrations never discovers
those defects — three assistants found twelve, and they were all internal.

---

## 4. The ten

### Symbia — `assistants/symbia`

**Shape: Cascade.** Tiered condition fallthrough, cheapest tier first, model last and only if the first three decline.

**Role.** The coordinator. Decides who answers and records that it delegated. It never produces a value of its own — if it ever does, that is a defect, not a feature.

**Refuses.** Answering anything itself. Routing to an unpublished assistant. Reaching tier 4 without recording that tiers 1–3 declined.

**Would have caught.** The roster-copy defect, killed five times by discipline and once by grammar: `@assistant.*.routing.handles` means a rule references another assistant's declaration instead of holding a copy. Also the `(?i)` defect — patterns that V8 rejects make a rule silently unmatchable, so tier 2 needs a compiled-pattern check, not trust.

| | |
|---|---|
| kind / lane | `probabilistic` / `conditional` |
| claims | COMPOSED, REFUSED |
| onFailure | `retry` · retries 2 |
| model | `remote` · claude-sonnet-5 · onUnavailable `substitute` |
| bindings | @roster (on_start) |
| handles | anything addressed to the installation; @mentions; ambiguous requests |
| declines | producing an answer itself; routing to draft assistants |

### Calculator — `assistants/calc`

**Shape: Single-shot deterministic.** One tool call, no model anywhere in the path, plus a deterministic referent lookup for follow-ups.

**Role.** Arithmetic, and the resolution of what 'that' refers to. The floor of the platform: the one assistant whose answer is reproducible by anyone with the expression.

**Refuses.** Anything requiring a model. Any follow-up whose referent is not in conversation memory — after a restart that memory is gone, and it says so rather than guessing.

**Would have caught.** `actually make it 20%` returned 1.425 — twenty percent of the tip instead of the bill — sealed COMPOSED and wrong. Corrections must revise the expression, never operate on the result. That is why the referent is a typed field lookup and not a model inference.

| | |
|---|---|
| kind / lane | `deterministic` / `inherit` |
| claims | COMPUTED, REFUSED |
| onFailure | `refuse` |
| model | `none` · onUnavailable `refuse` |
| bindings | — none |
| handles | arithmetic; percentages; tips; revisions of a prior calculation |
| declines | word problems needing interpretation; anything after a restart with no referent |

### Warden — `assistants/warden`

**Shape: Fan-out, settle, re-probe.** parallel/settle across independent probes, then a wait and a second probe on anything that looked wrong the first time.

**Role.** Operations. Answers what is running, what is degraded, and where the registry disagrees with reality — always by measuring, never by reading a registration.

**Refuses.** Calling a registered service healthy on the strength of its registration. Reporting a single failed probe as an outage. Any arithmetic — rates and percentages go to Calculator so they stay COMPUTED.

**Would have caught.** `server` on 5000 is registered with nothing behind it; `RunningServices` is currently the only place that difference lives. Also: `npx tsx scripts/check-ports.ts` crashed in one sandbox and ran fine elsewhere — 'not working' and 'not running' look identical until something probes twice.

| | |
|---|---|
| kind / lane | `probabilistic` / `conditional` |
| claims | RETRIEVED, COMPUTED, COMPOSED, REFUSED |
| onFailure | `retry` · retries 2 |
| model | `remote` · claude-sonnet-5 · onUnavailable `substitute` |
| bindings | @registry (on_start), @errors (on_turn) |
| handles | health; is X running; drift; latency; error rate; port surface |
| declines | why the code is wrong; capacity planning; anything about a peer installation |

### Auditor — `assistants/auditor`

**Shape: Backwards chain walk.** Loop backwards over a delegation chain, deterministic verify at every hop, nested loop over citations at any COMPOSED hop.

**Role.** Given a reply, establishes whether its provenance holds: seal intact, arena consistent with what the assistant declared, citations actually saying what was attributed to them.

**Refuses.** Stating a verification stronger than the deterministic check returned. Judging whether an answer is TRUE — it establishes only whether the provenance is intact, and says so in every report.

**Would have caught.** `seal()` returned the live provenance array, so every non-delegated reply failed its own verification. Refusals were never sealed at all. Both were found by looking at a receipt rather than at the code that wrote it.

| | |
|---|---|
| kind / lane | `probabilistic` / `inherit` |
| claims | COMPUTED, RETRIEVED, COMPOSED, REFUSED |
| onFailure | `retry` · retries 2 |
| model | `remote` · claude-sonnet-5 · onUnavailable `substitute` |
| bindings | — none |
| handles | verify this reply; how did you get that; is this receipt intact; arena drift |
| declines | is this answer true; should I trust this source |

### Curator — `assistants/curator`

**Shape: Admission gate.** Condition-heavy validate-then-admit. Deterministic throughout: the decision to admit never touches a model. One model stage runs only AFTER admission, and only to propose tags.

**Role.** Decides what may enter the catalog. Enforces normalized type-prefixed keys, the reusable-versus-instance line, and domain vocabulary in tags rather than keys.

**Refuses.** Admitting a real-time point instance. Admitting a key whose prefix disagrees with its type column. Letting a model make an admission decision — a gate a model can talk its way through is not a gate.

**Would have caught.** D9 — `energy.graph.pue` and `energy.graph.ingest` are published graph resources with no graph behind them. A gate that required a graph to publish a graph resource would have caught both at write time. Also R5: bootstrap seed silently reverting live rows.

| | |
|---|---|
| kind / lane | `deterministic` / `inherit` |
| claims | COMPUTED, REFUSED |
| onFailure | `refuse` |
| model | `remote` · claude-sonnet-5 · onUnavailable `refuse` |
| bindings | — none |
| handles | can this go in the catalog; key normalization; publish this; seed drift |
| declines | runtime state; whether the thing is any good |

### Marshal — `assistants/marshal`

**Shape: Sweep and escalate.** Loop over a full inventory applying a policy per item, accumulate findings, then hand off to a human when the policy says a human must decide.

**Role.** Security posture of this installation: credentials and their age, org membership and tenancy, capability grants, and whether the guards are actually exercised rather than merely present in code.

**Refuses.** Returning a credential value, ever, under any framing. Declaring RLS enforced on the strength of code — STATUS §0a says it has never run against a live stack, and this assistant repeats that until it has run it itself.

**Would have caught.** `integrations/auth.ts` resolved orgId for RLS and never wrote it to `req.user`, so no assistant could resolve an org credential. A sweep that walked every service's auth path looking for the write would have found it. Also A2/A3: a fake HMAC and an unkeyed vault, both of which read as present until something checked the algorithm.

| | |
|---|---|
| kind / lane | `probabilistic` / `apocryphal` |
| claims | RETRIEVED, COMPUTED, COMPOSED, REFUSED |
| onFailure | `retry` · retries 2 |
| model | `remote` · claude-sonnet-5 · onUnavailable `substitute` |
| bindings | @orgs (on_start) |
| handles | credentials; rotation; tenancy; org membership; capability grants; posture |
| declines | credential values; declaring a guard enforced without exercising it |

### Chronicler — `assistants/chronicler`

**Shape: Reconcile two sources of truth.** Loop pairing each written claim against the code or the running stack, diffing the pair, and writing a dated finding where they disagree. Registered predictions are read-only by construction.

**Role.** Keeps the record honest. Checks documented claims against what the code does, runs the registered predictions, and produces the dated findings and the session close.

**Refuses.** Editing a prediction after it has been measured — the whole point of MAP is that predictions are registered in git before measuring, and a broken one gets reported as broken. Describing a local harness run as CI.

**Would have caught.** `DEVELOPER.md` §8 sat stale on Vite/5173 through an entire rebuild, with a rule in CLAUDE.md pointing at its staleness the whole time. A rule is not a checker. Six dangling doc links have been dangling for two days, unchanged, which is still a measurement.

| | |
|---|---|
| kind / lane | `probabilistic` / `apocryphal` |
| claims | RETRIEVED, COMPUTED, COMPOSED, REFUSED |
| onFailure | `retry` · retries 2 |
| model | `remote` · claude-sonnet-5 · onUnavailable `substitute` |
| bindings | @docs (on_start), @predictions (on_turn) |
| handles | is this doc still true; predictions; close out the session; what changed; dangling links |
| declines | editing a registered prediction; calling a local run green in CI |

### Wright — `assistants/wright`

**Shape: Downstream traversal.** Depth-bounded graph walk following consumers rather than sources — answers 'if this was wrong, what else is now wrong'.

**Role.** Components and their contracts: manifests, port lanes, and what consumed an apocryphal output downstream.

**Refuses.** Describing a component's behaviour from its manifest alone — a manifest is a declaration, and the whole platform exists because declarations drift. Admitting domain vocabulary into a manifest.

**Would have caught.** `symbia.io.http-request` already declares its output apocryphal, and the lanes are live in the manifest — but nothing walks downstream to find what consumed it. Lanes only tighten; without a traversal, nobody knows where an apocryphal value ended up sitting inside a canonical answer.

| | |
|---|---|
| kind / lane | `probabilistic` / `conditional` |
| claims | RETRIEVED, COMPOSED, REFUSED |
| onFailure | `retry` · retries 2 |
| model | `remote` · claude-sonnet-5 · onUnavailable `substitute` |
| bindings | @components (on_start) |
| handles | components; manifests; port lanes; apocryphal; what depends on this |
| declines | running a component; domain-specific behaviour |

### Quartermaster — `assistants/quartermaster`

**Shape: Budgeted poll and ledger.** Poll-until-available inside a declared budget, then account for every attempt — including the ones that failed — as its own ledger line.

**Role.** Model and provider supply: what is loaded, what a declared model resolves to, what happens when it is not there, and what every attempt cost.

**Refuses.** Choosing the substitution policy. `onUnavailable` is user config by ruling 8 — this assistant executes it and records it, and refuses to pick it. Also refuses to report a cost that omits failed attempts.

**Would have caught.** Three LLM configurations disagreed on the live coordinator and the one that reached the API call was an accident of which fields were set. `ExecutionContext.llmConfig` was never assigned by anything. The models service is healthy and reports zero models loaded. And `temperature: 0.7` is rejected outright by claude-sonnet-5 — whether a parameter is even legal depends on the model, which an assistant cannot know.

| | |
|---|---|
| kind / lane | `probabilistic` / `apocryphal` |
| claims | RETRIEVED, COMPUTED, COMPOSED, REFUSED |
| onFailure | `retry` · retries 2 |
| model | `remote` · claude-sonnet-5 · onUnavailable `substitute` |
| bindings | @loaded (30000) |
| handles | which model; is X available; cost; tokens; retries; substitution |
| declines | choosing a fallback policy; recommending a model |

### Envoy — `assistants/envoy`

**Shape: Relay.** Delegate outward and return the far side's reply unaltered. Its only contribution to the envelope is a delegation record — deterministic because adding nothing is a decision, not a judgement.

**Role.** The boundary to another installation. Forwards a request to a peer, returns the peer's sealed reply intact, and reports the attestation state of the instrument that signed it.

**Refuses.** Re-sealing a peer's reply under our identity. Paraphrasing a peer's answer — a relay that rewords is no longer a relay. Answering for a peer that did not respond.

**Would have caught.** The spyglass instrument reports `attested` after rotation onto the alpha2 genesis, and each capture track carries its own chain so one track can be withheld while proving it belonged to the same capture. That property only survives a boundary crossing if the relay adds nothing — which is the design constraint here, stated as a refusal.

| | |
|---|---|
| kind / lane | `deterministic` / `inherit` |
| claims | RETRIEVED, REFUSED |
| onFailure | `refuse` |
| model | `none` · onUnavailable `refuse` |
| bindings | @peers (on_turn) |
| handles | ask a peer; federation; attestation; whose seal is this |
| declines | interpreting a peer's answer; re-signing anything |

---

## 5. What the routines actually look like

Two worth reading in full, because they are the extremes.

**Symbia** is a cascade with the tier recorded at every step, so a receipt can
say *which* tier answered. Tier 2 compiles each candidate's declared patterns
before trusting them — the `(?i)` defect made five rules silently unmatchable
twice in this codebase, once after it had already been written down. Tier 4 is
a model, and reaching it is itself logged.

**Envoy** is twelve actions and no model at all. Its entire design is a
refusal: forward, verify the foreign seal, return the body unaltered, add a
delegation record and nothing else. `doNotReseal: true` is in the request body
because the property only survives the boundary if the relay adds nothing.

Between them: Warden probes twice with a `wait` in between (one probe cannot
tell flapping from down), Auditor walks a chain backwards with a nested loop
over citations, Wright walks *forwards* to consumers with a depth bound,
Quartermaster polls inside a budget and then bills every attempt including the
failures.

---

## 6. Engine coverage

Which action types each assistant exercises. Reading this as a checklist of the
engine is the point of picking shapes rather than topics.

| assistant | service.call | integration.invoke | tool.invoke | llm.invoke | assistant.route | parallel | loop | condition | wait | context.update | handoff.create | message.send |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `symbia` | · | · | ● | ● | ● | · | ● | ● | · | ● | · | ● |
| `calc` | · | · | ● | · | · | · | · | ● | · | · | · | ● |
| `warden` | ● | · | ● | ● | ● | ● | ● | ● | ● | ● | · | ● |
| `auditor` | ● | · | ● | ● | · | · | ● | ● | · | ● | · | ● |
| `curator` | ● | · | ● | ● | · | · | · | ● | · | ● | · | ● |
| `marshal` | ● | · | ● | ● | · | ● | ● | ● | · | ● | ● | ● |
| `chronicler` | ● | · | ● | ● | · | · | ● | ● | · | ● | · | ● |
| `wright` | ● | · | · | ● | · | · | ● | ● | · | ● | · | ● |
| `quartermaster` | ● | · | · | ● | ● | ● | ● | ● | ● | ● | · | ● |
| `envoy` | ● | · | ● | · | · | · | · | ● | · | · | · | ● |

**`integration.invoke` is empty on purpose** — that is §3's ruling made
visible, and it is exactly the column a third-party fork fills in (§8).

**Not exercised by any of the ten**, and worth deciding about rather than
discovering later: `notify`, `webhook.call`, `state.transition`,
`handoff.assign` / `handoff.resolve`, `embedding.route`. Of these,
`handoff.create` appears once (Marshal) and its partners never do — a handoff
that can be created and never assigned or resolved is a half-built workflow,
and today all three have **zero uses across every live ruleset**.

---

## 7. Where the other 105 went

Nothing was lost; almost all of it was misclassified. The 115 resolved into
four buckets:

| became | count | examples |
|---|---|---|
| **Actions inside a routine** | ~40 | `sealcheck` → `tool.invoke envelope.verify` inside Auditor. `linkcheck` → one step in Chronicler. `portwatch` → one probe in Warden's fan-out. |
| **Tools the platform needs** | ~25 | `catalog.key.parse`, `seed.diff`, `pattern.compile`, `memory.referent`, `expression.revise`, `peer.resolve`, `oep.check`. Several do not exist yet — **that is a useful output**, a concrete tool backlog derived from routines rather than guessed at. |
| **Capability grants** | ~15 | `egress-warden`, `pathguard`, `vault` are not assistants. Under the wasm proposal they are capabilities an assistant is granted, host-mediated. |
| **Third-party forks** | 32 | All of Family G. Not built here; §8 is the template. |
| **Cut outright** | ~10 | `refuser` (every assistant has a default refusal rule — it is a field, not a role), `clarifier`, `basisreporter`, `digestor`, and the rest of the one-tool wrappers. |

The two cuts worth stating as rulings:

1. **A refusal is a field on every assistant, not an assistant.** Making it a
   role would let the others off the hook.
2. **A guard is a capability, not a role.** `egress.check` must be
   unconditional and unarguable; giving it a conversational surface invites
   someone to negotiate with it.

---

## 8. The third-party template

A developer builds a Datadog or Stripe assistant by **forking a shape**, not by
inventing a category. Warden is the fan-out template; here is the exact diff.

**Change these four:**

```jsonc
{
  "key": "assistants/<name>",                    // same normalized form
  "metadata": {
    "contextBindings": [                         // 1. bind the integration, not a service
      { "alias": "@monitors", "type": "custom", "refresh": "on_turn",
        "config": { "integrationId": "datadog", "operation": "monitors.list" } }
    ],
    "routing": {                                 // 2. redraw the boundary
      "handles": ["external monitor state", "vendor alerting"],
      "declines": ["this installation's own health — that is @warden"]
    },
    "assistantConfig": {
      "capabilities": ["messaging", "integrations:datadog"]   // 3. narrow the grant
    },
    "ruleSet": { /* 4. service.call  ->  integration.invoke, same routine */ }
  }
}
```

**Do not change these five** — they are what makes it a Symbia assistant rather
than a wrapper:

1. `config.kind` declared, never derived from a tag. It is a billing decision.
2. `claims` honest about arena. A vendor API returning a number verbatim is
   **RETRIEVED**; the moment a model narrates it, the basis changes even though
   the arena does not.
3. The `isDefault` refusal rule, with a boundary named in it.
4. Two-phase probing wherever the answer is "is it up" — a single failed call
   to a vendor is not an outage, and a vendor's own status page is not evidence
   about your installation.
5. Arithmetic delegates to `@assistant.calc`. A rate a model narrates is
   COMPOSED and should not be dressed as COMPUTED.

**The boundary that matters most:** an external assistant must decline
questions about this installation. Datadog's view of your stack is a vendor's
index, not your logs — Warden and a Datadog fork must never be interchangeable,
and their `routing.declines` should each name the other.

---

## 9. Unwired dependencies — name the reader

Same discipline as before, because `ExecutionContext.llmConfig` cost every
model parameter on every assistant by looking like it worked.

| field | reader | status |
|---|---|---|
| `ruleSet.rules[]` | `RunCoordinator.processEvent` | confirmed |
| `config.kind` | failure behaviour (`bdcd73d`) | confirmed |
| `config.lane` / `claims` | sealing, arena audit | partial |
| **`contextBindings`** | `context-bindings.ts` resolver exists — **zero callers in `src`** | **BUILT, UNWIRED** |
| **`llmConfigPreset`** | `getActionConfig()` has no caller; `ExecutionContext.llmConfig` was never assigned | **BUILT, UNWIRED** |
| `routing.handles` | `@assistant.*.routing.handles` parses; resolution is async-unsupported | **partial** |
| `config.digest` | envelope citation | **PAPER** |
| `assistantConfig.capabilities` | nothing enforces it | **PAPER until wasm** |

**Four of eight have no live reader, and every one of the ten depends on at
least one.** That is not a reason to cut them — it is the build order. Wiring
`contextBindings` and the config merge are prerequisites for *any* of this, and
they are prerequisites for the provenance seal too: you cannot content-address
a configuration that three layers disagree about.

**Tools that do not exist yet**, referenced by these routines and worth
treating as the derived backlog: `catalog.key.parse`, `seed.diff`,
`pattern.compile`, `mention.resolve`, `intent.classify` (exists inside the
engine, not as a tool), `memory.referent`, `expression.revise`,
`expression.parse`, `envelope.verify`, `oep.check`, `link.resolve`,
`harness.run`, `ports.scan`, `peer.resolve`, `egress.check`, `path.validate`.

---

## 10. Loading

```bash
# all ten, draft
jq '{resources: .resources}' docs/proposals/assistant-roster.json \
| curl -sX POST http://localhost:8000/svc/catalog/api/resources/bulk \
  -H "Authorization: Bearer $TOKEN" -H "X-Org-Id: $ORG" \
  -H 'Content-Type: application/json' -d @-

# publish one — deliberate, and gated by the harness
curl -sX POST http://localhost:8000/svc/catalog/api/resources/ast-warden/publish \
  -H "Authorization: Bearer $TOKEN" -H "X-Org-Id: $ORG"
```

Via MCP: `symbia_list_assistants` / `symbia_get_resource` read; writes go
through the catalog tools on the same server.

All ten ship `status: "draft"`. `scripts/verify-assistants.mts` reconciles both
directions — a published assistant that no prediction names is a harness
failure. Ten assistants means ten predictions somebody is willing to be wrong
about, which is a tractable number and was the entire problem with 115.

**Caveat on `config.digest`:** computed with a local RFC 8785-ish
canonicalizer, **not** checked against `@symbia/crypto`. If they disagree every
digest here is wrong.

---

## 11. Open questions

**Q1 — Does fetch-then-compose claim RETRIEVED?** Still unsettled from the
first pass, and it now decides `claims` on six of ten. Warden fetches verbatim
and reasons over it in one `llm.invoke`. MESSAGES.md's arena/basis split says
the value stays RETRIEVED; the single-stage implementation makes that hard to
evidence. **Splitting the fetch and the narration into separate sealed steps
would settle it structurally** rather than by ruling.

**Q2 — Is `routineShape` a real field or a design note?** It is in the metadata
here with no reader. If routing ever wants "which assistant handles a
traversal-shaped question", it becomes real. If not, it should be a tag.

**Q3 — Build order.** Warden first proves the fan-out and forces
`contextBindings` to acquire a reader. Auditor first proves the platform's
actual thesis but depends on sealing being correct. Curator first is cheapest
and prevents the most rot. One of those three, not all.

**Q4 — Does Chronicler write, or only report?** It POSTs a dated finding. An
assistant that writes to the catalog is subject to Curator's gate — including
its own findings. That is either elegant or circular.

---

*13 Aug 2026. PAPER — nothing registered, nothing measured.*
