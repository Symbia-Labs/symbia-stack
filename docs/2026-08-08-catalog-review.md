# Catalog review — 79 entries, 8 August 2026

**Scope.** §1–§6 review the catalog itself, read against the running catalog
service on 5003. §7 follows one entry — `assistants/security` — down through the
assistants engine, because a question about how its steps reach a reply turned up
a vocabulary collision worth recording separately. §8 reviews Symbia Script,
reached from the same thread; **its findings were produced by executing the
shipped build, and F21 is the one to read first if you read nothing else.**

Source was consulted only to check whether an observed shape is enforced
anywhere. Observations are labelled. Inferences are labelled separately and are
disputable. Things not checked are listed as not checked and are not scored.

Two findings in §2 (F5, F6) were **wrong in the first draft and corrected by the
source**. The wrong versions are left in place with the corrections rather than
deleted. Anyone reading this to form a view of the platform should read those two
as evidence about the reviewer, not only about the code.

---

## 1. What is actually there

**Observation.** `symbia_stack_health` reports catalog healthy on 5003,
`Symbia Object Service API` v1.0.0, 19ms. 8/9 services healthy; `network` probed
at **5054** and unreachable. That is the same 7 Aug observation, unchanged — the
installed MCP server build has not picked up the move to 5009. Whether that is
the tool or the service remains uninferred here.

**Observation.** `/api/resources` returns `total: 79`, `has_more: false`.
Distribution:

| type | count |
|---|---|
| integration | 31 |
| assistant | 20 |
| component | 16 |
| context | 5 |
| graph | 4 |
| app | 3 |
| **total** | **79** |

The type enum in `catalog/shared/schema.ts` is
`["context","integration","graph","assistant","component","app"]` — six types,
all six populated. There is no `type` resource type, despite the phrase "types,
graphs, components, apps" in the project's own system map. The `point` resource
type is referenced as deferred in the `apps/energy` manifest (D2).

**Observation.** Catalog components (16) and runtime components (16) agree
one-for-one by id. No membership drift.

---

## 2. Findings

### F1 — Every one of the 79 resources has `status: "published"`

**Observation.** The schema defines `["draft","published","deprecated"]` and the
column defaults to `draft`. Nothing in the catalog is in either other state.

A field whose value is constant across the entire population carries no
information. There is a `POST /api/resources/:id/publish` route, so the
transition exists in the API and has evidently never left a resource behind in
`draft`, and nothing has ever been deprecated. This is the "confident zero"
shape from discipline 6 wearing a different hat: `published` here means "exists",
not "reviewed and promoted". The eleven-plus stale model entries in §F6 are all
`published`, which is the cost.

### F2 — Component manifests declare ports but type none of them

**Observation.** `ComponentManifest.inputs/outputs` are `ComponentPort`, which
has an optional `schema` (JSON Schema) field. All 16 registered components
declare ports as bare `{"name": "in"}`. Zero port schemas exist.

The schema file's own comment says manifests exist "so a graph node referencing
this component can be validated against a contract at load time." With no port
schemas, the only thing validatable at load time is whether a port *name*
exists. A graph that wires a string into an arithmetic node passes every check
the catalog can perform.

### F3 — Component **config** is prose, not contract

**Observation.** No component manifest has a `config` field. Every component's
configuration is described in the `description` string:
`config.select`, `config.keyField`, `config.valueField`, `config.expected`,
`config.op`, `config.intervalMs`, `config.size`, `config.expression`,
`config.mapping`, `config.ports`, `config.url`, `config.ms`, `config.level`,
`config.labels`, `config.valueField` with dotted-path support.

`apps/*` manifests, by contrast, *do* carry a typed `config` block with
`type`/`required`/`default`/`description`. The app model got a config schema and
the component model did not. This is the single largest gap between what the
catalog claims to be (a public contract) and what it can enforce.

### F4 — The catalog manifest omits the apocryphal lane

**Observation.** The runtime descriptor for `symbia.io.http-request` carries
`emitsApocryphal: true`. The catalog resource
`components/symbia.io.http-request` carries no equivalent field; the property
survives only as a sentence in the description
("Output is apocryphal: a remote body cannot be recomputed from the graph").
The same is true of `symbia.state.rollup`, whose apocryphal behaviour on missing
inputs is described in prose only.

The provenance lane is the platform's central claim, it is machine-readable in
the runtime, and it is not machine-readable in the artifact that is designated
the public contract. A consumer reading only the catalog cannot tell a canonical
component from an apocryphal one without parsing English.

### F5 — Both registered ingresses have `capability: null`

**Observation.** `ingress/energy-pipeline` and `ingress/order-margin` both carry
`metadata.capability: null` and
`metadata.authorization: "member of org 2c29d1dd-…"`.

**Correction — I got this wrong on the first pass and the source corrected it.**
My first draft recorded this as a gate that had degraded to org membership, and
flagged the runtime behaviour as not checked. `runtime/server/src/catalog/
ingress.ts` documents `capability` as deliberately optional: *"Capability a
caller must hold to deliver. Optional: when absent, org membership governs.
When present, it is required in addition."* Null is the designed default, not a
hole. Delivery is checked against the owning org either way.

**What survives, in weaker and more accurate form.** The optional second gate has
never been exercised: zero of two registered ingresses declare a capability, so
the "required in addition" path has no instance in this catalog and is untested
against a real caller. That is worth one graph in §5.2 and is not worth alarm.

Recording the wrong version here rather than deleting it, because "the gate is
open" was an inference dressed as an observation, and it is the shape of error
discipline 7 exists to catch.

### F6 — Ingress resources are typed `integration` — by ruling, not by accident

**Observation.** Both carry `type: "integration"`, `kind: "runtime.ingress"`,
keys under `ingress/`. My first pass called this a misfiling. The source states
the reasoning explicitly: *"Registered as an `integration` because that is what
an ingress is from the platform's side: a declared connection point with an
owner, an address and an authorisation rule."*

So this is a settled decision I happen to find debatable, not a defect. The
argument against it is only that an integration carries an outbound credential
and an ingress carries an inbound gate, so the two share a type while having
opposite trust directions — which means a caller listing integrations to find
what the platform can *reach* gets back two things that reach nothing. If that
never bites, the ruling costs nothing. Noting it and moving on; the proposal in
§5.5 is downgraded accordingly.

One real consequence either way: the integration count of 31 is 29 outbound
integrations plus 2 inbound surfaces, and no tag distinguishes them beyond
`ingress`.

### F7 — Model integrations are stale, and nothing measures freshness

**Observation.** Newest Anthropic entries are `claude-opus-4-20250514` and
`claude-sonnet-4-20250514`. Newest OpenAI entries are `gpt-4o`, `o1`, `o3-mini`,
`gpt-4-turbo`. All are `status: "published"`. Twenty-two of the 31 integrations
are model entries.

**Observation.** `context/integrations.model` defines a schema with
`contextWindow`, `maxOutputTokens`, `pricing`, and `capabilities`. Nothing in the
resource list indicates those fields are populated per model; capability is
discoverable only by reading the model's name and tags. A caller wanting "a model
that can see an image" — which is exactly what the spyglass wanted — cannot ask
the catalog that question.

The catalog is the thing that asserts what capability exists. A model catalog
that ages silently asserts capability it cannot substantiate.

### F8 — Two id schemes and at least three key conventions

**Observation, ids.** Some resources have UUID ids
(`d9a216a3-…` for `assistants/docs`), others have slug ids (`ast-echo`,
`int-openai-gpt4o`, `ctx-integrations-model`). Roughly: February-era bootstrap
seed uses slugs, August-era registration uses UUIDs.

**Observation, keys.** Three conventions coexist:

- path style — `graphs/order-margin`, `components/symbia.state.join`, `apps/energy`
- dotted style — `energy.graph.pue`, `energy.graph.ingest`
- bare — `telegram`

The two energy graphs registered under `energy.graph.*` and the one under
`graphs/energy-pipeline` are the same category of thing filed two ways. Any
tooling that resolves a graph by key must know both, or silently miss one.

### F9 — Tag vocabulary is unnamespaced except where it isn't

**Observation.** Contexts use prefixed tags (`category:integrations`,
`pack:Core`). Nothing else does. Bootstrap assistants carry `level-1`…`level-5`;
the five scoped assistants (`docs`, `interfaces`, `codebase`, `observability`,
`security`) carry no level. `apps/control-center` is the only resource tagged
`privileged`, and that tag is the informal shadow of the `manifest.privilege`
block that resource also carries — the same fact stated twice, once
structurally and once as a string.

Tags are the only query axis `symbia_list_resources` exposes besides type and
free text, and the vocabulary is unenforced.

### F10 — The app resource is both the artifact and the installation

**Observation.** `apps/control-center` config schema says, verbatim:
"An org id must never be baked into the artifact — it belongs to the
installation." The same resource carries `orgId: "2c29d1dd-…"` at the row level.
`apps/energy` likewise. `principal: null` on both.

**Inference, disputable.** This is not necessarily the defect it looks like: if
the catalog row *is* the installation record, an orgId on it is correct. But
then there is no separate artifact — the portable thing and the deployed thing
are one row, which is the distinction `docs/APP-MODEL.md` exists to draw, and
that document is marked *design agreed, not fully implemented*. The observation
is that a resource states a rule in its own config text and the row it sits in
does not visibly follow it. What that means is open.

### F11 — Component versions move as a bundle

**Observation.** All 16 component manifests report `version: "1.2.0"`.
`apps/energy` requires seven of them at `@^1.2.0`.

If every component's version changes together, the caret ranges express nothing:
a component cannot be upgraded without bumping the fifteen that did not change,
and a consumer cannot pin one. Independent versioning is what makes a manifest
range a contract rather than a decoration.

