# Symbia Script — Quickstart

*Describes `symbia-sys/src/script.ts` at `aaf88db` (6 Aug 2026). Every example
below was executed against `symbia-sys/dist/script.js` and shows the value that
actually came back, not the value the source comments promise. Where the two
disagree, both are recorded.*

---

## 1. What it is

Symbia Script is a **reference syntax**, not a programming language. It has no
control flow, no operators, no functions. It does one thing: name a piece of
data by where it lives, so that a stored artifact (a rule, an action config, a
graph node, a prompt template) can point at runtime data without hardcoding it.

```
@namespace.path
```

That is the entire grammar. `@user.displayName` means "the display name of the
user in this execution context." The string is inert until something resolves
it against a context.

### Why this exists

The platform's claim is provable provenance: every answer shows where it came
from. A template that reads `"Hello " + ctx.user.name` buries the source in
JavaScript, where it cannot be inspected, validated, or logged as a dependency.
A template that reads `"Hello {{@user.displayName}}"` is a **declaration of
what it depends on**. You can parse it without running it, validate it without
a context, and list every input a rule touches before it fires.

That is the theory. The parse-without-running part is fully built. The
resolve-everything part is not — see §6.

### Where it lives

Single implementation, `symbia-sys/src/script.ts` (811 lines), exported from
`@symbia/sys`. This is the one part of the stack that resisted the fork-the-
shared-concern failure — assistants, runtime, and the control center all import
the same module rather than each carrying a copy.

| Consumer | Uses |
|---|---|
| `assistants/server/src/engine/template.ts` | Adapter: `ExecutionContext` → `ResolutionContext`; all action handlers go through it |
| `assistants/.../actions/{message,llm-invoke,service-call,integration-invoke,notify,webhook-call}.ts` | `interpolate` / `interpolateObject` on templates, paths, bodies |
| `assistants/server/src/routes/webhooks.ts` | Interpolates inbound message content before rule matching; injects cached catalog resources |
| `symbia-control-center/src/components/inputs/SymbiaScriptInput.tsx` | `getRefSuggestions`, `parseRef` for autocomplete + namespace colour coding |
| `runtime/server/src/types/graph.ts` | Graph types described as mirroring the Symbia Script spec |

---

## 2. Grammar

```
@namespace.segment[.segment]...[?query]
```

Four token kinds, all handled by `splitPath()`:

| Token | Example | Parses to |
|---|---|---|
| Dot segment | `@user.displayName` | `segments: ["displayName"]` |
| URL path — everything from the first `/` | `@service.logging./logs/query` | `segments: ["logging", "/logs/query"]` |
| Bracket accessor — for keys containing `/` or `.` | `@catalog.component[http/Request].name` | `segments: ["component", "[http/Request]", "name"]`, `brackets: ["http/Request"]` |
| Query string | `@service.logging./logs?limit=10&level=error` | `path: "logging./logs"`, `query: {limit:"10", level:"error"}` |

Brackets exist because catalog keys are namespaced (`http/Request`) and a bare
dot-split would shred them.

### Interpolation

Inside any string, `{{ ... }}` marks a substitution:

```
"Hello {{@user.displayName}}"
```

Two forms are accepted inside the braces:

- **`@ref`** — resolved through `resolveRef`.
- **Bare path** — `{{message.content}}`, resolved by walking the raw context
  object. This is the pre-`@` legacy syntax and it still works.

Measured, with a context carrying `message.content = "hello"` and
`context.steps.s1.result = "ok"`:

```js
interpolate('{{message.content}} | {{@message.content}} | {{context.steps.s1.result}}', ctx)
// → "hello | hello | ok"
```

Note the asymmetry: the legacy form reaches `context.steps.*` because it walks
the whole context object; there is no `@steps` namespace. `template.ts` in the
assistants engine relies on this — it attaches `steps` to the resolution
context specifically so `{{steps.step-id.result}}` resolves, and that path only
works through the legacy branch.

---

## 3. Namespaces

Thirteen constants in `SymbiaNamespace`. Their real status differs:

| Namespace | Resolves sync | In `getNamespaces()` (autocomplete) | Notes |
|---|---|---|---|
| `@context` | yes | yes | Generic execution-context store |
| `@message` | yes | yes | `id`, `content`, `role`, `metadata` |
| `@user` | yes | yes | `id`, `email`, `displayName`, `metadata` |
| `@org` | yes | yes | Bare `@org` or `@org.id` both return `ctx.orgId ?? ctx.org.id` |
| `@var` | yes | yes | Script variables, nests freely |
| `@env` | yes | yes | First segment only; reads `process.env` |
| `@catalog` | yes | yes | Needs `ctx.catalog.resources` injected |
| `@service` | **no** | yes | Returns `{success:false, async:true}` |
| `@integration` | **no** | yes | Returns `{success:false, async:true}` |
| `@entity` | **no** | **no** | Returns `{success:false, async:true}` |
| `@mention` | **no** | **no** | Same |
| `@component` | **no** | **no** | No `case` in `resolveRef`; falls to default |

