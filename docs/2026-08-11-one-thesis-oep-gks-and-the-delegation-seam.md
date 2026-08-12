# One thesis: OEP, GKS, CEB/AEB, and the delegation seam

*11 August 2026. A **finding**. Sources are the OEP and GKS specs in
`~/vscode/open-epistemic-protocol` and `~/vscode/genesis-key-spec`, the CEB/AEB
lane model in `~/vscode/docs/architecture`, and today's measured results in
`docs/2026-08-11-three-assistant-results.md`. Where something is argued rather
than observed, it says so.*

`docs/2026-08-10-lanes-claims-and-lineage.md` established that port lanes,
provenance arenas and observer claims are the same idea at three scales,
descending from GKS Lineage and OEP. This extends that to five scales, and
reports two things today's work changes about the picture.

---

## 1. The same distinction, five times

| scale | canonical side | apocryphal side | how they bind |
|---|---|---|---|
| **bus** — CEB / AEB | Canonical Event Bus: authoritative, hash-chained, append-only | Apocryphal Event Bus: advisory | `canonical_event_id` on the AEB event |
| **port** — `portLanes` | `canonical`: recomputable from the graph | `apocryphal`: cannot be recomputed | `inherit` / `conditional`; lanes only tighten |
| **reply** — arenas | `COMPUTED`, `RETRIEVED` | `COMPOSED`, `GENERATED` | `basis`, and the envelope hash |
| **capture** — claims | `asserts` | `does_not_assert` | per-track binding hash |
| **delegation** — *new today* | what the specialist computed | who the coordinator chose, and by what | `delegation: <hash>` in the reply's hashed body |

The last row was built today without reading the CEB/AEB docs first, and it
arrived at the same construction: **an advisory record, sealed separately,
referenced from the authoritative one by hash.** `delegation: <hash>` on a reply
envelope is structurally `canonical_event_id` on an AEB event, pointing the
other way.

That is convergent evidence the abstraction is real rather than a story told
after the fact. It is also an argument for making the two the same shape and
the same field name, so a CEB consumer and an envelope consumer are reading one
pattern instead of two dialects of it. **Argued, not built.**

## 2. The platform was violating OEP Layer 0 at its most important seam

GKS `alignment-oep.md` §2 is explicit about the stack:

```
Layer 2 — Symbia Execution Engine
Layer 1 — GKS (identity, continuity, constraint sets, lineage, roles)
Layer 0 — OEP (epistemic boundaries, claim classes, enforcement rules)
```

> GKS **never weakens or bypasses** OEP rules.

OEP `enforcement-rules.md` §5 is **No Narrative Patching**: when a reasoning
chain reaches a missing observation, the system must not paper over it.

Until today, a delegated reply was sealed:

> `COMPUTED` — content produced by `math.evaluate`; no model involved.

Every word of that was true, every hash was sound, and it was a complete-sounding
narrative laid over a chain with a **model-made, non-reproducible choice excised
from the middle of it**. The routing decision was recorded and then discarded,
because sealing lives inside `message.send` and a delegating coordinator sends
nothing.

That is narrative patching, at Layer 0, in the artifact whose entire purpose is
Layer 0 compliance. It is the same failure `does_not_assert` exists to prevent
one scale down — the reason a single "verified" badge across capture, upload and
retrieval would be *false while every hash in the system was sound*.

The fix now on every delegated reply:

> Reached this assistant because coordinator chose it via `claude-sonnet-5`;
> that choice is recorded in this envelope's delegation and is NOT reproducible.

Read against OEP enforcement, that sentence is doing three specified jobs at
once: §2 Hypothesis Labeling (it is marked as a choice, not a fact), §3
Provenance Requirements (it names the source), and §1 Fabricated Access
Forbiddance (it states the limit rather than implying certainty). It was written
to be honest and it landed on the spec.

## 3. Arenas are not claim classes, and the gap is the roadmap

**Observed:** the five arenas and OEP's five claim classes are different lists.
**Argued:** mapping them names work that is currently invisible.

| arena | nearest OEP claim class | what OEP requires |
|---|---|---|
| `COMPUTED` | Publicly Verifiable Knowledge (formal/mathematical) | provenance — **met** |
| `RETRIEVED` | Observable Input / PVK | source, recency, contested status — **partly met**; recency and contested status are absent |
| `COMPOSED` | PVK over supplied material | per-claim provenance. This is the claim-by-claim scorecard `2026-08-08-messaging-guide.md` names, and **nothing builds it**. `provenance.ts` says so in its own header: whether the model represented the material faithfully is *not checked here* |
| `GENERATED` | Hypothetical Inference at best; **Unobservable State** at worst | Hypothetical: explicit labelling and **at least two alternatives**. Unobservable State: **forbidden, must be rewritten** |
| `REFUSED` | — | this *is* OEP's prescribed rewrite: *"I cannot observe this; here are possible explanations"* |