### F12 — `implementation: "expression" | "wasm" | "integration" | "remote-service"` is unexercised

**Observation.** All 16 registered components are `implementation: "builtin"`.
Four of the five declared implementation kinds have zero instances.

The catalog's stated purpose is that capability enters only through a gated
registered write. The four unused kinds are precisely the ones that would let
capability enter *without* a runtime rebuild. Their being empty means every new
capability so far has arrived by editing and redeploying the runtime — which is
a working arrangement, but it is not the one the enum describes.

### F13 — Contexts cover one category only

**Observation.** All 5 contexts are `category:integrations`, `pack:Core`,
`isBootstrap: true`, created 2026-02-11, untouched since. There is no context for
provenance, trace, execution, ingress, coverage, or component config — including
for shapes that are already emitted by running code (`symbia.state.rollup`
emits `{value, op, coverage, present, missing}` against no shared schema).

Contexts are the catalog's only mechanism for a shared, versioned, JSON-Schema'd
shape, and they have been used for one subsystem, once, six months ago.

### F14 — Surfaces that exist in the API and appear unused

**Observation.** The routes file exposes `/api/resources/:id/signatures`,
`/certifications`, `/artifacts`, `/versions`, and `POST /api/nl/search`.
Every resource reports `currentVersion: 1`.

**Not checked.** Whether signatures, certifications, or artifacts have any rows.
Reported as not checked, not as empty.

---

## 3. Not checked

Listed so no reader infers a pass from absence.

- Row counts for signatures, certifications, artifacts (F14).
- Whether a caller *without* org membership is actually refused at
  `POST /api/ingress/:graphName`. The code says it is checked; no request was
  made to confirm it. (F5 — the capability question is answered, the org
  question is not.)
- Whether `RUNTIME_MANIFEST_ENFORCEMENT=strict` is set in this instance, and
  therefore whether the manifest contract is enforced at all right now.
- Whether the model integrations' `contextWindow`/`pricing`/`capabilities`
  fields are populated — inferred from the list projection, not fetched per
  resource.
- Whether `network` is listening on 5009. Only the 5054 probe was observed.
- None of this was checked in a browser. This is an API review.

---

## 4. Optimizations, ordered by what they unlock

1. **Give component manifests a typed `config` schema** (F3). Everything else in
   this list is easier afterwards, and it converts fourteen prose contracts into
   validatable ones. The app manifest already shows the shape to copy.
2. **Put the provenance lane in the manifest** (F4). A `lane` or
   `emitsApocryphal` field on outputs. The product's central claim should be
   readable from the public contract without natural-language parsing.
3. **Populate port schemas** (F2), starting with the components whose ports carry
   structured payloads — `state.join.out`, `state.rollup.out`, `state.window.out`.
4. **Exercise the optional ingress capability once** (F5) — declare one on a
   throwaway graph and deliver to it both with and without the capability. The
   second gate is designed, implemented, and has no instance.
5. **Make `status` mean something** — a deprecation pass over the model entries
   would be the first non-`published` row in the catalog's history (F1, F7).
6. **Add a `capabilities` field to model integrations** and populate it from the
   existing `context/integrations.model` schema (F7). "Which models can see an
   image" should be a catalog query.
7. **Pick one key convention and one id scheme, then add a lint** (F8). The
   `check-ports.ts` precedent — fail the build on a literal `5054` — is the
   pattern: fail the build on a key that does not match the convention.
8. **Namespace the tag vocabulary** and remove `privileged` as a free string in
   favour of the structural `manifest.privilege` (F9).
9. **Tag inbound surfaces distinctly** so a list of integrations does not mix 29
   things the platform can reach with 2 things that reach it (F6).
10. **Version components independently** (F11), or state plainly that they ship
    as a bundle and drop the caret ranges.
11. **Exercise one non-builtin implementation kind** (F12) — `expression` is the
    cheapest — so the enum stops being aspirational.
12. **Write the contexts the running code already needs** (F13), starting with
    the rollup coverage shape, which exists in emitted data and nowhere else.

---

## 5. New entries — at least ten per category

Proposals only. Nothing here is registered. Each is scoped to be reusable, per
the standing rule that the catalog holds reusable items and never point
instances, and to keep domain vocabulary out of public contracts.

### 5.1 Components (16 registered → 16 proposed)

| key | why |
|---|---|
| `symbia.provenance.receipt` | Emits the receipt for a canonical value — inputs, expression, output hash. The platform's central claim has no component. |
| `symbia.provenance.attest` | Tags a value with its lane and the reason, so lane is data rather than convention (F4). |
| `symbia.logic.refuse` | Terminal node emitting a typed refusal with cause. Refusal is currently expressed by the *absence* of an edge; "blank beats green" deserves a node. |
| `symbia.logic.assert` | Invariant check that fails an execution loudly rather than passing a wrong value downstream. |
| `symbia.validate.schema` | JSON Schema gate with `pass`/`fail` ports. Prerequisite for F2 having teeth at runtime. |
| `symbia.compute.expression` | Sandboxed expression node — instantiates the `expression` implementation kind that exists only in the enum (F12). |
| `symbia.compute.unit` | Unit-aware arithmetic. Catches the power-vs-energy class of error that arithmetic over bare numbers structurally cannot. |
| `symbia.io.integration-call` | Calls the integrations gateway with a credential resolved from identity. The spyglass did this from a graph's edge; as a component it becomes reusable capability instead of one panel's plumbing. |
| `symbia.io.retry` | Bounded retry with backoff around an apocryphal call, marking retried output distinctly from first-attempt output. |
| `symbia.source.ingress` | Explicit ingress entry node, so `metadata.ingress {node, port}` points at something that declares itself rather than at whichever passthrough happens to be first. |
| `symbia.sink.object` | Writes to the logging service's object store. Objects are a logging capability with no graph surface. |
| `symbia.state.dedupe` | Suppress repeats by key within a window. Every ingest graph reimplements this. |
| `symbia.state.rate` | Counter-to-rate derivative. The most-reimplemented operation in any metrics pipeline. |
| `symbia.state.expire` | TTL on keyed state, so `state.latest` cannot serve a stale value without saying it is stale. |
| `symbia.logic.merge` | Fan-in with a declared arrival policy (all / any / first-wins). Two independent branches currently cannot rejoin without going through a keyed stream. |
| `symbia.transform.select` | Path-based extraction without a full mapping table — the common case `transform.map` overserves. |

### 5.2 Graphs (4 registered → 12 proposed)

| key | why |
|---|---|
| `graphs/manifest-conformance` | Asserts every catalog manifest's ports match the runtime's. Would have caught F4 mechanically. |
| `graphs/catalog-drift` | Diffs catalog component set against runtime component set on a timer. Instrument that does not share the catalog's optimism. |
| `graphs/ingress-capability-probe` | Declares a capability on a throwaway ingress and delivers to it with and without that capability, recording both outcomes. Gives the optional second gate its first instance (F5). |
| `graphs/trace-selftest` | A timer-origin call, to exercise P5 in `docs/2026-08-08-trace-propagation.md`, which is currently *not checked*. |
| `graphs/refusal-reference` | The canonical refusal shape, in-platform. Today the testable reference implementation of refusal semantics lives outside the platform, by declaration, in `derive.py`. |
| `graphs/lane-reference` | One canonical branch, one apocryphal, one refused, small enough to read in one screen. The provenance thesis as a runnable artifact. |
| `graphs/retrieval-verbatim` | Retrieve-and-quote with a source hash — the second of the four stated provenance modes, which has no graph. |
| `graphs/composed-scorecard` | Compose over cited material and emit the claim-by-claim scorecard — the third mode, also with no graph. |
| `graphs/coverage-watch` | Generic freshness watchdog over any keyed stream. Emits coverage, never a boolean. |
| `graphs/backpressure-probe` | Measures what the runtime does when a sink is slower than its source. Currently unknown. |
| `graphs/service-health-rollup` | Rollup across the nine services using `state.rollup`, exercising `coverage`/`missing` against data that can actually be partial. |
| `graphs/second-domain-refusal` | The refusal case in `order-margin`, so refusal semantics are never validated against energy alone. |

### 5.3 Apps (3 registered → 12 proposed)

| key | why |
|---|---|
| `apps/conformance` | The platform testing itself, packaged as an installable app rather than as scripts. |
| `apps/app-template` | The minimal installable app. The app model's only two references are the operator console and a data-centre pipeline — the hardest case and a domain case, with no simple one. |
| `apps/catalog-hygiene` | Reports key-convention violations, id-scheme splits, orphans, and status monoculture (F1, F8, F9). |
| `apps/provenance-explorer` | Walks a receipt back to its sources. The UI the product claim implies and does not have. |
| `apps/trace-explorer` | Reads `x-symbia-caller` and distinguishes "no caller because timer-origin" from "no caller because propagation failed". Nothing in the UI reads caller today, and collapsing those two is named as forbidden. |
| `apps/ingress-tester` | Delivers to a declared ingress with and without the capability, recording both outcomes. Turns F5 into a repeatable measurement. |
| `apps/installation-inspector` | For one installation: which config values are set against which schema-required keys. The artifact/installation split made visible (F10). |
| `apps/upgrade-preflight` | Runs `checkRequires` for every installed app against the current platform before an upgrade. The function exists; nothing calls it ahead of time. |
| `apps/model-freshness` | Compares model integrations against provider catalogs and proposes `deprecated` transitions (F1, F7). |
| `apps/mcp-inventory` | Represents the measured MCP tool surface as catalog-visible capability instead of a count in a document. |
| `apps/defect-ledger` | `energy/API-MEASUREMENTS.md` as a platform resource, since the ledger — not the energy app — is the stated deliverable. |
| `apps/prediction-register` | Registers a prediction before a measurement and records whether it broke. Discipline 1, mechanized. |

