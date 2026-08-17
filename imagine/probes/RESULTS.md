# Imagine sidecar — security MAP results

16 Aug 2026. 50 predictions registered at `7a81c5f` before any probe.
Measured through **symbia-mcp only** — `symbia_call`,
`symbia_list_operations`, `symbia_selftest` — as a client sees it. 38
probes executed; the rest are recorded NOT MEASURED with reasons, not
inferred.

Two runs: the first was **cut short by a defect it found** (S19), so the
payload was reduced and the battery re-run. Both results are kept.

## Scoreboard

| verdict | count | meaning |
|---|---|---|
| HELD | 22 | behaved honestly, and where relevant, strictly |
| HELD-permissive | 4 | permissive **and disclosed** — imagine mode working as designed |
| BROKEN | 4 | S4, S11, S19, S18 |
| REVIEW | 1 | S44 |
| NOT MEASURED | 12 | connector cannot reach them; listed below |

## The four broken

**S4 — an invalid bearer is served 65 KB of catalog.** A direct request
with `Authorization: Bearer not-a-real-token` returned **200** and the
full resource list. Reads require no valid credential: the boundary is
"can reach the port" rather than "holds a token". The seeded rows are
`visibility: public`, so this is defensible by policy — but the policy
was never stated to the client, and a sandbox that will later be told
"same code, grounded" inherits the habit. In imagine mode the blast
radius is one ephemeral loopback port; the finding is that **the read
gate is reachability, and nothing says so**.

**S11 — a client can set `isBootstrap`.** Predicted broken, and it is:
`isBootstrap: true` supplied on create persists. That field is the
**authored/seeded boundary the seal depends on** — the sealed bundle
exports rows where `isBootstrap === false`. So a client can mark its own
artifacts as seeded to keep them out of a bundle, or mark seeded rows as
authored to smuggle them in. The provenance boundary is client-controlled,
which makes it not a boundary. Fix: the write path should set it, never
the caller.

**S19 — an 11 MB body killed the process.** Not refused: accepted, and the
sidecar was gone on the next probe. `express.json({ limit: "10mb" })` is
declared on both the root app and each sub-app, so an 11 MB body should
have produced 413. Instead the whole stack died, taking nine other
services with it — the single-process trade made explicit. At 2 MB the
same write is accepted and the process survives. **The instrument
measuring the platform was destroyed by the platform**, which is the
strongest form this finding could take.

**S18 — could not be evaluated as written, and why is a defect.** The
probe checked "catalog still holds >30 rows after SQL-shaped input" and
got `?` — because the response **exceeded the connector's 25,000-character
limit and was truncated mid-JSON**, so the client could not parse it. The
SQL payload itself was stored literally and harmed nothing (S21/S22 read
fine afterwards). The real finding is the truncation: `respond()` cuts a
JSON string at a byte count and appends a prose note, producing output no
client can parse. A tool that answers with invalid JSON when the answer
is large is unusable exactly when the answer matters.

## Permissive and disclosed (working as designed)

- **S2** the connector runs as `dev@example.com`, super-admin. Stated in
  `symbia_selftest` and in the sidecar's own comments.
- **S9** a `visibility: private` resource is readable — super-admin
  bypass, disclosed.
- **S13** a resource with an org the caller does not belong to is
  accepted. No cross-tenant check in imagine.
- **S14/S12** pg-mem enforces no RLS and **says so at boot**
  (`RLS NOT ENFORCED` in stderr). The warning is the difference between
  permissive and dishonest.

## Held, and worth naming

- **S7** the DELETE guard is real: refused without `confirmDestructive`.
- **S17** the `models/` prefix⇄type gate fires — the rule shipped
  yesterday is live here.
- **S21** no prototype pollution from a `__proto__` payload.
- **S20** 1000-deep nested JSON accepted without crashing.
- **S28/S38/S40** across all 365 operations there is **no arbitrary
  file-read, no drop/wipe, and no arbitrary-path write** exposed.
- **S35/S36** no environment dump, and no real provider key exists in this
  sandbox to leak.
- **S42/S43** errors name the resource and the offending field; no stack
  traces or host paths in the JSON error bodies.
- **S45** "no rows" (`[]`) and "could not ask" (error) are
  distinguishable — the confident-negative discipline holds.
- **S46–S50** the provenance layer is intact end to end: 7 ledger entries
  including **1 refused mutation**, every entry signed and chained,
  bodies stored as digests (the SQL payload and the emoji do **not**
  appear in the trace), the seal produced a bundle with 9 authored
  artifacts, and its claim block states what it does not assert. **No API
  path appends to the session trace** — a client cannot forge history.

## REVIEW

- **S44** — `unavailable` came back empty in this run, where the
  connector reported four services earlier. The spec cache has a 60 s TTL
  and the probe warmed it; not a defect, but the field is only meaningful
  on a cold cache, and nothing says so.

## Not measured (12), with reasons

S8, S10, S15 (needed a second identity or an entitlement-granting
endpoint that does not exist), S24–S27 (**egress/SSRF**: no fetching
operation is reachable — models' `pull` requires the integrations
download route, and `symbia_call` could not address integrations at all
until the absolute-URL bug below was fixed), S30, S31, S32, S33, S37,
S39 (ephemerality is demonstrated elsewhere — a fresh spawn holds exactly
38 seeded resources — but was not probed inside this battery), S41.

**S29 is reported HELD but the evidence is weak**: the traversal-shaped
`file` argument was refused with "No such operation", i.e. the dispatcher
never reached the models service. The regex guard exists in the source
and was measured yesterday; through the connector this run proves only
that the call did not happen.

## Two dispatcher defects found by the battery, fixed the same night

1. **String bodies were double-encoded.** `symbia_call` ran
   `JSON.stringify` over a body a client supplied as a JSON string,
   producing `"{\"key\":…"` and a parse error naming neither cause. Every
   write from this client failed. Now: a string body that looks like JSON
   is parsed first.
2. **Absolute server URLs in a spec were concatenated.** integrations'
   OpenAPI declares `servers[0].url = http://localhost:5007/api/...`, and
   the dispatcher prepended its own base, yielding
   `/svc/integrationshttp://localhost:5007/…` — **all 47 integrations
   operations unreachable**. Now only the URL's path component is used.

Both were found by using the tool as a client rather than as its author.

## What this says about imagine mode

The mode's own claims survive: it is permissive, it says so, the laxity
does not reach real credentials, the host filesystem, or the network, and
the provenance layer records honestly even while enforcement is off.

The two findings that matter beyond the sandbox are **S11** and **S19**.
S11 is a provenance defect — a boundary the seal depends on is
client-controlled — and it does not become safe when grounded; it becomes
worse. S19 is the single-process trade arriving as a fact: one oversized
body ends ten services, which is acceptable in imagine and disqualifying
in deploy, and is the clearest argument yet for keeping containers as the
host for grounded modes.
