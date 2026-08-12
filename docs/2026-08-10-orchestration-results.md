# Conversation orchestration — results

*Measured 10–11 August 2026 against the predictions committed in
`2026-08-10-orchestration-predictions.md` (`46ddc4b`), registered before any
code or catalog change and not edited since.*

**The headline: the coordinator delegates now, and it is invisible.** A message
routed to a specialist, the specialist answered, the coordinator stayed silent —
and nothing in the transcript or the receipt says a delegation happened.

---

## Predictions

| # | Prediction | Result |
|---|---|---|
| P1 | Routing by alias fails; `getLoadedAssistant` is keyed on catalog key | **NOT EXERCISED** — fixed before it was measured. Confirmed by code reading only, which is weaker, and recorded as weaker. |
| P2 | Routing to `builder` fails as `assistants-assistant` | **NOT EXERCISED**, same reason. |
| P3 | After resolving by key or alias, a rule using `assistant.route` delivers to the target, the target replies, the coordinator stays silent | **CONFIRMED** — see the log chain below. |
| P4 | *(expected to get wrong)* the delegated reply arrives with no visible sign that delegation happened | **CONFIRMED.** Got this one right, and would rather not have. |
| P5 | A routed message whose text starts with `@` is re-resolved by mention rather than delivered to its target | **NOT EXERCISED** — the guard was written before a case reached it. |
| P6 | Per-process claim arbitration stays invisible with one container | **HELD** — nothing exposed it. |

Two of six were fixed before they could be measured, which makes them
inferences dressed as findings. They are marked that way above rather than
counted as passes.

## P3 — the chain, from the log

```
[LLMInvoke] Stored result in context.routeTarget: converter
[Condition] Evaluated: true
[AssistantRoute] Routing message to converter (reason: classified by the coordinator)
[SDN] Processing for assistant: converter
[SDN] coordinator routed to converter - suppressing coordinator response
[SDN] Response suppressed for coordinator (message was routed)
[SDN] converter won claim, proceeding with response
[SDN] Response emitted: f69ecb26-…, trace: delivered
```

One reply, from Converter, labelled Converter in the window. The suppression
line is the one that could not have appeared before this session: it comes from
inside a `condition` branch, and the code that reads it did not look there.

## P4 — what the receipt does not say

The reply's receipt, expanded:

> The system declined rather than guess.
> Invalid format. Use "10 km to miles"
> **unsealed — no hash on this reply**

Honest about the refusal, honest about the missing seal. Silent about the fact
that **a model chose which assistant would answer**. The operator addressed no
one, a specialist replied, and the routing decision — the step that determined
everything downstream — is absent from the provenance.

This is worth stating plainly because it is the platform's own claim failing at
the point it matters most. `symbia.io.http-request` declares its output
apocryphal. A model's routing decision is exactly as apocryphal and is currently
declared nowhere. Every step *inside* the chosen assistant's answer is sealed;
the choice of assistant is not in the chain at all.

The envelope already carries `steps`. The classification is a step. It is not
being recorded as one.

## Defects found by doing this, in the order they bit

1. **`condition`, `parallel` and `loop` could not produce a reply.**
   `message.send` does not send — it builds the message, seals the envelope, and
   returns it; `webhooks.ts` puts it on the bus. That scan looked only at the
   rule's top-level `actionsExecuted`, and the container actions report their
   children inside their own `output`. A `message.send` in any branch was built,
   sealed, and never read, while `condition` returned `success: true` and the
   provenance step recorded `ok`. Silence with every log line green. All three
   were registered in the handler map and none had ever had a caller, so nothing
   had found it. Fixed by `flattenActionResults`.

2. **`llm.invoke` did not interpolate `systemPrompt`.** `userPrompt` went
   through `interpolate()`; `systemPrompt` was passed raw. A system prompt
   containing `{{roster}}` reached the model as those ten characters. The model
   then reported, correctly, that no specialist was available — so the failure
   presented as a bad classification rather than as missing data. Both fields
   are prose with braces in a JSON rule and nothing marked one as a template.

3. **`assistants.list` returned a hardcoded array.** A tool named for listing
   assistants held eight literal names in `tool-invoke.ts` — a fifth copy of a
   roster that also lives in the coordinator's help text, its orchestrate
   prompt, and two alias tables. Wrong in both directions: it named
   `coordinator` as a delegation target, which is a loop, and omitted `analyst`
   and `builder`, both registered and published. An assistant registered through
   the catalog could never appear in it.

4. **Two alias tables, six-sevenths fictional.** `webhooks.ts` and
   `assistant-route.ts` each carried `logs`→`log-analyst`, `builder`→
   `assistants-assistant`, and five more targets absent from the registry.
   `webhooks.ts` survived on a fallback; `assistant-route.ts` had none and was
   broken for every alias and for `builder`. Now one `resolveAssistant()`.

5. **`tool.invoke` threw `t.replace is not a function` on an object `input`.**
   Recorded as a warning in a commit message on 7 Aug; cost a second debugging
   round today, and the error string was rendered to the person in the chat
   window both times. A warning in a commit message is not a guard. Now
   rejected at the boundary with a message naming the field. The existing
   `coord-team` rule carried the same defect and was broken; fixed.

6. **`rule-platform-status` can never match — and now we know why.**
   `[ConditionEval] INVALID REGEX in condition — this rule can never match.
   pattern=".*(?i:health|status|services|topology|how many|what is symbia).*"`.
   JavaScript does not support inline `(?i:…)` groups. Open since 7 Aug as
   "does not match its own regex"; this is the cause. **Not fixed.** The
   evaluator does log it loudly, which is how it surfaced.

7. **`assistant.route`'s join returns 401.**
   `Join attempt for converter: Messaging API error: 401 - Authentication
   required`. Routing succeeded anyway, because the SDN forward does not require
   participation. So a specialist answers a conversation it is not a participant
   in. **Not fixed**, and the consequences for a follow-up message in the same
   conversation are not established.

8. **The first message sent after a page load does not appear.** Reproduced
   twice. Typed, Return pressed, no user bubble and no reply; the same text sent
   again on the settled page works. Cause not investigated. **Not fixed.**

## Not checked

- Whether a second message in the same conversation reaches the specialist that
  answered the first (bears on 7).
- Whether the classifier picks sensibly across the full roster. One phrase, one
  target, one time.
- Both cycle guards (self-route, second hop). Written, never triggered.
- `parallel` and `loop` through the flattener. Only `condition` was exercised.
- Every earlier browser-walk item still marked not checked: catalog, assistants,
  integrations and logs panels, and the in-console spyglass.

## The one thing I would do next

Put the routing decision in the envelope. A delegation is a step, the model made
it, and a platform that seals what a specialist computed while saying nothing
about who chose the specialist is sealing the wrong half of the answer.
