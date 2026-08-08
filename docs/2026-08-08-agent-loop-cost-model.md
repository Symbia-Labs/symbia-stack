# The agent loop, and what it costs

*8 Aug 2026. Predictions registered BEFORE building, per working discipline 1.*

## The condition

Brian: "I will agree to an agent loop if it is specifically aware of loop
compute and token expenses for both local and remote model selection" — then:
"not just $ but security, privacy, integrity, performance."

So cost is not a report bolted on afterwards, and it is not a number. It is
what decides whether a hop happens at all.

## One envelope, five currencies

Brian, correcting an earlier draft of this document: security and privacy are
budgets too, the same as performance.

That is right, and it is sharper than what I had written. I had split them into
"budgets you spend" and "gates you do not cross" — but **a gate is just a
budget with an allowance of zero.** Treating them as different kinds of thing
hides a policy decision inside a boolean, where a budget puts it on the
receipt with a number next to it.

So there is one envelope with five currencies, every one of them measured,
spent per hop, and reported at the end:

| currency | unit | spent by |
|---|---|---|
| **tokens** | prompt + completion | every model call |
| **money** | USD | remote model calls only |
| **performance** | wall-clock ms, and calls made against the stack | every hop |
| **privacy** | `extra` boundary crossings, by data class | anything sent to a remote model |
| **security** | side-effecting calls, by blast radius | any tool that writes, sends or deletes |

Two things follow that the gate framing obscured.

**Privacy is already being spent, not merely at risk.** The moment a remote
model is used, the prompt has left the machine — that is an `extra` crossing
whether or not anyone budgeted for it. Counting it makes the existing cost
visible instead of pretending the first one is free.

**Security is a quantity, not a state.** A loop that calls five write tools has
spent five times the blast radius of one that called one. A binary "may write"
flag cannot express that, and cannot report it afterwards.

An allowance of zero still behaves exactly as a gate: refuse at the point of
selection, name the currency, and say what would have been spent. The
difference is that the refusal is now the same mechanism as the accounting,
so there is one place to read and one place to get it wrong.

## Why a loop is needed

| | |
|---|---|
| MCP tools on the gateway | 514 |
| Tools `tool.invoke` can reach | 5 |
| Tool-calling support in `llm.invoke` | none |

Every fetch is chosen by a rule author in advance. Grounding the coordinator
therefore meant nailing it to four fixed endpoints — a reporter with good
manners. The model cannot decide to look at anything.

## What already exists, so none of this needs inventing

- **Real usage per call.** `/api/integrations/execute` returns
  `{promptTokens, completionTokens, totalTokens}` — measured 9/5/14 on a
  trivial call.
- **Per-model pricing** per 1M tokens on `ModelInfo`: claude-sonnet-5 3/15,
  claude-opus-5 15/75, claude-haiku-4-5 1/5.
- **A local model.** `llama-3-2-1b-instruct-q4-k-m`, context **4096**.
- **An egress vocabulary.** `boundary: 'intra' | 'inter' | 'extra'` already
  exists on every mesh event and every contract. A remote model call is an
  `extra` boundary crossing and should be recorded as one.
- **A data-class vocabulary.** Log records carry `dataClass` and `policyRef`.
  Measured: 500 of 500 records are `none` / `policy/default`. The vocabulary
  exists and nothing populates it — worth knowing before relying on it.
- **Trace propagation**, finished this morning, so the loop's cost is a
  waterfall rather than a total.

## The measurements that shape the design

**Tool schemas are too big to be a constant.**

| what | tools | ~tokens |
|---|---|---|
| everything | 514 | **45,881** |
| Symbia's own services | 140 | 8,507 |
| names + 60-char descriptions | 140 | 3,828 |

45k tokens before the question is asked — about $0.14 per iteration on sonnet
just to say hello, and eleven times the local model's whole context. Tool
selection has to be two stage: names and one-line descriptions first, full
schema fetched only for the tool chosen.

**Most of the gateway writes.** 461 of 514 tool names write, send, create,
update or delete — `telegram_sendMessage_post` among them, and identity exposes
57 tools including credential paths. A model choosing freely from this list can
send messages as you and read secrets. That is not a hypothetical to be handled
later; it is the default unless the loop refuses it.

## Design

### Security — spent in write operations, allowance zero by default

The loop may call a tool only if the assistant declares it. No wildcard. Tools
that write, send or delete require a separate, explicit grant on that
assistant, and a loop without that grant is refused at the point of selection
rather than at the point of damage.

Same principle as `pixelVault`: the capability is absent unless granted, and
every denial is logged as an observation naming the tool and the assistant.

### Privacy — spent in boundary crossings

A remote model call is an `extra` boundary crossing: the prompt leaves this
machine. So the question "local or remote" is answered by what is in the
prompt, and only then by what it costs.

