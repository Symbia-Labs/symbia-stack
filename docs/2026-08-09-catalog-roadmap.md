# Catalog objects — full listing and roadmap

*9 August 2026. Measured through the Symbia MCP server (read-side) against the
running stack, cross-checked against the repo working tree
(`fix/2026-08-06-api-gaps`). Observations and inferences are separated
throughout. "Not checked" is written where it is true.*

---

## 1. Method

- Listing via `symbia_list_resources` (limit 100), `symbia_list_components`,
  `symbia_list_assistants`, `symbia_integration_status`, `symbia_list_models`.
- Catalog reports **79 resources total**; the listing returned all 79
  (`has_more: false`). The type arithmetic closes exactly:
  16 components + 20 assistants + 4 graphs + 3 apps + 5 contexts +
  31 integrations = 79.
- Repo cross-check was grep/JSON-parse of seed files only. No browser, no
  runtime execution. What that pass could and could not see is noted per item.
- `symbia_stack_health` was **not called** (known-stale `dist` probing 5054 —
  see 7 Aug observation in project instructions). Nothing in this doc depends
  on it.

---

## 2. Components — 16 builtin, all published

All 16 registered in runtime and mirrored into the catalog as
`components/<id>`. Every component carries lane annotations
(canonical / apocryphal / conditional / inherit) on its output ports.

| id | ports (out) | lane notes |
|---|---|---|
| symbia.io.passthrough | out | inherit |
| symbia.io.collect | out | inherit |
| symbia.io.log | out | inherit (execution trace only) |
| symbia.io.delay | out | inherit; ms capped 5000 |
| symbia.io.http-request | out, error | **apocryphal** — remote body not recomputable |
| symbia.transform.map | out, error | inherit / error apocryphal |
| symbia.logic.filter | pass, fail | inherit |
| symbia.logic.switch | default (+configured) | inherit; port allowlist |
| symbia.compute.arithmetic | out, error | **canonical** — recomputable |
| symbia.state.latest | out, snapshot | snapshot **conditional** (no freshness guarantee) |
| symbia.state.join | out, pending | pending **apocryphal** (coverage, not a join) |
| symbia.state.window | out, error | out **conditional** (read count against size) |
| symbia.state.rollup | out | **conditional** — apocryphal when any expected key missing |
| symbia.source.timer | out | canonical (platform-generated tick) |
| symbia.sink.metric | out, error | writes to logging metrics; error apocryphal |
| symbia.sink.log | out, error | persists to platform log store |

