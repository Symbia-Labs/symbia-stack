# Symbia Models Service - Testing Report

**Date**: February 2, 2026
**Version**: Initial Implementation
**Tested With**: Llama 3.2 1B Instruct Q4_K_M (770MB GGUF)

---

## Executive Summary

The `symbia-models` service provides local LLM inference using node-llama-cpp. Testing covered standalone operation, integration with the integrations service, catalog registration, and streaming responses.

**Overall Status**: ✅ Functional with minor issues resolved

---

## Test Results

### 1. Models Service Standalone

| Test Case | Status | Notes |
|-----------|--------|-------|
| Health check (`/health/live`) | ✅ Pass | Returns `{"status":"ok"}` |
| Model scanning on startup | ✅ Pass | Automatically detects GGUF files in `/data/models` |
| List models (`GET /v1/models`) | ✅ Pass | Returns OpenAI-compatible model list |
| Chat completion (non-streaming) | ✅ Pass | Returns proper `chat.completion` response |
| Streaming response (SSE) | ✅ Pass | Returns `chat.completion.chunk` events |
| Multi-turn conversation | ✅ Pass | Context handled correctly |
| Model lazy loading | ✅ Pass | Model loads on first request |
| Token usage reporting | ✅ Pass | Returns prompt/completion token counts |

#### Sample Chat Completion Response
```json
{
  "id": "chatcmpl-1770048489454",
  "object": "chat.completion",
  "created": 1770048489,
  "model": "llama-3-2-1b-instruct-q4-k-m",
  "choices": [{
    "index": 0,
    "message": { "role": "assistant", "content": "2 + 2 = 4." },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 16,
    "completion_tokens": 9,
    "total_tokens": 25
  }
}
```

### 2. Integration via Integrations Service

| Test Case | Status | Notes |
|-----------|--------|-------|
| Provider registered | ✅ Pass | `symbia-labs` shows in `/api/integrations/status` |
| Execute via integrations | ✅ Pass | Proxies to models service correctly |
| No API key required | ✅ Pass | Local provider works without credentials |
| Response normalization | ✅ Pass | Returns standard `NormalizedLLMResponse` |

#### Sample Integration Execute Response
```json
{
  "success": true,
  "data": {
    "provider": "symbia-labs",
    "model": "llama-3-2-1b-instruct-q4-k-m",
    "content": "Hello in Spanish is \"Hola\".",
    "usage": { "promptTokens": 5, "completionTokens": 8, "totalTokens": 13 },
    "finishReason": "stop",
    "metadata": { "id": "chatcmpl-...", "local": true }
  }
}
```

### 3. Catalog Registration

| Test Case | Status | Notes |
|-----------|--------|-------|
| Model sync on startup | ✅ Pass | Models registered in catalog automatically |
| Public visibility | ✅ Pass | Models queryable without auth |
| Status set to published | ✅ Pass | Not stuck in draft state |
| Metadata correct | ✅ Pass | Includes capabilities, runtime config |
| Resource key format | ✅ Pass | `integrations/symbia-labs/models/{modelId}` |

#### Registered Model Resource
```json
{
  "key": "integrations/symbia-labs/models/llama-3-2-1b-instruct-q4-k-m",
  "status": "published",
  "type": "integration",
  "accessPolicy": { "visibility": "public" },
  "metadata": {
    "provider": "symbia-labs",
    "capabilities": ["chat", "completion"],
    "contextWindow": 4096,
    "memoryUsageMB": 770,
    "runtime": { "framework": "node-llama-cpp" }
  }
}
```

### 4. Streaming Responses

| Test Case | Status | Notes |
|-----------|--------|-------|
| SSE format | ✅ Pass | Proper `data: {...}` format |
| Chunk structure | ✅ Pass | Contains `delta.content` |
| End marker | ✅ Pass | Ends with `[DONE]` |

---

## Bugs Fixed During Testing

