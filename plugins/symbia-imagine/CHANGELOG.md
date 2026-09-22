# symbia-imagine — changelog

Versions are declared in `imagine/plugin/plugin.json` and stamped into the
package by `scripts/package-imagine.sh`. The runtime build marker
(`IMAGINE_BUILD`) carries version, UTC build time and commit, so two packages
of one version are distinguishable from inside a running sidecar — check it
before concluding a fix is live.

While the major version is 0, a behaviour change bumps the minor.

## 0.20.1 — 2026-09-22

### Changed
- **Installable from the public repository.** `Symbia-Labs/symbia-stack` now
  carries a Claude plugin marketplace (`symbia-stack`) holding this package.
  The README gives the two commands.
- **The first-run size is stated as measured.** A clean install on 22 Sep put
  222 MB in `node_modules` (250 MB on disk), 311 packages, 40 s. `googleapis`
  alone is 125 MB and `node-llama-cpp` 55 MB. The shim's status line said
  57 MB, the figure from 17 Aug before those arrived, and the README said
  150 MB. Both now say about 250 MB.
- **The README describes the owned host.** It still said the host outlives
  the client and survives quitting Claude. Since the owned-host default the
  shim spawns its host and the host shuts down when the shim's pipe closes;
  measured on this build, killing the shim took the host with it.

### Known gap
- On a cold boot the runtime's seven routine components failed to register:
  `Catalog POST /api/resources -> 429: Too many write requests`. The catalog's
  write budget refuses the stack's own bootstrap. Ten of ten services mount
  and `symbia_stack_health` reports nothing down, so only this log line
  shows it.

## 0.20.0 — 2026-08-30

### Changed
- **The runtime trace lives on an ephemeral filesystem and is removed on clean
  takedown.** The ledger, the session public key, the body store and the host
  log move from `imagine/.session/` to a per-spawn directory under the system
  temp dir (`imagine-run-XXXXXX`), which `takedown()` deletes after the seal is
  written and the ledger is closed. `.session/` now holds sealed bundles and a
  lineage file.

  The claim this mode makes is that an instance which fails and exits leaves
  nothing a later instance can inherit. The database already worked that way —
  no `DATABASE_URL`, pg-mem, gone with the heap (measured 30 Aug: a context
  written to the catalog was absent after a restart). The chain did not:
  `.session/` held 248 ledgers and 248 public keys, 831 MB, because a
  per-session file was created on every spawn and nothing ever removed one.

  A process that is killed never reaches the cleanup, so its directory survives
  in the temp dir and its work is recoverable. Evaporation on the clean path,
  recovery on the dirty one.

- **Lineage is a line, not a directory.** `findPredecessor` read the newest
  ledger in `.session/`, which only worked because ledgers were never deleted.
  A closing session now appends one line to `.session/lineage.jsonl` — session
  id, head, how it ended, declared total — and a successor cites that. The old
  ledger scan remains as a fallback for existing installs and for a
  predecessor that was killed before it could write a line.

  Nothing verifiable is lost with the trace: a sealed bundle already carries
  `publicKeyPem`, so it verifies on its own.

  Measured on this change: ledger path under `/var/folders/…/imagine-run-…`;
  temp dir gone after a clean quit; `.session/` gained one bundle and one
  lineage line and no new ledger or pem; the next host cited the closed session
  from the lineage file; the takedown bundle held 123 of 123 events with 95 of
  95 addressed bodies present.

### Known gap
- Orphaned `imagine-run-*` directories from killed processes are not swept.
  macOS clears `/var/folders` eventually; a startup sweep of directories with
  no live process would make it deliberate rather than incidental.

## 0.19.0 — 2026-08-26

