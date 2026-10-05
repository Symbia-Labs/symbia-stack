# Adversarial Analysis — Round 2 (post-remediation)

*Prepared 13 August 2026, against the tree after the round-1 fixes landed
(A1–A5, B, C) and were CI-gated. Same method as
`2026-08-13-adversarial-analysis.md`: code over docs, `file:line` for every
load-bearing claim, observation separated from inference.*

**What changed since round 1.** The six original findings are closed and
verified: real HMAC + HKDF vault (`c63af5c`), org-membership + ALS-backed RLS
(`caee291`), confined/gated code tools (`088be4a`), green type gate + Postgres
survival (`7bec31b`), reconciled docs (`9665f62`), and a `Verify` CI workflow
that runs the security suite and a live-Postgres A4 test on every push. The
crypto and isolation *mechanisms* are now correct. So this pass does not lead
with them — it leads with where the correct mechanisms are **not applied**, and
with surfaces round 1 never reached.

---

## The one-paragraph verdict

The remediation fixed the mechanisms and wired them into *some* services. The
dominant remaining risk is **uneven propagation**: database-level tenant
isolation is real in the five services that were wired and **inert in
`messaging`**, the one org-scoped service holding the most sensitive data
(private conversations and message bodies). Underneath that sits the root cause
the project already named in `DEVELOPER.md §8` — a **forked auth middleware**:
`@symbia/auth` (used by messaging) has no RLS awareness, while `assistants`
carries its own copy that does. Separately, there is an **unguarded SSRF
surface** (component/webhook `fetch` to arbitrary URLs) that sits entirely
outside the SDN boundary model the platform is built to enforce. None of these
are regressions from the fixes; they are the next layer down, now visible
because the top layer is solid.

---

## R1 — RLS is defined but inert in `messaging` — HIGH

`@symbia/db`'s own header calls RLS what makes it "impossible to accidentally
access data from other organizations" (`symbia-db/src/rls.ts:5`). That guarantee
is not in force in `messaging`, which owns the platform's most sensitive tables
(`conversations`, `participants`, `messages`, all carrying `org_id`).

Three independent facts, each verified:

1. **No context is ever set.** `grep -r "setSessionContext\|runWithRLSContext\|
   attachRLSPoolWrapper\|RLSContext" messaging/server/src` returns nothing.
2. **Its pool is never wrapped.** `@symbia/db` auto-wraps the pool it creates
   (`symbia-db/src/database.ts:75 attachRLSPoolWrapper(pool)`), but `messaging`
   does **not** use that pool — it constructs its own
   (`messaging/server/src/database.ts:43 pool = new Pool({...})`), which the
   wrapper never touches.
3. **Its RLS migration is never applied.** `messaging/server/migrations/
   0001_rls_policies.sql` exists, but nothing in `messaging/server/src` runs it
   (no `migrate`/`runMigrations` call), whereas the wired services apply theirs
   via drizzle (`assistants/server/src/migrations/run.ts:16`).

So the session variables the policies read (`symbia.org_id`, …) are never set,
the pool that would set them is never wrapped, and the policies are likely not
even present in the running database. **In fairness this is defense-in-depth,
not an open door:** the conversation routes do enforce auth and membership at
the application layer (`messaging/server/src/routes/conversations.ts:3` imports
`requireAuth, isOrgMember`). But the model-layer org filter is *optional by
signature* — `ConversationModel.listForUser(userId, orgId?)`
(`models/conversation.ts:40`) filters only `if (orgId)` — so a caller that omits
it silently returns cross-org rows, and the database-level backstop that exists
specifically to catch that mistake is switched off. Every other org-scoped
service has that backstop; messaging is the one that does not.

**Root cause — the forked auth middleware (already named in `DEVELOPER.md §8`).**
`messaging` gets `requireAuth` from the shared `@symbia/auth`
(`messaging/server/src/auth.ts:23 createAuthMiddleware(...)`), and `@symbia/auth`
has **no RLS awareness at all** (`grep @symbia/db symbia-auth/src` → nothing).
`assistants`, meanwhile, does not use `@symbia/auth` for this — it forked its own
middleware that *does* open an ALS scope
(`assistants/server/src/middleware/auth.ts:190 runRequestWithRLS`). So the fix
that made RLS "real" reached exactly the services with the forked-in copy and
skipped every service still on the shared package. This is the precise failure
`DEVELOPER.md §8` warns about: *"authMiddleware has been forked into at least
three services; patching `@symbia/auth` reached none of them."*

**Fix direction:** set the RLS context at the shared root (`@symbia/auth`, via an
optional hook so the package stays db-agnostic), wrap messaging's own pool, and
apply the migration at boot — so isolation is consistent across every consumer
rather than per-service. A wiring for messaging plus a live schema-isolation
test ship alongside this document.

## R2 — The ALS wrapper does not cover explicit-client paths — MEDIUM

