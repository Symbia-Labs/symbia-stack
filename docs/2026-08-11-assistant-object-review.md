# The assistant object — a working document

*Started 11 August 2026, from the live catalog and the running console.
**Collaborative: add to it, argue with it, mark decisions.** Sections marked
**OPEN** are questions, not conclusions.*

---

## 1. What an assistant actually is

A catalog resource of `type: "assistant"`. Read from `ast-calculator`:

```
id            ast-calculator
key           assistants/calculator          ← type-prefixed path, plural
name          Calculator
description   …
type          assistant
status        published                       ← the loader's gate
isBootstrap   true
tags          [assistant, bootstrap, tutorial, level-2, deterministic, math]
orgId         null                            ← OPEN: every assistant is org-less
accessPolicy  { visibility: public, actions: { read, write } }
metadata
  alias             calc                      ← what a person types: @calc
  routing                                     ← ADDED TODAY
    handles         one line for the refusal message
    patterns        [3]   tier 1, exact
    examples        [12]  tier 2, classifier training
    precedence      100
  ruleSet                                     ← the behaviour
    id, name, description, version, isActive
    rules[3]        { id, name, priority, enabled, trigger, conditions, actions }
  assistantConfig
    principalId     assistant:calculator      ← identity, agent principal
    principalType   assistant
    capabilities    [messaging, tools.math]
  llmConfig         null                      ← null = deterministic
  curriculumLevel   2                         ← OPEN: tutorial framing in the object
  curriculumTitle   "Deterministic Logic"
  curriculumDescription …
currentVersion 1
createdAt / updatedAt
```

Five distinct concerns are packed into `metadata`, and they have different
owners and lifetimes:

| concern | fields | who owns it |
|---|---|---|
| **identity** | `alias`, `assistantConfig.principalId` | identity service |
| **reachability** | `routing.*` | the router, read at load |
| **behaviour** | `ruleSet.*` | the rules engine |
| **capability** | `capabilities`, `llmConfig` | integrations / models |
| **pedagogy** | `curriculum*` | the console's tutorial view |

**OPEN:** should these be siblings under `metadata`, or should `routing` and
`ruleSet` be first-class columns like `status`? `routing` is a *public
contract* — it is how other assistants and the router find this one — which
argues for promoting it. The component manifest precedent says public contracts
do not live in a free-form bag.

---

## 2. What the console shows, and where it disagrees

Observed in `localhost:8000/assistants` → Calculator.

### Assistants list
Three cards: name, `@alias`, description, two score bars, `N rules`,
`N capabilities`. Grouped under **"Tutorial Curriculum — Learn Symbia with
these progressive examples"**.

**OPEN — the framing.** The default pool presents itself as a *tutorial*, not
as a working team. `curriculumLevel` is in the object itself. That was right
when there were ten teaching examples; with three assistants that do real work
it now reads as a demo rather than a product. Discussion point, not a defect.

### Detail view — four tabs
`Details` · `Behavior` · `Access` · `Versions`.

**Behavior** is the strongest thing in the console. A flow graph
(Input → Router → routines → Output), routines as named tabs
(*Help Command*, *Evaluate Expression*, *Invalid Input*, *+ New Routine*), each
with a plain-English trigger — *"When content matches ^/help$"* — and steps. It
teaches a vocabulary:

> **Say** to respond · **Ask** to request information · **Think** to reason
> privately · **Check** to make decisions · **Recall** to fetch data ·
> **Remember** to store results · **Run** to call sub-routines · **Wait** for
> timing

That vocabulary is better than the action-type names underneath
(`message.send`, `llm.invoke`, `tool.invoke`, `condition`, `service.call`,
`context.update`). **OPEN:** should the engine adopt these names, or is the
translation layer correct? A translation that only exists in one UI is a fifth
copy waiting to drift.

### Behaviour scores
`Determinism 100` — *"No LLM configured – deterministic behavior"*.
`Confidence 80` — *"3 rules defined (+30)"*.

This is the arena idea, already in the product, as a per-assistant score. But
it is computed from **presence of config**, not from behaviour:

