# 16 Aug — gap closure, and the defects it left open

Four tracks closed. Commits `6d19aca`, `88cab2d`, `bd2730a`, `9cfee6d`.
Every verdict below came from a probe whose predictions were committed
before it ran.

## Closed

| track | what changed | measurement |
|---|---|---|
| 1 | component wiring and the operator state store moved from `runtime/index.ts` into `service.ts`; reconcile at 3s in imagine | a graph authored through MCP hydrates in one pass and executes with an `executionId` |
| 2 | models' spec route moved into `registerRoutes`; integrations declares `/api/integrations/download`; directory has a spec and exports `registerRoutes` | 390 operations across ten services, up from 365 across eight |
| 3 | `isBootstrap` removed from the create and update schemas; stdio buffer raised above the 1 MB tool guard; `respond()` shrinks arrays and stays parseable | T1–T3 hold; an 11 MB call is refused and the session survives |
| 4 | `/session/seal` digests the artifacts into the sealed event; `import-bundle.mjs` verifies before registering | I1–I2, I4–I7 hold; I3 broke, was fixed, now holds |

Verified by hand afterwards through the desktop connector: both service
listings, a graph authored and hydrated at 03:08:35 three seconds after a
23:08:32 write, an ingress POST returning
`executionId d263129c-41d6-4ffa-b1d5-4834166011b6` with `delivered: 1` and
`hops: 2`, and a client-supplied `isBootstrap: true` stored as `false`.

## Open defects

### D1 — sealing counts seeded resources as session-authored

`/session/seal` separates sandbox furniture from session work on
`isBootstrap === false`. The seed writes resources with that value, so the
boundary does not hold. A bundle from a session that authored three
artifacts carried nineteen; on import, sixteen were refused by the target as
key collisions with its own seed.

This is entangled with the Track 3 change. Making `isBootstrap`
server-owned was right — a client could set it and it persisted. But the
server writes `false` for everything, including the seed, so the flag is now
trustworthy and uninformative at the same time. Either seeding sets it, or
sealing needs a different boundary. Do not fix this by letting clients set
the flag again.

### D2 — a repeat import is refused for the wrong reason

Importing the same bundle twice returns
`400 {"error":"A resource with this key already exists"}`. That is an answer
about keys. Nothing in the catalog is keyed on provenance, so re-importing a
bundle cannot be distinguished from a name collision with unrelated content.
Predicted in `experiments/imagine-import/PREDICTIONS.md` as the likely
shape, and it was.

### D3 — the logging service returns 500 on its read paths in imagine

`POST /api/logs/query` → `500 {"error":"Failed to query logs"}`.
`GET /api/logs/streams` → `500 {"error":"Failed to fetch log streams"}`.

Observed twice, tonight, through the connector. Whether this is the
sidecar's store being uninitialised for logging or a fault in the service is
not established — the messages are generic and nothing distinguishes them.

The consequence is specific: the sink half of a graph execution is
unverified. The runtime reports delivery and the output value, but that is
the runtime's account of its own work. The `executionId` stamping added
yesterday has not been independently confirmed since. Logging is the one
mounted service nothing exercised during the gap-closure work.

### D4 — `control-center` and `api` serve no spec

Every `symbia_list_operations` response carries
`unavailable: [control-center 404, api 404]`. Same class as models and
directory were this morning. `control-center` is a UI and `api` may not be a
service at all, so neither is necessarily meant to serve one — but the
dispatcher asks, and an unanswered ask is reported identically to a broken
one. Decide which they are and either serve a spec or stop listing them.

### D5 — a server-owned field is stripped silently

A create carrying `isBootstrap: true` succeeds with no 400 and no warning;
Zod drops the unknown key and the response is the only evidence. Defensible
for a field the server owns outright, and it is a choice rather than an
inevitability. Rejecting with "isBootstrap is server-owned" tells the caller
something; stripping tells them nothing unless they diff the response.

### D6 — sessions shared one ledger file, and sealing did not check its own claim

