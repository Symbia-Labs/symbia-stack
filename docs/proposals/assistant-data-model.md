# Proposal — the assistant data model

*11 August 2026. A **proposal**, to be argued with. Grounded in
`docs/2026-08-11-assistant-object-spec.md`, which records what each field does
today.*

---

## 1. The problem the current shape has

`metadata` is a bag holding five concerns with different owners, lifetimes and
audiences:

| concern | today | owner | changes |
|---|---|---|---|
| identity | `assistantConfig.principalId`, `alias`, `isBootstrap` | identity | ~never |
| reachability | `routing.*` | the router | often |
| behaviour | `ruleSet.*` | the rules engine | often |
| capability | `capabilities`, `llmConfig` | integrations, models | occasionally |
| pedagogy | `curriculum*` | nothing reads it | — |

Two of these are **public contracts** — other components depend on them —
and they are in the same free-form field as a tutorial label that nothing reads.
The component manifest is first-class for precisely this reason.

**And configuration is about to stop being authored.** If a private LLM embed
can compose an assistant's rules or its routing declarations at runtime, the
bag has no way to say which parts were written by a person and which were
generated, or to let a receipt point at the exact configuration that produced
an answer.

---

## 2. The proposed shape — a definition and an instance

**Corrected 11 Aug after review.** The first draft put `status`, `orgId`,
`tags`, `accessPolicy` and *identity* in one object and called only the
configuration ephemeral. That is wrong, and `docs/APP-MODEL.md` (settled
6 Aug) already says why:

> The **app** is the artifact: versioned, immutable once published, shareable,
> deployable many times. The **installation** is one deployment of that
> artifact into an org on a particular stack. Everything that is *specific to
> running* belongs to the installation, never the artifact.
>
> *"Bake an org id … into the artifact and it can only ever be installed once,
> in one place."*

An assistant built from the catalog on the fly and put to work in a
conversation or a graph **is an installation**. So the split is not
identity-versus-config. It is:

| | **definition** — the artifact | **instance** — put to work |
|---|---|---|
| lives in | catalog | runtime, scoped to a conversation or graph run |
| portable | yes | no, by construction |
| lifetime | versioned, immutable once published | the conversation, the run, or less |
| org | **none** | the conversation's org |
| identity | none | a principal, for this instance |
| capability | required *schema* | resolved credentials and bindings |

### 2a. Definition — the catalog resource

```jsonc
{
  "id":   "8f3c1a94-6e2b-4d17-9c05-0b7a2f1de4a3",  // opaque, never parsed (§2.1)
  "key":  "assistants/calculator",                  // the addressable name (§2.2)
  "name": "Calculator",
  "description": "…prose only…",
  "type": "assistant",
  "status": "published",        // may this be instantiated at all
  "tags": ["math"],             // domain only
  "accessPolicy": { … },        // who may READ AND EDIT THE DEFINITION

  "config": {
    "digest": "sha256:…",       // content address of everything below
    "source": "declared" | "composed" | "mixed",
    "composedBy": { "by": …, "at": …, "from": …, "parts": [ … ] },

    "routing": {
      "handles":          "arithmetic written as an expression",
      "patterns":         [ … ],        // tier 1
      "examples":         [ … ],        // tier 2, classifier training
      "negativeExamples": [ … ],
      "precedence":       100,
      "claims":           ["COMPUTED"]  // §4
    },

    "behaviour": { "rules": [ … ] },

    "capability": {
      "tools":    ["math.evaluate"],    // REQUIRED, enforced at instantiation
      "requires": { "llm": false }      // schema, not values
    }
  },

  "currentVersion": 7
}
```

**No `orgId`. No `principalId`. No credentials.** A definition that names an
org can be instantiated once, in one place — which is the whole failure
`APP-MODEL` was written to prevent.

