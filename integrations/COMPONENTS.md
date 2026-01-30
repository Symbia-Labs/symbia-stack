# Integrations Service - Component & Context Architecture

## Overview

This document defines the component library and context objects available for LLM integrations in Symbia. Components are organized into:

1. **Provider-Agnostic** - Work with any configured provider
2. **OpenAI-Specific** - Optimized for OpenAI's full API
3. **HuggingFace-Specific** - Optimized for HuggingFace models

---

## Component Matrix

| Component | OpenAI | HuggingFace | Description |
|-----------|--------|-------------|-------------|
| `integrations/LLMInvoke` | ✅ | ✅ | Generic LLM text generation |
| `integrations/LLMChat` | ✅ | ✅ | Conversational with history |
| `integrations/Embeddings` | ✅ | ❌ | Vector embeddings |
| `openai/ChatCompletion` | ✅ | - | OpenAI-optimized chat |
| `openai/Embeddings` | ✅ | - | OpenAI embeddings with dimensions |
| `openai/ToolCall` | ✅ | - | Function/tool calling |
| `openai/JSONMode` | ✅ | - | Structured JSON output |
| `huggingface/ChatCompletion` | - | ✅ | HuggingFace chat via router |
| `huggingface/TextGeneration` | - | ✅ | Raw text generation |

---

## Provider-Agnostic Components

### integrations/LLMInvoke
Generic LLM invocation that works with any provider.

**Ports:**
| Port | Direction | Type | Description |
|------|-----------|------|-------------|
| `input` | input | any | User message or messages array |
| `output` | output | object | Normalized LLM response |
| `error` | output | object | Error details |
| `provider` | config | string | "openai" \| "huggingface" |
| `model` | config | string | Model identifier |
| `systemPrompt` | config | string | System message |
| `temperature` | config | number | 0.0-2.0, default 0.7 |
| `maxTokens` | config | number | Max output tokens |

### integrations/LLMChat
Conversational interface with chat history management.

**Ports:**
| Port | Direction | Type | Description |
|------|-----------|------|-------------|
| `message` | input | string | User message |
| `clear` | input | any | Trigger to clear history |
| `response` | output | string | Assistant response |
| `history` | output | array | Full conversation history |
| `error` | output | object | Error details |
| `provider` | config | string | Provider selection |
| `model` | config | string | Model identifier |
| `systemPrompt` | config | string | System message |
| `maxHistory` | config | number | Max messages to retain |

