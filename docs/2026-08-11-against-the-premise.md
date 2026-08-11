# Today's work, measured against the premise

*11 August 2026. Written after reading `~/vscode/symbia-seed-a3/docs/concept/premise.md`
— the oldest document in the project — at the end of a day spent building
against a narrower goal than it describes.*

---

## The premise predicted today's failure, in its own words

> Most current AI interactions are **"brilliant in bursts, incoherent in
> aggregate."**

That is the cadence result exactly. Every individual turn today is correct,
sealed, signed, verifiable: 11/11 predictions, 10/10 seals, 10/10 signatures,
11/11 OEP. And four real conversations produced 14 refusals in 20 turns and one
answer that was **computed perfectly for a question nobody asked**:

```
we need to split a 47.50 dinner bill between 3 of us  → 47.50 / 3
add 15% tip first                                     → ⚠️ problem
so what does each person owe                          → "I only understand math expressions"
double that                                           → 15.833… * 2   ← doubles the wrong number
```

Brilliant in bursts. Incoherent in aggregate. The premise names the failure and
lists its causes, and both apply:

> - They forget prior reasoning steps.
> - They do not maintain a unified narrative of the work.

`add 15% tip first` is a revision of the previous step. Nothing in this platform
has a concept of a reasoning step that can be revised, so the correction was
discarded and the error propagated forward — **wearing a valid signature**.

## I optimised the wrong unit, and the premise says so explicitly

> **Beholder-centric evaluation.** Measuring success by how well the system
> serves this specific beholder's goals, **not by generic benchmark scores**.

`verify-assistants.mts` is a generic benchmark score. So is 11/11. Every number
reported today measures a property of an *answer*, and the premise's unit of
value is coherence **for a particular person over time**. A perfect per-answer
score is compatible with a system nobody wants to talk to, and today produced
exactly that pairing.

This is not an argument for deleting the walk. Trust has to be built and
verified, and it now is. It is an argument that the walk cannot tell you whether
the thing is working, and I have been treating it as if it could.

## Against the three legs

The premise defines perceived intelligence as three things. Scored honestly:

| leg | premise's definition | state |
|---|---|---|
| **Trust** | behaves consistently with *their* expectations | **strong.** Arenas, sealed receipts, ed25519 signatures, delegation lineage, OEP enforcement. This is what today built, and it is real |
| **Usefulness** | tracks *their* goals, constraints, preferences, history | **barely started.** No goals, no constraints, no preferences. "History" is one value, in one conversation, in one process |
| **Intelligence (perceived)** | uses context over time to **reduce friction** | **negative.** 14/20 turns refused. Verbatim repetition. `ok, 2+2` unreachable. The system currently *adds* friction |

Trust without usefulness is a very well-audited system that does not help
anybody.

## The gap neither harness can see: there is no beholder

`conversation-memory.ts` is keyed on **`conversationId`**. Two conversations
with the same person share nothing. Close the tab and the referent is gone;
restart the service and it is gone anyway, because the store is a `Map` in
process memory. The same is true of the lineage chain heads.

So the platform has:

- service identities (ed25519, persisted, now signing)
- assistant identities (agent principals in identity)
- **no beholder identity at all**

`dev@example.com` is an authentication principal. It is not a *you*. Nothing
anywhere accumulates against a person: not what they asked before, not what was
decided, not what failed. The premise's first optimisation target —

> **Personal continuity.** A stable sense of "you" across sessions, tools, and
> artifacts.

— has no implementation, and **no test written today could have detected its
absence**, because the walk and the cadence probe both operate inside a single
conversation. The measurement apparatus shares the blind spot of the thing it
measures, which is the failure this project has recorded six times in one day
and has now committed at the level of scope rather than of code.

## Where today's work already fits, once rescoped

Two pieces are the right primitives aimed at the wrong scope:

**The lineage chain is structural memory.** The premise asks for

> breakpoints, logs, decisions, and breakthroughs captured in a way that can be
> revisited, reused, and audited

and `sealDelegation` produces exactly that: immutable, ordered, parent-linked,
signed, non-epistemic. It is scoped **per conversation, in memory**. Scoped per
beholder and persisted, it is the structural memory the premise specifies — and
almost no work is required to move it, because the hard part (the primitive) is
built and running.

**Lean-deterministic is context-efficient cognition, and the premise framed it
better.** `docs/2026-08-11-lean-deterministic.md` argues from cost — tokens,
latency, datacentres. The premise argues from cognition:

> Using the *minimum* necessary context to reason well, **not re-deriving the
> same understanding over and over**.

Re-deriving is the point. Every turn today re-derives who the user is, what they
are doing, and what was already established, because none of it is retained.
The token cost is a symptom; the incoherence is the disease. The premise had
this argument first and stated it in the stronger form.

## What "superhuman but human" means against this document

- **Superhuman** is continuity a person cannot hold: perfect recall of what was
  decided, exact arithmetic, a receipt for every claim, across months.
- **Human** is cadence: acknowledging, not repeating, not making someone rephrase
  a greeting, noticing when a question has been revised.

Today's system is superhuman *within a turn* and has neither property *across*
turns. The premise's whole argument is that the second axis is where the value
is, and that it is scarcer than model capability.

## Ranked, and the order is different from the cadence document's

The cadence results ranked conversational turn types first. Against the premise
that is second, because it is a symptom.

1. **Give the beholder an identity, and persist against it.** Memory and chain
   heads keyed on a person, not a conversation, and surviving a restart. Nothing
   else on this list is worth much without it, and every current measurement is
   blind to it.
2. **Represent the turn types a conversation actually contains** — greeting,
   closing, acknowledgement, capability question, **correction**. Corrections
   matter most: today one silently produced a sealed wrong answer.
3. **Evaluate against a beholder, not a benchmark.** The 100-question test and
   the walk both score answers. A beholder-centric measure asks whether friction
   fell over a session, whether the user had to repeat themselves, whether
   anything established earlier had to be re-established.
4. Then the cadence fixes — refusal variation, politeness tolerance, the explain
   rule's classifier tier. Real, and cosmetic relative to the above.

## Correction owed

I could not find "beholder theory" when it was mentioned, searched for the word,
and reported it absent. It is `docs/concept/premise.md` — §1 is *The Beholder
Model* — sitting in five checkouts under `~/vscode`. The document was not hard
to find; I searched for a label rather than for the idea, then treated a failed
grep as evidence of absence. That is the same error as reading a blank result as
a pass, on the day it was recorded as the session's recurring failure.