`alias` sits on the **definition** and is **unique in the catalog**, like `key`.
It is an authoring handle — its primary reader is someone building a rule, a
graph or a template, not someone chatting — so it must resolve before any
instance exists. See §2.2 for the ruling and its consequences.

### 2b. Instance — created to do work

**Substrate-neutral by construction.** Addressed by one identifier, read whole,
written whole — which an in-memory `Map`, a Redis hash, a retained MQTT message
and an AMQP queue all support identically. Nothing below requires a query, and
that is the property that keeps *where instances live* a deployment decision.

```jsonc
{
  "id": "9c1e…",                        // guid
  "definition": {
    "key":    "assistants/calculator",
    "digest": "sha256:…"                // EXACTLY which configuration
  },
  "scope": { "kind": "conversation" | "graphRun", "id": "…" },
  "orgId": "…",                         // from the scope, never the artifact

  "principal": {
    "principalId": "assistant:calculator@9c1e…",
    "authMode":    "shared" | "own"     // replaces isBootstrap
  },

  "binding": {
    // No alias here — it is an authoring handle on the definition, unique in
    // the catalog, and must resolve before any instance exists (§2.2).
    "llm":         "model:sha256:…" | null,
    "credentials": [ … ]                // resolved, org-scoped
  },

  "lifetime": { "createdAt": …, "endsAt": … | null, "endedAt": … | null }
}
```

### What this buys

1. **Ephemeral is the normal case, not a special one.** Every assistant at work
   is an instance; instances end. A *composed* definition is then just a
   definition that was never written down — one axis, not two.
2. **`orgId` stops being an open question.** It was never a property of the
   artifact. That is why every assistant has `orgId: null` today and why
   credential resolution had to borrow the conversation's org: the model was
   right by accident and undocumented.
3. **`capability` splits cleanly** into *required* (artifact) and *resolved*
   (instance) — the same schema/values split `APP-MODEL` already draws for
   config.
4. **Graph and conversation are the same shape.** "Put to work in a graph" and
   "put to work in a conversation" differ only in `scope.kind`.

### Open, and sharper than before

- ~~**Is the instance persisted at all, or purely in-memory?**~~ — **wrong
  question, and now settled: in memory, for now** (Brian, 11 Aug).

  It should not matter: runtime configuration could live in MQTT, AMQP, Redis
  or a process map, and the shape above applies to all of them unchanged. Where
  an instance lives is a **deployment** decision, not a data model one, and the
  model is only correct if it stays neutral about it.

  **Production gate, not a backlog item** (Brian, 11 Aug): some level of
  persistence is required before this is used in production, and is not needed
  before then. Filed as a *prerequisite* rather than a task so it cannot be
  quietly deferred past the line it belongs to — this is the same class as
  `NETWORK_HASH_SECRET`, where the guard exists precisely because "we will do
  it before production" is not a mechanism.

  The reason it stays cheap is the query constraint above. Keep the shape
  read-whole/write-whole and swapping the `Map` for Redis or a retained topic
  is a store implementation, not a redesign. Break it once — one convenience
  lookup across instances — and the swap becomes a migration.

  **What follows from choosing in-memory.** An instance does not survive a
  restart, and neither do the two things already built on the same footing —
  conversation memory and the lineage chain heads. Those are currently written
  down as defects. Under this ruling they are **the design**, and the honest
  behaviour is not "persist them" but *say so at the boundary*: after a
  restart, a follow-up whose referent is gone should tell the person it lost
  the thread rather than silently refuse. Recorded so the next reader does not
  file it as a bug and fix the wrong thing.

  That neutrality has to be earned rather than assumed, so: the shape holds
  **only if it never depends on query.** It is addressed by one identifier,
  read whole, and written whole — which a key-value store, a retained MQTT
  message, a Redis hash and an in-memory `Map` all satisfy. The moment the
  design wants *"all instances where X"*, it has silently chosen a database.

  It also lines up with a ruling already made. The catalog chose type-prefixed
  keys partly because **a key is an MQTT topic** — `graphs/#`,
  `integrations/ai/+/models/#` give type filters for free
  (`docs/2026-08-09-catalog-roadmap.md` §7.3). Instances are the same idea one
  layer down:

  ```
  instances/<scope-kind>/<scope-id>/<definition-key>

  instances/conversation/9c1e…/#        every assistant at work in this conversation
  instances/graphRun/7b44…/#            every assistant in this run
  ```

  Lifetime maps as cleanly: a retained message that is cleared, a TTL, a stream
  entry that expires. "Ended" needs no separate flag on a bus — the absence of
  a retained message *is* the fact.

  **One real tension, and it is worth solving before choosing a transport.**
  Catalog keys nest freely (`integrations/ai/openai/models/gpt-4o` is the
  precedent), so a definition key embedded in a topic has **variable depth**,
  and MQTT's single-level `+` cannot skip a variable number of levels. So
  `instances/+/+/assistants/calculator` — *every instance of Calculator
  anywhere* — is expressible only if the key sits last and you use `#`, which
  then cannot be followed by anything else. Either the definition is addressed
  in the topic by a fixed-shape id rather than a nesting key, or that query is
  answered some other way.
