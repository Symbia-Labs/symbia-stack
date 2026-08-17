# Federation & the Directory Service

Reference document, established 12 Aug 2026. This is the standing overview:
strategy, measured status, and the ordered build queue for Symbia↔Symbia
federation. Dated evidence lives in
`docs/2026-08-12-federation-predictions.md` and
`docs/2026-08-12-federation-results.md`; the founding design is
`docs/2026-08-09-network-bridge-bbmd.md`. When this document and a dated
findings file disagree, the findings file wins and this one is stale —
say so and fix it.

---

## 1. Strategy

### What federation is for

Every Symbia node is a whole, self-contained network; bridges compose
networks. Federation is how two installations share capability and traffic
**without sharing trust wholesale** — one authenticated edge per peer
relationship instead of N services × M networks of credentials.

The platform premise extends across the seam: **provable provenance**. A
federated event carries where it has been; a borrowed capability names which
installation actually did the work; a peer relationship is a recorded
decision, not an emergent property of the network. If federation ever
requires reaching outside the Symbia API — hand-edited routes, unregistered
forwarders — that is a platform defect to log, not a workaround to keep.

### The identity ruling: identical-as-app, distinct-as-installation

Federation between functionally duplicate peers is a first-class goal — load
sharing, transparent scale-out, slow conglomeration, migration. None of it
requires peers to differ in role, state, or capability. What every such
topology still requires is stable **instance** identity:
**interchangeable to the caller, distinguishable to the ledger.**

This is the app/installation split (`docs/APP-MODEL.md`) applied to the
network: two stacks can be identical as apps (same definitions, same
content-addressed configuration) while distinct as installations (own
disk-persisted ed25519 identity, generated once at
`.identity/service.key.pem`). "Duplicate peer" then becomes a *verifiable*
claim — definition hashes match — rather than an accident of cloning.

Three primitives break without it, all now observed rather than argued:
loop prevention keys on the bridge's own id in the lineage; reply dedup in
load-sharing keys on which installation sealed the answer; and peer tables
pin credentials to installations. Homogeneous topologies lean *hardest* on
instance identity, because it is all they have left to tell anyone apart.

Corollary: **migration is succession, not identity transfer.** A new
installation cannot retroactively own an old one's events
(non-retroactivity); it appends a succession claim linking lineages forward.
An auditable handoff, not a mutation.

### The BBMD-derived model, and where Symbia improves on it

BACnet's BBMD solves "broadcasts don't cross subnets" with a peer table
(the Broadcast Distribution Table, BDT), a foreign-device table (FDT), and a
forwarder — fused in one device.
Symbia keeps the tables and splits the device:

| plane | service | holds |
|---|---|---|
| **Control** | Directory service (5010) | peer directory (the BDT analogue), foreign-node table (the FDT analogue, TTL-leased), admission — *who may federate, with whom, over what* |
| **Data** | Bridge node | forwarding only; consults the directory per event; **carries no policy of its own** |

A crashed or compromised bridge cannot change who may federate; a peer can
be suspended in the directory without touching the forwarding path.

Deliberate improvements over BBMD, each now measured:

- **Provenance-aware loop prevention**, not hop counts: federation lineage
  (`__fedPath`, append-only, carried in the payload because re-emission
  mints a new wrapper) — a bridge never re-forwards an event whose lineage
  already names it.
- **Capability-scoped distribution**, never blind rebroadcast: an event
  class crosses only if the peer entry declares it
  (`GET /api/peers/:id/allow`). Empty means nothing — never "everything".
- **Fail-closed control plane**: an unreachable or empty directory means
  *deny*, observed working when a restart emptied the peer table
  mid-measurement and every forward stopped.
- **Observed cross-seam topology**: peer nodes mirror into the local
  registry as `peer<X>:*` proxies, so each console draws federated edges as
  observed.

### Discovery is declaration, not broadcast

A federation edge is a trust decision someone makes, so it is recorded, not
discovered. Each directory publishes a passive **offer**
(`GET /api/offer`: installation id, fingerprint, public key, accepted event
classes). Joining is mutual and deliberate: read the other's offer, write a
peer entry, both sides, both in the ledger. Reading an offer admits
nothing; admission lives on `POST /peers` and nowhere else. If zero-conf
discovery is ever wanted, it may only *suggest* candidates into that same
gate — never admit them.

### Trust on the one edge

- **Phase 1 (available now, unset in dev):** shared join secret
  (`DIRECTORY_JOIN_SECRET`, presented as `x-symbia-join-secret`). Open
  admission is a stated state with a loud boot warning, never silent.
- **Phase 2 (upgrade path):** identity-issued bridge credential, making
  bridge admission itself a ledgered capability.
- Local `node:register` stays open *inside* a network boundary by ruling;
  the bridge link is precisely where that openness stops.

---

## 2. Status — what is measured, what is spike, what is paper

### Measured (all five registered predictions held, 12 Aug)

| prediction | result |
|---|---|
| F1 — bridge registers via existing `/api/registry/bridges`, zero network-service change | held, both stacks |
| F2 — mirrored proxy nodes (`peerEc2:*` / `peerLocal:*`) need no schema change | held, both stacks |
| F3 — offers return distinct installation ids, stable across restart *and* recreate | held: local `95ee24b3…` vs EC2 `60a31d45…`; `.identity` volume-mounted |
| F4 — mutual declaration from offers; allow-check refuses undeclared classes | held: `network.topology` → true, `catalog.write` → false, both directions |
| F5 — naive forward loops; lineage check stops it | held emphatically: 1 probe → **2,950 events/network in 8s** naive; **1 forward, bounded** guarded |

