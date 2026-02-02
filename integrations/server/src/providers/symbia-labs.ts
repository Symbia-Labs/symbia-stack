/**
 * Symbia Labs Provider
 *
 * Proxies requests to the local symbia-models service for local LLM inference.
 * Uses node-llama-cpp under the hood for GGUF model execution.
 */

import type { NormalizedLLMResponse, NormalizedEmbeddingResponse } from "@shared/schema.js";
import type { ProviderAdapter, ExecuteOptions, ModelInfo } from "./base.js";
import { normalizeFinishReason } from "./base.js";

// Models service URL - internal docker network or localhost
const MODELS_SERVICE_URL = process.env.MODELS_SERVICE_URL || "http://localhost:5008";

interface LocalChatResponse {
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
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface LocalModel {
  id: string;
  name: string;
  filename: string;
  contextLength: number;
  capabilities: string[];
  status: string;
  loaded: boolean;
  memoryUsageMB: number;
}

export class SymbiaLabsProvider implements ProviderAdapter {
  name = "symbia-labs";
  supportedOperations = ["chat.completions", "completions"];

  async execute(options: ExecuteOptions): Promise<NormalizedLLMResponse> {
    const { operation, model, params, timeout } = options;

    if (operation !== "chat.completions" && operation !== "completions") {
      throw new Error(`symbia-labs provider does not support operation: ${operation}`);
    }

    const url = `${MODELS_SERVICE_URL}/v1/chat/completions`;
    const body = this.buildRequestBody(model, params);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Internal service-to-service auth
        "X-Service-Auth": "internal",
      },
      body: JSON.stringify(body),
      signal: timeout ? AbortSignal.timeout(timeout) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(`symbia-labs API error: ${error.error || response.statusText}`);
    }

    const raw = await response.json() as LocalChatResponse;
    return this.normalizeResponse(raw);
  }

  async embed(options: ExecuteOptions): Promise<NormalizedEmbeddingResponse> {
    const { model, params, timeout } = options;

    const url = `${MODELS_SERVICE_URL}/v1/embeddings`;
    const body = {
      model,
      input: params.input || params.text,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Auth": "internal",
      },
      body: JSON.stringify(body),
      signal: timeout ? AbortSignal.timeout(timeout) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(`symbia-labs embed error: ${error.error || response.statusText}`);
    }

    const raw = await response.json() as {
      model: string;
      data: Array<{ embedding: number[] }>;
      usage: { prompt_tokens: number; total_tokens: number };
    };

    return {
      provider: "symbia-labs",
      model: raw.model,
      embeddings: raw.data.map(d => d.embedding),
      usage: {
        promptTokens: raw.usage.prompt_tokens,
        totalTokens: raw.usage.total_tokens,
      },
      metadata: {},
    };
  }

  validateParams(operation: string, params: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (operation === "chat.completions" || operation === "completions") {
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
   * List available models from the models service
   */
  async listModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(`${MODELS_SERVICE_URL}/v1/models`, {
        headers: {
          "X-Service-Auth": "internal",
        },
      });

      if (!response.ok) {
        console.warn("[symbia-labs] Failed to fetch models from service");
        return [];
      }

      const data = await response.json() as { data: LocalModel[] };

      return data.data.map(m => ({
        id: m.id,
        name: m.name,
        description: `Local GGUF model (${m.memoryUsageMB}MB)`,
        contextWindow: m.contextLength,
        capabilities: m.capabilities.map(c => {
          if (c === "chat") return "chat" as const;
          if (c === "completion") return "completion" as const;
          if (c === "embedding") return "embedding" as const;
          return "chat" as const;
        }),
        // Local models have no API pricing
        inputPricing: 0,
        outputPricing: 0,
      }));
    } catch (error) {
      console.warn("[symbia-labs] Error fetching models:", error);
      return [];
    }
  }

  private buildRequestBody(model: string, params: Record<string, unknown>): Record<string, unknown> {
    const messages = params.messages || [{ role: "user", content: params.prompt }];

    return {
      model,
      messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 1024,
      stream: false, // Non-streaming for now
    };
  }

  private normalizeResponse(raw: LocalChatResponse): NormalizedLLMResponse {
    const choice = raw.choices?.[0];

    return {
      provider: "symbia-labs",
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
        local: true,
      },
    };
  }
}

export const symbiaLabsProvider = new SymbiaLabsProvider();