The "no" rows are §6.

---

## 4. Working examples

All output below is measured against this context:

```js
const ctx = {
  orgId: 'org_123',
  user:    { id:'u1', email:'b@x.com', displayName:'Brian' },
  message: { id:'m1', content:'hello', role:'user' },
  vars:    { limit:50, config:{ key:'abc' } },
  context: { steps:{ s1:{ result:'ok' } }, custom:'yes' },
  catalog: { resources: [
    { type:'component', key:'http/Request', name:'HTTP Request', version:'1.0.0' },
    { type:'graph',     key:'onboarding',   nodes:[1,2,3] },
  ]},
};
```

### Scalars

```js
resolveRef('@org.id',        ctx)  // { success:true, value:'org_123' }
resolveRef('@var.config.key',ctx)  // { success:true, value:'abc'     }
resolveRef('@context.custom',ctx)  // { success:true, value:'yes'     }
```

### Catalog

```js
resolveRef('@catalog.component', ctx)
// { success:true, value:[ {type:'component', key:'http/Request', ...} ] }   ← filtered by type

resolveRef('@catalog.component[http/Request]', ctx)
// { success:true, value:{ type:'component', key:'http/Request', name:'HTTP Request', version:'1.0.0' } }

resolveRef('@catalog.component[http/Request].version', ctx)
// { success:true, value:'1.0.0' }

resolveRef('@catalog.graph[onboarding].nodes', ctx)
// { success:true, value:[1,2,3] }

resolveRef('@catalog.component[nope]', ctx)
// { success:false, error:'Resource not found: component[nope]' }
```

`@catalog` is the one namespace that reports a miss. Everything else returns
`{success:true, value:undefined}` for a bad path — see §6.

### Object interpolation

`interpolateObject` walks strings, arrays, and nested objects; non-strings pass
through untouched.

```js
interpolateObject({ path:'/logs/{{@org.id}}', body:{ q:'user:{{@user.email}}', n:5 } }, ctx)
// → { path:'/logs/org_123', body:{ q:'user:b@x.com', n:5 } }
```

This is exactly how `service.call` builds a request: `interpolate(params.path)`
plus `interpolateObject(params.body)`.

### Validation without execution

```js
validateRef('@bogus.foo')
// { valid:true, warnings:['Unknown namespace: bogus'], errors:[] }     ← warning, not error

validateRef('@service')
// errors: ['service references require a path']

validateTemplate('{{@user.email}} {{@service}} {{@bogus.x}}')
// { valid:false, errors:['service references require a path'], refs:[ …3 validations… ] }
```

Unknown namespaces are a **warning**, not an error — deliberately, so a service
can add a namespace without every stored template turning invalid.

### Autocomplete

```js
getRefSuggestions('@')       // → 9 namespaces, each as '@name.'
getRefSuggestions('@us')     // → [{ value:'@user.', description:'Current user' }]
getRefSuggestions('@user.')  // → id / email / displayName / metadata
getRefSuggestions('@catalog.component', ctx)  // → up to 20 real keys from ctx.catalog.resources
```

The last form is the interesting one: with a live context, autocomplete offers
**actual catalog keys**, not example strings.

---

## 5. Practical use

### In an assistant action

```json
{
  "type": "service.call",
  "params": {
    "service": "logging",
    "method": "POST",
    "path": "/logs/query",
    "body": {
      "orgId": "{{@org.id}}",
      "query": "{{@message.content}}",
      "limit": "{{@var.limit}}"
    }
  }
}
```

### In an LLM prompt

```json
{
  "type": "llm.invoke",
  "params": {
    "systemPrompt": "You are assisting {{@user.displayName}} at {{@org.name}}.",
    "promptTemplate": "The user asked: {{@message.content}}\n\nPrior step returned: {{steps.fetch-logs.result}}"
  }
}
```

Note the mixed syntax — `@ref` for context, legacy bare path for step results,
because there is no `@steps`.

### Adding a namespace

1. Add the constant to `SymbiaNamespace`.
2. Add a `case` to `resolveRef` returning `ResolvedValue`.
3. Add an entry to `getNamespaces()` — **without this the namespace is invisible
   to autocomplete**, which is how `component`, `entity`, and `mention` came to
   be unreachable from the UI.