- **Does `status` gate instantiation, or the roster?** Today `published` gates
  the roster. Under this split it should gate *may this be instantiated*, and
  the roster becomes a query over live instances — which is a different and
  more honest list.
- **What is `RunningServices` for assistants?** The stack already distinguishes
  registered from running (`server` is registered with nothing behind it).
  Definition-versus-instance is the same distinction, and the platform has
  precedent for how to report it.

### 2.1 `id` is a GUID, and the schema already says so

```ts
// catalog/shared/schema.ts:296
id:  varchar("id").primaryKey().default(sql`gen_random_uuid()`),
key: varchar("key", { length: 255 }).notNull().unique(),
```

**The default is already a UUID.** Every `ast-*` id exists only because
`catalog/data/assistants-bootstrap.json` supplies one explicitly and overrides
it. So `ast-calculator` is a seed artifact, not a design.

It should go, and the reason is not tidiness:

- **`ast-calculator` is a second name.** It duplicates `key` in a slightly
  different dialect, so there are two ways to say one thing and they can
  disagree — which they already do in the console, where `id: a.key` produces
  `calculator` and every write would 404.
- **A meaningful id invites parsing.** `ast-` is a type prefix on a field that
  already sits beside `type: "assistant"`, and the moment something splits on
  the hyphen, renaming an assistant becomes a migration.
- **`key` is already the addressable name** — `.unique()`, type-prefixed, and
  settled by the catalog ruling. It is what a person and a script should use.

**Consequence, and it is the actionable part.** `scripts/simplify-roster.mjs`
and `scripts/write-deterministic-routing.mts` both address `ast-coordinator`
by id — that is, by a seed artifact. They should address by `key`, and the
catalog has no route for it: `getResourceByKey` exists in storage and is used
internally for uniqueness checks only.

**So this needs `GET|PATCH /api/resources/by-key/:key`** before the ids can
change, or every script breaks the day the seed stops supplying them.

### 2.2 Yes, `key` is the standard — and there is a second one it collides with

**`key` is settled and `assistants/calculator` conforms.**
`docs/2026-08-09-catalog-roadmap.md` §7.3 records the ruling in full: option
(a), *type-prefixed path* `<type-plural>/<name...>`, normalized — plural prefix
always, name the only free segment, nesting where earned, domain vocabulary in
tags never in keys, and the write gate validating key-prefix ⇄ type-column
agreement. Chosen partly because **a key is an MQTT topic**: `graphs/#` and
`integrations/ai/+/models/#` give type subscription filters for free. Dissent
on record for (d), opaque slug.

So the field name and the format are not up for grabs. What is genuinely
unresolved is that **an assistant can be addressed three ways and nothing
reconciles them**:

