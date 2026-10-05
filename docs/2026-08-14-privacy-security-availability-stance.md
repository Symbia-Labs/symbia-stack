# A stance on privacy, security, and availability

*Drafted 14 August 2026 against `fix/2026-08-06-api-gaps`, a live stack, and the
security suites re-run in this session. Every claim below is either **observed**
(I ran it or read the code) or marked **inferred** / **unmeasured**. Nothing here
is carried over from a document I did not check.*

**Rule for this document:** if a line cannot name a file, a test run, or a probe
result, it does not get to be a claim. Where the honest answer is "not measured,"
that is the entry.

**Revised the same day, and the revision is part of the record.** The first draft
was written against `f7d77a7`. Three commits landed on the host while it was
being written — `7bfa1c4` (health-probe description derived from the registry),
`5c0df00` (restart policy), `5b41df5` (gitignore the service keypairs) — and
they falsified three of its claims within the hour. Two of those claims were
*wrong when written*, not merely overtaken: this document asserted the keypair
was "still not gitignored" and that no restart policy existed, having measured
both before the fixes and asserted them after. **A dated measurement is not a
standing fact, and a document that quotes its own earlier reading without
re-checking is doing the thing this project exists to stop.** Corrections are
inline and marked, never silently patched.

---

## 0. The stance in one paragraph

Symbia's security story is not "we are hardened." It is **"we can show you the
boundary, and we can show you where the boundary stops."** The 13 August
remediation is what makes that sayable: six findings were answered with
mechanisms, and each mechanism landed with a committed regression test or a
registered prediction. What we have is not a secure product — it is a **security
posture that is measurable**, with a ledger of exactly where it is inert. That
ledger is the asset. The same discipline the platform sells for provenance
(observation ≠ inference, registered predictions, receipts) is now applied to its
own security claims, and it immediately produced uncomfortable answers. Those are
the ones worth publishing.

---

## 1. Privacy — the position

### 1.1 What we claim: tenant isolation is enforced at the database, not just in code

**RUNS.** Row-Level Security is real and now consistently wired.

- Session context (`symbia.org_id`, `symbia.user_id`, `symbia.can_bypass_org`,
  `symbia.service_id`) is set per request through a fail-closed
  AsyncLocalStorage scope (`symbia-db/src/als-context.ts`,
  `symbia-db/src/rls.ts`) with pinned-client `SET LOCAL`.
- `messaging` — the service holding conversations and message bodies, and the
  one round 2 found **inert** — is now wired three ways: its pool is wrapped
  (`messaging/server/src/database.ts:60 attachRLSPoolWrapper`), its auth path
  opens the scope (`messaging/server/src/auth.ts:49 runWithRLSContext`), and the
  `message.create` transaction runs through `withRLSContext`
  (`models/message.ts:127`). *Observed by grep, 14 Aug.*
- The fix landed at the **shared root**, not per service: `@symbia/auth` gained
  an optional `onAuthenticated` hook (`symbia-auth/src/types.ts:79`,
  `middleware.ts:99`) so it stays db-agnostic while every consumer inherits the
  context. This is the deliberate opposite of the forked-middleware failure that
  caused R1 in the first place.

**Stance:** we say *"org isolation is enforced in the database, and the wiring is
tested against a real Postgres in CI"* — not *"your data is isolated."* The first
is checkable. The second is a promise about deployments we do not control.

### 1.2 Where isolation is deliberately not in force — say it first, not in a footnote

- **Dev mode has no RLS at all.** pg-mem does not implement Postgres RLS. The
  code says so loudly at startup (`symbia-db/src/database.ts:52-56`,
  `WARNING: RLS NOT ENFORCED (pg-mem)`). Anyone evaluating on the in-memory path
  is evaluating a system with the backstop switched off.