### Reverted
- **Back to the 0.17.0 shape, because 0.17.0 connected and 0.18.0 did not.**

  0.18.0 added a credential file (`~/.symbia/credentials.json`,
  `SYMBIA_CREDENTIAL_FILE`) and declared `IMAGINE_BUILD` in `symbia-durable`'s
  env. After installing it, `symbia-imagine` reported
  `build: 0.18.0+2026-08-26T14:13:50Z+aae4ed4+dirty` and `symbia-durable` did
  not connect at all. At 0.17.0 durable connected and answered `selftest`.

  What was checked and cleared: `imagine/plugin/mcp.json` parses; the built
  `imagine/mcp-server/index.js` carried the change; the stamper only rewrites
  `IMAGINE_BUILD` where the key already exists, so adding it was inert. The
  cause was not found. It is not recorded here as a defect in the credential
  file, because nothing established that.

  **Untested variable, named because it is the only one:** the binary was
  verified in a Linux sandbox on node v22.23.2; the sidecars run node v25.2.1.
  `readFileSync` from `node:fs` is stable across both, so this is a weak
  suspect rather than a conclusion.

  Kept from 0.16.0 and 0.17.0, which were working: report-don't-exit on a
  missing credential, the unexpanded-`${...}` guard, and `build` / `loadedFrom`
  / `credential` in `selftest`.

  The credential message now says plainly that `${SYMBIA_TOKEN}` passthrough does
  not work on this host and that the literal value belongs in the env block.
  That is uglier than a credential file and it is what was measured to work.

  Not a version rollback: 0.19.0 rather than reissuing 0.17.0, because two
  packages sharing one version are indistinguishable from inside a running
  sidecar, which is the thing `IMAGINE_BUILD` exists to prevent.

  **Method note.** Four versions shipped in one morning, each verified only
  after being handed over. 0.17.0's `selftest` had already produced the exact
  diagnosis; the right next step was one change against it, not two changes and
  a config edit bundled together. The working state was lost to the bundling,
  not to any one of the changes.

## 0.18.0 — 2026-08-26

### Added
- **A credential file, so a working install survives being reinstalled.**

  0.17.0's `selftest` answered the question three versions had been guessing at:
  `credential.configured: false`, `build: "unstamped"`, and `loadedFrom` a temp
  extraction directory. The `"${SYMBIA_TOKEN}"` passthrough added in 0.16.0 does
  not reach the process — the host either does not expand it or the variable was
  unset — so `symbia-durable` was connected and refusing every call.

  A secret cannot live in the plugin's `.mcp.json`: that file is packaged and
  distributed, and a public password was removed from it once already. So the
  config carries a path and the secret lives outside the package:

      ~/.symbia/credentials.json
      {"email": "...", "password": "..."}

  Accepted keys are `sessionToken`, `token`, `email`, `password`, any subset.
  `SYMBIA_CREDENTIAL_FILE` overrides the location. Environment variables still
  win, so an explicitly configured value is never silently overridden by a file.
  A missing file is the normal case and reports nothing; a malformed one is
  reported through the credential message rather than thrown at module load,
  which is the failure this line of work exists to stop.

  `selftest` now reports `credential.kind` and whether it came from the
  environment or a named file.

  Verified by running the built binary three ways: with no credential it starts
  and names the file to create; with the file at `$HOME/.symbia`; and with
  `SYMBIA_CREDENTIAL_FILE` pointing elsewhere.

### Fixed
- **`symbia-durable` reported `build: "unstamped"`.** `package-imagine.sh`
  stamps `IMAGINE_BUILD` into `.mcp.json`, but only where the key already
  exists, and only `symbia-imagine` declared it. Durable now declares it too, so
  both sidecars report which build is answering.

## 0.17.0 — 2026-08-26

### Fixed
- **`symbia_selftest` now names the build that is answering, and the file it was
  loaded from.**

  Measured 26 Aug, immediately after installing 0.16.0: `symbia-imagine` served
  the new `describe_operation` behaviour — `$ref` inlined, path-item parameters
  merged — and `symbia-durable` served the pre-0.15.0 shape. Two sidecars
  declared in one `.mcp.json`, from one package, running different code. The
  repo's `symbia-mcp-server/dist/index.js` and the staged
  `imagine/mcp-server/index.js` both carried the new source, so the packaging
  was correct and the client had launched durable from something older.

  Establishing that took four tool calls of inferring build identity from
  behaviour, because no response said which file the process had loaded.
  `selftest` now reports `build` (from `IMAGINE_BUILD`, stamped into `.mcp.json`
  at package time) and `loadedFrom` (`process.argv[1]`). A process reporting
  `unstamped` was launched from a config predating stamping, which is itself an
  answer.

  The general lesson, recorded because it cost most of a morning: a change worth
  shipping should leave something observable from outside the process. The
  `credential` block added in 0.16.0 turned out to be a better liveness marker
  than the version string, by accident. This makes it deliberate.

## 0.16.0 — 2026-08-26

