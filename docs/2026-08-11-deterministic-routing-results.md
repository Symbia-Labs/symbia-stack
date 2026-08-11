# Deterministic routing and typed replies — results

**Measured 11 August 2026**, against predictions committed before the change
(`docs/2026-08-11-deterministic-routing-predictions.md`).

**9 of 10 predictions held. Three consecutive runs were identical.**

## Routing is deterministic

The model classifier is gone from the routing path. `coord-orchestrate` went
from `[tool.invoke, llm.invoke, condition]` to `[tool.invoke, assistant.route]`.

Every delegation now records what decided, and the answer is a pattern rather
than a model:

```
delegation: coordinator -> calculator
decidedBy=assistants.route (declared pattern "^\s*(?:please\s+)?(?:what(?:'s|s| is)|calculate|…")
```

```
delegation: coordinator -> smart-calc
decidedBy=assistants.route (declared pattern "\bsplit\b.*\b(?:between|among|across|by)\b")
```

The `basis` sentence on a delegated reply changed accordingly. This morning it
ended *"is NOT reproducible."* It now ends:

> …that choice is recorded in this envelope's delegation and **is reproducible
> from the message and the registry.**

That is the whole point. The routing decision moved from the apocryphal side to
the canonical side, and the reply's receipt says so because it is now true.

### The stability claim, tested by repetition

| prompt | run 1 | run 2 | run 3 |
|---|---|---|---|
| `2+2` | calculator | calculator | calculator |
| `what is 2+2?` | calculator | calculator | calculator |
| `sqrt(16)` | calculator | calculator | calculator |
| `15% tip on $47.50` | smart-calc | smart-calc | smart-calc |
| `split $120 between 4 people` | smart-calc | smart-calc | smart-calc |

Identical. For comparison, the model classifier across four passes of the same
prompts: `2+2` held, broke, broke, held; `15% tip` held, broke, held — and
`2+2` failed with an empty completion on a three-character prompt.

`2+2` is now a regex match against a declaration. It cannot be flaky, and
repetition is the only thing that shows that; one green run would not have.

## Refusal instead of guessing

`tell me a joke about snails` — nothing declares it, so Symbia refuses and
names what it can reach, sealed `REFUSED`:

> No specialist declares this kind of request, so I am not going to guess.
> I can route to:
> `@calc` — arithmetic written as an expression — `2+2`, `sqrt(16)`, `(10+5)*2`
> `@smartcalc` — arithmetic described in words — tips, splits, percentages, totals

The model classifier would have picked something. This is OEP's prescribed
rewrite for a claim the system cannot support, and the roster in it is read
from the registry rather than written down anywhere.

## The flagged risk did not materialise, and it was close

The predictions flagged — as a risk, deliberately not as a prediction — that
`what is 20% of 80` could match Calculator's lead-in and Smart Calculator's
percent rule, with precedence (100 vs 50) sending it to the strict parser that
cannot read it.

Measured: **smart-calc, `COMPOSED`, `**Understood:** 80 * 0.20 / **Answer:**
16`.** Correct.

The reason is that Calculator's pattern is anchored end-to-end, so `of 80`
disqualifies the whole string. That is the anchor doing its job — but it is
load-bearing in a way that was not obvious when it was written, so it is now a
permanent case (`D8`) rather than a paragraph in a document.

## Typed replies

`message.send` takes `fields`. The seal commits to the fields and
`sealedOver: 'fields'` says so, in the hashed body, so the answer to *which
half does this hash cover* cannot itself be altered.

Calculator emits `{ expression, result, computedBy }`; Smart Calculator emits
`{ request, expression, result, expressionChosenBy, computedBy }`. Rewording
either template no longer changes the hash of an identical computation, and the
value is checkable apart from the sentence around it.

**P12: 9/9.** Every sealed reply verifies from the envelope alone, recomputed
outside the service — which is the position anyone checking your work is in.

## Still broken, honestly

**P6 (`help`) remains broken and the underlying defect is untouched.** It
predicted `REFUSED` and now seals `COMPUTED`, because `help` gained a
`tool.invoke` step and stopped being a zero-step static reply. `classify([])`
still returns `REFUSED: no step produced content`, so any genuinely static
`message.send` is still sealed as a refusal. The behaviour improved by accident
of an unrelated change.

**New: a refusal is rendered as a malfunction.** D7's reply is correct and
correctly sealed, and it arrives wrapped in:

> ⚠️ I encountered an error while processing your request: `…`

Symbia did not encounter an error. It made a decision and stated its limit —
which is the behaviour this change was for. The wrapper comes from
`webhooks.ts`, which treats any failed action as an error to apologise for, and
it misattributes a deliberate refusal as a fault in the system. Same class as
*"Add an API key in Settings"* misattributing our own bad request to the
operator's configuration. **Not fixed; recorded.**

## The fourth instrument failure

`P12` first read 0/8 after this change. The seal was fine; `verifySeal` in the
walk had not been updated with the two new fields. Fourth time today a
measuring instrument was wrong rather than the thing measured, after minified
comment markers, P7 asserting a key where aliases render, and the wrong
`NETWORK_HASH_SECRET`.

Every one pointed at working code and said broken. The pattern is now specific
enough to state as a rule: **any change to `seal()` is a change to three
places** — `seal`, `verify`, and `scripts/verify-assistants.mjs` — and omitting
the third produces a confident false negative that looks exactly like tampering.

## Next

1. **A refusal is not an error.** Give `webhooks.ts` a refusal path distinct
   from its error path, so a stated limit is not dressed as a malfunction.
2. **`classify([])` should not be `REFUSED`.** Still open.
3. **`does_not_assert` on the delegation record.** A delegation asserts that
   coordinator matched a declared pattern. It does not assert the declaration
   is correct, nor that the specialist can actually handle what it claimed.
4. **Canonical JSON in `seal()`.** Now three sealed artifacts share a
   non-canonical construction.
