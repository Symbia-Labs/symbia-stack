# EC2 sync to 55dbe5d — 12 Aug 2026

`cowork-symbia-1` (i-08a4c8c9b50dc4c23, us-east-1) updated from the 9 Aug zip
to `55dbe5d` (11 Aug 21:05). Path: `git archive` → S3 staging bucket → SSM.
Old tree kept at `/opt/symbia/symbia-stack-aug9` as rollback. Verified: all
ten services running `tsx watch` with cwd in the new tree, markers from
`9449ad6` (onError/ceding) and `77f8402` (@assistant namespace) present,
control-center active on 8000, ports 5001–5010 listening, live relay traffic
in every log.

Three platform defects found by building from a clean tree — all masked
locally by stale `dist/` folders or by the docker/esbuild bundle path:

1. **`build:libs` omits three workspaces** — `symbia-crypto`,
   `symbia-lineage`, `symbia-stream-client`. A clean-tree `npm run build`
   fails at `symbia-http` (crypto types missing) and the control-center
   build fails on `@symbia/stream-client`. Works locally only because old
   `dist/` folders linger.
2. **`build:services` includes `service-admin`, which has no build script**
   — root `npm run build` always exits nonzero at the last step, even when
   everything real has built.
3. **Integrations dies under tsx/Node ESM**: `oauth/providers/index.ts:66`
   re-exports `OAuthProvider` (a type) as a value from `./base.js`. esbuild
   bundling erases the problem; running from source does not. This is why
   port 5007 has been dead on the EC2 instance since 9 Aug while the local
   docker stack showed integrations healthy. Worked around on the instance
   by running `node dist/index.mjs`; the fix is `export type` in the
   re-export.

## Data-plane refresh (same day, after approval)

`verify-assistants.mts` initially returned NO REPLY on every probe. Chasing it
surfaced two more findings:

4. **Catalog's data directory resolves wrong when run from source.**
   `seedFromDataFiles` uses `join(__dirname, "..", "data")` — correct for the
   bundled `/app/dist` layout, but from source that is `catalog/server/data`,
   not `catalog/data`. On EC2 the first-run bootstrap logged "No bootstrap
   data found to load". This, not the duplicate-key abort, is why the
   instance's catalog was partial since 9 Aug. Worked around with a symlink;
   the fix is resolving the data dir relative to the package root.
5. **No `DATABASE_URL` means silent pg-mem.** The services on the instance run
   with in-memory databases; the local Postgres (per-service DBs, 16 catalog
   rows) is an Aug 9 relic nothing reads. `@symbia/db` falls back without
   any warning louder than one log line. Every restart is a data wipe.

After the symlink + re-seed + assistants restart: catalog seeds 38 resources,
the loader registers the three-assistant roster (calculator, smart-calc,
coordinator), and verify-assistants runs the full suite. **The envelope
section passes clean** — provenance fields 1/1, seal verifies from the
envelope alone, signature verifies, OEP enforcement 11/11. The eleven
behavioural predictions all fail with one cause: `No LLM provider has a
usable credential` — every probe lands on coordinator and REFUSES. The
instance has no model-provider key; parity with local ends there.

Operational note: the AWS MCP connector's command guard blocks `unzip`/
extraction with `../` relative paths and any command containing a URL
(including `http://localhost` health checks). Health verification on the
instance therefore rests on ports + process cwd + request-serving logs, not
HTTP probes. A bucket policy now grants the instance role read on
`cowork-staging-686511310375/symbia-55dbe5d.zip` for future syncs.
