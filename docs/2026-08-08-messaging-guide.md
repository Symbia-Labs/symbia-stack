# Messaging guide — Symbia Stack relaunch

*8 August 2026. Derived from `docs/2026-08-08-launch-plan.md` §2 and §5. Written
to the same standard as the engineering docs: observations labelled, inferences
labelled separately, every proof point anchored to a file that can be opened.*

**Status: draft. Not settled positioning.** The launch plan §14 lists five
decisions still owed by Brian, and decision 1 — provenance thesis over the
five-problem framing — is the one this entire guide is downstream of. Until
that is confirmed, this document is a proposal, not a standard.

**No human-time estimates appear here.** Nothing in this guide is scheduled.

---

## 0. How to use this document

This is the reference a piece of copy gets checked against before it ships. It
is not a source of facts about the platform — `docs/PROJECT-INSTRUCTIONS.md` is
that, and where the two disagree, the project instructions win and this file is
a defect.

Every proof point below carries a **file anchor**. If the anchor moves, is
deleted, or stops saying what the proof point claims, the proof point is dead
and the copy that used it comes down. §7 is the decay register for exactly this.

---

## 1. The thesis, in one sentence

> **An answer without a receipt is a rumour. Symbia is infrastructure that
> refuses to produce one.**

The differentiator, for use where a competitor is in the room:

> Everyone else audits the answer. Symbia is the substrate that could not have
> produced an unattributed one.

**Honest asterisk, which ships with it.** That second sentence is a design
claim. It is only true to the degree the runtime enforces it, and the launch
plan gates it behind Gate A for that reason. Do not ship the differentiator as
a statement of accomplished fact until Gate A is measured closed.

### What replaced what

**Observation.** The live site and `SYMBIA_WEB_CONTENT_INSTRUCTIONS.md` (January
2026) lead with *"The Backend for AI-Native Applications,"* *"AI is a principal,
not an API call,"* and five problems — identity, orchestration, communication,
observability, coordination.

**The change.** One problem replaces five. The five do not disappear; they stop
being five reasons and become one argument:

| old framing | new role |
|---|---|
| Identity | why a receipt can name who asked |
| Contracts / orchestration | why capability cannot enter unrecorded |
| Communication / SDN | why an edge can be observed rather than asserted |
| Observability | why the receipt survives the hop |
| Coordination | substrate, not headline |

Orchestration is demoted to substrate. It is the answer to *"why does this need
to be a platform rather than a library?"* — never the opening line.

---

## 2. The four arenas — and the fifth, which must be named

**This is the single most abusable part of the message.** Get it wrong and the
campaign ships the exact defect it is about.

**Observation.** `assistants/server/src/engine/provenance.ts:41` declares five
arenas: `'COMPUTED' | 'RETRIEVED' | 'COMPOSED' | 'GENERATED' | 'REFUSED'`.

The four the platform *claims*, per the comment block at lines 25–40:

1. **COMPUTED** — a deterministic function produced it. Reproducible. No model.
2. **RETRIEVED** — returned verbatim from a named source. Quotable.
3. **COMPOSED** — a model wrote it over material that was supplied to it.
4. **REFUSED** — the system declined, and said why.

**GENERATED is the fifth, and it is deliberately not one of the four.** The
source comment states why, and it is the most quotable thing in the codebase:

> *"a model answering from its own weights, with nothing supplied and nothing
> checked. It exists because that is what most replies currently are, and hiding
> that behind one of the other four would be the exact dishonesty this file is
> for."*

**Rule for all copy: never present the four without GENERATED.** "There are
exactly four honest ways to answer" is true and shippable *only* when followed
by "and a fifth that is what most replies actually are, which we label rather
than hide." Four alone reads as an exhaustive taxonomy the platform meets today.
It is not, by the code's own admission.

That admission is an asset. It is §6-grade material — a competitor cannot copy
it, because copying it means publishing the same thing about themselves.

---

## 3. Supporting messages, each with its proof point

Copy may make these four claims. It may not make a fifth without adding it here
with an anchor first.

### 3.1 There are four honest ways to answer, and one of them is "I can't"

**Anchor.** `assistants/server/src/engine/provenance.ts` — `classify()` at
line 106 derives the arena from what actually happened rather than from what the
caller declared. Four `service.call` steps plus one `llm.invoke` yields
`COMPOSED` (line 143), with a basis naming all four sources and stating outright
that whether the model represented them faithfully was **not checked**.

**Renders as.** `Composed · 5` with an expander, in the console.

**Not checked.** Whether that chip has been seen in a browser. Gate C. No
screenshot of it may be produced or described until it has.

### 3.2 Blank beats green

"Not checked" is a legitimate answer and it never gets rounded up to "fine."

**Anchor.** `scripts/check-staleness.mts` returns three results, not two.
UNCHECKED is never folded into CLEAN. An all-UNCHECKED run exits 0 and says so
in words.

**Why it carries weight.** This is working discipline 6 implemented as code
rather than asserted as a value. Copy should show the mechanism, not the virtue.

### 3.3 Capability cannot enter without a recorded gate

