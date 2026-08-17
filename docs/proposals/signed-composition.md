# Signed composition — primitives, components, wire sheets, assistants

**PAPER. 14 August 2026.** Nothing below exists until the gate rejects its
first write. Companions: `assistant-roster.md` (the ten roles that will call
these graphs), `wasm-runtime.md` (where primitive isolation eventually
hardens), `../2026-08-09-catalog-roadmap.md` §7.3 (the settled key scheme this
extends — extends, not relitigates), `envelope-signatures.md` (the receipt
this chain terminates in).

**The ruling this records (Brian, 14 Aug):** assistants call graphs; graphs
are wire sheets containing components; components are signed and made up of
only signed primitives. The catalog's write gate enforces the chain
mechanically at every layer. The namespace catalog of primitives is a
**physical guard in a creative environment** — the third instance of the
project's one working pattern (`check:ports`, the key-prefix ⇄ type gate, now
this). The Switch component's manifest already states the philosophy at
message scale: *"the allowlist is what stops a message inventing a port."*
This document raises it one level: **the gate is what stops a demo inventing
a primitive.**

---

## 1. The spec is written backwards from the first experience

Every requirement below is derived from what a person must see in their first
five minutes, because the platform's claim is worthless if it takes an
afternoon to witness. The first experience is the acceptance test; the layers
exist to make it possible.

### The script

A person who has never seen Symbia types an intent in plain language.

**Beat one — the machine assembles.** They do not get a chat bubble. The
coordinator names the graph it chose (or compiled), and the wire sheet
renders: real components, wired port to port, lanes coloured. Their sentence
became a visible machine before it became an answer. If a model was consulted
to extract structure from their phrasing, that consultation is *a node on the
sheet* — one apocryphal ingress, followed by a deterministic validation gate,
in plain view. The understanding step is not backstage; it is a component
like everything else.

**Beat two — the message moves.** They watch their input traverse the sheet:
filters route it, executors act, each port crossing carries its lane. The
answer arrives with a receipt that names the arena, the exact graph hash, and
every component and primitive hash beneath it. One command verifies the whole
chain from the envelope alone — no server, no trust in the UI that rendered
it. The receipt does not say "computed"; it says *computed by this machine,
these bytes, and here is how to check.*

**Beat three — they break it, and it confesses.** They are invited to do two
things no chatbot permits. First, **edit the sheet** — change a threshold on
a filter, re-run the same sentence, watch the behaviour change: the machine
is theirs, not a performance. Second, **tamper** — flip one byte of the
receipt, or swap one component hash, and watch verification fail loudly and
specifically. A system that can be productively distrusted is the product.
The incredible part was never the answer; it is that their sentence became an
inspectable, alterable, falsifiable machine while they watched.

### What the script requires, mechanically

- Intent → graph selection/compilation that is *showable* (beat one) — which
  requires graphs to be catalog resources with stable keys, not code.
- A live wire-sheet view fed by execution events (beat two) — the runtime
  already traces; the sheet must render from the trace, not a mock.
- A receipt whose verification walks the full chain to primitive hashes
  (beat two) — which requires the signing chain in §3.
- Editable graphs with gated re-admission (beat three) — an edited sheet is a
  new signed graph, written through the gate like any other.
- Tampering fails *specifically* — verification names the layer and the hash
  that broke, because "invalid" without a location teaches nothing.

## 2. Four layers, four catalog types

Keys follow the settled scheme: `<type-plural>/<name...>`, plural always,
nesting where earned, domain in tags never keys. Two new type rows
(`primitives`, `graphs`) must be added to the write gate's type table —
a required schema change, logged here as such.

### `primitives/<ns>/<name>` — the leaves

A primitive is a pure, deterministic function: same input, same output, no
I/O, no clock, no randomness. Effects are forbidden at this layer — anything
effectful is a component with lanes, never a primitive.

