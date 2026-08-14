# Proposal — the `wasm` component runtime

*13 August 2026. A **proposal**, to be argued with. The only evidence behind it
is two throwaway spikes under `experiments/`; neither runs inside the real
runtime service. Read §6 before believing §1.*

---

## 1. The decision

Implement the `wasm` value of `ComponentRuntime` — the enum in
`runtime/server/src/executor/components.ts` already lists
`builtin | expression | wasm | integration | remote-service`, and `wasm` has
been a declared-but-empty value the whole time. Give it a backend, so a
component can *opt in* to running as a wasm module when that is worth its cost.

**This is not a migration.** The runtime service stays TypeScript on Node. The
registry, the executor, the `ComponentDefinition` interface, and the 16 builtin
components do not change. The first — and possibly only — component to use the
`wasm` runtime is the code-tool (the A1 finding). Trusted first-party glue
(`map`, `filter`, `passthrough`) stays `builtin`, because that is where TS
genuinely wins and an ABI boundary would buy nothing.

The claim is narrow: *one enum case gets a backend, the code-tool uses it, the
rest of the platform is untouched.*

## 2. The premise that expired

The platform was built in TypeScript, and wasm was considered and rejected at
the time. That was correct **then**: the decision predates the Component Model
and WASI 0.2, which stabilised in early 2024. The version of wasm available at
decision time was `wasi_snapshot_preview1` — no capability model, no component
composition, no interface types. The specific thing that was missing is the
specific thing that has since arrived. So "we chose TS because wasm was
immature" was a sound call whose premise expired, which is different from a
call that was wrong.

## 3. What the spikes showed (and did not)

Two runnable spikes, hand-encoded wasm, zero toolchain, executed in Node's
built-in `WebAssembly`. They are `experiments/` scratch, not platform code.

**`experiments/add-component/`** — a no-capability component. The same manifest
(`inputs:['in']`, `outputs:['out']`, `lanes.out: canonical`) satisfied by a TS
handler and by a 41-byte wasm module (`sha256 03dc7a40…`). A dispatcher that
never branches on `runtime` could not tell them apart; results agreed bit-for-bit
including `0.1 + 0.2` and overflow to `Infinity`. Both emit `canonical` because
both are recomputable. **Proves:** a pure component is substrate-interchangeable.

**`experiments/file-tool-component/`** — a capability-needing component
(`sha256 5de02acd…`). It imports `host.read_byte`; that import is its only path
to the outside world. Four states:
- no import wired → the module *cannot instantiate*. Authority absent, not
  denied.
- granted + in-workspace → reads succeed, mediated; lane forced to `apocryphal`
  because file bytes are ambient input, not recomputable.
- granted + escaping path (`../secret.bin`) → wasm traps; the read never happens.
- granted + blocked path (`.env`) → wasm traps.

The host backed `read_byte` with the shipping `@symbia/pathguard` —
`resolveConfinedPath`, not a demo stub — so the grant is scoped by the same
policy code the platform already runs. **Proves:** the A1 boundary, structurally
— untrusted code holds exactly the capabilities the host imports and nothing
else, by construction rather than by vigilance.

**What neither spike proves:** anything beyond scalars and slot-indexed reads.
No string/buffer marshalling across linear memory. No performance numbers. No
toolchain (both were hand-encoded). Nothing running inside the runtime service.
See §6.

## 4. Why this is Symbian, not a foreign graft

The Component Model is, structurally, the component model already in the catalog
— independently arrived at:

| WIT / Component Model | Symbia (existing) |
|---|---|
| `world` (imports + exports) | component manifest, the public contract |
| `interface` exports | output ports + the component's function |
| `import` | the capability request = an SDN contract to authorize |
| `record` | a `FlowValue.value` object |
| `result<T,E>` | `out`/`error` ports; a refusal is `err` |
| `resource` (imported handle) | a granted capability (workspace dir, clock, Integrations op) |
| module byte hash | the catalog SHA256 checksum, now of the artifact itself |
| `package@version` | publish-to-freeze |

Two consequences worth the ink. First, **imports predict the provenance lane**:
a component that imports nothing is `canonical`; one that imports the filesystem
is `apocryphal`. That is a static read off the manifest, before execution.
Second — the one thing WIT does **not** have — is the lane vocabulary itself
(`canonical`/`apocryphal`, lanes-only-tighten). Adopting the Component Model is
therefore additive: we gain its capability-as-import layer, keep our provenance
layer, and the result is something neither has alone. We are not behind; we have
a limb it lacks.

