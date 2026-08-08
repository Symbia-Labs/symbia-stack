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

### Predictions, measured

| | prediction | outcome |
|---|---|---|
| **P1** | `check:ports` passes unchanged | **Held, then deliberately voided.** It passed — but see §6, because passing was not evidence of anything. |
| **P2** | working tree keeps its 4 modified + 3 untracked, sweep touches nothing already dirty | **Broken once, caught, repaired.** A `git add -A` staged all seven alongside the sweep. Unstaged before commit; final tree is the original 4 + 2 (`.claude/` is now ignored, which is the third). |
| **P3** | 954 → 943 tracked files | **Superseded.** Scope grew mid-pass. Measured 954 → 922: −11 dead artifacts, −21 energy net of the ledger move, −1 `.mcp.json`, +1 this document. |
| **P4** | *"the one I expect to get wrong"* — nothing breaks on a missing `integrations/data/` | **Held, for a reason I had not read.** The four backups were that directory's only tracked contents, so deleting them removed the directory. `routes.ts:1682` writes `join(process.cwd(), "data", …)` on DB export, which looked like a break — but `exportMemoryDatabase` in `symbia-db/src/memory.ts:34` does `mkdirSync(dir, { recursive: true })`. The prediction was right; my confidence in it was still misplaced, because it survived on a line two packages away that I only read afterwards. |

### Scope, as executed

The sweep was interrupted by a larger goal — a clean clone that an end user can
download and start — and grew to match:

1. **11 dead artifacts** removed; `*.backup` ignored.
2. **The energy app removed** (22 files); its ledger preserved as
   `docs/API-MEASUREMENTS.md` with all inbound citations repaired.
3. **Published ports cut from 11 to 1.** Default surface is 9000. Developer
   ports moved to `docker-compose.dev.yml`, explicitly not an auto-loading
   override.
4. **`.mcp.json` untracked**, `.mcp.json.example` shipped.
5. **Two broken doc links repaired**, found by walking every relative markdown
   link in a fresh clone.

---

## 6. What the pass got wrong

Four errors, all the same shape: a conclusion reached before the cheap check
that would have settled it.

**The token.** Reported as a live credential requiring rotation. It is a JWT
with `exp` 2026-02-08 — expired six months. Decoding it takes one command and
came after the alarm rather than before. The real finding was the opposite and
more interesting: the integrations MCP endpoint has been returning 401 since
February.

**The lock.** `.git/index.lock` plus a failing `rm` was read as a live process
holding it. `rm` was failing because the sandbox had no delete permission on
that mount — a fact never checked. Two different causes, identical evidence,
and the wrong one was inferred. Discipline 5, in a costume it had not worn
before.

**The orphan detector.** It reported 140 unreferenced source files. 115 are
content-addressed blobs referenced by database row and 19 are hand-invoked
scripts; the method structurally cannot see either. Had the number been
reported before being decomposed, it would have become a citable fact meaning
nothing. Written up in §1 rather than quoted.

**`check:ports` passing.** After the exposure change the check still passed —
matching each port *number* anywhere in `docker-compose.yml`, which the header
comment and `IDENTITY_SERVICE_URL: http://identity:5001` satisfy on their own.
It would have gone on passing with nothing published at all. Rewritten to match
published mappings only, then **verified to fail** by adding a second port to
the base file and watching it break. A green check nobody has seen fail is
`0` meaning "never asked".

---

## 7. Logged, not fixed

- **21 nested `package-lock.json`.** npm workspaces resolves from the root lock;
  these are ignored by the installer and drift silently. F2/F4 class.
- **10 duplicate blobs in `catalog/artifacts/`** — 115 files, 105 hashes.
  `catalog/scripts/remove-duplicate-executors.ts` exists and appears never to
  have run against the checked-in copy.
- **`symbia-control-center/archive/`** — 9 dead panels including
  `archive/energy/EnergyPanel.tsx`, which now references an app that no longer
  exists.
- **`website/`** — three unreferenced mockups, all containing retired port 5054,
  and the last Vite build in the repo. Not the console, so no ruling violated.
- **6 dangling relative links** in `models/TESTING-REPORT.md` and
  `catalog/INTENT.md`, pre-existing and unrelated to this pass.
- **`README.md` has no quickstart.** For a repo whose next test is "clone it and
  start it", that is the gap most likely to be hit first.
