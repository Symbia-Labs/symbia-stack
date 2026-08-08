# Launch plan — Symbia Stack, public release

*8 August 2026. A marketing plan, written to the same standard as the
engineering docs: observations labelled, inferences labelled separately,
predictions registered before measuring, and "not checked" left as "not
checked".*

**No human-time estimates appear in this document.** Sequencing is by gate and
dependency. A beat starts when the beat before it is measured done, not on a
date.

---

## 0. The finding that reframes the brief

**Observation.** `github.com/Symbia-Labs/symbia-stack` returns
`repository_public: true`. `origin/main`, `origin/fix/2026-08-06-api-gaps` and
`origin/archive/2026-02-deploy-infrastructure` are all published.

**Observation.** `symbia-labs.com` is live, carries a banner reading
*"Now Open Source — The Symbia Stack is available on GitHub →"*, and links to
that repository.

**So this is not a launch. It is a relaunch.** The repo went public, the
website went up, and nobody was told. Every asset that exists describes the
platform as of January 2026.

That changes the objective. The job is not "go public" — that already happened,
quietly and with the wrong story attached. The job is to **claim ground the
project is already standing on, with the positioning it has actually earned
since**, and to correct a public record that currently misdescribes it.

It also means every hygiene defect in §3 is not a pre-launch blocker. It is a
live public exposure with a date on it.

---

## 1. Campaign overview

**Name.** *Show your work.*

**One sentence.** Reintroduce Symbia Stack under the positioning it actually
earned — a platform where an answer arrives with a receipt, a source, a
scorecard, or a refusal — and prove the claim by publishing the record of the
platform failing its own standard.

**Primary objective.** Consideration, not conversion. Move Symbia from
*unknown open-source repo* to *the reference implementation people cite when
they argue about grounded AI infrastructure.*

Primary KPI: **50 unsolicited technical inbound contacts** — issues, discussion
posts, forks with commits, direct mail from named engineers — in the window
between first publication and the second-beat retrospective. Fifty is chosen
because it is roughly the point at which a repo starts receiving arguments
rather than stars, and arguments are the thing this project runs on.

**Secondary objectives.**

- Replace the January positioning everywhere it is publicly readable.
- Establish "registered predictions, published breakage" as a recognizable
  Symbia signature, not a quirk.
- Recruit adversarial readers. The project's own working discipline says every
  instrument measures itself until something outside it objects. Marketing's
  real deliverable here is **objectors**.

**Explicitly not an objective.** Signups, waitlist, hosted product interest,
enterprise pipeline. There is no hosted product, and `SYMBIA_WEB_CONTENT_INSTRUCTIONS.md`
§14 already says so honestly. Generating demand for a thing that does not exist
would be the exact defect this platform is against.

---

## 2. Positioning: the thing that has to change

### 2.1 What is publicly claimed today

From the live site and `SYMBIA_WEB_CONTENT_INSTRUCTIONS.md` (dated January
2026):

> "The Backend for AI-Native Applications." "AI is a principal, not an API
> call." Five problems: identity, orchestration, communication, observability,
> coordination.

That framing is coherent, well-written, and **puts Symbia in the most crowded
category in the industry.** Orchestration platforms, agent frameworks and
LLM gateways are a field of dozens. "AI as a principal" is a real idea, but it
reads as a feature of an orchestration platform, and the page then has to carry
five problems because no single one of them is the reason to care.

### 2.2 What the project actually became

From the project's own instructions, seven months later:

> Symbia is a platform for **provable provenance**: every answer shows where it
> came from — computed with a receipt, retrieved verbatim from a source,
> composed over cited material with a claim-by-claim scorecard, or honestly
> refused.

That is one problem, not five. It is the one that everything else in the
architecture exists to serve, and it is the one that has been under active
construction since: provenance envelopes on assistant replies, the canonical /
apocryphal / conditional lane in component manifests, `symbia.state.rollup`
refusing to let a partial total pass as a total, trace propagation so the
topology graph draws observed edges instead of declared ones.

**Recommendation: lead with provenance. Demote orchestration to substrate.**

The five problems do not disappear — they become the answer to "why does this
need to be a platform rather than a library?" Identity is why a receipt can
name who asked. Contracts are why capability cannot enter unrecorded. The SDN
is why an edge can be observed rather than asserted. They stop being five
reasons and become one argument.

