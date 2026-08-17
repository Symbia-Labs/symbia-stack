# Can a graph branch on the lane it received? — predictions

*14 August 2026. Predictions registered BEFORE measuring, per working
discipline 1. Numbers go in git first so a wrong one cannot be quietly
reinterpreted afterwards.*

**Why this matters.** `docs/proposals/dark-fleet-decomposition.md` §4a proposes
an absence gate: a claim about silence may only be made when the witness set
heard continuously. The mechanism was to be `symbia.state.rollup`, whose
manifest already says a partial total must not pass as the total — and then to
branch on whether the result arrived canonical or apocryphal.

If a graph cannot see the lane, the platform's central epistemic mechanism is
legible to a human reading a manifest and invisible to the graph that has to act
on it. That is the "declarative feature that appears to work and changes
nothing" pattern this project already names as worse than an absent one. So it
is measured before anything is built on it.

## What is known before touching anything

Read, not assumed:

- `runtime/server/src/executor/components.ts:25` — the runtime `Lane` type is
  **two-valued**: `'canonical' | 'apocryphal'`.
- `:27` — `FlowValue` is `{ value: unknown; lane: Lane }`. The lane is a
  **sibling of the payload**, not a field inside it.
- `:83` — the manifest `PortLane` type is **four-valued**:
  `inherit | canonical | apocryphal | conditional`.
- `:140` `normaliseEmission` maps port declarations onto a value's lane, and
  enforces tightening: apocryphal in, apocryphal out, never widened back.
- `:263` `symbia.logic.filter`'s handler is
  `const src = input.value as Record<string, unknown>` — it reads the payload
  and nothing else.
- `components-state.ts:268` — rollup emits
  `{ out: { value: payload, lane: 'apocryphal' } }` when inputs are missing:
  **the same port**, a different lane.
- `components-state.ts:201` — the rollup payload is
  `{value, op, coverage, present, missing}`.

## Predictions

**P1.** `symbia.logic.filter` configured `field: "lane", op: "exists"` does
**not** see the flow lane. Given an input whose payload has no `lane` key, it
emits on `fail` regardless of whether the value is canonical or apocryphal.

**P2.** `conditional` never appears on a value at runtime. It is a manifest-only
concept; `normaliseEmission` resolves every port to one of two values, so no
graph can observe "conditional" at all.

**P3.** `symbia.state.rollup` with one expected key absent emits on port `out`
with lane `apocryphal`, and its payload carries `missing` non-empty and
`coverage` < 1.

**P4.** Because rollup uses the **same port** in both cases, a graph cannot
distinguish them by port either — the same outgoing edges fire whether the total
was complete or partial. Port-based branching is not an escape hatch.

**P5.** The gate *is* constructible today, but only through the payload:
`filter(field: "coverage", op: "eq", value: 1)`. This is a workaround and not the
mechanism. **Nothing binds the payload's `coverage` to the emitted lane** — they
are set by the same component today and could diverge in any future edit with no
test failing.

**P6.** The lane is visible in the runtime's execution output (the sink path
already logs `input.lane` at `components-sinks.ts:143`), so an *operator* can see
what a *graph* cannot act on. If P6 holds alongside P1, the asymmetry is the
finding: the platform reports its epistemic state outward while withholding it
from its own control flow.

## What would change my mind

P1 fails if `logic.filter` special-cases a reserved field name, or if the
executor merges `lane` into the payload before dispatch. Neither appears in the
code read above, but the read was of `filter` and `normaliseEmission` only, not
of every path in `graph-executor.ts`.

## Measurement plan

Build the smallest graph that forces the question: a source, a rollup with a
deliberately absent expected key, and a filter attempting to branch on `lane`.
Run it on the local stack (11/11 healthy at time of writing) and record which
port fires. Report broken predictions as broken.
