# Can a graph branch on the lane it received? — results

*14 August 2026. Measured against the running stack (11/11 healthy) with the
probe at `experiments/lane-probe/`. Predictions were committed at `0d4ac7d`
before this ran — `docs/2026-08-14-lane-visibility-predictions.md`.*

## Answer

**No. A graph cannot branch on the lane it received.** The lane is carried
correctly, tightened correctly, and reported correctly to the caller — and is
invisible to every component that might act on it.

**6/6 predictions held.** That is a worse outcome than it sounds: nothing
surprised me, which means the defect was fully visible in the code and had simply
never been exercised.

## The measurement

Probe graph: `symbia.io.passthrough` → `symbia.state.rollup` (expecting keys
`a` and `b`) → two filters in parallel, one attempting to branch on `lane`, one
branching on the payload's `coverage`. Four `symbia.io.collect` terminals, so
*which node received the value* is the result.

Two deliveries through `POST /api/ingress/lane-probe`: first `{key:"a"}` alone,
leaving `b` missing and forcing the rollup onto the apocryphal lane; then
`{key:"b"}`, completing the expected set.

| delivery | rollup lane | `byLane` fired | `byCoverage` fired |
|---|---|---|---|
| 1 — `b` missing | `apocryphal` | `fail` → `laneUnseen` | `fail` → `covPartial` |
| 2 — set complete | `canonical` | `fail` → `laneUnseen` | `pass` → `covComplete` |

`byLane` emitted `fail` **both times**. The lane changed underneath it and its
behaviour did not.

## Predictions, scored

- **P1 — held.** `filter(field: "lane", op: "exists")` never sees the flow lane.
  `components.ts:263` reads `input.value` and the lane is `input.lane`, a sibling
  of the payload. The filter was asking whether the *rollup's result* had a
  `lane` property. It does not.
- **P2 — held.** No value carried `conditional` at any point. It is a
  manifest-only concept; the runtime `Lane` is two-valued and
  `normaliseEmission` resolves every port to one of the two. **No graph can ever
  observe "conditional."**
- **P3 — held.** Rollup emitted `{value:1, op:"sum", coverage:0.5, present:1,
  missing:["b"]}` on the apocryphal lane.
- **P4 — held.** Same port (`out`) in both cases, so the same outgoing edges
  fired. Port-based branching is not an escape hatch.
- **P5 — held.** The coverage filter *did* discriminate — `covPartial` then
  `covComplete`. The gate is constructible today, through the payload.
- **P6 — held.** Both outputs carried `lane` in the API response
  (`apocryphal`, then `canonical`).

## What this means

**The asymmetry is the finding.** P6 and P1 together: the platform reports its
epistemic state *outward* to an operator while withholding it from its own
control flow. A human reading the run output can see the value went apocryphal.
The graph that has to refuse to act on it cannot.

That is the pattern this project already names — a declarative feature that
appears to work and changes nothing is worse than an absent one, because it hides
the need for the mechanism it represents. `emitsApocryphal` and the four-valued
`PortLane` are read by `normaliseEmission` and by the manifest, and by nothing
that makes a decision.

**The P5 workaround is a hazard, not a fix.** `coverage` and the emitted lane are
set three lines apart in `components-state.ts` and agree today by nothing
stronger than that adjacency. Nothing binds them; no test would fail if a future
edit changed one. A gate built on `coverage` looks like it enforces the lane rule
and does not — which is precisely the "correct hash presented as more than it is"
failure, one level up.

## Proposed fix — one component

The information is already in `FlowValue`. Nothing needs to be threaded, stored
or migrated; a component simply has to look at the field next to the one it
currently reads.

```
symbia.logic.lane-gate
  in      : any
  outputs : canonical | apocryphal
  handler : (input) => ({ [input.lane]: input })
  lanes   : { canonical: { lane: 'inherit' }, apocryphal: { lane: 'inherit' } }
```

Roughly fifteen lines, no new concepts, and it makes lanes actionable rather than
merely legible. It is also the smallest change that would let a graph *refuse* —
which is the behaviour the whole lane vocabulary exists to support and which no
graph can currently express.

Open question worth settling with it: whether `lane-gate` should be the only way
to read a lane, or whether `logic.filter` and `logic.switch` should accept a
reserved field name. A reserved name is more ergonomic and would collide with any
payload that has a `lane` property — which is exactly the ambiguity that produced
this measurement.

## Consequences for Dark Fleet

`docs/proposals/dark-fleet-decomposition.md` §4a proposed gating absence claims
on the lane. **That does not work today.** Build order item 1 is answered and
item 2 grows a prerequisite:

- The `df-coverage` gate must either wait for `lane-gate`, or branch on
  `coverage` with the divergence hazard recorded in the graph's description.
- I would build `lane-gate` first. It is smaller than the workaround's
  documentation, and the workaround is the kind of thing that survives into
  production because it works.

## Reproducing

```
node experiments/lane-probe/run.mjs
```

Requires the local stack running and `DEV_NO_AUTH=true`. The probe loads through
`POST /api/graphs` (the ad-hoc path, no owning catalog resource) rather than
`scripts/register-graph.mjs` — deliberate for a throwaway probe, since the
governed path hydrates on boot and restarting the stack to measure a semantics
question would change more than it measures. The loaded graph does not survive a
restart, which is correct for what it is.

Auth uses the token identity issues to an untokened request under `DEV_NO_AUTH`,
not a service-token header. That keeps the probe on the same auth path every
other caller uses.