- **Explicit-client paths are a known seam.** The ALS wrapper only intercepts
  pooled `pool.query()`; `pool.connect()` / `db.transaction()` must opt in via
  `withRLSContext`. Rather than claim the seam closed, we **ratcheted** it: a
  test asserts no file exceeds its reviewed baseline. *I ran it, 14 Aug —
  `EXPLICIT-CLIENT-RATCHET: 2 passed, 0 failed`, measured sites:
  `assistants/server/src/index.ts` 1, `identity/server/src/db.ts` 1,
  `logging/server/src/db.ts` 1, `messaging/server/src/database.ts` 2,
  `messaging/server/src/models/message.ts` 1.*
- **The console auto-logs-in.** `symbia-control-center/src/hooks/useAuth.ts:54`
  signs in as `dev@example.com` when `DEBUG` is set. Not a missing login screen —
  a hardcoded one. Still open.

**Stance:** *a ratchet is a stronger privacy claim than a fix,* because a fix
decays silently and a ratchet fails the build. We publish the seam count, not the
absence of seams.

### 1.3 Secrets and credentials at rest

**RUNS.** `@symbia/crypto` centralises this:
- Vault: HKDF-SHA256 key derivation → AES-256-GCM with versioned ciphertexts and
  a legacy read path (`symbia-crypto/src/vault.ts:57,64,81`).
- Keyed hashing: real HMAC-SHA256 with `timingSafeEqual`
  (`symbia-crypto/src/keyed-hash.ts:16,37`).
- Identity refuses to start in production without `CREDENTIAL_ENCRYPTION_KEY`.

**Log redaction — was two implementations, now one.** *Corrected 14 Aug, later
the same day.* `symbia-http` (the log path all ten services share) redacted four
**top-level** keys by exact name, so `{ auth: { token } }` and
`{ items: [{ apiKey }] }` were logged verbatim platform-wide — and it never
looked at the query string, which is where credentials most often leak. A
stronger recursive redactor existed in `integrations/server/src/security.ts` and
served one service. Two implementations of one security concern, the weaker one
in the shared path: the forked-concern shape that caused R1, one layer down.

Now `@symbia/redact` — one implementation, the `@symbia/pathguard` treatment.
Deep, cycle-safe (a `WeakSet`, not just a depth cap), binary never logged as
bytes, `Error` keeps its message and drops its stack, and `symbia-http` redacts
the query string as well as the body. `integrations` re-exports it under the old
name so no call site changed. *20/20 regression checks pass
(`scripts/tests/redaction.test.ts`, run 14 Aug); `npm run check` green across all
workspaces after the change.*

**The test found a defect in the fix, which is the point of writing it first.**
The initial pattern list included a bare `/^auth$/i`, which collapsed
`{ auth: { method: "oauth", token } }` to `auth: "[REDACTED]"` — destroying the
diagnostic half to protect a leaf that `/token/i` already protects one line
down. A container name is not a secret. Removed; `authorization` stays, because
that key holds the credential itself.

### 1.4 What we do not claim about privacy

- **No data-retention or erasure mechanism exists.** Retention appears in
  `INTENT.md:280,289`, `README.md:301` and service INTENT files as intent;
  `messaging/INTENT.md:691` states plainly that *"archival/retention is a future
  concern."* There is no deletion pipeline, no per-data-type retention config in
  code. **PAPER.** Do not put retention on a slide.
- ~~**A private key appeared untracked in the working tree.**~~ **CLOSED
  14 Aug (`5b41df5`)**, and this entry was **wrong when published**. It said
  "still not gitignored"; `git check-ignore -v` now resolves
  `assistants/.identity/service.key.pem` to `.gitignore:70`, and the ignore rule
  is `.identity/` — every service directory, not just this one, since any
  service that generates an identity grows the same directory. The claim was
  measured before the fix and asserted after it. *Kept visible rather than
  deleted: the failure mode is the interesting part.*

---

## 2. Security — the position

### 2.1 The frame: mechanisms are correct; propagation is the work

That sentence is round 2's own verdict
(`docs/2026-08-13-adversarial-analysis-round-2.md`) and it held up: every fix
since has been *applying a correct mechanism to another surface*, not inventing a
new one. It is a better story than "we hardened the app," because it predicts
where the next hole is — wherever a mechanism has not reached yet.

### 2.2 Egress: the boundary the boundary model did not cover

