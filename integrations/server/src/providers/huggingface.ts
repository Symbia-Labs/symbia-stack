import type { NormalizedLLMResponse, NormalizedEmbeddingResponse } from "@shared/schema.js";
import type { ProviderAdapter, ExecuteOptions, ModelInfo } from "./base.js";
import { normalizeFinishReason } from "./base.js";

// HuggingFace now uses OpenAI-compatible router API
const HUGGINGFACE_ROUTER_URL = "https://router.huggingface.co";

interface HuggingFaceChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface HuggingFaceEmbeddingResponse {
  embeddings?: number[][];
  data?: Array<{
    embedding: number[];
    index: number;
  }>;
}

export class HuggingFaceProvider implements ProviderAdapter {
  name = "huggingface";
  supportedOperations = ["text.generation", "chat.completions", "embeddings"];

  async execute(options: ExecuteOptions): Promise<NormalizedLLMResponse> {
    const { operation, model, params, apiKey, timeout } = options;

    // Use OpenAI-compatible chat completions endpoint
    const url = `${HUGGINGFACE_ROUTER_URL}/v1/chat/completions`;

    const body = this.buildChatBody(model, params);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: timeout ? AbortSignal.timeout(timeout) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: { message?: string } | string };
      const errorMsg = typeof error.error === "object" ? error.error?.message : error.error;
      throw new Error(`HuggingFace API error: ${errorMsg || response.statusText}`);
    }

    const raw = await response.json() as HuggingFaceChatResponse;
    return this.normalizeChatResponse(raw);
  }

  async embed(options: ExecuteOptions): Promise<NormalizedEmbeddingResponse> {
    const { model, params, apiKey, timeout } = options;

    // Use OpenAI-compatible embeddings endpoint
    const url = `${HUGGINGFACE_ROUTER_URL}/v1/embeddings`;
    const body = {
      model,
      input: params.input || params.text,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: timeout ? AbortSignal.timeout(timeout) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: { message?: string } | string };
      const errorMsg = typeof error.error === "object" ? error.error?.message : error.error;
      throw new Error(`HuggingFace API error: ${errorMsg || response.statusText}`);
    }

    const raw = await response.json() as HuggingFaceEmbeddingResponse;
    return this.normalizeEmbeddingResponse(raw, model);
  }

  validateParams(operation: string, params: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (operation === "text.generation" || operation === "chat.completions") {
      if (!params.messages && !params.prompt) {
        errors.push("Either messages or prompt is required");
      }
    } else if (operation === "embeddings") {
      if (!params.input && !params.text) {
        errors.push("Either input or text is required for embeddings");
      }
    }

    return { valid: errors.length === 0, errors };
  }

  estimateTokens(text: string): number {
    // Rough estimate: ~4 chars per token
    return Math.ceil(text.length / 4);
  }

  /**
   * List popular models available via HuggingFace Inference API
   * This is a curated list of well-supported models
   */
  async listModels(_apiKey?: string): Promise<ModelInfo[]> {
    return [
      // Meta Llama 3.x series
      {
        id: 'meta-llama/Llama-3.3-70B-Instruct',
        name: 'Llama 3.3 70B Instruct',
        description: 'Latest Llama with improved reasoning and multilingual',
        contextWindow: 128000,
        maxOutputTokens: 8192,
        capabilities: ['chat', 'function_calling'],
      },
      {
        id: 'meta-llama/Llama-3.2-3B-Instruct',
        name: 'Llama 3.2 3B Instruct',
        description: 'Efficient small Llama for edge deployment',
        contextWindow: 128000,
        maxOutputTokens: 8192,
        capabilities: ['chat'],
      },
      {
        id: 'meta-llama/Llama-3.2-1B-Instruct',
        name: 'Llama 3.2 1B Instruct',
        description: 'Smallest Llama for low-resource environments',
        contextWindow: 128000,
        maxOutputTokens: 8192,
        capabilities: ['chat'],
      },
      {
        id: 'meta-llama/Llama-3.1-8B-Instruct',
        name: 'Llama 3.1 8B Instruct',
        description: 'Versatile medium-size Llama model',
        contextWindow: 128000,
        maxOutputTokens: 8192,
        capabilities: ['chat', 'function_calling'],
      },
      {
        id: 'meta-llama/Llama-3.1-70B-Instruct',
        name: 'Llama 3.1 70B Instruct',
        description: 'Powerful large Llama model',
        contextWindow: 128000,
        maxOutputTokens: 8192,
        capabilities: ['chat', 'function_calling'],
      },

      // Mistral models on HuggingFace
      {
        id: 'mistralai/Mistral-7B-Instruct-v0.3',
        name: 'Mistral 7B Instruct v0.3',
        description: 'Efficient open-weight Mistral model',
        contextWindow: 32768,
        maxOutputTokens: 8192,
        capabilities: ['chat', 'function_calling'],
      },
      {
        id: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
        name: 'Mixtral 8x7B Instruct',
        description: 'Mixture of experts model',
        contextWindow: 32768,
        maxOutputTokens: 8192,
        capabilities: ['chat'],
      },
      {
        id: 'mistralai/Mistral-Nemo-Instruct-2407',
        name: 'Mistral Nemo 12B',
        description: 'Compact yet capable Mistral model',
        contextWindow: 128000,
        maxOutputTokens: 8192,
        capabilities: ['chat', 'function_calling'],
      },

      // Microsoft Phi series
      {
        id: 'microsoft/Phi-3.5-mini-instruct',
        name: 'Phi 3.5 Mini',
        description: 'Small but powerful reasoning model',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        capabilities: ['chat'],
      },
      {
        id: 'microsoft/Phi-3-mini-4k-instruct',
        name: 'Phi 3 Mini 4K',
        description: 'Efficient Microsoft model',
        contextWindow: 4096,
        maxOutputTokens: 4096,
        capabilities: ['chat'],
      },
      {
        id: 'microsoft/Phi-3-medium-128k-instruct',
        name: 'Phi 3 Medium 128K',
        description: 'Medium-size with long context',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        capabilities: ['chat'],
      },

      // Qwen models
      {
        id: 'Qwen/Qwen2.5-72B-Instruct',
        name: 'Qwen 2.5 72B Instruct',
        description: 'Powerful multilingual model from Alibaba',
        contextWindow: 131072,
        maxOutputTokens: 8192,
        capabilities: ['chat', 'function_calling'],
      },
      {
        id: 'Qwen/Qwen2.5-7B-Instruct',
        name: 'Qwen 2.5 7B Instruct',
        description: 'Efficient Qwen model',
        contextWindow: 131072,
        maxOutputTokens: 8192,
        capabilities: ['chat', 'function_calling'],
      },
      {
        id: 'Qwen/Qwen2.5-Coder-32B-Instruct',
        name: 'Qwen 2.5 Coder 32B',
        description: 'Specialized for code generation',
        contextWindow: 131072,
        maxOutputTokens: 8192,
        capabilities: ['chat', 'function_calling'],
      },

      // DeepSeek
      {
        id: 'deepseek-ai/DeepSeek-V3',
        name: 'DeepSeek V3',
        description: 'State-of-the-art open model from DeepSeek',
        contextWindow: 128000,
        maxOutputTokens: 8192,
        capabilities: ['chat', 'function_calling', 'reasoning'],
      },
      {
        id: 'deepseek-ai/DeepSeek-Coder-V2-Instruct',
        name: 'DeepSeek Coder V2',
        description: 'Advanced code generation model',
        contextWindow: 128000,
        maxOutputTokens: 8192,
        capabilities: ['chat'],
      },

      // Embedding models
      {
        id: 'sentence-transformers/all-MiniLM-L6-v2',
        name: 'MiniLM L6 v2',
        description: 'Fast lightweight embeddings, 384 dimensions',
        contextWindow: 512,
        capabilities: ['embedding'],
      },
      {
        id: 'BAAI/bge-large-en-v1.5',
        name: 'BGE Large English v1.5',
        description: 'High-quality English embeddings, 1024 dimensions',
        contextWindow: 512,
        capabilities: ['embedding'],
      },
      {
        id: 'BAAI/bge-m3',
        name: 'BGE M3',
        description: 'Multilingual, multi-granularity embeddings',
        contextWindow: 8192,
        capabilities: ['embedding'],
      },
      {
        id: 'intfloat/multilingual-e5-large-instruct',
        name: 'E5 Large Multilingual',
        description: 'Instruction-tuned multilingual embeddings',
        contextWindow: 512,
        capabilities: ['embedding'],
      },
    ];
  }

  private buildChatBody(model: string, params: Record<string, unknown>): Record<string, unknown> {
    // Build OpenAI-compatible request body
    const messages = params.messages as Array<{ role: string; content: string }> | undefined;

    // If only prompt provided, convert to messages format
    const finalMessages = messages || [{ role: "user", content: params.prompt as string }];

    return {
      model,
      messages: finalMessages,
      max_tokens: params.maxTokens ?? 256,
      temperature: params.temperature ?? 0.7,
    };
  }

  private normalizeChatResponse(raw: HuggingFaceChatResponse): NormalizedLLMResponse {
    const choice = raw.choices?.[0];

    return {
      provider: "huggingface",
      model: raw.model,
      content: choice?.message?.content || "",
      usage: {
        promptTokens: raw.usage?.prompt_tokens || 0,
        completionTokens: raw.usage?.completion_tokens || 0,
        totalTokens: raw.usage?.total_tokens || 0,
      },
      finishReason: normalizeFinishReason(choice?.finish_reason),
      metadata: {
        id: raw.id,
        created: raw.created,
      },
    };
  }

  private normalizeEmbeddingResponse(
    raw: HuggingFaceEmbeddingResponse,
    model: string
  ): NormalizedEmbeddingResponse {
    let embeddings: number[][];

    if (raw.data && Array.isArray(raw.data)) {
      // OpenAI-compatible format
      embeddings = raw.data.map((d) => d.embedding);
    } else if (raw.embeddings) {
      embeddings = raw.embeddings;
    } else {
      embeddings = [];
    }

    return {
      provider: "huggingface",
      model,
      embeddings,
      usage: {
        promptTokens: 0,
        totalTokens: 0,
      },
      metadata: {},
    };
  }
}

export const huggingfaceProvider = new HuggingFaceProvider();
