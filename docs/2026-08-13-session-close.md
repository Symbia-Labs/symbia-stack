# Session close — 2026-08-13

Derived from the tree and from git. Anything not measured is listed under
**Not checked**. Figures were taken before this document was itself committed;
the delta of one commit and one tracked file is this document.

## State of the tree

| | |
|---|---|
| Branch | `fix/2026-08-06-api-gaps` |
| Upstream | `origin/fix/2026-08-06-api-gaps`, **in sync — 0 unpushed** |
| `origin/main` | `a8426bc` |
| Tracked files | 990 (952 at the 12 Aug close) |
| Working tree | clean — nothing uncommitted, nothing untracked |

`git fetch origin` succeeded. Everything committed today is already on the
remote. `.ec2-last-sync`, untracked at the last close, was brought under
tracking today (`86323dd`), which is why the untracked list is now empty.
Nothing was staged, reverted or cleaned by this run other than committing this
document.

## What changed

17 commits since midnight, 11:38–17:14. The day was a security remediation
pass: an adversarial analysis was written down, answered, and worked through
finding by finding, with each fix landing alongside a committed regression
test or a registered MAP prediction.

**The analysis itself** — `9665f62` commits the adversarial analysis and its
response and reconciles README/SECURITY/INTENT claims down to what the code
does; `8554788` adds a round-2 analysis.

**First-round findings (A1–A4)** — `088be4a` gates and confines code-tool
execution (interim); `caee291` makes RLS context real via a fail-closed
AsyncLocalStorage scope in `@symbia/db` and enforces org membership across
five services; `c63af5c` replaces fake HMAC and the unkeyed vault with
`timingSafeEqual` HMAC and an HKDF-keyed AES-256-GCM vault in
`@symbia/crypto`; `7bec31b` makes `npm run check` green again and removes the
mechanism by which services died on Postgres loss.

**Second-round findings (R1–R5)** — `8554788` activates messaging RLS through
the shared auth hook (R1) with a 216-line live test; `4ef46db` wraps the
`message.create` transaction in `withRLSContext` (R2); `da63414` adds an
explicit-client ratchet test (R2) and a seed guard against silent data-revert
(R5); `449e296` adds an SSRF egress guard as a new `@symbia/egress` package,
wired into notify, webhook-call and the runtime component executor (R3);
`0ddd373` removes bash/command execution from code tools outright (R4).

**Consolidation** — `66f8b47` collapses two copies of path validation into one
`@symbia/pathguard` package and commits the A1/A2+A3/A4 harnesses as
regression tests (`npm run test:security`, 38 checks).

**CI** — `6202b76` adds a Verify workflow and a live-Postgres A4 RLS test;
`150b042` reconciles `ci.yml` into gates-vs-pipeline; `a34add9` fixes
`validate-openapi-routes` missing middleware-guarded routers.

**Docs and paper** — `f42416d` records the remediation state in STATUS and
retires defects 8 and 9; `86323dd` retires the stale Vite/5173 material from
`DEVELOPER.md` (the §8 staleness CLAUDE.md has been flagging) and adds a
whitepaper draft; `7dd2ee4` proposes a wasm component runtime as A1's real
boundary — PAPER, with two runnable spikes under `experiments/`.

Three MAP prediction docs were registered before measuring: egress,
explicit-client ratchet, seed guard (`docs/2026-08-13-*-predictions.md`).

## Health

### Typecheck — `npx tsc --noEmit -p .` per service

| Service | Exit | 12 Aug baseline (errors) |
|---|---|---|
| identity | **0** | 2 (4) |
| logging | **0** | 2 (75) |
| catalog | **0** | 2 (1) |
| assistants | **0** | 2 (20) |
| messaging | **0** | 2 (1) |
| runtime | 0 | 0 |
| integrations | 0 | 0 |
| models | **0** | 2 (11) |
| network | **0** | 2 (1) |
| symbia-sys | 0 | 0 |

All ten services exit 0. Seven changed state since the 12 Aug close — 113
errors to zero. Observation: the table. Inference, marked as such: `7bec31b`
("npm run check green again") is the plausible cause; the per-error
attribution was not traced. Sanity check that tsc actually did work: identity
processed 1,534 files (`--extendedDiagnostics`), tsc 5.9.3.

