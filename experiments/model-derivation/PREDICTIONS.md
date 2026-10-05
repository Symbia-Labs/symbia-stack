# model-derivation spike — predictions

Registered 2026-08-15, before any quantization or inference run. Per MAP:
these are written first; broken ones get reported as broken.

Setup: Qwen2.5-0.5B-Instruct GGUF f16 as the parent artifact; llama.cpp at a
pinned release tag, CPU-only build, in the cowork sandbox (3 GB RAM, 4 cores).
Children: Q4_K_M (derived twice, identical recipe) and Q2_K (derived once).
Harness: 6 fixed arithmetic/multi-step problems with known integer answers;
parent runs greedy; each child runs greedy + 3 sampled runs (temp 0.7, fixed
distinct seeds). Signing via `@symbia/crypto` (canonical JSON, ed25519).

- **P1 (determinism):** `llama-quantize` f16 → Q4_K_M, run twice with the same
  binary and arguments, produces byte-identical output: same sha256.
- **P2 (Q4 holds):** Q4_K_M greedy scores within 1 correct answer of the f16
  parent on the 6 problems.
- **P3 (Q2 breaks):** Q2_K greedy scores at least 2 fewer correct than Q4_K_M,
  or produces visibly malformed reasoning (non-numeric final answers, loops).
- **P4 (variance is the signal):** across the 3 sampled runs, Q2_K disagrees
  with itself (distinct final answers) on more problems than Q4_K_M does.
- **P5 (receipt verifies alone):** each derivation record (parent digest,
  recipe, child digest, signature) verifies with the public key from the
  record file alone — no server, no state.
- **P6 (re-derivation):** re-running the quantize step from the parent and the
  recorded recipe reproduces the recorded child digest exactly.

Failure modes expected if the literature transfers down to 0.5B: Q2 errors
should skew to execution (wrong arithmetic mid-chain) rather than concept
(wrong plan), and instability should show before outright wrongness.
A 0.5B model is weak at math at any precision, so P2 may break simply because
the parent itself scores low — that would be a finding about the harness
floor, not about quantization, and gets reported as such.
