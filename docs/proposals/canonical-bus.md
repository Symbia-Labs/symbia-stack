# Proposal — the canonical bus

*14 August 2026. A **proposal**, to be argued with. **PAPER** in this repo.*

**Prior art, and it is ours.** This is not a new idea and this document should not
have been written as though it were. The Canonical Event Bus is specified in
*Commit-First Event Substrates for Probabilistic Decision Systems* (preprint,
Jan 2026, `~/vscode/symbia-website/content/preprints/`), where §4 presents CEB as
the reference implementation of a commit-first event substrate. A working stub
exists at `~/vscode/canonical-event-bus/` (Dec 2025) — append-only hash-chained
log, rebuildable projections, decisions from projections only, monotonic time.
The authority model it serves is in `~/vscode/symbia-seed/docs/axioms.md`
(CEB/AEB, "AEB may propose or inform; CEB alone may decide and authorize") —
the same file `runtime/.../components.ts:14` already cites for the lane
vocabulary.

What is new here is only the *application*: applying CEB's separation to the
runtime's graph execution, so the graph is the apocryphal medium and
deterministic work is certified on the bus. Read the preprint first; several
questions this document raises are answered there.

*Prerequisite reading: `docs/2026-08-14-lane-visibility-results.md` (measured),
`docs/2026-08-10-lanes-claims-and-lineage.md` (the conceptual spine), and
`docs/proposals/wasm-runtime.md` §4, which contains this idea without naming it.*

---

## 1. The decision

**The graph is the apocryphal lane.** Not a medium in which values carry lane
labels — a medium that *is* unverifiable, by construction, because it is where
the platform touches the world.

**Alongside it runs a canonical bus**: a substrate where deterministic work is
performed deterministically and returned to the graph as a *certified token*
carrying the highest trust the platform can offer.

Per-value lane labels inside the graph then stop being the mechanism. The only
thing worth recording is the **boundary crossing** — and unlike a lane
transition, a boundary crossing is enumerable from the graph definition before
anything runs.

## 2. The admission criterion is already in the codebase

`docs/proposals/wasm-runtime.md` §4, written 13 Aug about the Component Model:

> **imports predict the provenance lane**: a component that imports nothing is
> `canonical`; one that imports the filesystem is `apocryphal`. That is a static
> read off the manifest, before execution.

That is the bus admission criterion, stated a day early and filed as an
observation about WIT. **A component with an empty import set is bus-eligible.**
Its output is recomputable precisely because it had no way to reach anything that
could differ between runs.

The `experiments/add-component/` spike already demonstrated the consequence: the
same manifest satisfied by a TS handler and a 41-byte wasm module, agreeing
bit-for-bit including `0.1 + 0.2`, **both emitting canonical because both are
recomputable**. Substrate-interchangeability is not a curiosity; it is evidence
that canonical is a property of the *function*, not of who wrote it.

And `experiments/file-tool-component/` showed the enforcement mechanism: with its
import unwired the module **cannot instantiate** — "authority absent, not
denied." Determinism on the bus is not a policy anyone applies. It is the
absence of a door.

## 3. Admission — three conditions, all statically checkable

1. **No ambient authority.** Empty import set: no clock, no entropy, no I/O, no
   network, no filesystem, no ordering dependence.
2. **Pinned module identity.** The artifact's SHA-256 is part of the receipt.
   Without it, "canonical" degrades silently on the next deploy and nothing
   fails — the worst available failure mode.
3. **Totality, honestly declared.** A computation that cannot produce a result
   must refuse, and **a refusal is apocryphal**. The precedent is already in the
   tree: `symbia.compute.arithmetic` returns `Infinity` and `NaN` on the error
   port, apocryphal, under the comment *INFINITY IS NOT A MEASUREMENT.*

Note what condition 1 does **not** require: wasm. `symbia.compute.arithmetic` is
bus-eligible today — its `Function()` call is fenced by
`/^[\d\s+\-*/().]+$/`, an allowlist admitting digits, whitespace and five
operators. No identifiers, therefore no `Date.now`, no `Math.random`. It is
deterministic by construction, in TypeScript, right now.

**So bus v0 ships with builtins only and needs nothing from the wasm proposal.**
What wasm buys is admitting code we did not write — see §9.

The loophole to close deliberately: `implementation: "expression"` is described
in the enum as "sandboxed JS expression." Arithmetic's allowlist is not a
property of that enum value, it is a property of that one component. A general
expression substrate must not be bus-eligible on the strength of one careful
sibling.

## 4. The token

A bus result returns a receipt, and the receipt is a lineage event:

```
inputs_digest   sha256 over canonical JSON (RFC 8785) of the arguments
module_digest   sha256 of the artifact that ran
output_digest   sha256 over canonical JSON of the result
evaluator       the identity that performed it
```

Three digests, because *recomputable* means **same inputs + same code ⇒ same
output**, and dropping any one of the three makes the claim unverifiable. This is
the "highest trust for that token of data" — trust in the token, not in the
conclusion drawn from it.

## 5. `claims.ts` gains a fourth observer

The existing three all observe something that *arrived*. This one observes
something that was *derived*, and it is the only member of the vocabulary that
asserts reproducibility:

```ts
computation: {
  asserts:
    'This module, given exactly these inputs, produced these bytes, and will produce them again on any conforming runtime.',
  does_not_assert:
    'Anything whatsoever about whether the inputs were true, well-measured, or honestly reported. A faithful computation over a forged reading is a faithful computation, and this records it exactly.',
}
```

The `does_not_assert` line is the whole safety argument of this proposal
compressed into one field, which is what that field is for.

