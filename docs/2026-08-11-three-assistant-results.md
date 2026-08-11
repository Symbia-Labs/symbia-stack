# Three assistants — results

**Measured 11 August 2026** against a running stack by
`scripts/verify-assistants.mjs`. Predictions were registered in
`docs/2026-08-11-three-assistant-predictions.md` and committed before any of
this was run.

Three passes are recorded: the first before the credential path was fixed, then
two consecutive runs after. The second and third disagree with each other, and
that disagreement is the most important thing in this document.

## Pass 1 — 1 of 8 held

Every delegation failed with `No LLM provider has a usable credential`.
`coord-orchestrate` is roster → classify → route, and the classifier is step
two, so P1–P5 never reached a specialist.

**Deleting `rule-compute-first` did not break this — it revealed it.** That
rule computed bare arithmetic with no model, so `2+2` worked while everything
needing the classifier did not. Reducing the roster to three removed the thing
that was hiding it.

## The credential — three separate problems

Established by measurement, not inference:

1. **The stored Anthropic key is personal** — `org_id NULL, is_org_wide false`,
   owned by `dev@example.com`. An assistant is a different principal and
   `getCredentialForUserOrOrg` cannot reach it, correctly. There is a supported
   org-wide path and nothing was using it. Fixed by
   `scripts/setup-test-org.mjs`, through `POST /api/credentials` with an
   `X-Org-Id` header — the platform's own audit-logged endpoint, no SQL writes.

2. **`integrations` dropped the resolved org before the handler saw it.**
   `authMiddleware` resolves `orgId` header > token > fallback, uses it for
   RLS, and never wrote it back onto `req.user` — while six call sites in
   `routes.ts` read `user.orgId` to look up a credential. For a human this is
   invisible: their token names their org, so the two agree. For an agent it is
   fatal and silent — a bootstrap assistant registers with `orgId: null,
   organizations: []` (measured against `/api/auth/agent/me`), so `user.orgId`
   was null no matter what the caller said. `resolveUsableProvider` sends
   `X-Org-Id` precisely to say which org to look in; the header arrived, was
   used for RLS, and was dropped. **No assistant in this platform could resolve
   an org credential.** This is the same shape as the raw-token defect
   documented immediately above it in the same function.

3. **A failed request was reported as a missing key.**
   `resolveUsableProvider` returned `null` on any non-2xx, and the caller
   renders `null` as *"Add an API key in Settings."* So a 400 caused by our own
   missing org context reached the person in the chat window as a statement
   about their configuration, and sent them to add a key that was already
   there. "I could not ask" now throws; `null` means only "I asked, and the
   answer was none."

## Pass 2 and 3 — and they disagree

| | run A | run B |
|---|---|---|
| P1 `2+2` → Calculator, `COMPUTED` | **BROKEN** | **BROKEN** |
| P2 `what is 2+2?` → Calculator, `COMPUTED` | HELD | HELD |
| P3 `sqrt(16)` → Calculator, `COMPUTED` | HELD | HELD |
| P4 `15% tip on $47.50` → Smart Calc, `COMPOSED` | HELD | **BROKEN** |
| P5 `split $120 between 4` → Smart Calc, `COMPOSED` | HELD | HELD |
| P6 `help` | BROKEN | BROKEN |
| P7 `who is on the team` | HELD | HELD |
| P8 `is the stack healthy` → `COMPOSED` | HELD | HELD |
| | 6/8 | 5/8 |

**P4 held in one run and broke in the next, with no change between them.**

### This is the finding

The routing decision is a model call. It is not reproducible, and it leaves no
trace. P1 fails with:

```
LLM returned an empty response (provider=resolved, model=claude-sonnet-5,
promptChars=3). Nothing was sent.
```

A three-character prompt gets an empty completion, so `2+2` — the simplest
input the platform accepts — is the one delegation cannot reliably classify.

