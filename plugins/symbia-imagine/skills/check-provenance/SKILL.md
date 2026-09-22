---
name: check-provenance
description: Inspect what a Symbia value actually claims about itself — its lane, its receipt, and what it explicitly does not assert. Use when the user asks whether a result can be trusted, where a number came from, whether a value is verifiable, what canonical or apocryphal means, or asks you to recompute or verify something the sidecar produced.
---

# Check provenance

Read a value's own claim about itself rather than vouching for it.

## The two things a value carries

**Lane** — the kind of claim.

- `canonical` — recomputable from the graph and its inputs
- `apocryphal` — cannot be verified by recomputation

Lanes only tighten. An apocryphal input never produces a canonical output.

**Receipt** — the evidence for the lane.

- `recipe` — the operation and its resolved inputs, enough to compute the value again
- `witness` — a digest of bytes as received, and where from
- absent — a port declared canonical without evidence is downgraded to apocryphal, and `laneReason` says so

## What to do

1. Read `lane`, `receipt`, and `laneReason` off the value. Report all three.
2. If `receipt.kind` is `recipe`, **recompute it** and compare against the emitted value. Report both numbers. A recipe that does not reproduce its own value is the finding, not a rounding issue.
3. If `receipt.kind` is `witness`, the digest identifies which bytes arrived. It does not establish that the content is true — a faithful record of a false page is still faithful. Say both halves.
4. If `laneReason` is present, quote it. It states why the runtime assigned a lane the component did not ask for.

## What a receipt does not buy

A recipe makes one narrow computation checkable. It says nothing about whether the right thing was computed, whether the graph answers the question asked, or whether the inputs were the intended ones. Do not let the presence of a receipt stand in for judgement about relevance.

## Reporting

State the observation, then the inference, in that order and in separate sentences. "The recipe recomputes to 48 against an emitted 48" is an observation. "The arithmetic is sound" is an inference. Do not merge them, and do not add a third sentence restating the finding more memorably.

If a value carries no receipt and no `laneReason`, say that plainly. Absence of evidence is not evidence — an unmarked value is unexamined, not verified.
