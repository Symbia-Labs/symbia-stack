# standalone (imagine mode) spike — results

15 Aug 2026, late. Predictions registered before the first run.

**It works: four services — identity, catalog, integrations, models — in
ONE Node process, on ONE port, with no Docker and no Postgres.**
`curl localhost:7100/` reports `mode: imagine` and every service answers
under `/svc/<id>/…`.

## Prediction outcomes

**PS1 (routes are mountable) — HELD, with a build step.** Each service's
exported `registerRoutes(httpServer, app)` accepts an Express sub-app and
answers under its prefix: catalog 200, models 200, identity 400 on a bad
login (a real answer from real auth code).

**PS2 (cross-service calls unchanged) — HELD on the wire.** Pointing
`CATALOG_SERVICE_URL` and friends at `http://localhost:7100/svc/<id>` was
the entire integration: models' registry called integrations and got a
valid response with no code change. The response was EMPTY, for the
reason in PS4 — the wire path works, the data was never seeded.

**PS3 (no database) — HELD.** With `DATABASE_URL` unset, every service
took the pg-mem path and said so, including "RLS NOT ENFORCED". That
warning is exactly the mode label the frame asks for, already in the
library.

**PS4 (composition roots are not reusable) — HELD as predicted-broken,
and it is the finding.** Each service's `index.ts` builds middleware,
telemetry, relay, database wiring and bootstrap inline and exports none
of it. A composition root can reach `registerRoutes` and nothing else, so
the standalone catalog serves **0 resources** where the containerized one
serves 54 — `runFirstTimeBootstrap()` lives in `catalog/server/src/index.ts`
and cannot be called from outside. Same cause for integrations returning
`{"providers":[]}`: provider configs come from the catalog it could not
seed. **Fix: factor each `index.ts` into an exported
`createService()`/`bootstrap()` that both the container entrypoint and a
composition root can call.** That is the whole gap between this spike and
a real standalone runtime.

**PS5 (module singletons collide) — NOT ESTABLISHED.** No collision
observed, and the slice is too small to claim absence: four services, no
relay, no messaging, one request at a time.

## Two blockers found by building, not by reading

1. **`@shared/*` is service-relative and collides.** catalog, identity and
   integrations each map the specifier to their OWN `shared/`, so a single
   module graph cannot resolve three different files behind one name —
   `tsx` fails with "Cannot find package '@shared/schema'". esbuild
   resolves it per service at build time, so **the composable unit is a
   per-service bundle, not the source** (`01-bundle-routes.sh`). The
   durable fix is unique aliases (`@catalog/shared`) or real package names.
2. **Bundles must live inside their service directory.** Third-party
   packages stay external (node-llama-cpp is native and cannot be
   bundled), and Node resolves those from the importing file upward — so
   a bundle emitted anywhere else fails on `drizzle-orm`.

## What this is worth

The addressing convention paid off: because the console already asks for
`/svc/<id>` and never a port, mounting services behind one origin needed
no client changes at all. That decision was made for the rebuild's
one-origin rule and it turns out to be what makes a single-process
runtime possible.

And the mode frame gets a concrete runtime: this process prints a banner
saying nothing here survives a restart, nothing is signed by a durable
identity, and none of it is a record. The pg-mem RLS warning says the
same thing from inside the library. Imagine mode is not a metaphor — it
is `node experiments/standalone/server.mjs`.

## Run it

    bash experiments/standalone/01-bundle-routes.sh
    STANDALONE_PORT=7100 node experiments/standalone/server.mjs
    curl localhost:7100/ | jq