### 2.3 Market context

**Observation.** Gartner placed digital provenance in its top ten strategic
technology trends for 2026, in the security and digital-trust cluster.

**Observation.** The receipt idea has other claimants already: VeriTrace
(signed, tamper-evident receipts per AI decision, open source), TUS OS (a
deterministic decision kernel emitting replayable receipts), NABAOS
(classifies each claim in an LLM response by epistemic source), and Cisco's
open-source model-provenance toolkit (shared training origin between two
models).

**Inference, disputable.** This is good news, not bad. A category with four
independent claimants and a Gartner listing is a category that exists; a
category with one claimant is a hobby. Symbia does not need to invent the word
"receipt" — it needs to own a specific position inside it.

**The position available.** Every one of those four verifies *after the fact* —
they inspect an output, a log, or a model and tell you what they can establish
about it. Symbia is the only one where the provenance lane is **stamped at
computation time by the runtime that did the computing**, and where a
capability that has not been through a gate cannot execute at all.

The one-line differentiator:

> Everyone else audits the answer. Symbia is the substrate that could not have
> produced an unattributed one.

**And the honest asterisk, which must ship with it.** As of this document that
sentence is a design claim with a measured counter-example inside the codebase
(§3, F21). Shipping the sentence before the counter-example is closed would be
marketing a property with no mechanism to enforce it — which is, verbatim, the
defect `energy/API-MEASUREMENTS.md` was opened to record. See §5, Gate A.

---

## 3. What is publicly readable right now, and wrong

These are not launch blockers in the ordinary sense. The repo is public. They
are **live public exposures**, ordered by what they cost.

| # | exposure | status |
|---|---|---|
| L1 | `.mcp.json` is tracked and published in `origin/main`, containing a real Bearer JWT and an org id. Project instructions call this file secret. | **Measured.** The JWT `exp` decodes to **2026-02-08**, six months expired, and its `url` is `http://localhost:5007`. So the blast radius is an expired dev token pointing at a loopback address — *not* a live-credential incident. It does publish a name and an email in the token claims, and it is a real credential in public history. Rotate the signing key, scrub, gitignore. **Not checked:** whether the key that signed it is still in use. |
| L2 | Provider-key scan of full history: `sk-proj-`, `sk-ant-`, `hf_`, `AKIA`, `ghp_`, `xoxb-`. | **Measured. Clean.** Every hit is a placeholder, a doc example, or the redaction regex in the secret-handling test itself. One JWT-shaped string in all of history — L1's. |
| L3 | `SECURITY.md` directs vulnerability reports to **`hello@example.com`**. `CONTRIBUTING.md` line 202 does the same. | A public repo with a security policy that routes disclosures to a placeholder domain. Highest-embarrassment, lowest-effort item on this list. The site footer already publishes `hello@symbia-labs.com`. |
| L4 | The website describes the January platform: five problems, "AI is a principal", a `recall` step defined as *"fetch data"*, "21 action handlers". | Per the catalog review F15, `recall` names two opposite operations and that collision is a recorded defect; per F17 the routine projection covers 3 of 10 step types. The marketing page teaches the version of the vocabulary the engineering review has already flagged as wrong. |
| L5 | `DEVELOPER.md` §8 instructs cross-origin rules in terms of Vite and `window.location.port === '5173'`. Vite is deleted. | The section describing the fix now describes the defect. First thing a contributor reads. |
| L6 | `ops/functional-probe.mjs` probes `localhost:5173`, labelled `control-center (vite dev)`. | A probe that can only ever fail. A public repo shipping one teaches readers to ignore probes. |
| L7 | `npm run check` fails with **68 errors**, all in `@symbia/control-center`. | A public repo whose typecheck does not pass is a contributor's first impression. esbuild does not typecheck, so it builds and runs anyway — which is worse, not better. |
| L8 | `work/2026-08-05-energy-and-honesty-repairs` — 25 commits, not an ancestor of HEAD, and pushed. | A public repo with a visibly stranded branch invites the question "is this maintained?" Merge it or archive it under `archive/` with the other one. |

---

## 4. Audience

