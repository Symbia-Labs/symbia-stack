# Stage 2 runtime predictions — registered before measurement

15 Aug 2026. Stages 0–2 of `docs/proposals/models-defect-closure.md` are
committed as code; the build gate, lineage suite (28/28, three new
round-trip checks), and `test:security` (109/0) are green. What has NOT been
observed yet is the models service running the new code. These predictions
gate that measurement, registered in git first, per MAP.

Setup: models service standalone on the dev Mac,
`MODELS_PATH=experiments/model-derivation/data` (the spike's four GGUFs:
parent f16, two byte-identical Q4_K_M, one Q2_K), no catalog running.

- **PB1:** the service scans and lists 4 models, each carrying a `digest`
  field, and the digests match `data/shasums.txt` byte for byte. Note the
  two Q4 files are identical bytes under different names — the registry will
  list them as two models with the SAME digest, which is correct and is the
  content-addressing point.
- **PB2:** `GET /api/models/child-q4km-run1` returns
  `digest: "sha256:eeac84f2…"` equal to the recorded shasum.
- **PB3:** with no catalog reachable, loading a model discloses nothing
  (`digest_mismatch` absent), logs the skipped check, and the load succeeds
  — "could not ask" must not read as either pass or mismatch.
- **PB4:** appending one byte to a copy of the Q2 file and rescanning yields
  a different digest for the copy while the original's digest is unchanged
  (the mtime+size cache does not serve stale hashes for a changed file).

Broken predictions get reported as broken.
