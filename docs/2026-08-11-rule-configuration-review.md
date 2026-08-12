# Rules and routines — how the configuration actually behaves

*11 August 2026. Working document. Measured against the three published
assistants and the executor that runs them, not against the schema.*

---

## 1. What is actually deployed

Across all three assistants, 11 rules:

```
triggers    { message.received: 11 }        ← one of eight defined types
actions     { message.send: 10, tool.invoke: 8, service.call: 3,
              llm.invoke: 2, assistant.route: 1 }
operators   { matches: 23, exists: 4, length_gte: 1, not_matches: 1 }
```

**23 of 29 conditions are regexes.** The rule layer is a regex engine with a
priority sort, and the classifier tier added today lives *below* it, inside a
tool.

| assistant | rules, by priority |
|---|---|
| coordinator | 200 help · 195 conversation · 190 explain · 180 team · 150 platform-status · **100 orchestrate** |
| smart-calc | 200 help · 100 compute |
| calculator | 200 help · 100 evaluate · **50 invalid** |

Two shapes are already visible and neither is written down:

- **A catch-all at the bottom.** `coord-orchestrate` (`content exists true`) and
  `calc-invalid` (`content not_matches [0-9]`) exist to catch everything the
  rules above missed. That is a *default case*, and it is expressed as an
  accident of priority.
- **Help at 200, always.** Every assistant reserves the top slot for the same
  thing.

---

## 2. The four executor behaviours that decide everything

None of these are declared in a rule; all are properties of `RuleExecutor`.

### 2.1 First match wins, and execution stops

```ts
if (ruleResult.matched) { …; break; }   // rule-executor.ts
```

Rules are sorted by descending priority; the first whose conditions match runs,
and **no lower rule is ever consulted**. So priority is not a hint, it is the
control flow, and a rule's meaning depends on every rule above it.

This is why `coord-conversation` had to be 195: at 95 it would never be reached,
because orchestrate at 100 matches everything.

**Consequence nobody has had to face yet:** two rules matching the same message
is not an error, not logged as ambiguity, and silently resolved by a number.

### 2.2 First failed action stops the rule, and becomes the reply

```ts
if (!result.success) break;
```

The rule aborts and the error string is rendered to the user. Today that
produced three warning triangles in one browser session, all of them routing
errors surfacing as parser crashes.

### 2.3 `onError` is declared and read by nothing 🚫

```
grep onError catalog/data/assistants-bootstrap.json   → 5
grep onError assistants/server/src --include=*.ts     → 0
```

Five rules declare error handlers. **Nothing reads them.** For example
`calc-evaluate` declares:

```jsonc
"onError": { "action": "message.send",
             "params": { "content": "I couldn't parse that expression. Try something like `2 + 2`." } }
```

That message has never once been sent. The user got `Unexpected token:` until it
was fixed *at the tool* this afternoon — a symptom fixed in the wrong layer,
because the right layer looked like it already worked.

**This is the sharpest defect in the rule system**: a declarative feature that
appears to work, changes nothing, and hides the need for the mechanism it
represents.

### 2.4 Steps are addressed by an undeclared id

`{{steps.step-evaluate.result}}` resolves because `tool.invoke` wrote
`context.context.steps['step-evaluate']` using the action's `id`. The `id` is
optional in the type, load-bearing in practice, and connected to the template
only by convention.

Rename an action id and its template silently renders empty — the failure mode
that produced a prompt full of labels and blank values on 8 Aug.

---

## 3. The vocabulary problem

The console presents rules as **routines** with a plain-English step
vocabulary:

> **Say** to respond · **Ask** to request information · **Think** to reason
> privately · **Check** to make decisions · **Recall** to fetch data ·
> **Remember** to store results · **Run** to call sub-routines · **Wait**

The engine has action types:

`message.send` · `llm.invoke` · `tool.invoke` · `condition` · `service.call` ·
`context.update` · `assistant.route` · `wait` · `parallel` · `loop` ·
`handoff.*` · `embedding.route` · `code.tool.invoke` · `integration.invoke`

The console's names are **better** — they describe intent, not mechanism. But:

1. The mapping exists only in the console. It is a translation layer in one
   consumer, which is the shape of defect this codebase has now killed six
   times.
2. It is **lossy**. `Say` covers `message.send`; what is `tool.invoke` — `Run`?
   `Recall`? The screenshot showed `tool.invoke` rendered as **`Say`
   "Execute: tool…"**, which is wrong and reads as a bug.
3. `Think` for `llm.invoke` is the most valuable name in the set, because it
   says *a model is involved here* in a word a non-engineer understands —
   exactly the distinction the arenas make downstream.

**Proposal for discussion:** the engine adopts the intent vocabulary as the
action type names, with the current names as aliases during migration. `Think`
being the type would make "which steps used a model" readable in the rule
itself, not just in the receipt.

---

## 4. What a rule cannot currently express

Working through today's defects, these are the things authors reached for and
did not find:

| wanted | what happened instead |
|---|---|
| **an error path** | `onError` declared, ignored (§2.3) |
| **a default case** | expressed as the lowest priority number |
| **fall through to the next rule** | impossible — first match ends it |
| **"not mine, re-route"** | a specialist can only fail at the user |
| **fuzzy conditions** | 23 regexes; the classifier lives in a tool, unreachable from `conditions` |
| **a correction to a previous turn** | no concept; the wrong answer gets sealed |
| **ordered alternatives within a rule** | `condition` action exists but returns children in `output.results`, invisible until `flattenActionResults` was added |

The first three are one missing idea: **rules have no control flow beyond
"first match, then a straight line."**

---

## 5. Questions for the discussion

1. **Should `conditions` be able to call a tool?** The classifier is a
   `tool.invoke` and rules cannot reach it, so every conversational pattern had
   to be hand-written as regex *and* duplicated into the tool. Generating one
   from the other was today's fix; it is a workaround for conditions being
   inert.
2. **Is "first match wins" right?** It makes priority the program. The
   alternative — every matching rule runs, ordered — needs a story for
   conflicting replies, which turn-taking already has and does not use.
3. **`onError`: implement or delete.** It is currently a lie in five places.
4. **Does a rule declare its arena?** `calc-evaluate` produces `COMPUTED` every
   time. If the rule said so, the platform could verify it per-rule rather than
   per-assistant.
5. **Do routines become the unit?** The console already calls them routines and
   groups steps under a named trigger. A "rule" is an implementation word; a
   "routine" is what an author is making.
6. **Where does the step id live?** It is the join between an action and a
   template and it is optional. Either it is required, or templates address
   steps positionally, or actions return named outputs.