### Primary — the skeptical infrastructure engineer

> A backend or platform engineer who has already shipped something with an LLM
> in it, watched it assert something false with total confidence, and concluded
> the problem is architectural rather than a prompt problem. They are
> evaluating whether "grounded" and "cited" mean anything mechanical or are
> just words. They read source before docs, and they trust a project that
> publishes its own failures more than one that publishes benchmarks.

Where they are: Hacker News, lobste.rs, r/LocalLLaMA and r/MachineLearning,
the Anthropic and OpenAI developer communities, Rust/Go/TypeScript infra
Discords, and — critically for this project — **industrial and OT communities
where a wrong number has a physical consequence.**

Buying stage: problem-aware, solution-skeptical. They do not need to be
convinced the problem exists. They need to be convinced a mechanism exists.

**What converts them:** a diff. Not a demo.

### Secondary — the industrial / regulated-domain practitioner

> An engineer or architect in energy, manufacturing, building automation, or
> another domain where a confidently wrong number is not an embarrassment but
> an incident. They are being told to put AI in the loop and have no way to
> answer "how do you know?"

This is Brian's native audience — twenty-five years across building
automation, BI, and industrial IoT, and a decade arguing that the plumbing
between machines and databases is the interesting problem. **This audience
already exists and can be reached directly.** It is also the audience for whom
`symbia.compute.unit` (§5.1 of the catalog review) and the power-vs-energy
error class are not abstractions.

**Deliberately not addressed in this campaign:** buyers, executives, analysts.
There is nothing to sell them.

---

## 5. Messaging

### Core message

> **An answer without a receipt is a rumour.** Symbia is infrastructure that
> refuses to produce one.

### Supporting messages, each with its proof point

**1. There are exactly four honest ways to answer, and a fourth is "I can't."**
Computed with a receipt. Retrieved verbatim from a named source. Composed over
cited material with a claim-by-claim scorecard. Or refused, with the reason.
*Proof:* `classify()` produces the arena from what actually happened —
four `service.call` steps plus one `llm.invoke` yields COMPOSED, with a basis
naming all four sources and stating outright that whether the model represented
them faithfully was not checked. The provenance chip renders in the console as
`Composed · 5` with an expander.

**2. Blank beats green.** "Not checked" is a legitimate answer and it never
gets rounded up to "fine."
*Proof:* `scripts/check-staleness.mts` returns three results, not two, and
UNCHECKED is never folded into CLEAN. An all-UNCHECKED run exits 0 and says so
in words.

**3. Capability cannot enter without a recorded gate.**
*Proof:* Sixteen builtin components publish manifests to the catalog on runtime
boot. Under `RUNTIME_MANIFEST_ENFORCEMENT=strict` a graph referencing an
unregistered component refuses to load. When the spyglass panel needed a vision
model, the answer was a credential resolved from identity through the
integrations gateway — not a call from the browser.

**4. The platform is held to its own standard, in public, and it fails.**
*Proof:* `energy/API-MEASUREMENTS.md`. An entire application was stood up
inside Symbia with zero registrations, zero gates and zero ledger entries, and
that is written down as a platform defect rather than shipped as a demo.

### Message hierarchy

1. *Why care* — your AI infrastructure cannot currently tell you the
   difference between "computed from data" and "produced fluently."
2. *What it is* — a platform where the runtime stamps the lane, and the answer
   carries its receipt.
3. *Why this one* — everyone else audits the output. This one is the substrate.
4. *What to do* — clone it, run it, and come argue about the findings.

### Voice

Brian's, per the profile: plain-spoken, wry, allergic to hype, self-deprecating
where it earns credibility. Concrete over abstract. Short openers. Ends on a
principled line, not a CTA.

**Banned from all campaign copy:** revolutionary, game-changing, seamless,
enterprise-grade, unlock, leverage, cutting-edge, "trust layer." Also banned:
any number that has not been measured, and any adjective standing in for one.

**Required in all campaign copy:** at least one thing the platform does not do.
`SYMBIA_WEB_CONTENT_INSTRUCTIONS.md` §14 already has seven; that section is an
asset, not a disclaimer.

---

## 6. The asset nobody else has

The strongest marketing material in this repository was not written as
marketing.

