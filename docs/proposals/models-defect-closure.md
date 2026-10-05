# Models service: closing the model-derivation defect ledger

Status: PAPER. Proposed 15 Aug 2026, from
`experiments/model-derivation/DEFECTS.md` (six items, one spike behind each).
Six stages, ordered so each lands independently and nothing downstream has to
be redone. Every stage names its exit measurement; predictions get registered
in git before each measurement, per MAP.

## Stage 0 — `@symbia/lineage`: make sign and serialize agree (ledger §1)

The defect: `lineageLine` materializes absent `continuity_context` as `null`;
the signature covers the whole canonical document; so an event signed without
the field fails `verifyEvent` after a round-trip through the library's own
serializer. `sealDelegation` produces exactly that shape today.

**Decision needed first** (Brian): normalize-before-sign (`signEvent` applies
`lineageLine`'s field materialization before digesting) or make absent ≡ null
in `canonicalJson`. The first is local to lineage and does not touch the
crypto layer; the second changes canonicalization for every consumer and is
almost certainly wrong for that reason — but it is a ruling, not a default.

Work: the chosen fix; a regression test in `test:security` shape (sign an
event without the optional field, round-trip through `lineageLine`, verify);
a check whether any persisted delegation events exist that would fail
verification under the fix.

**Exit:** the spike's `02-sign-chain.mjs` with its materialization workaround
*removed* passes `04-verify.mjs` 7/7. The workaround comment gets deleted the
same commit — a fixed library must not leave callers defending against it.

## Stage 1 — stop writing live state into the catalog (ledger §5)

Remove `loaded`, `status`, `memoryUsageMB` from `modelToCatalogResource`;
stop stamping `isBootstrap: true` on runtime upserts. Live state is the
registry's job by the 12 Aug ruling; the card describes the artifact.

Smallest stage, no dependencies, stops an ongoing rule violation. Also the
right moment to delete the `provider === "symbia-labs"` special case in
integrations (TESTING-REPORT fix #2) or log why it stays: a second copy of
"which providers are local" beside `REMOTE_PROVIDERS`.

**Exit:** grep proves no live field crosses into catalog writes; a boot
against a running catalog produces cards whose metadata is stable across two
boots (byte-identical modulo timestamps).

## Stage 2 — digest the weights (ledger §3)

- `llama/engine.ts`: sha256 each GGUF at scan (streaming; cache by
  mtime+size so boot does not rehash a terabyte).
- `RegistryEntry` gains `digest`; `/api/models` and `/v1/models` carry it.
- Load-time check: on load, recompute or read cached digest and compare with
  the card when one exists. **Decision needed:** mismatch refuses to load, or
  loads with the mismatch disclosed on every reply. Refusal is the OEP-shaped
  answer; disclosure may be the operable one during migration. Default to
  disclose now, ratchet to refuse when Stage 4 lands.

**Exit:** `/api/models/:id` returns a digest that matches `shasum -a 256` of
the file; a deliberately corrupted copy is detected (measured, not assumed).

## Stage 3 — derivation vocabulary in `@symbia/lineage` (ledger §4)

The spike invented `model.artifact.registered` / `model.artifact.derived` ad
hoc. Settle the shape in the library: an `artifact.registered` and
`artifact.derived` event pair (or the canonical-bus `computation` claim —
one decision, not two vocabularies), where `derived` carries parent digest,
child digest, recipe (tool, version, args, input digests), and a
`deterministic` flag with the reproduction digest when measured. Distillation
and fine-tunes get `parent: asserted` rather than a verified link — the lane
vocabulary already has the words for this.

Mostly a decision plus types; the spike's events become the worked example.

**Exit:** the spike re-emits its chain using library types with zero local
event-shape definitions, and verifies.

## Stage 4 — pull through the platform (ledger §2)

`POST /api/models/pull` `{repo, file}` (auth required): fetch via
`@symbia/egress`, stream to `MODELS_PATH`, digest during the stream, emit
`artifact.registered` signed with the service identity, write the catalog
card (Stage 1 shape, Stage 2 digest, source repo/file/url). QUICKSTART's
hand-`curl` section is replaced by one call the same commit.

**Exit:** a fresh checkout goes from empty `MODELS_PATH` to a served,
digested, receipted model without any command outside the Symbia API.
`verify-models.mts` (new standing evidence, `verify-assistants` shape)
checks: card has no live fields, digest matches disk, registered event
verifies from the envelope alone.

## Stage 5 — models become a catalog type (ledger §6)

New type `model`, keys `models/<org>/<name>`, write-gate key-prefix ⇄ type
agreement per the 9 Aug ruling. Migration of the existing
`integrations/symbia-labs/models/*` rows by **gated catalog write script**
(`scripts/` — never bootstrap JSON, §6.1). model-sync and Stage 4 write the
new shape; old keys get tombstoned or left to expire, decided in the
migration script, recorded in its output.

Last deliberately: it touches catalog write-gate code that Stages 1–4 do not,
and the earlier stages are all expressible in the old key shape.

**Exit:** `npm run verify:models` green against a running stack with cards
under `models/`, and the write gate rejects a `models/` key with a non-model
type (measured by attempting one).

## Not in this plan, on purpose

Quantize-as-a-service (`POST /api/models/derive`) — real, but it rides on
Stages 2+3+4 and deserves its own proposal once those exist. Remote-model
cards — excluded by the 12 Aug ruling; remote ids stay the registry's
problem. Embeddings, GPU, hot-reload, rate limiting — TESTING-REPORT gaps,
not provenance work; they queue behind this, not inside it.

## Decisions Brian owns

1. Stage 0 fix semantics (normalize-before-sign is the recommendation).
2. Stage 2 mismatch policy (disclose now / refuse later is the
   recommendation).
3. Stage 5 key shape: `models/<org>/<name>` vs `models/<name>` — org-in-key
   interacts with the app-vs-installation rule (`docs/APP-MODEL.md`).