The sharp one is `GENERATED`. `provenance.ts` already refuses to hide it behind
the other four, and says it exists "because that is what most replies currently
are". Stated in OEP terms, that comment reads: **most replies are Layer 0
non-compliant.** Not a criticism of the code — it is what makes `GENERATED` a
work queue rather than a label.

Concretely, OEP requires a `GENERATED` reply to carry at least two alternatives
and explicit uncertainty, or be rewritten as `REFUSED`. Today it carries a
`basis` string and nothing else. That is buildable and it is specified.

## 4. The routing classifier is in the Interpreter slot, and it cannot be there

This is the strongest thing to come out of reading the specs against today's
measurements.

GKS `pipeline/interpreter.md` — the role that maps observations into claim
classes, sitting between Observer and Processor:

> **2.1 Non-Generative.** The Interpreter must never generate new claims.
> **2.2 Declarative Classification.** All classifications must be explicit and
> **reproducible**.
> **2.3 No Inference.** No assumptions about intent, gaps, or missing context.

`coord-orchestrate`'s `step-classify` is an `llm.invoke` that reads the user's
message and decides which specialist it belongs to. **That is classification —
Interpreter work — performed by a generative model.** It violates 2.1, 2.2 and
2.3 by construction.

And 2.2 is not theoretical here. Measured across four passes of the same eight
prompts, with no change between them:

- `2+2` → held, then broke twice, then held
- `15% tip on $47.50` → held, broke, held
- failure mode: an empty completion on a three-character prompt

So "the classifier is flaky" is not a bug report. It is a **role violation**
producing exactly the symptom the role's constraints exist to prevent. A better
prompt does not fix a component sitting in the wrong slot.

**What the specs imply instead — argued, not built.** `embedding.route` is
already registered and has never had a caller. Embedding similarity with a
threshold is declarative and reproducible: the same message yields the same
scores. That is an Interpreter. The model becomes the Processor-grade fallback
for genuinely ambiguous input, and the delegation record already has the field
to say which decided — `decidedBy` currently reads `claude-sonnet-5` and would
read a threshold instead when the deterministic path resolved it.

That would move routing from apocryphal to canonical for the common case, which
is the same move `rollup` makes when `missing` is empty. **Lanes only tighten**
applies: a routing decision that fell back to the model must not be reported as
if the deterministic path had settled it.

## 5. Today's credential bug was an Observer failure

GKS `pipeline/observer.md`: the Observer *"determines what the system can and
cannot see"*, *"binds observations to identities"*, and is *"the first and
strongest defense against epistemic violations."*

The defect fixed today in `integrations/server/src/auth.ts` was precisely this:
the middleware resolved the org, used it for RLS, and dropped it before the
handler, so an agent principal could not see a credential it was entitled to
see. The access boundary computed the right answer and failed to bind it to the
identity.

Worth naming because it is the second time this session that a defect turned
out to be a role confusion rather than a coding error, and because the
user-visible symptom — *"Add an API key in Settings"* — was itself an OEP §1
violation: the system asserted something about the operator's configuration
that it had not observed and could not observe.

## 6. Where this leaves the thesis

`docs/2026-08-10-lanes-claims-and-lineage.md` §6:

> **The logbook is canonical about material that is apocryphal.**

That still holds, and today extends it one clause. A conversation crossing two
assistants is now canonical about *who decided*, while remaining honest that the
decision itself was not recomputable. The record does not become more certain by
covering more ground — it covers more ground while saying exactly as little as
it can support.

GKS Lineage §9 states requirements for a serialization and declines to supply
one; `@symbia/crypto` fills that with RFC 8785, ed25519 and ISO-8601. **And
`seal()` does not use it.** Reply and delegation envelopes are hashed with
`JSON.stringify` and `sha256(body ‖ secret)`. Restated at this level that is not
a code smell — it is the execution engine failing to use its own Layer 1
conformance profile, in the one artifact that most needs it.

## 7. Next, ordered by the thesis rather than by convenience

1. **`does_not_assert` on the delegation record.** `claims.ts` made it a field,
   not commentary, for exactly this reason. A delegation asserts that
   coordinator chose calculator via a named model. It does **not** assert the
   choice was correct, nor that the same input would produce it again.
2. **Deterministic Interpreter for routing.** Give `embedding.route` its first
   caller; model as fallback; `decidedBy` records which.
3. **`GENERATED` must carry alternatives and uncertainty, or be rewritten
   `REFUSED`.** OEP enforcement §1 and §2, currently unimplemented.
4. **Canonical JSON in `seal()`.** Same construction as the lineage profile, and
   fix `network/server/src/services/policy.ts` with it rather than beside it.
5. **Align `delegation` with `canonical_event_id`** so the bus and the envelope
   speak one dialect.
