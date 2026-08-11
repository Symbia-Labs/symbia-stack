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

## 5. Where prior art does not save us

Being fair to the reason the field moved on:

- Semantic grammars are **brittle at the edges**. LUNAR answered moon-rock
  questions superbly and nothing else. Coverage is bought one production at a
  time, and every one is human attention — the cost lean-deterministic says
  determinism *moves* rather than deletes.
- Coverage of open-domain paraphrase is where models genuinely win. "work out
  the tip on this for me would you" is not worth a production.
- So the target is not a 1975 parser instead of a model. It is **a parser for
  the covered fragment, a model for the rest, and a receipt that says which
  ran.** That is the escalation boundary, and it remains the real design
  problem.

## 6. What to do

1. Before writing another routing pattern, evaluate **SRGS/JSGF** as the
   declaration format. If it fits, `metadata.routing` becomes a standard
   artifact rather than a bespoke one.
2. Replace Smart Calculator's parse step with **extractor + small grammar**,
   model as fallback, and measure the escalation rate — the metric
   lean-deterministic already specifies and nothing yet reports.
3. Republish Converter on **`units(1)`** semantics rather than the hand-built
   table it currently carries.
4. Read `conversation-memory.ts` against Centering and decide deliberately
   which of Cf, plurality and operation history are in scope. Right now their
   absence is an accident, not a decision.
