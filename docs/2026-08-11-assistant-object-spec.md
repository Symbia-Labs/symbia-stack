# The assistant object — field by field

*Working document, started 11 August 2026. **The point is agreement before
code.** Every row says what actually reads the field today, with a file, so we
are agreeing about the running system rather than about a schema.*

**Status key:** ✅ settled · ⚠️ works but contested · ❓ open · 🚫 dead

---

## Top-level fields

### `id` ✅
`ast-calculator`. Catalog primary key. Addressed directly by
`scripts/write-deterministic-routing.mts` and every `PATCH /api/resources/:id`.

*Not derived from `key`, and the console assumes it is — see the review doc §3.4.*

### `key` ✅
`assistants/calculator`. Type-prefixed plural path, per the catalog ruling
(settled 9 Aug, `docs/2026-08-09-catalog-roadmap.md` §7.3 — not to be
relitigated).

**This is the assistant's real name.** `loadedAssistantKey()` derives the short
key by taking the last segment, and everything downstream — routing targets,
`assistant:<key>` principals, delegation records — uses that short form.

❓ **The short form is derived, not stored.** `assistants/calculator` →
`calculator` happens in `assistant-loader`. Two assistants at
`assistants/math/calculator` and `assistants/finance/calculator` would collide
silently. Nesting is allowed by the key rules; the collision is not checked.

### `name` ✅
Display only. `Symbia`, `Calculator`, `Smart Calculator`.

### `description` ⚠️
Read by **three** consumers, which is more load than it looks:
1. `assistants.list` → the roster the coordinator renders.
2. `embedding-route.ts:225` builds its embedding text from it.
3. The console cards.

⚠️ It is doing double duty as *human blurb* and *routing signal*. Now that
`routing.handles` exists for the first and `routing.examples` for the second,
`description` should probably go back to being prose only.

### `type` ✅
`"assistant"`. The loader fetches `?type=assistant`.

### `status` ✅ *(fixed today)*
`published` | `draft`. **This is the roster gate.** `assistant-loader` passes
`?status=published`; anything else does not load, does not route, does not
appear in `assistants.list`.

Until 11 Aug the loader ignored it and `status` was decoration.

### `isBootstrap` ⚠️
Read at `webhooks.ts:1059` and `:1126` — and only there. It decides **how the
assistant authenticates**: `true` → register/login with the shared
`BOOTSTRAP_AGENT_CREDENTIAL`; `false` → `getAgentToken()`.

⚠️ The name says "shipped with the platform" and the behaviour is "uses the
shared dev credential". Those will diverge the moment a non-bootstrap assistant
exists. Should be `authMode: 'shared' | 'own'` or similar.

### `tags` ⚠️
Read by the catalog for search/filter (`routes.ts:677`). Nothing in the
assistants service reads them.

⚠️ Current tags mix four unrelated axes: `assistant` (redundant with `type`),
`bootstrap` (redundant with `isBootstrap`), `tutorial`/`level-2` (pedagogy),
`deterministic` (a *claim about behaviour* that nothing verifies), `math`
(domain). The `deterministic` tag is the one to worry about — it asserts
something the platform can now actually measure and does not check.

### `orgId` ❓
**`null` on every assistant.**

Consequential: every *credential* is org-scoped (that was today's biggest
debugging session), and every assistant is org-less. It works only because the
coordinator resolves credentials using the conversation's org, not its own.

❓ Should an assistant belong to an org? An org-less assistant is either a
platform primitive or an accident.

### `accessPolicy` ✅
`{ visibility, actions: { read: {anyOf}, write: {anyOf} } }`. Enforced by the
catalog (`routes.ts:312`, `canPerformAction`). All three are `public`/read,
`role:admin`/write.

### `currentVersion` ⚠️
Incremented by `storage.ts:179` on version publish. All three sit at `1` despite
today's many writes — so **PATCH does not version.** The `Versions` tab in the
console has nothing to show.

---

## `metadata` — five concerns in one bag

The central design question. These have different owners, different lifetimes,
and different audiences.

### `metadata.alias` ✅
`calc`, `smartcalc`, `symbia`. What a person types. Resolved by
`resolveAssistant()` (key **or** alias) and now by the router's tier-0 mention
check.

### `metadata.routing` ⚠️ *(added today)*
```
handles      one line, used in the refusal message
patterns[]   tier 1 — exact, extracts nothing
examples[]   tier 2 — trains the classifier
precedence   integer, higher wins
```
Read by `assistants.route` in `tool-invoke.ts`. **Declaring it is what makes an
assistant a routing target**; an assistant without it is unreachable except by
name.

⚠️ **This is a public contract in a free-form bag.** Component manifests are
first-class for exactly this reason. Candidate for promotion to a column.

