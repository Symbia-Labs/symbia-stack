# Response to the 13 Aug Adversarial Analysis

Responding to `docs/2026-08-13-adversarial-analysis.md`. Method: every load-bearing
citation was re-checked against the working tree today before accepting it.
Observations and inferences are separated per MAP discipline.

## Verdict summary

| Finding | Verdict | Notes |
|---|---|---|
| A1 sandbox | **Confirmed** | One nuance: a correct validator exists elsewhere (below) |
| A2 vault key | **Confirmed** | All 6 cited sites verified, plus a 7th (`scripts/setup-test-org.mjs:64`) |
| A3 not-HMAC | **Confirmed** | Already self-diagnosed on 11 Aug; docs never updated — that's the finding |
| A4 org-id / RLS | **Confirmed** | `withRLSContext` has **zero** call sites; every service uses pool-level `setSessionContext` |
| A5 dev divergence | **Accepted** | Structurally consistent with A4; cited switches not independently re-run |
| B docs gap | **Confirmed** | With one pushback on the lineage framing (below) |
| C viability | **Accepted** | All `STATUS.md` line references check out |

## A1 — Confirmed, with one correction to the analysis

Verified: `spawn('bash', ['-c', command], { cwd })` at `code-tool-invoke.ts:400`,
the bare `startsWith` check at `:389`, caller-supplied `rootPath` at `:465`, and
the permissions spread at `:479` that lets a caller flip `execute: true` on a
workspace rooted anywhere. `blockedPaths` is declared at `:478` and read by
nothing in the assistants engine.

**Correction:** "the `blockedPaths` fields are never read by any tool — nothing
enforces them" is true for the assistants engine but false repo-wide.
`runtime/server/src/workspace/path-validator.ts` enforces both correctly:
`resolveSafePath` does the `path.sep`-boundary check (`:20`) and `isPathBlocked`
enforces the glob list (`:37-44`). This doesn't weaken the finding — it sharpens
it into a named defect class this project already tracks: **forked concern**.
The assistants engine reimplemented the runtime's code-tool surface and dropped
the validation on the way. The fix vector partly exists; it was never imported.

Disposition: agreed with the recommendation as stated — real isolation boundary
or delete the tool and the word "sandboxed." Interim floor (not a substitute):
route the assistants handler through the runtime path-validator, remove
caller-supplied `rootPath`/`permissions` override, and gate `code.tool.invoke`
registration behind an env flag that defaults off.

## A2 — Confirmed in full

All four `routes.ts` sites, `index.ts:16` (analysis said `:31`; it's `:16` in
the current tree — immaterial), `seed.ts:24`, and additionally
`scripts/setup-test-org.mjs:64`. No KDF, no production throw, `JWT_SECRET`
coupling as described. The contrast with `SESSION_SECRET` (which refuses to
default) and `NETWORK_HASH_SECRET` (which throws in prod) is the damning part:
the pattern for doing this right exists three files away.

Disposition: accept recommendation 3 wholesale — move to `@symbia/crypto`, HKDF
the key, throw when `CREDENTIAL_ENCRYPTION_KEY` is unset outside dev, drop the
`JWT_SECRET` fallback. The migration must handle re-encryption of anything
already stored under the fallback key.

## A3 — Confirmed; the sharpest cut is correct

`policy.ts:8` imports `createHash`, never `createHmac`; `:50-53` is
`SHA256(data ‖ secret)`; `:62` is a short-circuit `===`; `:27` is the public
dev fallback. And the analysis is right that we already knew:
`docs/2026-08-11-three-assistant-results.md:244` records "sha256 rather than
HMAC, and it is copy-shared." We diagnosed it, logged it, and left six documents
saying HMAC (`INTENT.md:194/387`, `README.md:283/351`, `network/README.md:508`,
`network/docs/architecture.md:67`, `network/INTENT.md:256/541-556`). The
timestamp-coverage gap (`INTENT.md:256` vs `policy.ts:41-48`) was not in our
ledger and is a new finding — logged.

Disposition: `createHmac` + `timingSafeEqual`, centralized in `@symbia/crypto`
alongside the A2 fix (same PR, same review). Docs updated in the same commit —
code and prose may not disagree across a merge.

## A4 — Confirmed; this is the most consequential finding

Three claims, all verified:

