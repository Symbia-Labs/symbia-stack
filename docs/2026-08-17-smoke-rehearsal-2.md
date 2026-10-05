# Install smoke test — rehearsal #2 results (isolated build, 2026-08-17)

Artifact: `symbia-imagine-0.1.0.plugin` sha256 `fde3505c…` (owned-host build `c3c9803`).
Isolation verified both ways before checks began: host was a **child of its shim** on **ephemeral port 58476**, latencies 7–10ms (storm-era host: 1.5–5.7s).

| # | Check | Verdict | Evidence |
|---|---|---|---|
| 1 ✱ | selftest | **PASS** | mode imagine, loopback 200, port 58476. No version stamp in selftest output (gate 6 still open) |
| 2 ✱ | stack health | **PASS** | 5/12 healthy incl. runtime+messaging (= dual-path fix present); absentees are the known no-health-route services |
| 3 ✱ | operations | **PASS** | **390 total**, unavailable only control-center + api. No timeouts |
| 4 ✱ | catalog write | **PASS / KNOWN-ISSUE** | 201, id `f77afcf5…`; read-back still drops `content` (defect persists) |
| 5 ✱ | canonical compute | **PASS** | 21→42, exact, `canonical`, recipe receipt with inputs |
| 6 ✱ | demotion control | **PASS** | `apocryphal`, coverage 0.5, missing ["b"]. Two lanes across 5+6 — probe sees color |
| 7 | local model | **RECORDED** | Registry **empty** on fresh install (not even the catalog card); completion → **500** "Model not found" (should be 404; card seeding + receipted pull are the E workstream) |
| 8 ✱ | assistant loop | **PASS** | Actor + rules authored; ping→pong in 3ms with ed25519 envelope, arena RETRIEVED, basis |
| 9 ✱ | unknown-action guard | **PASS — the build's reason for existing** | `llm.complete` failed AND the chain broke: no empty message, no false seal. Yesterday's signed lie is unreproducible on this artifact |
| 10 | llm.invoke gate | **PASS + new finding** | Old gate error gone. New blocker: `"No auth token available in execution context"` — rules/execute doesn't plumb a token to LLM actions |
| 11 | service.call models | **PASS, better than predicted** | Reached models (200); reply envelope carried the step: `source: "models GET /models"`, outputDigest |
| 12 ✱ | seal + ordering | **CANNOT BE MEASURED** | Host died mid-test (ECONNREFUSED); its ledger file is gone — a plugin dir re-sync at 11:54:23 unlinked the running host's files. Ordering claim unverifiable without the ledger |

**Verdict: NOT a release pass** — check 12 is blocking, and it failed for reasons worth more than a pass:

1. **No way to seal an owned host from outside the pair — by design.** The private token (attachment hardening) locks out every third process, including the tester. The smoke doc's curl method is only valid for shared dev hosts. Fix: the connector needs a `symbia_seal` tool (and the imagine-session skill should use it). Until then check 12 is unrunnable on production-shaped installs.
2. **Plugin re-sync during a live session unlinks the host's working files.** The ephemeral doctrine makes losing the *stack* acceptable; losing the *unsealed record* silently is the part to fix — one more argument for seal-on-takedown, and for the host treating ledger-append failure as an immediate reason to close what it can.
3. Host death cause unproven (re-sync kill vs. crash on unlinked ledger); host stderr wasn't captured in any log found. Owned hosts should tee their stderr to a file the shim names.

**New defects filed:** llm.invoke token plumbing in rules/execute · 500-not-404 on missing model · model card not seeded on fresh install · no symbia_seal tool · host stderr not persisted.

**What this rehearsal proved regardless:** the isolated build is the shipped build (child process, ephemeral port, fixed unknown-action guard measured working), 390 operations on a snappy host, and checks 1–11 took under four minutes end to end.
