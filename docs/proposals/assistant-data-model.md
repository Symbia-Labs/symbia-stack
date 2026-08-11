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
  "id": "ast-calculator",
  "key": "assistants/calculator",
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