## 6. What it resolves

Four open items stop needing individual fixes:

- **D10** (a graph cannot branch on a lane — *measured, confirmed*) becomes far
  less urgent. Branching on a lane matters when lanes are how you distinguish
  values. Here, the distinction is *which substrate ran it*, which is visible in
  the graph definition. `symbia.logic.lane-gate` is not needed for this.
- **D13** (may an ingress declare its lane?) dissolves. Inbound delivery lands in
  the graph, and being in the graph *is* the statement. Nothing to declare.
- **D14** (stateful components launder lanes) dissolves. **Now measured, not
  supposed** — 5/5 predictions held, `docs/2026-08-14-state-lane-laundering-results.md`.
  State inside the graph is apocryphal by definition, so there is no lane to lose
  at `state.set(...)` and no need to widen `normaliseEmission` to carry a
  contributing set. All three `conditional` ports stop needing a lane they cannot
  compute. The defect is not fixed; it stops existing.
- **The transition-instrumentation problem** inverts. I had proposed
  instrumenting `normaliseEmission` to record canonical→apocryphal flips at
  runtime. Under this model the transitions *are the bus boundaries*: countable
  from the graph before execution, and a change in the set is a diff, not a
  telemetry stream.

That last one is the strongest argument for the proposal. **A property you can
read off a definition beats one you have to observe.**

## 7. The failure mode to design against

**The bus certifies the function, not the argument.**

A bus return introduces a new certified token *alongside* the apocryphal flow.
Any node merging the two emits apocryphal — lanes only tighten, unchanged. The
predictable misreading is that a graph whose last hop was on the bus has produced
a canonical *conclusion*. It has produced a canonical *computation over
apocryphal inputs*, which is a different and much weaker thing.

This is the forged-clip failure on a new surface, and it is a UI invariant before
it is anything else: **a bus receipt must never render without the provenance of
its inputs beside it.** A green tick on a faithful multiplication of two invented
numbers is exactly the defect `claims.ts` exists to prevent.

## 8. What it does to the lane enum

`PortLane` is currently `inherit | canonical | apocryphal | conditional`, and
`conditional` has always been the awkward member — an "it depends" that the
manifest requires a `note` to excuse.

Under this model it reads naturally: **`conditional` means the component decides
whether to route through the bus.** The `note` says on what basis, which is what
it was always supposed to do.

And `symbia.state.rollup` becomes structurally enforceable rather than declared.
Its rule — *a partial total must not pass as the total* — currently holds because
the handler chooses to emit apocryphal when `missing` is non-empty. On the bus,
you simply **cannot obtain a receipt for a total you could not compute**: the
inputs digest would not cover the missing keys. The most quoted line in the
manifest stops depending on a component author's good behaviour.

## 9. Cost, and what is genuinely open

- **Two substrates to operate**, and a decision when the bus is unavailable:
  proceed uncertified, or refuse? Proceeding is right for availability and wrong
  for the promise; my inclination is refuse-by-default with an explicit
  per-graph opt-out, but this is not settled.
- **Optionality.** If an author may choose whether identical arithmetic goes
  through the bus, two structurally identical values will differ in provenance
  grade. I would make this visible rather than fix it — it went through the bus
  or it did not, and the graph shows which.
- **Async.** Bus work must be synchronous or at least suspension-safe to stay
  deterministic. This is the same unknown as `wasm-runtime.md` §6.4 and does not
  get easier here.
- **Non-determinism that looks deterministic.** Floating-point across
  architectures, map iteration order, and canonical-JSON edge cases. The
  `add-component` spike agreeing on `0.1 + 0.2` is encouraging and is one data
  point on one machine.

## 10. Predictions — register before building (MAP)

1. **Every current builtin can be classified bus-eligible or not from its
   manifest alone**, with no appeal to its implementation. *Risk: `emitsApocryphal`
   is a hand-set boolean and may not agree with an import-set reading.*
2. ~~**At least one builtin is misclassified today** — declaring a lane its
   implementation does not earn.~~ **MEASURED 14 Aug, held. It is three.**
   `state.latest.snapshot`, `state.window.out` and `state.rollup.out` — every
   port in the runtime declaring `conditional`. All three are state-carrying
   aggregates whose notes state the correct rule and whose implementations
   cannot compute it, because the contributing lanes are discarded at
   `state.set(...)`. A window aggregating one apocryphal and one canonical value
   emits **canonical**, with no error and no trace.
   Full record: `docs/2026-08-14-state-lane-laundering-results.md`.
3. **Bus v0 needs no wasm.** The set of bus-eligible builtins is non-empty and
   includes `symbia.compute.arithmetic`.
4. **Receipt overhead is dominated by canonical JSON**, not by hashing.
5. **The transition set of every existing graph is derivable statically** and is
   smaller than the number of nodes.

Report the broken ones as broken.

## 11. Relationship to `wasm-runtime.md`

**This is that proposal's load-bearing argument.** It currently argues isolation
for the code-tool: A1 stops being a security finding. True, and narrower than
what the mechanism supports. The stronger claim is that a capability-scoped,
host-mediated substrate is *the only substrate on which "canonical" can mean
anything* — because the property that makes wasm safe (no ambient authority) is
identically the property that makes a computation replayable.

Its §8 step 4 — "decide whether to go further, only if provenance *uniformity*
becomes a product promise" — is the same decision as this document. The canonical
bus is what provenance uniformity looks like when you build it.

The kill criteria interact and should be read together: if the jco ergonomics
probe fails, the bus does not die. It narrows to first-party pure builtins, which
is where it starts anyway.
