# Do stateful components launder lanes? — results

*14 August 2026. Measured against the running stack with
`experiments/state-lane-probe/`. Predictions committed at `e484adf` before this
ran — `docs/2026-08-14-state-lane-laundering-predictions.md`.*

## Answer

**Yes. 5/5 predictions held.** A stateful operator emits the lane of whichever
delivery happened to trigger it, not the lane of the values it is aggregating. An
aggregate over apocryphal data is emitted canonical, silently, with no error and
no trace.

This is worse than D10. D10 means a graph cannot *act* on a lane. **D14 means the
lane is wrong** — so a transition ledger built on it would record a confident
fiction.

## The measurement

One ingress, a `logic.switch` routing on `route`, two paths into the **same**
`state.window` and the **same** `state.latest`. The `apoc` path passes through a
rollup expecting `["p","q"]` and receiving only `p`, which emits apocryphal
(established this morning). The `canon` path is a plain delivery.

**Delivery 1 — `{route:"apoc", key:"p", value:1}`**

```
winOut    apocryphal   {count:1, sum:1, mean:1, min:1, max:1, last:1}
latSnap   apocryphal   {sum:{key:"sum", value:1}}
```

Correct. The only value in each aggregate arrived apocryphal, and so did the
triggering message. The two readings agree, which is why this defect is
invisible in normal use.

**Delivery 2 — `{route:"canon", key:"fresh", value:2}`**

```
winOut    canonical    {count:2, sum:3, mean:1.5, min:1, max:2, last:2}
latSnap   canonical    {sum:{key:"sum", value:1}, fresh:{…, value:2}}
```

`sum: 3` and `mean: 1.5` are computed over the value `1`, which **entered the
window on the apocryphal lane**. They are emitted canonical.

The snapshot is the sharper artifact: it does not merely aggregate the
apocryphal value, it **displays it** — `sum:{key:"sum", value:1}` sitting beside
`fresh` in a payload marked canonical, under a manifest note that reads *"the
snapshot is as canonical as the messages that built it."*

## Predictions, scored

- **P1 — held.** Delivery 1 emitted `count:1` apocryphal. Control behaved.
- **P2 — held.** Delivery 2 emitted `count:2` canonical over a value that
  entered apocryphal. The laundering is real.
- **P3 — held.** `latest.snapshot` emitted canonical while containing an
  apocryphal-derived entry, contradicting its own note verbatim.
- **P4 — held.** No error port fired. Both deliveries returned HTTP 200 and
  looked entirely successful.
- **P5 — held.** Nothing in any payload records that an input arrived
  apocryphal. **The laundering leaves no trace whatsoever** — not in the value,
  not in the lane, not in an error. It is undetectable from the output alone,
  which is why it has survived since the operators were written.

## The pattern nobody had noticed

There are exactly three ports in the runtime declaring `lane: 'conditional'`:

| port | note |
|---|---|
| `state.latest.snapshot` | "as canonical as the messages that built it" |
| `state.window.out` | "only as canonical as the values that entered the window" |
| `state.rollup.out` | "a partial total must not pass as the total" |

**All three are state-carrying aggregates, and all three are the laundering
sites.** Every one of their notes states the correct rule, and not one
implementation can compute it, because the lanes of the contributing messages
were discarded at `state.set(...)`.

So in practice `conditional` has not been marking "decided by the data." It has
been marking **"the honest lane here is uncomputable with the current
machinery"** — an accurate instinct by whoever wrote those notes, recorded in the
one field that could not enforce it.

Rollup is the partial exception and deserves credit: it computes `missing`
independently, so its lane is right *for the missing-key case* by a mechanism
that does not depend on stored lanes. It is still wrong for the case measured
here — a complete rollup over values that arrived apocryphal emits canonical.

## Root cause — two independent gaps

1. **Storage discards the lane.** `components-state.ts:74, 128, 182, 247` all
   store `input.value`. A `FlowValue` goes in; a bare value is kept.
2. **Emission cannot express a set.** `graph-executor.ts:263` calls
   `normaliseEmission(raw, msg, …)` with the single current message. Even if the
   store kept lanes, there is no parameter through which a component could say
   "this output derives from these five contributions."

Fixing this inside the lane model means changing both: wrap stored values, and
widen the emission signature to take a contributing set, then fold with "lanes
only tighten" (min, never max). That is real work across every stateful operator,
and it is the honest floor if lanes stay per-value.

## What this does to the canonical bus

It is now **measured evidence for** `docs/proposals/canonical-bus.md`, not just
an argument for it.

Under that proposal the graph is apocryphal by construction, so there is no lane
to lose at `state.set(...)` and nothing to thread through the emission signature.
Every one of the three `conditional` ports stops needing a lane it cannot
compute. The defect does not get fixed; it stops existing.

That is the difference between the two responses, and it should be decided
deliberately rather than by whoever gets to the code first:

- **Repair the lane model** — wrap stored values, widen `normaliseEmission`,
  audit all four stateful operators. Keeps per-value lanes, costs real work, and
  leaves `conditional` meaning something the runtime still cannot fully express
  (it collapses to two values before anything downstream sees it — D10, P2).
- **Adopt the bus** — the graph is the apocryphal lane, certification comes from
  a deterministic substrate, and the three notes above are simply deleted.

I would not do the first as a stepping stone to the second. Threading lanes
through state is precisely the machinery the bus makes unnecessary.

## Consequences elsewhere

- `docs/proposals/canonical-bus.md` §10 **P2 is measured and held** — "at least
  one builtin declares a lane its implementation does not earn." It is three.
- Any Dark Fleet coverage gate reading a lane off `state.window` or
  `state.rollup` would have been reading a laundered value. The §4a design in
  `dark-fleet-decomposition.md` was already redirected to the payload
  (`coverage`) rather than the lane; that redirection turns out to have been the
  only workable choice, for a reason this measurement supplies.
- `energy/` and `order-margin` both aggregate through these operators. Neither
  currently *reads* a lane, so nothing downstream is wrong today — but every
  derived metric they have produced carries a lane that was never computed from
  its inputs.

## Reproducing

```
node experiments/state-lane-probe/run.mjs
```

Local stack running, `DEV_NO_AUTH=true`. Ad-hoc graph load and dev-issued token,
same caveats as `experiments/lane-probe/`.