### 5.4 Assistants (20 registered → 14 proposed)

| key | why |
|---|---|
| `assistants/provenance` | Answers only with a receipt or a refusal. The thesis as an assistant. |
| `assistants/cited-summarizer` | Composed mode with a claim-by-claim scorecard; cites or refuses. |
| `assistants/api-explorer` | Answers "can this be built through the Symbia API alone" — the project's governing rule, as a tool that logs the answer when it is *no*. |
| `assistants/catalog-librarian` | Key conventions, naming, and where a new resource belongs (F8, F9). |
| `assistants/graph-author` | Writes Symbia Script against the manifest contract and refuses to reference an unregistered component. |
| `assistants/manifest-reviewer` | Enforces "no domain vocabulary in public contracts". The 6 Aug audit as a standing check rather than a one-off. |
| `assistants/deprecation` | Proposes status transitions with evidence. Would produce the catalog's first non-`published` row (F1). |
| `assistants/incident` | Walks one trace id across the nine services. |
| `assistants/service-resolver` | Resolves service ids to ports from `@symbia/sys`, so nobody types a port literal again. |
| `assistants/onboarding` | Level 0 — the missing rung below Echo. Explains what the stack is before any capability is exercised. |
| `assistants/model-router` | Selects a model by declared capability from the model context, not by name (F7). |
| `assistants/slack` | A level-4 integration sibling that is not Google. Level 4 is currently five Google assistants and nothing else. |
| `assistants/db-query` | Level-4 read-only query assistant, behind the connector interface the standing constraints reserve. |
| `assistants/spreadsheet-analyst` | Level-3 hybrid over tabular data, deterministic-first — the level-3 tier has two members. |

*Deliberately not proposed:* an arbiter or adversarial reviewer assistant. Those
keep isolated context and browser-only tools by ruling, and registering one in
the shared catalog destroys the channel isolation that is their entire value.

### 5.5 Integrations (31 registered → 15 proposed)

| key | why |
|---|---|
| `integrations/ai/*/models/*` — current generation | Refresh Anthropic and OpenAI to the current generations, with `contextWindow`, `maxOutputTokens`, `pricing` and `capabilities` populated per the existing model context schema (F7). Names to be read from the providers at registration, not from memory. |
| `integrations/ai/*/vision` capability tagging | A vision-capable entry discoverable *as* vision. The spyglass needed exactly this and had to know a model name instead. |
| `integrations/ai/embeddings/<non-openai>` | A second embedding provider, so retrieval is not single-sourced. |
| `integrations/symbia-labs/models/*` | Local GGUF siblings. One local model is registered against an entire `models` service. |
| `integrations/generic/openapi-url` | Register a provider by pointing at its OpenAPI document. Makes adding an integration a gated catalog write rather than a code change — which is the platform's own stated theory of how capability should enter. |
| `integrations/generic/mcp-server` | A catalog representation for an MCP server and its tools, so the measured tool surface is registered capability. |
| `integrations/generic/webhook-out` | The outbound counterpart to a declared ingress. |
| `integrations/channels/slack` | `channel` is currently a category of one (Telegram). |
| `integrations/channels/discord` | Second non-Google channel; also the cheapest end-to-end messaging test. |
| `integrations/channels/smtp` | Generic mail, so email is not Gmail-only. |
| `integrations/storage/s3` | S3-compatible object storage. |
| `integrations/data/postgres` | Read-only SQL, behind the connector interface — the shape the deferred GreptimeDB/Influx/Elastic connectors will need. |
| `integrations/observability/otlp` | OTLP export, so trace context that is minted internally can leave the stack. |
| `integrations/identity/oidc` | A generic SSO provider entry. |
| *(not a proposal)* `ingress/*` reclassification | Withdrawn. The `integration` typing is a stated ruling with reasoning in `catalog/ingress.ts`, not a misfiling. At most, a tag that separates inbound surfaces from outbound capability in list queries (F6). |

### 5.6 Contexts (5 registered → 13 proposed)

| key | why |
|---|---|
| `context/provenance.receipt` | The receipt shape. The product's central object has no schema. |
| `context/provenance.lane` | `canonical` \| `apocryphal` \| `refused`, with `reason` required on refused. Makes F4 expressible. |
| `context/component.config` | The meta-schema for component config. Directly unblocks F3. |
| `context/coverage` | `{present, missing, coverage}` — already emitted by `state.rollup` against no shared schema (F13). |
| `context/trace.context` | `x-symbia-trace` / `x-symbia-caller`, including the two distinct meanings of "no caller", so the distinction is schema'd rather than remembered. |
| `context/runtime.execution` | Execution status and result shape. |
| `context/ingress.declaration` | `{node, port, capability}` with capability required non-null (F5). |
| `context/app.installation` | The installation record — org, config values, secret references — as a shape distinct from the app artifact (F10). |
| `context/identity.principal` | The principal shape both app manifests currently set to `null`. |
| `context/metric.series` | Name, unit, labels. Unit is where the power-vs-energy error class lives. |
| `context/service.identity` | Id, port, registered, running. The one place "registered ≠ running" is expressed, as a schema. |
| `context/catalog.key` | The key convention as a validatable pattern, so F8 can be linted rather than remembered. |
| `context/prediction` | A registered prediction, its expected value, and its outcome. Discipline 1 as a shape. |

---

## 6. Suggested order — catalog

F3 and F4 first — both are additive manifest fields, neither breaks a consumer,
and together they make the component catalog a contract instead of a description.
`context/component.config` and `context/provenance.lane` are their schemas, so
those two contexts come with them. Then measure F5 before touching it. The key
and id conventions (F8) are the cheapest thing that stops the divergence getting
worse, and the `check-ports.ts` precedent shows exactly how to enforce them.

Everything in §5 is a proposal. None of it is registered, and registering any of
it is a gated catalog write like any other.

---

## 7. One entry, followed down: `assistants/security` and the word "recall"

Started as a question about how the Cybersecurity assistant's steps reach a
reply. The execution chain is sound. The **vocabulary around it is not**, and the
collision is the finding.

### 7.1 What the assistant actually contains

**Observation.** `assistants/security` (`3d0e1985-…`, created 2026-08-08) holds a
`ruleSet` of three rules. The one that answers, `sec-posture` (priority 200),
has six actions in order:

| id | type | detail |
|---|---|---|
| `c1` | `service.call` | `GET identity /credentials` → `resultKey: credentials` |
| `c2` | `service.call` | `GET identity /users` → `resultKey: users` |
| `c3` | `service.call` | `GET integrations /integrations/status` → `resultKey: providers` |
| `c4` | `service.call` | `GET network /sdn/topology` → `resultKey: topology` |
| `step-answer` | `llm.invoke` | anthropic / claude-sonnet-5, 900 max tokens |
| `step-send` | `message.send` | content `{{steps.step-answer.response}}` |

Each `service.call` forwards the caller's bearer token and `rawOrgId` — not
`context.orgId`, which is the composite `{assistantKey}:{orgId}` used for rule
scoping and which services reject or mis-scope. On success the parsed JSON lands
at `context.context[resultKey]`; `llm.invoke` interpolates `{{credentials}}`,
`{{users}}`, `{{providers}}`, `{{topology}}` into its user prompt.

### 7.2 How the steps reach the reply's provenance

**Observation.** `rule-executor.ts:130–139` pushes a `ProvenanceStep` per action:
`id`, `action`, `source` (from `describeSource`), `ok`, `ms`, and `outputDigest`
= `sha256(output)` truncated to 16 chars. `provenance.ts` is explicit that this
is a digest and not the payload — *"a reply's receipt should not become a second
copy of the data it describes."* For an assistant whose first call is
`GET /credentials`, that choice is load-bearing.

`seal()` is called in exactly one place: inside `message.send`
(`actions/message.ts:45`). `classify()` then sees four `service.call` (counted as
`retrieved`) plus one `llm.invoke` (counted as `model`), with
`contentFromModel: true`, and returns **COMPOSED** — basis naming all four
sources and stating outright that whether the model represented them faithfully
is not checked. That is the correct arena, arrived at from what happened rather
than from what was declared.

### 7.3 F15 — "recall" names two opposite operations

This is the finding. Three layers define the word and they do not agree.

**Layer 1 — the routine editor.** `RoutineEditor.tsx:17` defines the ten step
primitives and documents `recall` as **"Retrieve from context"**, with
`params.contextKey` shared with `remember`. Its placeholder reads verbatim:
*"Use @context.property to fetch data."* So a recall step is authored as a
context read expressed in Symbia Script. This is the design intent and it is
coherent.

**Layer 2 — Symbia Script.** `symbia-sys/src/script.ts` is a reference and
interpolation grammar, not a step language: `@namespace.path` over twelve
namespaces (`context`, `message`, `user`, `org`, `service`, `integration`, `var`,
`env`, `component`, `catalog`, `entity`, `mention`), plus `{{…}}` interpolation.
The token `recall` does not appear in it. A recall step is therefore not a
Symbia Script construct — it is a step type whose *description field* is expected
to contain Symbia Script.

Reading also needs no step: every action param passes through `interpolate()`, so
`@context.x` resolves anywhere a string appears. The handler registry has a
`ContextUpdateHandler` (`context.update`, the `remember` half) and no read
handler, because the read is ambient. **Recall-as-context-read having no executor
is correct design, not a gap.**

