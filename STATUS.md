# STATUS

**What exists, what runs, and what is only written down.**
Last verified: 11 August 2026 (evening), against a running stack and the code on
`fix/2026-08-06-api-gaps` at `9449ad6`. Security posture and build gate
re-verified 13 August against the code only (stack not restarted); see §0a.

## 0a. 13 Aug security remediation — code landed, runtime unverified

An adversarial analysis (`docs/2026-08-13-adversarial-analysis.md`, response
in `docs/2026-08-13-adversarial-analysis-response.md`) was worked through in
five commits (`9665f62`…`7bec31b`). State by finding:

- **A1 code tools**: registration now off by default
  (`ASSISTANTS_ENABLE_CODE_TOOLS`), bash double-gated, caller-supplied
  workspace roots and permission escalation removed, path checks are
  sep-boundary + symlink-aware + blockedPaths-enforcing. Verified by harness
  (12/12). **Still not a sandbox** — real isolation remains open.
  Path validation is consolidated in `@symbia/pathguard` (13 Aug) — runtime
  re-exports it, assistants imports it; there is exactly one validator now.
  Do not add another copy.
- **A4 tenancy**: `X-Org-Id` membership-checked in assistants (403 cross-org,
  verified by harness); all five DB-backed services run requests inside a
  fail-closed AsyncLocalStorage RLS scope with pinned-client `SET LOCAL`
  (`@symbia/db` als-context). **Not yet exercised against a running stack.**
  Explicit-client paths (`pool.connect`, `db.transaction`) bypass the wrapper
  and must use `withRLSContext` — grep before adding one.
- **A2 vault / A3 HMAC**: centralized in `@symbia/crypto` (HKDF-keyed
  AES-256-GCM with versioned ciphertexts + legacy read path; real HMAC with
  `timingSafeEqual`, timestamp now covered). 18/18 harness checks. Identity
  throws at startup in production without `CREDENTIAL_ENCRYPTION_KEY`.
- **B docs**: front-door claims reconciled; README and SECURITY now defer to
  this file explicitly.
- **C**: see items 8 and 9 below (check gate green; Postgres crash mechanism
  removed, survival unmeasured).

The harnesses are committed as regression tests: `npm run test:security`
(38 checks across A1/A4/A2+A3, no running stack required). Run them before
touching auth middleware, code tools, or `@symbia/crypto`.

Open from the analysis: real execution isolation (A1 — env-gated process
`bash` is a floor, not a boundary; build-or-delete still stands), pg-mem dev
mode still has no RLS (loud startup warning added), unauthenticated dev route
surfaces, in-memory state rulings unchanged, and no CI — every "green" above
is a local run.

**A1's real boundary — a direction, PAPER.** `docs/proposals/wasm-runtime.md`
(13 Aug) proposes implementing the declared-but-empty `wasm` ComponentRuntime
and re-expressing the code-tool as a capability-scoped wasm component, so the
isolation is structural (a capability is a wasm import; the grant is
host-mediated and pathguard-scoped) rather than a process gated by env flags.
Not a runtime migration — one enum case, code-tool first, the rest stays TS.
Evidence is two runnable spikes under `experiments/` (add: substrate-
interchangeable; file-reader: capability granted/denied via `@symbia/pathguard`).
Ergonomics past scalars are **unproven** — the proposal registers that as the
first prediction to test (jco probe). PAPER until step 2 of §8 lands.

This file exists because the project outgrew anyone's ability to hold it in
their head. Read this before anything else. If a claim here is wrong, that is a
defect in this file — fix it here first.

**Three states, and nothing gets to be ambiguous:**

- **RUNS** — built, deployed, and observed working. Evidence named.
- **BUILT, UNWIRED** — code exists and compiles; nothing in the platform calls
  it. Speculative until something does.
- **PAPER** — a document. No code.

---

## 1. The platform — RUNS

Twelve services, eleven of them health-checked green. Brought up with
`./start.sh`, or `COMPOSE_FILE="docker-compose.yml:docker-compose.dev.yml"`.
A plain `docker-compose up -d` will start it but **will not publish host
ports**, so the console will not be reachable.

| service | port | state |
|---|---|---|
| identity, logging, catalog, messaging, network, directory, runtime, assistants, integrations, models | 5001–5010 | RUNS |
| control-center (console, proxies `/svc/*`) | 8000 | RUNS |
| service-admin (api) | 9000 | RUNS |
| server | 5000 | registered, nothing behind it, by ruling |

Verified 10 Aug: `symbia_stack_health` → 11/11; today's code confirmed present
inside every running container by grepping a source marker, not by assuming the
image was current.