`docs/2026-08-08-catalog-review.md` — 1,474 lines, thirty-six findings — opens
by naming two findings the reviewer **got wrong**, leaves the wrong versions in
place next to the corrections, and says: *"Anyone reading this to form a view of
the platform should read those two as evidence about the reviewer, not only
about the code."*

`docs/2026-08-08-trace-propagation.md` registers five predictions before
measuring, including *"P4, the one I expect to get wrong,"* and then records
that P4 was confirmed and the fix worked. `docs/2026-08-08-code-review-week.md`
registers R4 and then, three lines later, records **R4 — measured immediately,
and BROKEN**, with eight readers where one was predicted.

**No competitor in this category publishes this.** Not one of them can, because
the moment you publish a register of your own broken predictions you have
staked your credibility on a mechanism rather than a claim — which happens to
be the entire product thesis, applied to the company.

**This is the campaign.** Everything in §7 is a channel for it.

Two constraints on using it:

- **Redaction pass required before publication.** F27 (`@env` reads any
  environment variable with no allowlist) and D3 (`${SERVICE}_ENDPOINT`
  redirects an authenticated call carrying a forwarded bearer token) are
  design gaps described precisely enough to be actionable by someone who is
  not friendly. Fix-then-publish, or publish with the fix in the same commit.
  Everything else in the reviews is publishable as-is.
- **The reviews stay dated and disputable.** They do not get promoted into
  always-on positioning material. That is the project's own rule about what
  belongs in project knowledge, and it applies to a website too.

---

## 7. Channels

Ordered by fit. All owned or earned. **No paid.** Paid acquisition against an
audience whose defining trait is skepticism of claims is money spent teaching
them to distrust you, and there is nothing to convert them to.

| channel | why it fits | format | effort |
|---|---|---|---|
| **The repo itself** | The primary landing page for the primary audience. They arrive here before the website. | README rewritten to the provenance thesis; `docs/` as the reading path; a `PROVENANCE.md` explaining the four arenas with one runnable example. | Medium |
| **symbia-labs.com** | Currently the loudest wrong statement about the project. | Replace the five-problem hero with the one-problem thesis. Keep the architecture diagram and quick start — both are good and both are accurate. Keep §14 "what Symbia does not do" and give it a section, not a footnote. **Base type ≥16px.** | Medium |
| **Long-form essay, Brian's byline** | The thesis needs one canonical statement in his voice, and this audience reads essays. | *"We shipped a component that turned a missing input into zero and called it canonical."* F21, told straight — what it did, how it was found, why the fix is small and the lesson is not. | High |
| **Hacker News / lobste.rs** | Where the primary audience actually is, and the only channel where the reviews are a competitive advantage rather than a liability. | Submit the essay, not the repo. Repo submissions ask for a star; a post about your own defect asks for an argument. | Low, high variance |
| **Community engagement (unscheduled)** | Recruiting objectors is the real objective. | Answer the hard comments personally. Do not defend. When someone is right, register it as a finding. | Ongoing |
| **Industrial / OT channels** | Brian's existing audience, reachable directly, and the one that feels this problem physically. | A version of the essay in unit-error terms — the number that was wrong because a meter was missing, not because a model hallucinated. | Medium |
| **The reports page** (`symbia-labs.com/reports/`) | Already exists, already linked from the nav. | Make it the public home of the dated review documents. This is the single highest-leverage existing asset on the site. | Low |

**Held, not used:** LinkedIn message analysis and the health timeline are
flagged and on hold. `corpus-turns.db` requires a review pass before any
publication. Chapter 18 is not a campaign asset and is not to be assumed.
Patents are not a campaign asset — Brian has been explicit.

---

## 8. Beats, gated

No dates. Each beat opens when its gate is measured closed.

### Gate A — the thesis is not false

**Close F21.** `symbia.compute.arithmetic` substitutes `0` for a missing input
and stamps `lane: canonical`, `exact: true`. A missing numerator yields `0`.
A missing denominator yields `Infinity`, serialized as `null`. Both canonical.

Nothing in this campaign ships before this is fixed. Marketing "an answer
without a receipt is a rumour" while the canonical lane can emit a confident
zero is not a messaging risk — it is the platform claiming a property it has no
mechanism to enforce, which is the thing `energy/API-MEASUREMENTS.md` exists to
record.

