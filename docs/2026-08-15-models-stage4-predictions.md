# Stage 3+4 runtime predictions — registered before measurement

15 Aug 2026, late. Stage 3 (artifact vocabulary in `@symbia/lineage`,
33/33 suite, spike re-emits with zero local shapes, 7/7) and stage 4
(`POST /api/models/pull`) are code-complete and unbooted. Setup: models
service on `PORT=5098`, `MODELS_PATH=/tmp/models-fresh` (empty), identity
and catalog reachable through the existing tunnel.

Auth caveat, stated up front: the pull requires a bearer. The plan is the
Authorization value from `.mcp.json` (never printed, per standing rule). If
identity rejects it, PC2–PC5 are measured later with a real login and PC1
still stands.

- **PC1:** unauthenticated `POST /api/models/pull` returns 401 — the one
  write on this service that reaches the network is not open.
- **PC2:** an authorized pull of `Qwen/Qwen2.5-0.5B-Instruct-GGUF` /
  `qwen2.5-0.5b-instruct-q4_k_m.gguf` into the empty path returns 201 with
  a digest, and an independent `shasum -a 256` of the file equals it.
- **PC3:** `MODELS_PATH/.lineage.jsonl` holds exactly one
  `artifact.registered` event whose signature verifies with the sidecar
  public key and whose payload digest equals PC2's.
- **PC4:** `scripts/verify-models.mts` passes against the fresh path —
  digests present and true, ledger verifies, card carries no live state and
  agrees on the digest.
- **PC5:** repeating the same pull returns 200 `alreadyPresent` with the
  same digest and appends nothing to the ledger.

Broken predictions get reported as broken.