**Runtime has 16 builtin components**, including `symbia.io.http-request`,
which already declares its output apocryphal. Port lanes
(`canonical` / `apocryphal` / `inherit` / `conditional`) are live in the
component manifest.

## 2. The spyglass — RUNS

`spyglass-agent/` — an Electron overlay that captures real pixels from any
application, outside a browser.

- Stills, video, and audio. One key: tap = still, hold = video, tap-then-hold =
  video+audio, tap-tap = audio only.
- Every capture is chunked, hash-chained, and signed. Each track carries its own
  chain; the close event binds them, so **one track can be withheld while
  proving it belonged to the same capture**.
- Instrument identity `spyglass:instrument:a45045d89b53d8e6`, rotated onto the
  alpha2 genesis, reports `attested`.
- `scripts/verify-clip.mjs` verifies from the files alone. 393 lines, no model,
  no network.

**Known defect:** the four gestures interfere when performed in sequence —
during the 5s still countdown the overlay accepts nothing but cancellation.
Each gesture works in isolation.

## 3. @symbia/crypto — RUNS

Canonical JSON (RFC 8785), SHA-256, ed25519 identity derived from the key,
document signing and verification, and `loadServiceIdentity`.

**Real consumers:** `symbia-http` (so all ten services boot with a persisted
identity), and `spyglass-agent`.

**What it does *not* do yet:** nothing signs anything with the service
identities. They exist and are logged at boot; that is all. Envelope signing is
PAPER (§6).

## 4. @symbia/lineage — RUNS, as of 11 August

**It has a caller.** `sealDelegation` in
`assistants/server/src/engine/provenance.ts` emits every delegation as a GKS
Lineage event: chained per conversation with `advance()`, parent-linked to the
message that caused it, and signed with the assistants service identity.
Measured on a live reply:

```
actor=assistant:coordinator  type=assistant.delegation
checksum=sha256:45b4fdbaea93d…  parent=["7b442e90-…"]  signature=ed25519:jQuTAyYVqW…
```

This also gives the **service identities their first signing use**.
`symbia-http` has loaded one per service since 10 Aug under a comment saying
*"Nothing is signed yet. This exists so that when envelopes start carrying
signatures there is already a durable identity to sign with."* That is now
false in the good direction, for one artifact.

And it closes the canonical-JSON gap for that artifact: `signEvent` goes
through `@symbia/crypto`, so the delegation is RFC 8785 canonical JSON with
ed25519 over the whole event — GKS Lineage §9's missing serialization profile,
actually used. **The reply envelope still uses `JSON.stringify` and a shared
secret; only the delegation is on the good construction.**

Two defects found by giving it a caller, both of which had survived because it
had none:

- **`@symbia/lineage` declared no dependencies at all**, while importing
  `@symbia/crypto`. Nothing had ever tried to consume it, so nothing had ever
  discovered it could not be consumed. Now a peer dependency, plus an explicit
  link in `assistants/Dockerfile` because the base image's `npm ci` cannot
  install what is absent from the committed lockfile.
- The chain heads are **in memory**, so a restart makes a conversation's next
  delegation link to GENESIS again. **This is now the ruling, not a defect**
  (Brian, 11 Aug — in-memory runtime state is fine for now; see
  `docs/proposals/assistant-data-model.md`). What remains open is not
  persistence but *disclosure*: after a restart, a follow-up whose referent is
  gone should say it lost the thread rather than refuse as though the question
  were unclear.

*Historical, kept because the reasoning still applies elsewhere:*

## 4a. @symbia/lineage — the case it was in until today

Chain, `Observation`, the claims vocabulary, attestation levels, and a retrieval
observer that fetches a URL and records TLS, redirects and content digests.
25 tests pass.

**Consumers in the platform: none.** Verified by import search — only its own
tests and scripts reference it. The spyglass does *not* use it; it carries its
own chain code and imports only `@symbia/crypto`.

This was built ahead of a decision that has not been made. It is good code with
no job. Either wire the retrieval observer into one real place, or leave it
parked — but it should not be described as a platform capability until it has a
caller.

## 5. Fixed and verified today

- Network topology renders (render-loop fix holds).
- Chat replies stream back; participant name and colour on every message.
- Provenance receipt says **"unsealed — no hash on this reply"** rather than
  showing a seal it does not have.
- `assistants` refuses to start in production without `NETWORK_HASH_SECRET`,
  as `network` already did. This guard immediately found that the two services
  had been sealing with **different secrets**, contradicting a documented
  promise that their envelopes are mutually checkable.
- Service identity volumes, so a recreated container is not a new identity.

