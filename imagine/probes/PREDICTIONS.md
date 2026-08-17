# Imagine sidecar — 50 security predictions

Registered 16 Aug 2026, **before any probe**, per MAP. Subject: the
`Symbia (imagine)` MCP connector — ten services in one process, pg-mem,
ephemeral keys, enforcement deliberately off. Measured through the
connector only (`symbia_call` / `symbia_list_operations` /
`symbia_selftest`), as a client sees it.

## The frame

A sandbox is not judged on hardness. Imagine mode is *designed* permissive:
canon is checked when a bundle is grounded, not here. So the security
question is **not "is it locked down"** — it is:

1. Does it **misrepresent** itself? (a lax thing claiming to be strict)
2. Does laxity **leak outward** — real credentials, real network, real
   files, the host?
3. Are the **guards it does claim** actually present?
4. Does a **refusal say why**, or does it produce confident negatives?

Predictions are written so that HELD means the platform behaved honestly,
not necessarily strictly. Where I expect permissive behaviour I say so; a
permissive result is only a defect when it is undisclosed or escapes the
sandbox.

## A. Authentication and session (S1–S5)

- **S1** Every service route reachable through `symbia_call` requires no
  credential from *me* — the connector holds one internally. Expect HELD:
  the client never supplies auth.
- **S2** The identity the connector uses is a **super-admin**
  (`dev@example.com`), so client-side "permissions" are absent by design.
  HELD = it is super-admin AND something says so.
- **S3** `GET /api/auth/me` through the connector returns a real user
  object with `isSuperAdmin: true`.
- **S4** A request with a deliberately malformed bearer is rejected by the
  service (401/403), i.e. auth is enforced *between* connector and
  services even in imagine mode.
- **S5** The session secret is ephemeral: nothing in any response exposes
  `SESSION_SECRET` or a JWT signing key.

## B. Authorization and capability (S6–S11)

- **S6** `POST /api/resources` succeeds (super-admin), and the response
  carries `mode: imagine` so the write is legible as a sketch.
- **S7** `DELETE` through the dispatcher is refused without
  `confirmDestructive` — the guard I wrote is present at runtime.
- **S8** With `confirmDestructive: true`, DELETE proceeds. (Permissive by
  design; HELD if it works AND the response still says `mode: imagine`.)
- **S9** A resource created with `accessPolicy.visibility: private` is
  still readable by this connector (super-admin bypass). Expect HELD as a
  *disclosed* permissive behaviour.
- **S10** No tool exposes a way to *escalate* — there is no endpoint that
  grants the caller new entitlements without already being admin.
- **S11** `isBootstrap` can be set by a client on create, meaning the
  authored/seeded boundary the seal depends on is **client-controllable**.
  Expect BROKEN (a real defect if true).

## C. Tenancy (S12–S15)

- **S12** pg-mem does not enforce RLS, and the platform says so at boot
  (STATUS records this). HELD = the warning exists in the environment.
- **S13** Creating a resource with an `orgId` I do not belong to is
  accepted (no cross-tenant check in imagine).
- **S14** Reading resources returns rows across orgs without an
  `X-Org-Id` header.
- **S15** Nothing in the connector's responses distinguishes org-scoped
  from global rows, so a client cannot tell which tenant it is touching.

## D. Input validation and injection (S16–S23)

- **S16** A resource `key` containing `../../etc/passwd` is accepted as a
  string (keys are opaque identifiers, not paths).
- **S17** A resource key with a `models/` prefix and non-`model` type is
  REFUSED by the write gate — the prefix⇄type rule I shipped is live here.
- **S18** SQL-ish payloads in `key`/`name` are stored literally, not
  executed (parameterized queries).
- **S19** A 10 MB body is rejected or truncated rather than crashing the
  process (`express.json` limit).
- **S20** Deeply nested JSON (1000 levels) does not crash the sidecar.
- **S21** A `metadata` field containing `__proto__` does not pollute the
  prototype of subsequent responses.
- **S22** Unicode/emoji/NUL in `name` round-trips or is rejected — but
  does not corrupt later reads.
- **S23** `symbia_call` with an unknown `operationId` refuses with a
  message naming how to discover valid ones, rather than a raw 404.

## E. SSRF and egress (S24–S27)

- **S24** An operation that fetches a URL (integrations download, or any
  `io.http-request` config) refuses RFC1918 / loopback targets via
  `@symbia/egress` — the guard exists and is wired.
- **S25** `file://` and other non-HTTP schemes are refused by the same
  guard.
- **S26** A DNS name that resolves to a private address is refused
  (resolution-time check, not just string matching).
- **S27** The refusal names the reason (blocked address / scheme), not a
  generic failure.

## F. Path traversal and host filesystem (S28–S31)

- **S28** No connector tool reads an arbitrary host file. (No `readFile`
  endpoint is exposed through the 365 operations.)
- **S29** `POST /api/models/pull` rejects a `file` argument containing
  `../` — the regex I wrote allows only plain `.gguf` names.
- **S30** A repo path supplied to pull cannot escape `MODELS_PATH`.
- **S31** Any file the sandbox does write (ledger, models, session) lives
  under the experiment directory, not the user's home or the repo root.

## G. Secrets (S32–S36)

- **S32** No response through the connector contains a private key.
- **S33** The session public key IS exposed (by design — it is public and
  verification requires it).
- **S34** Integration credential endpoints do not return stored secrets in
  plaintext through a list/read call.
- **S35** Environment variables are not dumped by any operation
  (`/api/stats`, health, bootstrap-service endpoints).
- **S36** The `.mcp.json` bearer and any real HuggingFace/OpenAI keys are
  NOT present in this sandbox — imagine mode holds no real credential.

## H. Destructive operations (S37–S40)

- **S37** Deleting a *seeded* resource is permitted (no protection for
  bootstrap rows). Expect HELD-as-permissive; a defect only if the seal's
  authored/seeded boundary depends on those rows surviving.
- **S38** There is no exposed operation that drops the database or wipes
  the catalog wholesale.
- **S39** Killing the sidecar destroys everything; a restart returns
  exactly the 38 seeded resources. (Ephemerality is real, not claimed.)
- **S40** No operation can write outside the sandbox's own stores —
  e.g. no endpoint that writes an arbitrary host path.

## I. Error disclosure (S41–S45)

- **S41** A connectivity failure names the endpoint and transport code —
  the fix I made tonight is live in this build.
- **S42** A 500 from a service does not leak a stack trace with absolute
  host paths to the client.
- **S43** A validation failure names the offending field.
- **S44** `symbia_list_operations` reports services whose spec it could
  not fetch, rather than omitting them silently.
- **S45** A refusal is distinguishable from an empty result — "no rows"
  and "could not ask" do not look identical.

## J. Provenance integrity (S46–S50)

- **S46** Every mutation is recorded in the session ledger, including
  refused ones.
- **S47** Ledger entries are signed and chained; altering one breaks the
  chain from that point.
- **S48** The ledger records request/response **digests**, not bodies —
  so a secret sent in a body is not persisted in the trace.
- **S49** The sealed bundle's claim block states what the ephemeral
  signature does NOT assert (authorship, soundness, lane truth).
- **S50** A client CANNOT forge a ledger entry through the API — there is
  no operation that appends to the session trace directly.

## Honest expectations

I expect roughly: S11 broken (client-set `isBootstrap`), S24–S27 partly
unmeasurable through the connector (no exposed fetch operation may exist),
S42 uncertain, and several of C to be HELD-as-permissive. Anything not
reachable through the connector will be reported **not measured**, not
inferred.
