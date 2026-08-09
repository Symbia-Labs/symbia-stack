# Session close — 8 Aug 2026

Written at the end of the session so tomorrow starts from a record rather than
a memory. Observations are separated from inferences. Nothing here is a verdict
on the platform; it is a statement of what was changed, what was measured, and
what was deliberately not done.

---

## 1. State of the tree

| | |
|---|---|
| branch | `fix/2026-08-06-api-gaps` |
| unpushed | **4 commits** — the push needs your credentials |
| `origin/main` | `12418c1`, PR #6 merged earlier today |
| tracked files | **894** (954 at session start) |
| working tree | 4 modified, 2 untracked — all yours, all console work, untouched all session |

The uncommitted files are `docs/2026-08-08-catalog-review.md`,
`docs/2026-08-08-messaging-guide.md`, `CatalogPanel.tsx`,
`GraphFlowPreview.tsx`, and the new `OperationDiagram.tsx` / `SymbiaNode.tsx`.
They were staged twice by a `git add -A` during the session and unstaged both
times. They are in-flight work, not leftovers.

## 2. What changed

Twelve commits, `281711d`..`1e23dc5`. Three classes.

**Removed.** The energy app (22 files); its defect ledger kept and moved to
`docs/API-MEASUREMENTS.md` with every inbound citation repaired. The marketing
site `website/` (28 files) and `SYMBIA_WEB_CONTENT_INSTRUCTIONS.md` (1,097
lines of January-vintage positioning that mentioned `control-center`,
`service-admin`, `8000` and `9000` zero times each). Eleven dead artifacts —
six `.ts.backup` copies from 29 Jan, four model-eval JSONs, a stray screenshot.
`.mcp.json`, replaced by `.mcp.json.example`; the token in it had been expired
since 2026-02-08. `work/2026-08-05-energy-and-honesty-repairs`, whose 23 deploy
commits were already safe on `origin/archive/2026-02-deploy-infrastructure`.

**Exposure.** Published ports went from eleven to one. `docker-compose.yml`
publishes 9000 alone; developer ports live in `docker-compose.dev.yml`, which
`start.sh` opts into via `COMPOSE_FILE`. It is deliberately not named
`docker-compose.override.yml` — Compose loads that automatically, which made
the declared default a fiction. `check-ports.ts` now asserts the default
surface and was verified to fail when a second port is added.

**Fixed.** `user_credentials` was missing six OAuth columns that
`shared/schema.ts` has declared since the OAuth work landed; the console
rendered "Not configured" on every provider card as a result. `resolveServicePort`
no longer falls back to a retired port for an unknown id — it throws.
Integrations' OAuth error redirect no longer sends browsers to a hardcoded dead
address that, because neither env var is set anywhere, was the only path that
code ever took. README, QUICKSTART and the console README brought in line with
what the code does.

## 3. Four errors worth carrying forward

All the same shape: **a conclusion reached before the cheap check that would
have settled it.** Recorded because the pattern is the finding, not the
individual mistakes.

1. Called the `.mcp.json` token a live credential needing rotation. Decoding
   its `exp` — one command — showed it had been dead for six months.
2. Read a stale `.git/index.lock` plus a failing `rm` as a live process. The
   `rm` was failing on a sandbox permission never checked.
3. Reported "the README has no quickstart" from a `grep 'quick ?start'`, where
   `?` is not optional in basic grep. It had one, at line 75.
4. Wrote "that is the whole surface: one port" directly beneath `./start.sh`,
   which publishes twelve. The next section of my own text contradicted it.

Two mechanical lessons already encoded in the repo: `check-ports.ts` was
passing after the exposure change by matching port *numbers* anywhere in the
file, including a header comment — a check a comment can satisfy is not a
check, and it now matches published mappings and has been watched to fail. And
the orphan detector's headline "140 unreferenced files" was 115 content-addressed
blobs plus 19 hand-invoked scripts; it is decomposed in
`docs/2026-08-08-repo-inventory.md` rather than quoted.

## 4. Tomorrow: runtime

**Baseline, measured today:** `npx tsc --noEmit -p .` in `runtime/` exits **0**
with no output. It is the cleanest service in the repo — `catalog`,
`assistants`, `messaging`, `network` and `models` all have pre-existing errors
from the F12 backlog. Starting from a green typecheck is worth something; keep
it green.

In `runtime/docs/architecture.md`, Phases **1, 2 and 3 carry an explicit
`— implemented` marker. Phases 0 and 4 do not.** Phase 4 is
registry-derived topology and governance closure, and is plainly still ahead.
Phase 0 is the interesting one: its stated blocker is D2b, which the 5 Aug
evening ledger update re-characterised as *not* the defect it appeared to be
and marked partially resolved, and its two deliverables — the gated catalog
write path and a first-class `component` manifest resource — are both described
elsewhere as landed. So Phase 0 is very likely done and merely unmarked.

**That is an inference, not an observation.** Confirm it against the code
before treating Phase 4 as the next step; an unmarked phase and an unfinished
phase produce identical evidence in a document.

Four open ledger defects are runtime-shaped. In the order I would take them:

- **D8** — `GET /api/graphs` answers `{"loadedGraphs":1,"activeExecutions":1,
  "graphs":[]}`. A summary contradicting the array beneath it, in the service
  about to be worked on. It is the same defect as the dashboard reporting 8/8
  without asking, and it is cheap to settle.
- **D7** — a new metric series per runtime restart. `ensureMetric` caches by
  name in-process only and names are not unique per (org, service), so three
  `energy.v2.pue` series exist. Readers must union them or silently see a
  fraction.
- **D6** — graph-written metrics land in the system org and `POST
  /api/metrics/query` rejects the system credential, so a graph can persist a
  series the obvious read path cannot see. Structural, and the reason the old
  panel rebuild was never just a UI job.
- **D9** — now has an answer rather than a question. The two definition-less
  `type: graph` resources are `energy.graph.pue` and `energy.graph.ingest`;
  their app is gone, so unregister. This is a catalog write against a running
  stack, not a repo change — worth doing while watching what hydration reports
  before and after.

**Do not delete the `energy.v2.*` series in Logging.** They are the only
concrete evidence D6 and D7 ever fired. The app that produced them is gone; the
readings are not.

## 5. Standing gaps, unchanged by today

- **Nobody has run `docker compose up` against this tree.** Structure was
  verified — clone, ports, anchors, every relative markdown link, every
  `start.sh` flag the README claims — but there is no Docker in the sandbox.
  The boot is a *not checked*, not a pass.
- **The console CSS build is unverified.** `tokens.css` moved into
  `symbia-control-center/src/styles/`; the import path resolves and the file is
  inside the Dockerfile's wholesale `COPY`, but Tailwind is not installed in the
  sandbox. One `npm run build -w symbia-control-center` settles it.
- **`npm run check` is still red overall** — the F12 backlog, untouched.
- **`main` is 60+ commits behind this branch** if the download-and-start test is
  meant to run against the default branch.
- Logged and not fixed, from the inventory pass: 21 nested `package-lock.json`
  under npm workspaces, 10 duplicate blobs in `catalog/artifacts/`, 9 dead
  panels under `symbia-control-center/archive/`, and 6 pre-existing dangling
  doc links in `models/TESTING-REPORT.md` and `catalog/INTENT.md`.
