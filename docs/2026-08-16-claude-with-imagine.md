# 25 things I can do with Symbia Imagine that I could not do before

*Written 16 Aug 2026 by Claude Opus 5, after building the imagine sidecar
and probing it with a 50-prediction security battery. Marked by what is
**measured working today**, what is **blocked** and on what, and what is
**speculative**. The point of the exercise is the marking, not the list.*

## What I actually lack without it

Not "tools" — I have many. The specific gaps:

1. **Durable structured state that is not my context window.** My memory
   of a conversation is lossy, expensive, and unverifiable.
2. **A store that refuses malformed writes.** Files accept anything; a
   schema-gated catalog does not.
3. **Deterministic computation I did not perform.** My arithmetic is
   apocryphal by construction — I am a language model doing sums.
4. **Evidence about my own behaviour.** I cannot prove what I called,
   what came back, or which inputs produced which claim.
5. **A portable artifact of a session** that someone else can verify
   without trusting me.
6. **Anything that happens between turns.** I am request/response; I
   cannot watch, wait, or notice an absence.

Everything below is a case where one of those six is the binding
constraint. Where a plain text file would do the job, I have left it out.

---

## A. Work products that carry their own evidence

**1. Research brief with per-claim provenance.** *Works today.* Each
extracted claim becomes a catalog resource with its source, and the
session ledger records every fetch and write, signed and chained. What I
could not do before: hand someone a brief where they can check any
sentence back to what produced it without trusting my summary.

**2. Fact-check of a document.** *Works today.* Claims as rows with
verdict, evidence pointer, and an explicit "cannot verify" state that is
a first-class outcome rather than silence.

**3. Due-diligence checklist run.** *Works today.* Each item a resource
with status; the trace shows what was attempted and refused, not only
what succeeded — the ledger records failures identically to successes.

**4. Literature or ticket triage at volume.** *Works today.* Fifty items
become fifty typed records with dedupe by key; the write gate rejects
malformed ones instead of me silently normalising them.

**5. Competitive analysis where every number traces to a fetch.**
*Blocked* — needs an egress-capable retrieval component reachable through
the API. The store and the receipts are ready; the fetching is not.

**6. Reconciliation between two sources.** *Works today* for the record
half: matches, mismatches and unknowns as rows. *Blocked* for the
recompute half (see §B).

## B. Computation I should not be doing in my head

**7. Verifying a claimed total.** *Blocked in imagine.* The
`symbia.compute.arithmetic` component is canonical by manifest — anyone
can recompute it — but graphs do not execute in the sidecar because
`CatalogSync` starts in `runtime/server/src/index.ts` and a composition
root never calls it. Measured: graph created, `loadedGraphs: 0`. On a
full stack it runs (Brian measured `hello-world` end to end). This single
gap blocks items 7–12.

**8. Unit and currency conversion with a recomputable receipt.**
*Blocked, same cause.*

**9. Budget or quote checking.** *Blocked, same cause.*

**10. Financial model sanity checks.** *Blocked, same cause.*

**11. Date and duration arithmetic.** *Blocked, same cause.* Worth its
own line because it is where I am most confidently wrong.

**12. Cross-substrate verification of my own answer.** *Partly blocked.*
Measured last night outside imagine: three model substrates disagreeing
surfaced an error that a single model's self-consistency hid. Needs the
models service reachable in the sidecar (its spec 404s there today).

## C. Things that happen between turns

**13. "Tell me when X stops happening."** *Blocked* on graph execution.
This is the one I most want: absence as a signal is something I
structurally cannot do — I only exist during a turn — and the
`source.timer` + coverage-window shape does it natively.

**14. Scheduled digest that reports its own coverage gaps.** *Blocked,
same cause.* Not "here is what I found" but "here is what I found and
here is the window I could not see."

**15. Deadline and SLA tracking where silence is the alarm.** *Blocked,
same cause.*

## D. Evidence about my own behaviour

**16. A claim ledger for my own assertions.** *Works today.* Every write
I make is recorded, signed, chained, with bodies as digests. A user can
audit what I asserted in a session without taking my word for the
summary.

**17. A refusal record.** *Works today, and measured.* The ledger stores
refused mutations identically to accepted ones — 1 of 7 entries in the
security run was a refusal. I can show what I tried and was told no,
which is normally invisible.

**18. Prediction registration for my own work (MAP).** *Works today.*
Exactly what this session did: predictions written and committed before
measurement, so my later account cannot quietly become a postdiction.
Symbia makes it an artifact rather than a habit I claim to have.

