# Cadence — four conversations

**11 August 2026.** `scripts/probe-conversation.mts`. Whole conversations with a
shape, judged on rhythm rather than correctness.

**14 of 20 turns were refused. It never once asked a question back, never once
acknowledged anything, and repeated itself verbatim five times.**

Every correctness measure is green — 11/11 predictions, 10/10 seals, 10/10
signatures, 11/11 OEP. This is a system that is right and unpleasant, and none
of the existing harnesses could see it, because they open a fresh conversation
per case and never observe an opening, a rhythm, or a repetition.

## First contact — 4 of 5 turns refused

```
you: hey
›   [coordinator/REFUSED] No specialist declares this kind of request…

you: what can you do?
›   [coordinator/REFUSED] No specialist declares this kind of request…

you: ok, 2+2
›   [calculator/REFUSED]  ⚠️ I ran into a problem and stopped rather than guessing

you: how did you know that?
›   [coordinator/COMPUTED] About my last answer…

you: nice
›   [coordinator/REFUSED] No specialist declares this kind of request…
```

**`what can you do?` is refused.** The one question every new user asks, about
the platform's own capability, which `help` answers perfectly — and it is not in
the help rule's regex. The system knows the answer and declines to give it.

**`ok, 2+2` fails.** Two words of politeness and the arithmetic is unreachable:
Calculator's pattern is anchored end-to-end so `ok, ` disqualifies it, the
classifier still routes it to Calculator, and the strict parser then chokes. The
tier that exists to absorb phrasing routed it to the tier that cannot.

Three of these five are the same defect wearing different clothes: **the
declarations cover the task and not the conversation around it.**

## Working through a problem — the arithmetic is wrong

```
you: we need to split a 47.50 dinner bill between 3 of us
›   [smart-calc/COMPOSED] Understood: 47.50 / 3

you: add 15% tip first
›   [smart-calc/REFUSED]  ⚠️ I ran into a problem…

you: so what does each person owe
›   [calculator/RETRIEVED] I only understand math expressions.

you: double that
›   [smart-calc/COMPOSED] Understood: 15.8333333333 * 2
```

`add 15% tip first` is a **correction to the previous turn**, and there is no
such concept. Memory holds the last value; it holds no notion that the user just
revised the question. So the tip is never applied, and `double that` cheerfully
doubles the *wrong* number — an answer with a perfect receipt, computed exactly,
for a question nobody asked.

That is the sharpest finding here. **Provenance is working and the conversation
is still wrong**, and no amount of sealing catches it.

`so what does each person owe` — a direct restatement of the original task —
routes to Calculator and gets told to try `2 + 2`.

## Sceptic — the receipts are reachable only by luck of phrasing

```
you: 2+2                                  → = 4                     COMPUTED
you: are you sure?                        → refused
you: did you use a calculator or just know it → ⚠️ problem
you: can I verify that                    → explanation            COMPUTED
you: what if I do not trust you           → ⚠️ problem
```

`can I verify that` works. `are you sure?` and `did you use a calculator or just
know it` — the same question in the words people actually use — do not. The
explain rule matches ten regexes and this is the brittleness the classifier tier
was added to fix, in a rule that never got one.

## Out of scope — the same sentence, four times

```
tell me a joke                    → No specialist declares this kind of request…
ok what about a poem              → No specialist declares this kind of request…
can you summarise an article      → No specialist declares this kind of request…
and tell me a joke now            → No specialist declares this kind of request…
```

Word for word, including the roster, four times. A person who says "ok what
about a poem" has already read the first refusal; repeating it verbatim tells
them nothing and reads as a machine that is not listening. **`fine, whats 12*12`
then fails too**, for the `ok, 2+2` reason — the frustration is compounding
inside the transcript.

## Numbers

| | first-contact | problem | sceptic | out-of-scope |
|---|---|---|---|---|
| refused | 4/5 | 2/5 | 3/5 | 5/5 |
| verbatim repeats | 2 | 0 | 0 | 3 |
| asks a question back | no | no | no | no |
| acknowledges | no | no | no | no |

**Across all four: 14/20 refused, 0 questions asked back, 0 acknowledgements,
5 verbatim repeats.**

## What this says about the design

The platform treats every turn as an independent request for computation. That
is why it is superhuman on the turns it recognises and absent on every other
kind of turn. A conversation contains at least five things, and four have no
representation anywhere:

| turn type | handled? |
|---|---|
| a request for work | **yes**, well |
| a greeting or a closing | no — refused |
| a question about capability | no — refused, though `help` knows |
| a correction to the previous turn | no — silently ignored, and the wrong answer is sealed |
| an acknowledgement (`nice`, `thanks`) | no — refused |

Refusing a greeting is not a rule gap to be patched with another pattern. It is
the absence of a category. Adding `hello` to a regex would fix the symptom and
leave `hi`, `morning`, `yo`, and `hey there` broken behind it — the maintenance
cost lean-deterministic warns about, spent on the least valuable possible thing.

## Ranked

1. **Conversational turns are a category, not a gap.** Greeting, closing,
   acknowledgement, capability question, correction. Handled by the coordinator
   directly, deterministically, and varied so the third one does not read like
   the first.
2. **A correction must revise the referent.** `add 15% tip first` should change
   what `that` points at. Today it is ignored and the resulting wrong answer is
   sealed as `COMPOSED` with a perfect chain.
3. **Never repeat a refusal verbatim.** Vary it, and escalate: the second one
   should be shorter, the third should stop listing the roster.
4. **Give the explain rule the classifier tier.** `are you sure?` should reach
   it. It is the one rule still relying on regexes alone.
5. **Politeness must not break routing.** `ok, 2+2` and `fine, whats 12*12` are
   arithmetic. Either the normaliser strips conversational lead-ins before
   routing, or Calculator's anchor is wrong.

## What this probe does not measure

Latency and streaming, which are half of felt cadence and invisible over the
API. Tone. Whether the explanations are *good*, as opposed to present. And it
scores four conversations written by the author of the system, which is the
weakest possible sample — the next version should use transcripts nobody
designed.
