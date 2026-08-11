# Prior art for the deterministic half

*11 August 2026. A **finding about our own work**, written after the
observation that decades of deterministic natural-language processing exist and
none of it was consulted before hand-rolling regexes.*

**The observation is correct.** Everything built today in the routing and
resolution path is a weaker version of something with a literature, a standard,
or a shipped implementation behind it. Recording it so the next increment
starts from prior art instead of from a blank regex.

*Currency caveat: dates and designs below are from the literature. Current
maintenance status of the named implementations has not been checked, and
should be before adopting any of them.*

---

## 1. What was built, and what it is a weak version of

| built today | prior art | what we gave up |
|---|---|---|
| `metadata.routing` regex declarations | **SRGS + SISR** (W3C, 2004/2007), **JSGF**, Snips' deterministic intent parser | A standard grammar format with semantic attachment, instead of a bespoke list |
| `assistants.route` pattern match | Semantic grammars — **LUNAR** (Woods, 1971), **SHRDLU** (Winograd, 1970), **ATNs** (Woods, 1970) | Structure. A grammar returns a parse; a regex returns a boolean |
| `normalizeMathInput` lead-in stripping | Lexical preprocessing in any FST pipeline (**Koskenniemi** two-level morphology, 1983; xfst/foma) | Composability and reversibility |
| `context.resolve` — "that" → last result | **Centering Theory** (Grosz, Joshi & Weinstein, 1995), **Hobbs' algorithm** (1978), **DRT** (Kamp, 1981) | A depth-1 stack instead of a discourse model |
| Smart Calculator's `llm.invoke` parse step | **Duckling** (quantities, currency, distance, duration), **GNU units**, **Frink**, λ-DCS / SEMPRE semantic parsing | The last non-deterministic step in the chain, and the one with the most mature alternatives |
| the unpublished Converter | **`units(1)`**, Unix, 1970s | A solved problem, re-solved badly |

## 2. The mistake that matters

Not "regexes are crude". The specific error:

> **A regex classifies. A grammar classifies *and extracts*.**

`assistants.route` matches `\b(?:multiply|divide|…)\b[^.]*\d` and returns
`true`. It knows the sentence is arithmetic and knows nothing about *what*
arithmetic. So a model is needed afterwards to turn "multiply 4 by 10" into
`4 * 10` — and that model call is now the only non-deterministic step in an
otherwise recomputable chain.

A grammar over the same fragment returns `Mul(4, 10)` in one pass. **The model
step exists because the routing step throws away its own analysis.** That is a
design defect in what was built today, and it is invisible if you only look at
whether the answers are right.

## 3. Centering Theory names what memory does badly

`conversation-memory.ts` keeps one value and substitutes a closed list of
phrases. In Centering terms it stores a backward-looking center (Cb) and no
forward-looking centers (Cf) at all. Consequences, all real:

- `the first one` — no ordered Cf list, so unresolvable
- `the other one` — no alternatives retained
- `both` — no plurality
- `undo that` / `what about instead` — no operation history, only a value

Centering also predicts the failure mode we will hit next: a transition from
CONTINUE to SHIFT (the topic changes) with no signal, so "that" silently binds
to a stale referent. Today `remember()` guards the narrow case — a refusal does
not overwrite the last result — but there is no notion of the topic having
moved.

## 4. The upgrade that serves lean-deterministic directly

`docs/2026-08-11-lean-deterministic.md` argues for spending the model only
where a model is required. The largest single remaining spend in this platform
is Smart Calculator's parse step, on every natural-language turn. It is also
the case with the most prior art:

1. **A quantity/unit extractor** (Duckling-class) over numbers, currencies,
   percentages, distances and durations — deterministic, multilingual,
   decades of accumulated edge cases.
2. **A small semantic grammar** — a DCG or PEG — over the arithmetic fragment:
   *multiply X by Y*, *X% of Y*, *split X between Y*, *X off Y*, *add X% to Y*.
   Perhaps twenty productions covers the traffic these assistants see.
3. **The model as escalation only**, for what the grammar does not cover, with
   `method` on the delegation already able to record which path ran.

That would move Smart Calculator from `COMPOSED` to `COMPUTED` for the covered
fragment — a lane tightening, earned rather than asserted — and would make the
receipt say `computedBy: grammar` instead of naming a model.

**And it makes wrong answers into bugs.** A grammar that mis-parses *"20% off
$80"* has a reproduction and a production to fix. A model that mis-parses it
has a temperature.

## 5. The era this document skipped, and it is the closest one

Everything above is 1970–1995. That leaves out the decade that actually solved
this commercially: **intent classification and slot filling, roughly 2010–2019**,
which was lean deterministic before the phrase existed.