## 5a. Conversation orchestration — RUNS, and is invisible

Added 11 Aug. The coordinator delegates: a message classifies against the live
roster, routes to one specialist via `assistant.route`, the specialist answers,
and the coordinator stays silent. Verified in a browser, not by curl —
`convert 100 kilometers to miles` reaches Converter and is labelled Converter.

`assistant.route`, `handoff.*`, `condition`, `parallel` and `loop` had all been
registered in the handler map and had **never had a caller**. Giving one of them
a caller found five defects in the path, including three that made it
structurally impossible for `condition`, `parallel` or `loop` to produce any
reply at all. Full record: `docs/2026-08-10-orchestration-results.md`.

~~**What it does not do:** nothing records that a delegation happened.~~
**Closed 11 Aug — see §5b.**

## 5b. The three-assistant roster — RUNS

Added 11 Aug, and it is the first part of this platform that demonstrates the
platform's own claim end to end. The catalog went from ten mostly-broken
assistants to **three that work**: Coordinator (`symbia`), Calculator, and
Smart Calculator. Applied by gated catalog write (`scripts/simplify-roster.mjs`),
never by editing bootstrap JSON — see §6.1 for why that distinction is load-bearing.

**Routing is deterministic in three tiers**, cheapest first: an explicit
`@mention`, then declared patterns, then a naive-Bayes intent classifier with an
out-of-domain class; a model is consulted only when all three decline. The
classifier is *reproducible* — the same message routes the same way every time —
which is the point. Reproducible inaccuracies are bugs, and bugs can be fixed.

**Every reply carries a receipt.** Arena (`COMPUTED` / `RETRIEVED` / `COMPOSED` /
`GENERATED` / `REFUSED`), the steps that produced it, and — new today — the
routing decision itself, sealed as a GKS Lineage event chained per conversation
(§4). The shared secret is gone: envelopes are canonical JSON signed with the
service's ed25519 identity and verify from the envelope alone, with no
server-side state.

Standing evidence, re-run after every change: `scripts/verify-assistants.mts`.
Latest — **11/11 predictions held**, P11 (delegation recorded) 7/7, P12 (seal
verifies from the envelope alone) 10/10, P14 (signature verifies with the public
key) 10/10, P13 (OEP enforcement) 11/11.

**Rules gained control flow** (commit `9449ad6`): `onError`, `isDefault`, and
`fallThrough`. `onError` had been declared in five rules since January and read
by nothing — a declarative feature that appears to work and changes nothing is
worse than an absent one, because it hides the need for the mechanism it
represents. The first implementation of `fallThrough` produced **total silence**
on a ceded turn, which is worse than the error it replaced; ceding now means
"let someone better answer", never "let no one answer".

**Twelve platform defects were found by making three assistants work**, most of
them in code that had never had a caller. That ratio is the argument for
behavioural tests over `grep`-based ones (§11).

**Known gaps:** correction handling (`add 15% tip first` does not work — the
sharpest open one), explanations repeat verbatim where declines escalate, and
rule state is in-memory by ruling (persistence is a production prerequisite, not
a defect). Records: `docs/2026-08-11-*.md`, `docs/proposals/assistant-data-model.md`.

## 5c. The models service — RUNS, and content-addressed as of 15 Aug

One day's arc, every stage measured against running code; records in
`docs/2026-08-15-models-stage2-*.md`, `-stage345-results.md`, and
`experiments/model-derivation/` + `experiments/step-weights/`.

- **Weights have identity.** Every local GGUF is sha256'd at scan (cached
  by mtime+size), the digest flows registry → API → catalog card, and a
  card/file mismatch at load is DISCLOSED, not refused (ruling: refusal
  arrives when the pull path guarantees every card a digest). Measured
  with a forced-mismatch card.
- **Acquisition is receipted.** `POST /api/models/pull` — the bytes enter
  through INTEGRATIONS (`/api/integrations/download`: egress + vault;
  ruling 15 Aug restated the 12 Aug delegation shape), models digests
  during the stream and appends a signed `artifact.registered` event to a
  JSONL ledger beside the weights. QUICKSTART's hand-curl is gone. An
  empty directory to a served, receipted model is one authenticated call —
  measured, 5/5 predictions.
- **Derivation is a checkable claim.** `@symbia/lineage` gained the
  artifact vocabulary (`artifact.registered`/`artifact.derived`, claims in
  words, verified-vs-asserted parent links). Ground truth from the spike:
  llama-quantize is byte-deterministic (two runs, one digest), so a
  quantization receipt is recomputable by anyone with parent + recipe.