Third-party TS libraries are welcome **as pinned, signed snapshots** — the
most agreed-upon library for a job beats a hand-rolled copy (decimal
arithmetic is decimal.js's problem, schema validation is ajv's, not ours).
Admission means: vendored at an exact version, content-hashed over the built
artifact, manifest signed over `{key, version, distHash, exports, purity
declaration}`. The library's npm identity is provenance metadata; the hash is
the identity. An upgrade is a new signed snapshot with a new hash — never a
mutation.

But multipurpose is more than math. Math was the first proof because
arithmetic is where model hallucination is most legible; intent is mostly
*not* math. The floor spans:

| namespace | job | candidate substrate |
|---|---|---|
| `primitives/math/*` | exact arithmetic, units | decimal.js / mathjs (pinned) |
| `primitives/text/*` | regex extract, split, case, template | native + hand-signed |
| `primitives/data/*` | dotted-path get, merge, schema validate | ajv (pinned) |
| `primitives/list/*` | sort, filter, dedupe, pick, count | hand-signed |
| `primitives/logic/*` | compound predicates (and/or/not over field tests) | hand-signed |
| `primitives/time/*` | parse, diff, format — **given** a timestamp input | hand-signed |

`time` illustrates the purity rule: a primitive may transform a timestamp it
is handed; only a component may *read the clock*.

### `components/<ns>/<name>` — signed compositions with lanes

A component is a signed manifest: ports, lane declaration per output port,
config schema, and a **dependency list naming only primitive keys + hashes**.
The runtime's current 16 builtins already carry the implicit taxonomy
(`symbia.io.*`, `symbia.logic.*`, `symbia.state.*`, …); the catalog key and
the runtime id become mutually derivable, which is one more thing the gate
checks mechanically.

New components the first experience needs, beyond the 16:

- `components/model/extract` — the one sanctioned apocryphal ingress: config
  is prompt + output schema; output lane apocryphal, always. Smart
  Calculator is the existence proof, generalised.
- `components/data/validate` — deterministic schema gate, `pass`/`fail`
  ports; the mandatory second half of every `model/extract`.
- `components/symbia/service-call` — call a platform service **by id** via
  the route table. The only actuator today is `io/http-request`, which is
  URL-addressed and apocryphal; pointing it at the platform would violate
  "address services by id, never port." This component is what lets a graph
  act on the platform honestly.
- `components/symbia/catalog-get`, `components/symbia/message-send` — read
  and speak through the front door.
- `components/logic/match` — the deterministic multi-way router (the
  three-tier routing's declaration tier, made reusable).

Manifests remain public contracts: no domain vocabulary, in keys or ports.

### `graphs/<name...>` — wire sheets

A graph is a signed catalog resource: nodes referencing components by
**key + hash**, wires port-to-port, lanes propagating per the existing lane
algebra. The signature covers the canonical JSON (RFC 8785, as everywhere
else) of the sheet. Editing a sheet produces a new signed graph through the
gate; graphs are immutable once admitted, and an assistant moves between
them by re-pinning, which is itself a gated write with a lineage event.

Graph node references use the Symbia Script namespace already reserved for
this (`@catalog.component[...]` exists in the grammar today) — the reference
syntax does not fork.

### `assistants/<name>` — roles that call graphs

An assistant is what `assistant-roster.md` says it is: a role that runs a
routine and holds a refusal. What changes under this ruling: **a routine
step's work is a graph invocation by key.** `tool.invoke` and its siblings in
the handler map stop being a second primitive vocabulary and become the call
convention into the one library. The ten-roster's routine *shapes* (cascade,
fan-out-settle, chain-walk, admission gate, …) are orchestration over graphs
— the shapes stay in the engine; the *work* moves onto signed sheets.

## 3. One chain, verified from the envelope alone

```
receipt (sealed reply)
 └─ graph key + hash
     └─ component keys + hashes
         └─ primitive keys + hashes (incl. vendored dist hashes)
```