Set that beside P11, which is now **measured rather than read from code**:
delegation genuinely occurred for P2–P5, and **0 of 7 replies carried any
record of it**. So the least reliable step in the chain is also the only
unrecorded one, and every step after it is sealed. A reply that says `COMPUTED`
and names `math.evaluate` is telling the truth about the arithmetic while
saying nothing about the non-deterministic choice that decided whose
arithmetic it was.

That is STATUS §6.3, and it is worse than that entry states. It is not that a
step is missing from a list. It is that the platform seals the reproducible
half of its own pipeline and stays silent about the half that is not.

## What is fixed and holding

- **The pair works as designed.** `2+2` → Calculator → `= 4` → `COMPUTED`, no
  model. `15% tip on $47.50` → Smart Calculator → `**Understood:**
  47.50 * 0.15 / **Answer:** 7.125` → `COMPOSED`. One variable different, two
  arenas, both correct.
- **`normalizeMathInput` works.** `what is 2+2?` returns `= 4`. STATUS §6.2 is
  closed for Calculator.
- **P9 and P10 went from 0/8 to 7/7.** Envelopes now name the assistant and the
  run. `message.ts` sealed `context.metadata.assistantKey` and `runId`, and
  neither was ever set — `assistantKey` lives on `event.data`, and the runId
  was generated inside `RuleExecutor` and never written back. Both were
  `undefined`, so `JSON.stringify` dropped them and **the seal committed to
  their absence**.
- **`{{#each}}` exists.** The roster rule was authored against a block helper
  the template language did not have, so every tag resolved to undefined and
  rendered one empty row. Implemented in `@symbia/sys` — not in the assistants
  service, which would have made `{{#each}}` mean something in one consumer and
  nothing in the others. Supports `{{this.x}}` and `{{x}}` as the same thing,
  which cost a second round: the first version handled `this` exactly and
  resolved `this.alias` as a path into a field called `this`.
- **The last hardcoded roster is gone.** `coord-help` was static prose naming
  ten assistants, seven now unpublished. It reads the registry.

## P6 — read this one carefully

P6 predicted `help` would seal `REFUSED`, and in pass 1 it did. It now seals
`COMPUTED`, so the prediction is **broken**.

**The defect is not fixed.** `classify([])` still falls through every branch to
`REFUSED: no step produced content`, and any zero-step static reply still
carries a refusal. `help` simply stopped being zero-step — it runs
`assistants.list` now, so it has a deterministic step to stand on. The
behaviour improved by accident of an unrelated change, and the underlying
misclassification is untouched. A static `message.send` in any rule will still
be sealed as a refusal.

## One prediction was edited, and it should be said plainly

P7 asserted `/calculator/i`. The roster renders **aliases** — `@calc`,
`@symbia`, `@smartcalc` — because that is what a person types. The key never
appears. So P7 reported broken while the platform was correct: the prediction
was wrong about the platform, not the reverse. The assertion now requires all
three aliases. This is the only edit made to a registered prediction.

## Two corrections to the verification discipline

1. **A marker must survive minification.** `CLAUDE.md` says to grep a unique
   marker in the running bundle. Done, and it reported the changes missing —
   `build.ts` sets `minify: true` and every marker chosen was a comment. The
   changes were present the whole time. Worse, the second attempt grepped
   `#each` and matched seed data rather than the implementation. Use a string
   literal that only the new code could produce.

2. **Rule changes need a service restart.** The assistants service caches
   rulesets at boot. A diagnostic patched into the catalog appeared to have no
   effect and nearly sent this session after a phantom template bug.

## Pass 4 — the routing decision is in the envelope

```
P9   provenance.assistant present on 8/8 replies
P10  provenance.runId     present on 8/8 replies
P11a routing step in the chain      5/5 delegated replies
P11b sealed delegation record       5/5 delegated replies
P11c basis discloses the delegation 5/5 delegated replies
P12  seal verifies from the envelope alone  8/8 sealed replies
7/8 predictions held.
```

