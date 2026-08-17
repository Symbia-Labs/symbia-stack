---
name: map-discipline
description: Register predictions before measuring anything, then report broken predictions as broken. Use when the user asks you to test, probe, benchmark, investigate, diagnose, or verify something; when about to run an experiment against the sidecar; or when they mention MAP, predictions, or measuring against a prediction.
---

# Measure against prediction

Write down what you expect **before** you look. Then report what happened, including the parts you got wrong.

## Order

1. **Register predictions first.** Write them into the session catalog through `symbia_call` as a `context` resource. That makes the ordering a position in a signed chain rather than a claim about your own honesty. If the sidecar is unreachable, commit them to git instead and say in the record that a commit proves less than a chain position.
2. **Then measure.** Do not adjust a prediction after seeing a result.
3. **Then record results**, referencing the prediction resource by key.

## Writing predictions that can fail

Each prediction must be capable of coming out false. A prediction compatible with its own negation carries no information.

**Include at least one you expect to be wrong.** A run where everything holds measured nothing — it either confirmed what you already knew or asked questions too loose to fail.

**Never write a compound condition.** A check like `median >= 250 OR worst > 10x median` will report a pass when either clause fires, and the clause that fired may not be the claim you cared about. One prediction, one condition.

**Name the discriminating case.** Ask which single measurement would come out differently if the prediction were false. If no measurement distinguishes the two worlds, the prediction is decorative — say so and find one that does.

## Controls

Run a control before believing a result. A probe that reports success while refusing everything it touched has measured nothing, and reads identically to one that worked.

When a control fails, report `CANNOT BE MEASURED` rather than a verdict. Blank beats green.

## Before trusting any measurement

**Confirm the running code is the code you wrote.** Grep a unique marker from your change in the running bundle. Editing a file and measuring a process started earlier produces confident results about code that does not exist.

**Separate observation from inference, in that order and in separate sentences.** "GET returned 401" is an observation. "The route is gated" is an inference. Report the first before the second, and do not let the second silently replace the first.

## Reporting

Report broken predictions as broken, in the same register as the ones that held. Do not soften, reframe, or bury them.

When your own probe was at fault rather than the system, say so and record it as a probe defect, not a result. That distinction is the whole value of the exercise.
