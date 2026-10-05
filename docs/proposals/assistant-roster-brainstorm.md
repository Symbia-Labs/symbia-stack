# Assistant roster — brainstorm

> **SUPERSEDED — 13 Aug 2026, same day.** Replaced by
> [`assistant-roster.md`](./assistant-roster.md) (ten role-scale assistants).
> The 115 entries here were cut on two grounds: most were single-tool actions
> misclassified as assistants, and the third-party integrations were moved to a
> fork template. Kept because §7's generator argument and the derived tool
> backlog survived the cut. Do not load `assistant-roster-brainstorm.json`.

**PAPER. 13 August 2026.** Nothing here is registered, published or measured.
This is a deliberately over-generated body of candidates to argue over and cut
down, produced as a text exercise at Brian's request.

Companion file: **`assistant-roster-brainstorm.json`** — all 115 definitions
in loadable resource form (§4). It is generated from a compact spec, not
hand-written, which is itself part of the argument (§7).

Grounded in: `STATUS.md` §0a, `docs/ASSISTANTS.md`, `docs/MESSAGES.md`,
`docs/2026-08-12-assistant-normalization-spec.md`, and today's security
remediation (`docs/2026-08-13-adversarial-analysis*.md`,
`docs/2026-08-13-session-close.md`, `docs/proposals/wasm-runtime.md`).

---

## 1. What today's findings changed about what an assistant *is*

Four things landed on 13 Aug that move the assistant question, and every entry
below is written with them in view.

**Capability became a first-class noun.** `@symbia/pathguard` and
`@symbia/egress` are now packages an action passes through, not conventions a
handler remembers. `wasm-runtime.md` proposes going further — a capability as a
wasm import, host-mediated and pathguard-scoped. If that direction holds, an
assistant's `capabilities` array stops being decoration on
`metadata.assistantConfig` and becomes the actual grant. **That reframes the
whole roster: an assistant is a named bundle of capability grants with a
refusal policy, and the rules are how it spends them.** Several entries below
(`capability-broker`, `egress-warden`, `pathguard`, `vault`) only make sense
under that reading.

**Tenancy became enforceable and remains unexercised.** RLS is a fail-closed
AsyncLocalStorage scope in code and has never run against a live stack. Every
assistant that touches a DB-backed service inherits that gap. `rls-auditor`
exists to close the line in STATUS that says so.

**Code execution was removed rather than sandboxed.** `0ddd373` took bash out
of code tools outright. So there is no "engineer assistant that runs things"
in this roster — that assistant is blocked on the wasm proposal, and pretending
otherwise would be the exact defect-hiding the governing rule forbids.

**Everything green is a local run.** `citest`, `harness` and `mapkeeper` exist
because the difference between "passing" and "never observed executing" is
currently held by a human reading a table.

One more, from the week rather than the day: **`ExecutionContext.llmConfig` was
never assigned by anything.** A configuration layer that appears to work and
changes nothing is worse than an absent one. Every definition below therefore
carries `metadata.config` in the normalized shape with a `digest`, and no
definition relies on a field being read that we have not confirmed a reader
for. **That is the single most important review criterion for this document:
for each field, name the reader.**

---

## 2. The frame — four claims worth arguing with

**(a) An assistant is a refusal policy with a data path attached.** The rules,
the prompt and the model are implementation. What distinguishes one assistant
from another, in a provenance platform, is *what it declines to say*. The
descriptions below are written to that standard: most name their refusal.

**(b) `kind` is the only field that cannot be defaulted, and it is a billing
decision.** Deterministic refuses; probabilistic retries and spends tokens.
Deriving it from a tag would make an editorial change a billing change.

**(c) The interesting arena is RETRIEVED, and the roster is currently starved
of it.** The live three produce COMPUTED, COMPOSED and REFUSED. Fetch-then-cite
assistants — most of Families A and G — should claim
`["RETRIEVED","COMPOSED","REFUSED"]`, per MESSAGES.md's rule that the arena
describes the value while the basis discloses the wording. **This is an open
question, flagged rather than settled** (§8, Q2).

**(d) Level ≠ complexity, level = how many ways it can lie.** Level 1 has one.
Level 5 has a delegation chain's worth. Reading the ladder that way makes the
level tier do real work instead of being a tutorial remnant.

---

## 3. Families

| family | n | what unifies it |
|---|---|---|
| **A. Stack-native introspection** | 9 | Answers about **this installation**, fetched a moment earlier. No general knowledge to fall back on. |
| **B. Provenance & receipts** | 9 | Operates on envelopes, seals, arenas and chains. Several are deterministic verifiers that must never acquire a model. |
| **C. Deterministic compute** | 12 | A named function produced the value. The receipt is reproducible by anyone. |
| **D. Governance & security** | 10 | Directly descended from today's A1–A4 / R1–R5 remediation. Mostly deterministic — a guard a model can argue with is not a guard. |
| **E. Engineering workflow** | 10 | Makes the project's own discipline (MAP, defect ledger, staleness, close docs) executable rather than remembered. |
| **F. Catalog stewardship** | 4 | Keeps the catalog from rotting: key normalization, reusable-vs-instance, domain words in tags not keys. |
| **G. Integration-affiliated** | 32 | One assistant per integration. Brian's hypothesis, taken to its logical extreme so the extreme can be judged (§7). |
| **H. Energy — test case, not product** | 4 | `energy/` is a test case; the defect ledger is the output. Included to prove domain vocabulary can be kept out of manifests. |
| **I. Federation & network** | 3 | Crossing an installation boundary. Whose seal a federated receipt carries is the open design problem. |
| **J. Channels & cadence** | 4 | Where messages enter and when work recurs. A scheduled assistant failing silently is the hazard. |
| **K. Documents** | 4 | Supplied material in, cited claims out. The family most at risk of sliding into GENERATED. |
| **L. Orchestration & meta** | 7 | Routing, arbitration, escalation, refusal. Produces delegation records, not values. |
| **M. Models** | 4 | What is loaded, what it costs, what happens when it is not there. |
| **N. Memory & correction** | 3 | Recall across turns, revision of prior work, and deletion with a receipt. All of it currently in a Map. |

✅ marks something that already exists in the live roster in some form.
`C` = deterministic, `P` = probabilistic. Claims abbreviated (`Ret`/`Com`/`Cmp`/`Ref`).

---

### A. Stack-native introspection

