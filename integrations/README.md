# Symbia Integrations Service

The Integrations Service is the centralized gateway for all third-party API traffic in the Symbia platform. It provides a unified interface for calling LLM providers (OpenAI, HuggingFace, Anthropic) with credential management, response normalization, and usage tracking.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [Providers](#providers)
- [Credential Management](#credential-management)
- [Configuration](#configuration)
- [LLM Integration Guide](#llm-integration-guide)

---

## Overview

### Core Capabilities

| Capability | Description |
|------------|-------------|
| `integrations.execute` | Execute LLM operations through any provider |
| `integrations.providers.list` | Discover available providers and models |
| `integrations.providers.config` | Get provider configuration details |
| `integrations.status` | Service health and status |

### Supported Providers

| Provider | Operations | Default Model |
|----------|------------|---------------|
| **OpenAI** | `chat.completions`, `embeddings` | `gpt-4o-mini` |
| **HuggingFace** | `chat.completions`, `text.generation`, `embeddings` | `meta-llama/Llama-3.2-3B-Instruct` |
| **Anthropic** | `messages` (planned) | `claude-3-5-sonnet` |

### Response Schema

All providers return normalized responses:

```json
{
  "success": true,
  "data": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "content": "Hello! How can I help you today?",
    "usage": {
      "promptTokens": 10,
      "completionTokens": 12,
      "totalTokens": 22
    },
    "finishReason": "stop"
  },
  "requestId": "req_abc123",
  "durationMs": 450
}
```

---

## Quick Start

### Environment Variables

```bash
# Required
PORT=5007
IDENTITY_SERVICE_URL=http://localhost:5001
CATALOG_SERVICE_URL=http://localhost:5003

# Optional - Database
DATABASE_URL=postgresql://user:pass@host:5432/integrations

# Optional - Development
CREDENTIAL_ENCRYPTION_KEY=dev-key-for-testing
```

### Running the Service

```bash
# Development with in-memory DB
npm run dev

# Production
npm run build && npm run start
```

### Verify It's Running

```bash
# Health check
curl http://localhost:5007/health

# List providers
curl http://localhost:5007/api/integrations/providers

# Check status
curl http://localhost:5007/api/integrations/status
```

---

## Architecture

```
                    ┌─────────────────────┐
                    │   Client Request    │
                    │  (with JWT token)   │
                    └──────────┬──────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────┐
│                  INTEGRATIONS SERVICE                     │
│                                                           │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────┐   │
│  │  Routes  │───▶│  Auth    │───▶│ Credential Fetch │   │
│  └──────────┘    │Middleware│    │  (from Identity) │   │
│                  └──────────┘    └────────┬─────────┘   │
│                                           │              │
│                                           ▼              │
│                                  ┌──────────────────┐   │
│                                  │ Provider Adapter │   │
│                                  │ (OpenAI / HF)    │   │
│                                  └────────┬─────────┘   │
│                                           │              │
│                                           ▼              │
│                                  ┌──────────────────┐   │
│                                  │  External API    │   │
│                                  │  (OpenAI, etc)   │   │
│                                  └────────┬─────────┘   │
│                                           │              │
│                                           ▼              │
│                                  ┌──────────────────┐   │
│                                  │   Normalize &    │   │
│                                  │   Log Response   │   │
│                                  └──────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

---

## API Reference

### Execute Operation

**POST** `/api/integrations/execute`

Execute an LLM operation through a provider.

**Headers:**
- `Authorization: Bearer <jwt-token>` (required)
- `Content-Type: application/json`

**Request Body:**
```json
{
  "provider": "openai",
  "operation": "chat.completions",
  "params": {
    "model": "gpt-4o-mini",
    "messages": [
      { "role": "system", "content": "You are a helpful assistant." },
      { "role": "user", "content": "Hello!" }
    ],
    "temperature": 0.7,
    "maxTokens": 1024
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "content": "Hello! How can I assist you today?",
    "usage": {
      "promptTokens": 25,
      "completionTokens": 9,
      "totalTokens": 34
    },
    "finishReason": "stop",
    "metadata": {}
  },
  "requestId": "req_dd5f143a-49d",
  "durationMs": 523
}
```

**Error Responses:**
- `400` - Invalid request or missing credentials
- `401` - Authentication required
- `502` - Provider error

---

### List Providers

**GET** `/api/integrations/providers`

List all available providers and their capabilities.

**Response:**
```json
{
  "providers": [
    {
      "name": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "defaultModel": "gpt-4o-mini",
      "supportedOperations": ["chat.completions", "embeddings"]
    },
    {
      "name": "huggingface",
      "baseUrl": "https://router.huggingface.co",
      "defaultModel": "meta-llama/Llama-3.2-3B-Instruct",
      "supportedOperations": ["chat.completions", "text.generation", "embeddings"]
    }
  ]
}
```

---

### Get Provider Details

**GET** `/api/integrations/providers/:provider`

Get configuration details for a specific provider.

**Response:**
```json
{
  "provider": "openai",
  "baseUrl": "https://api.openai.com/v1",
  "authType": "bearer",
  "endpoints": {
    "chat.completions": "/chat/completions",
    "embeddings": "/embeddings"
  },
  "rateLimits": {
    "requestsPerMinute": 60,
    "tokensPerMinute": 40000
  },
  "defaultModel": "gpt-4o-mini",
  "supportedOperations": ["chat.completions", "embeddings"]
}
```

---

### Get Provider Models

**GET** `/api/integrations/providers/:provider/models`

List available models for a provider.

**Response:**
```json
{
  "models": [
    {
      "modelId": "gpt-4o",
      "displayName": "GPT-4o",
      "contextWindow": 128000,
      "maxOutputTokens": 4096
    },
    {
      "modelId": "gpt-4o-mini",
      "displayName": "GPT-4o Mini",
      "contextWindow": 128000,
      "maxOutputTokens": 4096
    }
  ]
}
```

---

### Service Status

**GET** `/api/integrations/status`

Get service health and provider status.

**Response:**
```json
{
  "status": "healthy",
  "providers": [
    { "name": "openai", "configured": true },
    { "name": "huggingface", "configured": true }
  ]
}
```

---

## Providers

### OpenAI

Supports chat completions and embeddings.

**Configuration:**
```json
{
  "provider": "openai",
  "operation": "chat.completions",
  "params": {
    "model": "gpt-4o-mini",
    "messages": [...],
    "temperature": 0.7,
    "maxTokens": 1024
  }
}
```

**Embeddings:**
```json
{
  "provider": "openai",
  "operation": "embeddings",
  "params": {
    "model": "text-embedding-3-small",
    "input": "Text to embed"
  }
}
```

### HuggingFace

Supports chat completions, text generation, and embeddings via Inference API.

**Configuration:**
```json
{
  "provider": "huggingface",
  "operation": "chat.completions",
  "params": {
    "model": "meta-llama/Llama-3.2-3B-Instruct",
    "messages": [...],
    "temperature": 0.7,
    "maxTokens": 512
  }
}
```

---

## Credential Management

Credentials are stored in the Identity service and fetched on-demand.

### Storing a Credential

Credentials are stored via Identity service:

```bash
curl -X POST http://localhost:5001/api/credentials \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "name": "My OpenAI Key",
    "apiKey": "sk-..."
  }'
```

### How Credentials Flow

1. User stores API key in Identity (encrypted)
2. User makes request to Integrations with JWT
3. Integrations validates JWT via Identity
4. Integrations fetches credential from Identity (service-to-service)
5. Integrations uses credential for external API call
6. Credential is never stored in Integrations

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 5007 | HTTP server port |
| `IDENTITY_SERVICE_URL` | http://localhost:5001 | Identity service endpoint |
| `CATALOG_SERVICE_URL` | http://localhost:5003 | Catalog service endpoint |
| `DATABASE_URL` | (memory) | PostgreSQL connection string |
| `NETWORK_SERVICE_URL` | http://localhost:5054 | Network mesh endpoint |

### Provider Configuration

Provider configurations are loaded from Catalog resources:

- `integrations/ai/openai/config`
- `integrations/ai/huggingface/config`
- `integrations/ai/anthropic/config`

---

## LLM Integration Guide

### For Runtime Components

Use the built-in `integrations/LLMInvoke` component in your graphs:

```yaml
components:
  llm:
    type: integrations/LLMInvoke
    config:
      provider: openai
      model: gpt-4o-mini
      systemPrompt: "You are a helpful assistant."
      temperature: 0.7
```

### For Assistants

The Assistants service includes an Integrations client:

```typescript
import { invokeLLM, isIntegrationsAvailable } from './integrations-client';

// Check if Integrations is available
if (await isIntegrationsAvailable()) {
  const response = await invokeLLM(userToken, {
    provider: 'openai',
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Hello!' }]
  });
}
```

### Direct API Calls

For custom integrations:

```bash
curl -X POST http://localhost:5007/api/integrations/execute \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "operation": "chat.completions",
    "params": {
      "model": "gpt-4o-mini",
      "messages": [{"role": "user", "content": "Hello!"}]
    }
  }'
```

---

## Development

### Running Tests

```bash
npm test
```

### Building

```bash
npm run build
```

### Type Checking

```bash
npm run check
```

---

## Related Documentation

- [INTENT.md](./INTENT.md) - Architectural intent and design decisions
- [OpenAPI Spec](./docs/openapi.json) - Complete API specification
- [LLM Guide](./docs/llms.txt) - Quick reference for AI integration