**Anchor.** Sixteen builtin components publish manifests to the catalog on
runtime boot (`runtime/server/src/catalog/manifests.ts`). Under
`RUNTIME_MANIFEST_ENFORCEMENT=strict` a graph referencing an unregistered
component refuses to load. `POST /api/ingress/:graphName` checks the declared
capability, because authentication alone would let any logged-in caller push
into any graph.

**The worked example.** When the spyglass panel needed a vision model, the
answer was `POST /api/integrations/execute` with a credential resolved from
identity — not a HuggingFace call from the browser. See
`docs/2026-08-07-spyglass-vision-via-integrations.md`.

### 3.4 The platform is held to its own standard, in public, and it fails

**Anchor.** `energy/API-MEASUREMENTS.md`. An entire application was stood up
inside Symbia with zero registrations, zero gates and zero ledger entries, and
that is written down as a platform defect rather than shipped as a demo.

**This is the strongest of the four.** Lead with it when the audience is
skeptical, which is always.

---

## 4. The F21 story, and a correction owed to the launch plan

The essay in Beat 3 is *"We shipped a component that turned a missing input into
zero and called it canonical."* The messaging guide has to be precise about
tense, because the tense is the whole ethical question.

**Observation, 8 Aug.** `runtime/server/src/executor/components.ts` — the
`symbia.compute.arithmetic` handler now returns `lane: 'apocryphal'` on a
missing input (`expression refused: inputs absent`, line ~356), on non-arithmetic
characters, and on a non-finite result (`expression refused: result is not
finite`). The source carries a comment block headed **"INFINITY IS NOT A
MEASUREMENT"** recording that division by zero previously returned `Infinity` on
the canonical lane with `exact: true`, and that `JSON.stringify` rendered it as
a `null` a downstream reader could not distinguish from an absent field.

**Observation.** `docs/2026-08-08-launch-plan.md` §8 Gate A describes F21 in the
present tense — "substitutes `0` for a missing input and stamps
`lane: canonical`" — and gates the entire campaign on closing it.

**Inference, disputable, and the reason this needs a human.** The launch plan's
Gate A text may be stale with respect to the working tree. **Not checked:**
whether `runtime/dist` carries the guard (`grep "not finite"
runtime/dist/server/src/executor/components.js` returned 0 on 8 Aug), whether
the running runtime is the code just read (working discipline 4), and whether
M1 — "fixing F21 breaks at least one existing test or fixture" — has been
measured. Source refusing and system refusing are two different claims.

**Consequence for copy.** The essay does not become "the fix." §11 names this as
the most likely failure: *the temptation after fixing a defect is to launch on
the fixed version and omit the six months it was live.* The essay is about the
defect. If a build and a browser confirm the guard holds, that is one paragraph
at the end, not the subject.

---

## 5. Language rules

### Banned outright

revolutionary · game-changing · seamless · enterprise-grade · unlock ·
leverage · cutting-edge · "trust layer"

Also banned: **any number that has not been measured**, and **any adjective
standing in for one**. "Fast," "robust," "comprehensive" and "production-ready"
are numbers wearing a disguise.

### Required in every piece

**At least one thing the platform does not do.**
`SYMBIA_WEB_CONTENT_INSTRUCTIONS.md` §14 already carries seven. That section is
an asset and gets a section of its own on the site, not a footnote.

### The observation/inference rule, applied to copy

Working discipline 7 is a copy rule here, not only an engineering one.

| write this (observation) | not this (inference) |
|---|---|
| "Ranked #3 on HN for four hours" | "The essay resonated" |
| "Returned 404" | "The endpoint is missing" |
| "18 observed edges vs 3 declared" | "The topology is accurate" |
| "68 typecheck errors, all in `@symbia/control-center`" | "The build is broken" |

A sentence that collapses the two is `b8bef8e` in a new costume — the shipped UI
copy where *"dropped was an inference, and the wrong one."*

### Held material — not campaign assets

- LinkedIn message analysis and the health timeline: **flagged, on hold.**
- `corpus-turns.db` (5,516 turns): review pass required before any publication.
- Chapter 18 is Brian's decision, not to be assumed.
- **Patents are not a campaign asset.** Verbatim: *"I am very much not
  interested in patents. I have them already."* The 25-year industrial record is
  usable; the patent count is not the proof point.
- `.mcp.json` is never pasted into docs, issues, chat, or campaign copy. Its
  presence in public history is L1 — a finding, not a licence.

### Voice

Brian's, per the `me` skill. Plain-spoken, wry, allergic to hype,
self-deprecating where it earns credibility. Short punchy openers. First person.
Concrete over abstract. **Ends on a principled line, not a CTA.**

The through-line that already exists and should be used: a decade arguing the
boring plumbing between machines and databases is the most interesting problem
in tech — and the irony, which he is comfortable naming, of an evangelist
spending his next act on epistemic humility for machines.

### Type

**Base type ≥16px on every public surface this project ships.** Standing
constraint, not a preference.

---

## 6. Per-surface application

