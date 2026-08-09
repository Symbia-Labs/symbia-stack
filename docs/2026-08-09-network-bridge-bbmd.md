# Symbia network-to-network bridge — a BBMD-derived federation model

Design, 9 Aug 2026. Status: **proposed, nothing built.** This doc exists to be
disputed on paper before any forwarding code is written. Predictions are
registered in §7 so the build can be measured against them.

Origin: the ask was "spin up a clean Symbia node — all services or a single —
and connect it to an existing network, or a new one." The first design pointed
individual services at a foreign network service (direct join). That surfaced
three real gaps (§2). The redirect — federate whole networks with a **bridge**
modelled on BACnet's **BBMD** — removes all three and lands on an abstraction
the platform already has.

---

## 1. What the code already provides (observed, not assumed)

Read on 9 Aug against `fix/2026-08-06-api-gaps`:

- **A service joins a network** by pointing its relay at `NETWORK_ENDPOINT` /
  `NETWORK_SERVICE_URL` (else resolved from `@symbia/sys`) and emitting
  `node:register` over Socket.IO to the network service (5009). It registers
  `nodeId = serviceId`, `endpoint = http://$HOST:$PORT/api/network/receive`,
  and heartbeats. `symbia-relay/src/integration.ts:56`,
  `symbia-relay/src/client.ts:125`.
- **`bridge` is a first-class node type**, not a placeholder:
  `type: 'service' | 'assistant' | 'sandbox' | 'bridge' | 'client'`
  (`network/server/src/socket.ts:235`, `types.ts:63`, repeated in `openapi.ts`).
- **A `NetworkBridge` abstraction exists** — `types.ts:104` "A bridge
  connecting to external systems", carrying the event types it handles and an
  active flag; `registry.ts` has `registerBridge` / `getBridge` / `getBridges`
  / delete / status; REST at `/registry/bridges` (register, list, get,
  update-status, delete); telemetry `BRIDGE_REGISTERED`, `BRIDGE_DELETED`,
  `BRIDGE_STATUS_CHANGED`, `BRIDGE_ACTIVE_COUNT`.
- **Node registration for infrastructure types is unauthenticated.** The socket
  handshake introspects identity tokens for `agent` and `user` principals, but
  `node:register` for `service` / `sandbox` / `bridge` is allowed with no token
  — "For non-agent types (service, sandbox, bridge), allow registration"
  (`socket.ts:300`).
- **Trace context is on every event** — `x-symbia-trace` + `x-symbia-caller`
  (`docs/2026-08-08-trace-propagation.md`). This is the loop-prevention
  primitive, already shipped.

**Inference, flagged as such:** the existing `NetworkBridge` means *bridge to
external (non-Symbia) systems* (the seed registers an integrations→channel
bridge, `seed.ts:66`). No code forwards registry, events, or contracts between
two Symbia **network services**. Network↔network federation is new behaviour
built on existing scaffolding — not a reopening of a settled design.

---

## 2. Why bridge beats direct-join (the three gaps it closes)

| Gap in direct-join | Direct-join cost | Bridge outcome |
|---|---|---|
| **Node-id collision** — `nodeId = serviceId` is hard-coded (`integration.ts:81`); two hosts both running `messaging` clobber each other in one registry. | Change every service's relay to namespace ids. | Each network keeps its own local ids. The bridge mirrors peers in as **prefixed proxies** (`peerA:messaging`). `initServiceRelay` never changes. |
| **Trust on every node** — `node:register` is open, so joining a foreign registry means every service is a trust decision. | Add a credential to N services × M networks. | **One** authenticated edge: the bridge link. Everything else stays local. |
| **Bidirectional callback** — `endpoint` uses `$HOST` (default localhost); the network service calls back to each node. | Expose every node's callback across hosts. | Only the bridge reaches both network services. Every node's callback stays localhost. |

Consequence for "single-service node": in the bridge model every node is a
**whole, self-contained network** (bootstrap, all-local wiring — exactly the
EC2 stack from `docs/2026-08-09-ec2-clean-install-browser-walk.md`, cleaned).
A "single service" is the minimal network that **foreign-registers** (§4) with
a bridge for what it lacks. Everything is a network; bridges compose them.

---

## 3. The BACnet BBMD mapping