### Fixed
- **`symbia-durable` exited before connecting, so the one process that knew why
  took the answer with it.** `index.ts` called `process.exit(1)` when none of
  `SYMBIA_SESSION_TOKEN`, `SYMBIA_TOKEN` or `SYMBIA_PASSWORD` was set. The
  `symbia-durable` entry in the plugin's `.mcp.json` declares `env` with
  `SYMBIA_BASE_URL` and no credential, so the server died before
  `server.connect(transport)` and a client rendered that as "failed to connect"
  and nothing else.

  Measured 26 Aug: after installing 0.15.0, `symbia-imagine` reconnected and
  `symbia-durable` stayed down through four exchanges. `symbia-imagine` was
  unaffected because it runs `shim.mjs --autostart`, which mints its own session
  identity and needs no configured credential.

  **A missing credential is now reported, not fatal.** The server starts,
  connects, prints the diagnosis on stderr, and returns it from every call that
  needs a token. `symbia_selftest` carries a `credential` block ahead of the
  loopback probe, because a caller reading top-down should meet the thing that
  makes every other line moot first. A tool that reports its own
  misconfiguration can be diagnosed from outside; one that refuses to exist
  cannot.

  Exiting bought no safety it was not already declining to provide: startup
  validates neither the credential nor the stack (F109), and a server started
  with a deliberately invalid token prints "running" against a base URL where
  nothing is listening.

  The env block also now passes the four credential variables through, since
  declaring `env` in an MCP config may **replace** the inherited environment
  rather than extend it — which is why exporting a token in a shell was not
  enough on its own.

  Verified by rebuilding from source and running the binary: with no credential
  it now exits 0 and reports "running" after printing the diagnosis; with a
  credential, behaviour is unchanged.

- **An unexpanded `${VAR}` placeholder was indistinguishable from a token.**
  A host that does not expand `"${SYMBIA_TOKEN}"` passes those characters
  through verbatim. Read as a bearer token, every call 401s with an
  authentication error naming no cause. Values matching `^\$\{[^}]*\}$` are now
  treated as absent, so the failure lands on the startup message instead.

- **The startup message now names the file to edit** — `imagine/plugin/mcp.json`
  — states that the process is exiting before connect, warns that a client will
  surface only "failed to connect", and notes that `env` may replace rather than
  extend the environment.

### Known, not fixed
- `SYMBIA_BASE_URL` is still the literal `http://localhost:5100` in the shipped
  config. The repo rule is to address services by id and never by port, and the
  5000/5100 confusion is its most expensive recurring bug. `npm run check:ports`
  does not scan this file. Left alone because changing the addressing model is
  not a change to make without being able to test it.

## 0.15.0 — 2026-08-26

### Fixed
- **`symbia_describe_operation` handed back a pointer with nowhere to follow it.**
  `operationsFor` fetched each service's whole OpenAPI document and kept only a
  projection of paths, discarding `components` one line later. The describe tool
  then returned `requestBody` verbatim, so a caller received
  `{"$ref": "#/components/schemas/CreateContext"}` and no way to resolve it:
  `symbia_call` refuses any path that is not a declared operation, and a
  service's spec document is not one.

  Measured 25 and 26 Aug. On 25 Aug the schema was recovered by curling
  `/svc/catalog/api/openapi.json` from a shell, after two rejected writes. On
  26 Aug, with the shell withheld, the same gap had no way out and a log-stream
  body was arrived at by guessing and reading what the server accepted.

  `SpecCacheEntry` now retains `components`, and `resolveRefs` inlines
  `#/components/...` pointers at describe time. The `$ref` is kept alongside the
  expansion so two operations sharing a schema stay recognisably the same one.
  Depth is capped at 12 and each branch tracks the refs already open, so a
  self-referential schema yields `{$ref, $note: "cycle; not expanded here"}`
  rather than hanging or silently truncating.

- **Path-item parameters were invisible on every route that uses them.**
  OpenAPI allows `parameters` on the path item, applying to every method
  beneath it. The dispatcher read only `op.parameters`. Logging's
  `/logs/streams` declares five required headers there — `X-Org-Id`,
  `X-Service-Id`, `X-Env`, `X-Data-Class`, `X-Policy-Ref` — and none appeared
  in a description of either method. Path-item parameters are now merged ahead
  of operation-level ones, so a method that redeclares one still wins.