Even where RLS *is* wired, the guarantee has a seam the wrapper cannot see, and
the wrapper's own doc comment says so: *"Explicit-client paths (`pool.connect()`,
`db.transaction()`) are NOT covered by the wrapper — use `withRLSContext()`"*
(`symbia-db/src/als-context.ts:17-18`). The wrapper only intercepts pooled
one-shot `pool.query()`. Direct client checkouts run whatever context is (or is
not) on that physical connection. These call sites exist on real data paths:
`assistants/server/src/index.ts:172`, and throughout `messaging`
(`models/message.ts:43`, `database.ts:58`, `database.ts:198`). So "RLS context
is real" holds for Drizzle/`pool.query` traffic and silently does not for any
handler that opens its own client. There is no lint or test asserting that
explicit-client paths are wrapped in `withRLSContext`; adding one would keep this
seam from widening.

## R3 — Unguarded outbound SSRF, outside the SDN boundary model — HIGH

The platform's thesis is provable boundaries: the Network service with "explicit
contracts" and `intra`/`inter`/`extra` boundary types. Component egress does not
go through any of it. Two concrete surfaces:

- **`symbia.io.http-request`** fetches `config.url` directly with no allowlist
  and no block on internal/metadata targets:
  `fetch(url, { method, signal: AbortSignal.timeout(10_000) })`
  (`runtime/server/src/executor/components.ts:445`). A graph author — or an LLM
  step that writes graph config — can point it at `http://169.254.169.254/…`
  (cloud metadata), `http://identity:5001/…`, or any internal service.
- **`webhook.call`** fetches a URL **interpolated from conversation context**:
  `const url = interpolate(params.url, context); … await fetch(url, …)`
  (`assistants/server/src/engine/actions/webhook-call.ts:27,56`). Context can
  carry message content and model output, so the destination is partly
  attacker-influenceable. `notify.ts:67` and `service-call.ts:100` fetch `url`
  the same way.

None of these consult the Network policy engine, an egress allowlist, or an
internal-IP/metadata denylist. The component honestly labels its output
`apocryphal` (provenance-aware), but provenance is not egress control. For a
platform that sells controlled boundaries, raw `fetch()` from components is the
boundary the model does not cover. **Fix direction:** a single vetted egress
helper (deny RFC1918 + link-local + metadata IPs, optional allowlist,
DNS-rebinding-safe by resolving then pinning) that every component/action must
route through; forbid bare `fetch` to config/context URLs by review or lint.

## R4 — Code-tool execution is confined but still not sandboxed — MEDIUM (by design, standing)

Round 1 gated code tools off by default and confined paths through
`@symbia/pathguard`. But when enabled, `bash` is still process-level `spawn` on
the service (`assistants/server/src/engine/actions/code-tool-invoke.ts`), gated
by `ASSISTANTS_ENABLE_CODE_TOOLS` + `ASSISTANTS_CODE_TOOLS_ALLOW_BASH`.
Off-by-default is real risk reduction; "enable and you have unsandboxed host
execution driven by graph/LLM input" is still the standing posture, not a fix.
The real-isolation-boundary-or-delete decision from round 1 is still open.

## R5 — The seed / bootstrap footgun — HIGH (operational), unchanged

Still the most dangerous entry in the project's own ledger (`STATUS.md §6.1`):
there is no reconciled path from an edited bootstrap file to the database, and
`npm run seed` (`catalog/server/src/seed.ts`) deletes then reloads only the
snapshot — running it silently reverts catalog work, including the verified
fixes. This is not a security hole but it is the likeliest way for good state to
be destroyed by routine operation. It has not moved since round 1.

---

## What is genuinely better since round 1 (so the above is weighted fairly)

- The crypto and isolation mechanisms are correct and now *tested*: 38 stubbed
  security assertions plus a live-Postgres A4 test, gated by CI on every push.
- `@symbia/db`'s ALS wrapper is a real, correct fix to the pool/`SET LOCAL`
  footgun — the gap is propagation and explicit-client coverage, not the design.
- Path confinement was consolidated into one `@symbia/pathguard` (a forked
  concern *closed*), which is the opposite of the R1 forked-auth problem and
  shows the team fixing exactly this class when it is in view.
- The front-door docs no longer overstate the posture.

The through-line of round 2 is a single sentence: **the mechanisms are right;
finish applying them.** R1 (messaging RLS via the shared auth root) and R3 (an
egress boundary for component `fetch`) are the two that are both exploitable-
shaped and not yet tracked; R2/R4/R5 are known seams to keep from widening.

## Priority order

1. **R1** — set RLS context at the `@symbia/auth` root (optional hook), wrap
   messaging's pool, apply its migration; cover socket + explicit-client paths.
   A wiring + live messaging isolation test ship with this doc.
2. **R3** — one vetted egress helper; route every component/action `fetch`
   through it; deny internal/metadata targets by default.
3. **R2** — a test/lint asserting explicit-client paths use `withRLSContext`.
4. **R4 / R5** — the standing code-tool isolation decision, and making
   `npm run seed` non-destructive (already `STATUS.md`'s #1).