**RUNS, and it is the sharpest new thing.** The platform's thesis is provable
boundaries via the Network service; component `fetch` sat entirely outside it and
could reach cloud metadata or any internal service. `@symbia/egress` (139 lines,
`symbia-egress/src/index.ts`) is now the one vetted path, wired into all three
identified call sites: `assistants/.../notify.ts:4`,
`assistants/.../webhook-call.ts:4`, `runtime/.../executor/components.ts:23`.

*I ran the suite, 14 Aug: **`EGRESS-GUARD: 21 passed, 0 failed`*** — metadata
`169.254.169.254` blocked, loopback blocked, RFC1918 blocked, IPv6 ULA/link-local
blocked, `file://`/`ftp://` blocked, integer-form `http://2130706433/` blocked,
`::ffff:127.0.0.1` blocked, NXDOMAIN fail-closed, public IPs allowed.

Two things make this the model entry in the ledger:
- **Its scope is declared, not implied.** The header states it is deliberately
  *not* applied to internal `resolveServiceUrl` traffic, and says why.
- **Its limit is declared in its own source.** *"a DNS-rebinding TOCTOU window
  remains. Closing it requires pinning the checked IP on the socket… that is a
  documented follow-up, not claimed here."* A guard that names its own bypass is
  worth more than one that does not.

### 2.3 Code execution: we deleted the capability rather than claim a sandbox

**RUNS.** Round 1 gated code tools off by default and confined paths. Round 2
still called it *"confined but not sandboxed."* The answer was not a better gate —
commit `0ddd373` **removed bash/command execution outright**. The file now carries
a standing instruction: *"Do not re-add `spawn`/`child_process` to this"*
(`assistants/server/src/engine/actions/code-tool-invoke.ts:15`), and registration
remains off by default behind `ASSISTANTS_ENABLE_CODE_TOOLS` (`:32`).

Path validation is consolidated into exactly one validator, `@symbia/pathguard`
(179 lines) — a forked concern *closed*, and the counter-example that proves the
R1 forked-auth failure is a fixable class, not a condition.

**Stance:** *when we cannot prove a boundary, we remove the capability rather than
describe the gate as a boundary.* The real boundary — a capability-scoped wasm
component runtime (`docs/proposals/wasm-runtime.md`) — is **PAPER**, with two
runnable spikes and its first prediction (component ergonomics past scalars)
explicitly **untested**. It stays PAPER in every external document until step 2
lands.

### 2.4 Security testing is behavioural and gated, with a stated coverage gap

- `npm run test:security` = 38 stubbed checks (A1 code tools, A4 tenancy,
  A2/A3 crypto), no running stack required.
- `.github/workflows/verify.yml` additionally runs the egress guard, seed guard,
  explicit-client ratchet, live-Postgres A4 RLS, and live messaging RLS isolation
  against a real `postgres:15` service — on every push to the working branch and
  every PR into `main`/`develop`.
- ~~**Coverage gap:** the aggregate `test:security` runs only a1/a4/crypto while
  CI runs six suites.~~ **CLOSED 14 Aug.** A developer running the documented
  local command got a green that CI did not mean. `test:security` is now the
  whole stack-free set — a1, a4, crypto, egress, seed-guard, ratchet, redaction —
  and `verify.yml` calls that one script plus `test:security:live` for the two
  Postgres-backed suites, instead of listing steps that could drift from it
  again. The gap reopens the moment someone adds a CI step without adding it to
  the script; the workflow now says so at the point of temptation.
- **This session's runs:** egress **21/21**, explicit-client ratchet **2/2**,
  redaction **20/20**, all under `node --experimental-strip-types`. The
  a1/a4/crypto and seed-guard suites **did not run here** — `tsx` is absent from
  this environment and Node's type-stripping cannot resolve their
  `.js`-specifier imports. *Not a failure; unmeasured.* `npm run check` **did**
  run: green across every workspace, including the new package.