- **Two dependencies the packaged services import were declared nowhere.**
  `ws` is imported by integrations' Twitch channel provider, and
  `@symbia/models-client` by both integrations' symbia-labs provider and
  assistants' integrations client. Neither appeared in `imagine/package.json`.
  On the build machine both resolve by hoisting from the repo root
  `node_modules`, so the gap is invisible exactly where it is created — F78's
  shape.

  Measured 26 Aug: `imagine/vendor/symbia-models-client` was being vendored
  correctly and both bundles reference it (`services/assistants.mjs`,
  `services/integrations.mjs`), so only the declaration was missing. `ws` is
  now declared at `^8.18.0`, matching every service that declares it, and
  `@symbia/models-client` at `file:./vendor/symbia-models-client`.

  The packaging script already detects this and prints "missing from
  package.json". It does not close the gap, so the warning has to be read and
  acted on by a person. Left as-is for now, recorded as F107.

### Changed
- A non-GET operation whose spec declares no `requestBody` at all now carries
  `requestBodyNote` on the description, saying that this is a gap in the
  service's document rather than evidence the route takes no body. Measured on
  logging's `POST /logs/streams`, which accepts a body and documented none.

## 0.14.0 — 2026-08-25

### Fixed
- **A seal signed "nothing was authored" when it had failed to look.**
  `sealSession` fetched the artifact list with
  `.then((r) => (r.ok ? r.json() : [])).catch(() => [])`, so four situations
  produced the same empty array: `CATALOG_SERVICE_URL` unset, a non-ok
  response, a thrown fetch, and a catalog that genuinely held nothing. The
  bundle then carried `authoredCount: 0`, `artifacts: []` and an
  `artifactsDigest` of `sha256("[]")` — a positive, signed claim.

  Measured 25 Aug: a bundle whose own `trace` carried
  `POST 201 contexts/2026-08-25-agent-rigor-lapse-pattern`, and whose `bodies`
  held that resource, reported zero artifacts two fields away. The agent that
  sealed it read `authoredCount: 0` as success.

  This is F49's shape — a view that confidently reported zero while reading the
  wrong table, and *a zero gets believed* — with the difference that this zero
  is inside the signature.

  A read failure is now distinguished from an empty catalog and travels as
  `artifactsUnread` on all three surfaces a reader might use: the bundle, the
  signed `imagine.session.sealed` event, and the result returned to the caller.
  The last one matters most — a failure recorded only in the file is invisible
  at the moment someone could still act on it.

### Not changed
- Why the catalog read failed in that session is not established. The fix makes
  the failure reportable; it does not diagnose it.

## 0.13.0 — 2026-08-25

### Fixed
- **A `Date` in a signed payload was committed to as `{}`.** `canonicalJson`
  did not consult `toJSON`, so a `Date` — `typeof "object"`, not an `Array`,
  no own enumerable keys — canonicalized to an empty object. Every writer of
  these values goes through `JSON.stringify`, which calls `Date.toJSON()` and
  stores the ISO string, so the digest and the stored body were taken over
  different values and could never agree.

  Measured against one session's body store: **60 of 838 bodies could not be
  verified against the digest they were filed under.** All 60 were database
  rows carrying `createdAt`/`updatedAt`; reviving those fields as `Date`
  explained 60 of 60 with none left over.

  The unverifiable bodies were the smaller half. Two records differing only in
  their timestamps canonicalized identically, so **a timestamp inside a signed
  payload was not covered by the signature over it.** `canonicalJson` feeds
  `signDocument`, the lineage chain digest and bundle digests, so this reached
  further than the body store where it was noticed.

  Fixed generally rather than for `Date` alone: `toJSON` is now consulted
  first, matching `JSON.stringify`. That also corrects `URL` (was `{}`) and
  `Buffer` (was an index map rather than `{type,data}`). Bounded at depth 64 so
  a `toJSON` returning itself throws instead of overflowing the stack.

- **A sparse array canonicalized to something that is not JSON.** `.map()`
  preserves holes, so `[1,,3]` came out as the literal `[1,,3]`, which no
  parser accepts. Now `[1,null,3]`, agreeing with `JSON.stringify`.

### Not changed, and stated so it is not rediscovered
- `Map`, `Set`, `RegExp`, `Error` and classes with only private fields still
  canonicalize to `{}`. `JSON.stringify` agrees, so digest and stored form
  match and nothing above catches it — but two different `Map`s still sign
  identically. By the same argument that makes `NaN` throw, these should too.
  Not done here: it turns a silent wrong answer into a runtime failure in live
  services, and the call sites have not been measured. Asserted in
  `scripts/tests/canonical-json.test.ts` (K1, K2) so the gap cannot close by
  accident.

### Migration
- **Nothing stored changes.** All 185 bundles on disk produce identical digests
  before and after: a bundle read off disk is parsed JSON, so no `Date`
  survives the file to reach the new branch.