Also in Gate A: **A3** (`trace_${Date.now()}` with no random suffix — two events
in one millisecond share a trace id and manufacture edges the topology graph
then draws as observed) and **A5** (the pixel vault's grant names `service:models`
while the bytes go to integrations — the audit artifact is false). Both corrupt
an instrument the campaign will point at.

### Gate B — the public record is not embarrassing

L3 (placeholder security contact), L5 (`DEVELOPER.md` §8), L6 (the 5173 probe),
L1 (scrub and gitignore `.mcp.json`, rotate the signing key), L8 (merge or
archive the stranded branch). L7 (68 typecheck errors) — either fixed or
declared in the README with a link to the finding. A public repo with a known,
named, linked failure is credible; one with a silent failure is not.

### Gate C — it has been seen working

**Nothing has been opened in a browser.** `docs/2026-08-06-control-center-rebuild.md`
§13 says so explicitly. `docs/2026-08-08-trace-propagation.md` records that the
control-center container was never rebuilt with the proxy fix, that P5 is not
exercised, and that nothing in the UI reads `caller`.

Every screenshot, GIF and demo in this campaign is a claim about a running
system. Walk 8000 screen by screen first, register predictions before
measuring, and record what it does rather than whether it "works."

### Beat 1 — Correct the record

Repo README, website hero, `PROVENANCE.md`, security contact. No announcement.
The goal is that anyone who arrives on their own finds the true version.
*Gate: B closed.*

### Beat 2 — Publish the reviews

The reports page becomes the home of the dated documents, with the redaction
pass from §6 applied. Framed as a standing practice, not a one-off.
*Gate: A closed, redaction pass done.*

### Beat 3 — The essay, and the argument

The F21 post under Brian's byline. Submitted to HN and lobste.rs. This is the
first beat that asks for attention, and it asks by admitting a defect.
*Gate: Beats 1 and 2 live, so anyone who follows a link lands on the corrected
record.*

### Beat 4 — The industrial cut

The same argument in unit-and-meter terms, into Brian's existing channels.
*Gate: Beat 3 measured — the essay's actual reception determines whether this
is the same argument or a corrected one.*

### Beat 5 — Retrospective, published

What was predicted in §10, what broke, what it cost. Published under the same
rules as the engineering docs. This is what makes the practice a practice.
*Gate: Beat 4 complete.*

---

## 9. Assets required

| asset | contents | priority |
|---|---|---|
| README rewrite | Provenance thesis first. Four arenas. Quick start. Honest status section linking to the open findings. | Must |
| `PROVENANCE.md` | The four arenas, the canonical/apocryphal/conditional lane, one runnable example that produces a receipt and one that produces a refusal. **The refusal example matters more.** | Must |
| Website hero + problem section | One problem replacing five. Keep the architecture diagram and quick start. | Must |
| `SECURITY.md` / `CONTRIBUTING.md` contact fix | Real address. | Must |
| Reports page | Dated reviews, redacted per §6. | Must |
| Essay: *"We called a missing input zero"* | F21 told straight. Brian's byline, Brian's voice. | Must |
| Browser walkthrough record | Gate C's output. Doubles as the source of every honest screenshot. | Must |
| `graphs/lane-reference` | One canonical branch, one apocryphal, one refused, small enough to read in one screen. Already proposed in the catalog review §5.2. The thesis as a runnable artifact. | Should |
| Industrial-cut essay | Unit errors, missing meters, physical consequence. | Should |
| A short screen recording | The provenance chip expanding to show four sources and one unverified composition step. **Only after Gate C.** | Nice |

---

## 10. Success metrics, and how each is measured

| metric | target | measured by | honest limit |
|---|---|---|---|
| Unsolicited technical inbound | 50 | Issues, discussions, forks-with-commits, direct mail. Counted by hand, from named humans. | Bot and drive-by noise is excluded by hand, which makes the count subjective. Say so when reporting it. |
| Arguments — inbound findings disputing a published one | ≥5 | The findings register | This is the metric that matters most and the one hardest to game. |
| Repo traffic | Baseline first | GitHub Insights | **Not currently checked.** No baseline exists. Establish it before Beat 1 or the number means nothing. |
| Essay reach | Baseline first | Referrers | Same. |
| Stars | **Not a target** | — | Deliberately excluded. Stars measure agreement with a headline. |
| Positioning correction | Binary | Does any public Symbia surface still lead with the five-problem framing? | Cheapest and most important. |

