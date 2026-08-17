# step-weights spike — results

15 Aug 2026, late evening. Against the running models service (5098),
registry-resolved, all inference through `/v1/chat/completions`.
Predictions committed before each measurement (`e369209`, then the PS5/PS6
addendum before `03-cross-check` ran).

## Prediction outcomes: PS1–PS3 held, PS4a broken (the finding), PS5–PS6 held

**PS1 HELD.** The `say` step's digest pin resolved by content: one pin,
two registry ids (`child-q4km-run1`, `-run2` — byte-identical artifacts),
ambiguity recorded in the receipt, digest matches the live registry.

**PS2 HELD.** Constraint resolution picked `child-q2k` from the live
registry by the recorded rule, candidates recorded beside the winner.

**PS3 HELD.** 8/8 verification: every step signature verifies from the
chain file + sidecar key, the chain recomputes, steps are causally
linked, model-consulting steps name digests the live registry vouches
for, and the computed step names no weights — absence as claim.

**PS4a BROKEN, and it is the finding of the spike.** Three q2k samples at
temperature 1.2 answered **86 unanimously** (tax applied, discount
skipped). Same-model self-consistency did not fire precisely where it was
needed; the wrong answer flowed to the pinned formatter, which rendered
"The final price is $86." politely. Self-consistency is not correctness —
a model can be reproducibly wrong, and reproducible wrongness is invisible
to a consensus of one substrate. (The receipt recorded every sample and
the non-escalation, so the failure is legible after the fact — the
receipts worked; the trigger design did not.) PS4b consequently
unmeasured.

**PS5 HELD.** One greedy answer per substrate: q2k 73.68, q4km 73.44, f16
73.44. Weight heterogeneity surfaced the error that homogeneous sampling
hid. Note the texture: at temperature 0, q2k gets the METHOD right and
slips the arithmetic (73.68) — the literature's execution-error signature
— where its high-temperature samples got the method wrong consistently.

**PS6 HELD.** The computed verifier (80 × 0.85 × 1.08 = 73.44, no model)
refuted q2k and verified the other two. Where a step's claim is checkable,
checking dominates any consensus.

## Design consequences for per-step weights in the assistants engine

Escalation triggers, ranked by what was measured:

1. **Computed verification** when the claim is checkable (arithmetic,
   unit conversion, anything `symbia.compute.*` can redo). This is the
   canonical-bus thesis at step scale: the apocryphal step's output gets a
   canonical check.
2. **Cross-substrate disagreement** — a panel across different weights
   (cheap: one greedy call per substrate beats k samples of one model,
   and it caught what sampling missed).
3. **Same-model self-consistency** — weakest; measured failing exactly
   when needed. Usable as a cheap first filter, never as the sole gate.

What held throughout: per-step resolution modes (pin-by-digest,
constraints-with-recorded-rule), and step receipts that name the bytes.

## Platform deficiencies collected

- Chat API has no `seed` — samples unreproducible (registered up front).
- Registry entries carry no `bytes`/`precision`/quant field, so the
  constraint vocabulary is thin; "prefer smallest" is unanswerable today.
- No broker-side resolve endpoint — selection logic lived in the spike;
  by the 12 Aug ruling it belongs in the models service.
- The assistants engine has no per-step `llm` override, and step identity
  (2026-08-11 review) blocks digest pins on real routines — explicit step
  ids in this spike's routine.json are the demonstration of what is
  needed.