| system | year | what it did |
|---|---|---|
| **Duckling** (Wit.ai) | ~2014 | rule-based extraction of numbers, currency, distance, duration, temperature, across languages |
| **Dialogflow / api.ai, LUIS, Alexa Skills Kit** | 2014–2016 | intents + slots + entity types as the standard interface; slot elicitation and form filling |
| **Snips NLU** | 2017–2019 | on-device, published, and architecturally the thing being proposed here |
| **Rasa** | 2016– | `RegexFeaturizer`, `EntityRuler`, `RulePolicy`, forms — explicit rule tier alongside a learned one |
| **spaCy** `Matcher` / `EntityRuler` | 2015– | token and dependency pattern matching, deterministic at inference |
| **DSTC** (dialogue state tracking challenges) | 2013–2019 | formal treatment of exactly what `conversation-memory.ts` does badly |

**Snips is the sharpest.** Its pipeline tried a `DeterministicIntentParser` —
built from the training phrases, exact and regex-based — and fell back to a
probabilistic parser only when that missed. Deterministic first, statistical
escalation, running on a device with no network.

That is the escalation architecture proposed in §4, shipped in 2017. This
platform's `method: 'declaration' | 'model'` is the same idea with two tiers
instead of three and a worse first tier.

### And "deterministic" is not "rule-based"

This is the correction that matters most, and today's work has the distinction
wrong throughout.

`docs/2026-08-11-lean-deterministic.md` treats *model* as a synonym for
*not reproducible*. **That is only true of sampled generative models.** A
trained discriminative classifier — CRF, logistic regression, SVM, a small
fixed-weight neural net with argmax decoding — is **exactly as reproducible as
a regex**: same input, same weights, same output, every time, with a digest you
can pin the weights to.

What broke reproducibility was *sampling from a generative model*, not machine
learning. Conflating the two threw away the entire middle tier:

| tier | reproducible | robust to paraphrase | cost |
|---|---|---|---|
| grammar / regex | yes | **no** | ~0 |
| **trained discriminative classifier** | **yes** | **yes** | ~0 after training |
| sampled generative model | no | yes | high |

The middle row is what 2015 NLU was, and it is missing from every design
written here today.

## 6. Where prior art does not save us

Being fair to why the field moved on — and narrower than it looked before §5:

- Semantic grammars are **brittle at the edges**. LUNAR answered moon-rock
  questions superbly and nothing else. Coverage is bought one production at a
  time, in human attention.
- **But brittleness is an argument against the grammar tier, not against
  determinism.** A trained intent classifier absorbs paraphrase without a
  production per phrasing and stays reproducible, which is precisely the gap
  §5 identifies. "work out the tip on this for me would you" needs no grammar
  rule and no generative model — it needs a classifier and a slot filler.
- What genuinely requires a generative model is narrower than assumed: novel
  compositional requests outside any trained intent, and open-domain language.
  Arithmetic in words is not that. It is one of the most thoroughly solved
  slot-filling problems there is.
- So the target is **a grammar for the exact fragment, a discriminative model
  for paraphrase, a generative model only for genuine novelty, and a receipt
  saying which ran.** Three tiers, not two. The escalation boundary is still
  the real design problem; there are just two of them.

## 7. What to do

1. **Correct `lean-deterministic.md`.** It equates *model* with *not
   reproducible*, which is wrong and is steering every design decision after
   it. A discriminative classifier with pinned weights and argmax decoding
   belongs in the canonical lane. This is the highest-value change here because
   it is an error in the principle, not in an implementation.
2. **Study Snips' pipeline before designing ours.** Deterministic parser first,
   probabilistic second, on-device, published. It is the three-tier design
   arrived at here, shipped in 2017, and it will have hit problems we have not
   thought of.
3. Before writing another routing pattern, evaluate **SRGS/JSGF** as the
   declaration format, so `metadata.routing` becomes a standard artifact rather
   than a bespoke one.
4. Replace Smart Calculator's parse step with **extractor + small grammar**,
   then a **discriminative intent/slot tier**, generative model last. Record
   which tier answered in `method`, which already exists and currently has two
   values where it needs four (`grammar`, `classifier`, `model`, `declined`).
5. Measure the **escalation rate** per tier — the metric lean-deterministic
   specifies and nothing yet reports. Without it, "the model is only a
   fallback" is an intention.
6. Republish Converter on **`units(1)`** semantics rather than the hand-built
   table it currently carries.
7. Read `conversation-memory.ts` against **Centering and the DSTC line of
   work**, and decide deliberately which of Cf, plurality and operation history
   are in scope. Right now their absence is an accident, not a decision.
