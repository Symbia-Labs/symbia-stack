# R2 explicit-client seam — predictions (MAP)

*Registered before measuring. Remediates R2: the ALS pool wrapper does not cover
`pool.connect()` / `db.transaction()` explicit-client paths, so those can bypass
the request's RLS context. Closing every existing site needs per-site review; the
round-2 doc's recommendation is a **ratchet** that keeps the seam from widening.
This test inventories `pool.connect()` sites per file against a reviewed baseline
and fails when a new one appears without review.*

## Reviewed baseline (per-file `pool.connect()` counts, 13 Aug 2026)

| file | count | classification |
|---|---|---|
| `identity/server/src/db.ts` | 1 | boot: schema/init (no request RLS needed) |
| `logging/server/src/db.ts` | 1 | boot: schema/init |
| `assistants/server/src/index.ts` | 1 | to review (index bootstrap path) |
| `messaging/server/src/database.ts` | 2 | boot: init + export/backup |
| `messaging/server/src/models/message.ts` | 1 | **request path — known-uncovered; follow-up to wrap in withRLSContext** |

## Predictions

| # | prediction |
|---|---|
| R2-1 | On the current tree, measured per-file counts equal the baseline ⇒ PASS. |
| R2-2 | A `pool.connect()` added in a file **not** in the baseline ⇒ FAIL (new seam). |
| R2-3 | An **additional** `pool.connect()` in a baseline file (count exceeds) ⇒ FAIL. |
| R2-4 | Comments containing `pool.connect()` are not counted (only real calls). |
| R2-5 | Fewer calls than baseline ⇒ PASS (removing an explicit client is always safe). |

## Non-goals

- Does not itself wrap the existing sites. `models/message.ts` is flagged as the
  one request-path site to convert to `withRLSContext`/wrapped query in a
  follow-up; this test stops NEW uncovered sites from landing silently.

---

## Measured (13 Aug 2026)

- **R2-1 held:** measured per-file counts equal the baseline exactly
  (`assistants/.../index.ts`:1, `identity/.../db.ts`:1, `logging/.../db.ts`:1,
  `messaging/.../database.ts`:2, `messaging/.../models/message.ts`:1).
- **R2-2 held, measured (not assumed):** a throwaway
  `network/server/src/__ratchet_probe__.ts` with one `pool.connect()` made the
  ratchet FAIL (`found:1, baseline:0`); removing it returned it to green.
- **R2-4 held:** the comment line `// (pool.connect()) are NOT covered` is not
  counted; only awaited/assigned `.connect()` calls are.
- R2-3 / R2-5 follow from the same `count > allowed` comparison exercised by R2-2.

Ratchet is green on the current tree (2/2) and wired into `verify.yml`.
