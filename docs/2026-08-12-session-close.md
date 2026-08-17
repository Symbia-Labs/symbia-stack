# Session close — 2026-08-12

Derived from the tree and from git. Anything not measured is listed under **Not checked**.

## State of the tree

| | |
|---|---|
| Branch | `fix/2026-08-06-api-gaps` |
| Upstream | `origin/fix/2026-08-06-api-gaps`, **ahead 1** |
| `origin/main` | `a8426bc` |
| Tracked files | 951 |
| Working tree | 1 untracked: `.ec2-last-sync` |

`git fetch origin` succeeded. Nothing is staged. Nothing was staged, reverted or cleaned by this run.

## What changed

27 commits since midnight: 10 `feat`, 7 `fix`, 10 `docs`.

**Federation reached the data plane.** `07297dc` records F5 measured — the bridge forwards, the loop breaks, and lineage holds afterwards. `67aa3eb` records F4: mutual peer declaration through the tunnel, with the allow-check refusing undeclared classes. `1061cf3` closes F4/F5 and marks persistence verified on both stacks. `b7a9ee7` pins the federation harness to `127.0.0.1` because `localhost` resolves to `::1` on the native stack — a harness defect, not a product one.

**The models broker went in over four stages.** `b464bf0` (registry sees remote providers), `9d2fa5e` (remote execution delegated), `009580e` (assistants completions routed through the broker), with `8df6b31` collapsing two provider lists into one so the registry cannot advertise a capability the router lacks. `a02ed33` makes the registry record where each model id came from and whether anything checked it.

**Assistants tightened around refusals.** `f2838c7` seals refusals — an unverifiable reply becomes an explicit declination rather than a claim. `bdcd73d` separates deterministic refusal from probabilistic retry and records every attempt. `ed24b98` removes model and parameter selection from the assistant. `4bb72ff` fixes a correction to revise the calculation rather than operate on the answer.

**Directory gained durable peers.** `8621daf` journals peers to JSONL surviving restart and recreate; `fe3803b` adds the public offer surface.

**One commit is from this session** — `c7ea3ac`, W3C Trace Context and event header validation in `@symbia/sys`, wired into network and messaging. Two new modules (`trace-context.ts`, `event-headers.ts`), 56 tests, mutation-tested. `network/router` now sends `X-Symbia-Boundary`, `X-Symbia-Source` and `traceparent` on delivery alongside the existing correlation IDs; `messaging` recovers trace IDs from prefixed `run_msg_<uuid>` values that were previously stored as `undefined`.

**Documentation**: standing overviews added for FEDERATION, MODELS, ASSISTANTS and MESSAGES (`082f9e5`, `9a99f49`, `5cc4b24`), and BDT/FDT spelled out as BACnet inheritances rather than Symbia table acronyms (`7c83e7d`).

## Health

### Typecheck — `npx tsc --noEmit -p .` per service

| Service | Exit | Errors | First error |
|---|---|---|---|
| identity | 2 | 4 | TS7016 no declaration for `bcrypt` |
| logging | 2 | **75** | TS7016 no declaration for `express` |
| catalog | 2 | 1 | TS2345 `"update"` not assignable |
| assistants | 2 | 20 | TS2322 in `engine/actions/assistant-route.ts` |
| messaging | 2 | 1 | TS7016 no declaration for `pg` |
| runtime | 0 | 0 | — |
| integrations | 0 | 0 | — |
| models | 2 | 11 | TS2322 `ModelCatalogMetadata` in `model-sync.ts` |
| network | 2 | 1 | TS2307 cannot find `openapi-types` |
| symbia-sys | 0 | 0 | — |

No prior session-close doc exists, so there is no baseline to compare against. This table is the baseline.

Observation, not inference: a large share of these are missing `@types/*` packages (`bcrypt`, `express`, `pg`, `openapi-types`), not type errors in the services' own code. `logging` at 75 is dominated by that class. `catalog`, `assistants` and `models` show genuine assignability errors.

`network` and `messaging` error counts were measured before and after this session's change and are unchanged at 1 each.

### Port surface — `npx tsx scripts/check-ports.ts`

**Pass. No drift.**

- Default surface: `9000`
- Dev overlay adds: 5001–5010, 5432, 8000
- `server 5000` reserved, not running

### Dangling documentation links

54 relative links checked, **6 dangling**:

| Source | Target |
|---|---|
| `catalog/INTENT.md` | `input` |
| `models/TESTING-REPORT.md` | `models/server/src/llama/engine.ts` |
| `models/TESTING-REPORT.md` | `integrations/server/src/routes.ts` |
| `models/TESTING-REPORT.md` | `catalog/server/src/auth.ts` |
| `models/TESTING-REPORT.md` | `catalog/server/src/routes.ts` |
| `models/TESTING-REPORT.md` | `models/server/src/catalog/model-sync.ts` |

Five of six are in one file and look like repo-root-relative paths written into a file that resolves relative to `models/`. `catalog/INTENT.md -> input` is a different shape and probably a malformed link.

