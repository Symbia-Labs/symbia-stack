# Spyglass vision through the integrations gateway

*7 Aug 2026. Predictions registered BEFORE measuring, per working discipline 1.*

## The task

Brian: "How do we connect the component to the hugging face integration to allow
model integration like in other areas?"

Today the spyglass POSTs pixels to `models` (`/api/vision/classify`), which
refuses because no local vision GGUF exists. "Like in other areas" means the
door assistants use: `POST /api/integrations/execute` with
`{provider, operation, params}`, credential resolved from identity, circuit
breaker and usage logging in front of it.

This is also the platform rule in its literal form: if the spyglass cannot get
a model through the Symbia API, that is a defect to be logged, not a reason to
call HuggingFace directly from the browser.

## What is known before touching anything

Read, not assumed:

- `integrations` exposes `POST /api/integrations/execute` (routes.ts:126),
  `GET /api/integrations/providers/:provider/models` (378) with a `capability`
  query filter (397), and `GET /api/integrations/capabilities` (1369).
- `ModelInfo.capabilities` already includes `'vision'` as a legal value
  (providers/base.ts:20). The type anticipated this; nothing populates it.
- `HuggingFaceProvider.supportedOperations` is
  `["text.generation", "chat.completions", "embeddings"]`.
- `HuggingFaceProvider.listModels()` returns 20 models. Reading them, none
  declares `vision`.
- `buildChatBody` (huggingface.ts:295) types message content as `string` and
  spreads `finalMessages` into the body unchanged.
- `symbia_integration_status` reports huggingface `configured: true`.

## Predictions

Registered before running anything. Numbers go in git first so a wrong one
cannot be quietly reinterpreted afterwards.

**P1.** `GET /api/integrations/providers/huggingface/models?capability=vision`
returns an empty list. Nothing in the curated list declares vision, so a
capability filter must match nothing.

**P2.** A multimodal message sent through the CURRENT code reaches the
HuggingFace router unaltered. The `as Array<{role, content: string}>` cast in
`buildChatBody` is erased at runtime, so an array-shaped `content` is spread
into the body as-is. The type is wrong; the wire path is not. What the router
then says is unknown and is the thing worth measuring.

**P3.** `models` reports vision unavailable with `VISION_MODEL not set` — the
refusal is real and not a stub that would quietly start passing.

**P4.** After adding vision models to the HuggingFace provider, the capability
filter in P1 returns them without any change to routes.ts, because the filter
reads `ModelInfo.capabilities` generically.

## Measured

**P1 — CONFIRMED.** `GET /providers/huggingface/models?capability=vision`
returned `{"models":[]}` against 20 total models.

**P2 — NOT MEASURABLE, and the reason is the finding.** The request never
reached the router, twice, for two different reasons that had nothing to do
with the body shape. See F1 and F2. The prediction may still be true; nothing
here established it, and it is not being counted as confirmed.

**P3 — CONFIRMED.** `GET models:5008/api/vision/status` →
`{"ready":false,"missing":["VISION_MODEL not set","VISION_MMPROJ not set
(multimodal projector)"]}`.

**P4 — CONFIRMED.** After adding three vision models to the HuggingFace
adapter, the same capability filter returned
`Qwen/Qwen2.5-VL-7B-Instruct`, `meta-llama/Llama-3.2-11B-Vision-Instruct`,
`HuggingFaceM4/idefics2-8b` with no change to routes.ts.

## Second round — predictions registered before measuring

Brian: "does anthropic offer vision? should just be a simple configuration."

Read before predicting: every Claude model in `providers/anthropic.ts`
already declares `capabilities: ['chat', 'vision', ...]`, and
`convertMessages` (line 249) already translates OpenAI-style `image_url`
parts — including base64 data URIs — into Anthropic `image` blocks. The
capability was there. The operation name to reach it was not, and
`supportedOperations` was `["chat.completions", "messages"]`.

**P5.** With `image.description` added to the Anthropic adapter, a frame sent
through `/api/integrations/execute` with `provider: anthropic` will come back
described. Anthropic is the one provider with a stored credential, and the
image conversion already exists, so nothing else should be in the way.

**P6.** The reason my client did not already find Anthropic is ordering, not
capability: `findVisionModel` walks `/status` providers in returned order —
openai, anthropic, huggingface — and stops at the first that lists a vision
model. OpenAI lists vision models and has no credential, so the walk picks a
provider that cannot answer. Predicted symptom: a REFUSED naming **openai**,
not huggingface.

### Second round — measured

**P5 — CONFIRMED, and it works.** `POST /api/integrations/execute` with
`provider: anthropic`, `operation: image.description`, `model: claude-sonnet-5`
and a 64×64 PNG returned in 1574ms:

