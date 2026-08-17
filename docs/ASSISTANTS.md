# The Assistants Service — how an assistant decides

Reference document, established 12 Aug 2026. This is the standing overview of
**how an assistant decides what to do**: the roster, the rules engine, routing,
kinds, and failure behaviour.

**Boundary, stated so these do not drift into each other.** What a reply
*carries* — envelopes, arenas, seals, delegation records, memory — is
`docs/MESSAGES.md`. This document stops at the point a reply is produced.
`assistants/INTENT.md` is the January architectural intent and is **partly
stale**; where it and this disagree, measure before believing either.

Dated evidence: `docs/2026-08-11-three-assistant-*.md`,
`docs/2026-08-12-assistant-normalization-spec.md` and `-results.md`. When a
dated findings file disagrees with this one, **the findings file wins and this
one is stale**.

---

## 1. Strategy

### Lean deterministic

> "entirely deterministic is a false idol — all systems, and especially humans,
> are an integration of the two. What is key is that the decisions made use
> deterministic methods and tools whenever they can."

Three tiers, cheapest first, and a model is consulted only when the first three
decline:

1. **Explicit mention** — `@calc` names its target. No inference.
2. **Declared patterns** — an assistant declares what it handles.
3. **A naive-Bayes intent classifier** with an out-of-domain class.
4. A model, last.

Tier 3 matters more than it looks: **it is reproducible.** The same message
routes the same way every time. Reproducible inaccuracies are bugs, and bugs can
be fixed; a model that routes differently on two identical runs cannot be
debugged, only re-rolled.

### Three assistants, one variable apart

The roster is deliberately small and the three differ by one thing each, so a
wrong classification is visible rather than arguable:

| | kind | what it does | arena it should produce |
|---|---|---|---|
| **Symbia** (coordinator) | probabilistic | delegates, computes nothing | COMPOSED / REFUSED |
| **Calculator** | deterministic | `tool.invoke` only, no model | COMPUTED / REFUSED |
| **Smart Calculator** | probabilistic | model writes the expression, arithmetic stays exact | COMPOSED / REFUSED |

Seven more are `draft` and cover levels 1–5 of the `core` ladder
(deterministic → hybrid → multi-agent). They stay draft until the harness is
proven against a growing roster.

### Kind decides how an assistant fails

Ruling 12 Aug: **deterministic assistants refuse; probabilistic assistants try
again, and every attempt is recorded.**

`kind` is *declared*, never derived from tags — a tag is a search aid anyone can
edit, and letting it decide whether the platform spends tokens retrying would
make an editorial change a billing change. It defaults to `deterministic`:
between a loud failure and an expensive hidden one, default to loud.

A deterministic assistant that retries is not deterministic. The same input
would produce a different number of attempts, and arithmetic that failed once
will fail again — retrying it only spends time pretending otherwise.

### Configuration is not the assistant's to hold

Model identity and generation parameters do **not** live on the assistant.
Proven the hard way on 12 Aug: making assistants honour their declared config
broke four predictions, because `temperature: 0.7` is rejected outright by
`claude-sonnet-5`. Whether a parameter is even legal depends on the model, and
an assistant cannot know that. See `docs/MODELS.md`.

---

## 2. Status — measured, not asserted

### RUNS

**Deterministic routing, three tiers**, with the classifier carrying an
out-of-domain class so "tell me a joke" is refused rather than routed to
Calculator.

**Rule control flow** (`9449ad6`): `onError`, `isDefault`, `fallThrough`.

- `onError` had been declared in five rules since January and read by nothing.
- `isDefault` replaces catch-alls expressed as an accident of priority
  arithmetic.
- `fallThrough` lets a rule cede when it merely *recognised* a request rather
  than owning it. **Ceding never produces silence** — a ceded failure is
  surfaced if nothing else answers.

**Failure behaviour by kind** (`bdcd73d`): retries with every attempt recorded
as its own step; declinations are never retried, because a refusal is a
decision, not a malfunction.

**Corrections revise the calculation** (`4bb72ff`): "actually make it 20%"
revises `47.50 * 0.15` rather than operating on `7.125`.