- **Local inference has served requests.** The §2 BUILT-UNWIRED entry in
  docs/MODELS.md is stale in the good direction: the spike harness and the
  console pull/inference path both exercised the llama engine end to end.
- **The console can see all of it.** A Models panel (registry by digest,
  pull with rendered receipt, mismatch banners), and the assistant editor
  now offers local models — it read integrations `/capabilities` before,
  which made platform-served models structurally invisible.
- **Deploy-gated:** `model` as a catalog type with a `models/<publisher>/`
  key gate, migration script dry-run-verified; the DEPLOYED catalog
  rejects the type by enum (measured), so catalog+models ship together,
  then `migrate-model-cards.mjs --apply`.
- **Step-weights spike finding, for the engine queue:** same-model
  self-consistency FAILED reproducibly-wrong q2k (answered 86 three times,
  unanimously); a cross-substrate panel and a no-model computed check both
  caught it. Escalation ranking: computed verification where checkable,
  substrate panels second, self-consistency as prefilter only. Per-step
  weight pins want stable step ids — the deferred 11 Aug rule question is
  now load-bearing.

## 6. Open defects — ranked

0. **Five defects opened 16 Aug, during gap closure.** Full write-up in
   `docs/2026-08-16-session-close.md`; summarised here so they are findable.

   - **D1 — sealing counts seeded resources as session-authored.**
     `/session/seal` separates sandbox furniture from session work on
     `isBootstrap === false`, and the seed writes that value. A session that
     authored three artifacts sealed nineteen. Entangled with the same day's
     fix making `isBootstrap` server-owned: the flag is now trustworthy and
     uninformative at once. Do not fix by letting clients set it again.
   - **D2 — a repeat import is refused for the wrong reason.** `400 "A
     resource with this key already exists"` is an answer about keys.
     Nothing is keyed on provenance, so re-importing a bundle cannot be
     told apart from a name collision with unrelated content.
   - **D3 — the logging service 500s on its read paths in imagine.**
     `POST /api/logs/query` and `GET /api/logs/streams`, both generic.
     Store-uninitialised versus service fault is not established. The
     consequence is that the sink half of a graph execution is unverified:
     the runtime's report of delivery is its own account of its own work.
   - **D4 — `control-center` and `api` serve no spec.** Reported on every
     `symbia_list_operations` call. Neither may be meant to; decide, then
     either serve one or stop listing them.
   - **D5 — server-owned fields are stripped silently.** A create carrying
     `isBootstrap: true` succeeds with no 400 and no warning.

1. **There is no path from an edited bootstrap file to a running database.**
   *Corrected 11 Aug — the earlier entry described a mechanism that does not
   exist.* `seedFromDataFiles()` merges the snapshot and every bootstrap file
   into an in-memory `Map`, then makes **one** `INSERT` of 38 rows with no
   upsert. The per-file `✓ 0 added, 10 updated` lines are merge counts printed
   before anything touches the database; they are not writes and there is no
   per-file application to be "unapplied". It is all-or-nothing, and it is
   nothing. `markBootstrapCompleted()` sits after the insert that throws, so the
   once-ever flag is never set and the identical failure repeats every boot.

   The live `ast-coordinator` resource is dated `2026-08-09T19:59:12Z`, four
   hours before the commit that edited the file. Editing bootstrap JSON has
   never reached this database. **The working path is a gated catalog write**
   (`scripts/write-coordinator-orchestrate.mjs`), which is what the architecture
   ruling requires anyway.

   Related: `catalog/server/src/seed.ts` (`npm run seed`) is a second
   implementation that loads *only* the snapshot, ignores every
   `*-bootstrap.json`, and calls `db.delete(resources)` first. Running it
   silently reverts the coordinator to the January ruleset.
1a. ~~**Refusals are not sealed.**~~ — **FOUND AND FIXED 12 Aug**, both within
   an hour, because the walk stopped excluding its own failures from its
   denominators.

   A refusal carried `arena: REFUSED` and nothing else — no hash, no steps, no
   signature. A label, not a receipt. `REFUSED` is what OEP prescribes when a
   claim cannot be supported, so **the one reply class that could not be
   verified was the one where the platform declines to make a claim.**

   Hidden because `P12` counted `sealValid !== null` and `P14` counted
   `e.signed`: an unsealed reply drops out of both denominators, so both read
   10/10 while one reply in eleven had no receipt at all. Now 11/11.

   `seal()` gained a `refusal` input because the arena here is *stated*, not
   inferred — `classify()` returns REFUSED only when every step failed, and a
   refusal following three good `service.call`s classifies as something else.