> "This is a simple black and white checkerboard pattern arranged in a 4x4 grid
> of alternating squares."

The test image is a 64×64 checkerboard of 16px squares — a 4×4 grid. The
description is correct, which makes this the first end-to-end evidence that a
model has actually looked at anything.

**P6 — CONFIRMED, and worse than predicted.** The client walked `/status`,
where all four providers report `configured`. `/api/integrations/capabilities`
is the only credential-aware endpoint, and measured on this stack:

| provider | status | models declaring vision |
|---|---|---|
| openai | unavailable | 10 |
| anthropic | **available** | 7 |
| huggingface | unavailable | 3 |
| symbia-labs | unavailable | 0 |

So the first-match walk picked **openai** — first in the list, ten vision
models, no credential — and the whole feature would have failed with an error
naming a provider nobody chose and nobody configured. Now selects on
`status === 'available'`.

**F6 — the client could not read a successful answer.** `/execute` returns
`{ success, data: { provider, model, content, usage }, requestId, durationMs }`.
The client read `body.result ?? body` and looked for `.content`, which finds
nothing in that envelope. **Every successful vision call would have been
reported as "the provider returned a response containing no text" — a refusal
manufactured by the client misreading a correct answer.** Nothing in the code
would have shown this; the one probe against the running endpoint caught it.
This is what "probe before you build" is for, and I had already written the
parser before probing.

**F7 — Anthropic could do this the whole time.** Every Claude model declared
`vision`, and `convertMessages` already translated OpenAI-style `image_url`
parts into Anthropic image blocks. `supportedOperations` was the only thing in
the way. The capability existed and there was no name to ask for it by.

## Findings

**F1 — `configured: true` never meant a key exists.**
`GET /api/integrations/status` reported huggingface `configured: true` while
every `/execute` returned 401 `No huggingface API key configured`. The flag was
`configs.some(c => c.provider === p)` — an adapter config registered in the
service. The credential that actually gates a call is per-user, lives in
identity at `/api/internal/credentials/{userId}/{provider}`, and this route is
unauthenticated and cannot see one.

Measured: identity holds exactly **one** credential for this user, `anthropic`.
None for huggingface or openai, both of which reported `configured: true`.

This is the same defect as the Overview panel's green provider dots, and it is
discipline 5 exactly — a flag that reads as a pass because nobody asked the
question. Fixed by reporting `registered: true` and `credential: "not_checked"`,
keeping `configured` as a deprecated alias so existing readers do not silently
change behaviour. "Not checked" is the honest answer from an unauthenticated
route; `false` would have been a second lie in the other direction.

**F2 — the operation list exists twice, and the copy that wins is the one
nobody edits.** Adding `image.description` to
`HuggingFaceProvider.supportedOperations` had **no effect**. Requests were
rejected with `Invalid enum value. Expected 'chat.completions' | 'responses' |
'messages' | 'text.generation' | 'embeddings'` by `operationSchema` in
`integrations/shared/schema.ts`, which validates before any adapter is
consulted. Discipline 7: a shared concern with two independent implementations
is not shared. Both lists now carry a comment naming the other.

**F3 — `temperature: 0.7` was injected into every HuggingFace request.**
Same shape as the defect already fixed for Anthropic, in a provider nobody
re-read afterwards. Now sent only when explicitly supplied.

**F4 — the content type said images were impossible while the wire allowed
them.** `buildChatBody` cast messages to `content: string`. The cast is erased
at runtime, so an image array would have passed through untouched; the type was
simply wrong, and wrong in the direction that discourages anyone from trying.
Replaced with `string | ContentPart[]`.

## Where it stands

The chain is complete and exercised end to end except for one link:

| step | state |
|---|---|
| aperture captures, pixels to vault | built, not exercised live |
| envelope on the mesh, pixels off the bus | built |
| client asks which provider declares `vision` | **measured working** |
| gateway accepts `image.description` | **measured working** |
| gateway rejects it without an image | **measured working** |
| gateway resolves a huggingface credential | **fails — none stored** |
| model describes the frame | unreachable until the above |

**The one thing left is Brian's to do**: store a HuggingFace API key as a
credential for his user, the same way the Anthropic one is stored. I do not
enter API keys.

## Not checked

- Whether any of the three vision model ids is actually **served** by the
  HuggingFace router. Curation is a claim about the world; nobody here has
  tested it, and the list says so in a comment.
- Whether the multimodal body is accepted by the router (P2, above).
- The whole browser-side capture path. `getDisplayMedia` needs a gesture and a
  picker; nothing automated has driven the shutter, the crop, the 180ms blink,
  or the attach.
- The success-response shape from `/execute`. The client reads both `body` and
  `body.result` and treats an unreadable one as REFUSED rather than as an empty
  description.
