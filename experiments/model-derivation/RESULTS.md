# model-derivation spike — results

Run 15 Aug 2026 on the development Mac (Apple silicon, brew llama.cpp,
node-llama-cpp 3.15.1 from the repo workspace, `@symbia/crypto` and
`@symbia/lineage` from workspace dists). Predictions were registered in
`PREDICTIONS.md` before any run.

## Prediction outcomes: 4 held, 2 broken

**P1 (determinism) — HELD.** `llama-quantize` f16 → Q4_K_M run twice with the
same binary and arguments produced byte-identical files. Both runs:
`sha256:eeac84f264d9a9a3…`. The derivation is a pure function of parent +
recipe.

**P2 (Q4 holds) — HELD.** Q4_K_M greedy scored 5/6 against the parent's 6/6.
The one miss is an execution error, not a method error: on 17×23 it multiplied
17×3=51 and 17×2=34 correctly, then added 51+34=85 — the tens partial was
never shifted. The plan was right; a step was executed wrong. This is the
failure shape the literature predicts for quantization damage.

**P3 (Q2 breaks) — BROKEN.** Q2_K greedy scored 5/6, equal to Q4_K_M, not two
or more worse. The cliff did not appear. Two candidate explanations, not
distinguished by this run: six easy problems is far below the sample size at
which the published degradation (AIME, LiveCodeBench, hundreds of items) is
measurable; and llama.cpp's Q2_K keeps output/embedding tensors at higher
precision, which shelters a 0.5B model where those tensors are a large
fraction of the weights. Distinguishing them needs a harder, larger problem
set.

**P4 (variance signal) — BROKEN as registered.** Both children disagreed with
themselves on 3 of 6 problems across the 3 sampled runs; the registered
metric (Q2 count > Q4 count) did not hold. The *content* of the disagreements
differs in the predicted direction — Q2's wrong answers are numeric mutations
of the right one (391 → 401, 431; 14 → 8, 12), execution noise — but the
registered metric was the count, the count says broken, and part of the Q4
disagreement count is parser artifact rather than model behaviour. A cleaner
metric (disagreement over marker-parsed answers only, larger n) is future
work, not a rescue of this one.

**P5 (receipt verifies alone) — HELD.** All three signed events verify from
`chain/events.jsonl` + the public PEM alone: 7/7 checks (3 signatures, chain
recomputation, 3 file digests). No server, no state, no private key.

**P6 (re-derivation) — HELD.** `04-verify.mjs --rederive` re-ran the recorded
recipe against the parent and reproduced the recorded child digest exactly.

## The artifacts

| artifact | sha256 (prefix) | size |
|---|---|---|
| parent f16 (Qwen2.5-0.5B-Instruct) | `8e0ae260…` | 1266 MB |
| child Q4_K_M (runs 1 and 2, identical) | `eeac84f2…` | 491 MB |
| child Q2_K | `ab283692…` | 415 MB |

Chain: `model.artifact.registered` → 2 × `model.artifact.derived`, each
carrying parent digest, child digest, recipe (tool, version, args), and for
Q4 the reproduction digest. Signed ed25519 by
`spike:model-derivation:190a6f5a…`, chained with `advance()` from GENESIS.

## Instrument errors, disclosed

The first harness run scored the f16 parent 0/6. The model was fine; the
harness capped output at 300 tokens (the model's verbose LaTeX chains never
reached the ANSWER line) and the parser accepted only the requested marker,
which a 0.5B model does not reliably emit. A second artifact followed: the
last-number fallback scored "…\boxed{160} miles in 4 hours." as 4. Two parser
revisions (token budget 600; tiers marker → answer-is → boxed → last-number,
tier recorded per run) produced the numbers above. An instrument that assumes
the subject follows instructions measures compliance, not capability.

## What this run did not establish

The Q2 cliff (P3) and the variance-count signal (P4) at this scale. Whether
Q2_K degradation appears on harder multi-step problems. Anything about models
larger than 0.5B. The signed-derivation mechanism is independent of all of
these and is the part that held without qualification.

## Reproduce

```
bash 01-derive.sh        # download parent, derive children, P1 check
node 02-sign-chain.mjs   # digests + signed lineage events
node 03-harness.mjs      # ~4 min: 54 inference runs
node 04-verify.mjs --rederive
```
