# STATUS

**What exists, what runs, and what is only written down.**
Last verified: 11 August 2026, against a running stack and the code on
`fix/2026-08-06-api-gaps` at `ea87e6d`.

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
  delegation link to GENESIS again. Honest, but not continuity. Persisting them
  is not built.

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

**What it does not do:** nothing in the transcript or the provenance envelope
records that a delegation happened, who decided, or why. A model chooses which
assistant answers, and that choice is absent from the chain while every step
after it is sealed. This is the platform's own claim failing at the point it
matters, and it is the top of §10.

## 6. Open defects — ranked

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
2. **Calc passes raw message text to the evaluator** — `what is 2+2?` refuses
   with `Invalid character: ?`; `2+2` computes. Converter has the same defect,
   found 11 Aug: `convert 100 kilometers to miles` refuses with
   `Invalid format. Use "10 km to miles"`.
3. **A routing decision leaves no trace in the provenance envelope** (§5a).
   The model that chooses the specialist is the least recorded step in the
   chain, and every step after it is sealed.
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
8. **`npm run check` fails with 159 TypeScript errors** (49 recorded on 6 Aug).
   The assistants service alone accounts for 19, unchanged by this session's
   work. The build gate is effectively off.
9. **No service survives a Postgres restart** — four crashed on an unhandled
   `error` event and stayed down. No reconnect, no restart policy.
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

## 7. PAPER — designs and proposals, none built

Moved to `docs/proposals/`. Nothing here exists in code.

| document | what it proposes |
|---|---|
| `envelope-signatures-proposal` | Replace the shared-secret provenance envelope with signatures. Stage 0 (service identity) is RUNS; stages 1–3 unbuilt. |
| `sole-ingress-and-derivation` | Make the retrieval observer the only path to the web; chain derivations so a receipt reaches what the model actually saw. |
| `BEYOND-THE-PLATFORM` | The libraries outside Symbia, with nginx as the worked example. |
| `POSITIONING` | Positioning paper for @symbia/crypto. Its central framing is flagged unsettled. |
| `appliance-hardware-intent` | Hardware root of trust. Explicitly not costed or prototyped. |

## 8. Findings — recorded, not proposals

In `docs/`, dated. Start with **`2026-08-10-lanes-claims-and-lineage`** — it is
the conceptual spine: port lanes, the claims vocabulary, attestation levels and
the GKS Lineage grounding, all describing shipped behaviour. Then
`provenance-envelope-shared-secret`, `spyglass-video-lineage`,
`browser-walk-predictions` / `-results`, `how-the-work-was-done`.

## 9. Git

- Working branch `fix/2026-08-06-api-gaps`, **122 commits ahead of `main`**.
  `main` is 69 behind and every GitHub release (`v1.0.0`–`v1.2.0`, Jan–Feb 2026)
  predates the rebuild.
- `work/2026-08-05-energy-and-honesty-repairs` — **stranded**, 25 commits never
  merged forward.
- Local tree clean, nothing unpushed.

## 10. What I would do next

*Rewritten late on 10 Aug after the orchestration session. `docs/2026-08-11-plan.md`
was written before it and its §1 rests on a diagnosis §6.1 now corrects.*

1. **Put the routing decision in the provenance envelope** (§6.3). The envelope
   already carries `steps`; a classification is a step. Right now the platform
   seals what the specialist computed and says nothing about who chose the
   specialist, which is sealing the wrong half.
2. **Decide what a bootstrap file is for** (§6.1). Either a gated catalog write
   is the only way to change a resource and the JSON files are a first-run seed
   that stops pretending otherwise, or file→DB reconciliation gets built
   deliberately. It is currently neither, and `npm run seed` will silently undo
   a day's work.
3. **Assistants accept natural language at their boundary.** Calc and Converter
   both hand raw message text to a strict parser. Delegation makes this worse,
   not better: routing now works, so the user reaches a specialist and *then*
   gets refused on phrasing.
4. Spyglass gesture interference.
5. Two decisions that are not the assistant's: `@symbia/lineage` gets a caller
   or gets parked, and `main` is 122 commits behind reality.

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

**Kept deliberately:** `tests/` — the ITT suite (intentions, transparency,
trust, RLS isolation, secret handling). It is **not** in `workspaces`, so
nothing runs it, and it has not been touched since 1 February. Kept because a
trust-and-transparency suite is worth wiring into CI rather than discarding.
Until it runs, it proves nothing, and this file should not imply otherwise.
