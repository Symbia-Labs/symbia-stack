# Session close — 2026-08-14

Derived from the tree and from git. Anything not measured is listed under
**Not checked**. Figures were taken before this document was itself committed.

## State of the tree

| | |
|---|---|
| Branch | `fix/2026-08-06-api-gaps` |
| Upstream | `origin/fix/2026-08-06-api-gaps`, **ahead 15 — 15 unpushed** |
| `origin/main` | `2e856f4` |
| Tracked files | 1,021 (990 at the 13 Aug close) |
| Working tree | 1 modified, 0 untracked |

`git fetch origin` succeeded. The one uncommitted file is `package.json`:
`verify:manifests` and `verify:assistants` switched from
`node --experimental-strip-types` to `tsx`. In-flight work; left alone.

The 15 unpushed commits run `7bfa1c4`…`c3f585a` — everything from 13:48
onward plus `7bfa1c4` (11:57 block). The morning's first three
(`fd74067` merge, `3c161e6`, `f7d77a7`) are already on the remote.

## What changed

`git log --since=midnight` shows 20 commits, 09:46–18:54. Two of those
(`75af3fa`, `2e856f4` — README/Directory-service docs) were authored on
`origin/main` and arrived via the 11:22 merge (`fd74067`); 17 non-merge
commits were made on this branch today.

**Credential crypto and session tokens (L1–L3)** — `b36c28b` adds
`CredentialCrypto` to `@symbia/crypto` (envelope keys, session tokens, KEK
derivation; 203 lines, with a 67-line test and a registered prediction doc).
`c17700f` moves MCP auth to token-first and seeds a telemetry-read grant.
`76241a7` adds mint/resolve/revoke session-token endpoints to identity
routes and wires the MCP server to them.

**Runtime lane measurements, MAP-paired** — three predict-then-measure
cycles: `0d4ac7d`→`1041735` (lane visibility to graph control flow;
`experiments/lane-probe/`), `e484adf`→`45d2c4d` (state lane laundering;
`experiments/state-lane-probe/`, three ports implicated), and `c3f585a`
(bus-eligibility audit via new `scripts/verify-bus-eligibility.mjs` —
manifest cannot classify, 11/16). `c3f585a` also adds a 53-line §12 to
STATUS recording the findings: lanes are legible but not actionable, and in
four places not true. The "D10"/"D14" in these subjects are the dark-fleet
ledger's numbering, not `API-MEASUREMENTS` ids.

**Proposals** — `9cab526` signed composition (253 lines); `dd97113`
canonical bus ("the graph is the apocryphal lane", 215 lines); `0d4ac7d`
also lands `dark-fleet-decomposition.md` (342 lines). `e16fbc9` records
signed-composition spike results: 16/16 pass the component gate, P1 broken
as registered.

**Snapshot** — `8fd3ff8` is a large checkpoint before the crypto work:
`dark-fleet-v1.md`, assistant-roster docs (~21k lines of md+json under
`docs/proposals/`), SECURITY.md and Verify-workflow edits, Dockerfile
touches across six services, a privacy/security/availability stance doc,
and a wallet-credentials-into-identity proposal.

**Ops fixes** — `f7d77a7` wires pathguard+egress into the image build;
`3c161e6` adds `@symbia/egress` to package-lock so `npm ci` succeeds;
`5c0df00` gives long-running services a compose restart policy; `7bfa1c4`
makes the MCP stack-health description enumerate the registry instead of a
nine-service snapshot. `5b41df5` gitignores `.identity/` — this closes the
13 Aug close doc's flag: `assistants/.identity/service.key.pem` is now
ignored (verified via `git check-ignore`) and still untracked.

## Health

### Typecheck — `npx tsc --noEmit -p .` per service

| Service | Exit | 13 Aug baseline |
|---|---|---|
| identity | 0 | 0 |
| logging | 0 | 0 |
| catalog | 0 | 0 |
| assistants | 0 | 0 |
| messaging | 0 | 0 |
| runtime | 0 | 0 |
| integrations | 0 | 0 |
| models | 0 | 0 |
| network | 0 | 0 |
| symbia-sys | 0 | 0 |

All ten exit 0. No state changes versus 13 Aug.

### Port surface — `scripts/check-ports.ts`

**Pass. No drift.** Default surface `9000`; dev overlay adds 5001–5010,
5432, 8000; `server 5000` reserved, not running.

Same tool caveat as 13 Aug: `npx tsx scripts/check-ports.ts` still crashes
in this sandbox with an esbuild `TransformError` before reaching the
script. The result above is from `node --experimental-strip-types
scripts/check-ports.ts`, exit 0. The uncommitted `package.json` change
moves two other verify scripts *toward* tsx, so whether tsx works on the
host is worth the one look the 13 Aug doc already asked for.

