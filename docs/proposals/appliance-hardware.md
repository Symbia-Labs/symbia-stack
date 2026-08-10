# The Symbia appliance — hardware intent

*9 August 2026. This is a statement of intent, not a commitment and not a
ruling. Nothing in it has been measured, priced, or prototyped. It exists so
that when hardware questions come up later there is a dated position to
dispute, rather than a fresh improvisation. Where it depends on claims about
the running stack, those claims are cited to their source; where it guesses,
it says so.*

---

## 1. The organizing observation

The stack's compute needs are ordinary. Eleven Node services, JSONL
persistence, a WebSocket bus, and an esbuild console run comfortably on a
laptop — that is how they run today. What software cannot do, on any
hardware, is prove that its own ledger was not rewritten. The platform's
central claim — no capability enters without a recorded gate — terminates,
in a pure software deployment, at a file the operator can edit.

So the appliance is not "a box that runs the stack." The defining hardware is
**trust anchoring**, and the sizing hardware is **local inference**.
Everything else is packaging.

## 2. Non-negotiable: a hardware root of trust

A TPM 2.0 or discrete secure element that:

- holds the org/genesis signing keys (the genesis-key work already assumes
  signed rules; this gives the signature somewhere to live that the operator
  cannot export);
- performs measured boot, so "the running bundle is the code that was
  shipped" becomes attestable rather than grep-checked (discipline 4 done in
  silicon);
- countersigns ledger entries — catalog writes, ingress grants, provenance
  receipts — so the append-only record is tamper-evident, not merely
  append-only by convention;
- is the resting place for `.mcp.json`-class secrets, which today sit in a
  gitignored file.

This is the feature that makes an appliance different in kind from a NUC
running `./start-local.sh`. A payment terminal gets this treatment; a
provenance ledger deserves it at least as much.

**Inference, flagged as such:** whether ledger countersigning per-write is
throughput-viable on a commodity TPM is *not known*. Secure elements are
slow. A plausible design signs Merkle roots at interval rather than every
entry. That choice is unmeasured and open.

## 3. Sizing: local inference

The `models` service (local GGUF, port 5008) plus spyglass-style vision is
the only real load. Design consequences:

- **Unified memory over discrete GPU.** A Strix-Halo-class SoC with
  64–128 GB shared memory keeps a large-quant text model and a vision model
  resident simultaneously without VRAM partitioning. A discrete GPU adds
  power, heat, and a second memory domain for no benefit at this deployment
  size.
- **Hardware video decode**, for spyglass frame ingestion (frame grab as a
  network node, over the bus, to a vision endpoint through the integrations
  gateway — `docs/2026-08-07-spyglass-vision-via-integrations.md`).
- Everything else fits in the margins. No second socket, no exotic cooling.

## 4. Storage shaped like the write pattern

Dev/local persistence is JSONL and local logs by standing constraint, with
DB connectors later behind an interface. Append-only writes want:

- NVMe with power-loss protection for operational data;
- a **second, smaller device that is effectively WORM for the ledger
  itself** — the separation of "operational data" from "the record" made
  physical rather than logical;
- A/B boot partitions, so an update can never brick the record-keeper, and
  a failed update is a rollback rather than an incident.

## 5. Facility-grade I/O

`energy/` is the test load, and its constraint — control actions stay inside
the facility — should be enforced by copper, not convention:

- **Dual NICs minimum**, OT and IT physically separated. "Inside the
  facility" becomes a statement about which wire a packet can leave on.
- Isolated RS-485 / serial provision, with room for BACnet/Modbus later —
  but behind the same gate as everything else. A fieldbus port that is not a
  registered ingress with a declared `{node, port, capability}` is precisely
  the defect class the platform exists to prevent, now with screw terminals.
- Fanless, DIN-rail or short-depth 1U, wide temperature range, hardware
  watchdog. Electrical rooms, not server rooms.

## 6. The front panel

Per-service indicators with **three states: running, not running, not
checked.** A green light inferred from absence of evidence is the exact
failure the product hunts (discipline 6); the panel must not commit it.
Registered-but-not-running (`server`, 5000) gets its own visual state rather
than collapsing into either — `RunningServices` is the one place that
difference is expressed in software, and the panel reads from it rather than
duplicating the filter (discipline 8 / the drift rule).

Type on any built-in display: ≥16px-equivalent at viewing distance.

## 7. What this is not

- Not a commitment to build hardware. It is a position on what the hardware
  would be *for*, so the software keeps earning it — e.g., the ledger's
  signing interface should be designed now as if a secure element will
  eventually hold the key.
- Not a spec. No part numbers, no BOM, no thermal budget. Every quantitative
  claim above (memory sizes, TPM throughput) is unmeasured.
- Not a reopening of any settled ruling. One origin on 8000, services by id,
  gated catalog writes, and the app/installation split all apply to the
  appliance unchanged; the appliance is one *installation*.

## 8. Open questions, registered

1. Countersign-per-write vs. Merkle-root-at-interval (throughput unknown —
   §2).
2. Whether the ledger's WORM device is a distinct physical medium or an
   enforced-append partition (cost/availability question).
3. Whether the front panel reads `RunningServices` live or via a dedicated
   health endpoint — and what "not checked" means when the panel service
   itself is the thing not running.
4. Whether vision inference belongs on-appliance at all sizes, or whether
   small installations reach a vision endpoint through the integrations
   gateway as spyglass does today (which would shrink the memory floor
   substantially).
