# The normalized assistant — spec and predictions

**Written 12 Aug 2026, before any code was changed or measured.**
Predictions are in §6. Results go in a separate `-results.md`, and a broken
prediction gets reported as broken.

---

## 0. The rulings this implements

From Brian, 12 Aug, verbatim in substance:

1. `curriculum` is a remnant of a trainer exercise. **`core`** is the better
   word. The level tier stays — it encoded a real distinction even though the
   trainer framing did not.
2. Assistants kept or created must be **normalized against the interaction
   models** — arenas, lanes, delegation, receipts.
3. **All required fields need default settings to work.** An assistant must
   never be unusable because a field was left unset.
4. **Deterministic assistants default to inherit or refuse.**
5. **Probabilistic assistants default to try again.**
6. **Any assistant component should allow a default model assignment**, either
   local through the models service or remote through the integrations service.

Two follow-ups settled the same day:

7. A retry **records every attempt** in the envelope. An answer that succeeded
   on the third try is not the same claim as one that succeeded on the first,
   and the receipt must be able to tell them apart.
8. What happens when a declared model is unavailable is **user config**, not a
   hardcoded behaviour.

**One derivation, flagged as mine rather than Brian's.** (8) makes
`onUnavailable` a field, and (3) says every required field needs a working
default. The default follows the line already drawn in (4) and (5):
deterministic assistants default to `refuse`, probabilistic to `substitute`.
Either way the substitution is recorded, per (7). If that default is wrong it is
wrong here, in one place, and not smeared across the roster.

---

## 1. What is broken today

Measured 12 Aug against the running stack, before changes.

**The live coordinator carries three LLM configurations that disagree, and the
one that reaches the API call is an accident of which fields happen to be set.**

| # | where | value on `ast-coordinator` | reaches the call? |
|---|---|---|---|
| 1 | `metadata.llmConfig` on the resource | `anthropic / claude-3-5-sonnet-20241022 / temp 0.7 / maxTokens 1500` | **no** |
| 2 | `ResolvedLLMConfig` from `llm-config-resolver.ts` | preset `conversational`, resolved on every load | **no** |
| 3 | per-action `params` on each `llm.invoke` | `rule-platform-status` sets only `maxTokens: 500` | **yes** |

Consequences, each verified rather than inferred:

- `llm-invoke.ts` reads `params.provider`, `params.model`, `params.temperature`,
  `params.maxTokens` and **never reads `context.llmConfig`**. The authored
  Sonnet-at-0.7 has never been sent.
- `getActionConfig()` in `llm-config-resolver.ts` — whose entire purpose is
  merging resolved config into action params — **has no caller in `src/`.** The
  only match outside the file is its own declaration in `dist/`.
- The sole reader of `context.llmConfig` anywhere is `embedding-route.ts`, and
  **no rule uses `embedding.route`.** So in practice the resolved config, all
  409 lines of resolver behind it, is read by zero live code paths.
- No assistant sets `llmConfigPreset`, so `assistant-loader.ts:308` silently
  resolves every one of them as `conversational`.
- `assistant-loader.ts:322` **overwrites** `metadata.llmConfig` with the
  resolved preset in the loaded copy. The console therefore displays the
  preset-derived config rather than what the resource authored — the UI hides
  the discrepancy rather than showing it.
- With no provider in params, `resolveUsableProvider` picks whichever provider
  has a credential. Under ruling (6) that guess is a **defect, not a fallback**:
  the assistant is supposed to have a declared answer.

### Correction, found while implementing — the cause is worse than §1 said

The text above says the resolved config reaches nothing *because no rule uses
`embedding.route`*. That is true and it is not the reason.

**`ExecutionContext.llmConfig` was never assigned by anything.**
`RunCoordinator.processEvent` builds every ExecutionContext in this codebase and
did not set the field; measured by grep, zero assignments across all routes. So
`embedding-route.ts` — the only reader anywhere — has always evaluated
`if (context.llmConfig && …)` against `undefined` and taken its fallback path.

Even if a rule *had* used `embedding.route`, it would still have read nothing.
The original diagnosis would have had me wire up a rule and watch it change
nothing.

Same grep found a second one: **`ExecutionContext.assistant` is never assigned
and never read.** A wholly dead field. It is left in place rather than
populated — populating a field nothing reads is how the other three got here.

**This is left standing rather than rewritten**, because the corrected cause is
the more useful record: the first diagnosis was right about the symptom and
wrong about the mechanism, and it was wrong in the direction of a plausible fix
that would have proved nothing.

**This is the `onError` pattern again**, and at larger scale. A configuration
layer that appears to work and changes nothing is worse than an absent one,
because it hides the need for the mechanism it represents. `onError` cost us a
parse-error message nobody ever saw; this costs us every model parameter on
every assistant.

**And it blocks the provenance work.** `docs/proposals/assistant-data-model.md`
§3 rules that configuration is ephemeral and the answer is `config.digest` —
content-address it, cite it in the envelope, so a receipt names what ran even
after it stops existing. **You cannot content-address a configuration that three
layers disagree about.** The merge is a hard prerequisite for the seal; they are
one job in sequence, not two options.

**Platform gap, logged not routed around.** The models service (5008) is healthy
and reports **zero models loaded**. Ruling (6) says a component may assign a
local model through it; today nothing can satisfy that. Registered ≠ running,
the same shape as `server` on 5000. This is logged as a defect rather than
worked around, per the governing rule.

---

## 2. The normalized shape

One config per assistant, at `metadata.config`. Every field below has a working
default, so an assistant with an empty `config` still runs (ruling 3).