## 5. Scope and non-goals

In scope: a `wasm` runtime backend in the runtime service; the code-tool
re-expressed as a wasm component whose capabilities (a workspace directory
handle) are host-granted and pathguard-scoped.

Explicit non-goals: rewriting the executor; re-authoring any builtin; making
Node a wasm host on the default path; deprecating `builtin`; any promise that
"everything becomes wasm." The `builtin` runtime remains the default and the
common case.

## 6. What is NOT proven — register before building (MAP)

The following are predictions to be measured, not claims. Recorded here in git
before the work, so a broken one is reported as broken.

1. **Ergonomics hold once values stop being scalars.** Prediction: a `jco`-based
   component authored in TS, marshalling a string workspace path and a byte
   buffer across the boundary, is writable and readable without hand-rolling an
   ABI. *Risk: this is the single least-supported claim in the proposal.* Test:
   the jco probe (§8, step 1). If the developer experience is worse than the
   current TS closure by a wide margin, the whole thing narrows to "isolation
   for the code-tool only, accept the friction there."
2. **Cold-start is cheap enough to instantiate per execution.** Prediction:
   module instantiate + call is sub-millisecond, cheap enough for
   ephemeral-per-run workspaces (unlike containers). Test: measure.
3. **The toolchain is stable enough to depend on.** Prediction: `wasmtime` /
   `jco` / `wasm-tools` on the versions we'd pin do not churn under us over a
   quarter. *Known risk: Component Model tooling outside Rust/JS is younger than
   we'd like.* Test: pin and watch.
4. **Async host imports reconcile with sync wasm calls.** The file spike
   sidestepped this by pre-resolving the async pathguard check before handing
   the guest a sync reader. A real file-tool needs async reads inside the call.
   Prediction: solvable with the Component Model's async support or a
   host-side suspension shim. *Untested. This is the sharpest unknown for the
   code-tool specifically.*

## 7. Kill criteria

Abandon or renarrow if: the jco ergonomics probe (§6.1) shows authoring is
materially worse with no offsetting gain for pure components; OR the async/sync
reconciliation (§6.4) has no clean answer for the file-tool; OR instantiation
cost turns out to rule out per-execution isolation. Any one of these caps the
work at "the code-tool, and only the code-tool, runs as wasm."

## 8. Incremental rollout, with a gate

1. **jco ergonomics probe** (still `experiments/`): author `add` and a
   string-taking component in TS via `jco componentize`, run via `jco
   transpile` from Node. Tests §6.1 and produces the real marshalling the
   hand-spikes skipped. **Gate: if ergonomics fail, stop here.**
2. **`wasm` runtime backend** in `runtime/server/src/executor/` behind the
   existing `ComponentRuntime` enum — a host that instantiates a module,
   satisfies its imports from host-granted (pathguard-scoped) capabilities, and
   normalises the result into `FlowValue` with the lane forced by the import
   set. No existing component touched.
3. **Code-tool as the first wasm component.** A1 stops being a security finding
   and becomes a solved boundary. Measure against the §6 predictions; report
   the broken ones as broken.
4. **Decide whether to go further** — only if provenance *uniformity* (every
   component replayable, no trusted-source exceptions) becomes a product
   promise. Not decided here.

---

## 9. Addendum, 14 Aug — §4 is load-bearing beyond isolation

`docs/proposals/canonical-bus.md` (14 Aug) argues that this proposal's strongest
justification is not the one made above.

The sentence in §4 — *"imports predict the provenance lane: a component that
imports nothing is `canonical`; one that imports the filesystem is
`apocryphal`. That is a static read off the manifest, before execution"* — was
written as an observation about the Component Model's fit. It is also an
**admission criterion for a deterministic substrate**: the property that makes
wasm safe (no ambient authority) is identically the property that makes a
computation replayable. Isolation and recomputability are the same mechanism seen
from two sides.

That reframes §8 step 4. "Decide whether to go further, only if provenance
uniformity becomes a product promise" is not a later question — the canonical bus
is what provenance uniformity *is*, and the `add-component` spike (same manifest,
TS and wasm, both canonical, agreeing bit-for-bit) is already its first evidence.

It does not change §7. If the jco ergonomics probe fails, the bus does not die —
it narrows to first-party pure builtins, which is where it starts anyway.
`symbia.compute.arithmetic` is bus-eligible today with no wasm involved.

---

*If this gets built, move the parts that became true into `docs/` as dated
findings and mark this proposal superseded. Until then it is PAPER with two
scratch spikes, and STATUS.md should say so.*