2. ~~**Calc passes raw message text to the evaluator**~~ — **FIXED 11 Aug.**
   `normalizeMathInput` and `stripFiller` in `tool-invoke.ts` handle the
   phrasing; `what is 2+2?`, `whats 15% tip on $47.50` and `split $120 between
   4 people` all compute. Converter was removed from the roster (§5b) rather
   than fixed. **Still open in the same area:** a correction mid-conversation
   (`add 15% tip first`) is not understood.
3. ~~**A routing decision leaves no trace in the provenance envelope**~~ —
   **FIXED 11 Aug** (§5b). Every delegation is a signed GKS Lineage event
   carrying the method (`mention` / `declaration` / `classifier` / `model`),
   and the receipt names the resolved model when one was consulted.
4. **`rule-platform-status` can never match, and now the cause is known.**
   Its pattern uses inline `(?i:…)` groups, which JavaScript does not support.
   `[ConditionEval] INVALID REGEX in condition — this rule can never match`.
   Open as "does not match its own regex" since 7 Aug.
5. **`assistant.route`'s join to the conversation returns 401**, so a specialist
   answers a conversation it is not a participant in. Routing works anyway
   because the SDN forward does not require participation. Consequences for a
   follow-up message are not established.
6. **The first chat message after a page load does not appear.** Reproduced
   twice, 11 Aug. Sent again on the settled page, it works. Not investigated.
7. **Spyglass gesture interference** (§2).
8. ~~**`npm run check` fails with 159 TypeScript errors**~~ — **FIXED 13 Aug
   (commit `7bec31b`): 0 errors across all workspaces, and `npm run build`
   completes end to end.** Root cause of most of it was environmental, not
   code: npm run from app-spawned shells inherits `NODE_ENV=production` and
   silently omits devDependencies, so esbuild/tsx/tailwindcss/@types were
   missing from the tree. If npm ever says "up to date" while node_modules is
   visibly missing packages, check `NODE_ENV` first. Second-largest cause: a
   self-referencing zustand store made its type circular and untyped every
   consumer (~35 errors from one line).
9. **Postgres restart: the crash mechanism is removed, survival not yet
   measured.** The unhandled pool `error` event that killed four services is
   now handled in `@symbia/db` and messaging (13 Aug, `7bec31b`); pg dials
   fresh connections on the next query. A live restart test is still owed —
   handler-added is the observation, "survives" would be an inference.
9a. **`npm run seed` has never completed on this stack**, for two independent
   reasons found 11 Aug while restoring the MCP probe account. `seed.ts` used
   `import * as bcrypt` under `"type": "module"`, so `bcrypt.hash` was not
   callable and **every agent identity silently failed to seed** —
   `routes.ts:6` has always used the default import and always worked. And
   `seedIdentityData` still fails on
   `user_entitlements_user_id_fkey ... Key (user_id)=(650e8400-…-440001) is
   not present in table "users"`: it seeds entitlements for default users
   (ADMIN, MEMBER, VIEWER) that were never created. The bcrypt half is fixed
   and agents now seed; **the entitlements half is open and lives in
   `@symbia/seed`.** Stages are now independent, so one failure no longer
   discards the rest — the same all-or-nothing shape as §6.1.
10. ~~**MCP server cannot authenticate to identity** (401)~~ — **FIXED
    11 Aug, and the cause was not the MCP server.** The account it logs in as,
    `gap-probe@symbia.test`, did not exist. The identity database was
    re-initialised on 9 Aug — `dev@example.com` is stamped `19:59:01` and was
    the only user left — and nothing recreated the probe account, because
    nothing had ever created it: it was made by hand once. Commit `5d94452`
    had separately (and correctly) removed the shipped default password, so
    the two changes together left a configured password with no account to
    match. `symbia_stack_health` kept working throughout because `/health` is
    unauthenticated, which made it read as a broken server rather than a
    missing row. Now seeded in `identity/server/src/seed.ts`, so a reset
    restores it; production must supply `MCP_PROBE_PASSWORD`.
11. **C2:** the console opens with no login screen. **Cause found 11 Aug:**
    `symbia-control-center/src/hooks/useAuth.ts` auto-logs-in as
    `dev@example.com` when `DEBUG` is set. Not a missing login screen — a
    hardcoded one. Still open as a defect; only the mystery is closed.

