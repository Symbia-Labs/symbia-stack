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

| id | description | ports (out) | lane notes |
|---|---|---|---|
| symbia.io.passthrough | Emits input unchanged; graph entry point | out | inherit |
| symbia.io.collect | Terminal node; collects results for the execution output | out | inherit |
| symbia.io.log | Writes value to the execution trace only (ephemeral, per-run); passes through | out | inherit (execution trace only) |
| symbia.io.delay | Waits config.ms, then passes through | out | inherit; ms capped 5000 |
| symbia.io.http-request | Fetches config.url | out, error | **apocryphal** — remote body not recomputable |
| symbia.transform.map | Reshapes an object via config.mapping; deterministic | out, error | inherit / error apocryphal |
| symbia.logic.filter | Routes on a predicate (field / op / value) | pass, fail | inherit |
| symbia.logic.switch | Emits on the port named by a field's value | default (+configured) | inherit; port allowlist |
| symbia.compute.arithmetic | Exact arithmetic over config.expression with {placeholders} | out, error | **canonical** — recomputable |
| symbia.state.latest | Remembers most recent message per key; snapshot downstream | out, snapshot | snapshot **conditional** (no freshness guarantee) |
| symbia.state.join | Joins latest values of selected keys from a keyed stream | out, pending | pending **apocryphal** (coverage, not a join) |
| symbia.state.window | Rolling window of last N values; emits count/sum/mean/min/max/last | out, error | out **conditional** (read count against size) |
| symbia.state.rollup | Aggregates latest values of an expected key set (sum/mean/min/max) | out | **conditional** — apocryphal when any expected key missing |
| symbia.source.timer | Emits {tick, ts} every intervalMs while running | out | canonical (platform-generated tick) |
| symbia.sink.metric | Writes a numeric data point to logging metrics | out, error | writes to logging metrics; error apocryphal |
| symbia.sink.log | Persists message to the Logging service log store (durable, unlike io.log) | out, error | persists to platform log store |

