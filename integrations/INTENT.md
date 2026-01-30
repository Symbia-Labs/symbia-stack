# Integrations Service — Architectural Intent

> The centralized gateway for all third-party API traffic in the Symbia platform.

---

## What Integrations Is

Integrations is the **single point of entry for all external API calls** made by the Symbia platform. Whether you're calling OpenAI, HuggingFace, Anthropic, or any other provider, the request flows through this service.

It answers three fundamental questions:

1. **What providers are available?** — OpenAI, HuggingFace, Anthropic, and more
2. **What credentials do I have?** — Fetched securely from Identity, never exposed to clients
3. **What did I get back?** — Normalized responses regardless of provider

This is not a simple proxy. It's a **credential-secured, provider-agnostic, usage-tracked gateway** designed for AI-native applications where multiple providers need to be orchestrated transparently.

---

## The Problem We're Solving

Building AI applications that call external APIs creates several recurring challenges:

1. **Credential sprawl** — API keys end up in environment variables, config files, client code. Who has access? When were they rotated? Hard to know.

2. **Provider lock-in** — Your code calls OpenAI directly. Want to add HuggingFace? Rewrite the calling code. Want to switch providers based on cost? More rewrites.

3. **Response normalization** — OpenAI returns `choices[0].message.content`. HuggingFace returns `generated_text`. Anthropic returns `content[0].text`. Every caller must handle these differences.

4. **Usage tracking** — How many tokens did we use last month? Which user made the most API calls? Without centralization, this requires instrumenting every caller.

5. **Rate limiting** — Each provider has different limits. Without a central gateway, each caller must implement its own throttling.

6. **Cost control** — A runaway loop can burn through thousands of dollars in minutes. Without a gateway, there's no circuit breaker.

Integrations addresses all of these by making external API access an **internal service call** with consistent behavior.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Client Request                                   │
│         (Runtime component / Assistants action / Direct API call)            │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         INTEGRATIONS SERVICE                                  │
│                                                                               │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐      │
│  │   Routes    │──▶│   Auth      │──▶│  Credential │──▶│  Provider   │      │
│  │             │   │  Middleware │   │   Fetch     │   │   Adapter   │      │
│  └─────────────┘   └─────────────┘   └──────┬──────┘   └──────┬──────┘      │
│                                             │                  │              │
│                                             │                  ▼              │
│                                             │         ┌─────────────┐        │
│                                             │         │  External   │        │
│                                             │         │    API      │        │
│                                             │         └──────┬──────┘        │
│                                             │                │               │
│                                             ▼                ▼               │
│                                    ┌─────────────┐   ┌─────────────┐        │
│                                    │  Identity   │   │  Response   │        │
│                                    │  Service    │   │ Normalizer  │        │
│                                    └─────────────┘   └──────┬──────┘        │
│                                                             │               │
│                                                             ▼               │
│                                                     ┌─────────────┐        │
│                                                     │  Execution  │        │
│                                                     │    Log      │        │
│                                                     └─────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Request Flow

1. **Route Handler** — Receives POST `/api/integrations/execute` with provider, operation, and params
2. **Auth Middleware** — Validates JWT token via Identity service introspection
3. **Credential Fetch** — Retrieves user's API key for the provider from Identity
4. **Provider Adapter** — Transforms request to provider-specific format
5. **External Call** — Makes the actual API request with timeout and error handling
6. **Response Normalizer** — Converts provider-specific response to common schema
7. **Execution Log** — Records usage metrics (tokens, duration, success/failure)
8. **Return** — Sends normalized response to caller

---

## Provider Adapters

Each external provider has an adapter that handles:

| Responsibility | Description |
|----------------|-------------|
| **Request transformation** | Convert generic params to provider-specific format |
| **Response normalization** | Extract content, usage, and metadata into common schema |
| **Error handling** | Map provider errors to standard error types |
| **Validation** | Verify required parameters before making the call |

### Current Providers

| Provider | Operations | Default Model |
|----------|------------|---------------|
| **OpenAI** | `chat.completions`, `embeddings` | `gpt-4o-mini` |
| **HuggingFace** | `chat.completions`, `text.generation`, `embeddings` | `meta-llama/Llama-2-7b-chat-hf` |
| **Anthropic** | `messages` (planned) | `claude-3-5-sonnet` |

### Normalized Response Schema

All providers return the same structure:

```typescript
{
  provider: "openai",
  model: "gpt-4o-mini",
  content: "The response text",
  usage: {
    promptTokens: 10,
    completionTokens: 25,
    totalTokens: 35
  },
  finishReason: "stop",
  metadata: { /* provider-specific details */ }
}
```

This means callers never need to know which provider was used. They just consume the normalized response.

---

## Credential Management

Credentials are **never stored in Integrations**. They flow through but don't persist:

```
┌──────────┐         ┌──────────────┐         ┌──────────────┐
│  Client  │  JWT    │ Integrations │  JWT    │   Identity   │
│          │────────▶│              │────────▶│              │
│          │         │              │◀────────│              │
│          │         │              │  apiKey │              │
│          │         │              │         │              │
│          │         │       ┌──────┴──────┐  │              │
│          │         │       │ Use apiKey  │  │              │
│          │         │       │ for call    │  │              │
│          │         │       └─────────────┘  │              │
└──────────┘         └──────────────┘         └──────────────┘
```