```jsonc
{
  // DECLARED. The only field with no default — an assistant must say which
  // it is, because rulings 4 and 5 branch on it and a wrong guess is silent.
  "kind": "deterministic" | "probabilistic",

  // Port lane. Lanes only tighten.
  // default: deterministic -> "inherit", probabilistic -> "apocryphal"
  "lane": "canonical" | "apocryphal" | "inherit" | "conditional",

  // Arenas this assistant expects to produce. The platform checks the
  // declaration against the sealed arena of every reply, continuously, from
  // its own logs. See assistant-data-model.md §4.
  // default: deterministic -> ["COMPUTED", "REFUSED"]
  //          probabilistic -> ["COMPOSED", "REFUSED"]
  "claims": ["COMPUTED", "REFUSED"],

  // Ruling 4 and 5.
  // default: deterministic -> "refuse", probabilistic -> "retry"
  "onFailure": "refuse" | "retry",

  // Probabilistic only. Every attempt is recorded (ruling 7).
  "retries": { "max": 3 },

  // Ruling 6. A declared assignment, not a guess.
  "model": {
    "source": "local" | "remote",   // local -> models (5008), remote -> integrations (5007)
    "id": "claude-sonnet-5",
    // Ruling 8, user config. Default derived per §0.
    // deterministic -> "refuse", probabilistic -> "substitute"
    "onUnavailable": "refuse" | "substitute"
  },

  "generation": { "temperature": 0.7, "maxTokens": 1500 }
}
```

`config.digest` is sha256 over the canonical JSON (RFC 8785) of `config` minus
the digest itself — the same construction as the model weight digests, and for
the same reason: *a name is not an identity.*

### Precedence, stated once

```
action params  >  assistant config  >  kind defaults  >  system defaults
```

Narrower wins. Anything a rule sets explicitly still wins, so no existing rule
changes behaviour except where it was relying on a value nothing was sending.

---

## 3. The three core assistants, normalized

| | Calculator | Smart Calculator | Coordinator |
|---|---|---|---|
| `kind` | deterministic | probabilistic | probabilistic |
| `lane` | inherit | apocryphal | conditional |
| `claims` | `[COMPUTED, REFUSED]` | `[COMPOSED, REFUSED]` | `[COMPOSED, REFUSED]` |
| `onFailure` | refuse | retry | retry |
| `model.onUnavailable` | refuse | substitute | substitute |
| level | 2 | 4 | 5 |

Calculator is the interesting one: it is `deterministic`, so a missing model
**stops it** rather than quietly changing what answered. That is the point of
ruling 4 — a deterministic assistant that silently substitutes is no longer
deterministic, and its receipt would be lying.

---

## 4. Retagging

`curriculum` → `core` on all ten assistants; `curriculumLevel` /
`curriculumTitle` / `curriculumDescription` → `coreLevel` / `coreTitle` /
`coreDescription`. `level-1`..`level-5` tags stay.

Applied by **gated catalog write**, never by editing bootstrap JSON — editing
bootstrap has never once reached this database (STATUS §6.1).

---

## 5. Scope not taken today

- **`config.digest` in the envelope.** Unblocked by this work, deliberately not
  done in the same change. Sealing and merging in one commit would make a broken
  seal indistinguishable from a broken merge.
- **Restoring the seven drafts.** They stay `draft` until the harness is
  roster-driven (§6 P8), because growing the roster against a hardcoded
  instrument is the failure mode this project keeps repeating.
- **Loading a local model.** Logged as a platform gap; not fixed here.

---

## 6. Predictions

Registered before measuring. Each is falsifiable and each names how it will be
checked.

- **P1 — every core assistant loads with a complete config.** No required field
  unset on any of the three published assistants. Checked by reading the loaded
  config, not the resource.
- **P2 — an empty `config` still runs.** An assistant declaring only `kind`
  answers correctly, with all other fields defaulted. This is ruling 3, and it
  is the one most likely to be quietly false.
- **P3 — exactly one config reaches the call.** `llm.invoke` sends the merged
  value. Specifically: `rule-platform-status` sends `temperature 0.7` (from the
  assistant config, previously undefined) and `maxTokens 500` (action param
  still wins).
- **P4 — Calculator refuses rather than substitutes.** With its declared model
  unavailable, Calculator returns `REFUSED` naming the declared model, and no
  reply is produced by a substitute.
- **P5 — Smart Calculator retries, and every attempt is in the envelope.** On
  an induced failure, the envelope carries one step per attempt with its attempt
  number and error, and the successful reply reports the count.
- **P6 — a substitution is never silent.** Where `onUnavailable: substitute`
  fires, the receipt names declared model, model that ran, and
  `substituted: true`.
- **P7 — retagging is complete and lossless.** Zero assistants carry
  `curriculum`; ten carry `core`; all ten keep their `level-N`; no other field
  changed.
- **P8 — the harness is roster-driven.** `verify-assistants.mts` derives its
  expectations from the live roster and each assistant's declared `kind` and
  `claims`, so adding an assistant does not silently weaken it.
- **P9 — regression.** The existing eleven predictions still hold, plus P11 7/7,
  P12 10/10, P14 10/10, P13 11/11.
- **P10 — declared claims match sealed arenas.** For every reply in the walk,
  the sealed arena is a member of the producing assistant's declared `claims`.
  A mismatch is a real defect and gets reported as one, not adjusted away.

### What would make me wrong

P2 is the prediction I would bet against. "Required fields have defaults" is
easy to write and easy to half-implement, and the failure is silent: a field
defaults to `undefined`, something downstream treats `undefined` as a legal
value, and the assistant runs while meaning nothing. If P2 breaks, the ruling is
not implemented no matter what the other nine say.

P10 is the one I most want to be true and have least control over — it is the
platform checking its own declarations, and the whole argument for `claims`
rests on it costing one array.
