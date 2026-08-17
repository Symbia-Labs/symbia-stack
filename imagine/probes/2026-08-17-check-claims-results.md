# symbia.canon.check-claims — results against 3c11692

- **K1 HELD** — two executions, identical verdict digest
  `24ddba974668336b664e…`. Extended beyond the prediction: a THIRD run on a
  freshly spawned host (different pid, different port, cold store) produced
  the same digest. The contract as written — "same canon digests, same claim
  register, same verdict, on anyone's machine" — is measured across process
  boundaries, not just across calls.
- **K2 HELD** — the four control vectors run at registration and the result
  is published in the component manifest, readable without running anything:
  `controlStatus: "passing", controlVectors: 4`. A stranger can ask the
  catalog whether the checker can see red. If the control fails the component
  still registers and refuses every invocation naming the failure — absent
  would be quieter and worse.
- **K3 BROKEN — expected-wrong, wrong (fourth consecutive)** — the artifact
  retrieval seam did not break. `GET /resources/{id}/artifacts` then
  `/artifacts/{id}/download` worked first try through the bundle with
  X-Service-Auth, no path or auth failure.
- **K4 HELD, and stronger than predicted** — canon loaded from catalog
  artifacts produced a verdict digest **byte-identical** to the same claims
  checked against inline canon. Delivery path is not part of the verdict:
  digests in, verdict out. That is the composability claim demonstrated
  rather than asserted.

Verdicts on the five-claim register (2 honest, 3 planted) reproduced the
manual spike checker exactly, including the discrimination the spike's
control was built to test: a real quote pointed at the wrong source is
reported as *misattribution rather than invention*.

## The expected-wrong pattern, refined again

Four consecutive expected-wrongs have held (I5 boot time, R3 log flush, Q1
local inference, K3 artifact retrieval). The earlier lesson — "aim them at
lifecycle seams" — was already the refinement, and K3 WAS aimed at a seam.
The sharper reading: deliberately designed paths in this codebase are more
robust than I predict, and every real failure so far came from **integration
glue nobody designed**: bundler paths that outlived a directory rename, a
guard that greps prose instead of exit codes, cwd-relative storage, a CJS
require inside an ESM bundle. Aim expected-wrongs at the joins between
things, not at the things.

Found and fixed while reviewing the packaging on the same pass: the release
script's step-1 guard still swallowed bundler failure. `01-bundle-routes.sh`
was fixed on 17 Aug to exit non-zero and print "BUNDLE FAILED", but the
caller grepped its output for "error|✘" — which "BUNDLE FAILED" does not
match — and discarded the exit code with `|| true`. Reproduced in isolation
before rewriting: the caller printed "packaging proceeds with stale bundles".
The morning's fix had been defeated one level up all day.
