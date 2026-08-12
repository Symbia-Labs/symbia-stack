# The normalized assistant — results

Measured 12 Aug 2026 against the running stack. Predictions were registered in
`5aa67e3` before any code changed; this file reports them as they landed,
including the one that came true and had to be reverted.

---

## Scoreboard

| | prediction | result |
|---|---|---|
| P1 | every core assistant loads with a complete config | **held** |
| P2 | an empty `config` still runs | **not measured** — the config shape was not built |
| P3 | exactly one config reaches the call | **held, then reverted** — see §2 |
| P4 | Calculator refuses rather than substitutes | not measured |
| P5 | Smart Calculator retries, attempts in the envelope | not measured |
| P6 | a substitution is never silent | not measured |
| P7 | retagging is complete and lossless | **held** — 0 tutorial, 10/10 core, 10/10 level-N, 0 lossy |
| P8 | the harness is roster-driven | not started |
| P9 | regression: the existing eleven still hold | **held** — 11/11 after revert; 7/11 in between |
| P10 | declared claims match sealed arenas | not measured |

Walk after the revert: **11/11**, P11 7/7, P12 10/10, P14 10/10, P13 11/11.

---

## 1. What held

**P7 — retagging.** `tutorial` → `core` across ten assistants, `curriculum*`
metadata keys → `core*`, levels preserved. Lossless verified structurally: every
field except the four renamed keys compared before and after, ruleSet included.

The dry run caught a wrong assumption before anything was written — the tag was
`tutorial`, not `curriculum`; `curriculum` only ever appeared in metadata keys.
Ten metadata renames and zero tag renames is what surfaced it.

**P1 — configuration resolves.** The authored `metadata.llmConfig` now reaches
the resolved config, which it never had:

```
calculator   provider=openai    model=gpt-4o        temp=0.7 maxTokens=2048
smart-calc   provider=openai    model=gpt-4o-mini   temp=0   maxTokens=100  (authored)
coordinator  provider=anthropic model=claude-3-5-sonnet-20241022 temp=0.7 maxTokens=1500 (authored)
```

**The plumbing that made it possible.** `ExecutionContext.llmConfig` had been
declared since January and **never assigned by anything** — `RunCoordinator
.processEvent` builds every ExecutionContext in the service and did not set it.
So `embedding-route.ts`, the only reader anywhere, had always tested against
`undefined`. The original diagnosis — "no rule uses `embedding.route`" — was
true and was not the cause; acting on it would have wired up a rule and changed
nothing.

---

## 2. P3 came true and broke the system

The prediction: *`rule-platform-status` sends `temperature 0.7` (from the
assistant config, previously undefined) and `maxTokens 500` (action param still
wins).*

It did exactly that. Result:

```
Anthropic API error: `temperature` is deprecated for this model.
```

Four predictions broke — P4, P5, P8, D8 — and the walk went to **7/11**.

`rule-platform-status` had been sending no temperature at all. Merging the
assistant's configuration made it send 0.7, a January-era value, to
`claude-sonnet-5`, which does not accept the parameter.

### The first diagnosis was also wrong

I attributed the failure to honouring stale *provider* declarations —
`smart-calc` declares `openai` on an org whose only credential is anthropic,
`coordinator` declares `claude-3-5-sonnet-20241022` which Anthropic now rejects.
Both are true. Neither was the cause. Reverting the provider honouring left the
walk at 7/11, unchanged, which is how the real cause got read out of the logs
instead of reasoned about.

### What it actually demonstrates

**Whether a generation parameter is even legal depends on the model.** An
assistant cannot know that. Nothing in the assistants service can: the model is
chosen at call time by whichever credential happens to exist. Only a broker that
knows what it is calling can validate parameters against it.

That is Brian's ruling of the same day, arrived at from the other direction:

> the models service should be handling all exchanges with local and remote
> models — these configurations belong in config or runtime as they will change
> frequently

And CLAUDE.md had already ruled it: *the catalog holds reusable items only,
never real-time point instances.* A provider-and-model-id that goes stale in six
months is a point instance. Four broken predictions are that ruling being
violated and then enforced.

### What was reverted, and what was kept

Reverted: `llm.invoke` no longer reads the merged config. It sends exactly what
a rule wrote explicitly — the behaviour that works.

Kept: the resolved config is still assigned to `ExecutionContext`, still
resolved once at load, still visible in the console beside the authored value.
It is carried for display and for the models service to consume when it brokers
these calls.

**The prediction was not wrong about what would happen. It was wrong to want.**

---

## 3. The models service does not do what it is named for

Checked 12 Aug. It is local-only:

- `handlers/chat-completions.ts` imports exactly one thing — `getEngine()` from
  `llama/engine.js`. There is no remote path.
- `handlers/execute.ts` rejects any provider that is not its own or `"local"`.
- `catalog/model-sync.ts` registers only local GGUF models, tagged `local`.
- `/v1/models` returns `[]`. Zero models loaded.

And `assistants` never calls it — zero references. Remote inference goes from
`llm-invoke` straight to the integrations service, bypassing models entirely.

So there are two unrelated model paths and the service positioned to be the
broker handles neither. **Logged as a platform defect, not routed around.**

---

## 4. A measurement problem worth naming

At 7/11, the sub-counts read `P12 6/6`, `P14 6/6`, `P13 8/8` — all green. They
were green because four turns produced no reply, so there was nothing to check.

**A denominator that shrinks with failures reports improvement as the system
degrades.** After the revert the same lines read 10/10, 10/10, 11/11.

This is the instrument sharing the assumptions of what it measures — the failure
mode that removed the ITT suite (STATUS §11) and the argument for making the
harness roster-driven before the roster grows.

---

## 5. Standing after this session

- Model identity and generation parameters are marked for removal from catalog
  assistant resources, pending the broker.
- `metadata.llmConfig` is preserved and displayed; nothing acts on it.
- The `declared` flag added to distinguish authored from defaulted providers
  lived about an hour and was removed with the code that read it. An unread
  field is the thing this service already has 23 of.
- 23 of 79 exported functions in the assistants service have no caller anywhere
  in `src`, `scripts` or `symbia-sys`. Among them: `getOrgLLMSettings`, which
  would supply the fourth and also-unwired config tier, and `validateConfig`,
  a zod schema that has never validated anything.