### Port surface — `scripts/check-ports.ts`

**Pass. No drift.** Default surface `9000`; dev overlay adds 5001–5010, 5432,
8000; `server 5000` reserved, not running.

Caveat on the tool, not the result: `npx tsx scripts/check-ports.ts` crashed
in this sandbox with an esbuild `TransformError` before reaching the script
(it ran fine at the 12 Aug close; `package-lock.json` changed today in
`66f8b47`). The result above is from `node --experimental-strip-types
scripts/check-ports.ts`, exit 0. Worth one look on the host: if `npx tsx`
fails there too, `npm run check:ports` is broken for everyone, not just for
this sandbox.

### Dangling documentation links

56 relative links checked (54 at last close; the two new ones resolve), **6
dangling — the same six as 12 Aug**:

| Source | Target |
|---|---|
| `catalog/INTENT.md` | `input` |
| `models/TESTING-REPORT.md` | `models/server/src/llama/engine.ts` |
| `models/TESTING-REPORT.md` | `integrations/server/src/routes.ts` |
| `models/TESTING-REPORT.md` | `catalog/server/src/auth.ts` |
| `models/TESTING-REPORT.md` | `catalog/server/src/routes.ts` |
| `models/TESTING-REPORT.md` | `models/server/src/catalog/model-sync.ts` |

## Open and unresolved

From `docs/API-MEASUREMENTS.md`, 2 entries still marked **Open** — unchanged:

- **D9** — `energy.graph.pue` and `energy.graph.ingest` are published `graph`
  resources with no graph. Populate or unregister.
- **D10** — `docker-compose.override.yml` stubs `db-bootstrap`, so new service
  schemas never reach an existing dev install.

What today's commits explicitly logged as not fixed (STATUS §0a):

- A1 is gated and confined but **still not a sandbox**; the wasm proposal is
  the direction and is PAPER. Its first registered prediction (component
  ergonomics past scalars, jco probe) is untested.
- A4's ALS RLS scope is **not yet exercised against a running stack**.
- pg-mem dev mode has no RLS (loud warning only); unauthenticated dev route
  surfaces remain.
- Every "green" from the harnesses is a local run; the new Verify workflow has
  not been observed executing.

## Not checked

- **Container boot / runtime behaviour.** Docker is unavailable in this
  sandbox. Nothing today was exercised against a running stack — the RLS
  scope, the egress guard, and the Postgres-loss survival are all code-level
  claims here.
- **`npm run test:security` (38 checks)** — not run by this pass; the table
  above is typecheck only, and `npm run check` / `npm run build` were not run
  either.
- **The 12 Aug leftovers** — whether `eventHeaderValidator()` is now mounted
  on any route, and whether the `tsx: command not found` build failure in
  `network`/`messaging` service dirs persists. Neither was retried.
- **Federation F1–F5** — not re-run.
- **CI on the remote** — today's branch is fully pushed; whether `verify.yml`
  ran there, and what it said, was not looked at.

## Correction — the tree was clean at 19:04, not at close

The "working tree clean" row above was measured at 19:04 and was true then.
At 19:05 `assistants/.identity/` appeared, untracked: `service.key.pem` and
`service.pub.pem`, mode 0600/0644. The timestamp falls inside this run's own
typecheck pass, so the plausible cause (inference) is a package script fired
by `npx` while typechecking the service directories — not leftover session
work. Two things worth attention: it contains a **private key**, and
`git check-ignore` says it is **not ignored**, so a future `git add -A` would
sweep it into history. It was left in place; consider gitignoring the path.

## Provenance of this commit

`.git/index.lock` was present at close: zero bytes, timestamped 19:04, created
by this run's own `git status` — the sandbox can create files under `.git/`
but cannot unlink them (`rm: Operation not permitted`), the same mount
behaviour documented in the 12 Aug close. No `rebase-*`, no `MERGE_HEAD`:
stale by the usual test. As on 12 Aug, the lock was verified and cleared on
the host and this document committed from there, staging only this file.
Nothing was pushed.
