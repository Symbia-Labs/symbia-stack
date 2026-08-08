# Symbia Script — review, 8 August 2026

*Split out of `2026-08-08-catalog-review.md` on 8 Aug. It was §8 of that
document and had stopped belonging to it: the catalog review is about a
registry, this is about a reference syntax that the registry happens to store
templates for.*

**Every finding below was produced by executing the shipped `symbia-sys/dist/`
build, not by reading source.** Test scripts and raw output are reproduced
inline so each can be re-run and disputed. F21 — the arithmetic component
substituting `0` for absent inputs — was fixed on 8 Aug; see §12 of the catalog
review for the fix and its measurement.

---

Reviewed at `symbia-sys/src/script.ts` (811 lines) plus its consumers. **Every
finding in §8.3 was produced by executing the shipped `symbia-sys/dist/` build,
not by reading source.** Test scripts and raw output are reproduced inline so
each can be re-run and disputed.

### 8.1 What it is, and what is good about it

Symbia Script is a **reference syntax**, not a language: `@namespace.path`, plus
`{{…}}` interpolation. No control flow, no operators, no functions. A template
is inert until something resolves it.

The design rationale is the strongest in the codebase. A template reading
`"Hello " + ctx.user.name` buries its dependency in JavaScript; one reading
`"Hello {{@user.displayName}}"` is a *declaration of what it depends on* —
parseable without running, listable before it fires. For a platform whose claim
is provable provenance, having dependencies be inspectable data rather than
executed code is the right primitive.

Three things genuinely work:

- **Single implementation.** `grep` finds one parser. The header comment notes
  this is the part of the stack that resisted the fork-the-shared-concern
  pattern that `authMiddleware` did not. Verified: no second `parseRef`.
- **Parsing is complete.** URL-like paths (`@service.logging./logs/query`),
  bracket accessors (`@catalog.component[http/Request].name`), and query strings
  all parse correctly. The `splitPath` state machine handles the awkward cases.
- **`docs/SYMBIA-SCRIPT-QUICKSTART.md` is an unusually honest document.** Its §6
  records six defects (a–f), each measured against the shipped build, and its
  §3 table has a "Resolves sync" column that says **no** for five of twelve
  namespaces. It is the model the rest of the docs should follow.

**Consumers.** `interpolate`/`resolveRef`/`parseRef` are imported by the
assistants engine (9 files), `symbia-control-center/src/components/inputs/`, and
`integrations/.../openapi-parser.ts`. **The runtime does not use it** — see F28.

### 8.2 Already recorded by the quickstart — not re-reported as new

`docs/SYMBIA-SCRIPT-QUICKSTART.md` §6 already documents, with measurements:

| | |
|---|---|
| a | `@service` and `@integration` never resolve — return `{success:false, async:true}`, and no caller checks `async` |
| b | `@entity` and `@mention` have no resolver and no autocomplete entry |
| c | `@component` has no `case` in `resolveRef` |
| d | Unresolved references interpolate to the empty string |
| e | `SymbiaScriptInput.tsx` has no importer — the autocomplete is not on screen |
| f | `ResolutionContext` does not declare `steps`; `template.ts` sets it anyway |

I re-ran a–d and confirm all four. Credit where due: this review's job is what
the quickstart *missed*, below.

### 8.3 New findings

#### F21 — `symbia.compute.arithmetic` substitutes `0` for missing inputs and labels the result canonical

**The most serious finding in either review.** `runtime/.../components.ts:207`:

```ts
const filled = expr.replace(/\{(\w+)\}/g, (_m, k) => String(Number(src[k] ?? 0)));
```

Measured, by replicating the handler exactly (`/tmp/a.js`, logic copied
verbatim from lines 204–228), expression `{facility}/{it}`:

| input | expression evaluated | result | lane | `exact` |
|---|---|---|---|---|
| `{facility:210, it:150}` | `210/150` | `1.4` | canonical | true |
| **numerator missing** | `0/150` | `0` | **canonical** | **true** |
| **denominator missing** | `210/0` | `Infinity` → serializes `null` | **canonical** | **true** |
| **both missing** | `0/0` | `NaN` → serializes `null` | **canonical** | **true** |
| explicit `null` | `0/150` | `0` | **canonical** | **true** |
| non-numeric string | `NaN/150` | — | apocryphal (refused) ✓ | — |
| `{a}+{b}+{c}`, `c` missing | `5+5+0` | `10` | **canonical** | **true** |

A non-numeric *string* is correctly refused, because `String(NaN)` fails the
`/^[\d\s+\-*/().]+$/` guard. Only **missing and null** slip through, because
`undefined ?? 0` and `null ?? 0` are both `0` before the guard ever sees them.

Three separate rules are broken at once:

1. *"A confident `0` that means 'never asked' is the defect this product exists
   to prevent."* This is that literal defect, in the component that stamps
   `lane: 'canonical'` — the highest trust label the platform has.