### integrations/Embeddings
Generate vector embeddings (OpenAI only, HuggingFace router doesn't support).

**Ports:**
| Port | Direction | Type | Description |
|------|-----------|------|-------------|
| `text` | input | string | Text to embed |
| `embedding` | output | array | Vector embedding |
| `error` | output | object | Error details |
| `provider` | config | string | "openai" (required) |
| `model` | config | string | Embedding model |

---

## OpenAI-Specific Components

### openai/ChatCompletion
OpenAI-optimized chat with full feature support.

**Ports:**
| Port | Direction | Type | Description |
|------|-----------|------|-------------|
| `messages` | input | array | Chat messages |
| `response` | output | object | Full OpenAI response |
| `content` | output | string | Text content only |
| `toolCalls` | output | array | Function call requests |
| `error` | output | object | Error details |
| `model` | config | string | gpt-4o, gpt-4o-mini, etc. |
| `temperature` | config | number | Sampling temperature |
| `maxTokens` | config | number | Max completion tokens |
| `responseFormat` | config | string | "text" \| "json_object" |
| `tools` | config | array | Function definitions |

### openai/Embeddings
OpenAI embeddings with dimension control.

**Ports:**
| Port | Direction | Type | Description |
|------|-----------|------|-------------|
| `input` | input | string\|array | Text or texts to embed |
| `embeddings` | output | array | Embedding vectors |
| `usage` | output | object | Token usage |
| `error` | output | object | Error details |
| `model` | config | string | text-embedding-3-small/large |
| `dimensions` | config | number | Output dimensions (256-3072) |

### openai/ToolCall
Execute OpenAI function/tool calling with response handling.

**Ports:**
| Port | Direction | Type | Description |
|------|-----------|------|-------------|
| `messages` | input | array | Conversation with tool results |
| `toolResult` | input | object | Result from tool execution |
| `response` | output | object | Model response |
| `toolCalls` | output | array | Requested tool calls |
| `done` | output | boolean | Conversation complete |
| `error` | output | object | Error details |
| `model` | config | string | Model identifier |
| `tools` | config | array | Available tool definitions |

### openai/JSONMode
Structured JSON output with schema validation.

**Ports:**
| Port | Direction | Type | Description |
|------|-----------|------|-------------|
| `prompt` | input | string | User prompt |
| `json` | output | object | Parsed JSON response |
| `raw` | output | string | Raw JSON string |
| `error` | output | object | Error or validation failure |
| `model` | config | string | Model identifier |
| `schema` | config | object | JSON schema for output |
| `systemPrompt` | config | string | Instructions for JSON format |

---

## HuggingFace-Specific Components

### huggingface/ChatCompletion
HuggingFace chat via router API (OpenAI-compatible).

**Ports:**
| Port | Direction | Type | Description |
|------|-----------|------|-------------|
| `messages` | input | array | Chat messages |
| `response` | output | object | Full response |
| `content` | output | string | Text content |
| `error` | output | object | Error details |
| `model` | config | string | meta-llama/Llama-3.2-3B-Instruct, etc. |
| `temperature` | config | number | Sampling temperature |
| `maxTokens` | config | number | Max output tokens |

### huggingface/TextGeneration
Raw text generation for completion-style models.

**Ports:**
| Port | Direction | Type | Description |
|------|-----------|------|-------------|
| `prompt` | input | string | Text prompt |
| `completion` | output | string | Generated completion |
| `response` | output | object | Full response with usage |
| `error` | output | object | Error details |
| `model` | config | string | Model identifier |
| `maxTokens` | config | number | Max new tokens |
| `temperature` | config | number | Sampling temperature |
| `topP` | config | number | Nucleus sampling |
| `stopSequences` | config | array | Stop generation tokens |

---

## Context Objects

Context objects provide shared configuration and state that flows through graph execution.

### integrations.provider
Provider configuration context.

```typescript
interface ProviderContext {
  name: "openai" | "huggingface" | "anthropic";
  defaultModel: string;
  baseUrl: string;
  rateLimits?: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
}
```

**Usage in components:**
```javascript
const provider = ctx.getContext('integrations.provider');
// Use provider.name, provider.defaultModel, etc.
```

### integrations.credentials
Credential reference context (never contains actual secrets).

```typescript
interface CredentialsContext {
  hasOpenAI: boolean;
  hasHuggingFace: boolean;
  hasAnthropic: boolean;
  openAIPrefix?: string;   // "sk-proj-..."
  huggingFacePrefix?: string; // "hf_..."
}
```

### integrations.model
Model selection context for dynamic model switching.

```typescript
interface ModelContext {
  provider: string;
  modelId: string;
  displayName: string;
  contextWindow: number;
  maxOutputTokens: number;
  capabilities: string[];
}
```

### integrations.usage
Usage tracking context (accumulated across graph execution).

```typescript
interface UsageContext {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  requestCount: number;
  estimatedCost?: number;
}
```

---

## Model Catalogs

### OpenAI Models

| Model ID | Context | Output | Use Case |
|----------|---------|--------|----------|
| gpt-4o | 128K | 4K | Flagship, multimodal |
| gpt-4o-mini | 128K | 4K | Fast, affordable |
| gpt-4-turbo | 128K | 4K | High performance |
| o1-preview | 128K | 32K | Reasoning |
| o1-mini | 128K | 65K | Fast reasoning |
| text-embedding-3-small | - | 1536 | Embeddings |
| text-embedding-3-large | - | 3072 | High-quality embeddings |

### HuggingFace Models (via Router)

| Model ID | Context | Output | Use Case |
|----------|---------|--------|----------|
| meta-llama/Llama-3.2-3B-Instruct | 8K | 2K | Fast, lightweight |
| meta-llama/Llama-3.2-1B-Instruct | 8K | 2K | Ultra-fast |
| mistralai/Mistral-7B-Instruct-v0.3 | 32K | 4K | Quality/speed balance |
| Qwen/Qwen2.5-72B-Instruct | 32K | 8K | High capability |

---

## Implementation Notes

1. **Authentication**: All components require a JWT token in execution context
2. **Error Handling**: All components emit to `error` port on failure
3. **Rate Limiting**: Providers have built-in rate limits; components should handle 429 errors
4. **Streaming**: Future enhancement for real-time response streaming
5. **Caching**: Consider caching for embeddings (deterministic output)