### Running today

- **Directory service** on 5010, both stacks: peers CRUD + allow-check +
  admission + offer; foreign nodes with TTL/heartbeat/eviction. **Peers
  journal to JSONL** (`data/peers.jsonl`, replayed at boot) — verified
  surviving `docker restart`, `--force-recreate` (compose volume
  `directory_data`), and a native process kill on EC2. Foreign nodes are
  deliberately *not* persisted: the FDT is a lease, and lapsing across a
  restart is its semantics.
- **A live two-stack federation**: local colima stack ↔ EC2
  `cowork-symbia-1` (i-08a4c8c9b50dc4c23, us-east-1), joined by SSM tunnels
  (console 18000→8000, network 15009→5009) as the single edge. Mutual peer
  declarations in place and persistent.
- **The bridge** — `scripts/federation-bridge.mts`, a deliberate spike:
  one Mac-side process holding both edges (only that host reaches both
  networks), directory-gated per event, lineage-guarded, idempotent per
  wrapper id, mirrors topology at start. A production bridge is one per
  network, registered as a service; this is not that yet.

### Defects found by building this (the ledger the work paid for)

| defect | state |
|---|---|
| Network service attaches socket handlers **after** awaited token introspection — authenticated clients' first emits are silently dropped (`socket.ts` `io.on('connection', async …)`) | **open** (server); worked around in `@symbia/relay` — register re-emits on 2s ack timeout |
| `sdn:watch` double-delivers the same `wrapper.id` to one subscription | **open**; bridge dedupes, cause unexplained |
| `localhost` resolves to `::1` under Node 20+ while native services bind IPv4-only — bare `fetch failed` | worked around (pin `127.0.0.1`); latent everywhere `localhost` is dialled |
| Full-tree extract restarts every `tsx watch` service at once; in-memory state wiped mid-measurement | root cause **closed** for peers (JSONL journal); pattern noted for other in-memory registries |
| First loop-verdict heuristic mislabelled a held guard (>4 events ≠ loop; loops compound, duplicates are bounded) | fixed; kept in the code as a comment because it is the fifth instance of an instrument sharing its subject's assumptions |

### Honest limits, stated so nobody infers otherwise

- Admission is **open** on both directories (no join secret set) —
  acceptable inside the current trusted boundary, loudly logged, and the
  first hardening step below.
- The offer's public key is **published but not yet pinned**: declaring a
  peer does not record or verify its fingerprint. Nothing checks that the
  installation you talk to tomorrow is the one whose offer you read today.
- The edge is a laptop-bound SSM tunnel: it dies on sleep. Fine for dev;
  a standing edge is an ops decision not yet taken.
- One event class (`network.topology`) is declared anywhere. Mirrored
  proxies are registry entries, not live state — no TTL, no cleanup on
  peer departure yet.
- The network registry and bridge registry remain in-memory; only the
  *peer* table earned persistence so far.

---

## 3. Next steps, in order

1. **LLM capability borrowing** — the first *useful* class on the seam,
   designed 12 Aug: `model.inference.request`/`.response` pair,
   bridge-correlated by event id; EC2 (no model credential) borrows the
   local models service; **the key never leaves the lending host**; every
   borrowed call carries the lender's signature; the directory can revoke
   the class in one write. *Deliberately not built yet:* the request side
   lives in the assistants engine, which the parallel session is mid-rewrite
   on. First item when the engine settles.
2. **Pin what the offer promises.** On `POST /peers`, record the peer's
   fingerprint from its offer and verify it on every subsequent
   control-plane exchange. Declaration should bind to a key, not a URL.
3. **Set the join secret** (phase 1 trust) on both directories, then design
   the phase-2 identity-issued bridge credential so bridge admission is
   itself ledgered.
4. **Bridge: spike → service.** One bridge per network, its own id in
   `@symbia/sys`, live mirroring on `node:joined`/`left` with proxy TTL and
   cleanup, and splitting the two edges out of one process. Keep the spike
   until the service reproduces every measured behaviour.
5. **Fix the two open server defects**: attach socket handlers before the
   awaited introspection (or buffer), and root-cause the `sdn:watch` double
   delivery. Both bite anything authenticated on the mesh, not just
   federation.
6. **Distributed rosters** — `@assistant` addressing across the seam, a
   local coordinator delegating to a peer's specialist, with the GKS
   delegation chain spanning two installations' signatures. The flagship
   provenance demonstration.
7. **Catalog conglomeration** — content-addressed entries deduping by hash
   across peers; canonical/apocryphal lanes tightening across the seam
   exactly as they do within it.
8. **Migration-as-succession** — the recorded handoff event linking an old
   installation's lineage to its successor's.
9. **A standing edge** — replace the laptop tunnel with a deliberate,
   documented exposure decision when federation outgrows dev.

*Everything above rides the same two mechanisms measured today: a peer
entry's `acceptedEventTypes`, and a forward that carries its lineage. If a
step seems to need a third mechanism, that is a design smell — argue it on
paper first.*