12. **Lanes are legible but not actionable, and in four places not true.**
    Three measurements, 14 Aug, each with predictions committed before the run.

    - **A graph cannot branch on the lane it received.** `FlowValue` is
      `{value, lane}`; `logic.filter` reads `input.value` only, so a filter
      configured on `lane` emits the same port whether the value arrived
      canonical or apocryphal. The same output port fires in both cases, and
      `conditional` never reaches a value at runtime — it is manifest-only,
      resolved to one of two lanes before anything downstream sees it. The lane
      *is* returned to the caller, so the platform discloses its epistemic state
      outward while withholding it from its own control flow. 6/6 predictions
      held. `docs/2026-08-14-lane-visibility-results.md`.
    - **Stateful operators launder lanes.** `state.set(...)` stores bare values
      at `components-state.ts:74, 128, 182, 247`, and `normaliseEmission` takes
      the single current message — so an aggregate is laned by whichever
      delivery triggered it, not by what it aggregates. A window fed one
      apocryphal and one canonical value emits **canonical**. No error fires and
      no payload records it. 5/5 held.
      `docs/2026-08-14-state-lane-laundering-results.md`.
    - **Four ports declare a lane the implementation cannot honour:**
      `state.latest.snapshot`, `state.window.out`, `state.rollup.out` (all
      `conditional`, all state-carrying), and `source.timer.out`, which declares
      **canonical** while its payload carries `ts: new Date().toISOString()`.
      A wall-clock read is not recomputable by any definition. That last one is
      the worst of the four, because the other three at least signal doubt.
      `docs/2026-08-14-bus-eligibility-results.md`.

    Nothing downstream is wrong *today*, because nothing reads a lane to make a
    decision — which is the first finding. Standing evidence:
    `npm run verify:bus`.

    A response is proposed in `docs/proposals/canonical-bus.md` (PAPER): treat
    the graph as the apocryphal lane by construction and certify deterministic
    work on a separate substrate. It is a fork in the road, not a patch — see
    §7.

13. ~~**`npx tsx` does not run on this machine, so the standing evidence has not
    been runnable.**~~ — **FOUND AND FIXED 14 Aug. Item 8 recurring, and the
    misdiagnosis is the part worth keeping.**

    `tsx` failed, taking out every `.mts` script — including
    `verify-assistants.mts`, described in §5b as "standing evidence, re-run
    after every change" — and **all of `npm run test:security`**. So the suite
    this file tells you to run before touching auth middleware, code tools or
    `@symbia/crypto` had not been runnable.

    esbuild's error blames a platform mismatch (`@esbuild/aix-ppc64` present,
    `darwin-arm64` needed) and volunteers that this happens when node_modules is
    copied between platforms. With `.ec2-last-sync` sitting in the repo root
    that reads as a complete explanation. **It was wrong.** All 26
    `node_modules/@esbuild/*` directories were present and **all were empty** —
    nothing installed for any platform. The shell had `NODE_ENV=production`.
    esbuild found no binary, fell through to the first entry, and reported the
    mismatch it could see from inside its own resolver.

    Fix: `NODE_ENV= npm install`. Suite then passes as written, on `tsx`,
    unchanged — 109 checks, 0 failed (A1 12, A4 8, A2+A3 18, egress 21,
    seed-guard 9, ratchet 2, redaction 20, cred-crypto 19). No transform change
    was needed; an intermediate proposal to move to
    `node --experimental-strip-types` is withdrawn, and would have silently
    halved the suite, since strip-types does not resolve `.js` specifiers onto
    `.ts` sources and four of the eight tests import service code that way.

    **Widen item 8's lesson.** It reads "if npm says *up to date* while
    node_modules is visibly missing packages, check `NODE_ENV` first." The
    symptom this time was a native binary failing to load, not an npm message.
    Before reading any native-module error as a code or platform defect, check
    whether the package directory contains anything at all. A tool's own error
    message is an observation, not a diagnosis.

14. **`activeExecutions` counts cancelled executions as active.** Found 14 Aug
    while clearing measurement probes. Observed, not inferred:
    `GET /api/graphs` reported `loadedGraphs: 0, activeExecutions: 2` while
    `GET /api/executions` showed both of those executions in state `cancelled`,
    with `graphId`s that no longer resolve to a loaded graph.

    Two things here and they should not be conflated. The counter is wrong —
    the figure a console renders overstates what is running. Separately,
    `DELETE /api/graphs/:id` leaves executions behind referencing a graph that
    is gone; whether that is retention-by-design or a leak has not been
    established, and the answer decides whether the counter is the only defect.

    Cleanup helper: `node experiments/cleanup-probes.mjs` (role=`probe` only, by
    construction — a cleanup script that can delete a real graph is a worse
    problem than the mess it tidies).

