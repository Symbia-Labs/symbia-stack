# Three assistants — predictions

**Registered before measuring, 11 August 2026.** Nothing in this file has been
run. It exists so that a wrong prediction is visible as wrong rather than
quietly rewritten after the fact. Results go in
`docs/2026-08-11-three-assistant-results.md`, and every miss is reported as a
miss.

## What changed first

The roster went from ten assistants to three:

| assistant | key | path | why it is here |
|---|---|---|---|
| Symbia | `assistants/coordinator` | classify → `assistant.route` | delegates, computes nothing |
| Calculator | `assistants/calculator` | `tool.invoke` → `message.send` | no model touches the answer |
| Smart Calculator | `assistants/smart-calc` | `llm.invoke` → `tool.invoke` → `message.send` | a model chose the expression, arithmetic stayed exact |

The two specialists differ in exactly one variable. That is the point: the
arena taxonomy in `assistants/server/src/engine/provenance.ts` claims to tell
COMPUTED from COMPOSED, and this pair makes a wrong answer to that question
visible instead of arguable.

Four code changes went in alongside:

1. `assistant-loader` now passes `?status=published`. Before this, `status` was
   decoration — an unpublished assistant still loaded, routed, and appeared in
   `assistants.list`.
2. `math.evaluate` input is normalised lexically (`normalizeMathInput`): a
   leading phrase from a closed list and trailing punctuation are stripped, so
   what survives is a strict substring of what was typed.
3. `rule-compute-first` deleted from the coordinator.
4. Inline regex modifiers stripped from four conditions across two rules.

## Predictions

Arena is read from `message.metadata.symbia.provenance.arena` on the reply.

### The delegation path

| # | prompt | answered by | reply | arena |
|---|---|---|---|---|
| P1 | `2+2` | Calculator | `= 4` | `COMPUTED` |
| P2 | `what is 2+2?` | Calculator | `= 4` | `COMPUTED` |
| P3 | `sqrt(16)` | Calculator | `= 4` | `COMPUTED` |
| P4 | `whats 15% tip on $47.50` | Smart Calculator | `**Understood:** 47.50 * 0.15` / `**Answer:** 7.125` | `COMPOSED` |
| P5 | `split $120 between 4 people` | Smart Calculator | `**Understood:** 120 / 4` / `**Answer:** 30` | `COMPOSED` |

P1 is the one that matters. Before today it was answered by the coordinator
itself via `rule-compute-first` and never reached Calculator, so the simplest
possible input was the one that did not exercise delegation. P3 was delegated
even then, because it failed that rule's regex — the same question took two
paths depending on syntax.

P2 exercises `normalizeMathInput`. Before today it refused with
`Invalid character: ?` (STATUS §6.2).

### Symbia answering directly

| # | prompt | reply | arena |
|---|---|---|---|
| P6 | `help` | the coordinator help text | **`REFUSED`** |
| P7 | `who is on the team` | a list naming exactly Calculator, Smart Calculator, Symbia | `COMPUTED` |
| P8 | `is the stack healthy` | prose about service health | `COMPOSED` |

**P6 is predicted wrong on purpose.** A static `message.send` produces zero
provenance steps, and `classify([])` falls through every branch to
`{ arena: 'REFUSED', basis: 'no step produced content' }`. Every help reply in
this system is currently sealed as a refusal. The system did not decline; it
answered. Predicting it here rather than fixing it first is deliberate — the
measurement should confirm the reading of the code before the code changes.

P7 and P8 both depend on regexes that could never compile until today. P7's
`(?i)who.*team` throws on every Node version. P8's `(?i:…)` compiles on the
host (Node 25.2.1) and throws in the container (Node 20.20.2), so a host-side
test of that pattern reports it healthy. Both are moot now — the evaluator
already compiles every `matches` pattern with the `i` flag, so the modifiers
were redundant as well as fatal.

P7 also depends on `{{#each}}` working in `interpolate()`, which has not been
checked. If the template engine has no block helper the reply will render the
template literally. **Flagged as a known risk, not a prediction.**

### The envelope itself

These are predicted to FAIL, on every reply above. They are recorded so the
failure is measured rather than asserted.

| # | claim | predicted |
|---|---|---|
| P9 | `provenance.assistant` names the assistant that replied | **`undefined`** |
| P10 | `provenance.runId` correlates with the SDN wrapper | **`undefined`** |
| P11 | a delegated reply's `steps` include the routing decision | **absent** |

P9 and P10: `message.ts` seals with `context.metadata?.assistantKey` and
`context.metadata?.runId`. Neither is ever set — both webhook paths pass
`metadata: { token }`. `assistantKey` lives on `event.data`; the runId is
generated inside `RuleExecutor.execute()` and never written back. Because both
are `undefined`, `JSON.stringify` drops them from the hashed body, so the seal
commits to their absence.

P11 is STATUS §6.3, and the mechanism is worse than that entry reads. The
`assistant.route` step **is** recorded into `context.provenance` by
`rule-executor`. But sealing happens only inside `message.send`, and the
coordinator's whole job is to send nothing — `suppressResponse` returns before
anything seals, and the array is discarded with the context. The specialist
then starts a fresh `ExecutionContext` with an empty provenance array.
Provenance is scoped to one rule execution; a delegation spans two. Adding a
step will not fix it — the step already exists and is thrown away.

## How this is measured

`scripts/verify-assistants.mjs`, against a running stack, through the API a
user's message actually takes. Not by grepping source: the suite removed on
10 August asserted 303 failures that were not defects, because nearly every
assertion was a `grep` over source text and it was reading a February
architecture.

Before drawing any conclusion about behaviour, confirm the running bundle is
the code just built by grepping a unique marker in it, and kill by port rather
than by process name.
