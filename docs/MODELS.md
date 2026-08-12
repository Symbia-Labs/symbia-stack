# The Models Service — the model broker

Reference document, established 12 Aug 2026. This is the standing overview:
strategy, measured status, and the ordered build queue for the models service
on 5008. Dated evidence lives in
`docs/2026-08-12-assistant-normalization-spec.md` and
`docs/2026-08-12-assistant-normalization-results.md`. When this document and a
dated findings file disagree, **the findings file wins and this one is stale** —
say so and fix it.

---

## 1. Strategy

### What this service is for

**One place decides what model runs, with what parameters, and reports what
actually happened.** Local inference and remote providers are the same question
wearing different clothes, and answering it in two places is how the platform
ended up with model identity in three disagreeing locations.

The ruling, 12 Aug 2026:

> the models service should be handling all exchanges with local and remote
> models — these configurations belong in config or runtime as they will change
> frequently

CLAUDE.md had already ruled the same thing from the other side: **the catalog
holds reusable items only, never real-time point instances.** A
provider-and-model-id that goes stale in six months is a point instance. The
two rulings meet here.

### Why it is a service and not a library

Three facts are only knowable next to the registry, and none of them are
knowable by a caller:

1. **Whether a parameter is even legal.** `temperature: 0.7` is rejected
   outright by `claude-sonnet-5`. An assistant cannot know this, and nothing in
   the assistants service is positioned to — the model is chosen at call time by
   whichever credential happens to exist.
2. **Which model id is real.** Two sources in this platform disagree about
   Anthropic's default, and one of them is measured while the other is
   configuration that went stale.
3. **What actually ran**, as opposed to what was asked for. A receipt naming the
   requested model describes an intention; naming the served model describes an
   event.

### Delegation, not absorption

**Integrations keeps the credentials.** This service holds no key, reads no
key, and stores no key. A caller's bearer token is forwarded — assistants →
models → integrations — and integrations resolves the credential exactly as it
did before. Decided explicitly on 12 Aug when the alternative was on the table.

That keeps secret handling in one service and makes this one a policy and
routing component: it decides *what* to call and *with what*, and hands the call
over.

### The OpenAI shape is kept and extended, never replaced

`/v1/*` stays OpenAI-compatible so an ordinary client needs to know nothing
about Symbia. What that shape cannot carry — where a model runs, whether this
service can execute it, whether it is available to *you*, which parameters were
refused — goes under a single `symbia` key rather than scattered as loose
fields, so it is obvious which half of a response is standard and which is ours.

### Listing is not offering

`brokered` is the field that separates "this model exists" from "this service
can run it". Registered-is-not-running has bitten this codebase twice —
`server` on 5000, and *this service* reporting healthy with zero models loaded —
so the registry states the difference rather than implying a capability.

---

## 2. Status — measured, not asserted

### RUNS

**The unified registry.** `/v1/models` returned `{"data": []}` on a stack with
three usable providers configured. It now lists local and remote together.
Measured 12 Aug:

```
unauthenticated  3 entries, all remote, verified=false
  openai/gpt-4o-mini
  anthropic/claude-sonnet-4-20250514
  huggingface/meta-llama/Llama-3.2-3B-Instruct

with a forwarded token   47 entries across 3 providers, verified=true
  defaults (adapter heads, i.e. what actually answers):
    openai/gpt-5.2
    anthropic/claude-sonnet-5
    huggingface/Qwen/Qwen2.5-VL-7B-Instruct
```

**Remote execution, delegated.** `/v1/chat/completions` routes any
`provider/model` id to integrations and returns the OpenAI shape plus
`symbia.{requestedModel, ranModel, droppedParams}`.

**The parameter table.** Four rules, two models. It exists because sending
`temperature: 0.7` to `claude-sonnet-5` broke four predictions on 12 Aug.

**Assistants call it.** Stage 3, 12 Aug: `llm.invoke` goes through the broker.
Walk held at 11/11 and the broker's own log is the evidence:

```
[chat] brokered anthropic/claude-sonnet-5 -> ran claude-sonnet-5
```

`LLM_VIA_MODELS=0` restores the direct integrations call without a rebuild.

**Surface today:**

```
/v1/chat/completions          local engine or brokered remote
/v1/models  /v1/models/:id    unified registry
/api/models  /api/models/:id  same, non-OpenAI path
/api/models/:id/load|unload   local model lifecycle
/api/integrations/execute     provider-adapter shape, LOCAL ONLY
/api/vision/status|classify   local vision
/api/stats
```

### BUILT, UNWIRED