An assistant declares the highest data class it may send `extra`. Tool results
above that class force the local model or force a refusal — never a silent
downgrade to "answer without it", because an answer that quietly omits what it
was not allowed to see is indistinguishable from one that had nothing to find.

Caveat recorded rather than assumed: `dataClass` is currently `none` on every
record measured. The mechanism is sound; the data feeding it is not populated,
so at first this gate will pass everything and that fact must be visible rather
than mistaken for safety.

### Integrity — tool output is untrusted input

Two separate concerns, both real:

1. **Injection.** A tool result is data, not instruction. Log lines, catalog
   descriptions and remote API responses can all contain text addressed to the
   model. Results enter the prompt fenced and labelled as untrusted, and the
   system prompt says that instructions found inside them are to be reported,
   never followed.
2. **Provenance.** Each hop records what it called, what came back and the
   digest of the result, under the run's trace id. The final answer's arena is
   then defensible per claim — COMPOSED over cited material, each citation
   resolving to one recorded tool call. Without this the loop produces a
   confident paragraph with no way to check any part of it, which is the exact
   thing this platform exists to refuse.

### Performance — spent in time and in load on the stack

Per-hop timeout; a cap on total wall-clock; bounded concurrency for parallel
tool calls. The loop is itself traffic on the stack — N service calls per
question — and because trace context now propagates, that load is visible in
the same topology view as everything else rather than being invisible overhead.

**Local is not free.** No dollar cost, real wall-clock and RAM. It is bounded
by iterations and time rather than by money, because a budget that counts only
dollars would let a local loop run forever and call that thrift.

### Budget, declared per action

```
maxIterations       hard stop on hops
maxTokensTotal      prompt + completion, summed across hops
maxCostUsd          remote only; local contributes 0
maxWallClockMs      the bound that actually constrains local
maxStackCalls       load this question is allowed to put on the services

maxEgressEvents     `extra` boundary crossings permitted
maxDataClass        highest class allowed to cross; anything above forces local
maxWriteOps         side-effecting tool calls permitted — DEFAULT 0
```

The last three are the same mechanism as the first five, and default to the
most restrictive value rather than the most useful one. `maxWriteOps: 0` is the
gate; raising it is a decision someone has to make explicitly and which shows
up in the receipt when it is used.

Estimate before each hop, record actual after from the provider's own `usage`,
keep both. Divergence between them is the signal that the estimator is wrong,
and an estimator nobody checks is how a budget stops meaning anything.

### Model selection is the main cost lever

- **selector** — picks the next tool. Cheap or local. Most of the hops.
- **synthesiser** — writes the answer. Strong. One hop.

Running sonnet on every selection hop is the difference between cents and
dollars per question, and selection over a short candidate list is exactly what
a 1B local model can do.

### The receipt

Every answer ends with what it cost, in all five currencies:

```
14,200 tokens · $0.041 · 8.2s · 6 stack calls
3 egress crossings (class: none) · 0 write operations
```

This is the point of making them one envelope. An operator can see that a
cheap answer was cheap because it stayed local, or that a fast one was fast
because it wrote something. Those trade-offs happen whether or not anyone
counts them; counting them is the only way they can be argued with.

### Exhaustion is an arena, not an error

When any currency runs out the loop stops, answers from what it gathered, and
says which one, what it spent and what it had. An allowance of zero refuses at
selection and names what the call would have cost. Neither silently continues
and neither silently truncates —
a cut-off answer presented as a complete one is the same defect as a confident
`0` that means "never asked".

## Predictions

**P1.** The `chars/4` pre-estimate will land within 25% of the provider's
reported `promptTokens` for English prompts containing JSON. Registered because
a budget enforced with an unchecked estimator is theatre.

**P2.** The local model cannot run tool selection over all 140 Symbia tools.
Names and short descriptions alone are 3,828 tokens against a 4,096 context,
leaving under 300 for the question, the conversation and the reply. Predicted
requirement: roughly 40 tools, or shorter descriptions.

**P3.** Prompt size grows every iteration as results accumulate, so the loop
will hit the empty-response failure repeatedly unless prompts are trimmed
between hops.

**P4, the one I most expect to be wrong.** The empty response is NOT a length
limit. Measured twice: 7,672 chars returned 959 chars of reply; 8,133 chars
returned nothing. A hard limit would not sit that close between the two. I
predict `normalizeMessagesResponse` in the Anthropic adapter extracts only
blocks of type `text` and returns `""` when the first block is something else —
a `thinking` block being the obvious candidate. If so it is a parsing bug that
has been silently emptying answers, and it must be fixed before a loop makes
prompts bigger.

