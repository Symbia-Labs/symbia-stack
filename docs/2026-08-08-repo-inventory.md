# Repo inventory and orphan sweep — 8 Aug 2026

Branch `fix/2026-08-06-api-gaps`. Working tree at start: 4 modified, 3
untracked. 954 tracked files, 865M on disk (266M of that `node_modules/`).

This document is written **before** the deletion so the predictions below can
be measured rather than narrated. Findings are separated from inferences per
discipline 7.

---

## 1. What was measured

| observation | value |
|---|---|
| tracked files | 954 |
| repo on disk | 865M |
| `node_modules/` | 266M |
| empty directories (excl. `.git`, `node_modules`) | 1 — `Relaunch/` |
| tracked binaries | 1 — `symbia-control-center/spyglass-drive.png` |
| nested `package-lock.json` under npm workspaces | 21, plus the root lock |
| files in `catalog/artifacts/` | 115 |
| distinct content hashes in `catalog/artifacts/` | 105 |
| source files whose basename appears in no other tracked file | 140 |

### The 140 "unreferenced" source files are mostly not orphans

Naming the raw number without decomposing it would be the fuzzer mistake —
a severity taxonomy that shares the optimism of the thing it measures. The
breakdown:

- **115** are `catalog/artifacts/*/executor-*.js` — content-addressed blobs
  referenced by database row, not by import. Not orphans by this method's
  definition; the method cannot see the reference.
- **9** are `catalog/scripts/load-*.ts` / `create-v8-*.ts` — one-shot
  migration scripts, invoked by hand, never imported.
- **6** are `symbia-control-center/scripts/drive-*.mjs`, `verify-browser.mjs`,
  `round-trip.mjs` — driver scripts, invoked by hand.
- **3** are `scripts/check-*.mts`, `ground-coordinator.mts` — same.
- **1** is `symbia-control-center/tailwind.config.js` — read by tooling, by
  convention, not by import.
- The residue is small enough to name individually and none of it is dead.

**Conclusion: "unreferenced by import" is not "orphan."** The measurement was
built before it was trusted, and it did not survive contact. Recorded here so
the number is not cited later as though it meant what it appears to mean.

---

## 2. What is being deleted (11 files, 1,025,567 bytes)

Each was checked for inbound references across every tracked text file.
All eleven had zero.

| file(s) | why |
|---|---|
| `catalog/server/src/db.ts.backup`, `index.ts.backup` | hand copies from 29 Jan; both differ from the live file, which is what makes them dangerous rather than merely redundant |
| `identity/server/src/db.ts.backup`, `index.ts.backup` | same |
| `logging/server/src/db.ts.backup`, `index.ts.backup` | same |
| `integrations/data/model-eval-backup-2026-01-28T00-42-57-900Z.json` and 3 siblings | 28 Jan eval snapshots, ~1.0MB of the 1.03MB total |
| `symbia-control-center/spyglass-drive.png` | stray committed screenshot; `scripts/drive-spyglass.mjs:201` writes to `/tmp/spyglass-drive.png`, so the repo copy is not the script's output path |
| `Relaunch/` (empty directory, untracked) | left behind 8 Aug |

### Two files were on the delete list and were removed from it

`symbia-control-center/tsc-baseline-2026-08-06.txt` (49 errors) and
`tsc-after-vite-2026-08-06.txt` (43 errors) look exactly like build logs and
were classified as such on the first pass. They are the **cited evidence for
finding F12** — `docs/2026-08-06-control-center-rebuild.md:688` names the
baseline file directly. Deleting them would have removed the measurement
behind a recorded finding while leaving the finding standing, which is the
same failure as a confident `0` that means "never asked."

They stay. 12KB. This correction is the reason the sweep was written down
before it was run.

---

## 3. Predictions, registered before measuring

- **P1** — `npm run check:ports` passes after the deletion, unchanged.
  *Basis: none of the eleven files appear in `OPERATIONAL` in
  `scripts/check-ports.ts`.*
- **P2** — `git status` after the deletion shows the 4 pre-existing
  modifications and 2 untracked `.tsx` files still present, plus `.claude/`.
  The sweep touches nothing that was already dirty.
- **P3** — `git ls-files | wc -l` goes 954 → 943.
- **P4** — **the one I expect to get wrong.** No build step, Dockerfile or
  compose file copies `integrations/data/` wholesale in a way that breaks on
  a missing file. I have not read every Dockerfile; this is the prediction
  with the least evidence under it.

---

## 4. Deliberately not touched, and why

- **21 nested `package-lock.json`** — npm workspaces resolves from the root
  lock; these are ignored by the installer and drift silently. This is the
  F2/F4 class exactly: a hand-maintained copy of a derived fact. It is a
  defect, logged here, not fixed in this pass.
- **10 duplicate blobs in `catalog/artifacts/`** — 115 files, 105 hashes.
  `catalog/scripts/remove-duplicate-executors.ts` exists and appears never to
  have been run against the checked-in copy. That these are byte-identical is
  an observation; that they are safe to deduplicate is an inference requiring
  the catalog rows be read first.
- **`website/`** — three unreferenced mockups, all containing the retired port
  5054, and the last Vite build in the repo. The one-build-mode ruling governs
  the console, not the website, so no ruling is violated. Still the only place
  5054 survives outside comments and `dist/`.
- **`service-admin/`** — checked because the directory name is retired
  vocabulary. It is live: `docker-compose.yml:337`, `start.sh:106`,
  `start-local.sh:313`, serving `ServiceId.API` on 9000. Not an orphan; the
  directory name simply lags the service id.
- **`mcp/`** — a deliberate version-controlled copy of the Claude Desktop
  extension, documented as such in its own README. Not a duplicate of
  `symbia-mcp-server/`.

---

## 5. Results

*Filled in after the deletion. See §6.*