- Digests taken *before* this fix over a live payload carrying a `Date` were
  computed over `{}`. They are known-wrong and cannot be retro-verified. The
  60 bodies above stay unverifiable for that reason.

### Added
- `npm run test:security:canonical` — 15 checks, included in
  `npm run test:security`.

## 0.12.0 — 2026-08-24

### Fixed
- **Promotion could never authenticate against a catalog API key (F52).** Every
  credential promote attached travelled as `Authorization: Bearer`. A catalog
  key sent that way answers 401 — "No principal on this request. A token was
  absent, expired, or issued by a different host" — while the same key sent as
  `X-API-Key` is accepted. `catalog/server/src/auth.ts` reads `x-api-key` and
  hashes it; it never consults the bearer for these.

  Measured 24 Aug by running the whole loop: the seal verified, the promotion
  gate admitted the artifact, and the write was refused. The error names the
  token, so whoever debugged it would have replaced a perfectly good key.

  `credentialHeaders()` now routes on the `sos_` prefix, which is what a key
  prefix is for. An identity session bearer has no prefix and still travels as
  a bearer. Applied at all five sites that attach a credential.

## 0.11.0 — 2026-08-23

**The default admin password is no longer a published constant.** Identity's
bootstrap hashed the literal `password123`, and that literal sits in a
repository anyone can read — verified the same day by `git ls-remote` against a
stripped environment. So every stack that had ever run the seed held an account
whose password was public. It now reads `IDENTITY_DEFAULT_ADMIN_PASSWORD`, or
generates 24 random bytes when that is unset.

Generated rather than required, deliberately: a stack that refuses to boot
without an environment variable is one a first-time reader abandons, and the
property that matters is that the value cannot be known in advance, which
generating satisfies equally.

**The notice only prints a password this boot actually set.** The insert is
`onConflictDoNothing`, so from the second boot on the stored hash is whatever
the first boot wrote. `.returning()` now distinguishes the two, and a generated
password is announced only when the row was created. A value supplied through
the environment is never echoed. Printing a fresh password next to an unchanged
account would read as an instruction and would not work.

**The seed block existed twice, verbatim, in `index.ts` and `service.ts`.** Both
now call one `default-admin.ts`. Fixing a published credential in one of two
copies is worse than not fixing it, because the survivor is the copy nobody
looks at again.

**The ephemeral stack mints its own per spawn.** `shim.mjs` generates a value
and the host inherits it, so the shim and the sidecar agree by descent rather
than by sharing a constant; `sidecar.mjs` resolves it *above* the service mounts,
because identity hashes the password while it is being mounted. Nobody types it
and nothing outlives the process.

**This protects new databases only.** An existing deployment keeps the password
its first boot wrote, so `dev@example.com` / `password123` remains valid
wherever it was already seeded. Those need rotating by hand; the code cannot
tell a deliberate password from an inherited one.

Found as F24 in the 23 Aug sweep. Caught during verification by the 0.8.0
session digest, which reported `refused: 3` with
`POST /svc/identity/api/auth/login 401` at the top — the TS source had changed
and the service bundles had not.

## 0.10.0 — 2026-08-23

**The plugin no longer ships a password.** `.mcp.json` carried
`SYMBIA_EMAIL: dev@example.com` and `SYMBIA_PASSWORD: password123` for the
`symbia-durable` connector, identically in every copy — a default to reuse
rather than a placeholder to replace, on the connector that is the front door of
the intended Claude-plus-Spyglass pairing. Both are removed; only
`SYMBIA_BASE_URL` remains.

The server already refuses cleanly without credentials, naming all three ways to
supply them (`SYMBIA_SESSION_TOKEN`, `SYMBIA_TOKEN`, or the legacy
`SYMBIA_EMAIL`/`SYMBIA_PASSWORD`), so the failure is legible rather than silent.
The README now documents the same three in the place someone looks after seeing
that message.

**The manifest points somewhere that exists, under a licence.** `homepage` and
`repository` were `Symbia-Labs/sidecar`, which the 18 Aug audit measured
returning `Repository not found` anonymously and to the `Symbia-Labs` identity
itself; they now point at `Symbia-Labs/symbia-stack`, which is publicly
readable. `license` was `UNLICENSED` inside an MIT repository and is now `MIT`.

Both were shipped-artifact defects rather than documentation ones, and both
matter more for a developer and integrator audience than they would for a
consumer one: the repository link is the first thing that reader follows and the
licence is the first question their employer asks.

