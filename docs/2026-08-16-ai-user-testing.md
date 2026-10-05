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

---

# Dimension G — can a system catch a measurement that could not fail?

The open question the previous section left. Two failures were invisible to
every affordance built: a tamper test reporting HELD while every case
including its unrun control was refused, and a restart probe claiming "the
shim survives a host restart" from a public GET that would have succeeded
either way. Both share one property: **the observation was compatible with
the prediction being false.**

Predictions: `contexts/map-discriminating-power`. Results:
`contexts/map-discriminating-power-results`.

## What was tried

A MAP prediction declares `{ claim, refutedBy }`. A MAP result declares
`{ verdict, observed }`. The catalog refuses a result reporting HELD with no
observation behind it. Popper as a write gate.

## What happened

| | prediction | verdict |
|---|---|---|
| H1 | the gate can be a catalog write rule | **BROKEN — flagged in advance** |
| H2 | replaying I3 is refused | HELD, weakly |
| H3 | replaying S1 is refused | HELD, weakly |
| H4 | it falsely refuses honest work | HELD |
| H5 | writing `refutedBy` changes what gets measured | HELD |

**H1 broke exactly where I said it would.** Replaying the restart result
with the inadequate observation it actually made returns 201. The check
sees a populated field, not a relevant one.

**H2 and H3 held for the wrong reason.** Both replays were refused for a
missing field, not for the flaw. Supply any string and both pass.

**H4 is the damaging one.** A genuinely honest result — *"HELD — the
arithmetic refusal went from OPAQUE to SELF-CORRECTING, it now reports…"* —
is refused, because its observation is prose rather than a separable field.
The gate rejects good records alongside empty ones.

## The design change

Refusal was tried, measured, and abandoned. It is theatre for the case it
targeted and harmful for the case it was not aimed at. It now **discloses**
— the same ruling already made for incomplete traces: hand back what is
there and name what is missing.

A MAP resource is stored either way and carries `mapDiscipline` when gaps
exist: the gaps themselves, and an explicit statement of what the assessment
cannot judge. A well-formed resource carries no annotation.

## H5, which is the finding worth keeping

Writing the refutation condition for S1 forces this sentence: *a write
through the same shim after a restart returns 401 or 403.* That is precisely
the measurement that was never made — and the one that, once made, exposed
the auth defect.

So the discipline works, and not where it was aimed. **A gate cannot judge
whether evidence bears on a claim. An author forced to state what would
refute a prediction runs a different experiment.** The value is at authoring
time. The check is, at best, a reminder that authoring happened.

That is a smaller claim than the one this section set out to make, and it is
the one the measurements support.

---

# The models service — four of five predictions broken

C4 from the capability suite: registered this morning, never run. Predictions
in `contexts/map-models-service` using the `{claim, refutedBy}` shape;
results in `contexts/map-models-service-results`.

**Imagine mode can pull a real model through the integrations service and
run local inference, entirely through MCP.** I predicted it could do none of
that.

```
POST /api/models/pull   TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF
  668,788,096 bytes through integrations
  sha256:9fecc3b3cd76bba89d504f29b616eedf7da85b96540e490ca5824d3f7d2776a0
  artifact.registered, signed, actor service:models:397a981a92654243

POST /v1/chat/completions  model tinyllama-1-1b-chat-v1-0-q4-k-m
  content "Verified"   10 prompt tokens, 3 completion
```

The receipted-pull path built in an earlier session had never executed in
imagine. The lineage event and the digest are on disk and checkable by
anything that can read a file.

| | prediction | verdict |
|---|---|---|
| M1 | zero local models | HELD — as a state, not a capability |
| M2 | inference fails | **BROKEN** |
| M3 | the failure names the absence of weights | **BROKEN — my expected-wrong** |
| M4 | MODELS_PATH exists and is empty | **BROKEN** |
| M5 | pull cannot complete without a credential | **BROKEN** |

M5 broke on a case I never considered: TheBloke's repositories are public,
so no credential was required at all. My model of the service was built from
its code and not from its behaviour.

## Three defects

**D14 — a timeout read as a failure.** The pull returned *"The operation was
aborted due to timeout"* after 15 seconds. It had not failed. It was
streaming, finished a minute later, wrote its lineage event, and the model
ran. This is the worst class of confident negative, because the wrong
conclusion is *actionable*: an agent reports the pull broken, and a retry
starts a 668 MB download for the second time.

Fixed. A timeout now says it is not a failure, names what to check, and says
not to retry blindly.

**D15 — `MODELS_PATH` was set and never created.** A pull opened a
`.partial` into a directory that did not exist; ENOENT surfaced as a 500.
One `mkdirSync`.

**D16 — a missing model returns 500 `server_error`.** The message
distinguishes absence from breakage; the status and type assert breakage. An
agent reading the status concludes the service is down. Recorded, not fixed.

## What this does not establish

One model, one quantisation, one public repository, one prompt. Nothing here
speaks to gated repos, credentials, larger weights, memory pressure in a
single process holding ten services, or concurrent inference.
