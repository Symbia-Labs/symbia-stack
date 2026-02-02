# Models Service Quickstart

Run local LLM inference with GGUF models using node-llama-cpp.

## Prerequisites

- Node.js 20+
- A GGUF model file (see [Getting Models](#getting-models))
- ~4-16GB RAM depending on model size

## Getting Models

Download a GGUF model from HuggingFace. Recommended starter models:

```bash
# Create models directory
mkdir -p data/models
cd data/models

# Option 1: Small model (~2GB) - Good for testing
curl -L -o llama-3.2-1b-instruct-q4_k_m.gguf \
  "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf"

# Option 2: Medium model (~4GB) - Better quality
curl -L -o llama-3.2-3b-instruct-q4_k_m.gguf \
  "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf"

# Option 3: Using huggingface-cli (if installed)
pip install huggingface_hub
huggingface-cli download bartowski/Llama-3.2-3B-Instruct-GGUF \
  Llama-3.2-3B-Instruct-Q4_K_M.gguf --local-dir .
```

## Quick Start (Standalone)

Run the models service directly:

```bash
cd models

# Install dependencies (first time only)
npm install

# Set models path and start
MODELS_PATH=./data/models npm run dev
```

The service starts on port 5008. Check health:

```bash
curl http://localhost:5008/health/live
# {"status":"ok"}
```

## Quick Start (Docker)

With the full Symbia stack:

```bash
# Start all services including models
./start.sh

# Or just the models service
docker-compose up models
```

Models are stored in the `models_data` Docker volume. To add models:

```bash
# Copy model into the volume
docker cp ./my-model.gguf symbia-stack-models-1:/data/models/
```

## Basic Usage

### List Available Models

```bash
curl http://localhost:5008/v1/models | jq
```

Response:
```json
{
  "object": "list",
  "data": [
    {
      "id": "llama-3-2-3b-instruct-q4-k-m",
      "object": "model",
      "name": "llama-3.2-3b-instruct-q4_k_m",
      "filename": "llama-3.2-3b-instruct-q4_k_m.gguf",
      "contextLength": 4096,
      "capabilities": ["chat", "completion"],
      "status": "available",
      "loaded": false,
      "memoryUsageMB": 2048
    }
  ]
}
```

### Chat Completion (OpenAI Compatible)

```bash
curl -X POST http://localhost:5008/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3-2-3b-instruct-q4-k-m",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "What is the capital of France?"}
    ],
    "temperature": 0.7,
    "max_tokens": 100
  }' | jq
```

Response:
```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1706900000,
  "model": "llama-3-2-3b-instruct-q4-k-m",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "The capital of France is Paris."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 25,
    "completion_tokens": 8,
    "total_tokens": 33
  }
}
```

### Streaming Response

```bash
curl -X POST http://localhost:5008/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3-2-3b-instruct-q4-k-m",
    "messages": [{"role": "user", "content": "Write a haiku about coding"}],
    "stream": true
  }'
```

Response (Server-Sent Events):
```
data: {"id":"chatcmpl-xyz","choices":[{"delta":{"content":"Lines"}}]}

data: {"id":"chatcmpl-xyz","choices":[{"delta":{"content":" of"}}]}

data: {"id":"chatcmpl-xyz","choices":[{"delta":{"content":" code"}}]}

...

data: [DONE]
```

### Load/Unload Models Manually

```bash
# Load a model into memory (requires auth in production)
curl -X POST http://localhost:5008/api/models/llama-3-2-3b-instruct-q4-k-m/load

# Unload to free memory
curl -X POST http://localhost:5008/api/models/llama-3-2-3b-instruct-q4-k-m/unload
```

## Using via Integrations Service

The recommended way to use local models in Symbia is through the Integrations service with the `symbia-labs` provider:

```bash
curl -X POST http://localhost:5007/api/integrations/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "provider": "symbia-labs",
    "operation": "chat.completions",
    "params": {
      "model": "llama-3-2-3b-instruct-q4-k-m",
      "messages": [
        {"role": "user", "content": "Hello!"}
      ]
    }
  }'
```

This provides:
- Unified interface with other providers (OpenAI, Anthropic, etc.)
- Credential management
- Usage tracking and logging
- Consistent response normalization

## Configuration

Environment variables for the Models service:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 5008 | Service port |
| `MODELS_PATH` | `/data/models` | Directory containing GGUF files |
| `MAX_LOADED_MODELS` | 2 | Maximum models loaded simultaneously |
| `IDLE_TIMEOUT_MS` | 300000 | Unload model after 5 min idle |
| `DEFAULT_GPU_LAYERS` | 0 | GPU layers (0 = CPU only) |
| `DEFAULT_THREADS` | 4 | CPU threads for inference |
| `CATALOG_SERVICE_URL` | `http://localhost:5003` | Catalog for model registration |

Example `.env`:
```bash
MODELS_PATH=./data/models
MAX_LOADED_MODELS=1
IDLE_TIMEOUT_MS=600000
DEFAULT_THREADS=8
```

## Model Naming Convention

Model IDs are derived from filenames:

| Filename | Model ID |
|----------|----------|
| `Llama-3.2-3B-Q4_K_M.gguf` | `llama-3-2-3b-q4-k-m` |
| `mistral-7b-instruct-v0.2.Q4_K_M.gguf` | `mistral-7b-instruct-v0-2-q4-k-m` |
| `phi-2.Q4_K_M.gguf` | `phi-2-q4-k-m` |

Rules:
1. Remove `.gguf` extension
2. Convert to lowercase
3. Replace non-alphanumeric characters with hyphens

## Memory Management

The service uses LRU (Least Recently Used) caching:

1. When you request a model, it loads into memory
2. If `MAX_LOADED_MODELS` is reached, the least recently used model is unloaded
3. After `IDLE_TIMEOUT_MS` of no requests, models auto-unload

Monitor memory usage:
```bash
curl http://localhost:5008/api/stats
```

## Recommended Models

| Model | Size | RAM | Use Case |
|-------|------|-----|----------|
| Llama 3.2 1B Q4 | ~1GB | 2-3GB | Testing, simple tasks |
| Llama 3.2 3B Q4 | ~2GB | 4-6GB | General use, good balance |
| Mistral 7B Q4 | ~4GB | 8-10GB | High quality, coding |
| Llama 3.1 8B Q4 | ~5GB | 10-12GB | Best quality for local |

Quantization guide:
- **Q4_K_M**: Good balance of quality and size (recommended)
- **Q5_K_M**: Better quality, ~25% larger
- **Q8_0**: Near full quality, ~2x size of Q4

## Troubleshooting

### Model not loading
```bash
# Check if file exists and is readable
ls -la data/models/

# Check logs
docker-compose logs models
```

### Out of memory
- Reduce `MAX_LOADED_MODELS` to 1
- Use smaller quantization (Q4 instead of Q8)
- Use smaller model (3B instead of 7B)

### Slow inference
- Increase `DEFAULT_THREADS` (up to your CPU core count)
- Use GPU layers if you have CUDA: `DEFAULT_GPU_LAYERS=35`

### Model ID not found
- Model IDs are normalized from filenames
- Check `GET /v1/models` for exact IDs
- Ensure file has `.gguf` extension

## Next Steps

- [API Documentation](docs/llms-full.txt) - Full endpoint reference
- [OpenAPI Spec](docs/openapi.json) - For API clients
- [HuggingFace GGUF Models](https://huggingface.co/models?library=gguf) - Find more models