Found in the 23 Aug release-readiness sweep as F19 and F20; see
`docs/2026-08-23-release-readiness-findings.md`.

## 0.9.0 — 2026-08-23

**Seven components stop failing to register at boot.** The runtime publishes 37
builtin manifests in a sequential loop; the catalog allowed 30 writes per minute
to any one caller; the last seven were refused with 429 on every single boot —
`symbia.routine.say`, `.call`, `.repeat`, `.ask`, `symbia.source.timer`,
`symbia.sink.metric`, `symbia.sink.log`. Every ephemeral stack has been running
without them, and the only record was one line of startup log. The digest added
in 0.8.0 is what surfaced it, on its first run.

An authenticated internal service now draws on its own write budget
(`RATE_LIMIT_SERVICE_WRITE_MAX`, default 300 per window) in its own bucket,
rather than sharing the caller budget. Bounded rather than exempt, because a
runaway internal loop is still worth stopping and an exemption cannot be
measured. Separate rather than larger, because raising the caller budget to fit
the platform's own boot would weaken the gate for the callers it exists to
bound.

**A 429 now names which budget was spent.** `budget`, `limit`, `windowMs` and
`retryAfterSeconds` travel with the error. "Too many write requests" left a
reader unable to tell a client hitting the user limit from the platform hitting
its own, and those have different remedies.

**Not fixed, recorded.** Every service authenticating as `service:internal`
shares one bucket, so boot order still decides who spends it. The contention
would disappear with batch creation, and the catalog has no bulk-create route:
`/api/resources/bulk` operates on existing ids only. That is a platform gap, not
a reason to write around the API.

## 0.8.0 — 2026-08-23

**A sealed bundle now carries a digest of the session that made it.** `seal`
appends an `imagine.session.digest` event immediately before the seal event, so
the digest sits inside the total the seal declares and inside the chain the
importer walks. The bundle carries it as `digest`.

The occasion, measured 22–23 Aug: a conversation lost its first half when the
sidecar restarted between turns — chain position went 360 → 174 and the
contexts written before it were unreachable from the live host. `continues`
already named the predecessor by its head, so the sequence survived; nothing
carried what the predecessor had found. Reading the predecessor's chain is not
an option at the sizes involved. One live ledger in this session directory holds
122,141 events across 86 MB. Its digest is 2,366 bytes, and the size does not
grow with the session.

**It cites and does not interpret.** Every field is a projection of chain
material or of the authored set: refusals with their seq and status, observer
notes verbatim with their positions, MAP-tagged resources by key, authored
artifacts with their attribution. Nothing is summarised or ranked, because a
model's paraphrase of a session is the unverifiable artifact the mechanism
exists to avoid producing.

**Empty fields are stated rather than omitted.** A session with no observer note
gets `notes: []` and the sentence "Nothing in the chain states what it
considered unresolved, so a successor inherits its findings without its doubts."
A digest that quietly dropped its empty headings would let a successor read
yesterday's conclusions without yesterday's uncertainty, which is worse than
handing it nothing.

Measured against a running sidecar by `imagine/04-digest-check.mjs`, with
predictions registered in the chain first: digest at seq 78, seal at 79,
refusal count matching the trace, an observer note verbatim at its own seq,
completeness 79 of 79.

**The first real digest surfaced a boot defect.** Seven components fail to
register on every sidecar boot with 429 from the catalog's own write rate
limiter — `symbia.routine.say`, `.call`, `.repeat`, `.ask`,
`symbia.source.timer`, `symbia.sink.metric`, `symbia.sink.log`. Startup exceeds
its own write limit, so a fresh ephemeral stack is missing seven components and
reports it only inside one log line. Not fixed here.

**Three repairs in `sidecar.mjs`, found while getting the above to run.** The
MCP import resolved `../../symbia-mcp-server/dist/index.js`, one level above the
repository root and above a plugin root — the defect `shim.mjs` records having
paid for twice, in the file next to it. It now uses the shim's candidate list
and the shim's `canLoad` test, because the first fix took only half of that and
chose the staged copy whose SDK does not resolve. And the 401 named the default
address file while the host had published to `IMAGINE_ADDRESS_FILE`, sending a
caller to a file that does not exist; it now names the file this host wrote, and
says when there is none.

Recorded and not fixed: a sidecar serving MCP on stdio mints a host token and
never publishes it, so every HTTP route on such a host is unreachable by any
other process. Set `IMAGINE_HOST_TOKEN` at spawn to reach one.