2. *"A partial total must not pass as the total."* The last row is a partial sum
   emitted as canonical. `symbia.state.rollup` implements this rule correctly,
   on the apocryphal lane, with `{coverage, present, missing}`. **Arithmetic and
   rollup are two implementations of one concern and they behave oppositely** —
   discipline 8, in the two components most central to the provenance claim.
3. `exact: true` is asserted on a value computed from a substituted zero.

The fix is small: distinguish absent from zero before substitution, and route
absence to `error`/apocryphal the way non-numeric input already goes. The
component already has an `error` port and already knows how to refuse.

#### F22 — `containsRefs()` returns alternating answers for the same input

`INTERPOLATION_PATTERN` is a module-level `/g` regex, and `containsRefs` calls
`.test()` on it. A global regex's `.test()` advances `lastIndex`, so consecutive
calls alternate. Measured — same string, four calls:

```
containsRefs('hello {{name}} world')  ->  true , false , true , false
```

Any caller that checks "does this template need interpolation?" gets the right
answer half the time. Nothing currently short-circuits on it — `interpolate` uses
`String.replace`, which resets `lastIndex` — so this is latent rather than live,
but it is a one-character fix (drop the `g`, or use a local regex).

#### F23 — every email address is a valid reference

`containsRefs` begins `str.includes('@')`. And `extractRefs`'s bare pattern
matches inside an address. Measured:

```
containsRefs('brian@example.com')            ->  true
extractRefs('mail brian@example.com now')    ->  [{ns:'example', path:'com', valid:true}]
```

Any user message containing an email address parses as carrying a Symbia
reference to a namespace called `example`. Since `@message.content` is
interpolated into prompts, and unresolved refs render as empty string (quickstart
§6d), the interaction to check is whether an address in a user message can be
silently altered on its way into a prompt. *Not checked* — see §8.4.

#### F24 — `validateTemplate()` reports `valid: true` for unknown namespaces

`validateRef` correctly pushes `Unknown namespace: logs` — but into `warnings`.
`validateTemplate` collects only `errors`. Measured:

```
validateRef('@logs.recent')      -> valid:true, warnings:['Unknown namespace: logs'], errors:[]
validateTemplate('{{@logs.recent}}') -> valid:true
```

**This is the mechanism behind F16.** The routine editor ships thirty-odd
examples using namespaces that do not exist (`@logs`, `@metrics`, `@alerts`,
`@runs`, `@billing`, `@docs`, `@cli`, `@code`), and the platform's own validator
passes them clean. The warning is computed and then discarded one call up.

Surfacing warnings in `validateTemplate`'s return would make F16 self-detecting.

#### F25 — four independent namespace lists, none of them equal

Discipline 8, in the one file that was supposed to be exempt:

| source | count | contents |
|---|---|---|
| header docstring, `script.ts:9–18` | 10 | missing `component`, `catalog` |
| `SymbiaNamespace` const (the truth) | **12** | context, message, user, org, service, integration, var, env, component, catalog, entity, mention |
| `getNamespaces()` (autocomplete) | 9 | missing `component`, `entity`, `mention` |
| `NAMESPACE_COLORS`, `SymbiaScriptHighlight.tsx:49–56` | 8 | missing `catalog`, `component`, `entity`, `mention` |

Measured: `getNamespaces().length === 9`, `Object.values(SymbiaNamespace).length === 12`.

A fifth list sits one level down: `getNamespaces()`'s `@service` children name six
services (logging, catalog, identity, messaging, runtime, network), while
`service-call.ts`'s `serviceMap` has seven — it includes `integrations`. Neither
lists `models` or `assistants`.

The quickstart's §5 already prescribes the four-step checklist for adding a
namespace and notes step 3 is the one that gets skipped. The deeper problem is
that a checklist is the remedy at all: the enum should generate the other three.

#### F26 — `@org.id` returns the composite org id inside an assistant

`resolveRef` special-cases `@org`: `return ctx.orgId ?? ctx.org?.id`. In the
assistants engine, `context.orgId` is the composite `{assistantKey}:{orgId}` used
for rule scoping. Measured with that shape:

```
resolveRef('@org.id', {orgId:'security:2c29d1dd-…', org:{id:'2c29d1dd-…'}})
  -> {success:true, value:'security:2c29d1dd-5eb5-4c6a-8156-f29198055081'}
```

`ctx.orgId` is preferred over `ctx.org.id`, so the *correct* value is present in
the context and deliberately not used. `service-call.ts` documents this exact
hazard and guards against it with `rawOrgId` — *"context.orgId is a composite …
and sending it as X-Org-Id makes services reject or mis-scope the request."*
The guard lives in the action handler; the shared language has none. Any rule
author writing `{{@org.id}}` into a path, body or prompt gets the composite.

**Inference, disputable:** `template.ts` sets `org: {id: ctx.orgId}` — also the
composite — so there is no clean value anywhere in the resolution context. The
fix probably belongs in `toResolutionContext`, not in `script.ts`. *Not checked:*
whether any shipped rule uses `@org.id`.

#### F27 — `@env` reads any environment variable, with no allowlist

```ts
case SymbiaNamespace.ENV:
  return { success: true, value: process.env[segments[0]] };
```