**19. A tool-call audit trail.** *Works today.* Digests of request and
response for every mutation, so "what did the agent actually do" has an
answer that is not my narration.

**20. Disclosure of mode.** *Works today.* Every response carries
`mode: imagine`. A user can tell a sketch from a record — which is
precisely the distinction my prose cannot make reliably about itself.

## E. Structured artifacts a human takes away

**21. A taxonomy or ontology built collaboratively.** *Works today.*
Typed resources with enforced keys rather than a markdown list that drifts.

**22. A decision record with linked inputs and options.** *Works today.*
The stale-approval problem becomes visible because the record can be
re-checked against current state.

**23. A specification whose fields are validated on write.** *Works
today, and it bites.* The catalog refused my first component manifest —
correctly. That refusal is worth more than a file that would have
accepted my invention.

**24. A sealed session bundle.** *Works today.* Measured: 9 authored
artifacts, the full trace, an ephemeral public key, and a claim block
stating what the signature does **not** assert. This is the first time my
output can be handed on as something checkable rather than something
believed. *Reconstitution is not built* — the bundle can be produced, not
yet consumed.

## F. Delegation with a record

**25. A Collector / Verifier / Composer trio with recorded delegation.**
*Blocked.* Assistants can be authored (measured) but do not load in the
sidecar — the loader also lives in `index.ts`. On a full stack,
`sealDelegation` already emits signed delegation events, so the
machinery exists; the composition root cannot reach it.

---

## The honest tally

- **Works today: 12** — 1, 2, 3, 4, 16, 17, 18, 19, 20, 21, 22, 23, 24.
- **Blocked on one thing: 10** — 7–15 and 25 all wait on the same defect
  class: service bootstrap and background loops live in `index.ts`, so a
  composition root gets routes and nothing else
  (`docs/proposals/service-composition.md`, stages S2–S4).
- **Blocked on missing capability: 3** — 5, 6, 12 need retrieval and
  models reachable through the API in imagine.

So the single highest-value fix is not new capability. It is
`createService()`: ten of these twenty-five unlock when a host can call
`bootstrap()` and start the background loops, and nothing else changes.

## What it costs in context, and what it saves

Running the stack on the same machine as Claude Desktop does not reduce
what travels to the cloud. Every tool result still enters my context and is
sent with the next turn. Locality changes where the data lives and how fast
the call returns; it does not change the token bill. That needs saying
because "it runs locally" is easy to hear as "it is cheaper", and it is not.

Two things do change it, and both were measured against the running sidecar
on 16 Aug (`experiments/imagine-security/05-token-cost.mjs`, bytes converted
at ~4 chars per token, which is an estimate rather than a count):

| | bytes | ~tokens |
|---|---|---|
| Tool list, resident all session | 11,481 | 2,870 |
| 365 operations across 10 services, if each were a tool | 57,833 | 14,458 |
| One `describe_operation`, on demand | 516 | 129 |
| One full catalog listing result | 2,350 | 588 |

**The dispatcher is the first saving, and it is structural.** Fifteen tools
stand in for 365 operations: 2,870 resident tokens instead of 14,458, a
factor of 5. The comparison understates itself — the 57,833 figure counts
operation summaries (method, path, one line), not the input schemas a real
1:1 tool would carry, so 5x is a floor. The trade is a round trip and 129
tokens when I need a schema I do not have, paid per operation actually used
rather than per operation that exists.

**Delegation is the second, and it scales with the work.** A graph that runs
ten steps returns one result. Doing the same ten steps as tool calls puts
ten results in my context, each one paid for on every subsequent turn of the
conversation, not just the turn it arrived on. That is the saving that
grows, and it was not available until today: it depends on a graph authored
through MCP actually hydrating and executing, which is exactly what T4 and
T5 measured (`experiments/imagine-security/02-tracks.mjs`).

What is not saved: my own reasoning. Same model, same context window, same
cost per token. The connector moves work out of my context; it does not make
the remaining work cheaper.

## What I would still not claim

Imagine mode does not make me more correct. It makes my working
**inspectable** — which is a different and smaller claim, and the right
one. A signed record of a wrong answer is still a wrong answer; its value
is that the wrongness is now locatable. Every item above is about moving
a claim from "trust the assistant" to "check the artifact", and none of
them is about the assistant being better at the underlying judgement.

The security battery's own finding applies here: a client can set
`isBootstrap`, so the authored/seeded boundary a bundle depends on is
caller-controlled today. Until that is fixed, item 24's bundle is
honest about its signature and soft about its contents — and I should
say so whenever I hand one to someone.