| assistant | lvl | kind | lane | claims | affiliation | one line |
|---|---|---|---|---|---|---|
| `warden` **Warden** | 3 | P | apocryphal | Ret/Com/Ref | — | Answers 'is it running' from the running stack, never from the registry |
| `obs` **Obs** ✅ | 3 | P | apocryphal | Ret/Com/Ref | — | Live traffic, error rates and latency, quoted out of the logging service with the stream and time window named |
| `security` **Security** ✅ | 3 | P | apocryphal | Ret/Com/Ref | — | Which credentials exist, for which providers, held by whom — and never their values |
| `code` **Code** ✅ | 3 | P | apocryphal | Ret/Com/Ref | — | Catalog resources and runtime components: what is registered, what its manifest declares, which port lane each outp… |
| `ui` **UI** ✅ | 3 | P | apocryphal | Ret/Com/Ref | — | Registered apps and connected clients, per the app-vs-installation split |
| `docs` **Docs** ✅ | 3 | P | apocryphal | Ret/Com/Ref | — | Serves each service's own OpenAPI as the answer to 'what endpoints exist' |
| `portwatch` **Portwatch** | 2 | D | inherit | Com/Ref | — | Runs the port-surface check and reports drift |
| `routetable` **Routetable** | 2 | D | inherit | Com/Ref | — | Resolves a service id to its route via `@symbia/sys`, and refuses a port |
| `reconciler` **Reconciler** | 4 | P | apocryphal | Ret/Com/Ref | — | Diffs the registry against the process table and names every service that is registered with nothing behind it |

### B. Provenance & receipts

