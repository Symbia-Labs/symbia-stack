# Signed composition — first spike results

**14 August 2026.** Against the running stack, measured after the predictions
were registered in git (`9cab526`, `docs/proposals/signed-composition.md` §6).

## What was built

Component manifests are now signed at publish time by the service that
publishes them. `runtime/server/src/catalog/manifests.ts` signs each manifest
with the runtime's persisted service identity — same construction as the
assistants' `sealDelegation`: `signDocument` over the RFC 8785 canonical
manifest, public key travelling with the signature so the catalog copy
verifies alone. Contract version bumped to **1.4.0**, which made the existing
reconcile pass re-write all sixteen 1.3.0 entries with signatures and no
special case. A missing, stale, or non-verifying signature now counts as
drift, for the same reason `portsEqual` compares lanes.

`scripts/verify-component-manifests.mts` is the §4 component gate run as a
reader — standing evidence in the `verify-assistants.mts` mold. Four checks
per resource: G1 key ⇄ id derivable, G2 every output port declares a valid
lane, G3 signature block present, G4 ed25519 verifies over the stored
manifest from the catalog response alone.

## Measured

- Runtime booted with its persisted identity (`symbia:service:d581b4aeade9f904
  role_claimed=runtime` — no "generated this boot", so the volume key held
  across the image rebuild).
- Marker `manifestSignature` grepped in the running bundle before concluding
  anything (`docker exec … grep -c` → 1).
- `[CatalogSync] component manifests — registered 0, updated 16, unchanged 0,
  failed 0` and no UNSIGNED count.
- Verify script: **16/16 PASS on all four gates**, signer fingerprint matches
  the boot identity, manifest versions present: 1.4.0 only.
- The verifier discriminates: intact manifest verifies `true`; the same
  manifest with one appended space verifies `false`; a swapped `key` verifies
  `false`. G4 is not vacuously green.

## Predictions

**P1 — BROKEN.** Registered: "at least one of the 16 builtin manifests fails
the §4 component gate on first retrofit attempt." None did. The manifests
were cleaner than predicted because the 1.3.0 lane work (10 Aug) had already
forced every output port through a typed lane declaration, and the
key ⇄ id relationship was mechanical from the start.

The *spirit* of P1 — a first sweep finds defects — was met, but every defect
was in the path to the measurement, not in the manifests, and P1 as written
does not get credit for them:

1. **`symbia-http/package-lock.json` was stale** (10 Aug, no `@symbia/redact`
   entry after the 13–14 Aug redact wiring touched `package.json`). Its
   `npm ci` in the base image had been failing on lockfile sync — silently.
   Regenerating the lockfile required `--workspaces=false`; run from inside
   the package directory, npm walks up to the workspace root, reports
   "up to date", and writes nothing — the same "up to date while visibly
   wrong" behaviour STATUS §8 documents for `NODE_ENV`.
2. **`docker/Dockerfile.base` step 18 backgrounds fifteen `npm ci` jobs and
   ends with bare `wait`**, which does not propagate their exit codes. A
   failed install (this session saw an E404 for `@symbia/crypto` from the
   public registry in one job, and the symbia-http sync failure in another)
   produces a base image that reports success with partial `node_modules`.
   The failure then surfaces one image downstream as unresolvable imports in
   whichever service rebuilds next. **Open: `wait` must collect and propagate
   per-job status.** This is the same shape as §6.1's all-or-nothing seed —
   a multi-part operation whose parts cannot fail individually out loud.
3. **Host `tsx` carries a wrong-platform esbuild binary** (`@esbuild/aix-ppc64`
   on darwin-arm64), so `npx tsx` cannot run any `.mts` script from the repo
   root. Worked around with plain `node` (v25 type-stripping). Open; likely
   another artifact of app-spawned-shell npm runs.

P2 (`graphs/calc-evaluate` parity), P3 (first-experience script end to end),
P4 (something inexpressible found) — **not yet measured**; they are the next
spikes, not casualties of this one.

## Where the changes live

A concurrent session's checkpoint (`8fd3ff8 snapshot: checkpoint before
credential-crypto (L1-L3) work`) swept the four changed files into itself
before this session's intended commits could land: `manifests.ts`, `sync.ts`,
`verify-component-manifests.mts`, and the regenerated
`symbia-http/package-lock.json` are all inside that snapshot rather than
under their own messages. Recorded here instead of rewritten there — two
sessions were working the same tree, and history surgery under an active
session is how work gets stranded.

Incidental: git records `manifests.ts` as binary in that diff, and grep
agrees — the file contains at least one byte that is not valid UTF-8, and
did before this session touched it. Harmless to tsc, worth a cleanup.

## Standing

Re-run any time: `node scripts/verify-component-manifests.mts` (exit 0 iff
every component resource passes all four gates). The follow-up this script
exists to motivate: move G1–G4 into the catalog's write path so they REJECT
at write time instead of reporting after — that is the difference between a
verifier and a gate, and the spec fails the day the gate grows a bypass.
