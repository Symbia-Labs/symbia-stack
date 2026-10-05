# Session close — 2026-08-15

Derived from the tree and from git. Anything not measured is listed under
**Not checked**. Figures were taken before this document was itself
committed; the close-out commit and push land after them.

## State of the tree

| | |
|---|---|
| Branch | `fix/2026-08-06-api-gaps` |
| Upstream | ahead 23 at measurement — pushed as part of this close |
| vs `main` | 276 ahead (was 176 at the 11 Aug measurement) |
| Tracked files | 1,056 (1,021 at the 14 Aug close) |
| Working tree | 1 untracked (`ai-frontiers-pitch-agent-action-provenance.md`, Brian's, untouched) |

`origin/main` moved to `0f65842` during the session (fetched, not merged).

## What changed — 23 commits, and the day's shape

The day was one arc: **make model weights first-class, provable artifacts,
end to end** — spike → library → service → catalog → console → engine
questions. Two of the 23 (`eb8a17a`, `6329b8a`, network edge geometry) were
Brian's, predating the arc.

**The spike that started it** (`8fb0073`): quantization is byte-
deterministic (Q4_K_M twice → one digest), a signed derivation chain
verifies from records alone (7/7), and six easy problems cannot separate
Q4 from Q2 on a 0.5B — P3/P4 broken as registered. Six platform
deficiencies ledgered in `experiments/model-derivation/DEFECTS.md`; the
closure plan is `docs/proposals/models-defect-closure.md`, all decisions
Brian's, taken same day.

**Stages 0–5 of the closure, each with predictions committed before
measurement:**

- `26c47ed` — @symbia/lineage signs/verifies/serializes ONE normalized
  event shape (the spike found sign-then-serialize broke its own
  signatures). 28/28.
- `887080a` — catalog cards stopped carrying live state; the
  never-called `updateModelStatus` deleted.
- `85d8c5d` — digests flow engine → registry → API → card; card/file
  mismatch disclosed at load. Measured with a forced-mismatch card.
- `03642e8` — found by measuring: **the catalog could not be asked by
  key** (`getResourceByKey` had no route; model-sync's update branch had
  never run; re-syncs died on the unique constraint). Fixed both sides.
  STATUS §6.15.
- `7d834f8`/`8636eca` — artifact vocabulary in the library
  (registered/derived, claims in words, verified-vs-asserted parent
  links); spike re-emits through it, zero local shapes.
- `d6da2de` — `POST /api/models/pull`: receipted acquisition. Measured
  5/5 from an empty directory.
- `3173a93` — catalog type `model`, `models/<publisher>/` prefix⇄type
  gate, migration script. Deploy-gated: the deployed catalog rejects the
  enum (measured); ship catalog+models together, then `--apply`.
- `a39445d` — **boundary rework on Brian's correction**: bytes enter via
  `POST /api/integrations/download` (egress + vault); models opens no
  third-party sockets, and its never-read `huggingfaceToken` config slot
  is gone. Same artifact digest through the new boundary.

**Console** (`a8886bf`, `47cd2ef`, `768badb`): a Models panel (registry by
digest, pull with rendered receipt, mismatch banners); the pull forwards
whichever credential the caller presented (browser walk found the console's
persisted bearer is an EMPTY STRING — sessions ride an identity cookie);
the assistant editor's model selects read the models registry instead of
integrations `/capabilities`, which had made platform-served models
structurally invisible.

**Step-weights spike** (`e369209`, `a14a3db`): per-step weight resolution
(pin-by-digest, constraints-with-recorded-rule) with sealed per-step
receipts, 8/8. The finding: **same-model self-consistency failed a
reproducibly-wrong model** — q2k answered 86 unanimously — while a
cross-substrate panel and a no-model computed check both caught it.
Escalation ranking for the engine: computed verification, substrate
panels, self-consistency as prefilter only. Step identity (11 Aug
deferred question) is now load-bearing.

## Defects: opened and closed today

Closed: lineage round-trip (§0-stage); catalog by-key (found+fixed);
model-sync collision-on-reboot; console assistant dialog blind to local
models; models-service credential slot; availability wording.
Opened/standing: console's empty-bearer-renders-authenticated (C2
family); no `seed` in chat API; registry entries lack bytes/precision;
whereabouts of Brian's console-created assistant not investigated.

## Not checked

Runtime behaviour of the catalog `?key=` route and the `models/` write
gate against a DEPLOYED catalog (old build behind the tunnel throughout).
The migration `--apply` path. Gated-repo pulls (no HF credential held).
Assistants-service behaviour under the rebuilt lineage dist in Docker
(image not rebuilt). The 14 Aug close's in-flight `package.json` edit —
absorbed earlier in an unexamined state.

## Local demo stack

Left RUNNING for Brian: console 8098 (`CONTROL_CENTER_PORT` override),
models 5098 (`MODELS_PATH=experiments/model-derivation/data`),
integrations 5097. Kill: `lsof -ti:8098,5098,5097 | xargs kill`. Ports
5001/5003/5008/8000 are an ssh tunnel to the remote stack — a lesson
relearned twice today: `lsof` before concluding anything about what is
answering.
