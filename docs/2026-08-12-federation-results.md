# Symbia↔Symbia federation — results, measured

12 Aug 2026. Predictions registered first in
`docs/2026-08-12-federation-predictions.md` (commit `3edcad5`). Measured by
`scripts/verify-federation.mts` against both stacks: local (colima, docker,
`fe3803b`) and EC2 `cowork-symbia-1` (native tsx, same commit via the S3/SSM
sync path).

| id | verdict | observed |
|---|---|---|
| F1 | **HELD, both stacks** | Bridge registered via `POST /api/registry/bridges` with zero network-service change; listed in `GET /bridges`. Local bridge `837d7405…`, EC2 bridge `3ddb936a…`. The bbmd P1 claim that the scaffold is reusable is now measured, not assumed. |
| F2 | **HELD, both stacks** | Prefixed proxy ids (`peerEc2:directory` locally, `peerLocal:directory` on EC2) accepted by `POST /api/registry/nodes` with no schema change, listed in `GET /nodes`. bbmd P2 measured. |
| F3 | **HELD** | `GET /api/offer` returns installation id, fingerprint, public key, accepts. **Cross-stack:** local `symbia:service:95ee24b3b40b42f0` vs EC2 `symbia:service:60a31d45cc569dbf` — identical-as-app, distinct-as-installation, measured. **Stability:** local id unchanged across `docker restart` (and `/app/.identity` is volume-mounted, so recreate is covered); EC2 id unchanged across tsx restarts. |
| F4 | **HELD** (measured later same day, tunnel up) | Each stack read the other's offer — EC2's control plane reached through the tunnel via the console's `/svc/directory` proxy, so the single edge carried everything. Mutual `POST /peers` written from the offers; both Directory tiles show Peers 1/Active 1. The load-bearing check: `allow?eventType=network.topology` → `true` on both sides, `allow?eventType=catalog.write` → `false` on both sides. No blind rebroadcast. EC2's peer endpoint is declared `bridge-initiated://ssm-tunnel` — honest about the fact that only the Mac-side bridge can reach both networks. Caveat: peer entries are in-memory; a directory restart clears the handshake until directory persistence lands (bbmd §8). |
| F5 | **HELD — it broke exactly as registered** (measured later same day, `scripts/federation-bridge.mts`) | Naive forward (`FED_LOOP_CHECK=off`): one probe emitted into the local network became **2,950 observations per network and ~1,450 forwards each way in 8 seconds**. Guarded (`__fedPath` lineage riding in the payload, append-only, checked before every forward): the same probe produced **one** forward, 2 lineage skips, 1 duplicate suppressed, bounded. The lineage check is load-bearing, now by observation. Loop prevention had to live in the *payload*: re-emission mints a new wrapper, so `wrapper.path` cannot carry federation lineage across the seam. |

The forwarder run added four more findings:

3. **Authenticated sockets can lose their first emits.** The network service
   attaches socket handlers only after `await`ing token introspection
   (`socket.ts` `io.on('connection', async ...)`), so a client that emits
   `node:register` immediately on connect gets no listener and hangs forever.
   Unauthenticated sockets skip the await — which is why every service works
   and the authenticated bridge froze. Worked around in `@symbia/relay`:
   register now re-emits on a 2s ack timeout (registration is an upsert).
   The server-side ordering is the real defect.
4. **`sdn:watch` double-delivers**: a single subscription saw the same
   `wrapper.id` twice, so two copies of the probe crossed the seam before the
   bridge grew per-event-id dedup. Bridge forwarding is now idempotent per
   wrapper id; the double delivery itself is unexplained and logged.
5. **The first loop verdict was a broken instrument**: it labelled >4 total
   observations a loop, and mislabelled a held guard. Loops compound;
   duplicates are bounded. The line now tests growth and carries the story.
6. **In-memory peer tables + automated syncs erase the handshake**: the
   commit-watch task's tree extract restarted every tsx service and silently
   emptied EC2's peer directory between two measurement runs — forwarding
   died as `denied` (fail-closed worked; an unreachable or empty control
   plane never means "assume yes"). Directory persistence (bbmd §8) is now
   the top of the build queue, not a backlog line.

Two findings from the earlier measuring, not the predictions:

1. **`localhost` is not portable across the two runtimes.** Node 20+ can
   resolve it to `::1`; the native services bind `0.0.0.0` (IPv4 only), so
   the same URL works through docker's dual-stack port binding and fails on
   the EC2 stack with a bare `fetch failed`. The harness now pins
   `127.0.0.1`. Any script or service that dials `localhost` has this bug
   latent.
2. **A full-tree extract restarts every `tsx watch` service at once** — the
   harness raced the restart storm and reported `fetch failed`, which reads
   as "service broken" rather than "you just rewrote its source". The sync
   path should extract only changed files, or the runner should wait for
   quiet.

Left in place as visible evidence (in-memory, cleared by restart): the spike
bridge and the mirrored proxy node on each stack's registry — the EC2
console's topology should show `peerLocal:directory` and the local console
`peerEc2:directory`.

## Closed later the same day

The forwarding daemon exists (`scripts/federation-bridge.mts`), F4 and F5 are
measured above, and peers now journal to JSONL (`8621daf`) — verified
surviving `docker restart`, `--force-recreate` (volume-mounted like the
identity keys), and a native process kill on EC2 ("replayed 1 peer journal
entries"). Both directions re-verified after all of it:
`network.topology` allowed, `catalog.write` refused, both sides.

## Next: LLM capability borrowing (designed, deliberately not built tonight)

The first *useful* class on the seam: EC2 has no model credential and should
borrow the local stack's models service rather than ever holding a key.
Shape: a `model.inference.request` / `model.inference.response` pair, bridge
does request/response correlation by event id, key never leaves the Mac,
every borrowed call carries the lending installation's signature. Not built
tonight for one reason: the request side lives in the assistants engine,
and the parallel agent session is mid-rewrite there (`rule-executor`,
`provenance`, `types`). Building against a moving engine invites exactly the
kind of half-integrated seam this project exists to refuse. It goes first in
the next federation session, engine willing.