**Layer 3 — the projection.** `assistant-loader.ts:384`, in `actionToStep()`:

```ts
case 'service.call':
  return { id, type: 'recall',
           description: `@${params.service}.${params.path}`,
           params: { contextKey: params.resultKey } };
```

A `service.call` is a live HTTP GET that can fail and that `classify()` counts as
`retrieved` when sealing an envelope. So `recall` now denotes both *"read a value
already in context"* — free, local, certain, no provenance weight — and *"fetch
over the network"* — costly, fallible, provenance-bearing. On this assistant, all
four recalls are the second kind.

Two operations at opposite ends of cost, trust and provenance share one label in
the operator-facing view. This is the `b8bef8e` shape — *"dropped was an
inference, and the wrong one"* — recurring in UI vocabulary rather than in status
copy.

### 7.4 F16 — the editor teaches namespaces the resolver does not implement

**Observation.** The `recall` examples in `RoutineEditor.tsx` are `@logs.recent`,
`@user.preferences`, `@metrics.summary`. `defaultRoutines.ts` seeds thirty-plus
more as plain description strings: `@logs.query`, `@alerts.active`,
`@catalog.search`, `@catalog.similar`, `@runs.get`, `@runs.trace`,
`@runs.compare`, `@metrics.export`, `@billing.summary`, `@docs.search`,
`@cli.commands`, `@cli.help`, `@code.context`, `@code.style`, `@code.diff`.

Of those namespaces, only `catalog` and `user` exist in `SymbiaNamespace`. The
valid form for a service read is `@service.logging./logs/query`. The editor's own
teaching examples would not parse.

**Inference, disputable.** These are placeholder/scaffold strings in a UI that
does not execute them, so nothing is currently broken by it. The cost is that an
author learning the system from the editor learns a syntax that does not exist.
*Not checked:* whether any of these default routines has ever been saved onto a
real assistant.

### 7.5 F17 — the routine projection is lossy, one-way, and covers 3 of 10 types

**Observation.** `actionToStep()`'s switch handles three action types —
`message.send`→`say`, `llm.invoke`→`think`, `service.call`→`recall`. Everything
else hits `default` and renders as `say` with description `Execute: {type}`.
The registry has at least twenty handlers (`tool.invoke`, `integration.invoke`,
`context.update`, `webhook.call`, `state.transition`, `handoff.*`, `condition`,
`loop`, `parallel`, `assistant.route`, `embedding.route`, `code-tool.invoke`,
`workspace.*`, `notify`, `wait`).

**Observation.** There is no inverse. `grep -rn "routinesToRuleSet\|stepToAction"`
returns nothing. `method` is dropped in the projection (`GET` vs `POST` is not
recoverable from `@identity./credentials`).

So the routine view is a read-only, lossy projection of a subset — which is fine
if it is understood as a view, and dangerous the moment anyone wires an editor
save path back through it. Seven of the ten step primitives can be expressed in
the editor and have no action to compile to.

### 7.6 F18 — a failed step produces silence, not the refusal the prompt promises

**Observation.** `rule-executor.ts:141` breaks the action loop on the first
failure. `seal()` lives only inside `message.send`. So if `c4` fails, the three
successful fetches are discarded, no message is sent, and no envelope exists.

Nothing false is emitted — that is the safe direction. But the assistant's own
system prompt instructs: *"If the data does not contain the answer, say exactly
what is missing and which service would have it."* On the failure path the model
never runs, so that refusal is unreachable by construction. **The assistant can
only keep its stated promise when nothing has actually gone wrong.**

The four-mode claim — computed, retrieved, composed, or *honestly refused* — has
its refusal mode structurally unavailable here.

### 7.7 F19 — `classify()` has no coverage concept (latent)

**Observation.** `classify()`'s `REFUSED` branch fires only when
`ok.length === 0`. Three-of-four succeeded then aborted yields
`retrieved.length = 3`, `contentFromModel = false` → **RETRIEVED**, basis
*"content returned verbatim from …"*.

Today that is unreachable, because `seal()` runs inside `message.send`, which is
after the break. It is latent, not live. Recorded because it is the same concern
`symbia.state.rollup` already handles correctly in the runtime — a partial
rollup goes out on the apocryphal lane with `{coverage, present, missing}`,
because *"a partial total must not pass as the total."* The runtime
implementation has the coverage concept; the assistant classifier does not.

**One shared concern, two independent implementations — discipline 8.** Patching
the runtime's version reached the assistants' version not at all.

### 7.8 F20 — `contentFromModel` is decided by a substring match

**Observation.** `actions/message.ts:43`:

```ts
const contentFromModel = modelStepIds.some((id) => template.includes(id));
```

Correct here: `"{{steps.step-answer.response}}".includes("step-answer")`. The
comment defends deciding this at send time, from the template, and that
reasoning holds — it is the only place both facts are available.

The failure direction that matters: an `llm.invoke` step whose id does **not**
appear literally in the send template yields `contentFromModel: false`, and with
any successful `service.call` present that classifies as **RETRIEVED** —
"returned verbatim from a named source" — over text a model wrote. Most other
collisions degrade downward, which the file explicitly intends. This one does
not.

### 7.9 Not checked — §7

- Whether `c4` (`network /sdn/topology`) actually succeeds. `@symbia/sys` has
  `NETWORK: 5009` in both `src` and `dist`, so the assistant probably resolves it
  correctly and the 5054 `unreachable` in §1 is the stale MCP `dist` — but that
  is an inference and one request settles it.
- Whether any `defaultRoutines.ts` entry has been saved onto a live assistant.
- Whether the routine view is reachable in the running console at all. None of
  §7 was checked in a browser.
- What the outer handler surfaces to the user when a rule aborts before
  `message.send` (F18) — silence, an error string, or nothing at all.

### 7.10 Suggested order — assistants

1. **Split the word** (F15). `recall` for context reads, something else —
   `fetch`, `call`, `consult` — for `service.call`. One label per trust level.
   Cheapest fix here and it prevents the confusion hardening into saved routines.
2. **Fix or remove the editor examples** (F16). They should either parse as
   Symbia Script or not look like it.
3. **Give F18 a refusal path**: on abort, seal a `REFUSED` envelope naming the
   failed step and the service, and send it. The classifier already produces the
   basis string; nothing sends it. This makes the fourth mode real.
4. **Give `classify()` coverage** (F19), modelled on `symbia.state.rollup` — and
   consider whether the two should be one implementation rather than two.
5. **Replace the substring test** (F20) with an explicit reference parse.
6. **Mark the routine view read-only in the UI** until an inverse exists (F17).

### 7.11 Registered predictions

Per discipline 1, before any browser check:

- **P1** — `c4` succeeds; `network` is listening on 5009 and the 5054
  `unreachable` is the stale MCP `dist`. *Confidence: high.*
- **P2** — Asking the Cybersecurity assistant a matching question returns a
  reply whose envelope arena is `COMPOSED` with four `service.call` steps
  recorded `ok: true`. *Confidence: high.*
- **P3** — The control center renders those four steps labelled "Recall" with
  the amber `#f59e0b` / 🔍 treatment from `routineFlowUtils.ts`.
  *Confidence: medium — not verified that this panel is reachable post-rebuild.*
- **P4** — Stopping the network service and re-asking produces **no assistant
  message at all**, not an error and not a refusal. *Confidence: medium. This is
  the one I expect to get wrong* — the outer handler may well surface something,
  and if it does, F18 is milder than written.
- **P5** — No saved assistant in the catalog contains a step type outside
  {`say`, `think`, `recall`}. *Confidence: high.*

---

## 8. Symbia Script — moved

Split out on 8 Aug to **`docs/2026-08-08-symbia-script-review.md`**.

It was findings F21–F29 over `symbia-sys/src/script.ts`, all measured against
the shipped `dist/` build: the arithmetic component substituting `0` for absent
inputs (F21, fixed — see §12), `containsRefs()` returning alternating answers
for one string, every email address parsing as a reference, `validateTemplate()`
passing unknown namespaces because it discards its own warnings, four
disagreeing namespace lists, `@org.id` returning the composite, and `@env`
having no allowlist.

Moved because it had stopped belonging here — this document reviews a registry;
that one reviews a reference syntax.

## 9. Built: F3 and F4

Code only. **Nothing has been written to the running catalog** — the manifests
republish themselves through `syncComponentManifests` on the next runtime boot,
which is the platform's own gated write path. No seed script, no hand-edit.

### 9.1 What changed

| file | change |
|---|---|
| `runtime/.../executor/components.ts` | New `ConfigField` and `PortLane` types; `ComponentDefinition` gains optional `config` and `lanes`. Purely additive — `inputs`/`outputs` stay `string[]`, so nothing downstream ripples. |
| `runtime/.../executor/components{,-state,-sinks,-sources}.ts` | All 16 builtins declare a typed config contract and a per-output lane. |
| `runtime/.../catalog/manifests.ts` | `ManifestPort` gains `lane`/`laneNote`; `ComponentManifest` gains `config`. `buildManifests` derives lanes, falling back to `emitsApocryphal`. Contract version **1.2.0 → 1.3.0**. |
| `catalog/shared/schema.ts` | Mirrors the above in the authoritative type and its zod schemas. |

Two decisions worth stating, because both could have gone the lazy way:

**`config` is optional, not defaulted to `{}`.** `{}` asserts "this component
takes no configuration"; `undefined` says "nobody has declared one". Collapsing
them would be the confident-zero defect in the very change meant to reduce it.
The zod schema deliberately omits `.default({})`.