### Dangling documentation links

58 relative links checked, **6 dangling — the same six as 12 and 13 Aug**:

| Source | Target |
|---|---|
| `catalog/INTENT.md` | `input` |
| `models/TESTING-REPORT.md` | `models/server/src/llama/engine.ts` |
| `models/TESTING-REPORT.md` | `integrations/server/src/routes.ts` |
| `models/TESTING-REPORT.md` | `catalog/server/src/auth.ts` |
| `models/TESTING-REPORT.md` | `catalog/server/src/routes.ts` |
| `models/TESTING-REPORT.md` | `models/server/src/catalog/model-sync.ts` |

## Open and unresolved

`docs/API-MEASUREMENTS.md` has not been touched since 8 Aug (`a3d3601`).
Grepping the exact token `**Open**` matches D9 and D10, which is what the
12–13 Aug close docs reported. A looser `**Open` grep also matches **D6,
D7, D8** (marked `**Open.**` — period inside the bold) and a later note
upgrading D9 to "**Open, with a decision**": unregister the two empty
`energy.graph.*` resources rather than populate them. The prior docs'
count of 2 was a grep-pattern artifact, not a state change; five entries
are open:

- **D6** — graph-written metrics land in the system org; the obvious read
  path cannot see them. Effectively write-only.
- **D7** — a new metric series per runtime restart; readers must union
  duplicates or silently see a fraction of the data.
- **D8** — `GET /api/graphs` reports a count its own array does not return.
- **D9** — two `type: graph` catalog resources with no graph. Decision
  recorded: unregister. Not yet done (requires a catalog write against a
  running stack).
- **D10** — `docker-compose.override.yml` stubs `db-bootstrap`; new service
  schemas never reach an existing dev install.

What today's commits explicitly logged as not fixed: the bus-eligibility
audit's own headline — the manifest cannot classify components, 11/16
(`docs/2026-08-14-bus-eligibility-results.md`); the lane findings in
STATUS §12 (a graph cannot branch on the lane it received; state lanes
launder through three ports); and `e16fbc9`'s P1, broken as registered.
STATUS §0a's standing items (A1 still not a sandbox; A4's RLS scope not
exercised against a running stack) remain as written — restated by STATUS,
not re-verified by this run.

## Not checked

- **Container boot / running-stack behaviour.** Docker is unavailable in
  this sandbox. The session-token endpoints, compose restart policy, and
  image-build wiring landed today are all code-level claims here.
- **`npm run build`, `npm run check`, `npm run test:security`** — none run
  by this pass; the table above is typecheck only.
- **The uncommitted `package.json` scripts** — `verify:manifests` /
  `verify:assistants` under tsx were not executed.
- **CI on the remote** — 15 commits are unpushed, so `verify.yml` cannot
  have seen them; whether it ran on the three pushed morning commits was
  not looked at.
- **Federation F1–F5** — not re-run.

## Provenance of this commit

`.git/index.lock` was present at close: zero bytes, timestamped 19:04
today, created by this run's own `git status` — the sandbox can create
files under `.git/` but cannot unlink them (`rm: Operation not
permitted`), the same mount behaviour as the 12 and 13 Aug closes. No
`rebase-*`, no `MERGE_HEAD`: stale by the usual test. As before, this
document was committed from the host, staging only this file. Nothing was
pushed.

## Correction — the sandbox measured a stale snapshot

Committing from the host exposed a discrepancy: the sandbox mount was a
snapshot from roughly 19:04, and the host had moved past it. What the
host shows, measured directly there:

- **One more commit exists**: `19a838c` (19:06), `fix(deps): restore the
  security suite — NODE_ENV=production had emptied node_modules` —
  64 lines into STATUS, a reworked `2026-08-14-bus-eligibility-results.md`,
  a new `experiments/cleanup-probes.mjs`, and the `package.json` change
  this doc reported as uncommitted. So: **18 branch commits today, not
  17**, and the "1 modified, 0 untracked" working tree is actually
  **clean** — the `package.json` edit was in-flight only in the snapshot.
- **Everything is pushed except this document.** The remote branch sits
  at `19a838c` ("update by push" in the reflog); the "ahead 15 — 15
  unpushed" row and this commit's original subject were true of the
  snapshot, not the tip. At close the branch is **ahead 1**: this file.
- The `index.lock` existed only in the sandbox's view; the host had no
  lock to clear.

Consequence for the Health section: typecheck, port surface, and the link
walk were run against the snapshot — i.e. against `c3f585a` plus the
`package.json` edit, one commit behind the tip. `19a838c` touches no
service source, so the typecheck table is unlikely to differ at
`19a838c`, but that is inference; it was **not measured at the tip**. Its
new/changed docs were also not in the link walk.
