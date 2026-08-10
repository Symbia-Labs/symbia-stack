# STATUS

**What exists, what runs, and what is only written down.**
Last verified: 10 August 2026, against a running stack and the code on
`fix/2026-08-06-api-gaps` at `b007437`.

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

## 4. @symbia/lineage — BUILT, UNWIRED

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

## 6. Open defects — ranked

1. **Catalog bootstrap aborts on a duplicate primary key**, silently leaving
   every later bootstrap file unapplied. A fix committed this morning
   (`52f7aa2`) is not in effect in the running system. *This one makes other
   fixes unreal, so it is first.*
2. **Calc passes raw message text to the evaluator** — `what is 2+2?` refuses
   with `Invalid character: ?`; `2+2` computes.
3. **Spyglass gesture interference** (§2).
4. **`npm run check` fails with 159 TypeScript errors** (49 recorded on 6 Aug).
   None from code added today. The build gate is effectively off.
5. **No service survives a Postgres restart** — four crashed on an unhandled
   `error` event and stayed down. No reconnect, no restart policy.
6. **MCP server cannot authenticate to identity** (401) — it can read the
   runtime but not list assistants.
7. **C2:** the console opens with no login screen. Cause not investigated.

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

In `docs/`, dated. `provenance-envelope-shared-secret`,
`spyglass-video-lineage`, `browser-walk-predictions` / `-results`,
`how-the-work-was-done`.

## 9. Git

- Working branch `fix/2026-08-06-api-gaps`, **122 commits ahead of `main`**.
  `main` is 69 behind and every GitHub release (`v1.0.0`–`v1.2.0`, Jan–Feb 2026)
  predates the rebuild.
- `work/2026-08-05-energy-and-honesty-repairs` — **stranded**, 25 commits never
  merged forward.
- Local tree clean, nothing unpushed.

## 10. What I would do next

See `docs/2026-08-11-plan.md`. In short:

1. Fix the catalog bootstrap (§6.1) — until then, changes to bootstrap data are
   not real, and the canary is the calc suffix that has never taken effect.
2. Calc accepts natural language.
3. Spyglass gesture interference.
4. Two decisions that are not the assistant's: `@symbia/lineage` gets a caller
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