| surface | opening move | the "does not do" it carries | anchor |
|---|---|---|---|
| `README.md` | Provenance thesis, first screen. Four arenas + GENERATED. | Status section naming the open findings and linking them. A known, named, linked failure is credible; a silent one is not. | §9 of the launch plan |
| `PROVENANCE.md` (does not yet exist) | The four arenas, the canonical/apocryphal/conditional lane. One runnable example producing a receipt, one producing a refusal. **The refusal matters more.** | The refusal example *is* the honest limitation. | L-anchor: `provenance.ts` |
| `symbia-labs.com` hero | One problem replacing five. Keep the architecture diagram and quick start — both accurate. | §14 gets a section, not a footnote. | L4 |
| `symbia-labs.com/reports/` | Dated review documents, redaction pass applied. Framed as standing practice. | The reviews are the limitation, stated at volume. | §6, F27 + D3 redaction |
| `SECURITY.md` / `CONTRIBUTING.md` | Nothing rhetorical. A real address. | — | L3 |
| Essay (Brian's byline) | F21 told straight — what it did, how it was found, why the fix is small and the lesson is not. | The entire piece. | §4 above |
| HN / lobste.rs | Submit the essay, never the repo. A repo submission asks for a star; a post about your own defect asks for an argument. | — | §7 of the launch plan |
| Industrial cut | The number that was wrong because a meter was missing, not because a model hallucinated. | Same. | §4 of the launch plan |

---

## 7. Proof-point decay register

Each row is a claim this guide licenses, and the check that says whether it is
still true. Reviewed on the daily pass. **Blank is a legitimate state; do not
round an unchecked row up to holding.**

| # | claim | anchor | check | state, 8 Aug |
|---|---|---|---|---|
| P-1 | Five arenas exist; four are claimed, GENERATED is named | `assistants/server/src/engine/provenance.ts:41` | Union type still has five members; comment block still names GENERATED as excluded | **Holds** |
| P-2 | `classify()` derives arena from steps, not declaration | same, line 106 | Function present; COMPOSED branch still names sources and states faithfulness unchecked | **Holds** |
| P-3 | Staleness check returns three results | `scripts/check-staleness.mts` | File present; UNCHECKED not folded into CLEAN | **Not re-read since the launch plan** |
| P-4 | Sixteen builtin components publish manifests on boot | `runtime/server/src/catalog/manifests.ts` | Count is still sixteen | **Not counted** |
| P-5 | `energy/API-MEASUREMENTS.md` records the platform failing its own standard | that file | Present, still adversarial about the platform | **Present; not re-read** |
| P-6 | Arithmetic refuses rather than substituting zero | `runtime/server/src/executor/components.ts` | Source refuses on missing input and non-finite result | **Source holds; `dist` does not carry the guard; running system not checked** |
| P-7 | Provenance chip renders `Composed · 5` with an expander | console UI | Seen in a browser | **Not checked — Gate C** |
| P-8 | 18 observed edges vs 3 declared | `docs/2026-08-08-trace-propagation.md` | Numbers still as recorded; re-measured or explicitly not | **Not re-measured** |

---

## 8. Copy that cannot ship yet, and what blocks it

| copy | blocked by |
|---|---|
| The differentiator as accomplished fact ("could not have produced an unattributed one") | Gate A |
| Any screenshot, GIF, or description of the console | Gate C — nothing has been opened in a browser |
| Any reach, traffic, or star number | §10 — **no baseline of any kind exists** |
| "Security issues go to a real human" | L3 — `SECURITY.md:18` and `CONTRIBUTING.md:202` both still read `hello@example.com` |
| "A contributor's first five minutes are clean" | L5/L6 — `DEVELOPER.md` lines 32, 122 and 407 still teach the 5173 Vite dev server; `ops/functional-probe.mjs` lines 52 and 54 still probe it. **Broader than L5 states — three locations, not one section.** |
| "The typecheck passes" | L7 — either fixed, or declared in the README with a link |
| "Actively maintained, one line of work" | L8 — `work/2026-08-05-energy-and-honesty-repairs`, 25 commits, still not an ancestor of HEAD |

---

## 9. Not checked

Listed so no reader infers a pass from absence.

- Whether Brian has confirmed the provenance thesis (§14 decision 1). Everything
  here is downstream of a decision not yet made.
- Whether `runtime/dist` or any running runtime carries the F21 guard.
- Whether M1 (fixing F21 breaks a test or fixture) has been measured.
- Whether P-3, P-4, P-5 and P-8 still hold; they were carried forward from the
  launch plan, not re-verified for this guide.
- Whether `symbia-labs.com/reports/` and `/docs/` have content, and what it says.
- Whether the January `SYMBIA_WEB_CONTENT_INSTRUCTIONS.md` still generates the
  live site, or the site has diverged from it.
- Whether any of the four named competitors is positioned where §2.3 of the
  launch plan says. Read from search results, not from their products.
- Everything in Gate C.

---

*The point of this document is that a sentence in a headline and a line in a
source file are the same kind of claim, and only one of them has ever been
checked. Until that changes, the guide is a list of things not to say yet.*
