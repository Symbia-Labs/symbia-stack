# Platform deficiencies surfaced by this spike

Ledger, per the governing rule: anything that could not be done through the
platform is logged here rather than worked around silently. Ordered by how
much of the edge↔cloud theory each one blocks.

**Closure state, end of 15 Aug** (stages of
`docs/proposals/models-defect-closure.md`; measurements in
`docs/2026-08-15-models-stage2-results.md` and `-stage345-results.md`):
§1 closed (stage 0, suite 28/28, spike 7/7 with workaround deleted).
§2 closed (stage 4, measured live: pull → digest → signed event → card, 5/5
predictions). §3 closed (stage 2, measured incl. forced mismatch). §4
closed (stage 3, 33/33, spike re-emits with zero local shapes). §5 closed
(stage 1, card stability observed across boots). §6 code-landed,
deploy-gated (stage 5 — deployed catalog rejects type `model` by enum,
measured; migration dry-run selects exactly the 4 old-shape cards). §7
fixed same day it was found; catalog route awaits deployed rebuild.

## 1. `@symbia/lineage`: sign-then-serialize is not round-trip-safe — LATENT, PRODUCTION-ADJACENT

Observed in this spike: an event signed without `continuity_context` failed
`verifyEvent` after being written by `lineageLine` and re-read, because
`lineageLine` materializes the absent field as `null` and the signature
covers the whole canonical document. 3/3 signatures failed until the spike
materialized the field before signing.

`sealDelegation` (`assistants/server/src/engine/provenance.ts:598`) builds
its event the same way — no `continuity_context` — and signs it. Whether any
production path currently round-trips a delegation through `lineageLine` is
NOT established; the reply envelope carries the event directly. But the
library's own serializer breaks the library's own signatures for the event
shape the library's only production caller produces. Fix candidates: sign
the normalized shape (signEvent runs lineageLine's normalization first), or
make absent-vs-null canonically identical. The first seems right; deciding is
the work.

## 2. No acquisition path for model artifacts

The parent arrived by `curl` from HuggingFace, exactly as `models/QUICKSTART.md`
instructs. Nothing in the models service can fetch, register, or digest a
weights file. For the edge↔cloud story the pull is the moment provenance
begins — digest at acquisition, source recorded — and today that moment
happens in a shell with no record. Proposed earlier (14 Aug conversation):
`POST /api/models/pull` through `@symbia/egress`.

## 3. No digest, anywhere, for weights

- `llama/engine.ts` loads whatever bytes are at the path; nothing hashes them.
- The catalog card (`model-sync.ts`) has no digest field.
- `RegistryEntry` has no digest field.

A signed derivation chain has nothing to attach to: the platform cannot state
*which* weights answered a request. Load-time digest verification is the
smallest closing move and makes the spike's chain consumable.

## 4. No derivation vocabulary

`@symbia/lineage` claims have no derivation/computation claim linking one
artifact to another through a recipe (the canonical-bus proposal's
`computation` claim is the nearest concept, unbuilt). This spike invented
`model.artifact.registered` / `model.artifact.derived` event types ad hoc.
If the mechanism is wanted, the vocabulary should be settled in the library,
not per-experiment.

## 5. model-sync writes live state into the catalog

`modelToCatalogResource` puts `loaded`, `status`, and `memoryUsageMB` into
catalog metadata on every boot — real-time point instances in the catalog,
against the standing catalog rule. Same code stamps `isBootstrap: true` on
runtime upserts, conflating a boot-time sync with a seed file (§6.1
territory). Known from the 14 Aug review; confirmed unfixed.

## 6. Models are not a catalog type

Cards live at `integrations/symbia-labs/models/*` with type `integration`.
An HF-style catalog wants `models/<org>/<name>` as a first-class type-plural
key with write-gate agreement. Decided direction from the 14 Aug
conversation; not built.

## 7. The catalog could not be asked by key — FOUND AND FIXED 15 Aug (route change runtime-unverified)

Found while measuring stage 2, not by reading. `storage.getResourceByKey`
existed with no route exposing it; `GET/PATCH/DELETE /api/resources/:id`
are id-only; the list route ignored unknown filters. Consequence in
model-sync: the by-key existence check always 404ed, the update branch had
never executed, the PUT verb it would have used has no route, and every
re-sync re-POSTed into the key's unique constraint. Fix: exact `key` filter
on the list route; model-sync finds-by-key then PATCHes by id. Second boot
measured: 4 updates, 0 failures. The catalog route itself awaits a deployed
catalog rebuild to be measured. Full record:
`docs/2026-08-15-models-stage2-results.md`.

## Environment notes (not platform defects)

- The cowork sandbox egress allowlist blocks huggingface.co (403 at the
  proxy). The spike ran model work on the Mac via Desktop Commander instead.
- Harness instrument errors (token cap, parser tiers) are disclosed in
  RESULTS.md — they misscored the parent 0/6 before any model was at fault.
  Same lesson as STATUS §11: an instrument that shares assumptions with its
  subject measures the assumptions.