Design in `docs/proposals/2026-08-23-session-continuity.md`. C-2 (a route
returning the predecessor's digest) and C-3 (carrying the predecessor head into
the promotion record) are proposed there and not built.

## 0.7.0 — 2026-08-21

**A plain-English routine runs.** The `symbia.routine.*` family exists —
twelve components: the ten the compiler names, plus `entry` and `exit`.
`check`, `wait`, `stop`, `remember`, `recall`, `think`, `say` and `call` are
implemented; `repeat` and `ask` are registered and refuse with a sentence
naming the missing capability, because the executor orders nodes with Kahn's
and rejects cycles, and there is no paused-execution state to resume into.

Measured on the durable stack: `POST /api/routines` compiled and loaded a
three-step routine, and injecting a reading produced three hops —
`main-entry:out → main-s1:pass → main-s2:collect` — the last carrying
`{spoken: …, delivered: false, reason: "no conversation in context"}`. `say`
degrades to a collect port rather than appearing to have spoken.

**Two defects underneath the missing components, both silent.** The compiler
emitted ports `input`/`output`/`true` while every component declares
`in`/`out`/`pass`; a graph wired that way loaded, ticked 64 times and emitted
nothing at `errorCount: 0`. And it wrote `routineId`, `trigger` and `_debug`
into node config, which the manifest check refuses — correctly, since an
undeclared key would silently do nothing. The compiler now emits declared port
names, and the routine family declares what it carries instead of a generic
passthrough being widened to accept routine concepts.

**An undeclared port is now refused at load.** The rule `validateNodeConfig`
applies to config keys now applies to ports, in the same place and the same
voice: an edge naming a port its component does not declare routes nothing and
reports no error, so it is refused instead, with the declared ports named and
the near-miss suggested.

Lanes, which are the review point: `think` is apocryphal without exception,
`call` is apocryphal because no callee returns a receipt yet, `remember`
stores the lane with the value so `recall` cannot silently downgrade a
canonical fact, and every error port is apocryphal.

## 0.6.0 — 2026-08-21

**The routine compiler stops certifying graphs it cannot run.** A three-step
routine compiled to five nodes and returned `warnings: []` while every one of
the five ids was absent from the executor registry — the graph loaded and then
died on its first message, and the compiler's silence was the misleading part.
Two changes. The entry and exit nodes were emitted as
`symbia.core.passthrough`, a namespace that has never existed; they are now
`symbia.io.passthrough`, which is registered. And `compile()` now reports an
`UNRESOLVED_COMPONENT` warning for every referenced id the registry cannot
resolve, naming the component, the nodes, and the fact that the graph will fail
when the first message arrives.

It warns rather than refuses, deliberately. `validateNodeConfig` skips
unregistered components because one may be registered later by
`POST /api/components`, and that tolerance is intentional. A warning names the
problem without removing it.

Measured against the durable stack after a container rebuild: entry and exit
resolve, two warnings name `symbia.routine.check` and `symbia.routine.say`, and
a `timer → filter → sink.log → collect` graph still runs at 0 errors, so the
executor path is unaffected.

The ten `symbia.routine.*` components still do not exist. This change makes
that legible instead of silent; it does not build them.

## 0.5.0 — 2026-08-20