**Reporting cadence:** at each gate, not on a calendar. A metrics report written
to a schedule reports on whatever happened to be true that morning.

---

## 11. Risks

**The reviews read as "this project is broken."** Real. Thirty-six findings in
one document is a lot to hand a stranger. *Mitigation:* framing does the work —
these are the findings a project produces when it looks. The README's status
section must say plainly that the reviews exist because the project searches for
this class of defect deliberately, and link the F21 fix as the worked example.
The essay ships in the same beat for exactly this reason.

**F21 gets fixed and the campaign forgets to be honest about it.** The most
likely failure. The temptation after fixing a defect is to launch on the fixed
version and omit the six months it was live. *Mitigation:* the essay is about
the defect, not the fix. If the essay cannot be written honestly, the campaign
does not ship.

**Category crowding.** Four claimants and a Gartner listing means the word
"receipt" will be contested. *Mitigation:* do not fight for the word. Own the
distinction — everyone else audits the answer, this is the substrate. Concede
the category cheerfully and take the position.

**Nobody comes.** The base rate for a solo open-source infrastructure launch is
silence. *Mitigation:* accept it and register it. Beat 5 publishes the
retrospective either way. A campaign that reports its own null result is
consistent with everything else here, and is the only version of this plan that
cannot fail dishonestly.

---

## 12. Predictions, registered before anything ships

Per working discipline 1.

- **M1.** Fixing F21 breaks at least one existing test or fixture that relies on
  the zero-substitution. *Confidence: medium.* (This restates catalog-review P7
  deliberately — if it breaks there it breaks here, and the campaign's Gate A
  slips.)
- **M2.** The F21 essay outperforms any "introducing Symbia" post by more than
  5× on every reach measure available. *Confidence: high.*
- **M3.** The first substantive external objection will be about the
  canonical/apocryphal **vocabulary**, not about the mechanism. Nobody outside
  this codebase uses "apocryphal" that way. *Confidence: medium.*
- **M4.** At least one inbound reader will find a defect the two 8 Aug reviews
  missed, within the first fifty contacts. *Confidence: high* — that is the
  entire argument for having outside readers, and if it does not happen the
  reviews were better than they have any right to be.
- **M5, the one I expect to get wrong.** The industrial cut (Beat 4) will
  outperform the developer cut, because the audience already exists and the
  problem is physical for them. *Confidence: low.* I expect this to be wrong —
  HN reach is likely to dwarf a warm list, and "already exists" is not the same
  as "will engage." Registering it as the one to lose.

---

## 13. Not checked

Listed so no reader infers a pass from absence.

- Whether the signing key behind L1's expired JWT is still in use.
- Whether the public repo has existing stars, forks, traffic, or open issues.
  **No baseline of any kind has been established.**
- Whether `symbia-labs.com/reports/` and `/docs/` currently have content, and
  what it says. Only the homepage was read.
- Whether the January `SYMBIA_WEB_CONTENT_INSTRUCTIONS.md` is still what
  generates the site, or whether the site has diverged from it.
- Everything in Gate C. Nothing in this repository has been checked in a
  browser.
- Whether any of the four named competitors is actually positioned where §2.3
  says. Read from search results, not from their products.

---

## 14. Decisions needed from Brian

1. **Provenance thesis over the five-problem framing** — confirm. Everything in
   this plan is downstream of it.
2. **Publish the review documents.** They are the campaign's best asset and
   they are also thirty-six findings about your own platform, in public, with
   your name on them.
3. **Gate A is a hard gate** — confirm nothing ships before F21, A3 and A5 are
   closed, or say which one you would ship over.
4. **`.mcp.json`** — scrub history, or leave it and rotate the key. The token is
   expired and points at loopback; this is a judgement call, not an emergency.
5. **Byline** — Symbia Labs, or Brian M. Gilmore. The essay is materially
   stronger with a name on it, and that is a choice about public profile that
   has been deliberately low so far.
