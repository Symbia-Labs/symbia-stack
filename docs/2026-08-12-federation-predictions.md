# Symbia↔Symbia federation — predictions, registered before build

12 Aug 2026. Design basis: `docs/2026-08-09-network-bridge-bbmd.md` (control
plane shipped as the directory service; data plane unbuilt). This session's
rulings, agreed in conversation before any code:

1. **Identical-as-app, distinct-as-installation.** Federation between
   functionally duplicate peers (load sharing, scale-out, migration,
   conglomeration) is a first-class goal. What every such topology still
   requires is stable *instance* identity — interchangeable to the caller,
   distinguishable to the ledger. Loop prevention (trace lineage contains the
   bridge's own id), reply dedup, and peer-table stability all hang off it.
   Instance identity is already disk-persisted (`.identity/service.key.pem`,
   generated once) — the prerequisite was narrower than assumed.
2. **Discovery is declaration, not broadcast.** A federation edge is a
   recorded decision: read the peer's stated offer, write a peer entry, both
   sides. Zero-conf discovery, if ever wanted, may only *suggest* candidates
   into the same admission gate.
3. **Migration is succession, not identity transfer.** A new installation
   cannot retroactively own an old one's events (non-retroactivity); it
   appends a succession claim linking lineages forward.
4. **First thing across the seam: topology.** Peer nodes mirrored as
   `<peerId>:*` proxies via a boring event class, visible in both consoles as
   observed edges.

## Predictions

- **F1** (= bbmd P1). A bridge registers through `POST
  /api/registry/bridges` (type `custom`) with **zero** change to the network
  service, and appears in `GET /api/registry/bridges`.
  *Disconfirmed by:* any 4xx/5xx on a well-formed authenticated request, or
  absence from the list.
- **F2** (= bbmd P2). A mirrored peer node registers through `POST
  /api/registry/nodes` with a prefixed id (`peerEc2:directory`, type
  `service`) with **no** registry schema change, and appears in `GET
  /api/registry/nodes`.
  *Disconfirmed by:* id validation rejecting the `:` prefix, or the node not
  listing.
- **F3.** A public `GET /api/offer` on the directory service (added this
  session: installation id, fingerprint, public key, accepted event classes)
  returns **different installation ids** on the local stack and the EC2
  stack, and the same id across restarts of the same stack.
  *Disconfirmed by:* identical ids across stacks, a changed id after restart,
  or missing key material.
- **F4** (deferred until the SSM tunnel is up). Mutual `POST /api/peers`
  written from each other's offers succeeds, and `GET
  /api/peers/:peerId/allow` returns true **only** for declared classes.
  *Disconfirmed by:* allow returning true for an undeclared class — that
  would be BBMD blind rebroadcast, the behaviour this design exists to not
  copy.
- **F5** (= bbmd P3, deferred to the first live forward). The first naive
  forward without the lineage check **loops**. Registered to break on
  purpose; if it does not echo, the check is not load-bearing and the
  design's loop story is wrong.

Results will be recorded in `docs/2026-08-12-federation-results.md` as
measured, including any prediction that holds while describing behaviour that
is wrong.
