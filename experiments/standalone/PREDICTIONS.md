# standalone (imagine mode) spike — predictions

Registered 15 Aug 2026 before any run. Broken ones get reported as broken.

Goal: one Node process, one port, no Docker, no Postgres — every service
mounted as a sub-app at `/svc/<id>`, which is the addressing convention
the console already uses. This is what imagine mode's runtime would be
(operating-modes.md): in-memory, unsigned-by-default, restart-lossy, and
SAYING SO.

Slice for the spike: identity, catalog, models, integrations. Enough to
exercise auth, a store, the registry, and a cross-service call.

- **PS1 (routes are mountable):** each service's exported
  `registerRoutes(httpServer, app)` accepts an Express sub-app and its
  routes answer under `/svc/<id>/…` on the single port.
- **PS2 (cross-service calls work unchanged):** with
  `CATALOG_SERVICE_URL=http://localhost:PORT/svc/catalog` (etc.), a
  service-to-service call resolves and succeeds with no code change —
  the path-prefix convention absorbs it.
- **PS3 (no database required):** with `DATABASE_URL` unset, `@symbia/db`
  falls back to pg-mem and the catalog serves reads. The spike DECLARES
  the fallback at boot rather than letting it pass silently (§5 of the
  12 Aug EC2 findings: "every restart is a data wipe", logged once).
- **PS4 (composition roots are not reusable — expected BROKEN):** each
  service's `index.ts` does routes AND middleware AND telemetry AND relay
  AND bootstrap in one non-exported block, so mounting `registerRoutes`
  alone loses auth and bootstrap. Predicting this breaks, and that the
  fix is factoring each index.ts into an exportable composition function.
- **PS5 (module singletons collide):** two services in one process share
  module state that was per-process before (caches, chain heads, engine
  instances). Predicting at least one observable collision or, if none,
  that the absence is because the slice is too small to show it.

Not in scope: the relay/websocket layer (`initServiceRelay`), messaging,
the network service, and static console serving. Those are the parts most
likely to need real work and are deliberately excluded so the spike
answers the mounting question first.