A delegated reply's chain now reads across both assistants:

```
steps=[tool.invoke, llm.invoke, assistant.route, tool.invoke]
delegation: coordinator -> calculator  decidedBy=claude-sonnet-5  hash=1d043692a174…
```

**Two envelopes, bound by hash.** The coordinator seals the decision at the
moment it decides — the only moment it exists, since it will never reply — and
the sealed record travels on the forwarded message. The specialist's reply
puts the delegation's *hash* inside its own hashed body, so the reply commits
to a decision it did not make and could not have forged, without becoming a
second copy of it. Either half verifies alone. This is the spyglass's
per-track chains bound by a close event, applied to a conversation.

**The arena does not move, and the basis says why.** Calculator's `= 4` is
still `COMPUTED`: a model chose *who* answered, not *what* the answer was, and
demoting it to `COMPOSED` would claim a model touched a number that no model
touched. But the basis now ends, on every delegated reply:

> Reached this assistant because coordinator chose it via claude-sonnet-5;
> that choice is recorded in this envelope's delegation and is NOT
> reproducible.

That sentence is the whole point. The lane stays honest about the arithmetic
and stops being silent about the non-deterministic step upstream of it — the
one that, measured across three passes, gave different answers to the same
question.

### Two defects found by doing it

**`describeSource` never named the model.** Its comment said the resolved
provider "is recorded by llm-invoke itself when it differs". It never was, and
almost no rule configures a provider, so every model step in every envelope
read `llm (provider resolved at call time)` — a source field containing a
description of its own uncertainty. `llm-invoke` had returned `output.model`
all along. `decidedBy=claude-sonnet-5` is that fix.

**Every non-delegated reply failed its own verification.** `seal()` hashed
`input.steps` and handed the *same array reference* back on the envelope —
`context.provenance`, which `rule-executor` was still appending to. So
`message.send`'s own step landed in the array after the hash was computed, the
envelope displayed a chain one step longer than the one it had sealed, and
`verify()` got a different digest. It failed in the direction that looks like
tampering.

It was found by inconsistency, not by suspicion: delegated replies build a new
array and so are a snapshot, and their step lists had no `message.send` while
undelegated ones did. The half that looked right was the broken half.

### A third instrument failure

P12 first reported **0 of 8**. The seal was fine; the script was using the
development default for `NETWORK_HASH_SECRET` while the container has a real
one set. With the container's secret: 8 of 8.

That is the third time in one session that a measuring instrument was wrong
rather than the thing measured — after minified comment markers, and after
P7's assertion demanding a key where the roster correctly renders aliases.
Every one of them pointed at working code and said "broken". It is the exact
failure that got the ITT suite deleted on 10 August, and the reason the rule is
that blank beats green: an instrument that reports a pass it did not earn is
worse than one that reports nothing.

## Still open

1. **The classifier is not reproducible.** `2+2` and `15% tip` each held in
   some passes and broke in others, with no change between them, and the
   failure mode is an empty completion on a short prompt. The decision is now
   *recorded*; it is not yet *reliable*, and the envelope says so in as many
   words.
2. **`classify([])` should not be `REFUSED`.** A static answer is not a
   declined one. `help` stopped exhibiting it by accident — it gained a
   `tool.invoke` step — and the misclassification is untouched underneath.
3. **`seal()` uses `JSON.stringify`, not RFC 8785**, while `@symbia/crypto`
   implements canonical JSON and the assistants service does not import it.
   Key-order dependence means any store that reorders keys breaks verification
   and it looks like forgery. The construction is also `sha256(body ‖ secret)`
   rather than HMAC, and it is copy-shared with
   `network/server/src/services/policy.ts` — one defect in two places, and now
   three, since `sealDelegation` follows the same pattern deliberately rather
   than inventing a second one.