### 1. "No sequences left" Error (Fixed)
- **Issue**: node-llama-cpp context only had 1 sequence, second request failed
- **Root Cause**: Context created without `sequences` option, session used sequence at load time
- **Fix**: Configure context with `sequences: 4`, dispose sequence after each request
- **File**: [models/server/src/llama/engine.ts:199](models/server/src/llama/engine.ts#L199)

### 2. Integrations Required API Key (Fixed)
- **Issue**: `/api/integrations/execute` rejected symbia-labs without credentials
- **Root Cause**: All providers treated equally, local provider didn't need key
- **Fix**: Skip credential check for `provider === "symbia-labs"`
- **File**: [integrations/server/src/routes.ts:186-202](integrations/server/src/routes.ts#L186)

### 3. Catalog Registration 403 Error (Fixed)
- **Issue**: Models service couldn't create resources in catalog
- **Root Cause**: Internal service auth (`X-Service-Auth: internal`) not recognized
- **Fix**: Added internal service auth handling to catalog middleware
- **File**: [catalog/server/src/auth.ts:58-75](catalog/server/src/auth.ts#L58)

### 4. Resource Defaults to Draft/Private (Fixed)
- **Issue**: Model registered but not visible to public
- **Root Cause**: `createResourceSchema` didn't include `status`, defaults applied
- **Fix**: Added `status` to schema, explicit `accessPolicy` in model-sync
- **Files**:
  - [catalog/server/src/routes.ts:47](catalog/server/src/routes.ts#L47)
  - [models/server/src/catalog/model-sync.ts:75-90](models/server/src/catalog/model-sync.ts#L75)

---

## Known Gaps / Future Work

### Tier 1: High Priority

| Gap | Impact | Suggested Fix |
|-----|--------|---------------|
| Embeddings not implemented | Can't use local models for vector search | Implement `/v1/embeddings` with supported models |
| No model download API | Must manually download models | Add `POST /api/models/download` from HuggingFace |
| Streaming via integrations | Users can only get non-streaming through integrations | Add streaming support to symbia-labs provider |
| Alpine Docker support | Larger image size (~400MB vs ~150MB) | Wait for llama.cpp musl support or use gcompat |

### Tier 2: Medium Priority

| Gap | Impact | Notes |
|-----|--------|-------|
| GPU acceleration | CPU-only inference is slower | Requires CUDA base image and nvidia runtime |
| Model hot-reload | Must restart to detect new models | Add file watcher or API endpoint |
| Concurrent request limits | Could overload with many parallel requests | Add request queue/semaphore |
| Memory pressure handling | May OOM with large models | Add memory threshold checks |

### Tier 3: Nice to Have

| Gap | Notes |
|-----|-------|
| Model quantization API | Convert models to different quants |
| HuggingFace Inference proxy | Fallback to HF API for unsupported models |
| Fine-tuning integration | AutoTrain API integration |
| Model benchmarking | Automated performance testing |

---

## Configuration Reference

### Environment Variables
```bash
MODELS_PATH=/data/models        # Directory containing GGUF files
MAX_LOADED_MODELS=2             # Maximum models in memory
IDLE_TIMEOUT_MS=300000          # Unload after 5 min idle
DEFAULT_GPU_LAYERS=0            # GPU layers (0 = CPU only)
DEFAULT_THREADS=4               # CPU threads per inference
CATALOG_SERVICE_URL=http://catalog:5003
```

### Docker Volume
```yaml
volumes:
  models_data:
    # Mount for persistent model storage
```

---

## Recommendations

1. **Document supported models**: Create a compatibility list of tested GGUF models
2. **Add monitoring**: Prometheus metrics for inference latency, memory usage
3. **Implement rate limiting**: Prevent resource exhaustion from rapid requests
4. **Add admin endpoints**: Manual model load/unload for ops team
5. **Consider GPU support**: Significant performance improvement for larger models

---

## Conclusion

The symbia-models service is functional and integrates well with the Symbia stack. All core use cases work:
- Users can run local LLM inference
- The integrations service can route to symbia-labs provider
- Models are discoverable via the catalog

The service is ready for development use. For production, GPU support and better resource management would be recommended.