The assistant's delegation event (§4/§5b of STATUS — already RUNS) gains the
graph hash. Verification walks to the leaves: the answer was produced by this
exact machine, down to the math library's bytes. This is what beat two shows
and what tampering in beat three breaks — and the failure must name the layer
and hash that broke.

The model inside `components/model/extract` is the one link that cannot be
recomputed; the chain does not pretend otherwise. Its output is apocryphal,
its validated *shape* is the contract, and the receipt records the model
consulted — same treatment routing decisions already get.

## 4. The gate — what is mechanically rejected

Per layer, on write, by the catalog's existing gated-write path:

**primitives/** — no signature; distHash absent or mismatching the vendored
artifact; purity declaration absent; key ⇄ type-column disagreement.

**components/** — no signature; any output port without a lane declaration
(lanes are the epistemic contract — a component silent about them is
unpublishable); any dependency that is not a known signed primitive key+hash;
runtime id not derivable from the key; config schema invalid.

**graphs/** — no signature; any node referencing an unknown or unsigned
component; a wire into a port the component does not declare; a lane
violation the existing algebra can detect statically.

**assistants/** — a routine step invoking a graph key that does not resolve
to a signed graph.

Domain-vocabulary purity stays a review concern; it does not mechanize
honestly. Everything above does, and everything above **rejects** — it never
advises.

## 5. What exists today, and the honest deltas

- 16 components RUN in the runtime with manifests and lanes — in code, not
  in the catalog, not signed. **Delta: retrofit them through the gate as the
  first batch. If any existing manifest cannot pass its own gate, that is a
  finding, and the kind this project collects.**
- The gated catalog write RUNS and is already the ruled-out-of-bounds-proof
  path (STATUS §6.1). **Delta: two new type rows and the §4 checks.**
- Signing machinery RUNS (`@symbia/crypto`, service identities, canonical
  JSON); the delegation event already signs and chains. **Delta: sign
  manifests and sheets with it; add graph hash to the delegation event.**
- Symbia Script RUNS as reference syntax with catalog component references
  in-grammar. **Delta: none to the grammar. Discipline, not grammar.**
- The assistants engine RUNS with its handler-map vocabulary. **Delta: the
  call convention lands where the roster work was already headed — routine
  steps invoke graphs. No big-bang migration: Calculator's `tool.invoke`
  becoming a call to `graphs/calc-evaluate` is the first proof, and the
  roster's ten adopt it as they are built.**
- Wire-sheet rendering: the control center renders topology today; a live
  sheet fed by execution traces is **new UI work** and is required by beat
  two — without it the first experience is a claim, not an experience.

## 6. Predictions — registered before building (MAP)

1. At least one of the 16 builtin manifests fails the §4 component gate on
   first retrofit attempt. (Twelve defects came from three assistants; a
   gate that finds nothing on its first sweep is suspect.)
2. `graphs/calc-evaluate` — Calculator re-expressed as a signed sheet —
   produces the same answers as the current `tool.invoke` path on the full
   `verify-assistants.mts` suite, and its receipt gains the graph hash.
3. The first experience script (§1) runs end to end in a browser — never
   curl — and beat-three tampering fails with layer + hash named.
4. Something in the current handler map proves *not* expressible as a graph
   over the floor set. That gap goes in the defect ledger as a missing
   primitive or component, not around the gate as an exception. The ledger
   is a deliverable, exactly as `energy/` was.

Broken predictions get reported as broken.

## 7. What this does not do

No execution isolation — a signed primitive is provenance, not a sandbox;
that boundary remains `wasm-runtime.md`'s problem, and these manifests are
written to be re-expressible there (a capability-scoped wasm component slots
under the same key with the same ports). No persistence changes — in-memory
runtime state stays ruled fine. No third-party integrations — the roster's
empty `integration.invoke` column stays empty by design. No new reference
syntax. And no exceptions path: the day the gate gains a `--force` flag,
this document has failed.
