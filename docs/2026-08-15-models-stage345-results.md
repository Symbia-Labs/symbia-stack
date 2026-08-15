# Stage 3+4+5 results — measured where a runtime allowed it

15 Aug 2026, evening. Predictions for stages 3–4 in
`docs/2026-08-15-models-stage4-predictions.md`, committed at `d19995e`
before measurement.

## Stage 3 — artifact vocabulary: exit met

`@symbia/lineage` owns `artifact.registered` / `artifact.derived`: claims
in words (`ARTIFACT_CLAIMS`), a `verified`/`asserted` parent link that
throws on the contradiction of `verified` + measured non-reproduction, and
`eventDigest` exported so producer and verifier share one byte convention.
Suite 33/33. The spike re-emits its chain through the library with zero
local event-shape definitions and verifies 7/7.

## Stage 4 — pull through the platform: 5/5 predictions held

Models service on 5098, `MODELS_PATH=/tmp/models-fresh` (empty), identity
and catalog through the tunnel.

- **PC1 HELD** — unauthenticated pull → 401. (The `.mcp.json` bearer was
  also rejected, as the predictions doc anticipated it might be; the
  measurement used a real login as the seeded probe account.)
- **PC2 HELD** — pull of Qwen2.5-0.5B q4_k_m → 201,
  `sha256:74a4da8c…`, equal to an independent `shasum -a 256` of the file.
- **PC3 HELD** — one `artifact.registered` event in `.lineage.jsonl`,
  signature verifies via the sidecar public key.
- **PC4 HELD** — `scripts/verify-models.mts`: 8/8 (digests present and
  true, ledger verifies and chain recomputes, card carries no live state
  and agrees on the digest).
- **PC5 HELD** — re-pull → 200 `alreadyPresent`, same digest, ledger still
  one line.

The stage-4 exit criterion — empty directory to served, digested,
receipted model with no command outside the Symbia API — is met.

## Stage 5 — model catalog type: code landed, deploy-gated

Measured first: the DEPLOYED catalog rejects type `model` —
`invalid_enum_value`, options `[context, integration, graph, assistant,
component, app]`. So the runtime flip cannot be measured until a catalog
rebuild, and nothing here pretends otherwise.

What landed: `model` in `resourceTypes`; a key-prefix ⇄ type gate at POST
and PATCH for the `models/` prefix (the 9 Aug ruling's first enforcement at
the API — older prefixes are not retro-gated, stated in the code);
model-sync writes `models/<publisher>/<id>` type `model`, with the
publisher read from the artifact ledger BY DIGEST (`local` when no
registration exists — the absence is the information); `fetchCardDigest`
and `removeModelFromCatalog` fall back to the old key shape until
migration. `scripts/migrate-model-cards.mjs` is the gated catalog write:
dry-run measured against the deployed catalog — exactly the 4 old-shape
cards selected out of 59 resources; `--apply` refuses to proceed past a
failed create and was not run against the old catalog by design.

**Deploy coupling, stated plainly:** a new models service against an old
catalog logs sync failures (models still serve); an old models service
against a new catalog keeps writing the old shape (accepted, migratable).
Deploy both, then run the migration with `--apply`.

## Addendum, same evening — the bytes now enter through integrations

Brian's review caught a boundary breach in stage 4 as first landed: the
models service opened the socket to HuggingFace itself. The 12 Aug ruling
already said otherwise (integrations is the vault and the boundary; models
decides what to call and hands the call over), and the ruling was restated
15 Aug: models come in through the integrations service; the models service
is orchestration, selection, application, management.

Reworked and re-measured: `POST /api/integrations/download` (integrations)
owns egress and attaches the org's HF credential from the vault when one
exists; models' pull forwards the caller's bearer, streams from
integrations, and keeps everything else — digest-during-stream, ledger
event, card. `@symbia/egress` and the never-read `huggingfaceToken` config
field (in models config since February, zero readers) are REMOVED from the
models service: it now has no direct path to a third party and no
credential slot.

Measured against local builds of both services: unauth pull 401; authorized
pull returned the SAME digest `sha256:74a4da8c…` as the direct-egress pull
— the boundary moved and the artifact did not change by a byte; the ledger
event now records the redirect's final host (`us.aws.cdn.hf.co`) via the
X-Source-Url passthrough, which the direct pull had not captured; ledger
verifies (M1–M3 green). M4 (card) FAILED against the deployed catalog with
a loud `Failed to create resource: 400` — that is the stage-5 deploy
coupling observed live, not a new defect: the old catalog rejects type
`model`, models kept serving, nothing was half-written.

## Not established

The `models/` write gate and the migration `--apply` path against a running
catalog. The pull path with a token that is not the dev probe account. The
redirect target of `/resolve/` remains un-gated by egress (recorded in the
handler; sole-ingress proposal owns it).