**Standing evidence**, re-run after every change:
`scripts/verify-assistants.mts` — **11/11 predictions**, P11 7/7, P12 11/11,
P14 11/11, P13 11/11, roster and predictions agreeing, 3 published all covered.

The harness reads the live roster and reconciles both directions: an assistant a
case names must be published, and a published assistant must be named by a case.
It does **not** generate cases from the roster — a prediction has to be written
by someone willing to be wrong about it.

### BUILT, UNWIRED — or simply absent

- **Prompt graphs.** `assistants/INTENT.md` presents them as a core concept. 29
  source references exist; no live rule uses one. Treat INTENT.md's graph
  sections as design, not behaviour.
- **Handoff workflows.** `handoff.create` / `handoff.assign` are registered
  action types with **zero** uses across the live rulesets.
- **`ExecutionContext.assistant`** — declared, never assigned, never read. Left
  in place deliberately rather than populated; populating a field nothing reads
  is how the other dead surface accumulated.
- **23 of 79 exported functions** in this service have no caller anywhere in
  `src`, `scripts` or `symbia-sys`. Among them `getOrgLLMSettings` (the
  org-level config tier, never wired) and `validateConfig` (a zod schema that
  has never validated anything).

### Honest limits

- **All state is in memory.** Rulesets, conversation state, conversation memory
  and lineage chain heads are `Map`s. A restart loses them, and a conversation's
  first delegation links to GENESIS again. Ruled acceptable for now;
  **persistence is a production prerequisite, not a backlog item.**
- **Explanations repeat verbatim.** Declines escalate with repetition;
  explanations do not.
- **Corrections are handled for arithmetic revision only.** The pattern list is
  hand-written and English-only.
- **`npm run check` fails with ~20 TypeScript errors in this service**, all
  pre-existing. The build gate is effectively off.
- **The retry-and-succeed path is unproven by design.** It is exercised only by
  failures encountered incidentally; no test induces a transient failure to
  watch a retry succeed.

### Defects this work paid for

Twelve platform defects were found by making three assistants work, most in code
that had never had a caller. Representative:

1. `assistant-loader` never passed `?status=published` — status was decoration.
2. `integrations/auth.ts` resolved orgId for RLS but never wrote it to
   `req.user`, so no assistant could resolve an org credential.
3. `seal()` returned the live provenance array, so every non-delegated reply
   failed its own verification.
4. Intermediate `llm.invoke` output was promoted to the user-visible reply,
   emitting a model's working with no envelope at all.
5. `onError` declared five times, read by nothing.
6. **Refusals were never sealed** (see `docs/MESSAGES.md`).

---

## 3. Next steps, in order

1. **Prove the retry path deliberately.** Induce a transient failure and watch
   an attempt succeed after a recorded failure. Built, and currently evidenced
   only by mistakes.
2. **Persistence before production.** In-memory is a ruling, not an oversight,
   but it is a prerequisite and should be behind an interface from the start.
3. **Decide what a bootstrap file is for.** Editing
   `catalog/data/assistants-bootstrap.json` has never reached this database, and
   `npm run seed` will silently revert a day's work. Still the most dangerous
   entry in STATUS.
4. **Restore the seven drafts, or delete them.** They are a third state — not
   running, not removed — and they shape how the catalog reads. The harness is
   now roster-driven, so this is unblocked.
5. **Reconcile `assistants/INTENT.md` with what runs.** Prompt graphs and
   handoff workflows are presented as core and have no callers.
6. **The remaining rule questions**, deferred deliberately: whether
   first-match-wins should be the only strategy, whether conditions may call a
   tool, whether the *routine* rather than the rule is the right unit, and where
   a step id lives. See `docs/2026-08-11-rule-configuration-review.md`.
7. **Cut the dead surface**, or give it callers. 23 uncalled exports is roughly
   a third of this service's public API.

### Not planned, and why

- **Deriving `kind` from tags.** Rejected 12 Aug. Tags stay descriptive.
- **A model as the first routing tier.** It is the last one, on purpose.
- **Retrying refusals.** A decision will not succeed on a second attempt, and
  repeating it makes the system look like it is arguing with itself.
