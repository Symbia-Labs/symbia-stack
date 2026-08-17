# R5 seed footgun — predictions (MAP)

*Registered before measuring. Remediates R5 (STATUS.md §6.1's own #1): `npm run
seed` runs `db.delete(resources)` then reloads only the snapshot, silently
reverting gated catalog writes. The fix makes destruction opt-in. The decision is
a pure function (`catalog/server/src/seed-guard.ts`) so it is testable without a
database; `seed.ts` uses it before any delete.*

## `seedForced(argv, env)` — is destruction explicitly requested?

| # | input | prediction |
|---|---|---|
| F1 | `argv` contains `--force` | true |
| F2 | `env.SEED_FORCE === "true"` | true |
| F3 | neither | false |
| F4 | `env.SEED_FORCE === "1"` (not the literal "true") | false (only "true" opts in) |

## `seedDecision(existingCount, forced)` — proceed or refuse?

| # | input | prediction |
|---|---|---|
| D1 | existingCount 0, forced false | proceed = true (empty catalog, nothing to destroy) |
| D2 | existingCount 0, forced true | proceed = true |
| D3 | existingCount 42, forced false | proceed = **false** (refuse) |
| D4 | existingCount 42, forced true | proceed = true (explicit overwrite) |
| D5 | refusal reason (D3) names the count (42) and how to override | true |

## Behavior of `seed.ts`

| # | prediction |
|---|---|
| B1 | With existing resources and no `--force`/`SEED_FORCE`, seed exits non-zero and calls **no** `db.delete`. |
| B2 | With `--force` (or `SEED_FORCE=true`), seed deletes and reloads as before. |
| B3 | On an empty catalog, seed proceeds without a force flag. |
| B4 | Importing `seed-guard.ts` touches no database (pure module). |

## Non-goals

- This does not build file→DB reconciliation (the other half of §6.1). It stops
  the *silent destruction*; deciding what a bootstrap file is for remains open.

---

## Measured (13 Aug 2026)

Pure-function predictions **9/9 held on first measurement** — F1–F4, D1–D5 all as
registered, no broken predictions this round. Test: `npm run test:security:seed-guard`.

- B4 held: the test imports `seed-guard.ts` and runs with no database, confirming
  the module is pure (no DB on import).
- B1–B3 are verified by construction: `seed.ts` now calls `seedDecision(existing.length,
  seedForced())` **before** any `db.delete(resources)`, exits `2` when it refuses,
  and only deletes when the decision proceeds. Catalog typechecks clean. A live
  end-to-end run (refuse on a populated catalog, proceed with `--force`) needs a
  stack and is left to the CI/dev environment; the decision that gates it is
  proven here.
