# Deploy — 15 Aug 2026, late

The day's work put on the running stack. Measured at each step; the
defects found by deploying are listed because they were found by deploying.

## What the "remote stack" actually is

Corrected here because I asserted otherwise several times during the
session: ports 5001/5003/5008/8000 are forwarded by **Colima** — the local
Docker VM — not an ssh tunnel to EC2. `cowork-symbia-1`
(i-08a4c8c9b50dc4c23) is **stopped**, and `.ec2-last-sync` still reads
`4bb72ff` (12 Aug). Nothing was deployed to EC2 tonight; "deploy" here
means rebuilding the local Docker images that serve the stack.

## Defects found by building from a clean context

1. **No `.dockerignore` existed at all.** Every `docker-compose build`
   shipped the entire tree to the daemon — measured at 1.2 GB and still
   climbing when killed, because the model-derivation spike's 3.0 GB of
   GGUF weights sit under `experiments/`. Added; the context is now
   **5 MB**. This affected every build the project has ever done, not
   just tonight's.
2. **integrations' Dockerfile did not copy `symbia-egress`** — the
   download route landed today and the image had never been rebuilt to
   see it. Added.
3. **models' Dockerfile did not copy `symbia-lineage`** (the artifact
   ledger, also today). Adding it surfaced three more:
   - `npm install` in `symbia-lineage` 404s: `@symbia/crypto` is a
     peerDependency at `*`, and npm 7+ resolves peers from the public
     registry. Fixed with `--legacy-peer-deps` plus a sibling symlink —
     the same shape the assistants Dockerfile already used.
   - The symlink must come AFTER `npm install`, which prunes anything it
     did not place.
   - **`@symbia/lineage` did not compile from a clean install.**
     `retrieval.ts` assigned `cert.subject.CN` / `valid_from` / `valid_to`
     (typed `string | string[]` in current `@types/node`) to `string`
     fields. Invisible locally because the resolved types in the existing
     `node_modules` were older. Fixed with an explicit narrowing helper.
     This is the EC2-sync lesson repeating: a clean build is a different
     measurement from a local one.

## Deploy sequence, as executed

Rebuilt catalog, models, integrations, assistants; brought the stack up
with **both** compose files. Recorded because I got it wrong first:
`docker-compose up -d <svc>` without `-f docker-compose.dev.yml` recreates
containers WITHOUT published ports — the dev override is what publishes
5001/5003/5008/8000. Correct invocation:

    docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

## Verified on the deployed stack

- Running bundles carry today's markers (`DIGEST MISMATCH` in models,
  `key-prefix and type disagree` in catalog) — checked in the containers,
  not inferred from the build log.
- 13 containers up; catalog, models, console all answer 200.
- **The stage-5 gate works deployed:** `type: model` at a `models/` key →
  201; `type: integration` at a `models/` key → 400 with the disagreement
  message.
- **Migration applied:** 4 old-shape cards moved to `models/local/…`,
  each as create-then-delete, no failures. Probe row cleaned.
- **The whole acquisition path works deployed, end to end:** an
  authenticated pull of `Qwen/Qwen2.5-0.5B-Instruct-GGUF` returned
  `sha256:74a4da8c…` (the same digest measured twice earlier tonight on
  local builds), wrote `.lineage.jsonl` + `.lineage.pub.pem` beside the
  weights in the container's volume, and produced a card at
  `models/qwen/qwen2-5-0-5b-instruct-q4-k-m`, type `model`, digest
  present, **no live fields**.

## Not done, and one of them is a standing defect

**The control-center image did not rebuild** — `npm run build:libs` exits
2 partway through (after `catalog-client`). This is defect #1 of the
12 Aug EC2 findings, still unfixed: `build:libs` names sixteen workspaces
and omits `symbia-crypto`, `symbia-lineage`, and `symbia-stream-client`,
so a clean image build cannot resolve them. Local builds work because
their `dist/` folders linger. Consequence tonight: the deployed console
at :8000 does NOT have the Models panel, which was verified against a
local build earlier this evening instead. The fix is small (add the three
workspaces, in dependency order — crypto before lineage) but it belongs
to a session with time to measure what it cascades into.

EC2 is still stopped and still at `4bb72ff`; nothing was pushed to it.
`verify-models.mts` was not run against the deployed stack: it reads
`MODELS_PATH` from the host filesystem while the deployed weights live in
a container volume, so it needs a container-aware mode. The deployed
models service is running `MODELS_PATH=/data/models` with exactly one
artifact — the one pulled during this verification.
