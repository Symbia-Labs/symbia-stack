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
| F4 | deferred | Needs the live edge (SSM tunnel; Mac `aws login` pending). |
| F5 | deferred | The loop test needs a real forward. Still registered to break. |

Two findings from the measuring, not the predictions:

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

Next build, in order: the forwarding daemon (data plane) that spends F4 and
deliberately breaks F5; the SSM tunnel as the one authenticated edge; mutual
peer declaration written from each other's offers.