| form | example | who resolves it |
|---|---|---|
| catalog key | `assistants/calculator` | catalog, `.unique()` |
| short key | `calculator` | **derived** by `loadedAssistantKey()` — last path segment |
| alias | `@calc` | `resolveAssistant()`, and the router's tier-0 mention check |

And there is a **fourth** naming system beside it: Symbia Script refs,
`@namespace.path` — `@context`, `@message`, `@user`, `@org`, `@var`, `@env`,
`@catalog`, `@service`, `@integration`, `@entity`, `@mention`, `@component`
(`docs/SYMBIA-SCRIPT-QUICKSTART.md` §2).

**There is no `@assistant` namespace.** `@mention` exists and does not resolve;
`@component` has no `case` at all and falls through to default.

#### Correction — the collision is mostly imaginary

*Challenged 11 Aug: is the problem just the `@`, given that 99% of use goes
through interfaces with typeahead? Checked, and the answer is no — I
overstated it.*

```js
// symbia-sys/src/script.ts:167
const INTERPOLATION_PATTERN = /\{\{([^}]+)\}\}/g;
```

**Refs only resolve inside `{{ }}`.** A bare `@calc` in a chat message is never
parsed as a reference; it is text, scanned by the mention router. `{{@user.id}}`
in a rule template is a reference and is never a mention. Two different
syntactic contexts, and nothing ever has to decide between them — which is the
argument *before* typeahead, and typeahead is a second reason on top.

So `@calc` in chat alongside `{{@assistant.calc}}` in script is not the
"two spellings of one handle" defect I called it. It is closer to `#tag` and
`#comment`: the same character, unambiguous by position.

What survives the correction is **not disambiguation but capability** — and one
of the three is the challenge turned around:

1. **Typeahead needs a source.** `getRefSuggestions()` and `getNamespaces()`
   can only offer what is a namespace. With no `@assistant`, autocomplete
   cannot offer assistants *at all* — so "99% through typeahead" is an argument
   **for** the namespace, not against it.
2. **Referencing beats copying.** `{{@assistant.calc.routing.handles}}` lets a
   rule read another assistant's declared capability instead of holding a copy.
   That is the fifth roster-copy defect closed by grammar rather than
   discipline.
3. Validation and colour-coding come free from machinery that already exists.

The section below is kept because the history is worth having, and because
`@mention` and `@component` sitting unwired is still a real observation.

#### The thing I actually introduced today

Tier-0 mention routing — added this afternoon so `ask @smartcalc to…` reaches
Smart Calculator — makes `@smartcalc` look exactly like a Symbia Script
reference. It is not one. It is a regex scan in `assistants.route` over
`key` and `alias`, resolved by an entirely different mechanism, in a system
that already reserves `@` for a grammar with twelve namespaces.

I called that a naming collision. Per the correction above it is not one — the
contexts do not overlap. What it *is*, is a second resolver for the same handle
(`resolveAssistant` by key-or-alias, plus a fresh regex scan in
`assistants.route`), which is a smaller and more ordinary kind of duplication.

**Options:**

- **(i) Make it real Symbia Script.** Add an `@assistant` namespace resolving
  against the registry, so `@calc` is a ref like `@user.displayName` is. One
  grammar, autocomplete and colour-coding for free (`SymbiaScriptInput.tsx`
  already does both), and `@mention` finally means something.
- **(ii) Keep them separate and rename one.** Mentions are a *chat* convention
  with decades of precedent; refs are a *template* convention. Same character,
  different worlds — but then the docs must say so, loudly.
- **(iii) Do nothing and accept the ambiguity.** Cheapest today, and it is
  exactly how `energy.graph.pue` happened.

#### Ruling in progress — (i), and the audience is the reason

*Brian, 11 Aug: alias is most valuable inside Symbia Script, and in application
development and system-integrator use cases — where the user is **building**,
not using.*

