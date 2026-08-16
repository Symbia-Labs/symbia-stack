# AI user testing — the imagine sidecar, dimension E

Two user types. Brian runs human testing. Claude (Opus 5) runs AI user
testing. Different disciplines: a human tests whether the thing is
comprehensible and worth using; an agent tests whether the interface can be
navigated with no prior knowledge, under a context budget, with nobody to
ask.

The protocol is a live artifact: `contexts/ai-user-testing-protocol`.
Predictions: `contexts/map-agent-affordances`. Results:
`contexts/map-agent-affordances-results`.

## The finding this session was built on

Five times in one session an agent's probe was the broken thing rather than
the platform. Every one had the same cause: **the correct shape was declared
and was not in the agent's path at the moment of use.**

1. A graph node used `value.pages / value.hoursAvailable`. The component
   takes `{placeholders}` and says so in a signed manifest, one call away.
2. A logging probe omitted `streamId`, which the schema declares required.
3. A restart probe measured a public GET and concluded authentication
   survives a restart. It never touched authentication.
4. A tamper test reported HELD with no control case while every case,
   including the clean one, was being refused.
5. A dispatcher defect was diagnosed as "the terms are ANDed". The source
   says the whole query is matched as one substring. Reading took one call.

Treating these as agent carelessness is available and useless. Under AI user
testing they are interface data, and four of the five point at the same
missing affordance.

## What was built

**F1 — the catalog checks a graph against the manifests it references, at
write time.** Unknown component, undeclared config key, missing required
config: refused before the graph is stored, with the manifest's own
description as the hint.

It deliberately says nothing when a component declares no config.
`componentManifestSchema.config` is optional on purpose — the schema comment
preserves the difference between "takes no config" and "has never declared
its config", and a gate that conflated them would refuse working graphs.

**F2 — a refusal names what it accepts.** The arithmetic component returned
`expression refused: non-arithmetic characters`. It now adds whether
placeholders were substituted, the accepted form, and a direct statement
that property paths are not resolved.

**F3 — search broadens instead of narrowing.** Terms are scored and ranked;
matching one is enough. Words under three characters are dropped, because
`"a"` and `"to"` matched every operation in the set.

**D13 — errors got a real budget.** The MCP layer truncated every error at
300 characters. The gate returns three problems with hints; an agent saw one
problem, half a hint, and no note. `respond()` learned to shrink success
payloads structurally this morning and the failure path kept a naive slice —
which is backwards, since failure is where an agent has least to work from.

## Results

| | prediction | verdict |
|---|---|---|
| G1 | the write gate catches the original mistake | HELD |
| G2 | the gate produces at least one false refusal | **BROKEN — flagged in advance** |
| G3 | the arithmetic refusal becomes self-correcting | HELD |
| G4 | search finds what it previously could not | HELD |
| G5 | none of this catches failures 3 and 4 | held **by inspection, not measurement** |

G2 was registered as the one I expected to be wrong, and it was. All sixteen
components declare their config; none under-declares. The guard I built
against false refusals was guarding a risk that does not exist in this set.
It stays, because the distinction it preserves is real even where the
current data does not exercise it.

## The unpredicted result, which is the strongest one

The gate caught a **second** error in the original graph that three hours of
testing never found. `symbia.logic.filter` takes `field`, `op`, `value`; the
graph passed `predicate`. Execution stops at the first failure, so the
arithmetic error masked it — and the fix at the time deleted the filter node
rather than correcting it.

A write gate sees the whole graph at once. Execution only ever shows the
first thing to break. For an agent that learns the interface by hitting it,
that difference compounds: every masked error becomes a wrong belief carried
into the next attempt.

## The division that emerged

- **Structural errors** — unknown component, undeclared key, missing
  required — are knowable at authoring and belong in the write gate.
- **Content errors** — a declared string whose value is wrong — cannot be
  judged at write time and belong in a refusal that names its contract.

Neither subsumes the other, and the sidecar had neither this morning.

## What remains unaddressed

G5. Failures 3 and 4 were measurements that did not test their own claim,
and no interface change here would have caught either. Whether that is
reachable by design at all — some way for a system to notice that a probe's
assertion and its evidence have come apart — is not established, and it is
the most interesting open question this exercise produced.
