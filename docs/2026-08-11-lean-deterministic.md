# Lean deterministic

*11 August 2026. A **principle**, with a measurable definition and the limits
stated. Written down because it has been re-derived at least twice — once in
November/December and once today — and re-derivation is how a settled idea
becomes an argument again.*

## The principle

> Use deterministic methods and tools for every decision that admits one.
> Spend the model where only a model will do, and record which happened.

Not "eliminate the model." **Entirely deterministic is a false idol** — every
real system, including every human one, integrates the two. The aim is the
ratio, not the absolute.

### Correction, same day: "model" is not a synonym for "not reproducible"

**This document originally treated any model call as apocryphal. That is wrong,
and it was steering design decisions before it was caught.**

It is true only of **sampled generative** models. A trained *discriminative*
model — CRF, logistic regression, SVM, a fixed-weight classifier with argmax
decoding — is exactly as reproducible as a regex: same input, same weights,
same output, with a digest to pin the weights to. What broke reproducibility
was sampling, not machine learning.

Conflating the two deleted the middle tier, which is the one that does most of
the work:

| tier | reproducible | robust to paraphrase | cost |
|---|---|---|---|
| grammar / pattern | yes | **no** | ~0 |
| **discriminative classifier** | **yes** | **yes** | ~0 after training |
| sampled generative model | no | yes | high |

The middle row is what industrial NLU was from roughly 2010 to 2019 — intent
classification and slot filling — and Snips shipped exactly this escalation
on-device in 2017. See
`docs/2026-08-11-deterministic-nlp-prior-art.md`.

So the principle is unchanged and its application widens: **deterministic
methods include trained ones.** Brittleness is an argument against the grammar
tier, not against determinism.

### Why it is not primarily an epistemic argument

The epistemic case is real but secondary: a deterministic step is recomputable,
so it stays in the canonical lane. Three arguments matter more in practice.

**1. It converts noise into defects.** A non-deterministic wrong answer cannot
be reproduced, bisected, regression-tested or shown to be fixed. It is noise,
and there is no process for noise. A deterministic wrong answer is a bug: it
has a reproduction, it can be pinned to a model digest or a pattern, and it can
be proven fixed. Determinism buys **tractability**, not correctness, and
tractability is the thing engineering can actually hold.

**2. The expensive step and the unreliable step are usually the same step.**
Measured today: routing was a model call — roster plus message, several hundred
tokens, *before any work happened* — on a coordinator that fronts every
request. It was also the least reliable step in the system, disagreeing with
itself across four passes. Replacing it with a regex against a declaration made
it faster, free, and stable in the same change.

**3. Cost is not only money.** Tokens, latency, and datacentre draw are the
same quantity seen three ways. A decision that a regex settles in microseconds
should not be spending a GPU-second.

## Two hemispheres, and the part that matters is the join

The useful half of the metaphor is specialisation plus a **narrow, high-quality
channel between the two**. The pop-neuroscience half — logic on one side,
creativity on the other — is not the claim, and does not need to be.

The channel is the interesting part, and this platform has spent its effort
there without naming it that way. **The provenance envelope is the corpus
callosum.** It is what lets one hemisphere's output be consumed by the other
with its epistemic status intact: the lane, the arena, `method: declaration |
model`, `sealedOver`, `decode.reproducible`. Without it the two sides blend and
the result is uniformly apocryphal — which is exactly what a delegated reply was
this morning, sealed `COMPUTED` with a model's choice excised from the middle.

## The unclaimed value: classical methods as dimension reducers

The largest saving is not replacing the model. It is **shrinking what the model
has to look at.** The model should rarely be the thing that *searches*; it
should be the thing that *judges*, over a small candidate set something cheaper
produced.

| stage | classical method | what the model then sees |
|---|---|---|
| routing | pattern match, BM25, ANN over embeddings | 0 candidates, or 2–3 when genuinely ambiguous — not the whole roster |
| natural-language math | quantity/unit extraction + a small template set (tip, split, discount, tax) | only genuinely novel phrasings |
| log and metric triage | EWMA, z-score, changepoint detection | 3 anomalous windows, not 10,000 lines |
| bulk summarisation | cluster, then summarise representatives | 12 cluster heads, not 500 tickets |
| retrieval | BM25 recall, then rerank | a page, not a corpus |
| scheduling, allocation | LP/MIP solver — exact and fast | the translation in, and the explanation out |
| validation | schema, type, and **dimensional analysis** | nothing; it is a guard, not a generator |

Dimensional analysis is the sharpest small example. If a step proposes
`47.50 * 0.15 kg`, unit checking rejects it deterministically, for free, with no
model opinion required. That is a whole class of wrong answers removed by
arithmetic that predates computing.

Smart Calculator already runs the pattern in miniature and is worth reading as
the reference case: **the model chooses the expression, and never evaluates
it.** Its typed fields say so — `expressionChosenBy: model`,
`computedBy: math.evaluate`. The model does interpretation; the function does
computation. Neither does the other's job.

## Making it a number

"Lean deterministic" is a slogan until it has a metric. Two, both cheap to
record and both belonging in the envelope:

- **Reduction ratio** — candidates a classical stage considered ÷ candidates
  presented to the model. Routing today: 3 considered, 0 presented. Ratio ∞,
  which is the honest reading of "no model was consulted".
- **Escalation rate** — the fraction of requests where the deterministic path
  declined to settle it. This is the number that tells you whether declarations
  are being maintained or quietly rotting.

Escalation rate is the one that will misbehave. "Escalate when unsure" degrades
to "always escalate" unless it has a budget and somebody looks at the number,
because the deterministic path is never *quite* good enough. **Predict it before
measuring it**, as with everything else here.

## The honest cost

Determinism moves cost, it does not delete it. Regex declarations need human
maintenance and fail on paraphrase — today's `what is 20% of 80` routed
correctly only because Calculator's pattern is anchored end-to-end, which was
not obvious when it was written and is now a permanent test case for that
reason. Compute cost becomes attention cost.

So the rule is not "deterministic everywhere". It is **deterministic where the
declaration is cheap to maintain, escalate where it is not, and record the lane
drop** — which is what `method: 'declaration' | 'model'` exists for. The
escalation boundary is the design problem. Determinism is not.

**And per the correction above there are two boundaries, not one.** Pattern →
classifier is a step within the canonical lane, because a pinned discriminative
model is still recomputable. Classifier → generative is the step that actually
drops the lane. `method` needs four values (`grammar`, `classifier`, `model`,
`declined`) where it currently has two, or the receipt cannot tell the two
escalations apart.

`conditional` in the port lanes already encodes this correctly and per
invocation: *decided by the data; `laneNote` must say by what*.
`symbia.state.rollup` is canonical when it can be and apocryphal when it cannot,
one value at a time. Routing should have the same shape, and currently does not
— it refuses instead of escalating, which is a stricter configuration of a
mechanism that already supports the hybrid.

## Where this is not settled

- **Whether routing should escalate or refuse.** Refusing was chosen
  deliberately today. Under this principle it is arguably an escalation with a
  recorded lane drop. Live question, not an oversight.
- **`COMPOSED` is out of scope here by agreement**, and stays out.
- **None of the reducers in the table above are built** except pattern routing.
  The table is a claim about where the value is, not a report of work done.