That settles it, and it also corrects two things I had backwards:

**Alias is an authoring handle, not a chat affordance.** I built tier-0 mention
routing this afternoon as an end-user convenience and treated that as the
primary case. It is the *secondary* case — a nicety that reuses the builder's
handle. The primary reader of `@calc` is someone wiring a rule, a graph, or a
template.

**So alias belongs to the definition, and it is catalog-unique.** My §2a
proposal — declared on the definition, *bound at instantiation* so collisions
fail at install time — is wrong under this reading. A builder writing `@calc`
into a rule is referencing the **artifact**, at authoring time, before any
instance exists. Uniqueness therefore has to hold in the catalog, exactly as
`key` already does (`.unique()` on the column). Simpler than the binding
scheme, and it fails at the moment a human can fix it.

**And `@mention` was reserved for precisely this.** It sits in the namespace
table resolving nothing, alongside `@component`, which has no `case` at all
(`docs/SYMBIA-SCRIPT-QUICKSTART.md` §2). Two placeholders, both for addressing
registry objects from script, both unwired.

#### The one real cost: grammar

Symbia Script is `@namespace.path`. So `@calc` parses as *namespace* `calc`,
which is not what it means. The grammatical form is:

```
@assistant.calc                     → the definition
@assistant.calc.routing.handles     → a field of it
@assistant.calc.config.digest       → what a receipt would cite
```

That last line is the argument for doing it properly: an assistant becomes
addressable in script the way `@catalog` is, so a rule can reference another
assistant's declared capability rather than a copy of it. **That is the fifth
roster-copy defect solved by grammar rather than by discipline.**

Which leaves the chat form: bare `@calc` in a conversation, `{{@assistant.calc}}`
in script. **That is fine**, per the correction above — different contexts, no
ambiguity, and the shorter form is what a person types while the longer one is
what a builder writes with autocomplete. Not a defect; a register difference.

#### And the short key is still derived

`assistants/math/calculator` and `assistants/finance/calculator` both reduce to
`calculator`. Nesting is explicitly permitted by the ruling; the collision is
not checked anywhere. Either the short key gets stored, or the loader refuses
to register a second assistant reducing to a name it already holds.

### What moved and why

- **`routing` and `behaviour` out of `metadata`.** They are contracts, read at
  load time by things that are not this assistant. `metadata` keeps whatever is
  genuinely private.
- **`identity` grouped and named.** `isBootstrap` becomes `authMode`, which is
  what it actually controls (`webhooks.ts:1059`).
- **`curriculum*` deleted** from the object. Nothing reads it; it belongs to a
  view, and its presence makes a working team present itself as a tutorial.
- **`capabilities` → `config.capability.tools`, and enforced.** A rule invoking
  `tool.invoke: math.evaluate` on an assistant that does not declare it should
  fail at load, not at runtime. Declarative permissions nothing checks are worse
  than none.
- **`description` is prose again.** `routing.handles` covers the refusal line,
  `routing.examples` covers the embedding text.

---

## 3. Ephemeral configuration, and why `digest` is the whole answer

The assistant stays. Its configuration comes and goes.

**Content-address it.** `config.digest` is sha256 over the canonical JSON of
`config` minus the digest itself — the same construction as
`models/`' weight digests and the same reasoning: *a name is not an identity.*
`assistants/calculator` is a ref; `sha256:…` is the commit.

Then:

1. **The reply envelope cites the digest.** One field —
   `assistantConfig: "sha256:…"` — inside the hashed body, beside `assistant`
   and `delegation`. A receipt then answers *"which version of this assistant
   produced this?"* forever, whether or not that configuration still exists.

   **The digest, not the instance id.** Under §2's split the instance is
   ephemeral by construction, so citing `instance:9c1e…` would name something
   guaranteed to be gone. The digest names *what ran*; the instance id is
   useful for correlating a conversation and belongs in the envelope only as
   `runId` already is.