- **A build-tooling fragility worth one look on the host.** `tsx` was missing
  here, and the 13 Aug close hit the same thing (`npx tsx scripts/check-ports.ts`
  crashed). If `npx tsx` fails on the host too, then `npm run check:ports` and
  most of `npm run test:security` are broken for everyone, and the greens in the
  ledger are coming only from CI. *Unmeasured from here.*

### 2.5 What remains open, ranked, with no softening

1. **Unauthenticated route surfaces are now instrumented but still unmeasured.**
   The defect was that no list existed. A list would have been the wrong fix —
   it decays on the next route move, and a grep-based one cannot see
   middleware-guarded routers by construction (the exact blind spot CI commit
   `a34add9` fixed, and the exact failure of the deleted `tests/` suite: 303
   failures, zero defects, because it tested a February architecture by looking
   for strings). So: `scripts/enumerate-unauthenticated-routes.mts`
   (`npm run audit:unauth`) asks the running stack instead — every read
   operation in every committed OpenAPI spec, requested with no `Authorization`
   header. 401/403 is a guard, 2xx is a finding, and **a probe that does not
   connect is reported `unreachable`, never counted as clean.**

   *Ran it here: 180 read operations across nine specs, **180 unreachable** —
   this sandbox cannot reach the host's localhost. The instrument correctly
   refused to call that a pass.* **It must be run on the host, and until it is,
   this line has an instrument and no measurement.** Three surfaces
   (`directory`, `control-center`, `api`) have no committed OpenAPI spec and are
   not probed at all — unmeasured, not clean.

   Known gap in the instrument, stated rather than hidden: **write operations
   are not probed.** The only way to learn whether an unauthenticated `POST` is
   refused is to attempt it, and if it is not refused, the probe *is* the
   breach. Closing that needs a disposable stack, not a cleverer request.