BBMD exists because IP broadcasts don't cross subnets: one BBMD per subnet holds
a **Broadcast Distribution Table (BDT)** of peer BBMDs and forwards local
broadcasts to them as directed unicast; a **Foreign Device Table (FDT)** lets a
device outside the subnet register (with a TTL) to receive that traffic.

| BACnet | Symbia analogue | Backed by |
|---|---|---|
| Subnet | One Symbia network (one network service + its local nodes) | 5009 + registry |
| BBMD (table **and** forwarder in one device) | **split**: Directory Service (control) + bridge node (data) | new `directory` service; `bridge` node type |
| BBMD forwarder | **Bridge node** — the designated edge forwarder, one per network | `bridge` node type, `NetworkBridge` |
| BDT (peer BBMD list) | **Symbia Directory Service** — the peer networks this network federates with | new `directory` service |
| Directed-unicast forward | **Declared event-type forward** — point-to-point relay send across the seam | `NetworkBridge.eventTypes`, relay `emitEvent` |
| Foreign Device Registration (with TTL) | **Foreign-node registration** — a partial node registers with the Directory Service, heartbeat/TTL keeps it live | heartbeat path (`client.ts:158`) + a TTL |
| Broadcast Distribution | **Capability-scoped distribution** — forward only event classes the peer declared it accepts | catalog gated-write / contracts |

---

## 4. Model

The model splits into a **control plane** (the Directory Service — who may
federate, with whom, over what) and a **data plane** (the bridge node — the
actual forwarding). BACnet conflates both in the BBMD; separating them is the
first Symbia-native improvement (§5).

**Symbia Directory Service — its own service (control plane).** A first-class
service with its own id in `@symbia/sys` (proposed `directory`, next free port
— see §8), not a view over the bridge registry. It holds the federation state
and is the admission point:

- **The peer directory (BDT analogue).** Per network: the set of peer networks
  it federates with, each entry `{ peerId, endpoint, acceptedEventTypes,
  credential-ref, status }`. Static to start (declared), self-pruning later
  (§5).
- **The foreign-node table (FDT analogue).** Partial nodes registered with a
  TTL (below).
- **Admission.** The one place the join credential (§6) is checked — a bridge
  or foreign node is admitted by the Directory Service, not by the network
  service's open `node:register`.

**Bridge node (data plane).** A `bridge`-type process holding a relay
connection to its **local** network service and to each admitted **peer**
bridge. It registers as a node via the existing `/registry/bridges` write (so
it stays a ledgered, telemetry-visible, deletable capability) but consults the
Directory Service for *who* it may forward to and *what* — the bridge carries
no federation policy of its own.

**Foreign-node registration (the FDT).** A partial node (e.g. a lone `runtime`)
registers with the Directory Service rather than standing up a full network.
Carries a TTL; the existing heartbeat renews it; lapse evicts it. This is the
ONLY path by which a non-whole node participates — it never joins a foreign
registry directly.

**Forwarding rule (per event crossing the seam):**
1. Event is emitted on network A, carrying `x-symbia-trace` + `x-symbia-caller`.
2. Bridge A considers it iff its `type` ∈ the peer entry's
   `acceptedEventTypes` AND network B has a **declared contract** to receive
   that class (capability-scoped — §5).
3. Bridge A forwards to Bridge B as a directed relay send, appending its own
   bridge id to the trace lineage.
4. Bridge B re-emits into network B **only if** the trace lineage does not
   already contain Bridge B (loop prevention via provenance, not hop-count).
5. Topology: Bridge B mirrors A's relevant nodes into B's registry as
   `peerA:*` proxies, and vice versa, so each network's topology view shows the
   federated edges as **observed**, consistent with the 18-observed-vs-3-
   declared work.

---

## 5. Smarter-than-BBMD (Symbia-specific)

BBMD is deliberately dumb: table and forwarder in one device, static BDT, blind
rebroadcast, hop-rule loop control, no provenance. Symbia already holds the
parts to do better:

- **Control/data split.** The Directory Service holds federation policy and
  admission; the bridge only forwards. A compromised or crashed bridge cannot
  change who may federate, and the directory can revoke a peer without touching
  the forwarding path. BBMD has no such separation.