**`conditional` is a real lane value, and requires a note.** Three ports are
genuinely data-dependent — `state.rollup.out` (canonical only when `missing` is
empty), `state.window.out` (an unfilled window reports over fewer values),
`state.latest.snapshot` (no freshness guarantee). Forcing those into
canonical/apocryphal would have been tidier and false.

### 9.2 Measured, not assumed

`buildManifests()` executed against a tsc build of the changed files:

```
components: 16
config undeclared: none
output lanes: {"inherit":12,"apocryphal":7,"canonical":2,"conditional":3}
conditional ports: state.latest.snapshot, state.window.out, state.rollup.out — all three carry a note
```

Then `syncComponentManifests` against a stub catalog, because a publisher that
cannot see its own new fields is a silent no-op and the version bump would have
masked that for exactly one release:

| scenario | result | expected |
|---|---|---|
| catalog holds the old v1.2.0 shape | 16 updated, 0 unchanged | migrates ✓ |
| catalog already holds what we publish | 0 updated, 16 unchanged | idempotent ✓ |
| one output lane quietly flipped | only `symbia.compute.arithmetic` updated | detected ✓ |
| one config default quietly changed | only `symbia.state.join` updated | detected ✓ |
| config keys reordered | 0 updated | not drift ✓ |

The last row matters: without canonicalised comparison every reconcile pass
would PATCH all 16 and fill the ledger with writes that changed nothing.

### 9.2b Shipped — and the near-miss that nearly passed as success

Booted 8 Aug 14:53–14:56. **F30 is the finding; read it before the result.**

#### F30 — the version bumped, the payload was silently stripped

First boot: runtime rebuilt, container recreated, healthy on 5006, and the
running bundle verified to be the new code by grepping unique source markers
inside `dist/index.mjs` (`laneNote` ×1, `1.3.0` ×5, and the rollup lane note
verbatim) rather than trusting the image tag. `updatedAt` moved. Version read
`1.3.0`.

**And `config` was absent and every `lane` was gone.**

The catalog had been rebuilt in *source* but its container was still the
13-hour-old image, and zod strips unknown keys by default. So the validator
accepted the write, discarded the two new fields, and returned success. Every
signal available at that moment — healthy container, correct bundle, ledgered
write, bumped version — was green, and the thing the change existed to deliver
had not arrived.

Confirmed rather than assumed: `docker exec symbia-stack-catalog-1 grep -c
laneNote dist/index.mjs` returned **0**.

This is discipline 4 with a second edge on it. The known form is "the running
process may not be the code you just wrote". The form that bit here is **the
running process may not be the code you just wrote *at the other end of the
call*** — a producer can be current while its validator is stale, and the
result is not an error but a quiet truncation. A schema that strips is a schema
that cannot report a version skew.

Worth a standing check: the manifest publisher could read back one manifest it
just wrote and compare, rather than trusting the 2xx. Logged, not built.

#### Result after rebuilding the catalog

```
[CatalogSync] component manifests — registered 0, updated 16, unchanged 0, failed 0
```

Read back from the catalog through the API:

```
component resources:  16
with config declared: 16
output ports: 24   with a lane: 24
lane distribution: {"inherit":12,"apocryphal":7,"canonical":2,"conditional":3}
```

Identical to the distribution predicted from `buildManifests()` in §9.2 before
any container was touched. `symbia.state.join` now carries a typed three-key
config contract, and `pending` is published as `apocryphal` with the note that
`{have, need}` must never be mistaken for the join.

**P1 resolved.** `symbia-stack-network-1` is up and healthy on **5009**. The
`5054 unreachable` in §1 is the stale MCP `dist`, not the service. That was
recorded as an inference on 7 Aug and is now measured.

### 9.3 Not done, and not claimed
- **Nothing validates against the new contract yet.** The manifest can now
  express a config contract; no loader rejects a graph that violates one. That
  is the follow-on work and the reason this is only half of F3's value.
  `RUNTIME_MANIFEST_ENFORCEMENT` is confirmed `strict` in this install, but it
  gates *component existence*, not config conformance.
- **Only `runtime` and `catalog` were rebuilt.** Anything else holding a copy of
  `ComponentManifest` is still on the old shape. Not surveyed.
- **Not committed.** The changes sit in a working tree a second session is also
  editing (§9.4).
- **Port payload schemas (F2) untouched.** `ComponentPort.schema` is still
  unused on all 16.
- **Typecheck.** `runtime` passes `tsc --noEmit` clean. `catalog` reports one
  error, `server/src/routes.ts:565` — `registryLedger` is typed
  `"register" | "publish"` and is called with `"update"`. Confirmed pre-existing
  via `git diff HEAD` (only `schema.ts` is modified by this work); recorded
  rather than fixed, since it is someone's in-flight change.

### 9.4 Concurrent-session hazard, observed

While this was being written, `scripts/seed-stack-assistants.mts` changed on
disk at 10:42:19 (+65/−11, extending the catch-all rule to fetch rather than
refuse) and `.git/index.lock` appeared at 10:42:49 and persisted. Neither was
this session's doing.

**Observation:** another session is editing this working tree concurrently.
**Consequence:** the six files above sit in the same tree as that session's
work, so any `git commit -a` from either side sweeps in the other's changes.
The lock was left in place rather than removed — deleting a lock belonging to a
live git process is how an index gets corrupted.

---

## 10. One operator question, and what it surfaced

Test run in chat, 8 Aug ~15:05. The operator, on a Log Search panel, asked
**"what does this panel tell me"**. `@docs` handled it.

### 10.1 What worked

**Observation, from `symbia-stack-assistants-1` logs.** The two specific rules
missed on their regexes and the catch-all fired:

```
Rule "Help Command"       matched: false
Rule "API Documentation"  matched: false
Rule "Answer from context" matched: true  → 5 actions
Actions executed: service.call(ok), service.call(ok), service.call(ok),
                  llm.invoke(ok), message.send(ok)
Execution complete: 1/3 rules matched in 10093ms
[SDN] Claim emitted for docs: priority=33 → docs won claim → Response emitted
```

The catch-all now **fetches then reasons** rather than returning a static "that
did not match". That change is live and it did what it was built to do.

**And the answer was honest.** With no logging data in hand, the model said it
could not tell the operator what the panel shows, named the three sources it had
consulted, and asked which service actually backs the panel. It did not invent a
description of a Log Search panel. Rule 2 of the grounding prompt held under
exactly the conditions designed to break it. That is the platform's central
claim working.

### 10.2 F31 — `@docs` consults three of nine services

**Observation.** Both `docs-api` and `docs-fallback` hardcode the same three
calls: `catalog`, `integrations`, `network` → `/docs/openapi.json`. Absent:
`identity`, `logging`, `assistants`, `messaging`, `runtime`, `models`.

The resource description reads *"every service publishes its own OpenAPI and
llms.txt, and those are the source."* The rule fetches a third of them. The
operator asked about logging, which is one of the six not consulted — so the
assistant was structurally incapable of answering, and its honesty about that
is the only reason the gap is visible rather than papered over.

### 10.3 F32 — the fallback prompt asks for a fact nothing supplies

**Observation.** The `docs-fallback` system prompt instructs the model to state
*"which panel the operator is on (it is given to you below if known)"*. Its
`userPrompt` is byte-identical to `docs-api`'s: `catalogApi`,
`integrationsApi`, `networkApi`, `USER ASKED`. **There is no panel field.**

The instruction can never be satisfied. Per §8's F-series, an unresolved
reference would render as empty string anyway — but here there is not even a
reference, just an instruction describing data that was never wired.

### 10.4 F33 — the sibling referral did not fire

**Observation.** The same prompt carries a `SIBLINGS` roster and says *"if
another assistant would plainly have it, name them: @security …, @obs (live
traffic, errors, latency) …"*. Logs are @obs's beat. The model named no
sibling; it asked the operator to confirm the backing service instead.

Also observed: only `docs` emitted a claim. No other assistant evaluated the
message, so the routing layer never gave @obs the chance the prompt assumes.

**Inference, disputable:** the referral instruction sits at the end of a long
system prompt behind three other conditional branches, and lost. *Not checked:*
whether any message has ever produced a sibling referral.

### 10.5 F34 — the MCP server reports a confident zero on logs

**This is the important one, and it nearly went into this document as fact.**

`symbia_list_log_streams` returned `[]`. `symbia_query_logs` returned
`rowCount: 0`. The obvious reading — "the platform's own logs never reach its
log store" — was about to be written up.

**Measured instead.** The same path the MCP tool calls, `GET /api/logs/streams`
on 5002:

```
streams: 192      orgs: 00000000-0000-0000-0000-000000000001
/api/stats: totalLogStreams 192, totalLogEntries 883,496,
            totalMetrics 747, totalDataPoints 1,172,693
```

Not org scoping — 192 returned both with and without
`X-Org-Id: 2c29d1dd-…`. The logging service is healthy and full. The tool that
reports on it returns empty.

This is the same running MCP that reports `network` on **5054 / unreachable**
while the container is healthy on **5009** (§9.2b, P1). The repo's
`symbia-mcp-server/src` and `dist` share an mtime (6 Aug 17:12) and the only
`5054` in `src` is a comment *describing the historical bug as fixed*. So the
server actually answering these calls is neither of those — and the repo's
`.mcp.json` defines only `symbia-integrations`, no Symbia server at all. It is
configured outside the repo, which is how it drifted with nothing to catch it.

Three consequences worth stating plainly:

1. **A confident `0` that means "asked the wrong build" is the exact defect this
   product exists to prevent**, and it is sitting in the platform's own agent
   interface — the one the project instructions say to *prefer over curl* for
   inventory questions.
2. **Discipline 4, third instance today.** The running process was not the code
   in the repo: for the catalog container (§9.2b F30), for the runtime before
   rebuild, and now for the MCP server. In every case the wrong answer arrived
   as a success, not an error.