| assistant | lvl | kind | lane | claims | affiliation | one line |
|---|---|---|---|---|---|---|
| `sealcheck` **Sealcheck** | 2 | D | inherit | Com/Ref | — | Verifies an envelope's seal and signature from the document alone — no model, no network |
| `arena-auditor` **Arena Auditor** | 4 | P | apocryphal | Ret/Com/Ref | — | Continuously checks each assistant's declared `claims` against the sealed arena of every reply it actually produced |
| `lineage` **Lineage** | 3 | D | inherit | Ret/Com/Ref | — | Walks a delegation chain from a reply back to the message that started it, and says plainly when the chain restarts… |
| `receipt` **Receipt** | 3 | P | apocryphal | Ret/Com/Ref | — | Turns a sealed envelope into plain language without adding anything the envelope does not contain |
| `digestor` **Digestor** | 2 | D | inherit | Com/Ref | — | Content-addresses a configuration or a model weight set and tells you whether two things that share a name are the … |
| `apocrypha` **Apocrypha** | 4 | P | apocryphal | Ret/Com/Ref | — | Tracks what rode the apocryphal lane and what consumed it downstream |
| `citecheck` **Citecheck** | 4 | P | apocryphal | Com/Ref | — | Re-reads the cited material for a COMPOSED answer and reports whether it supports the claim |
| `genesis` **Genesis** | 2 | D | inherit | Com/Ref | — | Reports chain-head discontinuities caused by in-memory state loss |
| `basisreporter` **Basis** | 3 | D | inherit | Ret/Com/Ref | — | Separates arena from basis on a single reply: what produced the value versus who chose the words, with `presentatio… |

### C. Deterministic compute

| assistant | lvl | kind | lane | claims | affiliation | one line |
|---|---|---|---|---|---|---|
| `echo` **Echo** ✅ | 1 | D | inherit | Com/Ref | — | Mirrors input |
| `calculator` **Calculator** ✅ | 2 | D | inherit | Com/Ref | — | Arithmetic via `tool.invoke`, no model in the path |
| `smart-calculator` **Smart Calculator** ✅ | 4 | P | apocryphal | Com/Ref | — | A model writes the expression; the arithmetic stays exact |
| `units` **Units** | 2 | D | inherit | Com/Ref | — | Unit conversion with the conversion factor and its source named in the receipt |
| `datecalc` **Datecalc** | 2 | D | inherit | Com/Ref | — | Date and duration arithmetic with the timezone and calendar it used stated |
| `moneycalc` **Moneycalc** | 3 | D | inherit | Ret/Com/Ref | — | Currency arithmetic with declared rounding and a dated FX rate cited by source |
| `statistician` **Statistician** | 3 | D | inherit | Com/Ref | — | Descriptive statistics over a supplied series |
| `regexsmith` **Regexsmith** | 3 | P | apocryphal | Com/Ref | — | Drafts a pattern and then actually runs it against the examples |
| `hasher` **Hasher** | 1 | D | inherit | Com/Ref | — | Canonicalizes and hashes |
| `jsonpath` **Jsonpath** | 2 | D | inherit | Com/Ref | — | Structured extraction from a supplied document |
| `validator` **Validator** | 2 | D | inherit | Com/Ref | — | Validates a payload against a named schema and returns the failing path |
| `tabulate` **Tabulate** | 2 | D | inherit | Com/Ref | — | Deterministic table operations — filter, join, aggregate — with the row counts before and after in the receipt |

### D. Governance & security

| assistant | lvl | kind | lane | claims | affiliation | one line |
|---|---|---|---|---|---|---|
| `rls-auditor` **RLS Auditor** | 4 | P | apocryphal | Ret/Com/Ref | — | Exercises the fail-closed AsyncLocalStorage RLS scope against a running stack — the thing STATUS §0a currently list… |
| `egress-warden` **Egress Warden** | 3 | D | inherit | Com/Ref | — | Runs a candidate outbound URL through `@symbia/egress` and says allowed or blocked and by which rule |
| `pathguard` **Pathguard** | 2 | D | inherit | Com/Ref | — | Validates a path against `@symbia/pathguard` — sep-boundary, symlink-aware, blockedPaths-enforcing |
| `secret-scanner` **Secret Scanner** | 3 | D | inherit | Com/Ref | — | Scans a draft document, issue or commit for live credentials before it leaves the building |
| `accesspolicy` **Accesspolicy** | 3 | P | apocryphal | Ret/Com/Ref | — | Explains and diffs `accessPolicy` on a resource — who reads, who writes, and what `public` actually resolves to und… |
| `tenancy` **Tenancy** | 3 | D | inherit | Ret/Com/Ref | — | Answers membership questions the way the middleware does, so a 403 can be explained instead of guessed at |
| `redteam` **Redteam** | 5 | P | apocryphal | Com/Ref | — | Writes an adversarial analysis against the platform's own surfaces and files it dated, the way 13 Aug's was |
| `remediation` **Remediation** | 4 | P | apocryphal | Ret/Com/Ref | — | Tracks each finding from analysis to commit to committed regression test, and reports the ones where the test is mi… |
| `capability-broker` **Capability Broker** | 5 | D | inherit | Com/Ref | — | Grants and denies host capabilities to a component under the proposed wasm runtime, where a capability is an import… |
| `vault` **Vault** | 4 | D | inherit | Ret/Com/Ref | — | Reports credential age, ciphertext version and rotation due-dates against the HKDF-keyed AES-256-GCM vault |

### E. Engineering workflow

| assistant | lvl | kind | lane | claims | affiliation | one line |
|---|---|---|---|---|---|---|
| `mapkeeper` **Mapkeeper** | 4 | D | inherit | Ret/Com/Ref | — | Registers predictions in git before measurement and afterwards reports the broken ones as broken |
| `defect-ledger` **Defect Ledger** | 3 | D | inherit | Ret/Com/Ref | — | Files a platform defect when something cannot be built through the Symbia API alone |
| `staleness` **Staleness** | 4 | P | apocryphal | Ret/Com/Ref | — | Checks a document's claims against the code and reports which are no longer true |
| `linkcheck` **Linkcheck** | 1 | D | inherit | Com/Ref | — | Resolves every relative link in the docs tree |
| `buildgate` **Buildgate** | 2 | D | inherit | Com/Ref | — | Reports per-service typecheck exit codes and error counts |
| `citest` **CItest** | 3 | P | apocryphal | Ret/Com/Ref | — | Watches the Verify workflow and distinguishes 'passing' from 'never observed executing' — the exact distinction eve… |
| `committer` **Committer** | 3 | P | apocryphal | Com/Ref | — | Drafts Conventional Commits that describe what changed in the world rather than which files moved |
| `session-close` **Session Close** | 4 | P | apocryphal | Ret/Com/Ref | — | Produces the dated close document: tree state, commits, health, and an explicit **Not checked** section |
| `harness` **Harness** | 3 | D | inherit | Com/Ref | — | Runs the committed harnesses and reports counts as counts |
| `conformance` **Conformance** | 3 | D | inherit | Ret/Com/Ref | — | Diffs live routes against published OpenAPI, including middleware-guarded routers that a naive walker misses |

### F. Catalog stewardship

| assistant | lvl | kind | lane | claims | affiliation | one line |
|---|---|---|---|---|---|---|
| `catalogist` **Catalogist** | 3 | D | inherit | Com/Ref | — | Enforces normalized type-prefixed keys — `<type-plural>/<name...>`, plural always, domain in tags never keys — and … |
| `curator` **Curator** | 4 | P | apocryphal | Com/Ref | — | Decides whether a candidate is a reusable item or a real-time point instance, and refuses the latter |
| `tagger` **Tagger** | 2 | P | apocryphal | Com/Ref | — | Proposes tags and moves domain vocabulary out of keys and manifests into them |
| `seedguard` **Seedguard** | 3 | D | inherit | Com/Ref | — | Diffs bootstrap seed data against live rows and blocks a silent revert |

### G. Integration-affiliated

| assistant | lvl | kind | lane | claims | affiliation | one line |
|---|---|---|---|---|---|---|
| `gmail` **Gmail** | 3 | P | apocryphal | Ret/Com/Ref | `gmail` | Reads and drafts against a real mailbox |
| `gcal` **Calendar** | 3 | P | apocryphal | Ret/Com/Ref | `gcal` | Schedule questions answered from the calendar, with the calendar id and query window named so an empty answer is di… |
| `gdrive` **Drive** | 3 | P | apocryphal | Ret/Com/Ref | `gdrive` | Finds and quotes documents verbatim, and reports permissions as data rather than assuming its own access implies th… |
| `gsheets` **Sheets** | 3 | P | apocryphal | Ret/Com/Ref | `gsheets` | Reads and writes ranges |
| `gdocs` **Docs** | 3 | P | apocryphal | Ret/Com/Ref | `gdocs` | Document content in and out, quoted with revision id so a citation stays checkable after an edit |
| `slack` **Slack** | 3 | P | apocryphal | Ret/Com/Ref | `slack` | Channel history and posting |
| `github` **Github** | 3 | P | apocryphal | Ret/Com/Ref | `github` | Repository state, PRs, commits and workflow runs |
| `linear` **Linear** | 3 | P | apocryphal | Ret/Com/Ref | `linear` | Issue tracker reads and writes |
| `notion` **Notion** | 3 | P | apocryphal | Ret/Com/Ref | `notion` | Wiki content |
| `jira` **Jira** | 3 | P | apocryphal | Ret/Com/Ref | `atlassian` | JQL-backed reads |
| `postgres` **Postgres** | 4 | P | apocryphal | Ret/Com/Ref | `postgres` | Read-only SQL with the statement and row count in the receipt |
| `s3` **S3** | 3 | P | apocryphal | Ret/Com/Ref | `s3` | Object storage reads with etag and version id cited |
| `aws` **AWS** | 4 | P | apocryphal | Ret/Com/Ref | `aws` | Broad AWS API surface |
| `datadog` **Datadog** | 3 | P | apocryphal | Ret/Com/Ref | `datadog` | External observability, deliberately separate from Obs so a claim about the platform's own logs is never sourced fr… |
| `sentry` **Sentry** | 3 | P | apocryphal | Ret/Com/Ref | `sentry` | Error aggregation, with the release and first-seen timestamp attached to every claim |
| `pagerduty` **Pagerduty** | 3 | P | apocryphal | Ret/Com/Ref | `pagerduty` | Who is on call and what is firing |
| `stripe` **Stripe** | 4 | P | apocryphal | Ret/Com/Ref | `stripe` | Billing reads only |
| `salesforce` **Salesforce** | 3 | P | apocryphal | Ret/Com/Ref | `salesforce` | CRM reads via SOQL |
| `hubspot` **Hubspot** | 3 | P | apocryphal | Ret/Com/Ref | `hubspot` | CRM reads for the other half of the market |
| `zendesk` **Zendesk** | 3 | P | apocryphal | Ret/Com/Ref | `zendesk` | Support history, quoted |
| `twilio` **Twilio** | 3 | P | apocryphal | Ret/Com/Ref | `twilio` | SMS in and out — the smallest channel with a real delivery receipt, which makes it a good provenance test case |
| `anthropic` **Anthropic** | 3 | P | apocryphal | Ret/Com/Ref | `anthropic` | The one provider this stack actually holds a credential for, measured 7 Aug |
| `openai` **OpenAI** | 3 | P | apocryphal | Ret/Com/Ref | `openai` | Declared by every existing bootstrap assistant and backed by no credential in this stack |
| `huggingface` **HuggingFace** | 3 | P | apocryphal | Ret/Com/Ref | `huggingface` | Open-weight model discovery, and the natural feeder for the models service that currently reports zero models loaded |
| `symbia-labs` **Symbia Labs** | 3 | P | apocryphal | Ret/Com/Ref | `symbia-labs` | First-party provider affiliation |
| `edgar` **Edgar** | 3 | P | apocryphal | Ret/Com/Ref | `sec-edgar` | Public filings, quoted with accession number |
| `fred` **Fred** | 3 | P | apocryphal | Ret/Com/Ref | `fred` | Economic series with the vintage cited, so a revised number is visibly a different number |
| `eia` **EIA** | 3 | P | apocryphal | Ret/Com/Ref | `eia` | US energy data |
| `noaa` **NOAA** | 3 | P | apocryphal | Ret/Com/Ref | `noaa` | Observations versus forecasts — two different arenas from one integration, which makes it a good lane-discipline ex… |
| `arxiv` **Arxiv** | 3 | P | apocryphal | Ret/Com/Ref | `arxiv` | Preprint search and abstracts, cited by identifier and version |
| `wikidata` **Wikidata** | 3 | P | apocryphal | Ret/Com/Ref | `wikidata` | Structured facts with statement-level references — the closest public analogue to what this platform is trying to m… |
| `osm` **OSM** | 3 | P | apocryphal | Ret/Com/Ref | `openstreetmap` | Geocoding with changeset id, so a place that moved on the map is distinguishable from a place that moved |

### H. Energy — test case, not product

| assistant | lvl | kind | lane | claims | affiliation | one line |
|---|---|---|---|---|---|---|
| `pue` **PUE** | 4 | P | apocryphal | Ret/Com/Ref | `eia` | Computes PUE over a declared graph |
| `meter` **Meter** | 3 | D | inherit | Ret/Com/Ref | — | Interval meter reads |
| `iso` **ISO** | 4 | P | apocryphal | Ret/Com/Ref | `eia` | Wholesale market data by node |
| `emissions` **Emissions** | 4 | P | apocryphal | Ret/Com/Ref | `eia` | Emissions intensity from declared factors |

### I. Federation & network

| assistant | lvl | kind | lane | claims | affiliation | one line |
|---|---|---|---|---|---|---|
| `federator` **Federator** | 5 | P | apocryphal | Ret/Com/Ref | — | Answers about peered installations and what crosses the boundary |
| `bridge` **Bridge** | 4 | D | inherit | Ret/Com/Ref | — | Forwards a request to a peer and returns the peer's sealed reply unaltered |
| `attestor` **Attestor** | 4 | D | inherit | Ret/Com/Ref | — | Reports instrument identities and attestation state — the spyglass instrument being the live example at `attested` |

### J. Channels & cadence

| assistant | lvl | kind | lane | claims | affiliation | one line |
|---|---|---|---|---|---|---|
| `inbox` **Inbox** | 3 | P | apocryphal | Ret/Com/Ref | `gmail` | Triages an inbox into things needing a decision and things needing nothing |
| `cadence` **Cadence** | 3 | D | inherit | Ret/Com/Ref | — | Owns recurring runs and the record that a run happened |
| `webhook` **Webhook** | 3 | D | inherit | Ret/Com/Ref | — | Receives and validates inbound webhooks with real HMAC and timestamp coverage, and routes the payload as a message |
| `digest` **Digest** | 4 | P | apocryphal | Com/Ref | — | Assembles a periodic brief from sources that each carry their own receipt, and keeps the composite honest by refusi… |

### K. Documents

| assistant | lvl | kind | lane | claims | affiliation | one line |
|---|---|---|---|---|---|---|
| `extractor` **Extractor** | 3 | P | apocryphal | Ret/Com/Ref | — | Pulls structured fields out of a supplied document with page and span coordinates, so every extracted value points … |
| `summarizer` **Summarizer** | 4 | P | apocryphal | Com/Ref | — | Summarises supplied material only, with per-claim citations |
| `redactor` **Redactor** | 3 | D | inherit | Com/Ref | — | Applies declared redaction rules and reports what it removed by category and count, never by value |
| `diffreader` **Diffreader** | 3 | P | apocryphal | Com/Ref | — | Compares two versions and reports substantive changes separately from formatting |

### L. Orchestration & meta

| assistant | lvl | kind | lane | claims | affiliation | one line |
|---|---|---|---|---|---|---|
| `symbia` **Symbia** ✅ | 5 | P | conditional | Com/Ref | — | The coordinator |
| `dispatcher` **Dispatcher** | 4 | D | inherit | Com/Ref | — | Tier-1 and tier-2 routing only — explicit mention and declared patterns, no classifier, no model |
| `classifier` **Classifier** | 3 | D | inherit | Com/Ref | — | The naive-Bayes intent classifier with an out-of-domain class, exposed as an assistant so its decisions can be inte… |
| `arbiter` **Arbiter** | 5 | P | apocryphal | Com/Ref | — | When two assistants answer differently, reports the disagreement and its arenas rather than picking a winner |
| `clarifier` **Clarifier** | 3 | P | apocryphal | Com/Ref | — | Asks exactly one disambiguating question when routing is genuinely ambiguous, and never more than one before refusing |
| `refuser` **Refuser** | 2 | D | inherit | Ref | — | The default-rule assistant: produces a sealed REFUSED envelope with a reason |
| `escalator` **Escalator** | 4 | P | apocryphal | Ret/Com/Ref | — | Creates a handoff to a person with the full context and the receipt attached |

### M. Models

| assistant | lvl | kind | lane | claims | affiliation | one line |
|---|---|---|---|---|---|---|
| `modelwarden` **Modelwarden** | 3 | D | inherit | Ret/Com/Ref | — | Reports what the models service actually has loaded |
| `substituter` **Substituter** | 4 | D | inherit | Ret/Com/Ref | — | Executes the declared `onUnavailable` policy — refuse or substitute — and records the substitution in the envelope |
| `evaluator` **Evaluator** | 4 | P | apocryphal | Ret/Com/Ref | — | Runs declared evaluations and reports scores with the weight digest of what was scored |
| `costwatch` **Costwatch** | 3 | D | inherit | Ret/Com/Ref | — | Token and spend accounting per assistant, per conversation, per retry |

### N. Memory & correction

| assistant | lvl | kind | lane | claims | affiliation | one line |
|---|---|---|---|---|---|---|
| `rememberer` **Rememberer** | 4 | P | apocryphal | Ret/Com/Ref | — | Recalls conversation memory with the turn it came from |
| `corrector` **Corrector** | 4 | P | apocryphal | Com/Ref | — | Revises the calculation rather than operating on its output |
| `forgetter` **Forgetter** | 3 | D | inherit | Ret/Com/Ref | — | Applies retention policy and produces a receipt for the deletion |

---

## 4. The definition shape, and how it loads

Every entry in the companion JSON is a **catalog resource** of `type:
"assistant"` with a normalized `metadata.config` per the 12 Aug spec. Key format
is the settled one: `assistants/<name>` — type-plural prefix, domain in tags
never keys.

### REST

```bash
# one
curl -sX POST http://localhost:8000/svc/catalog/api/resources \
  -H "Authorization: Bearer $TOKEN" -H "X-Org-Id: $ORG" \
  -H 'Content-Type: application/json' \
  -d @one-assistant.json

