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

## 2. The proposed shape

```jsonc
{
  // Opaque. Never derived from the name, never typed by a person, never
  // parsed. See §2.1 — the schema already defaults to this and the seed
  // overrides it.
  "id": "8f3c1a94-6e2b-4d17-9c05-0b7a2f1de4a3",
  "key": "assistants/calculator",       // the addressable, stable NAME
  "name": "Calculator",
  "description": "…prose only…",
  "type": "assistant",
  "status": "published",              // the roster gate
  "orgId": "…",
  "tags": ["math"],                   // domain only
  "accessPolicy": { … },

  // ─── identity: stable, rarely changes, never composed ───────────────
  "identity": {
    "principalId":   "assistant:calculator",
    "principalType": "assistant",
    "alias":         "calc",
    "authMode":      "shared" | "own"     // replaces isBootstrap
  },

  // ─── configuration: the part that can be ephemeral ──────────────────
  "config": {
    "digest": "sha256:…",               // content address of everything below
    "source": "declared" | "composed" | "mixed",
    "composedBy": {                     // present only when not fully declared
      "by":    "model:sha256:…" | "assistant:builder",
      "at":    "2026-08-11T…Z",
      "from":  "…the request it was composed from…",
      "parts": ["routing", "behaviour"] // which parts are not authored
    },

    "routing": {
      "handles":          "arithmetic written as an expression",
      "patterns":         [ … ],        // tier 1
      "examples":         [ … ],        // tier 2, classifier training
      "negativeExamples": [ … ],
      "precedence":       100,
      "claims":           ["COMPUTED"]  // NEW — see §4
    },

    "behaviour": {                      // was metadata.ruleSet
      "rules": [ … ]
    },

    "capability": {
      "tools": ["math.evaluate"],       // ENFORCED, not decorative
      "llm":   null                     // null = no model available to it
    }
  },

  "currentVersion": 7
}
```

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

#### The collision I introduced today

Tier-0 mention routing — added this afternoon so `ask @smartcalc to…` reaches
Smart Calculator — makes `@smartcalc` look exactly like a Symbia Script
reference. It is not one. It is a regex scan in `assistants.route` over
`key` and `alias`, resolved by an entirely different mechanism, in a system
that already reserves `@` for a grammar with twelve namespaces.

That is a naming collision in a codebase whose recurring defect is one fact in
two places, and I made it without noticing.

**Options, and I do not think this should be decided in passing:**

- **(i) Make it real Symbia Script.** Add an `@assistant` namespace resolving
  against the registry, so `@calc` is a ref like `@user.displayName` is. One
  grammar, autocomplete and colour-coding for free (`SymbiaScriptInput.tsx`
  already does both), and `@mention` finally means something.
- **(ii) Keep them separate and rename one.** Mentions are a *chat* convention
  with decades of precedent; refs are a *template* convention. Same character,
  different worlds — but then the docs must say so, loudly.
- **(iii) Do nothing and accept the ambiguity.** Cheapest today, and it is
  exactly how `energy.graph.pue` happened.

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
5. **`orgId`** — still unanswered from the spec doc, and it now matters more,
   because a composed configuration is composed *for someone*.
6. **`@calc` — chat mention or Symbia Script ref?** (§2.2) One character,
   two grammars, and I put the second one there today without noticing the
   first. This wants deciding before more of the product leans on `@`.
7. **Does the short key get stored, or does the loader refuse collisions?**
   (§2.2) Nesting is permitted and the reduction is unguarded.
