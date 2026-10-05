# Do stateful components launder lanes? — predictions

*14 August 2026. Predictions registered BEFORE measuring, per working
discipline 1. Second measurement of the day; the first is
`docs/2026-08-14-lane-visibility-results.md`.*

**Why this matters.** `docs/proposals/canonical-bus.md` §10 P2 predicts that at
least one builtin declares a lane its implementation does not earn. This
measures that specifically, for the stateful operators — the case flagged as D14.

If it holds, the consequence is worse than D10. D10 means a graph cannot *act*
on a lane. D14 means the lane is *wrong*, and a transition ledger built on top of
it would record a confident fiction.

## What is known before touching anything

Read, not assumed:

- `components-state.ts:74` — `state.set(String(key), input.value)`. The **value**
  is stored. The lane is not.
- `:128` (join) and `:182` (window) and `:247` (rollup) — same shape: bare values
  into the store.
- `graph-executor.ts:263` — `normaliseEmission(raw, msg, component.emitsApocryphal)`
  is called with the **single current message**. A stateful component's emission
  is therefore laned by whichever delivery happened to trigger it, not by the
  lanes of the values it is aggregating.
- `components-state.ts:63-70` — `symbia.state.latest`'s `snapshot` port declares
  `lane: 'conditional'` with the note: *"the snapshot is as canonical as the
  messages that built it."*
- `:164-169` — `symbia.state.window`'s `out` port declares `lane: 'conditional'`
  with the note: *"the aggregate is only as canonical as the values that entered
  the window."*

**Both notes state the correct rule.** Neither implementation can express it,
because the lanes of the messages that built the state were discarded at the
moment of storage. This is not a lane chosen wrongly — it is a lane the
implementation has no way to compute.

## The construction

One graph, one ingress, a `symbia.logic.switch` routing on a `route` field so a
single delivery boundary can reach two paths:

- **`apoc` path** — `symbia.state.rollup` expecting `["p","q"]` receives only
  `p`, so it emits **apocryphal** (measured this morning, P3 held). That
  apocryphal value flows into a shared `symbia.state.window`.
- **`canon` path** — a plain canonical delivery into the *same* window.

The window therefore aggregates one value that arrived apocryphal and one that
arrived canonical. Whatever lane its output carries is the answer.

A `symbia.state.latest` node is fed the same two paths (the apocryphal one
reshaped by `symbia.transform.map`, which is `inherit`, so the lane survives) so
the `snapshot` port can be checked against its own note.

## Predictions

**P1.** Delivery 1 (`route: "apoc"`): the window emits `count: 1` on the
**apocryphal** lane. The single value in the aggregate arrived apocryphal and the
current message is apocryphal, so both readings agree. This is the control.

**P2.** Delivery 2 (`route: "canon"`): the window emits `count: 2` on the
**canonical** lane — an aggregate whose `sum` and `mean` cover a value that
entered apocryphal. **This is the laundering.** The manifest note is violated
verbatim by the component that carries it.

**P3.** `symbia.state.latest`'s `snapshot` on delivery 2 is emitted **canonical**
while containing an entry built from an apocryphal message, contradicting its own
`conditional` note.

**P4.** No error port fires. Nothing in the system reports a problem; both
deliveries look entirely successful.

**P5.** Nothing in the emitted payload records that an input arrived apocryphal.
The laundering leaves **no trace at all** — not in the value, not in the lane,
not in an error. It is undetectable from the output alone, which is why it has
survived.

## What would change my mind

P2 fails if the executor tracks per-node input lanes somewhere I have not read —
`state-store.ts` is a binary in the working tree and was not read, only grepped.
If a stored value is wrapped rather than bare, P2 and P3 both fall and the finding
reduces to a documentation gap.

## Measurement plan

`experiments/state-lane-probe/`, same shape as the lane probe: ad-hoc graph load,
two deliveries through the declared ingress, report which lane each output
carries. Report broken predictions as broken.