3. **Any claim in §1–§7 that rests on an MCP read deserves re-checking.**
   `symbia_list_resources` agreed with a direct API count (79) so the catalog
   figures stand, but that is a spot check, not a clearance.

### 10.6 What the screen showed — corrections and one new defect

A screenshot of the operator's actual console arrived after the above was
drafted. It corrects two findings and adds one.

**F34 confirmed from the other side.** The Log Search panel is populated: `100
logs`, a live histogram, and ten fields with values — Level (info 68, debug 30,
warn 2), HTTP Method (GET 58, POST 2), Status Code (304 19, 200 9, 401 2),
Event (http.response 30, http.request 30, obs.http.response 20, obs.http.request
20). The org selector reads **Symbia System**, which is
`00000000-0000-0000-0000-000000000001` — the org owning all 192 streams. So the
operator was scoped correctly the whole time, the data was always there, and the
MCP's `[]` was simply wrong.

**F32 is worse than written.** The chat panel displays a location pin reading
**"Log Search"**. The console *knows* which panel the operator is on and puts it
on screen. The system prompt asks the model to state it. Nothing carries it
between the two. The visible consequence, in the transcript: the assistant —
pinned to Log Search — asked the operator *"What query/filters are currently set
in the Log Search panel? What time range is selected? Roughly how many results
did you expect vs. how many you got?"* Every one of those is on the screen it is
attached to, and two of them are in the facet counts.

**Working, and worth recording as such.** The reply carries a provenance chip
reading **`Composed · 5`** with an expander. The envelope from §7.2 reaches the
UI, with the right arena and the right step count. That is the one piece of this
chain that behaves exactly as designed.

#### F35 — three of the panel's own calls returned 401, and the panel rendered anyway

**Observation**, from `POST /api/logs/query` at `level: warn` — the two warns in
the operator's own facet count, plus their neighbours:

```
15:08:10.249  GET /api/stats          401  logging  {"error":"Authentication required"}
15:08:10.572  GET /api/logs/stream    401  logging  {"error":"Authentication required"}
15:08:14.705  GET /api/events/stats   401  network  {"error":"authentication_required"}
15:08:14.712  GET /api/stats          401  logging  {"error":"Authentication required"}
```

At the same moment `POST /api/logs/query` returned **200** — it is visible in the
operator's own log list. So on loading Log Search, the query call authenticated
and the live-tail and stats calls did not. The panel showed 100 logs and a full
facet breakdown; nothing on screen said that its live stream and its counters had
been refused. The `Resume` control sits paused, which is the only trace.

This is the same defect class as the assistants' `service.call` token bug fixed
in `31e2548` — an outbound call that does not carry the thing saying whose behalf
it is on — now on the console's side.

And it is the honest answer to the operator's question. *What does this panel
tell you?* It tells you 100 logs. It does not tell you that three of its own
sources returned 401 while it drew them.

**Incidental confirmation the pipeline is live:** the top two `warn` rows are my
own mistaken probes from minutes earlier (`GET /api/logs 404`, `GET /api/streams
404`) — the platform captured an external caller's errors correctly and
immediately.

**One more, unresolved.** The operator typed *"just grabbed a spycap"*; the
assistant replied that it had no evidence of one and only had API documentation.
The spyglass capture path does not reach `@docs`. Whether it reaches any
assistant is *not checked*.

### 10.7 Not checked — §10 (continued below)

- Where the running MCP server is actually installed from, and what build it is.
  Established only that it is not this repo's `dist` and not defined in this
  repo's `.mcp.json`.
- Whether `@obs` can in fact answer a logging question — it was never asked.
- Whether the operator's panel context is available anywhere to be wired into
  F32's prompt, or would need plumbing first.
- Whether any sibling referral has ever fired (F33).

---

## 11. Design note — `@reboot`, `@rebuild`, `@reinstall`

Brian's proposal, 8 Aug. Recorded as a design direction with one blocker
measured. Nothing built, nothing registered.

### 11.1 Why: four staleness failures in one session

| # | what was stale | how it presented |
|---|---|---|
| 1 | catalog container, while its source was current | manifest write returned success, version bumped, both new fields silently stripped (F30) |
| 2 | runtime container, pre-rebuild | would have "verified" the old behaviour as the new one |
| 3 | the installed MCP server | reports 0 log streams against 883,496 entries; 5054 against a healthy 5009 (F34) |
| 4 | `symbia-mcp-server/dist`, 7 Aug | same class, observed and left |

In none of the four did anything fail. Every one returned a 2xx or a green
health check. **Staleness on this platform does not present as an error, it
presents as a confident answer from the wrong build** — which is the same
sentence as the product thesis, pointed inward.

### 11.2 The three are a ladder, and choosing the wrong rung is silent

They are not synonyms. Each cures a different staleness and — the part worth
designing around — each is *incapable* of curing the ones below it, while
producing an identical success signal.

| rung | acts on | cures | cannot cure |
|---|---|---|---|
| `@reboot` | a running container | in-memory state, wedged connections, config read at boot | anything requiring a new image |
| `@rebuild` | an image, from source | code drift between disk and running bundle | contract drift on the *other* side of a call |
| `@reinstall` | an app artifact into an org | graphs, manifests, ingress, config schema per `docs/APP-MODEL.md` | image-level staleness underneath it |

Today is the worked example. Faced with F30, `@reboot catalog` is the cheap and
tempting move — and it would have restarted the same stale image, reported
healthy, changed nothing, and left the fields still stripped. The rung that was
needed was `@rebuild`, and the reason was not "catalog was broken" but "catalog
and runtime share `ComponentManifest`, and only one was rebuilt".

So the assistant's first duty is not to act. It is to say **which rung, and
why** — and each rung must state plainly what it does not fix. A rung that
reports success for work it structurally cannot do is the Save-button defect
again.

### 11.3 The proposed shape

Brian's, verbatim in substance: anything touching Docker is **capped `@extra`**,
reached through a **signed integration**, covering **background** activities,
with the **web interface as the abstraction and the state/editor (refresh)
surface**.

This resolves the objection that mattered. The governing rule forbids reaching
outside the platform to get something done — and running `docker-compose` from
an assistant is exactly that. But Docker reached through a *registered, signed,
capability-gated integration resource* is not outside: it is capability entering
the way the architecture ruling says capability must enter, through a gated,
ledgered catalog write. The distinction is real, not a formality.

Three properties follow, and are worth designing in deliberately:

**Background is mandatory, not a nicety.** Today's `docker-compose build runtime`
ran ~3 minutes and killed two tool calls at a 60s ceiling before being detached
with `nohup`. Request/response cannot express this. The integration needs job
semantics — submit, poll, report — and the console's "refresh" is the natural
read side of that.

**Sign at the version, not the resource.** The `signatures` table already carries
`versionId` alongside `resourceId`. Binding a signature to a resource *version*
means changing the integration invalidates its signature, so an altered
docker-reaching capability cannot inherit the trust granted to the one that was
reviewed. That is precisely the anti-staleness property the whole family exists
for, and it is already in the schema.

**Verification must come from outside the build.** Discipline 2. A build's own
exit code carries the build's own optimism; `docker-compose` returning 0 says
nothing about whether the running bundle contains the code. The check that
worked today was grepping a unique source marker inside the *running container's*
bundle (`laneNote` ×1, `1.3.0` ×5) and then reading the effect back through the
catalog API. Both are outside the build. Neither is expensive. Both should be
the integration's definition of done, in place of the exit code.

### 11.4 F36 — the keystone is missing: signatures are read-only

**Measured.** The signing surface is half-built:

| | |
|---|---|
| `signatures` table | exists — `resourceId`, `versionId`, `signerId`, `signerName`, `algorithm`, `signature`, `signedAt` |
| `storage.createSignature()` | exists |
| `GET /api/resources/:id/signatures` | exists |
| **any POST/PUT/PATCH route to create one** | **none** |
| rows in `signatures` | **0** |
| rows in `certifications` | **0** |

A signature can be read and cannot be made. So the proposal's central mechanism
— *use a signed integration* — cannot be built through the Symbia API today, and
by the project's own governing rule that is a platform defect to be logged
rather than worked around.

This also closes F14, which listed these surfaces as existing and unverified.
They exist, they are empty, and the write half is unreachable.

**Order this implies.** The signing write path is the first piece, not the last.
Until a signature can be created and verified, an `@extra`-capped docker
integration would be gated by capability alone — which is the same "authentication
is not authorisation" gap that `catalog/ingress.ts` was written to close, and it
would be reintroduced at a far higher blast radius: the first write-side,
infrastructure-mutating assistant in a stack where every existing one is
read-only.

### 11.5 The read-side half needs none of this

Worth separating, because it is buildable now and it is where both of today's
failures actually lived. Nothing about *detecting* staleness requires Docker,
signatures, or a new capability:

- catalog component manifests vs `runtime /api/components` — pure API, both sides
  already published (this is `graphs/manifest-conformance`, §5.2)
- which contracts have more than one service on them — static, from source
- which running bundles lack the marker for the code on disk — one `docker exec
  grep`, read-only

That detector would have caught F30 before the write, and F34 days ago. It is
the half that answers *which rung, and why*, and it can exist long before
anything is allowed to act.

### 11.7 Built: the catalog panel — and F37, found only in a browser

