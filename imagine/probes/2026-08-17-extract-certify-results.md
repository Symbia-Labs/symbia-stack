# extract-text + canon.certify — results against 13352b6

- **E1 HELD** — extract-text (strip-v1) emitted identical output sha256
  across two executions; the recipe carries inputSha256 = the same digest
  yesterday's http-request witness recorded for the same file. Two components,
  two days, one content address.
- **E2 HELD in substance** — output tightened to apocryphal over an
  apocryphal fetch, recipe receipt intact through the collect hop. Minor new
  defect: `laneReason` does not survive re-emission through passthrough
  nodes — the tightening stays, its explanation is dropped (normaliseEmission
  only attaches laneReason at the hop that changed the lane).
- **E3 HELD (expected-wrong aimed at a seam, and the seam delivered twice)** —
  (1) `./artifacts` is cwd-relative: on this dev host it landed in imagine/;
  on a plugin host, cwd is the conversation's outputs directory. Needs an
  explicit base path from the sidecar. (2) The upload route 500'd AFTER
  saving bytes: `require('crypto')` inline is a dynamic CJS require inside an
  ESM bundle. The artifact existed; the checksum computation crashed — the
  second witness died giving testimony. Fixed (top-level import), remeasured.
- **E4 HELD** — raw `text/html` upload refused by the MIME allowlist
  ("File type text/html is not allowed"); certify's text/plain mapping passes
  and the manifest records the original type.
- **E5 HELD** — the second witness agrees: component-side sha256 equals the
  catalog's independently computed checksum on both items
  (`secondWitness: true`), certify emits canonical with a recipe of the item
  digests.

Also fixed en route, found by the grep-a-marker rule: **the bundler had been
dying silently since the imagine/ promotion** — `../../$svc` paths pointed
one level above the repository, esbuild's crash text matched no error grep,
and every "successful" package since 5559a19 shipped stale service bundles
while sidecar files copied fresh. The script now checks entries exist and
exits non-zero on failure. Yesterday's artifact worked only because its
service-bundle changes had been hand-patched before the promotion.