**The host log is per-process, because the gate caught the sealer.** 0.4.0's
first live promotion refused its own session's bundle: "the log does not match
the checkpoint the chain took at the same length." The mechanism: host.log was
one file per directory, opened for append by every host, and the per-session
byte range was believed to make that safe. Two node processes held it open at
once; the second's lines interleaved inside the first's claimed range, so the
incremental hash (own writes only) and the file slice (everyone's writes)
agreed on length and disagreed on bytes. D6's family, fourth appearance — the
ledger was made per-session on 16 Aug and the log was not. Now
`host.<pid>.log`, rotation staying one generation, seal reading the same name
it writes; `prove-it.mjs` matches both names so it still finds hosts from
either build. A stale per-pid log from a dead process is inert, exactly as a
stale ledger is.

The refusal itself is left exactly as it was: the gate declining to promote a
bundle whose log had been altered relative to its checkpoint was the correct
answer to the facts on disk. Verification through a rebuilt host: seal, then
promote — seal-verifies passes; re-promote of the same bundle answers
already-promoted.

## 0.4.0 — 2026-08-20

**Promotion is gated, and the receiving side keeps the record.** Four-tiers.md
§5 named the two things missing from every promotion hop — the gate that
decides what deserves to travel and the record of why it arrived — and every
check in its table existed unwired. `symbia_promote` now runs the mechanical
ones at the moment of crossing (`promotion-gate.ts`, gate id
`promotion-gate@0.1.0`): seal verification recorded as an outcome, key-shape
agreement checked before the target refuses it with less context, and MAP
linkage — an artifact citing a prediction key that exists nowhere is refused
naming the key, and a citation of a key sealed later than its citer is refused
as disordered. An artifact with no references passes that check as
not-applicable: exploratory work is not forced to invent citations.

Every confirmed promotion writes a **promotion record** into the target,
keyed on the seal checksum rather than on any name an author chose
(`contexts/promotions/<digest16>`). It carries the source bundle, session,
gate id and version, per-check outcomes, per-artifact results, and what the
promotion does not assert. Because the key is provenance, re-promoting the
same bundle is refused as **already promoted** — a different answer from
"a resource with this key already exists", which was D2's confusion. If the
record write fails, the response says loudly that the artifacts crossed
without an account — the copied-from-imagine failure, named at the moment it
happens instead of discovered later.

Dry runs report the gate verdicts, the record key, and — when the
already-promoted lookup could not complete — that the answer is UNKNOWN
rather than false.

Measured before release: probe 12/12 (P1 record shape 7/7, P3 linkage 3/3
plus disorder refusal), record round-trip by exact `?key=` through the live
sidecar. The end-to-end tool path awaits this package being installed;
predictions and results: `contexts/2026-08-20-promotion-gate-map-*`,
`experiments/promotion-gate/`.

## 0.3.0 — 2026-08-20

**Evidence enters the chain.** `POST /session/fetch` retrieves a URL through
the `retrieve()` observer in `@symbia/lineage` — TLS chain, redirects, content
digests, chunk by chunk — appends an event committing to the digest, and stores
the body in the blob store the chain already addresses. A sealed bundle now
carries the sources a session read, not just their URLs.

That observer had been built and had no caller (STATUS §4a, "good code with no
job"). The occasion for giving it one: a whitepaper written here on 20 Aug
argued that a surveillance network should produce receipts a third party can
verify, and its own sources were a list of URLs verifiable by nobody. Logged as
GAP-4.

A receipt claims that these bytes arrived from this URL over this TLS chain at
this chain position. It does not claim the content is true — a fabricated page
fetched cleanly gets a clean receipt — and `does_not_assert` says so in the
event and in the response. Failed retrievals are recorded too, so a fetch that
went badly cannot look like one that never happened.

**Durations are monotonic.** The ledger measured every span with `Date.now()`,
which steps sideways when NTP corrects. Those spans feed placement, which
treats them as the measured part and distributes only the residual, so the one
input trusted as fact was the one that could move underneath it. Spans now come
from `process.hrtime.bigint()`. The wall-clock reading stays where it belongs:
one per session, at the anchor, declared apocryphal.

**The session exposes its identity and blob recorder**, so an observer chains
its work under the session's own key rather than inventing a second key with
nothing relating the two.

## 0.2.0 — 2026-08-20

Found by publishing a whitepaper through the platform's own API, which is also
what made the defects visible: every one of them survives a test suite and
fails a user.

**The session says what survives it.** `ledger.summary` now reports
`lifetime: ephemeral` with a note that a chain position is not storage, and
surfaces `continues` — the predecessor chain's head, recorded in
`imagine.session.opened` since 17 Aug and until now readable only by opening
the ledger file. In imagine mode the anchor on every tool result carries
`EPHEMERAL: this chain dies with the host process — seal to keep it`. An agent
registered predictions, worked a day, and returned to a reset chain; nothing in
any response had said that was possible.

**The front door is addressed as itself.** `serviceBase()` returned
`{base}/svc/server` for the `server` service, which 404s by construction — a
gateway cannot proxy to itself. `symbia_list_operations` and
`symbia_stack_health` had been reporting that as a fact about the service for
three days. `server` now resolves to the base URL; port mode is unchanged.

**A service the door does not front is not a service that is down.**
`control-center` is absent from the front door's `routing.services` and was
reported as `404`. Discovery now reads the handshake and says "not routed by
this front door … an addressing fact, not a fault in the service".

**The build marker identifies a package.** `IMAGINE_BUILD` was the literal
string `0.1.0` in every build ever made.

**Version is declared once.** It lived in three files that could disagree;
`plugin.json` is now the source and packaging refuses a missing version rather
than defaulting to one.

## 0.1.0

Initial packaged release.