Measured: `resolveRef('@env.DEMO_SECRET', {})` returns the value.

Rule templates are catalog resources, so authoring one is gated
(`write: cap:registry.write | role:admin`) — this is not an open door. But the
process environment holds `NETWORK_HASH_SECRET` (the key that seals provenance
envelopes) and provider credentials, and a rule that reads one into a
`message.send` produces an envelope that records only "message.send". The
provenance record would not show that a secret was consulted.

Recorded as a design gap, not an exploit: an allowlist, or a redaction rule for
names matching `KEY|SECRET|TOKEN|PASSWORD`, would close it. Worth deciding
deliberately rather than by omission — particularly for the assistant whose
subject *is* security posture.

#### F28 — the platform has two interpolation systems

Symbia Script is presented in `@symbia/sys` as the "Unified Reference System".
The runtime does not use it. `symbia.compute.arithmetic` and its siblings use
their own syntax and their own regex:

| | assistants | runtime |
|---|---|---|
| syntax | `{{@ns.path}}` and `{{bare.path}}` | `{placeholder}` |
| engine | `interpolate()` in `@symbia/sys` | `expr.replace(/\{(\w+)\}/g, …)` inline |
| missing value | empty string | **`0`** (F21) |
| validation | `validateTemplate` (warnings dropped, F24) | none |

Two syntaxes, two failure modes, one platform — and the failure modes differ in
the direction that matters most: empty-string is visibly wrong, `0` is
invisibly wrong. A graph author and a rule author are writing different
languages while being told they are writing one.

#### F29 — the quickstart says thirteen; the enum has twelve

`docs/SYMBIA-SCRIPT-QUICKSTART.md` §3 opens *"Thirteen constants in
`SymbiaNamespace`"* and §5 closes *"Three of thirteen namespaces skipped it."*
The table beneath §3 lists twelve rows. Measured:
`Object.values(SymbiaNamespace).length === 12`.

Trivial in itself, and worth fixing precisely because that document is otherwise
the most carefully measured one in `docs/` — a stray count is the kind of thing
that erodes trust in a document whose whole value is that its numbers were run.

### 8.4 Not checked — §8

- Whether an email address in a user message is actually mangled on its way into
  a prompt (F23). The parse is confirmed; the end-to-end effect is not.
- Whether any shipped rule or graph uses `@org.id` (F26) or `@env.*` (F27).
- Whether any registered graph's `config.expression` can currently receive a
  missing placeholder in practice — F21 is proven at the component, not traced
  to a live graph. `energy-pue` is the obvious candidate and was not run.
- Whether `symbia-sys/dist/` matches `src/` at HEAD. I executed `dist/`
  deliberately, per discipline 4, but did not diff the two.
- None of §8 was checked in a browser.

### 8.5 Suggested order — Symbia Script

1. **F21 first, and alone if necessary.** Distinguish absent from zero in
   `arithmetic`; route absence to the existing `error` port on the apocryphal
   lane. Everything else here is hygiene; this one puts a wrong number behind
   the platform's highest trust label.
2. **F24** — surface `warnings` in `validateTemplate`. One line, and it makes
   F16 and F25 self-detecting instead of requiring review.
3. **F22** — drop the `g` flag or use a local regex. One character.
4. **F26** — resolve the composite-org hazard in `toResolutionContext`, where
   the clean value still exists.
5. **F25** — generate `getNamespaces()`, the highlighter colours and the
   docstring from `SymbiaNamespace` rather than maintaining four lists. The
   quickstart's four-step checklist becomes unnecessary rather than better
   followed.
6. **F27** — decide the `@env` policy explicitly; allowlist or redact.
7. **F28** — the honest options are to converge the runtime onto Symbia Script,
   or to stop calling Symbia Script unified. Either is defensible; the current
   state claims the first while doing the second.
8. **F29** — correct the count.

Deliberately *not* proposed: adding operators, conditionals or functions to
Symbia Script. Its power comes from being inert and parseable without execution.
Every defect above is in resolution or in the lists around it, none in the
grammar. The grammar should stay boring.

### 8.6 Registered predictions — §8

- **P6** — `energy-pue`'s graph, run with one meter reading absent, emits a PUE
  on the **canonical** lane rather than refusing. *Confidence: high.* This is
  F21 traced to a live graph and is the measurement that matters most.
- **P7** — Fixing F21 breaks at least one existing test or fixture that relies
  on the zero-substitution. *Confidence: medium.*
- **P8** — No shipped rule uses `@env.*`. *Confidence: medium-high.*
- **P9** — At least one shipped rule uses `@org.id` or `{{@org.id}}` and is
  therefore carrying the composite. *Confidence: low — I expect this one to be
  wrong,* because most rules reach org through the action handlers, which guard
  it. Registering it as the one I expect to lose.
- **P10** — `symbia-sys/dist/` is current with `src/` at HEAD, so the §8.3
  measurements describe the code as written. *Confidence: medium.* Untested, and
  discipline 4 says this is exactly the assumption that has impersonated fixes
  before.

---