**Observations.** Domain vocabulary is out of the manifests (6 Aug audit
holds): `state.latest` / `state.join` / `state.rollup` all default
`keyField: "key"`. Config descriptions state their honesty mechanics in the
manifest itself (e.g. rollup: "without expected, coverage is 1 by vacuous
default and every partial total looks complete").

**Open design question — key as a port-level contract.** "Keyed stream" is
currently a convention (three components independently defaulting
`keyField: "key"`), not a contract: nothing at load time checks that the
upstream of a join actually emits keyed messages; the mismatch surfaces at
runtime semantics. Lanes are the precedent for the fix — a semantic
property declared per port in the manifest and validated by the platform.
The candidate shape is a second port annotation, `{lane, keyedBy?}`, with
the loader checking producer/consumer key agreement the way strict
enforcement checks component registration. Against it: only three
components consume keys today, so typing it now may be premature. Logged
here, not decided; see Phase 3.

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

*Ruling (Brian, 9 Aug): all four are outdated examples and are to be
deleted through the API — Phase 1, item 5. The listing below stands as the
measured record of what was registered when the ruling was made.*

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
- **A draft graph is reported to exist (Brian, 9 Aug) but is invisible to
  every read path used here.** The MCP catalog listing returns exactly 4
  graphs, all published (total=4 — not a pagination miss), and no draft
  rows appear in local data dirs. Unresolved between two explanations:
  (a) the catalog list route filters to `published` by default — note the
  8 Aug review found the status column *defaults* to draft yet nothing has
  ever been observed in draft state, which would be exactly this filter
  hiding them; (b) the draft lives in runtime's graph store, which the MCP
  server exposes no read tool for. Either way this is a listing-honesty
  defect of the platform or the tooling: a draft that exists but cannot be
  enumerated is a resource without provenance. **Not checked:** the catalog
  list endpoint's status filtering, and runtime's graph table. Both go to
  Phase 1.

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
3. **One key semantic for object reference — decide, then migrate.** The
   graph split (`graphs/*` vs `energy.graph.*`) is one symptom; the catalog
   also holds a bare key (`telegram`), a singular prefix (`context/*` where
   everything else is plural), and one place where key semantics and the
   type column already disagree (ingress records keyed `ingress/*`, typed
   `integration`). The options:

   **(a) Type-prefixed path — `<type-plural>/<name...>`.** The current
   majority (`graphs/order-margin`, `components/symbia.state.join`,
   `integrations/ai/openai/models/gpt-4o`). Reads well, proven to nest,
   cheapest migration (4 graph keys, 5 context keys, 1 telegram key, 2
   ingress keys move). Also maps directly onto an MQTT topic hierarchy —
   a key is a topic, a type is a subscription filter (`graphs/#`,
   `integrations/ai/+/models/#`), which matters the day catalog changes or
   keyed streams ride a broker; none of the other options give wildcards
   for free. Cost: the type appears twice — in the key and in the
   type column — and two copies of one fact can disagree; the ingress rows
   prove it already happened. If chosen, the write gate must enforce
   key-prefix ⇄ type-column agreement so the redundancy can't drift.

   **(b) Reverse-DNS dotted — `<namespace>.<type>.<name>`.** Matches
   component id style (`symbia.state.join`). Sorts and globs well. Cost:
   the namespace slot invites exactly the leak the app model forbids —
   `energy.graph.pue` bakes a domain into a portable artifact's key. The
   existing dotted keys are the violation, not the precedent.

   **(c) URN — `urn:symbia:<type>:<name>` (or scheme URI).** Fully
   qualified, unambiguous across services, extensible to org/installation
   scoping later without reinterpreting old keys. Cost: verbose, biggest
   migration, and scoping-in-the-key cuts against app-vs-installation —
   org belongs to the installation, never the artifact, so the extensibility
   argument is weaker here than it looks.

   **(d) Opaque slug — key carries no semantics.** Type, namespace,
   domain all live in typed columns and tags; key is just unique. Nothing
   can drift because nothing is duplicated. Cost: keys stop communicating;
   every human surface needs a join to say what a thing is.

   **Ruling (settled, Brian, 9 Aug): (a), normalized.** Plural type prefix
   always (`contexts/`, not `context/`), name is the only free segment,
   nesting allowed where earned (`integrations/ai/openai/models/gpt-4o`),
   domain vocabulary in tags never in keys, and the write gate validates
   key-prefix ⇄ type-column agreement on every write. Grounds: standing
   majority (~67 of 79 keys conform; migration touches ~12, four of which
   are the graphs already ruled deleted); keys-as-MQTT-topics gives type
   subscription filters for free; and the one real weakness — type stated
   twice — is a defect class the gate is built to catch, so choosing (a)
   doubles as a test of the gate. Dissent on record: (d) is the only
   option where drift is impossible rather than caught; if gate validation
   is ever found skipped in a write path, (d) gets another look.
4. **Re-type or relocate the 2 ingress records.** Own type, or move to
   installation-scoped storage per APP-MODEL.
5. **Delete the example graphs — ruled outdated (Brian, 9 Aug).** All four
   registered graphs (order-margin, energy-pipeline, energy-ingest,
   energy-pue) go, superseding the earlier plan to locate/regenerate their
   sources. The removal is itself a probe: it must happen through the
   platform API as a ledgered write — the schema defines a `deprecated`
   status that has never once been used, so this is the first test of
   whether retirement is expressible through the gate at all. If a graph
   can only be removed by hand-editing storage, that's the defect to log.
   Check the two `ingress/*` records and `runFlow` references for dangling
   pointers after removal. Replacement graphs come from Phase 4's template
   ladder, built against the decided key convention (item 3).
6. **Reconcile symbia-labs** across integrations (provider registry), models
   (serving), catalog (resource) — one answer in `@symbia/sys`-equivalent
   form, not three. **Sequenced first within Phase 1 (Brian, 9 Aug):**
   either register the provider through the API (gated, ledgered) or retire
   the model entry and catalog resource; if the API alone can't do it,
   that's a platform defect to log.
7. **Make drafts enumerable.** Establish where the reported draft graph
   lives (§4) and whether the catalog list route silently filters
   non-published resources. If it does, that filter must be explicit and
   overridable — a listing that quietly hides drafts is a confident count
   that means "never asked."

### Phase 2 — assistant review actioned

8. **One LLM config per assistant.** Kill the `llm` vs `llmConfig`
   split-brain; the loser gets deleted, not deprecated.
9. **Refresh model pins** and make model references *catalog references*
   (assistant → `integrations/ai/.../models/...` key) instead of inline
   strings, so a stale pin is a dangling reference the platform can detect
   rather than silent prose.
10. **Strip LLM config from deterministic assistants** (echo, calculator,
   converter). An assistant that never calls a model should not carry one.
11. **Lift the scoped-assistant rules into the type.** "Answer only from
    fetched data / name what's missing / cite per fact" becomes a declared
    assistant property the platform enforces or at least renders, not
    5 copies of prose.
12. **Coordinator roster from the catalog**, not hardcoded help text.

### Phase 3 — fill the component holes

13. **`symbia.ai.generate` (or similar):** LLM call as a graph node, routed
    through the integrations gateway, output on the **apocryphal** lane by
    construction. This is the spyglass lesson made reusable, and it is the
    prerequisite for any graph that composes over model output.
14. **`symbia.io.integration`:** invoke a registered integration operation
    (telegram send, sheets append) as a node — capability-checked like
    ingress.
15. **Catalog-read component** (resource lookup as a node, canonical) and
    **assistant-invoke component** (apocryphal).
16. Candidates behind those, in need order: schedule source, time-bucket
    aggregate, JSONL sink (per the dev-persistence constraint).
17. **Decide the key-as-port-contract question (§2).** If new state
    components land in this phase, decide before they ship — every added
    `keyField` config is another copy of the convention that a later
    contract has to migrate.

### Phase 4 — demo & template graphs (the missing category)

18. **A graph ladder mirroring the assistant ladder**, tagged `tutorial`,
    one per lane lesson: (1) passthrough→collect, (2) arithmetic with a
    receipt, (3) http-request showing apocryphal taint, (4) rollup showing
    partial-total honesty, (5) a composed graph with a scorecard. Each is a
    catalog resource with `template` tag and no org-specific values (app
    model: portable artifact).
19. **Templates are reusable by ruling** — they belong in the catalog;
    their *executions* do not. The distinction gets a tag pair
    (`template` vs nothing) and a rule in the seed path.
20. Second-domain templates come from `examples/order-margin`, not energy,
    so the platform contract isn't shaped around one domain.

### Phase 5 — integration surface grows behind the gate

21. Refresh the AI model entries (all providers) as catalog writes with the
    ledger recording when and by what.
22. Contexts for non-integrations domains, if and only if a consumer
    exists — no speculative contexts.
23. Non-AI integrations beyond telegram/google as demand appears; each
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

*Nothing in §7 was executed at first writing. Phase 1 execution began the
same day; the log follows.*

---

## 8. Phase 1 execution log (9 Aug, same session)

### Measured so far

- **P1 broken, and in an unexpected direction.** The Google-assistant seed
  is in neither node_modules nor the stranded branch — the branch
  `work/2026-08-05-energy-and-honesty-repairs` **no longer exists in this
  repo at all** (state-pointer in project docs is stale). The seed source
  is commit `79fdfa7` on an **orphaned commit chain contained by no
  branch**, sitting atop two commits titled "Published your App" —
  something committed to git outside the normal flow and the lineage was
  abandoned. The registrations outlived their source's reachability.
- **Item 2 resolved: the orphan seed file is wired to nothing.** No
  reference to `bootstrap-assistants.json` or `seed-bootstrap-assistants`
  exists outside `assistants/seeds/` itself. Dead file; decision stands
  (wire it or delete it), now with certainty it never ran from this tree.
- **Item 6 diagnosed exactly.** `registered` in the integrations status
  route means "a provider config record exists"
  (`configs.some(c => c.provider === p)`), nothing more. The symbia-labs
  *adapter* is registered unconditionally in code
  (`initializeProviders()`); what's missing is the catalog resource
  `integrations/ai/symbia-labs/config`. The other three providers each
  have one (loaded at boot from `/api/bootstrap`, which serves
  bootstrap-flagged ∧ public-read ∧ published resources). The stale-process
  hypothesis is dead: the live status response contains the exact note
  string present in current source. Fix = one gated catalog write.
  Note: `loadProviderConfigs()` runs only at service boot — the flip to
  `registered: true` appears on next integrations start, not on write.
- **Item 7 half-resolved.** `/api/resources` filters by *access policy*
  (`filterResourcesByReadAccess`), not by a hardcoded published-only rule —
  that rule (`filterPublicResources`) applies to `/api/bootstrap` only. So
  drafts are enumerable to an authorized caller. The MCP listing (authed)
  returned zero drafts ⇒ the reported draft graph is not a catalog
  resource visible to this principal. Runtime hydrates only *published*
  graphs from the catalog (`sync.ts:185`); graphs POSTed directly to
  runtime live in runtime's own store, in-memory unless Postgres is up.

### Predictions registered before the live probes

- **P4:** `GET /api/resources?status=draft` (authenticated) returns zero
  resources; the draft graph will be found in the runtime service's graph
  store instead — and if runtime is in memory-mode, it may not have
  survived a restart at all.
- **P5:** the `integrations/ai/symbia-labs/config` write succeeds through
  the gate with role:admin, and `/api/integrations/status` continues to
  report `registered: false` until the integrations service is next
  booted (boot-time cache).

### Results of the live probes (same session)

- **Ports:** 5003/5006/5007 all listening — via **ssh port-forwards**
  (one PID), i.e. the stack runs remotely and the Mac tunnels to it.
- **P4: half broken, reported as broken.**
  `GET /api/resources?status=draft` (authenticated) → empty list ✓.
  But the runtime graph store holds exactly the 4 hydrated published
  graphs and **no draft** ✗. The draft graph Brian reports is findable in
  neither catalog nor runtime as measured. Consistent with runtime's
  in-memory mode losing it on restart — but that is inference; where the
  draft actually lives (control-center local state? another org?) is
  **not checked**.
- **P5: not reached.** The POST was refused upstream of the prediction:
  `403 — "You don't have permission to create resources"`. Observation:
  the `.mcp.json` credential can read the catalog but cannot create
  resources; the write gate held. This is not a platform defect — it is
  the gate doing its job against an under-entitled principal. Consequence:
  **every Phase 1 write (items 3, 4, 5, and the symbia-labs config) is
  blocked on an admin credential**, to be supplied or executed from an
  admin session. The prepared resource body (key
  `integrations/ai/symbia-labs/config`, published, public-read,
  bootstrap-flagged, `metadata.provider: "symbia-labs"`, no host or port
  baked in) is recorded here for that session.