4. Add a colour to `getNamespaceColor` / `getNamespaceBadgeColor` in
   `SymbiaScriptInput.tsx`, or it renders slate-grey.

Step 3 is the one that gets skipped. Three of thirteen namespaces skipped it.

---

## 6. What is documented but not implemented

Recorded as observations. Each was produced by running the shipped code.

**a. `@service` and `@integration` never resolve.** `resolveRef` returns
`{success:false, error:'service references require async resolution',
async:true}`. Grepping the repo (excluding `node_modules` and `dist`) finds no
caller that checks `async:true` and no async resolver. Service calls in the
assistants engine happen through the `service.call` **action handler**, which
constructs its own URL from `resolveServiceUrl(ServiceId.X)` and uses Symbia
Script only to interpolate the path and body. So `@service.logging./logs/query`
parses, validates, autocompletes, colour-codes orange in the UI — and resolves
to nothing.

**b. `@entity` and `@mention` have no resolver and no autocomplete entry.** The
file header documents four forms:

```
@entity.log-analyst           → entity UUID
@entity.ent_abc123            → direct lookup
@entity.log-analyst#instance2 → specific instance
@log-analyst                  → shorthand for @entity.log-analyst
```

Measured:

```js
parseRef('@entity.log-analyst#instance2')
// segments: ['log-analyst#instance2']    ← '#' is not a delimiter; instance is not extracted

parseRef('@log-analyst')
// { valid:false, error:'Invalid reference format. Expected @namespace.path' }
```

`REF_PATTERN` requires a dot, so the shorthand cannot parse. The `#instance`
syntax has no handling anywhere in `splitPath`.

**c. `@component` has no `case` in `resolveRef`.**

```js
resolveRef('@component.foo', {})   // { success:false, error:'Unknown namespace: component' }
validateRef('@component.foo')      // { valid:true, warnings:[], errors:[] }
```

It is a member of `SymbiaNamespace`, so `validateRef` sees a known namespace and
raises no warning — while `resolveRef` calls it unknown. The two functions
disagree about the same string.

**d. Unresolved references interpolate to the empty string.**

```js
interpolate('Hi {{@user.displayName}} / {{@service.logging./logs}} / {{@var.nope}}', { user:{displayName:'Brian'} })
// → "Hi Brian /  / "
```

Three cases collapse to one output: resolved-to-nothing,
namespace-not-implemented, and typo. The template silently produces a
plausible-looking string. This is the shape of the failure the project's
"blank beats green" rule names — *not checked* rendered as though checked —
and it is worth deciding whether the correct behaviour is an empty string, a
preserved literal `{{@ref}}`, or a raised error. Recorded, not repaired.

**e. `SymbiaScriptInput.tsx` has no importer.** Grep across
`symbia-control-center/src` finds no reference to it outside
`components/inputs/`. The autocomplete exists and is not on screen. Whether
it was ever wired in is not established here.

**f. `ResolutionContext` does not declare `steps`.** `template.ts` sets it
anyway. It works only because the legacy bare-path branch of `interpolate`
walks the raw object. Any future move to `@steps.*` will find no resolver.

---

## 7. API surface

```ts
import {
  SymbiaNamespace,     // const enum of namespace names
  parseRef,            // (string) => SymbiaRef
  extractRefs,         // (string) => SymbiaRef[]   — both {{@ref}} and bare @ref
  containsRefs,        // (string) => boolean
  resolveRef,          // (SymbiaRef|string, ResolutionContext) => ResolvedValue
  getNestedValue,      // (unknown, string|string[]) => unknown
  interpolate,         // (template, ctx) => string
  interpolateObject,   // (obj, ctx) => obj
  getNamespaces,       // () => NamespaceInfo[]
  getRefSuggestions,   // (partial, ctx?) => {value, description}[]
  validateRef,         // (string) => RefValidation
  validateTemplate,    // (string) => {valid, refs, errors}
} from '@symbia/sys';
```

`ResolvedValue` is `{ success, value?, error?, async? }`. Check `success` —
`value === undefined` is ambiguous between "resolved to undefined" and "path
missed."

---

## 8. Reading order for the source

1. `REF_PATTERN` and `parseRef` — the grammar, ~60 lines.
2. `splitPath` — why brackets and URL paths survive dot-splitting.
3. `resolveRef` — the switch. Note which cases exist and which fall through.
4. `interpolate` — the `@ref` branch and the legacy branch.
5. `getNamespaces` — the autocomplete registry, and what it omits.
6. `assistants/server/src/engine/template.ts` — the only adapter, and the
   template for writing another one.