❓ Missing: `negativeExamples` exists in the type and no assistant declares any.
❓ Missing: a declared *arena expectation* — "I only ever produce COMPUTED" —
which the platform could now check against the replies actually produced.

### `metadata.ruleSet` ✅
The behaviour. `{ id, name, description, version, isActive, rules[] }`, each
rule `{ id, name, priority, enabled, trigger, conditions, actions }`.

Registered by `assistant-loader` → `registerRuleSet` → executed by
`RuleExecutor`. **First match by priority wins and execution stops.**

### `metadata.assistantConfig` ⚠️
```
principalId    assistant:calculator
principalType  assistant
capabilities   [messaging, tools.math]
```
`principalId` is the identity the assistant authenticates as, and the
`actor_identity` on delegation lineage events.

⚠️ `capabilities` here is **not** read by the assistants service — the greps
find only unrelated entitlement lists. It is declarative documentation that
nothing enforces. Either wire it to the action handlers (a rule using
`tool.invoke` should require `tools.math`) or stop implying it is a
permission.

### `metadata.llmConfig` ⚠️
`null` on Calculator; present on Smart Calculator and Symbia. Resolved by
`llm-config-resolver` into a `ResolvedLLMConfig`.

⚠️ The console reads *presence* of this as the determinism score. That was a
fair proxy before today; it is now wrong — Symbia has an `llmConfig` and routes
with no model at all.

### `metadata.curriculum*` 🚫
`curriculumLevel`, `curriculumTitle`, `curriculumDescription`. **Nothing in any
service reads them** — the grep returns zero hits outside the console.

Pedagogy embedded in the object. Fine when the pool was ten teaching examples;
now it makes a working team present itself as a tutorial.

---

## What we should decide before writing code

1. **Does `routing` get promoted out of `metadata`?** It is the field that
   decides who answers, it is read at load time, and it is a contract between
   assistants. Everything else in `metadata` is private to the assistant.
2. **Does an assistant declare its expected arena?** If yes, the platform can
   test the claim against real replies — a per-assistant honesty check that
   nothing else in the industry can run.
3. **`capabilities`: enforce or delete.** Declarative permissions that nothing
   checks are worse than none.
4. **Is `curriculum*` part of the object or part of a view?**
5. **Do assistants belong to an org?**

---

## Ephemeral assistants — the part that breaks the model

*Raised 11 Aug. Nothing below is built. This section exists to find the
contradictions early.*

The idea: a private LLM embed composes an assistant on the fly — for one task,
one conversation, one user — rather than an author registering one in the
catalog.

**Everything above assumes an assistant is declared.** The status gate, the
routing declarations, the catalog key, the agent principal, the signed
delegation naming `assistant:<key>`. An ephemeral assistant is undeclared by
construction. So:

### The four contradictions

**1. Routing.** Today an assistant is reachable because it *declares* patterns
and examples. An ephemeral one has no declarations — and if the composing model
writes them, then routing to it is only as reproducible as that model was.
The delegation `method` would have to be `model`, and the whole canonical-lane
claim for routing collapses for anything ephemeral.

*Or:* an ephemeral assistant is **never routed to** — only ever invoked
explicitly, by name or by the thing that created it. That preserves the lane
and is probably right.

**2. Identity.** Delegation events sign `actor_identity: assistant:<key>`. A
key that exists for ninety seconds is still a real identity — GKS is explicit
that identity is portable and scoped — but *who vouches for it*? Options: the
creating principal signs on its behalf (attested), or it self-signs
(self-attested), and `@symbia/lineage`'s attestation levels already have the
vocabulary for exactly this distinction.

**3. Provenance.** A receipt cites an assistant that no longer exists. If the
reply's envelope names `assistant:tmp-x9f2`, a verifier a week later cannot
fetch anything about it. **This is solvable and it is the interesting part:**
the ephemeral assistant's *definition* — its rules, its declarations, its
composing prompt — should be sealed into the delegation as a payload, exactly
as `presentation.raw` seals the pre-humanised text. Then the receipt carries
the assistant, and "who answered this" is answerable forever without the
assistant persisting.

**4. The pool.** `builder` — *"creates new assistants from natural language,
the meta-assistant"* — is one of the seven we unpublished today. It is the
ancestor of this idea and it is currently switched off.

### The question I would want settled first

**Is an ephemeral assistant a first-class assistant, or is it a *routine*?**

If it can be routed to, it needs declarations, identity, and a receipt story —
all four problems above. If it is a composed *behaviour* that an existing
assistant runs on your behalf, then it is a `ruleSet` without a resource, the
existing assistant's identity signs everything, and none of the four bite.

The second reading costs less and gives up less. But it also gives up the thing
that might be the point: an assistant you can *keep* if it turns out to be
good — which is `builder`, and which is a promotion path from ephemeral to
declared rather than two separate concepts.