15. **The catalog could not be asked by key — FOUND AND FIXED 15 Aug, route
    change RUNTIME-VERIFIED 16 Aug.** `storage.getResourceByKey` had no route;
    `/api/resources/:id` routes are id-only; the list route ignored unknown
    filters. model-sync's by-key check therefore always 404ed: its update
    branch had never run (the PUT it would use has no route), and every
    re-sync re-POSTed into the key's unique constraint — February's
    TESTING-REPORT "Model sync: Pass" was true once per model. Fixed: exact
    `key` filter on the list route; model-sync finds-by-key then PATCHes by
    id (works against pre-filter catalogs too, measured: second boot, 4
    updates, 0 failures). **The `?key=` filter is verified against a
    running catalog** — Brian fetched `graphs/hello-world` by exact key
    through the imagine sidecar on 16 Aug and got the resource back. The
    "awaits a deployed rebuild" caveat is discharged for the filter; the
    container image on the docker stack still predates it.
    Same day, same service: weights digests now flow engine → registry →
    API → card, with card/file mismatch disclosed at load (measured via a
    forced-mismatch card). Records: `docs/2026-08-15-models-stage2-*.md`,
    `experiments/model-derivation/DEFECTS.md`.

## 7. PAPER — designs and proposals, none built

Moved to `docs/proposals/`. Nothing here exists in code.

| document | what it proposes |
|---|---|
| `envelope-signatures-proposal` | Replace the shared-secret provenance envelope with signatures. Stage 0 (service identity) is RUNS; stages 1–3 unbuilt. |
| `sole-ingress-and-derivation` | Make the retrieval observer the only path to the web; chain derivations so a receipt reaches what the model actually saw. |
| `BEYOND-THE-PLATFORM` | The libraries outside Symbia, with nginx as the worked example. |
| `POSITIONING` | Positioning paper for @symbia/crypto. Its central framing is flagged unsettled. |
| `appliance-hardware-intent` | Hardware root of trust. Explicitly not costed or prototyped. |
| `canonical-bus` | The graph *is* the apocryphal lane; deterministic work is certified on a separate substrate and returned as a receipted token. Response to §6 item 12. Adds a `computation` claim to the claims vocabulary. Its §10 P2 is measured and held; P1 is measured and **broken**, which is evidence for the import-set mechanism in `wasm-runtime` §4. |

## 8. Findings — recorded, not proposals

Newest first: **`2026-08-16-session-close`** — four gap-closure tracks with
their measurements, and the five defects they opened (D1–D5, §6 item 0).
Probes and their registered predictions are in `experiments/imagine-security/`
(`TRACKS.md`, `TRACK-2.md`) and `experiments/imagine-import/`
(`PREDICTIONS.md`, `RESULTS.md`).

In `docs/`, dated. Start with **`2026-08-10-lanes-claims-and-lineage`** — it is
the conceptual spine: port lanes, the claims vocabulary, attestation levels and
the GKS Lineage grounding, all describing shipped behaviour. Then
`provenance-envelope-shared-secret`, `spyglass-video-lineage`,
`browser-walk-predictions` / `-results`, `how-the-work-was-done`.

## 9. Git

- Working branch `fix/2026-08-06-api-gaps`, **308 commits ahead of `main`**
  (measured 16 Aug: `git rev-list --count main..HEAD`; 276 on 15 Aug, 176 on
  11 Aug — this file does not get to carry guesses.) Every GitHub release (`v1.0.0`–`v1.2.0`, Jan–Feb 2026)
  predates the rebuild.
- `work/2026-08-05-energy-and-honesty-repairs` — **stranded**, 25 commits never
  merged forward.
- Push state is measured at each session close, not here — see the dated
  `docs/2026-08-*-session-close.md` files. The standing risk is unchanged:
  a day's work routinely exists on one laptop until pushed.

## 10. What I would do next

*Rewritten 11 Aug (evening). Items 1 and 3 of the previous list are done (§5b);
`docs/2026-08-11-plan.md` predates all of this and its §1 rests on a diagnosis
§6.1 corrects.*

1. **Correction handling.** `add 15% tip first` is the sharpest open product
   defect: the assistant answers the original question again rather than
   revising it. It is where deterministic routing stops being enough, so it is
   also the honest next test of the lean-deterministic thesis.
2. **Decide what a bootstrap file is for** (§6.1). Either a gated catalog write
   is the only way to change a resource and the JSON files are a first-run seed
   that stops pretending otherwise, or file→DB reconciliation gets built
   deliberately. It is currently neither, and `npm run seed` will silently undo
   a day's work. Unchanged and still the most dangerous entry in this file.