1. `auth.ts:108-119` — header preferred over token, no membership check.
   Observation, not inference: the comment says "prefer header."
2. `withRLSContext` (`rls.ts:152`, the correct primitive) has **no call sites**
   anywhere — only its definition and a passive re-export in `logging/db.ts:89`.
   Every service (assistants, identity, catalog, integrations, logging) wraps
   `setSessionContext(pool, …)` — transaction-local `set_config` with no open
   transaction, against a pool. The library's own doc comment (`rls.ts:97-98`)
   warns against exactly this.
3. `auth.ts:148-151` fail-open confirmed verbatim: "Continue without RLS."

So the runtime guarantee is: RLS context lands on whichever pooled backend
served the middleware query, and route queries run on whichever backend they
get. The analysis's "either silent no-filtering or filtering on an empty org"
is the correct disjunction.

Disposition: accept recommendation 2 as priority one alongside A1. Concretely:
membership check on `X-Org-Id` (and stop accepting org from query/body);
per-request pinned client via `withRLSContext`; fail-closed. This is also a
testable claim — an integration test that authenticates as org A, sends
`X-Org-Id: <org B>`, and asserts 403 belongs in the PR.

## A5 — Accepted

`pg-mem` not implementing RLS is fact; the memory-db default in dev is
documented; therefore dev runs without the isolation devs believe is automatic.
The `DEV_NO_AUTH` / `?debug` citations were not independently re-executed
today, but nothing in the pattern of the other findings suggests they're wrong.
Disposition: after A4 lands, add a startup log line in memory-db mode stating
"RLS NOT ENFORCED (pg-mem)" — make the divergence loud instead of invisible.

## B — Confirmed, with one pushback

The two-universes description is accurate and the "cheapest high-value fix" is
right. Accepted actions: `README.md` gets a status banner linking `STATUS.md`
at the top; the four overstated claims ("HMAC," "vault," "sandboxed,"
"automatic scoping") get downgraded to their true state; `SECURITY.md` gets a
real contact and a supported-versions table that matches the tree.

**Pushback on the lineage framing.** The analysis presents in-memory chain
heads as a contradiction the docs hide. `STATUS.md:107-113` shows the opposite:
it was ruled, dated, and attributed ("this is now the ruling, not a defect" —
Brian, 11 Aug), with the genuinely open item named (disclosure after restart,
not persistence). Whether the ruling is *wrong for a provenance product* is a
fair strategic challenge — and the analysis makes it well — but it's a
challenge to a documented decision, not an inconsistency. The challenge is
noted for the next revisit of `docs/proposals/assistant-data-model.md`; it is
not relitigated here.

## C — Accepted

Spot-checked references all hold: `STATUS.md:262` (159 TS errors), `:265`
(no Postgres-restart survival), `:322` (stale releases), `:326` (47 unpushed).
The scope-vs-wiring critique is the same one `STATUS.md` makes of itself; no
dispute. The seed-path footgun is already ranked top of our own defect list
(`STATUS.md:343`).

## Accepted priority order

The analysis's five-item order is adopted unchanged, with one amendment: A2 and
A3 are one work item (shared `@symbia/crypto` module, one PR), and the B doc
reconciliation ships *first* because it is the only item that costs nothing and
removes the active misrepresentation while the code fixes are in flight.

1. **B** — front-door docs downgraded to truth; `STATUS.md` linked from README top.
2. **A1** — isolation boundary or removal; interim: runtime path-validator +
   no caller-supplied root/permissions + registration off by default.
3. **A4** — org membership check, `withRLSContext` everywhere, fail-closed,
   with the cross-org 403 test.
4. **A2+A3** — `@symbia/crypto`: HMAC + `timingSafeEqual`; HKDF + prod throw;
   delete fallback keys; docs in same commit.
5. **C** — `npm run check` back to green; Postgres reconnect policy.

## Corrections to the analysis (for the record)

- `blockedPaths` enforcement exists in `runtime/server/src/workspace/
  path-validator.ts`; unreferenced by the reachable assistants handler. Finding
  stands; characterization "nothing enforces them" is repo-wide false.
- `identity/server/src/index.ts` fallback is at line 16, not 31.
- In-memory lineage is a documented ruling with an owner and date, not
  undisclosed drift. The strategic objection to the ruling is accepted as an
  open question, separately from the honesty claim.

Everything else stands as written.
