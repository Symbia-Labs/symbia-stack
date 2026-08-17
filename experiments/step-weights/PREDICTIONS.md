# step-weights spike — predictions

Registered 15 Aug 2026, before any run. Per MAP: broken ones get reported
as broken.

Setup: a three-step routine (`routine.json`) executed by a spike runner
against the RUNNING models service (localhost:5098, serving the
model-derivation artifacts). Each step resolves its weights differently:

- `route` — no model at all (regex tier). In the receipt as COMPUTED.
- `think` — CONSTRAINT-RESOLVED against the live registry
  (`source: local`, capability chat, deterministic pick: lexicographically
  first candidate id), sampled 3× at temperature 1.2, with an
  `onDisagreement` escalation to a digest-pinned fallback (the f16 parent).
- `say` — DIGEST-PINNED to `sha256:eeac84f2…` (the Q4_K_M artifact),
  greedy, formats the final answer.

Steps carry EXPLICIT string ids in routine.json — the step-identity gap
(2026-08-11 rule review) is sidestepped by construction here, and that
choice is itself the demonstration of what the platform needs.

Problem for `think`: a $80 item discounted 15%, then 8% tax → 73.44.

- **PS1 (pin resolves by content):** the `say` step's digest pin resolves
  against the registry, and — because run1 and run2 are byte-identical —
  matches TWO registry ids. The runner uses the first and the receipt
  records the ambiguity. The digest recorded in the receipt equals the
  registry's digest for the chosen id.
- **PS2 (constraints resolve via the broker's data):** the `think` step's
  constraint query returns the local models from the live registry and
  picks `child-q2k` (lexicographically first). The receipt records every
  candidate considered, not just the winner.
- **PS3 (the receipt verifies and names bytes):** every step event's
  signature verifies from the chain file + sidecar public key alone; the
  chain recomputes; each model-consulting step names id AND digest, and
  those digests match the registry's.
- **PS4a (disagreement fires):** three q2k samples at temperature 1.2 on
  the two-operation percent problem produce at least two distinct parsed
  answers, so escalation fires.
- **PS4b (the escalation target answers):** the f16 parent, greedy,
  parses to 73.44.

Known limitation registered up front: the models service chat API has no
`seed` parameter, so the three samples are not individually reproducible —
disagreement is measurable, its exact instance is not replayable. That is
a platform deficiency, not a spike choice.

## Addendum — registered after the first run, before the second

The first run broke PS4a in the sharpest way: q2k answered **86
unanimously** (tax applied, discount skipped) at temperature 1.2, so
same-model self-consistency never fired and a wrong answer flowed to the
formatter. Self-consistency is not correctness; a model can be reproducibly
wrong. Two counter-designs, registered before measuring either:

- **PS5 (cross-substrate disagreement):** one greedy sample each from
  q2k, q4km, and f16 on the same problem produces at least two distinct
  parsed answers — heterogeneity of weights surfaces the error that
  homogeneous sampling hid.
- **PS6 (deterministic verification beats both):** the problem is
  arithmetic, so a COMPUTED check (evaluate 80 × 0.85 × 1.08) is possible
  with no model at all; the check flags every wrong sampled answer and
  passes 73.44. Where a step's claim is checkable, checking is strictly
  stronger than any consensus — this is the canonical-bus thesis at step
  scale.