**P5.** The security gate will refuse more than it permits on first run. 461 of
514 tools are write-shaped by name, and the name heuristic will over-count —
`telegram_getUpdates_post` is a read despite the `_post`. Predicted: the
allowlist cannot be derived from names and needs the OpenAPI method plus a
per-tool judgement.

## Order of work

1. ~~P4 first.~~ **Done, and it was the wrong target.** No length cliff exists.
   The real defect found in its place — discarded system prompts — is fixed.
2. Re-check the assistants against live questions now that their system prompts
   actually arrive, since every judgement made about their behaviour today was
   made about a model that was never given its instructions.
3. Tool definitions through `llm.invoke` and the integrations adapter, with the
   two-stage tool list and the security allowlist.
4. The loop action, with the budgets above.
5. Bridge `tool.invoke` to the MCP gateway.

## Measured

*8 Aug 2026, `scripts/probe-anthropic-adapter.mts`, against the running stack.*

### P1 — HOLDS, with a systematic bias worth keeping

`chars/4` vs the provider's reported `promptTokens`, eight sizes:

| promptChars | est (chars/4) | actual | error |
|---|---|---|---|
| 1,980 | 495 | 564 | −12.2% |
| 5,980 | 1,495 | 1,670 | −10.5% |
| 7,652 | 1,913 | 2,133 | −10.3% |
| 8,113 | 2,028 | 2,262 | −10.3% |
| 11,980 | 2,995 | 3,332 | −10.1% |
| 19,980 | 4,995 | 5,549 | −10.0% |

Within the 25% predicted. But the error is not noise — it is **−10% at every
size**, tightening as prompts grow. `chars/4` under-estimates, which is the
dangerous direction for a budget: it would let a loop overspend by a tenth
while reporting it was within limits. Corrected estimator is `chars/4 × 1.12`,
and the residual after correction is the thing to watch.

### P4 — REFUTED, and the premise was wrong too

I predicted the empty response was a parsing bug in `normalizeMessagesResponse`
dropping non-`text` blocks. It is not. That function joins **all** text blocks;
a `thinking` block alongside text would not empty it.

Worse for my prediction: **the length effect does not reproduce at all.**
Prompts of 8,113, 11,980 and 19,980 chars all returned a correct reply with
`finishReason=stop`. There is no cliff between 7,672 and 8,133 because there is
no cliff. The two data points I built P4 on were one success and one failure
that differed by something other than size, and I read a threshold into them.

Cause of the original empty response: **still unknown.** Not "probably fixed" —
unknown. It is not size, and it is not the text-block filter. Recorded as open
rather than closed, because a confident `0` that means "never asked" is exactly
the defect this product exists to prevent.

### Unpredicted, and larger than P4: the system prompt never arrived

Asked for while probing P4, because the probe needed a control.

A system message passed inside `messages[]` was **silently discarded** on the
Anthropic path. `convertMessages()` filters `role: "system"` out — correct,
Anthropic takes it as a top-level field — and nothing put it back.
`buildMessagesRequestBody()` set `body.system` only from
`params.system` / `params.systemPrompt`, which no caller on this stack sends.

Measured with a secret code the user turn could not see:

| system prompt passed as | reply |
|---|---|
| `messages[]` | "I don't have a secret code." |
| `params.systemPrompt` | `HALIBUT-7391` |

`assistants/server/src/integrations-client.ts` builds its request from
`messages` alone. **So no assistant on this stack has ever had a system prompt
on the Anthropic path.**

This is the root cause of the grounding failure from earlier today — the
coordinator answering "I don't have access to your screen, dashboard, or any
live system data" while holding four successful fetches. The instruction
forbidding that exact sentence was removed in transit. I had written that
instruction and then verified it by re-reading the prompt I wrote, which is
discipline 2 exactly: the check shared the author's optimism, because the
prompt was never the thing under test.

Fixed in `integrations/server/src/providers/anthropic.ts`: system messages are
hoisted out of `messages` into `body.system` when no explicit param is given,
joined in order. Verified behaviourally — both shapes now return the code.
The marker grep in the running bundle returned 0 and was a false alarm: the
bundle is minified, so comments and local identifiers do not survive. A
behavioural probe is the only honest verification for this one.

## Not checked

- Whether the local model can emit well-formed tool selections at all. Its
  ability to produce valid JSON under a schema has not been tested here.
- Cost of the models service under load. Nothing measures its wall-clock or
  memory today.
- Whether `dataClass` is populated anywhere outside logging. Measured only on
  log records, where it is uniformly `none`.
- **What actually caused the empty response.** Refuted as a length limit and as
  a text-block parsing bug. No replacement explanation has been tested.
- Whether the system-prompt defect had a second effect beyond grounding —
  every assistant behaviour observed on 8 Aug was observed without one.