- **Provenance-aware forwarding.** Loop prevention is the trace graph, not a
  hop count. A bridge never re-forwards an event whose lineage already includes
  it. (Uses shipped `x-symbia-trace`.)
- **Capability-scoped distribution.** A network cannot push an event class into
  a peer that has not registered a contract to receive it. The catalog's
  gated-write model becomes the federation filter — the opposite of blind
  rebroadcast.
- **Observed cross-seam topology.** The federated map draws bridge edges as
  observed, not merely declared — BACnet never sees this.
- **Self-pruning directory (later).** A bridge can learn which peers actually
  consume which event types and stop forwarding classes nothing downstream acts
  on. A Directory Service that prunes itself; BBMD cannot.

---

## 6. Trust on the link (the one edge)

Because there is exactly one authenticated edge per peer relationship, the
credential decision is proportionate:

- **Phase 1 — shared join secret.** Bridge presents a secret on connect;
  peer network validates it before accepting the bridge and its forwards.
  Smallest change; keeps the `service`/`sandbox` open-registration path
  untouched for local nodes.
- **Phase 2 — identity-issued bridge credential.** The bridge authenticates
  like an agent does — a credential from the peer network's identity service —
  making bridge admission itself a ledgered capability. Upgrade path, not a
  prerequisite.

Note the standing finding this rides on: local `node:register` is currently
open (`socket.ts:300`). That is acceptable **inside** a network boundary; the
bridge is the point where that openness must stop, which is why the credential
lives on the bridge link and nowhere else.

---

## 7. Predictions (registered before build)

- **P1.** A bridge can register in the local network via `/registry/bridges`
  and appear in `getBridges` + bridge telemetry with **zero** change to the
  network service. (Testing whether the existing scaffold really is reusable.)
- **P2.** Mirroring a peer node as a `peerA:*` proxy needs **no** registry
  schema change — `registerNode` accepts an arbitrary id/type. Expected true.
- **P3.** Forwarding without a provenance check loops. Registered as the
  prediction most likely to bite: the first naive forward will echo, and only
  the trace-lineage check stops it. Expected to break, on purpose, to prove the
  check is load-bearing.
- **P4.** `initServiceRelay` needs **no** change for the bridge model — the
  bridge uses the relay client directly with its own nodeId, and local services
  are untouched. If this breaks, the "no id-collision" claim in §2 is wrong.
- **P5.** Capability-scoped forwarding cannot be validated against `energy/`
  alone — a second domain (`examples/order-margin/`) is required, or the filter
  will encode energy's event taxonomy. Registered per the "instrument measures
  itself" discipline.
- **P6.** Foreign-node registration reuses the heartbeat path with only a TTL
  added. If it needs more, the FDT analogy is looser than claimed.
- **P7.** The Directory Service stands up as a new `@symbia/sys`-registered
  service on the next free port with no change to the existing nine services'
  registration — they neither know nor care that federation exists until a
  bridge forwards to them. If a local service must change to accommodate the
  directory, the control/data split in §5 is leakier than claimed.

## 8. Open (not settled here)

- Wire encoding of a forwarded event (envelope shape, how lineage is appended).
- **Directory Service port and id.** Proposed id `directory`; next free port is
  5010 (5000–5009 taken, 8000/9000 taken — see the system map in project
  instructions). Must derive from `@symbia/sys` and pass `check:ports`; the
  number here is a proposal, not a settled allocation.
- Whether the Directory Service persists its BDT/FDT (dev = JSONL + local logs
  per standing constraint) or holds them in memory with heartbeat-driven
  reconstruction, as the network registry does today.
- Whether the bridge is its own service id in `@symbia/sys` or a `bridge`-type
  instance registered against the Directory Service.
- Back-pressure / batching across the seam (BACnet has none; we may want it).
- Whether topology mirroring is full or contract-filtered by default.
- Multi-hop (A↔B↔C) semantics beyond single-seam loop prevention.

## 9. Relationship to node provisioning

Independent of this doc: `node up` (bootstrap a whole self-contained network —
the cleaned EC2 stack) is the unit a bridge federates. The two compose but do
not depend on each other's internals. Deploy-shape fixes required first are in
`docs/2026-08-09-ec2-clean-install-browser-walk.md` §D1–D6.