`symbia-control-center/src/components/panels/CatalogPanel.tsx`, wired into nav,
router and chat context. Three tabs: **Registry** (all 79 by type, search,
detail), **Contracts** (each component's typed config and per-port lanes),
**Hygiene** (the §2 findings as live checks).

**The catalog had no page.** Nav was overview / network / assistants /
integrations / logs / chat. `CatalogList.tsx` was imported nowhere;
`ResourceEditor` was reachable only via AssistantsPanel. 20 of 79 resources were
visible in the console; the other 59 were not. (`CatalogList` is also misnamed —
it hardcodes `type === 'assistant'` and accepts type/status filter props it
discards.)

#### F37 — a fourth copy of the panel list, and the nav lied

**Observed in a browser, and observable nowhere else.** After adding `catalog`
to `PanelId`, `PANELS` and `navItems`, clicking Catalog **highlighted the nav
item, left the URL on `/overview`, and did not change the panel.** The button
did something; nothing happened.

Cause: `App.tsx` carried its own hardcoded literal
`['overview','network','assistants','integrations','logs','chat']` to build the
routes — a **fourth independent copy** of a list already expressed three other
ways. `/catalog` fell through to the catch-all and redirected.

Discipline 8, exactly: a shared concern with N independent implementations is not
shared. The defect is latent and only bites when a panel is added, which is why
it survived the 6 Aug rebuild that created the deep-link routes.

Fixed by deriving: `PANEL_IDS` is now exported from `DashboardPage` and consumed
by `App.tsx`, removing the copy rather than adding to it.

**No API check could have caught this.** The catalog was healthy, the panel
compiled, the bundle contained the new code, and every service returned 2xx. The
standing rule — *UX/UI validation uses a browser, never curl* — earned itself
again.

#### Verified in a browser, on 8000

| | |
|---|---|
| `/catalog` deep link | resolves after the fix; URL holds |
| Registry | 79 resources, type counts, search, detail drawer |
| Contracts | v1.3.0 manifests render as contracts; lanes colour-coded, notes shown |
| Hygiene | 4 flagged, 1 not checked |
| Chat context pin | reads **Catalog** |
| Console errors | none |

**Hygiene corrected this document on first run.** F8 recorded "two id schemes"
and implied UUIDs were the current norm with slugs the legacy remainder. The
measured split is **31 uuid, 48 slug** — slugs are the majority. Also newly
counted: key styles are **path 76, dotted 2, bare 1**, and **100 distinct tags,
2 namespaced**.

The instrument objected to its author on the first run, which is the only
evidence that it is an instrument.

The two green checks — `16/16 components declare a config contract`,
`24/24 output ports publish a provenance lane` — are §9's work seen from the
operator's side rather than from the API that wrote it.

### 11.6 Built: `scripts/check-staleness.mts`

The read-side half. It reports and does not act — a detector that also repairs
can talk itself into having succeeded.

**Three results, not two.** Every check returns DRIFT, CLEAN or **UNCHECKED**,
and UNCHECKED is never folded into CLEAN. Exit 1 on drift only; an all-UNCHECKED
run exits 0 and says so in words, because "I could not look" is not "I looked
and it was fine".

**Check 1 — manifest conformance.** `runtime /api/components` against catalog
`type=component` manifests: membership both ways, output ports, lanes, and
config keys. Pure API. `undefined` and `{}` config compare as different claims.

**Check 2 — bundle markers.** For each declared shared contract, greps a token
from current source inside the *running container's* bundle. An image tag, a
healthy status and a build's exit code all describe intent; this looks at what
is loaded. The consumer list is hand-maintained, and the tool says so and marks
everything outside it UNCHECKED rather than silent.

#### Verified against its own failure modes

A detector that has only seen a healthy system is untested (discipline 2).

| test | result |
|---|---|
| current stack | `16 components agree`, 2 bundles carry the marker, exit 0 |
| marker discriminates on real containers | catalog 14:56 → 1, runtime 14:53 → 1, network 01:45 → 0, messaging 01:45 → 0 |
| services unreachable (dead port) | auth + manifest-conformance **UNCHECKED**, never CLEAN, exit 0 |
| marker in no build — the pre-rebuild F30 state | **DRIFT** on both consumers, exit 1 |

The drift message from the last test is the point:

```
✗ DRIFT  bundle-markers
    catalog: running bundle has no "…" — it predates catalog/shared/schema.ts.
             Producers on this contract: catalog, runtime
    runtime: running bundle has no "…" — it predates catalog/shared/schema.ts.
             Producers on this contract: catalog, runtime
```

It names the **co-consumers of the contract**, which is exactly the fact missing
this morning. Had this run before the first boot, "Producers on this contract:
catalog, runtime" would have said plainly that rebuilding one was not enough,
and F30 would never have been written up as a success.

**Not covered.** Only `catalog` and `runtime` are declared consumers of
`ComponentManifest`. Every other service — including the MCP server, which is
configured outside this repo and has drifted before (F34) — is UNCHECKED. The
tool prints that rather than letting the silence read as coverage.

## 12. F21 fixed, and P6 measured on the live graph

The most serious finding in this review. `symbia.compute.arithmetic` substituted
`0` for any absent placeholder and stamped the result `canonical, exact: true`.

### 12.1 The change

Two refusals added to `runtime/server/src/executor/components.ts`, both ahead of
the existing character guard:

**Absent is not zero.** Placeholders referenced by the expression are collected
first; any that are `undefined` or `null` exit on `error` / apocryphal, naming
`missing` and `present`. That `{present, missing}` shape is deliberate — it is
what `symbia.state.rollup` already emits, and the two components should describe
partial input the same way.

**Infinity is not a measurement.** A non-finite result now exits on `error`
rather than going out canonical. `210 / 0` returned `Infinity`, which
`JSON.stringify` renders as `null` — a canonical, exact null that a reader could
not distinguish from an absent field.

`energy-pue`'s own description already claimed *"division errors (e.g. it_kw = 0)
exit on the arithmetic error port into the error log."* They did not. The graph
was right and the component disagreed; now they agree.

### 12.2 Measured at the component

Against a `tsc` build of the changed file, calling the registered handler:

| case | port | lane | result |
|---|---|---|---|
| both present | out | canonical | 1.4 |
| numerator absent | error | apocryphal | `missing:["facility_kw"]` |
| denominator absent | error | apocryphal | `missing:["it_kw"]` |
| both absent | error | apocryphal | `missing:[both]` |
| explicit `null` | error | apocryphal | `missing:["facility_kw"]` |
| `it_kw = 0` | error | apocryphal | not finite |
| non-numeric string | error | apocryphal | non-arithmetic characters (unchanged) |
| `{a}+{b}+{c}`, c absent | error | apocryphal | `missing:["c"]` |
| **`facility_kw = 0`** | **out** | **canonical** | **0** |

The last row is the one that matters. A genuine zero is still a value and still
computes. Absent and zero are now distinguishable, which is the entire defect.

### 12.3 P6 — measured, and the prediction is spoiled

Runtime rebuilt, fix confirmed present in the running bundle
(`grep -c "inputs absent" dist/index.mjs` → 1), then injected into a live
execution of `energy-pue`:

| injection | terminal output | lane |
|---|---|---|
| `{facility_kw:210, it_kw:150}` | `sink:out` → 1.4 | canonical |
| `{facility_kw:210}` | `errsink:out` → `missing:["it_kw"]` | **apocryphal** |
| `{facility_kw:210, it_kw:0}` | `errsink:out` → not finite, `Infinity` | **apocryphal** |
| `{facility_kw:0, it_kw:150}` | `sink:out` → 0 | canonical |

The graph's `pue.error → errlog → errsink` edge was wired all along and had
never carried traffic. It does now.

**But P6 as registered is spoiled, and that is my error.** P6 predicted that
`energy-pue` *would* emit a canonical PUE with a reading absent — a claim about
the pre-fix system. I fixed the component and then measured, so what is recorded
above is the post-fix state. The defect was proven at the component (§8.3) but
**never observed in a live graph**, and now cannot be without deliberately
reverting.

Registering a prediction and then changing the subject before measuring makes
the prediction unfalsifiable. The discipline says register before measuring; it
should also say measure before repairing. Recorded as broken procedure rather
than quietly dropped.

### 12.5 F38 — I put a data centre back into the public contract

Brian asked why the test cases were written in facility/IT power. The answer is
that they should not have been, and the same vocabulary had already reached
somewhere far worse than a test.

**Observation.** The config contract I wrote for `symbia.compute.arithmetic` on
8 Aug read:

> `Arithmetic over {placeholders} drawn from the message, e.g. "{facility}/{it}".`

That is a data centre's language in the public manifest of a component that does
arithmetic. It was published to the catalog at v1.3.0, and the Contracts tab I
built renders it to every operator.

This is the defect the 6 Aug audit already found and fixed — `symbia.state.join`
documenting its config with data-centre electrical point names — reintroduced
two days later by the person reviewing the platform for that class of defect.

**And the 6 Aug fix did not fix it either.** `git log -S 'ticker.acme'` returns
`9f6afcc fix(D10): run schema bootstrap; remove test-case vocabulary from
platform contracts`. That commit *introduced* `{"price": "ticker.acme",
"volume": "volume.acme"}`. It removed energy's vocabulary and substituted
finance's. The rule is that a platform contract carries no domain's vocabulary;
the fix satisfied "remove the energy words" instead, which is the letter and not
the rule.

Then, on 8 Aug, I propagated that example into the new typed `config.select`
field, giving a two-day-old workaround fresh standing as a contract.

**This is discipline 2 pointed at an audit.** An instrument that checks for one
domain's words shares the optimism of whoever chose that domain. The check that
would not have shared it is "does this contract name anything outside the
platform" — which is a different question, and answerable mechanically.

**Fixed and republished.** `e.g. "({a} - {b}) / {a}"` and
`e.g. {"x": "key.one"}`. Runtime rebuilt, and the publisher reported
`updated 2, unchanged 14` — the field-level comparison built in §9 identifying
exactly the two contracts that changed. Verified against the live catalog:

```
domain vocabulary across all 16 published contracts: none
```

**Still open.** That scan is a regex over a hand-written word list, which is the
same shape of instrument that just failed. A real check would compare contract
text against the vocabulary of registered apps — `energy` and `order-margin`
both declare theirs — rather than against words a reviewer thought of. Logged,
not built.

### 12.4 P7 — broken

P7 predicted *"fixing F21 breaks at least one existing test or fixture,
confidence medium."* Nothing broke.

The reason is the finding: **no test anywhere covers
`symbia.compute.arithmetic`**, or any runtime component. `grep` across `tests/`
and every `*.test.ts` returns nothing for `arithmetic` or `compute.`. The suites
that exist are `tests/transparency`, `tests/intentions` and `tests/trust` —
which check for `eval`, encoded logic, naming and complexity, but nothing about
whether a component computes the right number.

The component carrying the most serious defect in this review had no test to
break. It still has none — this fix was verified by measurement, not by a test,
and that gap is now the reason it could regress silently.

---

## 13. Sweep — integrations, models, network, graphs, objects

Each service asked what it actually holds, then compared with what the catalog
registers. Registered ≠ running is the axis that has produced nearly every
finding in this document, and it produces four more here.

### 13.1 F39 — the catalog's model entries are a stale, partly fictional subset

**Measured**, `GET /api/integrations/capabilities` against the catalog's 20
model resources:

| provider | live | catalog | live but unregistered | registered but not served |
|---|---|---|---|---|
| openai | 15 | 8 | gpt-5.2, gpt-5.2-thinking, gpt-5.2-pro, gpt-5.2-codex, o4-mini, o3, o3-pro, o3-deep-research, o4-mini-deep-research | o3-mini, gpt-4-turbo |
| anthropic | 9 | 5 | claude-sonnet-5, claude-opus-5, claude-haiku-4-5, claude-3-sonnet, claude-3-haiku | **claude-sonnet-4-20250514** |
| huggingface | 23 | 6 | 18 including three vision models and four embedding models | deepseek-ai/DeepSeek-R1 |
| symbia-labs | 1 | 1 | — | — |
| **total** | **48** | **20** | **32 absent from the catalog** | **4 the service will not serve** |

The integrations service already holds current model data. The catalog holds a
hand-maintained copy that is 28 models short and names four that do not exist
live. Two representations of one fact, one of them fed by a human.

This also reframes §5.5, which proposed *refreshing* the model entries. The
better move is not to refresh them — it is to stop maintaining a second copy.
The service is the source; the catalog registration should derive from it or the
entries should go.

**Correction to F7.** §2 inferred that the catalog's model entries leave
`contextWindow` / `pricing` / `capabilities` unpopulated, and §3 listed it as not
checked. Now checked: **18 of 20 carry them.** The inference was wrong. The
staleness is real; the emptiness was not.

### 13.2 F40 — three green providers, one credential

**Observation.** The Overview panel renders three LLM providers with green dots:
Openai `gpt-4o-mini`, Anthropic `claude-sonnet-4-20250514`, Huggingface
`meta-llama/Llama-3.2-3B-Instruct`.

Identity holds **one** credential, for `anthropic`.

And `claude-sonnet-4-20250514` is one of the four models in §13.1 that the
integrations service does not serve. So the one provider that can authenticate is
displayed alongside a model string it will reject, under a green dot.

**The service itself is honest about this.** `GET /api/integrations/status`
returns, per provider, `"credential": "not_checked"` plus:

> *registered = an adapter and config exist in this service. Credentials are
> per-user and live in identity; this route is unauthenticated and does not check
> them. Use GET /api/integrations/capabilities with a token for a
> credential-aware answer.*

That is the "blank beats green" rule implemented properly, with the reason
attached — and it is worth recording as a thing done right. The defect is that
the console reads `configured: true` and paints a green dot, discarding the
`not_checked` the service went out of its way to say.

Same shape as F32 and F35: the service reports nuance, the UI flattens it to
green. Three panels, three instances, one habit.

### 13.3 F41 — "integration" names two nearly disjoint sets

**Measured.** The integrations service registry holds **12** specs; the catalog
holds **31** resources of type `integration`.

| | |
|---|---|
| live only (7) | catalog, identity, logging, messaging, runtime, assistants, network — the platform's own services |
| shared (5) | telegram, openai, anthropic, huggingface, symbia-labs |
| catalog only (26) | 20 model entries, 5 Google integrations, 2 ingresses (minus overlap) |

The five Google integrations — gmail, drive, calendar, sheets, docs — are
registered in the catalog and have **no live spec**. Their five matching level-4
assistants are, by the seed script's own admission, *"a single llm.invoke with a
prompt that says 'describe what you WOULD do'."* The catalog registration and the
assistant are both present; the capability behind them is not.

Nothing in either surface says these are different populations. The Integrations
panel shows the 12; the 31 were invisible in the console until §11.7.

### 13.4 F42 — objects: a complete API with nothing in it

**Measured.** The logging service exposes `/objects/streams`, `/objects/query`
and `/objects/ingest`. `GET /api/objects/streams` returns **0**, and `/api/stats`
reports `totalObjectStreams: 0, totalObjectEntries: 0` — against 192 log streams
and 883,496 log entries on the same service.

Three endpoints, a table, and no producer. §5.1 proposed `symbia.sink.object`
because objects had no graph surface; the stronger statement is that they have no
surface at all. Either something should write objects or the capability should be
withdrawn — an API nobody calls is indistinguishable from one that does not work,
and neither is checkable.

### 13.5 F43 — a counter that reports zero after doing work

**Observation.** `GET /api/stats` on the runtime returns:

```
{"loadedGraphs":4,"activeExecutions":2,"totalMessagesProcessed":0}
```

This was read minutes after the four §12.3 injections, each of which traversed
four to six nodes and produced terminal output on `sink` or `errsink`.

**Inference, disputable:** the counter is not wired. It may equally count
something narrower — ingress deliveries, or messages on the bus rather than
in-graph hops — in which case zero is correct and the *name* is the defect. Not
checked which. Either way, a field called `totalMessagesProcessed` reading `0` on
a runtime that just processed messages is a confident zero on the face of it.

### 13.6 What was checked and found consistent

Recorded so the sweep is not read as uniformly negative:

- **Network** — 9 registered nodes, exactly the nine services. `control-center`
  is correctly absent (it is not a mesh participant) and so is `server`, which is
  registered-but-never-listening by ruling. 3 declared contracts.
- **Models** — 1 model live, 1 registered. Agrees.
- **Graphs** — 4 in the catalog, 4 loaded in the runtime. Agrees.
- **Components** — 16 and 16, ports, lanes and config keys all matching
  (§11.6 verifies this continuously now).

### 13.7 Not checked — §13

- Whether `totalMessagesProcessed` counts something other than graph hops (F43).
- Whether the 5 Google integrations were ever intended to have live specs, or are
  deliberately catalog-only declarations.
- The 3 network contracts against the 18 observed edges the topology draws.
- Whether any consumer reads the catalog's model entries at all — if nothing
  does, F39 is dead weight rather than a wrong answer.
- Nothing in §13 was checked in a browser except the Overview provider dots.

---

### 13.8 F44 — withdrawn

Briefly recorded here as "half the component catalog is a claim nobody has
cashed", from a realization graph drawing which components no loaded graph
reaches (8 of 16).

**Withdrawn as a finding, and the view reverted.** The measurement was correct
and the frame was wrong. Catalog components are a *library* of available,
compiled, signed objects; a library is not defective for holding books nobody
has opened this week. "Not real until loaded into a graph" describes when an
object takes effect, not whether its registration means anything — and building
a whole view around the second reading turned a shelf into an accusation.

Kept as a note because the error is instructive: a true measurement, framed as a
defect, would have sent someone deleting perfectly good components.

---

## 14. Built: browse, inspect, test

The catalog experience: **browse** the library, **inspect** an object, **test**
it in a sandbox.

**Browse.** The Library tab — all 79 grouped by type, with search, type filters
and master-detail. Catalog components are a library of available, compiled,
signed objects, and the browser treats them as one: it does not editorialise
about which of them a graph currently wires.

**Inspect.** Facts, tags, the typed config contract and per-port lanes for
components, and for graphs a **behaviour preview in the assistants page's own
visual language** — `FlowNode`, dagre left-to-right, green Input and Output
endpoints, one coloured card per node. An operator who has read the behaviour
tile on an assistant should not have to learn a second grammar here.

Nodes are coloured by component family (io, logic, state, compute, transform,
sink, source) rather than by lane, because a lane belongs to an edge leaving a
port and not to the node — colouring by it would say a component *is*
apocryphal when only one of its outputs is. Branch ports are labelled, and
`error` / `fail` edges draw amber.

Entry and exit are derived rather than asserted: Input attaches to
`metadata.ingress.node` where a graph declares one, and otherwise to whatever no
edge targets.

**Test — stubbed on purpose.** The intent is a memory-only load into an
ephemeral graph: one input, one result, nothing registered and nothing
persisted. It is a stub rather than a half-built runner, because a Test button
that quietly ran against the live runtime, or reported a result it had not
produced, would be the Save-button defect in the place an operator is most
likely to trust it. The panel says what it does not do, and names what it needs:
ephemeral graph load, an input form generated from the config contract, and a
result shown with its lane.

**Reverted along the way.** A realization graph — apps → graphs → components,
solid for loaded, dashed for registered — was built first and removed. See F44.