- **Local inference.** `llama/engine.ts` is 557 lines and `/api/stats` reports
  `loadedModels: 0`. The local path has never served a request on this stack.
  Everything claimed about local inference is claimed about code, not behaviour.
- **`/api/integrations/execute`** rejects any provider that is not its own or
  `local` — a provider-adapter facade that predates the broker and has no
  caller now that `/v1/chat/completions` is the front door.
- **`catalog/model-sync.ts`** registers local models with the catalog. With zero
  local models it has nothing to sync, so it is unexercised.

### Honest limits, stated so nobody infers otherwise

- **`availability` is `unknown` for every remote model** on an unauthenticated
  listing, and that is a real answer: credentials are per-organisation and
  `/v1/models` carries no org context. It is not a placeholder to be filled in
  with `available`.
- **`verified: false` on unauthenticated ids.** They are what configuration
  *advertises*. The measured list needs a user token because integrations has no
  service-to-service auth path.
- **The parameter table is hand-written and thin.** Two models, and one of the
  two entries (`claude-opus-5`) is marked *not separately measured* — it is
  inferred from family. Nothing discovers these rules; they are added when
  something breaks.
- **Streaming remote models is unsupported**, and says so with
  `streaming_unsupported` rather than silently answering non-streamed.
- **Resolution has not moved.** Which provider to use is still decided by
  `resolveUsableProvider` in the assistants service asking integrations which
  credential exists. The broker executes; it does not yet choose.
- **No retry, no fallback, no substitution.** `onUnavailable` was specified in
  the normalization spec and is not built here.

### Defects this work paid for

1. **`temperature` deprecated for `claude-sonnet-5`** — found by making
   assistants honour their declared config; four predictions broke. The reason
   the parameter table exists.
2. **Two disagreeing model ids in one service** — `/api/integrations/providers`
   says `claude-sonnet-4-20250514` (catalog-registered config), the adapter says
   `claude-sonnet-5` (measured 7 Aug, and what runs). Registry now records
   `idSource` and `verified` rather than picking a side silently.
3. **The broker's own front door defaulted `temperature` to 0.7** — the exact
   failure it was built to prevent, in its request schema. Removed.
4. **`brokered` hardcoded `false` for two hours after execution shipped** — one
   fact in two places. `REMOTE_PROVIDERS` and `canBroker()` now live beside the
   code that executes.
5. **A successful brokered call left no log**, so a green walk could not
   distinguish "traffic moved to the broker" from "traffic never moved". Every
   brokered completion now announces itself.

---

## 3. Next steps, in order

1. **Load a local model and serve one request.** Everything about local
   inference is currently a claim about code. `symbia-chat-lab`
   (`vscode/symbia-chat-lab`, reference only, not to be ported) has a solved
   version of this: a GGUF catalog with repo/file/quant, HEAD-checked sizes,
   and a `start_llama` that polls until the server actually answers before
   reporting success. Until a local model serves a request, "local and remote"
   is half true.
2. **Move resolution to the broker.** Today the assistants service picks the
   provider by credential and the broker executes. That split is deliberate and
   temporary: it kept stage 3 debuggable. Once resolution moves, an assistant
   asks for a *capability* and the broker answers with a model.
3. **Grow the parameter table from measurement, not incident.** Four rules
   added after one outage is not a table, it is a scar. The provider adapters
   already list models with capabilities; the constraints should come from the
   same place, and the unmeasured `claude-opus-5` entry should be measured or
   removed.
4. **`onUnavailable`.** The ruling — deterministic refuses, probabilistic
   substitutes, every substitution recorded — belongs here, where the registry
   knows what is available. It is specified and unbuilt.
5. **`config.digest` in the reply envelope.** The invariant from
   `docs/proposals/assistant-data-model.md` §3: *a receipt must always be able
   to name the exact configuration that produced the answer, even when that
   configuration no longer exists.* Now unblocked, because exactly one resolved
   configuration reaches the call.
6. **Retire `/api/integrations/execute`** from this service, or give it a
   caller. It is a facade with neither.
7. **An INTENT.md for this service.** Ten services have one; models does not.

### Not planned, and why

- **Holding credentials.** Ruled out 12 Aug. Integrations is the vault.
- **Replacing the OpenAI shape.** Extension only. A Symbia-native shape would
  make every ordinary client wrong for no gain the `symbia` key does not give.
- **Discovering parameter rules automatically by probing providers.** Tempting,
  and it spends real money on real APIs to learn something a table can hold.
  Revisit only if the table becomes unmaintainable.