2. **pg-mem dev mode has no RLS** (§1.2). A warning is not a control.
3. **The seed footgun** (`STATUS.md §6.1`) — still the likeliest way for good
   state to be destroyed by routine operation. A seed guard now exists
   (`da63414`); I could not execute it here (its test imports a `.js` specifier
   that Node's stripper cannot resolve), so **guard-added is the observation;
   "protected" would be an inference.**
4. ~~**Two redaction implementations of unequal strength**~~ — **CLOSED 14 Aug**
   (§1.3), consolidated into `@symbia/redact` with 20 regression checks.
5. ~~**`assistants/.identity/service.key.pem` untracked and un-gitignored**~~ —
   **CLOSED 14 Aug** (§1.4), and the entry was wrong when written.
6. **The console's hardcoded `DEBUG` login** (§1.2) is the oldest open one and
   the easiest to forget, because it looks like a missing feature.

---

## 3. Availability — the position, and it is the weakest of the three

### 3.1 What is observed

**The stack is up right now.** `symbia_stack_health`, 14 Aug, this session:
**11/11 healthy**, latencies 22–48 ms — identity 5001, logging 5002, catalog 5003,
assistants 5004, messaging 5005, runtime 5006, integrations 5007, models 5008,
network 5009, control-center 8000, api 9000. That eleven is the *stale probe's*
denominator; a full rebuild the same day reported **13/13** (§3.2). Both numbers
are real and they count different things, which is precisely the problem §3.2
describes.

Health endpoints are real and consistent: `/health`, `/health/live`,
`/health/ready` are excluded from request logging across every service, and
`symbia-http/src/server.ts:175` provides the shared one. Compose defines
`healthcheck` blocks and `depends_on: condition: service_healthy` ordering for
every service.

### 3.2 The instrument did not cover the whole surface — found while writing this, closed the same day

`STATUS.md §1` describes **twelve** services including `directory` on 5010, and
`@symbia/sys` carries `DIRECTORY: "directory"` in the registry. The health probe
returned **eleven**, and `directory` was not among them.

The cause turned out to be two-layered, and the second layer is the interesting
one. The running MCP `dist/` was stale (6 Aug: hand-mapped ports, no directory,
`network: 5054` still present) — the staleness class `CLAUDE.md` already warns
about. But the *source* had a second copy of the same mistake: the tool derived
its probe list from `RunningServices` while its **description** still enumerated
"all nine services" by name. The code probed `directory`; the prose denied it.

Closed by `7bfa1c4`: the description is now a template over the registry, so the
count and the list cannot drift from what is probed. `dist/` rebuilt. Verified on
the live stack — 5010, 8000 and 9000 all answer `/health` 200, so the wider
denominator reports no false alarms — and a full rebuild of the branch came up
**13/13 healthy** (`f7d77a7`).

**The lesson outlives the fix.** A hardcoded count in a description is a claim,
and it outlived the thing it counted. *"11/11 healthy" was a claim about eleven
services presented as a claim about the platform* — the entire product thesis,
failing on our own dashboard. We found it by writing this document, not by
monitoring. **Note the running MCP server still needs a restart to pick up the
rebuilt `dist/`;** until then the probe in front of you is still the old one.

### 3.3 What we must not claim

- ~~**No restart policy on any service.**~~ **CLOSED 14 Aug (`5c0df00`)** — and,
  like §1.4, this entry was **stale at publication**: it was measured before the
  fix and asserted after it. `docker-compose.yml` had exactly one `restart:`
  directive (`restart: "no"` on `db-bootstrap`); all 13 long-running services now
  carry `restart: unless-stopped`, and `db-bootstrap` keeps its explicit `no` as
  a one-shot job that must not loop. *Re-measured: 13 × `unless-stopped`,
  1 × `"no"`.*

  **Process restart is the floor, not recovery.** `unless-stopped` returns a
  crashed container; it does nothing for a corrupted database, a wedged process
  that stays up, or the in-memory state below.
- **No replication, no redundancy.** No `deploy:`/`replicas:` anywhere. Single
  Postgres, single instance of each service. Unchanged.
- **No backups.** `grep` for `pg_dump` / `backup` / `restore` across `scripts/`
  and both compose files finds **nothing** but an unrelated comment.
- **Postgres-loss survival is unmeasured.** The crash *mechanism* was removed —
  the unhandled pool `error` event is now handled (`symbia-db/src/database.ts:67`,
  `messaging/server/src/database.ts:50`). **Handler-added is the observation;
  "survives a Postgres restart" would be an inference**, and the live restart test
  is still owed.
- **Rate limiting is off by default.** `RATE_LIMIT_ENABLED === 'true'` is required
  in `assistants/server/src/config.ts:20` and `catalog/server/src/config.ts:17`;
  identity carries its own in-process `Map`-based limiter
  (`routes.ts:296`) — which means it is per-process and resets on restart.
- **Circuit breakers exist in one service.** `integrations` only. `SECURITY.md`
  lists "circuit breakers" under platform-wide built-in protections; that is one
  service's feature described as a platform property. **Fix `SECURITY.md`.**
- **In-memory state by ruling.** Lineage chain heads and rule state live in
  memory; a restart re-links a conversation to GENESIS. This is a *ruling*, not a
  defect — but it means restart is not transparent to users, and the open item is
  **disclosure**: after a restart, a follow-up whose referent is gone should say
  it lost the thread.

### 3.4 The honest availability stance

**We do not have an availability story. We have a liveness instrument and a list
of everything that is single-copy.** The right claim, as of this evening:
*"thirteen services report healthy on demand and restart if they crash; nothing
replicates, nothing is backed up, and no failure has ever been deliberately
induced."* Anything stronger is unearned.

Availability is the dimension where the project's own discipline has been applied
least — **three security passes, zero chaos passes** — and today's two fixes
sharpen rather than soften that. `restart: unless-stopped` and a corrected probe
denominator are both *hygiene*: they mean a crash is survivable and the dashboard
is honest. Neither is a measurement. **Everything in §3.3 that says "unmeasured"
is still unmeasured, and the cheapest first experiment is unchanged: kill
Postgres, kill a service, watch, and write down what happens** — including
whether a conversation says it lost the thread or merely acts confused, which is
the open disclosure defect from `STATUS.md §4`.

---

## 4. What this stance is actually for

The three sections are not equally strong, and the asymmetry is the point.

| | posture | evidence class |
|---|---|---|
| Privacy | mechanisms correct and propagated; seams ratcheted; redaction consolidated; retention absent | code + CI-gated live-Postgres tests; 20/20 + 2/2 run here |
| Security | mechanisms correct; scope and limits self-declared; one capability deleted rather than sandboxed; unauth surface instrumented but unmeasured | 21/21 run here; `npm run check` green; 4 suites read, not run |
| Availability | liveness + process restart; no redundancy, no backups, no induced failure ever | two live probes, one grep of compose |

The differentiator is not that Symbia is more secure than comparable early-stage
platforms. It is that **the security claims carry the same receipt discipline the
product sells** — arena, steps, and a signature, or it does not count. Four things
this document did that a conventional posture statement would not:

1. It **found a defect in the availability instrument** (§3.2) by insisting the
   number be checked rather than quoted — a hardcoded "nine" in a tool
   description that had outlived the tenth service.
2. It **found a defect in its own fix**: the redaction regression test failed on
   the pattern list the same commit introduced (§1.3). Writing the test first is
   what made that a five-minute correction instead of a year of over-redacted
   logs.
3. It **reports what it could not run** (§2.4) instead of quoting a green from a
   file, and it **shipped an instrument that reports `unreachable` rather than
   `clean`** (§2.5.1) when it cannot see the thing it is measuring.
4. It **was falsified twice within an hour of being written**, by fixes to the
   very defects it named — and says so in the header rather than quietly
   updating. Two of its claims were wrong *when published*, because they were
   measured before a fix and asserted after it.

That last one is the most useful thing in the document. **A measurement has a
timestamp, and a document that repeats one without re-checking is doing exactly
what this project exists to stop.** If a claim here is wrong, that is a defect
*in this document* — fix it here first.

## 5. Next, in order

*This list was written, then worked. Six of the seven are done — five in this
session, and items 1 and 2 on the host while the document was being drafted.
What is left is the part that needs a running stack and a willingness to break
it.*

**Done 14 Aug:**

1. ~~Gitignore `assistants/.identity/`~~ — `5b41df5`. Ignores `.identity/`
   everywhere, not just the one directory that had grown it.
2. ~~Fix the health probe surface~~ — `7bfa1c4`. Description templated over the
   registry; `dist/` rebuilt; 13/13 on a clean rebuild. **The running MCP server
   still needs a restart to serve it.**
3. ~~Fold the CI-only suites into `npm run test:security`~~ — the local command
   and the CI gate now mean the same thing, and `verify.yml` calls one script
   instead of six drifting steps.
4. ~~Correct `SECURITY.md`~~ — every protection now carries its scope, circuit
   breakers are marked *integrations only*, retention's absence is explicit, and
   availability is stated separately so it cannot be read off the security list.
5. ~~Enumerate the unauthenticated routes~~ — **instrument delivered, measurement
   still owed.** `npm run audit:unauth`. See §2.5.1 for why a prober and not a
   list.
6. ~~Reconcile the two redaction implementations~~ — `@symbia/redact`, 20/20,
   wired into `symbia-http` (all ten services) and re-exported by
   `integrations`. Query strings are now redacted too.

**Open, and the order matters:**

7. **Run `npm run audit:unauth` on the host.** Everything in item 5 is a
   promise until this produces a number. It takes one command.
8. **Chaos pass #1** — kill Postgres, kill a service, record what happens.
   This is the single highest-value item in the document, because it converts
   the largest block of "unmeasured" in §3.3 into evidence, and because
   `restart: unless-stopped` has made the outcome *interesting* rather than
   merely bad. Register the predictions in git first (MAP), then measure.
9. **Check `npx tsx` on the host** (§2.4). If it fails there as it does here,
   `npm run check:ports` and most of `npm run test:security` are broken for
   everyone and the ledger's greens are coming from CI alone.
10. **Back up something.** There is no `pg_dump` anywhere. A single scripted
    dump-and-restore, exercised once, would be the first backup claim this
    project is entitled to make.
11. **The console's hardcoded `DEBUG` login.** Oldest open item here.