2. **Ephemeral configuration becomes safe.** A composed config need not
   persist, because every reply it produced already commits to its digest. If
   you also retain the config body, the receipt is fully re-derivable; if you
   do not, the receipt still proves *which* configuration ran and that it has
   not been swapped.
3. **`composedBy` makes the lane honest.** A configuration written by a model
   is not recomputable, and a reply produced under it must say so — exactly as
   `delegation.method` distinguishes `declaration` from `model`. An assistant
   running composed routing is not in the canonical lane no matter how
   deterministic its rules are, because *which* rules ran was a model's choice.
4. **Promotion is a status change, not a migration.** An ephemeral
   configuration that turns out to be good gets `source: declared` and a
   version. That is `builder`'s job and it is currently switched off.

### The invariant worth stating

> **A receipt must always be able to name the exact configuration that produced
> the answer, even when that configuration no longer exists.**

Everything else in this section is machinery for that one sentence.

---

## 4. `routing.claims` — the field I most want to argue about

An assistant declares the arena it expects to produce:

```jsonc
"claims": ["COMPUTED"]        // Calculator
"claims": ["COMPOSED"]        // Smart Calculator
"claims": ["RETRIEVED", "COMPOSED"]   // a future retrieval assistant
```

Because every reply now carries a sealed arena, **the platform can check the
claim against reality** — continuously, from its own logs, with no test suite:

- Calculator declaring `COMPUTED` and emitting `COMPOSED` is a defect the
  platform finds by itself.
- An assistant whose declared claim never matches is mis-declared, and that is
  a measurement rather than an opinion.
- `tags: ["deterministic"]` today asserts exactly this and nothing verifies it.

I do not know of another system that can do this, and it costs one array.

---

## 5. Migration, if we agree

Additive first, destructive last, so nothing breaks in between.

1. Write `config.*` alongside `metadata.*`; readers prefer `config`, fall back.
2. Compute and store `config.digest`; add `assistantConfig` to the reply
   envelope. **Do this before anything composes a configuration** — the
   presentation receipt was built before ornamentation for the same reason, and
   the delegation record was a defect all day for the opposite order.
3. Enforce `capability.tools` at load.
4. Add `routing.claims`, and report claim-vs-actual in the walk.
5. Delete `curriculum*`, drop the redundant tags, fix `currentVersion`.
6. Remove `metadata.routing` / `metadata.ruleSet`.
7. **Add `by-key` routes, move every script off `ast-*`, then let ids be
   UUIDs** (§2.1). In that order — the routes must exist before the ids
   change, or the scripts break on the day the seed stops supplying them.

---

## 6. Open questions

1. **Does `behaviour` belong in the same digest as `routing`?** Changing a
   rule and changing who gets routed to are different events; one digest means
   a routing tweak invalidates every receipt citing the behaviour. Two digests
   is more honest and more machinery.
2. **Does `status` gate composed configurations?** A composed config is not
   "published" in any authored sense.
3. **Who signs a composed configuration?** The composing principal, presumably —
   `@symbia/lineage` already has attested vs self-attested for this.
4. **Is `mixed` a real state or a smell?** Authored behaviour with composed
   routing is plausible; the reverse is stranger.
5. ~~**`orgId`**~~ — **answered by §2.** It belongs to the instance and was
   never a property of the artifact. Every assistant carrying `orgId: null`
   today was the model being right by accident.
6. ~~**`@calc` — chat mention or Symbia Script ref?**~~ — **closed.** Ruled (i)
   in §2.2, and the ambiguity I worried about does not exist: refs resolve only
   inside `{{ }}`. The case for `@assistant` is capability, not
   disambiguation — chiefly that typeahead cannot offer what is not a
   namespace.
7. **Does the short key get stored, or does the loader refuse collisions?**
   (§2.2) Nesting is permitted and the reduction is unguarded.