1. User stores their API key in Identity (encrypted at rest)
2. When Integrations needs it, it calls Identity's internal endpoint
3. Identity decrypts and returns the key
4. Integrations uses it for the external call
5. Key is never persisted in Integrations

### Security Properties

- **No credential storage** — Integrations never writes keys to disk
- **Encrypted at rest** — Keys in Identity use AES-256-GCM
- **Scoped access** — Users can only use their own keys (or org-wide keys if permitted)
- **Audit trail** — Every use is logged with timestamp and request ID

---

## Design Decisions

### Why a Centralized Gateway?

**Alternative 1:** Direct calls from each service
- ❌ Credential duplication
- ❌ Inconsistent error handling
- ❌ No unified usage tracking

**Alternative 2:** SDK/library approach
- ❌ Version drift across services
- ❌ Still need credential distribution
- ❌ Hard to add circuit breakers

**Our Choice:** Centralized service gateway
- ✅ Single source of truth for credentials
- ✅ Consistent normalization
- ✅ Unified logging and rate limiting
- ✅ Easy to add new providers

### Why Not Store Credentials Here?

**Alternative:** Store encrypted keys in Integrations database
- ❌ Credential sprawl (now in two places)
- ❌ Sync issues between Identity and Integrations
- ❌ More attack surface

**Our Choice:** Fetch on demand from Identity
- ✅ Identity is the single source of truth
- ✅ Credential lifecycle managed in one place
- ✅ Integrations is stateless (easier to scale)

### Why Normalize Responses?

**Alternative:** Return raw provider responses
- ❌ Every caller must handle multiple formats
- ❌ Provider changes break all callers
- ❌ Hard to switch providers

**Our Choice:** Normalized schema
- ✅ Caller code is provider-agnostic
- ✅ Provider upgrades are internal
- ✅ Can A/B test providers transparently

---

## Execution Logging

Every request is logged with:

| Field | Description |
|-------|-------------|
| `userId` | Who made the request |
| `orgId` | Organization context |
| `provider` | Which provider was called |
| `operation` | What operation (chat.completions, embeddings) |
| `model` | Which model was used |
| `requestId` | Unique identifier for tracing |
| `durationMs` | How long the call took |
| `promptTokens` | Input token count |
| `completionTokens` | Output token count |
| `totalTokens` | Total tokens used |
| `success` | Whether it succeeded |
| `errorMessage` | If failed, what went wrong |

This enables:
- **Cost tracking** — Total tokens × price per token
- **Usage analytics** — Who uses what, how often
- **Debugging** — Trace failures by requestId
- **Rate limiting** — Enforce per-user/org limits (future)

---

## Integration Points

### Identity Service

- **Token introspection** — Validate JWTs and extract user info
- **Credential lookup** — Fetch user's API keys by provider

### Catalog Service

- **Provider configs** — Load base URLs, endpoints, rate limits from catalog resources
- **Model metadata** — Get model capabilities, pricing, context windows

### Runtime Service

- **Component execution** — Runtime components call Integrations for LLM operations
- **Built-in components** — `integrations/LLMInvoke`, `integrations/LLMChat`, `integrations/Embeddings`

### Assistants Service

- **LLM actions** — Assistants use Integrations for AI capabilities
- **Fallback** — If Integrations unavailable, Assistants falls back to direct calls

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 5007 | HTTP port |
| `IDENTITY_SERVICE_URL` | localhost:5001 | Identity endpoint |
| `CATALOG_SERVICE_URL` | localhost:5003 | Catalog endpoint |
| `DATABASE_URL` | (memory) | PostgreSQL connection |
| `CREDENTIAL_ENCRYPTION_KEY` | (dev key) | For dev fallback |

---

## What This Service Does NOT Do

1. **Store credentials** — Identity owns credential storage
2. **Cache responses** — Each call is fresh (caching is caller's responsibility)
3. **Stream responses** — Currently returns complete responses (streaming planned)
4. **Bill users** — Usage logging enables billing, but billing logic is external
5. **Enforce quotas** — Rate limiting is planned but not implemented
6. **Manage provider accounts** — Users bring their own API keys

---

## Future Directions

### Near-Term
- **Streaming support** — Server-sent events for long completions
- **Rate limiting** — Per-user and per-org throttling
- **Cost estimation** — Predict cost before making call

### Medium-Term
- **Provider fallback** — If OpenAI fails, try Anthropic
- **Response caching** — Cache deterministic queries
- **Batch operations** — Multiple calls in one request

### Long-Term
- **Custom providers** — Users register their own endpoints
- **Fine-tuned models** — Support for custom model endpoints
- **Cost optimization** — Route to cheapest provider meeting requirements

---

## Quick Reference

### Execute an LLM Call

```bash
curl -X POST http://localhost:5007/api/integrations/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "provider": "openai",
    "operation": "chat.completions",
    "params": {
      "model": "gpt-4o-mini",
      "messages": [
        {"role": "user", "content": "Hello!"}
      ],
      "temperature": 0.7,
      "maxTokens": 100
    }
  }'
```

### List Providers

```bash
curl http://localhost:5007/api/integrations/providers
```

### Check Status

```bash
curl http://localhost:5007/api/integrations/status
```

---

*Integrations is the keyhole through which all external AI traffic flows. One gateway, many providers, consistent results.*