# the whole roster
jq '{resources: .resources}' docs/proposals/assistant-roster-brainstorm.json \
| curl -sX POST http://localhost:8000/svc/catalog/api/resources/bulk \
  -H "Authorization: Bearer $TOKEN" -H "X-Org-Id: $ORG" \
  -H 'Content-Type: application/json' -d @-

# publish (status is not decoration — assistant-loader passes ?status=published)
curl -sX POST http://localhost:8000/svc/catalog/api/resources/ast-warden/publish \
  -H "Authorization: Bearer $TOKEN" -H "X-Org-Id: $ORG"
```

Everything ships `status: "draft"`. Publishing is a separate, deliberate act —
and the assistants harness reconciles both directions, so **a published
assistant that no prediction names is a harness failure**. That is the intended
brake on this document: you cannot bulk-publish 115 assistants without writing
115 predictions someone is willing to be wrong about.

### MCP

`symbia_list_assistants` and `symbia_get_resource` read; writes go through the
catalog tools on the same server. Note `.mcp.json` holds a real bearer token —
it does not appear in this document and must not appear in any issue.

### Fields, and the reader for each

| field | read by | status |
|---|---|---|
| `key`, `type`, `status` | catalog write gate; `assistant-loader` (`?status=published`) | confirmed |
| `tags` | search only — never behaviour | confirmed by ruling |
| `metadata.ruleSet.rules[]` | `RunCoordinator.processEvent` | confirmed |
| `metadata.config.kind` | failure behaviour (`bdcd73d`) | confirmed |
| `metadata.config.lane` / `claims` | sealing + arena audit | **partially wired** |
| `metadata.config.model` | intended `llm.invoke` precedence | **the 12 Aug merge — verify before trusting** |
| `metadata.config.digest` | envelope citation per `assistant-data-model.md` §3 | **PAPER** |
| `metadata.affiliation` | *nothing yet* — proposed in §7 | **PAPER, no reader** |
| `metadata.assistantConfig.capabilities` | *nothing enforces it today* | **PAPER until wasm** |

Two of those have no reader. They are marked, not hidden — that is the whole
lesson of `ExecutionContext.llmConfig`.

**Caveat on `config.digest`:** computed here with a local RFC 8785-ish
canonicalizer (sorted keys, no whitespace). It has **not** been checked against
`@symbia/crypto`'s canonicalization. If they disagree, every digest in the JSON
is wrong. Verify before citing one in an envelope.

---

## 5. Three worked examples

A deterministic verifier that must never get a model — note `model.source:
"none"` and `onFailure: "refuse"`:

```json
{
  "id": "ast-egress-warden",
  "key": "assistants/egress-warden",
  "name": "Egress Warden",
  "description": "Runs a candidate outbound URL through `@symbia/egress` and says allowed or blocked and by which rule. Deterministic on purpose: an SSRF guard that a model can talk out of is not a guard.",
  "type": "assistant",
  "status": "draft",
  "tags": [
    "assistant",
    "core",
    "level-3",
    "deterministic",
    "d"
  ],
  "accessPolicy": {
    "visibility": "public",
    "actions": {
      "read": {
        "anyOf": [
          "public"
        ]
      },
      "write": {
        "anyOf": [
          "role:admin"
        ]
      }
    }
  },
  "metadata": {
    "alias": "egress-warden",
    "coreLevel": 3,
    "coreTitle": "Grounded recall",
    "coreDescription": "Runs a candidate outbound URL through `@symbia/egress` and says allowed or blocked and by which rule. Deterministic on purpose: an SSRF guard that a model can talk out of is not a guard.",
    "affiliation": null,
    "config": {
      "kind": "deterministic",
      "lane": "inherit",
      "claims": [
        "COMPUTED",
        "REFUSED"
      ],
      "onFailure": "refuse",
      "model": {
        "source": "none",
        "id": null,
        "onUnavailable": "refuse"
      },
      "digest": "sha256:8d7e91821f87b16c9464f0747d649f09ccba62bee090675e2f05357a1e5a3be0"
    },
    "assistantConfig": {
      "principalId": "assistant:egress-warden",
      "principalType": "assistant",
      "capabilities": [
        "messaging",
        "tools"
      ]
    },
    "ruleSet": {
      "id": "ruleset-egress-warden",
      "name": "Egress Warden Rules",
      "version": 1,
      "isActive": true,
      "rules": [
        {
          "id": "egress-warden-main",
          "name": "Egress Warden \u2014 handle",
          "priority": 100,
          "enabled": true,
          "trigger": "message.received",
          "onError": "refuse",
          "fallThrough": false,
          "conditions": {
            "logic": "or",
            "conditions": [
              {
                "field": "message.content",
                "operator": "matches",
                "value": "ssrf|egress|outbound|webhook url|169\\.254"
              }
            ]
          },
          "actions": [
            {
              "id": "tool-egress-check",
              "type": "tool.invoke",
              "params": {
                "tool": "egress.check",
                "input": "{{message.content}}",
                "resultKey": "tool_result"
              }
            },
            {
              "id": "reply",
              "type": "message.send",
              "params": {
                "template": "{{tool_result}}"
              }
            }
          ]
        },
        {
          "id": "egress-warden-refuse",
          "name": "Default refusal",
          "priority": 1,
          "enabled": true,
          "isDefault": true,
          "trigger": "message.received",
          "conditions": {
            "logic": "and",
            "conditions": []
          },
          "actions": [
            {
              "id": "refuse",
              "type": "message.send",
              "params": {
                "content": "I answer only from this installation's governance & security sources. That request is outside what I can ground, so I am declining rather than guessing."
              }
            }
          ]
        }
      ]
    }
  }
}
```

A grounded stack assistant — fetch first, reason over what came back, claim
RETRIEVED:

```json
{
  "id": "ast-warden",
  "key": "assistants/warden",
  "name": "Warden",
  "description": "Answers 'is it running' from the running stack, never from the registry. Holds the registered-vs-running distinction that `RunningServices` is currently the only home for, and refuses to call a registered service healthy on the strength of its registration.",
  "type": "assistant",
  "status": "draft",
  "tags": [
    "assistant",
    "core",
    "level-3",
    "probabilistic",
    "a"
  ],
  "accessPolicy": {
    "visibility": "public",
    "actions": {
      "read": {
        "anyOf": [
          "public"
        ]
      },
      "write": {
        "anyOf": [
          "role:admin"
        ]
      }
    }
  },
  "metadata": {
    "alias": "warden",
    "coreLevel": 3,
    "coreTitle": "Grounded recall",
    "coreDescription": "Answers 'is it running' from the running stack, never from the registry. Holds the registered-vs-running distinction that `RunningServices` is currently the only home for, and refuses to call a registered service healthy on the strength of its registration.",
    "affiliation": null,
    "config": {
      "kind": "probabilistic",
      "lane": "apocryphal",
      "claims": [
        "RETRIEVED",
        "COMPUTED",
        "REFUSED"
      ],
      "onFailure": "retry",
      "model": {
        "source": "remote",
        "id": "claude-sonnet-5",
        "onUnavailable": "substitute"
      },
      "generation": {
        "maxTokens": 900
      },
      "retries": {
        "max": 3
      },
      "digest": "sha256:226b7f14000482814c1af7422f170773a5fa505c920ca64256864e51d511009b"
    },
    "assistantConfig": {
      "principalId": "assistant:warden",
      "principalType": "assistant",
      "capabilities": [
        "messaging",
        "services"
      ]
    },
    "ruleSet": {
      "id": "ruleset-warden",
      "name": "Warden Rules",
      "version": 1,
      "isActive": true,
      "rules": [
        {
          "id": "warden-main",
          "name": "Warden \u2014 handle",
          "priority": 100,
          "enabled": true,
          "trigger": "message.received",
          "onError": "refuse",
          "fallThrough": false,
          "conditions": {
            "logic": "or",
            "conditions": [
              {
                "field": "message.content",
                "operator": "matches",
                "value": "health|status|what.?s (up|running)|is .* (up|down)"
              }
            ]
          },
          "actions": [
            {
              "id": "fetch-network",
              "type": "service.call",
              "params": {
                "service": "network",
                "method": "GET",
                "path": "/api/nodes",
                "resultKey": "network_data"
              }
            },
            {
              "id": "fetch-catalog",
              "type": "service.call",
              "params": {
                "service": "catalog",
                "method": "GET",
                "path": "/api/resources?type=service",
                "resultKey": "catalog_data"
              }
            },
            {
              "id": "answer",
              "type": "llm.invoke",
              "params": {
                "systemPrompt": "You are Symbia's Warden assistant. Answer ONLY from the LIVE DATA below, fetched moments ago from this installation. If it does not contain the answer, say exactly what is missing and which service or integration would hold it. Never fill a gap from general knowledge \u2014 an invented answer is the failure this platform exists to prevent. Cite the source of every fact. Numbers over adjectives.",
                "userPrompt": "{{message.content}}\n\nLIVE DATA:\nnetwork: {{network_data}}\ncatalog: {{catalog_data}}"
              }
            }
          ]
        },
        {
          "id": "warden-refuse",
          "name": "Default refusal",
          "priority": 1,
          "enabled": true,
          "isDefault": true,
          "trigger": "message.received",
          "conditions": {
            "logic": "and",
            "conditions": []
          },
          "actions": [
            {
              "id": "refuse",
              "type": "message.send",
              "params": {
                "content": "I answer only from this installation's stack-native introspection sources. That request is outside what I can ground, so I am declining rather than guessing."
              }
            }
          ]
        }
      ]
    }
  }
}
```

An integration-affiliated assistant — structurally identical to the one above
with the service calls swapped for `integration.invoke`, which is §7's entire
point:

```json
{
  "id": "ast-edgar",
  "key": "assistants/edgar",
  "name": "Edgar",
  "description": "Public filings, quoted with accession number. A near-perfect RETRIEVED-arena case: the source is authoritative, dated and immutable.",
  "type": "assistant",
  "status": "draft",
  "tags": [
    "assistant",
    "core",
    "level-3",
    "probabilistic",
    "g",
    "integration:sec-edgar"
  ],
  "accessPolicy": {
    "visibility": "public",
    "actions": {
      "read": {
        "anyOf": [
          "public"
        ]
      },
      "write": {
        "anyOf": [
          "role:admin"
        ]
      }
    }
  },
  "metadata": {
    "alias": "edgar",
    "coreLevel": 3,
    "coreTitle": "Grounded recall",
    "coreDescription": "Public filings, quoted with accession number. A near-perfect RETRIEVED-arena case: the source is authoritative, dated and immutable.",
    "affiliation": {
      "kind": "integration",
      "integrationId": "sec-edgar"
    },
    "config": {
      "kind": "probabilistic",
      "lane": "apocryphal",
      "claims": [
        "RETRIEVED",
        "COMPOSED",
        "REFUSED"
      ],
      "onFailure": "retry",
      "model": {
        "source": "remote",
        "id": "claude-sonnet-5",
        "onUnavailable": "substitute"
      },
      "generation": {
        "maxTokens": 900
      },
      "retries": {
        "max": 3
      },
      "digest": "sha256:a6ce71f2d2eecb14cb6887972f0e639cd4d6caacb37fc1950e40460f0d67e0a0"
    },
    "assistantConfig": {
      "principalId": "assistant:edgar",
      "principalType": "assistant",
      "capabilities": [
        "integrations",
        "messaging"
      ]
    },
    "ruleSet": {
      "id": "ruleset-edgar",
      "name": "Edgar Rules",
      "version": 1,
      "isActive": true,
      "rules": [
        {
          "id": "edgar-main",
          "name": "Edgar \u2014 handle",
          "priority": 100,
          "enabled": true,
          "trigger": "message.received",
          "onError": "refuse",
          "fallThrough": false,
          "conditions": {
            "logic": "or",
            "conditions": [
              {
                "field": "message.content",
                "operator": "matches",
                "value": "10-k|10-q|filing|\\bsec\\b|edgar"
              }
            ]
          },
          "actions": [
            {
              "id": "invoke-sec-edgar",
              "type": "integration.invoke",
              "params": {
                "integrationId": "sec-edgar",
                "operation": "filings.search",
                "resultKey": "sec-edgar_data"
              }
            },
            {
              "id": "invoke-sec-edgar",
              "type": "integration.invoke",
              "params": {
                "integrationId": "sec-edgar",
                "operation": "filing.get",
                "resultKey": "sec-edgar_data"
              }
            },
            {
              "id": "answer",
              "type": "llm.invoke",
              "params": {
                "systemPrompt": "You are Symbia's Edgar assistant. Answer ONLY from the LIVE DATA below, fetched moments ago from this installation. If it does not contain the answer, say exactly what is missing and which service or integration would hold it. Never fill a gap from general knowledge \u2014 an invented answer is the failure this platform exists to prevent. Cite the source of every fact. Numbers over adjectives.",
                "userPrompt": "{{message.content}}\n\nLIVE DATA:\nsec-edgar: {{sec-edgar_data}}\nsec-edgar: {{sec-edgar_data}}"
              }
            }
          ]
        },
        {
          "id": "edgar-refuse",
          "name": "Default refusal",
          "priority": 1,
          "enabled": true,
          "isDefault": true,
          "trigger": "message.received",
          "conditions": {
            "logic": "and",
            "conditions": []
          },
          "actions": [
            {
              "id": "refuse",
              "type": "message.send",
              "params": {
                "content": "I answer only from this installation's integration-affiliated sources. That request is outside what I can ground, so I am declining rather than guessing."
              }
            }
          ]
        }
      ]
    }
  }
}
```

---

## 6. What is deliberately absent

Naming these matters more than most of what is present.

- **A code/engineering assistant that executes anything.** Bash was removed
  from code tools today. Until the wasm boundary is real, this assistant cannot
  be built honestly — so it is not in the list.
- **A general knowledge assistant.** There is no arena for it but GENERATED,
  which is deliberately not one of the four.
- **Anything that writes money.** `stripe` and `quickbooks` are read-only
  affiliations by construction.
- **A "smart router" that uses a model first.** Tier order is explicit-mention,
  declared patterns, classifier, then a model — `dispatcher` and `classifier`
  exist to keep that order inspectable.
- **Per-org variants.** No org ids or metric namespaces are baked into any
  artifact here, per `docs/APP-MODEL.md`.

---

## 7. The integration hypothesis, taken seriously

Brian's thought: *many assistants will be directly affiliated with a specific
integration.* Family G assumes it and runs to 36 entries. Here is the
argument that it is right, and the sharper argument about what follows.

**It is right because affiliation is where the refusal comes from.** An
assistant affiliated with EDGAR refuses anything not in a filing. One
affiliated with the calendar refuses anything not on a calendar. The
integration is not a data source bolted onto a personality — it *is* the
boundary that makes the refusal principled instead of arbitrary. Family G
entries were the easiest in this document to write for exactly that reason.

**But look at what the generator did.** `warden` and `edgar` in §5 differ in
three places: the action type, the operation names, and one sentence of prompt.
Everything else — config, refusal rule, capabilities, claims, key format — is
mechanical. Which suggests:

> **An integration-affiliated assistant should be a projection of the
> integration's manifest, not an authored artifact.**

The integrations service already has `spec-parser`, `openapi-executor` and
`mcp-executor`. An OpenAPI spec or an MCP server already declares its
operations, their inputs, and their outputs. That is enough to derive: the
patterns it handles, the operations it may call, its capability set, and — the
important one — **what it must refuse**, which is the complement of its
declared operations.

If that holds, the strategy is not "write 36 assistants." It is: **write one
generator and one manifest-to-assistant contract, then argue about the ten
integrations worth having.** The 36 entries below are the argument for the
generator, not a work queue. Their real value is as test cases: if the
generator cannot produce `edgar` and `postgres` and `gsheets` from their
manifests alone, the contract is wrong.

**The tension this creates**, stated so it does not get lost: component
manifests are public contracts with no domain vocabulary. A generated assistant
has to be domain-flavoured to be useful. So the domain has to enter *somewhere*
— tags, an affiliation record, or an installation-level overlay — and never the
manifest. `metadata.affiliation` in these definitions is a placeholder for that
seam, and it currently has no reader.

### Integration catalog — 59 candidates

| integration | category | state | note |
|---|---|---|---|
| `anthropic` | model provider | LIVE | The only provider with a credential in this stack (measured 7 Aug). Rejects temperature 0.7 on claude-sonnet-5 — capability, not preference. |
| `openai` | model provider | REGISTERED | In the provider enum, declared by every bootstrap assistant, no credential present. A registered-not-running of the credential kind. |
| `huggingface` | model provider | REGISTERED | Open-weight discovery; the obvious feeder for a models service that reports zero loaded. |
| `symbia-labs` | model provider | REGISTERED | First-party. The case where provider identity and platform identity coincide — worth a design pass on whose seal signs the reply. |
| `gmail` | productivity | BOOTSTRAP (hollow) | Existing assistant is one llm.invoke saying what it *would* do. Zero service calls. |
| `gcal` | productivity | BOOTSTRAP (hollow) | Same shape as gmail. |
| `gdrive` | productivity | BOOTSTRAP (hollow) | Same shape as gmail. |
| `gsheets` | productivity | BOOTSTRAP (hollow) | Same shape as gmail. |
| `gdocs` | productivity | BOOTSTRAP (hollow) | Same shape as gmail. |
| `slack` | comms | PROPOSED | First candidate for a channel-affiliated principal — a Slack identity is an identity the platform must model, not just a token. |
| `teams` | comms | PROPOSED | Same modelling problem as Slack, different consent surface. |
| `discord` | comms | PROPOSED | Low stakes, good for exercising channel bridging. |
| `twilio` | comms | PROPOSED | SMS carries a real delivery receipt — the smallest honest provenance test case in the list. |
| `sendgrid` | comms | PROPOSED | Outbound email with per-message event webhooks. |
| `github` | engineering | PROPOSED | Underpins Citest / Committer / Remediation. Probably the highest-leverage single integration in the list. |
| `gitlab` | engineering | PROPOSED | Parity case; tests whether an affiliation can be swapped without rewriting the assistant. |
| `linear` | engineering | PROPOSED | Natural sink for Defect Ledger once a defect stops being a markdown file. |
| `atlassian` | engineering | PROPOSED | JQL is a deterministic query language — good split test for query-deterministic / wording-probabilistic. |
| `sentry` | observability | PROPOSED | Errors with release and first-seen attached. |
| `datadog` | observability | PROPOSED | Kept separate from Obs on purpose: a claim about our own logs must never be sourced from a vendor index. |
| `grafana` | observability | PROPOSED | Dashboards as declared queries — more interesting as a source of query definitions than of numbers. |
| `prometheus` | observability | PROPOSED | Raw metric surface, deterministic query. |
| `pagerduty` | operations | PROPOSED | Read-only affiliation; paging a human is an action with a different consent model. |
| `opsgenie` | operations | PROPOSED | Parity case. |
| `kubernetes` | infrastructure | PROPOSED | Live cluster state — the strongest registered-vs-running test outside our own stack. |
| `terraform` | infrastructure | PROPOSED | Declared state vs actual state; a plan diff is a provenance artifact already. |
| `aws` | infrastructure | PROPOSED | Broad surface. Needs egress guard and capability broker simultaneously. |
| `s3` | storage | PROPOSED | Etag and version id make every read citable. |
| `postgres` | data | PROPOSED | Must run inside the RLS scope. An explicit client here bypasses the wrapper — grep before adding one. |
| `snowflake` | data | PROPOSED | Warehouse reads; query id is the citation. |
| `dbt` | data | PROPOSED | Model lineage that already looks like ours — worth studying before building. |
| `elasticsearch` | data | PROPOSED | Search over unstructured corpora with score exposure. |
| `stripe` | business | PROPOSED | Reads only. Money movement belongs behind an explicit human step. |
| `quickbooks` | business | PROPOSED | Ledger reads. |
| `salesforce` | business | PROPOSED | SOQL reads. |
| `hubspot` | business | PROPOSED | CRM parity case. |
| `zendesk` | business | PROPOSED | Support history that a KB assistant must cite rather than paraphrase. |
| `intercom` | business | PROPOSED | Conversation corpus. |
| `notion` | knowledge | PROPOSED | High risk of becoming a sourceless summarizer; constrain to quote-with-page-id. |
| `confluence` | knowledge | PROPOSED | Same risk, more governance. |
| `box` | storage | PROPOSED | Permission model is the interesting part, not the files. |
| `sharepoint` | storage | PROPOSED | Same. |
| `okta` | identity | PROPOSED | External identity — forces the question of how a foreign principal maps to a Symbia principal. |
| `vault` | identity | PROPOSED | External secret store alongside our own HKDF vault; two custodians is a design decision, not a feature. |
| `figma` | design | PROPOSED | Design artifacts with version history. |
| `docusign` | legal | PROPOSED | Signature events are provenance events by construction. |
| `sec-edgar` | public data | PROPOSED | Authoritative, dated, immutable — the cleanest RETRIEVED-arena case available. |
| `fred` | public data | PROPOSED | Series vintages make a revision visibly a different number. |
| `eia` | public data | PROPOSED | Feeds the energy test case without letting energy vocabulary into a manifest. |
| `noaa` | public data | PROPOSED | Observation vs forecast = two arenas from one integration. Good lane exercise. |
| `census` | public data | PROPOSED | Vintage discipline again, at a different cadence. |
| `wikidata` | public data | PROPOSED | Statement-level references — the closest public analogue to what we are building. |
| `arxiv` | public data | PROPOSED | Identifier-and-version citation is native. |
| `pubmed` | public data | PROPOSED | Same, with a higher cost of being wrong. |
| `uspto` | public data | PROPOSED | Filings with examiner history. |
| `openstreetmap` | public data | PROPOSED | Changeset id distinguishes a map that moved from a place that moved. |
| `mcp:generic` | meta | LIVE | `mcp-executor.ts` exists. Any MCP server is a candidate integration — which is the argument for generating affiliated assistants rather than authoring them. |
| `openapi:generic` | meta | LIVE | `openapi-executor.ts` + `spec-parser`. Same argument: the spec already declares the operations an assistant would expose. |
| `internal:generic` | meta | LIVE | `internal-executor.ts` — Symbia services addressed through the integrations path. |

The last three rows are the load-bearing ones. `mcp:generic`,
`openapi:generic` and `internal:generic` already exist as executors. Every row
above them is arguably a configuration of one of those three — which is either
a large simplification or a category error, and is worth settling before anyone
writes a second bespoke provider.

---

## 8. Open questions — for the strategy conversation

**Q1 — Is an assistant a resource, or a projection?** This document assumes the
former (catalog resources with rulesets). §7 argues a large fraction should be
the latter. Both cannot be the default. If projection wins, the catalog holds
generators and contracts, and the roster is a *view*.

**Q2 — Does fetch-then-compose claim RETRIEVED?** MESSAGES.md says the arena
describes the value and the basis discloses the wording, which implies yes for
verbatim relay. But most Family A/G assistants relay *and* reason in one
`llm.invoke`, which arguably collapses to COMPOSED-with-citations. The answer
decides `claims` on roughly half this roster. **Not settled here.**

**Q3 — What is the unit of identity?** `assistant:warden` is a principal. Is
that principal per-app, per-installation, or global? `docs/APP-MODEL.md` says
design agreed, not fully implemented. A federated receipt makes this urgent.

**Q4 — Who owns the refusal text?** Every entry has a default refusal rule. If
those are authored per assistant they will drift; if they are templated they
will be generic. Templated-with-a-named-boundary is the compromise the
generator took, and it may be wrong.

**Q5 — Should capabilities be declared or derived?** Declared is honest but
drifts from what the rules actually call. Derived from the rules is accurate
but means an assistant cannot promise less than it can do. Under the wasm
proposal the grant is real, and the answer stops being cosmetic.

**Q6 — What is the smallest roster that proves the platform?** The honest
answer may be five, not 115. Three assistants found twelve platform defects.
The value of this list is defect-finding rate per assistant, and that is a
decreasing function.

---

## 9. Whittling criteria

Suggested cuts, in order, for the next pass:

1. **No prediction, no publish.** Anything nobody will write a falsifiable
   prediction for is cut. This alone probably removes 80%.
2. **Cut anything whose refusal is not distinctive.** If two assistants refuse
   the same things, they are one assistant with two prompts.
3. **Cut anything blocked on a field with no reader** — unless the point of
   building it is to force the reader to exist. Say which.
4. **Keep every assistant that would have caught a real defect.** `regexsmith`
   (the `(?i)` defect, twice), `staleness` (`DEVELOPER.md` §8), `reconciler`
   (`server` on 5000), `modelwarden` (zero models loaded), `validator`
   (`validateConfig` never validated anything). That is a strong keep-list and
   it was not designed — it fell out of writing the descriptions.
5. **Cap Family G at the number of integrations with a live credential.** Today
   that is one.
6. **Prefer deterministic.** 44 of 115 here are deterministic. In a platform
   whose thesis is that decisions should use deterministic methods wherever
   they can, that ratio is probably backwards.

---

*Generated 13 Aug 2026. PAPER — nothing registered, nothing measured.*