## Open and unresolved

From `docs/API-MEASUREMENTS.md`, 2 entries still marked **Open**:

- **D9** — Two catalog `graph` resources carry no graph: `energy.graph.pue` and `energy.graph.ingest` are published but empty.
- **D10** — New service schemas never reach an existing dev install; `docker-compose.override.yml` replaces the whole `db-bootstrap` definition.

Logged but not fixed today:

- `network` and `messaging` builds fail with `tsx: command not found`. This is a workspace/PATH issue in this checkout, not a code fault — `npm run build` shells out to `tsx` which is not resolvable from the service directories.
- `event-headers.ts` ships `eventHeaderValidator()` but it is **not mounted on any route**. The promotion half is live; the validation half is not. Until it is mounted, promoted headers are unverified, which is the condition the module exists to prevent.

## Not checked

- **Container boot / runtime behaviour.** 13 containers are running, but they were started from images predating today's commits. Nothing today was exercised against a running stack.
- **Whether the new `traceparent` header is accepted end-to-end.** Unit-tested only; no event was pushed through a live network→messaging path.
- **The 75 logging typecheck errors individually.** Only the count and first error were recorded.
- **Federation F1–F5 re-verification.** Today's commits claim measurements; this run did not re-run the harness.
- **Test suites other than `symbia-sys`.** Only `symbia-sys` tests were executed (56 pass).
- **Whether `.ec2-last-sync` should be tracked or ignored.** Left untouched.

---

## Update — 19:05, second close run

A second session-close run fired at 19:04, seven minutes after this document was
committed (`02ed9b6`, 18:57). It re-ran every measurement independently rather
than trusting the table above. Nothing in the repository changed between the two
runs, so this is a verification pass, not a new report.

### Tree state at 19:05

| | |
|---|---|
| Branch | `fix/2026-08-06-api-gaps` (unchanged) |
| Upstream | **ahead 2** — `c7ea3ac`, `02ed9b6` |
| `origin/main` | `a8426bc` (unchanged) |
| Tracked files | 952 |
| Working tree | 1 untracked: `.ec2-last-sync` |

The "ahead 1 / 951 tracked" figures above were measured before this document was
itself committed. The delta of one commit and one file is this document. `git
fetch origin` succeeded. No commits landed after `02ed9b6`.

### Measurements re-run

- **Typecheck, all ten services** — identical exit codes and identical error
  counts to the table above: 4 / 75 / 1 / 20 / 1 / 0 / 0 / 11 / 1 / 0. No drift.
- **Port surface** — `npx tsx scripts/check-ports.ts` exit 0, "No drift."
  Default surface `9000`; dev overlay adds 5001–5010, 5432, 8000; `server 5000`
  reserved, not running. Identical.
- **Dangling links** — 54 relative links, 6 dangling, the same six.
- **Open defects** — `docs/API-MEASUREMENTS.md` still carries exactly two
  `**Open**` entries, D9 and D10, unchanged.

### Two corrections to the table above

The module names in the "first error" column were recorded imprecisely:

| Service | Recorded above | Actually reported |
|---|---|---|
| identity | `bcrypt` | `bcryptjs` — `server/src/index.ts(12,20)` |
| logging | `express` | `express-session` — `server/src/auth.ts(11,43)` |

Counts and exit codes were correct in both cases. The substantive claim — that
these are missing `@types/*` declarations rather than faults in the services'
own code — holds.

### `.git/index.lock` — present, stale, not removable from this sandbox

Observation: `.git/index.lock` exists, zero bytes, owned by the sandbox user,
timestamped 19:04 — created by this run's own `git status`. No `.git/rebase-*`
directory and no `.git/MERGE_HEAD`, so by the usual test it is stale rather than
a live operation.

A write probe shows the sandbox can create files under `.git/` but cannot unlink
them (`rm: Operation not permitted`), which is why git left the lock behind:
`git status` reported `warning: unable to unlink .git/index.lock`. That is a
sandbox mount permission, not a repository fault, and it made `git add` fail from
the sandbox with `fatal: Unable to create ... index.lock: File exists`.

Checked again on the host filesystem before acting: still zero bytes, owned by
`briangilmore`, no `rebase-*`, no `MERGE_HEAD`, and `ps` shows no git process. On
that evidence the lock was removed from the host and the commit made there. Only
this document was staged (`git add docs/2026-08-12-session-close.md`). Nothing
else was staged, reset, cleaned or deleted, and nothing was pushed.

### Not checked by this run

Everything in the **Not checked** list above still stands — none of it was
retried. Additionally not checked:

- **Whether the two module-name corrections change any downstream conclusion.**
  Only the first-error lines were re-read; the remaining 111 errors were not
  re-examined individually.
- **Any runtime behaviour.** No stack was started, no endpoint called, no
  container booted. Docker was not available.
- **Whether `.git/index.lock` clears on its own outside the sandbox.** Left in
  place for Brian to inspect.
