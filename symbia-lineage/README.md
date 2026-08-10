# @symbia/lineage

**Status: BUILT, UNWIRED. No consumers in the platform.**

Verified 10 August 2026 by import search: nothing in `identity`, `logging`,
`catalog`, `messaging`, `network`, `directory`, `runtime`, `assistants`,
`integrations`, `models`, `service-admin` or the control center imports this
package. Its only importers are its own tests and its own scripts.

Notably, **the spyglass does not use it either** — `spyglass-agent` carries its
own chain implementation and imports only `@symbia/crypto`.

This was built ahead of a decision that has not been taken. It is good code
with no job.

## What is in it

- A hash chain: `chain(n) = sha256(chain(n-1) ‖ digest(n))`, over content
  chunked as it arrives, so damage stays local and a stream that dies half-way
  still attests what arrived.
- An `Observation` primitive — `open` → `chunk` → `close({complete})` — where
  completion is stated, never inferred.
- A **claims vocabulary** (`src/claims.ts`), which is the load-bearing part. A
  capture asserts an act of observation; an upload asserts *receipt* and can
  never assert authenticity; a retrieval asserts what an endpoint returned and
  nothing about whether the page is true. Every claim carries what it does
  **not** assert.
- Attestation levels and `substantiate()`, which reports what can be
  substantiated rather than what a record claims about itself.
- A retrieval observer (`src/observers/retrieval.ts`) that fetches a URL and
  records redirects, status, content type, the TLS chain, and chunked content
  digests.

25 tests, written to attack rather than confirm: `npm test`.

## Before this becomes a platform capability

It needs exactly one real caller. The obvious candidate is the retrieval
observer, wired into whatever currently fetches URLs — see
`docs/proposals/sole-ingress-and-derivation.md`, and note the correction in its
§4: the runtime **already** has `symbia.io.http-request`, which already declares
its output apocryphal. So the work is governing an existing component, not
introducing a new one.

Until then this package should not be described as something the platform does.

## Scripts

```
node scripts/verify-observation.mjs <ledger.jsonl> [--content <file>]
node scripts/grab-url.mjs <url> <out-file>
```