**Observations.** Domain vocabulary is out of the manifests (6 Aug audit
holds): `state.latest` / `state.join` / `state.rollup` all default
`keyField: "key"`. Config descriptions state their honesty mechanics in the
manifest itself (e.g. rollup: "without expected, coverage is 1 by vacuous
default and every partial total looks complete").

**Gaps (inference — candidates, not defects).** No LLM-call component, no
integrations-gateway component, no catalog-read component, no
assistant-invoke component, no schedule/cron source beyond timer, no
persistent-store sink beyond metric/log, no aggregate-by-time-bucket. The
spyglass reached vision through `POST /api/integrations/execute` from a
network node, not through a graph component — meaning **a graph cannot yet
express "call a model" as a node.** That is the largest single hole in the
component set if graphs are to compose provenance over model output.

---

## 3. Assistants — 20 registered, 3 seed sources, 1 orphan file

This is the review you asked for. Grouped by provenance:

### 3a. Tutorial ladder (10) — source: `catalog/data/assistants-bootstrap.json`

| key | level | character |
|---|---|---|
| echo | 1 | deterministic mirror |
| calculator | 2 | deterministic math |
| converter | 2 | deterministic units |
| data-explainer | 3 | logic → LLM |
| code-runner | 3 | logic → LLM |
| smart-calc | 4 | LLM → logic |
| intent-router | 4 | LLM → logic |
| coordinator | 5 | orchestration, alias `symbia` |
| analyst | 5 | specialist |
| builder | 5 | meta-creation |

### 3b. Stack-scoped (5) — source: `scripts/seed-stack-assistants.mts`

docs, interfaces, codebase, observability, security. Each answers only from
live platform data fetched at question time, refuses to fill gaps from
memory, cites the source service per fact. These are the provenance story in
assistant form.

### 3c. Google (5) — **source not found in repo**

gmail, gdrive, gsheets, gdocs, gcal (`ast-gmail` etc., tagged bootstrap,
level-4). A grep for `ast-gmail` / `assistants/gmail` across the tree
(excluding node_modules) matched nothing. **Observation:** no repo source
located in this pass. **Inference (unverified):** they were seeded by
something not in this working tree — a package, an earlier branch, or by
hand. Where these came from should be established before touching them,
because whatever seeded them is an unrecorded gate.

### 3d. Orphan seed file — defined but not registered (7)

`assistants/seeds/bootstrap-assistants.json` defines log-analyst,
catalog-search, run-debugger, usage-reporter, onboarding, cli-assistant,
model-evaluator. **None appear in the running catalog or assistants
service.** Either the file is dead weight or the seed path that consumes it
never ran. Not checked: whether `seed-bootstrap-assistants.ts` is wired into
any boot path.

### 3e. Review findings across the 20 (observations unless marked)

- **Stale model pins.** Coordinator generation model is `gpt-4o`, fallbacks
  `gpt-4o-mini` → `claude-3-haiku-20240307`. The catalog's own integration
  entries top out at Claude Opus 4 / Sonnet 4 (May 2025) and o1/o3-mini.
  It is August 2026. Every model reference in assistants and catalog is at
  least ~15 months old. (Whether any of them still resolve at the providers:
  **not checked**.)
- **Split-brain LLM config.** docs/interfaces/etc. carry an `llm` block
  saying `anthropic / claude-sonnet-5` *and* an `llmConfig` block saying
  `openai / gpt-4o`. Which one the handler actually reads: **not checked**.
  Two config blocks that can disagree is the forked-authMiddleware pattern
  (discipline 8) inside a single record.
- **`llmConfigPreset: "conversational"` is identical boilerplate on every
  assistant** — same embedding config, same fallbacks, same thresholds,
  whether the assistant is `echo` (which needs no LLM at all) or
  `coordinator`. A deterministic level-1/level-2 assistant carrying a full
  LLM config invites exactly the "confident value that means never-asked"
  failure.
- Coordinator's help text hardcodes the team roster as prose. The roster is
  queryable from the catalog; the hardcoded copy will drift from it (it
  already omits the 5 scoped and 5 Google assistants).
- The scoped assistants' rules discipline (answer only from fetched data,
  name what's missing, cite per fact) exists in 5 of 20. The tutorial
  ladder's think-steps don't state it. If that discipline is the product,
  it should be a property of the assistant *type*, not prose repeated in 5
  system prompts.

---

## 4. Graphs — 4 published, 0 demo/template category

| key | name | tags | source in repo |
|---|---|---|---|
| graphs/order-margin | order-margin | pipeline, commerce | `examples/order-margin/order-margin.graph.json` |
| graphs/energy-pipeline | energy-pipeline | pipeline, energy | not found in this pass |
| energy.graph.ingest | energy-ingest | ingest, energy | not found in this pass |
| energy.graph.pue | energy-pue | derive, energy | not found in this pass |

**Observations.**
- Key convention is split: two graphs use `graphs/<name>`, two use
  `energy.graph.<name>`. One catalog, two naming schemes.
- The only graph definition file findable in the repo is order-margin's.
  The three energy graph sources were not located by a name-based grep of
  `energy/` — **not checked** beyond that (they may exist under other
  names, or only in the catalog DB).
- **There are no demo or template graphs.** No resource carries a `demo`,
  `template`, or `tutorial` tag in type=graph. The tutorial ladder exists
  for assistants (10 items, levels 1–5) and has no counterpart for graphs —
  yet graphs are where the lane/provenance semantics actually live.

---

## 5. Apps (3), contexts (5), ingress (2)

- **Apps:** control-center (privileged, ui), energy, order-margin. Matches
  the app-model intent: energy and order-margin are the two load-test
  domains, control-center is the operator surface.
- **Contexts:** all 5 are `integrations.*` (provider, credentials, model,
  usage, config), all `pack:Core`. No contexts exist for any other service's
  domain. Whether other services should publish contexts: open question,
  §7.
- **Ingress:** `ingress/energy-pipeline` and `ingress/order-margin` are in
  the catalog with **type=integration**. Observation: they are
  per-installation runtime records (which graph, which node, which port)
  sitting in the registry that is ruled "reusable items only."
  **Inference to dispute:** these belong to the installation, not the
  catalog — or at minimum deserve their own type instead of overloading
  `integration`. This is an app-vs-installation boundary case
  (`docs/APP-MODEL.md`).

---

## 6. Integrations — 31, and the provider status

Breakdown: 3 provider configs (openai, anthropic, huggingface) +
21 model entries (8 openai, 5 anthropic, 6 huggingface, 1 symbia-labs local,
plus embedding models counted in those) + telegram + 5 google
(gmail/drive/calendar/sheets/docs) + 2 ingress records (see §5).

**Provider status (unauthenticated route — credentials explicitly
`not_checked`, which is the honest answer, noted approvingly):**
openai registered+configured, anthropic registered+configured, huggingface
registered+configured, **symbia-labs not registered**.

**Observations.**
- symbia-labs is *not registered as a provider*, yet the models service
  serves a symbia-labs-owned GGUF
  (`llama-3-2-1b-instruct-q4-k-m`, available) and the catalog holds
  `integrations/symbia-labs/models/...` for it. Three services, three
  different answers to "does symbia-labs exist here."
- The model catalog is frozen in spring 2025 (see §3e). No entry for
  anything newer on any provider.
- Telegram is the only non-Google, non-AI integration, and the only one with
  a full auto-discovered OpenAPI operation registry visible in status.
  Whether the Google five have equivalent operation registries: **not
  checked** (truncated in the status payload).

---

## 7. Roadmap

Phased by dependency, not by time. Each item is a catalog write through the
platform API; anything that can't be done that way is a defect to log
(the governing rule).

### Phase 1 — make the registry tell the truth about itself

The listing above shows the catalog asserting things whose provenance is
unclear. Fix the registry before growing it.

1. **Resolve the Google-assistant provenance.** Find or reconstruct the seed
   source for the 5 `ast-g*` assistants; put it in the repo or retire them.
   An unregistered gate seeded them; that's finding #1.
2. **Decide the 7 orphans.** Wire `bootstrap-assistants.json` into a seed
   path, or delete the file. A seed file that doesn't seed is a confident
   green that means never-ran.
3. **One graph key convention.** Migrate `energy.graph.*` → `graphs/*` (or
   the reverse), through the API.
4. **Re-type or relocate the 2 ingress records.** Own type, or move to
   installation-scoped storage per APP-MODEL.
5. **Locate or regenerate the 3 energy graph sources** so every published
   graph has a definition under version control.
6. **Reconcile symbia-labs** across integrations (provider registry), models
   (serving), catalog (resource) — one answer in `@symbia/sys`-equivalent
   form, not three.

### Phase 2 — assistant review actioned

7. **One LLM config per assistant.** Kill the `llm` vs `llmConfig`
   split-brain; the loser gets deleted, not deprecated.
8. **Refresh model pins** and make model references *catalog references*
   (assistant → `integrations/ai/.../models/...` key) instead of inline
   strings, so a stale pin is a dangling reference the platform can detect
   rather than silent prose.
9. **Strip LLM config from deterministic assistants** (echo, calculator,
   converter). An assistant that never calls a model should not carry one.
10. **Lift the scoped-assistant rules into the type.** "Answer only from
    fetched data / name what's missing / cite per fact" becomes a declared
    assistant property the platform enforces or at least renders, not
    5 copies of prose.
11. **Coordinator roster from the catalog**, not hardcoded help text.

### Phase 3 — fill the component holes

12. **`symbia.ai.generate` (or similar):** LLM call as a graph node, routed
    through the integrations gateway, output on the **apocryphal** lane by
    construction. This is the spyglass lesson made reusable, and it is the
    prerequisite for any graph that composes over model output.
13. **`symbia.io.integration`:** invoke a registered integration operation
    (telegram send, sheets append) as a node — capability-checked like
    ingress.
14. **Catalog-read component** (resource lookup as a node, canonical) and
    **assistant-invoke component** (apocryphal).
15. Candidates behind those, in need order: schedule source, time-bucket
    aggregate, JSONL sink (per the dev-persistence constraint).

### Phase 4 — demo & template graphs (the missing category)

16. **A graph ladder mirroring the assistant ladder**, tagged `tutorial`,
    one per lane lesson: (1) passthrough→collect, (2) arithmetic with a
    receipt, (3) http-request showing apocryphal taint, (4) rollup showing
    partial-total honesty, (5) a composed graph with a scorecard. Each is a
    catalog resource with `template` tag and no org-specific values (app
    model: portable artifact).
17. **Templates are reusable by ruling** — they belong in the catalog;
    their *executions* do not. The distinction gets a tag pair
    (`template` vs nothing) and a rule in the seed path.
18. Second-domain templates come from `examples/order-margin`, not energy,
    so the platform contract isn't shaped around one domain.

### Phase 5 — integration surface grows behind the gate

19. Refresh the AI model entries (all providers) as catalog writes with the
    ledger recording when and by what.
20. Contexts for non-integrations domains, if and only if a consumer
    exists — no speculative contexts.
21. Non-AI integrations beyond telegram/google as demand appears; each
    arrives with its operation registry, auth type, and a template graph
    that exercises it.

### Predictions registered (before anyone measures)

- P1: the Google-assistant seed will turn out to be in a package under
  node_modules or an unmerged branch (`work/2026-08-05-*` is the suspect),
  not lost.
- P2: the handler reads `llmConfig` (gpt-4o), not the `llm` block — meaning
  docs/interfaces have never actually run on claude-sonnet-5.
  *This is the one I expect to get wrong.*
- P3: at least one of the three energy graph definitions exists only in the
  catalog DB with no file source anywhere.

---

*Nothing in §7 was executed. This document is the paper version, per
request. Items 1–6 are checkable through the MCP read tools plus git; the
predictions above are falsifiable by that check.*
