# Directory Service — intent

## What it is

The **control plane** for Symbia network-to-network federation. It holds who may
federate, with whom, and over what — nothing more. It routes no events.

- **Peer directory (BDT analogue):** the peer networks this one federates with,
  each with the event types it is allowed to receive. Empty means nothing is
  forwarded — never "everything."
- **Foreign-node table (FDT analogue):** partial nodes registered with a TTL,
  renewed by heartbeat, evicted on lapse.
- **Admission:** the single place a federation credential is checked. This is
  where the network service's open `node:register` deliberately stops.

## What it is not

- Not a data plane. No event passes through it. The **bridge** node forwards;
  it consults this service for permission and carries no policy of its own.
- Not a second node registry. Local nodes still register with the network
  service (5009). This service is only about the federation seam.

## Why it is its own service

Splitting control (this service) from data (the bridge) is the first
Symbia-native improvement over BACnet's BBMD, which fuses table and forwarder
in one device. A crashed or compromised bridge cannot change who may federate,
and a peer can be suspended here without touching the forwarding path.

## Boundaries honored

- **Persistence:** in-memory for now, matching the network registry; JSONL/local
  is the dev target when persistence lands (standing constraint). Not yet
  implemented — see `docs/2026-08-09-network-bridge-bbmd.md` §8.
- **Port** derives from `@symbia/sys` (5010). No literal at any call site.
- **Admission open by default in dev** is a *stated* state (boot warning), never
  an inferred pass.

Full design and registered predictions: `docs/2026-08-09-network-bridge-bbmd.md`.
