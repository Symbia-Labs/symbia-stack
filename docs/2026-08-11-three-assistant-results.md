# Three assistants — results

**Measured 11 August 2026** against a running stack, by
`scripts/verify-assistants.mjs`, after the roster change in `812e716`.
Predictions were registered in `docs/2026-08-11-three-assistant-predictions.md`
and committed before any of this was run. Nothing below has been edited to
agree with the outcome.

**1 of 8 predictions held.** The one that held describes behaviour that is
wrong.

## What the change itself did — worked

- The roster is three. `[Assistant Loader] Found 3 assistant(s) in Catalog` /
  `Loaded 3 assistant(s) total`, against ten before.
- **`status` is now a gate.** Setting seven resources to `draft` removed them
  from the roster, from routing, and from `assistants.list`. Before the loader
  change the same write would have changed nothing observable.
- The coordinator is `Symbia`, and `rule-compute-first` is gone.
- **Both dead rules now fire.** `coord-team` and `rule-platform-status` had
  never matched anything; both matched on the first attempt after the inline
  modifiers were stripped. P7 also came back with arena `COMPUTED`, as
  predicted.

## What broke, and it is mostly one thing

Five of the seven broken predictions have a single upstream cause:

```
[SDN] Action llm.invoke failed: No LLM provider has a usable credential.
```

`coord-orchestrate` is `tool.invoke` (roster) → `llm.invoke` (classify) →
`condition` (route). The classifier is step two, so **no delegation happens at
all.** P1–P5 never reached Calculator or Smart Calculator; Symbia answered each
with the error text, sealed `REFUSED`. P8 failed the same way at its
`step-answer`.

### This was hidden until today

`rule-compute-first` computed bare arithmetic without a model, so `2+2` worked
while every path that needed the classifier did not. Deleting that rule did not
break delegation — it **revealed** that delegation has been resting on a model
call that currently cannot happen. STATUS §5a records orchestration as RUNS,
verified in a browser on 11 August. Both can be true: this is a credential
state, not a code path, and credential state is exactly the kind of thing a
one-off browser check cannot pin down. That is an argument for the script.

### The credential exists. The assistant cannot see it.

Observed, not inferred:

| caller | `GET /api/integrations/capabilities` | result |
|---|---|---|
| user token (`dev@example.com`) | 200 | `anthropic:available` |
| user token + `X-Org-Id` | 200 | `anthropic:available` |
| the assistant, via `llm.invoke` | — | `resolveUsableProvider` returned null |

So an Anthropic credential is configured and reachable, and the org header
makes no difference to whether it is found. The assistant still cannot resolve
it.

**Inferred, and NOT established.** Two candidates, and this measurement does
not separate them:

1. The assistant calls with an *agent* token from `getAssistantToken`, not a
   user token. If that principal lacks the entitlement or org membership that
   `capabilities` filters on, it would see nothing while a user sees Anthropic.
   This is the same family as STATUS §6.5, where `assistant.route`'s join
   returns 401 for the same principal.
2. The SDN path — the live one — passes `metadata: { token: currentToken }`
   at `webhooks.ts:392` and **omits `rawOrgId`**, which the other path at
   `:1181` passes. `resolveUsableProvider` only sets `X-Org-Id` when it has an
   orgId. The table above weakens this one: the header changed nothing for a
   user token. It does not eliminate it, because it may matter for an agent.

Deciding between these needs an agent token driven through the same call. That
was attempted and the agent-login endpoint guessed wrong (404). Left open
rather than asserted.

## The other two failures

**P7 — the rule fired, the template did not.** `who is on the team` matched,
ran `assistants.list`, and sealed `COMPUTED` exactly as predicted. The reply:

```
**Available Team Members:**

- **@** -
```

One row, all fields empty. `{{#each steps.step-roster.result}}` iterated, so
the block helper exists and the result reached it, but the per-item fields
resolved to nothing. This was flagged as a risk in the predictions and is a
**new defect**, not a miss: the roster tool now reads the registry correctly
and the template cannot render what it returns. Also note the row count — one
row for three assistants.

**P6 held, and the behaviour is wrong.** `help` came back sealed `REFUSED`.
A static `message.send` produces zero provenance steps, and `classify([])`
falls through every branch to `{ arena: 'REFUSED', basis: 'no step produced
content' }`. The system answered; the seal says it declined. Every help reply
in this platform currently carries a refusal.

## The envelope — P9, P10, P11

| | claim | measured |
|---|---|---|
| P9 | `provenance.assistant` names the replier | **0 of 2** |
| P10 | `provenance.runId` correlates with the wrapper | **0 of 2** |
| P11 | a delegated reply records the routing step | **0 of 2** |

All three predicted to fail, and all three failed.

**n = 2, and that is the honest number.** Only two replies carried a sealed
envelope at all; the other six were the synthesised error envelope with
`hash: null`, which has no steps to inspect. P11 in particular is untested by
this run — no delegation occurred, so no reply could have carried a routing
step whether the code recorded one or not. It is recorded as failed on the
basis of reading the code, not on the basis of this measurement, and it should
be re-run once the classifier works.

## Untested

`normalizeMathInput` — the fix for `what is 2+2?` (STATUS §6.2) — was never
reached. P2 died at the classifier before any tool ran. The unit behaviour is
in the running bundle (`work out` is present in `dist/index.mjs`), but the
platform behaviour is unmeasured.

## A correction to the verification discipline

`CLAUDE.md` says to grep a unique marker in the running bundle before trusting
it. That was done, and it reported the changes missing — because the build sets
`minify: true` and every marker chosen was a comment. The changes were present
the whole time; the instrument was wrong.

**A marker must be a string literal or an identifier that survives
minification.** Confirmed here with `work out` (a regex literal) and
`URLSearchParams`.

## Next

1. Establish which of the two credential candidates is real, with an agent
   token. Everything else is behind it.
2. Fix the roster template (P7).
3. Re-run this script. P11 has not actually been measured.