- Symbia routes deterministically now and would still score low, because it has
  an `llmConfig`.
- Smart Calculator scores 70 confidence with 2 rules, though its arithmetic is
  exact.
- Nothing here reflects that a *reply* carries an arena and a signed receipt.

**OPEN, and I think important:** these scores should be measured, not declared.
`arena` distribution over recent replies is a real determinism score. The
platform now produces exactly that data and the UI predates it.

---

## 3. Defects found while looking

Ranked. All observed, none inferred.

### 3.1 The assistant editor does not save. Anything.

`AssistantsPanel.handleSave` calls `updateResourceInList(...)` and
`console.log('Updated resource:', …)`. **There is no API call in it.** Details,
tags, the entire Behavior routine builder, Access — all of it edits React state
and is lost on reload. `Create` is the same: `addResource` is local only.

This is the largest gap between what the console appears to offer and what it
does. Everything about the authoring experience looks finished.

### 3.2 The metadata shown is a lossy projection

`AssistantsPanel` builds a synthetic resource whose metadata is hand-assembled:

```ts
metadata: { alias, principalId, capabilities, hasHandler, hasRules, rulesCount, routines, llm }
```

The stored metadata has `routing`, `ruleSet`, `assistantConfig`,
`curriculum*` — **none of which appear**. So the "Metadata — custom key-value
pairs, must be valid JSON" editor is showing something that is not the
resource's metadata, while inviting you to edit it as if it were.

If §3.1 were fixed naively — point `handleSave` at `PATCH /api/resources/:id` —
**it would write this projection over the real metadata and destroy every
assistant's routing declarations and its entire ruleset.** The editor is
currently safe only because it does not save.

*Fix them in the other order: make the panel load the real resource first.*

### 3.3 A published assistant displays as "Draft"

```ts
status: (a.status === 'bootstrap' ? 'published' : 'draft')
```

The API returns `published`, which is not `bootstrap`, so everything renders
`Draft`. Visible in the header next to the name.

### 3.4 The id is wrong

`id: a.key` gives `calculator`; the catalog id is `ast-calculator`. Any write
addressed by that id would 404 — a second reason §3.2 has not yet caused harm.

### 3.5 Emoji escapes render literally

`⚙️ Determinism`, `✅ Confidence`. Cosmetic.

### 3.6 `routing` has no UI at all

The thing that decides which assistant answers — patterns, examples,
precedence, `handles` — is editable only as raw JSON, and not even that, since
the JSON shown does not contain it.

---

## 4. OPEN — the pool itself

The questions I would want answered before changing the default catalog. **Your
ideas go here.**

1. **Is the default pool a tutorial or a working team?** Currently both, and the
   object carries `curriculumLevel` to prove it. Three assistants that do real
   arithmetic are no longer a curriculum.
2. **What is the smallest pool that shows the thesis?** Today's three
   demonstrate COMPUTED vs COMPOSED vs REFUSED. Nothing demonstrates
   RETRIEVED against an external source, and nothing demonstrates a code agent
   — `code.tool.invoke` exists and has no assistant.
3. **What did unpublishing seven cost?** `converter`, `code-runner`, `builder`
   and `analyst` are working rulesets sitting in `draft`. `builder` in
   particular — *creates new assistants from natural language* — is the
   meta-assistant, and it is off.
4. **Should an assistant declare its own arena expectation?** A declared
   "I only ever produce COMPUTED" is checkable against the replies it actually
   produces — a per-assistant honesty test the platform could run itself.
5. **Where does `orgId: null` bite?** Every assistant is org-less while every
   credential is org-scoped. That worked today only because the router runs as
   the coordinator.

---

## 5. Ranked next actions

1. Load the real catalog resource in `AssistantsPanel` (§3.2) — **before**
   wiring Save, so wiring Save cannot destroy anything.
2. Wire Save to `PATCH /api/resources/:id` with the correct id (§3.1, §3.4).
3. Fix the status mapping (§3.3).
4. Give `routing` a first-class editor (§3.6). It is the most consequential
   field with the least surface.
5. Recompute the behaviour scores from observed arenas rather than from config
   presence (§2).
