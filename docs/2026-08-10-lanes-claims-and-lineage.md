# Lanes, claims, and GKS Lineage — what the platform already asserts

*10 August 2026. A **finding**, not a proposal. Everything described here is in
the running system or in shipped code; where something is only argued, it says
so.*

*Consolidation. The material existed but was scattered across code comments in
three packages, one dated finding, and two proposal documents — including the
lane semantics, which describe shipped behaviour and were filed under a README
saying nothing in it is built. Sources listed in §7.*

---

## 1. Why this document

The platform makes epistemic claims in three separate places, in three
vocabularies, and until now nothing tied them together:

- **Port lanes** in the component manifest — `canonical`, `apocryphal`,
  `inherit`, `conditional`. Live in `catalog/shared/schema.ts`, enforced in the
  runtime, reported by the MCP server on every component.
- **Provenance arenas** on assistant replies — `COMPUTED`, `RETRIEVED`,
  `COMPOSED`, `GENERATED`, `REFUSED`.
- **Attestation levels and claims** on captures — `unsigned` /
  `self-attested` / `attested`, plus an explicit statement of what each observer
  does *and does not* assert.

They are the same idea at three scales, and they descend from GKS Lineage and
the Open Epistemic Protocol. Written down here so the next person does not
rediscover the connection from scratch.

## 2. The lanes — SHIPPED

From `catalog/shared/schema.ts`, in the component manifest, which is the
**public contract**:

```ts
export const portLanes = ["inherit", "canonical", "apocryphal", "conditional"];
```

- **`canonical`** — recomputable from the graph and its inputs.
- **`apocryphal`** — cannot be verified by recomputation.
- **`inherit`** — carries whatever lane arrived. *Lanes only tighten*, so this
  is the honest default for a pass-through.
- **`conditional`** — decided by the data; `laneNote` must say by what.

This divides by **epistemic status**, not by cost or size or sensitivity. The
question is only: *can this value be derived again from what the graph already
has?*

Live examples, read from the runtime today:

| component | port | lane | note |
|---|---|---|---|
| `symbia.compute.arithmetic` | `out` | canonical | recomputable from the expression and its inputs |
| `symbia.io.http-request` | `out` | apocryphal | a remote body cannot be recomputed from the graph |
| `symbia.state.rollup` | `out` | conditional | canonical only when `missing` is empty; a partial total must not pass as the total |
| `symbia.state.window` | `out` | conditional | a window that has not filled reports over fewer values without saying so — read `count` against `size` |
| any error port | `error` | apocryphal | a refusal is not a recomputable value |

The `rollup` note is the sharpest thing in the manifest: **a rollup with any
expected key absent is emitted apocryphal, because a partial total must not
pass as the total.** That is the entire design philosophy in one line, enforced
by a component.

## 3. "Lanes only tighten" is non-retroactivity

An apocryphal input cannot become a canonical output by passing through a
component that would prefer otherwise. The lane travels with the value and can
only narrow.

This is structurally the same rule as the one governing attestation: a record
signed under `self-attested` cannot be raised by a genesis imported afterwards.
In the capture path that is enforced by arithmetic — rotation generates a *new*
key and the genesis certifies only that one, so earlier records were signed by a
key the anchor says nothing about.

Both are **monotonicity constraints, enforced structurally rather than by
policy**. Neither depends on a verifier choosing to behave.

## 4. The claims vocabulary — SHIPPED, in `@symbia/lineage`

Every observer produces a record of identical cryptographic strength, and they
assert entirely different things. `symbia-lineage/src/claims.ts` makes each one
state both halves:

| observer | asserts | does **not** assert |
|---|---|---|
| `capture` | this instrument framed a region of a display and captured these bytes | anything about whether what was on screen was accurate or itself genuine |
| `upload` | this instrument received these exact bytes from this principal | authenticity, authorship, or origin. A signed record of a forged document is a faithful record of a forged document |
| `retrieval` | this endpoint returned these exact bytes over the recorded transport | that the content is true. A page can lie, and this records the lie exactly |

The `does_not_assert` field is not commentary. It is a field, in the artifact,
because a single "verified" badge across all three would be **false while every
hash in the system was sound**.

Note the correspondence: an upload asserts *receipt* rather than authenticity
**because the bytes are apocryphal**. The claims vocabulary and the lane
vocabulary are the same distinction, one applied at ingress and one applied
inside a graph.

## 5. The GKS grounding

The record follows the GKS **Lineage** primitive: immutable, append-only,
deterministic, ordered, identity-scoped, parent-linked, verifiable by checksum,
and **non-epistemic**.

Non-epistemic is the load-bearing one. The ledger carries digests, byte counts,
offsets, device labels and geometry — never content. *Reading the entire ledger
tells you exactly what was captured and in what order, and shows you none of
it.* That is why a ledger can be handed to a regulator, a court, or a
counterparty not permitted to see the material it describes.

It is also the **Observer** boundary made concrete. The per-track binding

```
binding = sha256( "audio" ‖ head_audio ‖ "video" ‖ head_video )
```

lets one track be released while proving the withheld track belonged to the same
capture. Enforced ignorance expressed in files rather than in policy: the holder
of the video can verify the audio existed, in that capture, unaltered — and
cannot hear it.

**One thing GKS asks for and did not supply.** Lineage §9 states the
requirements for a serialization — deterministic key ordering, consistent
timestamps, globally unique event ids, ability to hash or sign, cross-system
interoperability — and then declines to give one: *"Formats may include JSON,
CBOR, MessagePack, or others."* What is implemented here fills that hole:
RFC 8785 canonical JSON, ISO-8601 timestamps, ids unique by construction,
ed25519 over the whole canonical event. That is a concrete profile of an
abstract primitive, and it is the piece most worth publishing.

## 6. The one sentence

**The logbook is canonical about material that is apocryphal.**

You cannot recompute what a camera saw, what a microphone heard, or what a
server chose to return. You *can* recompute every digest, every running total
and every signature, from the record alone. That is why the record is worth
something and why it claims so little.

## 7. Where this came from

Consolidated from material already in the repository:

- `catalog/shared/schema.ts` — `portLanes` and their definitions
- `runtime/server/src/executor/components-sinks.ts` — lanes enforced on sinks
- `symbia-lineage/src/claims.ts` — the claims vocabulary
- `symbia-lineage/src/attestation.ts` — levels and `substantiate()`
- `spyglass-agent/main.js`, `scripts/import-genesis.js` — non-retroactivity by
  key rotation
- `docs/2026-08-10-spyglass-video-lineage.md` — the GKS Lineage framing and the
  measured results behind it
- `docs/proposals/beyond-the-platform.md` §7.2 — the lane analysis, which
  described shipped behaviour while sitting in a directory marked unbuilt
- `~/vscode/genesis-key-spec` — Lineage, Identity and Observer primitives,
  Apache 2.0
