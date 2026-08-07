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

*(filled in after each prediction is tested — broken predictions reported as
broken)*

## Not checked

*(kept honest as the work proceeds)*
