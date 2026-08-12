# OEP enforcement in the product — first results

**11 August 2026.** Until today nothing in this platform enforced an Open
Epistemic Protocol rule. OEP is Layer 0 in the GKS stack — *what may be
claimed* — and GKS `alignment-oep.md` §2 states that GKS *"never weakens or
bypasses OEP rules"*. The arenas in `provenance.ts` are an adjacent taxonomy
that overlaps by accident, not a claim-class implementation.

## The reference validator is a stub

`open-epistemic-protocol/validator/` was the obvious thing to wire in. It does
nothing:

```python
class AwarenessDetector:
    def detect(self, text: str) -> bool:
        return False

class ClaimClassifier:
    def classify(self, text: str) -> ClaimClass:
        return None
```

Adopting it would have adopted a function that always says fine, which is
worse than nothing — a green tick over an unexamined claim. **"Wire in the
validator" was not a task; it was a task that would have looked complete.**

What the spec does have is seven executable assertions in `tests/*.yaml`. Those
are the artifact with content, so those are what were taken.

## What was built

- `assistants/server/src/engine/oep.ts` — enforcement rules §1 (fabricated
  access), §2 (hypothesis labeling), §3 (provenance). Lexical, conservative,
  and `unknown` is not a pass: a check that could not decide has cleared
  nothing.
- The three fixtures vendored (Apache 2.0) into `oep-fixtures/`, so
  conformance runs without a sibling checkout being present.
- `scripts/check-oep-conformance.mts` — the spec's fixtures against this
  implementation. **7 passed, 0 failed.**
- The walk now imports `checkReply` rather than restating the rules, and
  reports P13 on every real reply.

## P13 — and why 10/10 is not the headline

```
P13  OEP enforcement rules hold  10/10 replies
```

**The strictest rule never fired.** Arena distribution across the walk:

| arena | replies |
|---|---|
| `COMPUTED` | 5 |
| `COMPOSED` | 4 |
| `REFUSED` | 1 |
| **`GENERATED`** | **0** |

The prediction was that OEP would fail immediately, because `GENERATED` maps to
Hypothetical Inference at best and enforcement §2 requires labelling plus at
least two alternatives, and no reply carries them. That prediction could not be
tested: **this roster produces no `GENERATED` replies at all.**

That is a real result and it should be said the right way round. It is not
"OEP compliance demonstrated" — it is that every reply here is either computed
by a deterministic tool, composed over material that was supplied to it, or
refused. Nothing stands on nothing. `provenance.ts` says `GENERATED` *"exists
because that is what most replies currently are"*. **For these three
assistants, that is no longer true.**

The rule is implemented, proven to catch violations against the spec's own
fixtures, and waiting for the first reply that stands on the model alone.

## What this does not cover

- **Claim classes are not implemented.** OEP defines five; this implements
  three enforcement rules. Classifying a claim into exactly one class is
  separate work and is not started.
- **Enforcement §4 (architecture boundary) and §5 (no narrative patching) are
  not implemented as checks.** §5 is satisfied structurally for delegation by
  the sealed record, which is a different thing from being enforced.
- **Only assistants is covered.** OEP applies to any service producing
  user-facing claims. `oep.ts` sits inside assistants and should move to a
  shared library when a second producer appears — recorded in the file as a
  deferral, because three forked `authMiddleware` implementations in this
  codebase came from exactly this decision going unwritten.
- **The checks are lexical.** They catch stated violations, not implied ones. A
  model that fabricates access in wording the cue list does not contain passes.

## Next

1. A `GENERATED` reply to test §2 against — currently unreachable through these
   three assistants, which is the point but leaves the rule unexercised.
2. Claim-class classification, which is the half of OEP not yet touched.
3. Move `oep.ts` to a shared library at the second producer, not the third.