3. **The remaining rule questions**, deferred deliberately on 11 Aug: whether
   first-match-wins should be the only strategy, whether conditions may call a
   tool, whether the *routine* rather than the rule is the right unit, and where
   a step id lives. Recorded in `docs/2026-08-11-rule-configuration-review.md`.
   **Step identity stopped being deferrable on 15 Aug**: per-step weight
   pins (step-weights spike, §5c) attach to step ids, and a pin on a
   step that renumbers is a provenance bug by construction. This is now
   the prerequisite for the per-step-weights engine work.
4. **The assistant pool in the default catalog** — Brian has ideas here and we
   have not had the conversation. **Add to that conversation when it happens: a
   personality strategy for assistants** (flagged 14 Aug, not yet discussed).
   Note that the roster today is deliberately characterless — three assistants
   that work, routing deterministic in three tiers, replies carrying an arena
   and a sealed receipt. Any personality strategy has to sit on top of that
   without turning a reproducible routing decision into a stylistic one, and
   without giving a REFUSED reply a voice that softens it into a maybe.
5. Spyglass gesture interference.
6. One decision that is not the assistant's: `main` is ~140 commits behind
   reality.

Everything else can wait.

## 11. Removed 10 August 2026

Cleanup, all recoverable from git history.

- **`docs/api/`** (18 files) — an aggregated *copy* of the per-service
  `*/docs/openapi.json` and `llms.txt`, written by `build-docs.sh` and read by
  nothing. `validate-docs.sh` and CI read the per-service files directly, which
  was verified before removal by running the validation with the copy gone. The
  aggregation step is deleted from `build-docs.sh` too: a second copy of a
  generated artifact is a second thing to drift.
- **`mcp/`** (3 files) — a hand-kept copy of the MCP server, by its own README.
  `symbia-mcp-server/` is the TypeScript source and the better home. Two
  sources of truth for one server is the forked-concern defect this project
  already names.
- **`symbia-control-center/archive/`** (9 files) — a directory named
  `dead-2026-08-06`, plus an orphaned energy panel.
- **`ops/`** (4 files) — a functional probe script nothing calls, two `.jsonl`
  run-data files of 3 and 2 lines, and one dated probe report superseded by
  later findings. Referenced by nothing; an apparent match in `ci.yml` was
  `softprops/action-gh-release` matching the string `ops/`.

**The rest of the tree is referenced.** Every remaining top-level directory is
either a workspace, built by `docker-compose`, or called by `scripts/`. Two
that look unreferenced and are not: `spyglass-agent` (standalone, and the thing
that works) and `.github` (invoked by GitHub, not by us). `symbia-mcp-server`
stays — `scripts/check-staleness.mts` reads it.

- **15 historical documents** (6,237 lines) — the 6–9 August session archive:
  the control-center rebuild record, trace propagation, catalog review, code
  review week, launch plan, cost model, repo inventory, session close, traffic
  origin, script review, MCP write prerequisites, the EC2 walk, the API
  validation report, and two mirrors of the Cowork project instructions.

  **This was a judgement call, not a script's verdict**, and the attempts to
  make it mechanical failed twice — `grep` matched `softprops/action-gh-release`
  for `ops/`, then missed today's findings because STATUS abbreviates their
  names. Prose does not yield to reference-counting. What was kept: design
  records for things that shipped (`network-bridge-bbmd` → the directory
  service, `spyglass-vision-via-integrations`), the reference docs, and today's
  findings. What went: session narrative superseded by this file.

  All of it is in git history. `git log --diff-filter=D --name-only` finds it.

- **`tests/`** (16 files) and its runner — the ITT suite. Removed after being
  read and run for the first time in months: **388 assertions passed, 303
  failed, and the failures were not defects.** Nearly every assertion is a
  `grep` over source text, so it tested a February architecture by looking for
  strings. Seven services failed a correlation-id check because request-id
  handling was deliberately moved *out* of each service into `symbia-http` —
  the suite penalised the codebase for removing duplication it could not see.

  This is the same failure the rest of today kept producing: an instrument that
  shares the assumptions of what it measures, and calls the code broken when the
  code improves. Third instance today, and the largest.

  The categories — intentions, trust, transparency — are worth rebuilding as
  behavioural tests against a running stack. The browser walk found four real
  defects in an afternoon; this suite found none in six months.

*A "Kept deliberately: `tests/`" paragraph stood here until 11 Aug, directly
contradicting the removal entry four paragraphs above it. It was written before
the decision changed and never updated. `tests/` is removed and recoverable from
git history; the categories are worth rebuilding behaviourally, which is what
`scripts/verify-assistants.mts` now does for the assistants (§5b).*