**Found by Brian running the Track 4 commands from a terminal**, minutes
after this file first said the track was closed. A freshly sealed bundle was
refused at event 0 of 89.

`createSessionLedger` took fixed paths in a shared directory:
`.session/ledger.jsonl` and `.session/session.pub.pem`. Every sidecar
truncated the file on start and then appended to it. The connector keeps a
sidecar running permanently, so a script that starts another is the normal
case. One file held 185 events under **three** session identities, first
appearing at lines 0, 1 and 15, while the public key file held whichever key
wrote last. The bundle therefore carried one key and a trace signed by three.

The seal's claim is "these artifacts and this trace came from one imagine
session". Sharing a file with another session makes that sentence false, and
nothing checked it before writing the bundle.

Two changes:

- Both paths are suffixed with the session key's fingerprint, so sessions
  cannot collide and a stale file from a dead session is inert rather than
  contaminating. Truncate-on-start is now safe because the name belongs to
  one process.
- `/session/seal` walks its own chain before writing and returns 500 with
  the failing event rather than emitting a bundle that fails its own claim.

**The test was also wrong.** `tamper.mjs` printed `I3 HELD` while every case
was refused, including the unaltered control it never ran. A refusal only
means something if the clean bundle is accepted. It now runs the control
first and reports that I3 cannot be measured when the control fails, rather
than passing on a coincidence.

Re-measured after the fix, with the connector's sidecars still running:
control accepted, both tamper cases refused, `I3 HELD`.

**Verified again after a Claude Desktop restart, so the connector's own
sidecars were running the fixed code.** Four measurements, with three
sessions live at once throughout:

- Sealed through the connector's own sidecar (pid 73689): 88 events, 16
  artifacts, chain and artifacts both VERIFIED.
- `tamper.mjs` against that bundle: control accepted, trace alteration
  refused, artifact alteration refused, `I3 HELD`.
- A script-spawned sidecar sealed its own bundle *while the connector's two
  kept running*: 40 events, 19 artifacts, VERIFIED independently.
- Every scoped ledger holds exactly one identity, and it is the one in the
  filename:

  ```
  ledger.2a5d9821da5b5135.jsonl  ->  1  imagine:session:2a5d9821da5b5135
  ledger.2cfd377efb69d102.jsonl  ->  1  imagine:session:2cfd377efb69d102
  ledger.46cb13d551347211.jsonl  ->  1  imagine:session:46cb13d551347211
  ledger.81e2180c16c7c5e0.jsonl  ->  1  imagine:session:81e2180c16c7c5e0
  ledger.9aa86ccbf878953b.jsonl  ->  1  imagine:session:9aa86ccbf878953b
  ```

  Five sessions, five files, no file holding more than one signer. That is
  the invariant the shared file could not hold, stated as something
  checkable rather than as a claim about the fix.

The stale unscoped `ledger.jsonl` is left in place with no writer. It is
the pre-fix artifact and any bundle referencing it is refused.

## Not established

Import against a deployed stack. The Track 4 target was a second sidecar —
same one-origin addressing and catalog routes, but pg-mem with an ephemeral
identity rather than Postgres with a real one. Auth and row-level security
are the parts most likely to behave differently under import, and they are
exactly what this could not see.

## Where the work sits

Branch `fix/2026-08-06-api-gaps`, four commits ahead. Probes live in
`experiments/imagine-security/` (Tracks 1–3, with `TRACKS.md` and
`TRACK-2.md`) and `experiments/imagine-import/` (Track 4, with
`PREDICTIONS.md` and `RESULTS.md`). `experiments/standalone/03-seal-bundle.mjs`
produces a fresh bundle; `tamper.mjs` is the fastest single check that the
seal covers what it claims — it runs an unaltered control first, so a pass
means something.

**Existing bundles sealed before D6 are contaminated** and will be refused.
The old shared ledger is kept at `.session/contaminated-16aug/` as the
evidence for that defect. Re-seal rather than trying to repair one.
