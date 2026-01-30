/**
 * Anthropic Provider
 *
 * Provider adapter for Anthropic's Claude models via the Messages API.
 * Supports chat completions with tool use and extended thinking.
 */

import type { NormalizedLLMResponse, NormalizedEmbeddingResponse } from "@shared/schema.js";
import type { ProviderAdapter, ExecuteOptions, ModelInfo } from "./base.js";
import { normalizeFinishReason } from "./base.js";

const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

interface AnthropicContentBlock {
  type: "text" | "tool_use" | "tool_result" | "image";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  source?: {
    type: string;
    media_type?: string;
    data?: string;
    url?: string;
  };
}

interface AnthropicMessagesResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export class AnthropicProvider implements ProviderAdapter {
  name = "anthropic";
  supportedOperations = ["chat.completions", "messages"];

  async execute(options: ExecuteOptions): Promise<NormalizedLLMResponse> {
    const { operation, model, params, apiKey, timeout } = options;

    if (operation !== "chat.completions" && operation !== "messages") {
      throw new Error(`Anthropic provider does not support operation: ${operation}`);
    }

    const url = `${ANTHROPIC_BASE_URL}/messages`;
    const body = this.buildMessagesRequestBody(model, params);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
      signal: timeout ? AbortSignal.timeout(timeout) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(`Anthropic API error: ${error.error?.message || response.statusText}`);
    }

    const raw = await response.json() as AnthropicMessagesResponse;
    return this.normalizeMessagesResponse(raw);
  }

  async embed(_options: ExecuteOptions): Promise<NormalizedEmbeddingResponse> {
    // Anthropic doesn't have a native embeddings API
    // Could proxy to Voyage AI (Anthropic's recommended embedding partner)
    throw new Error("Anthropic does not provide native embeddings. Consider using Voyage AI.");
  }

  validateParams(operation: string, params: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (operation === "chat.completions" || operation === "messages") {
      if (!params.messages && !params.prompt) {
        errors.push("Either messages or prompt is required");
      }
    }

    return { valid: errors.length === 0, errors };
  }

  estimateTokens(text: string): number {
    // Claude uses a similar tokenization to GPT models
    // Rough estimate: ~4 chars per token for English
    return Math.ceil(text.length / 4);
  }

  /**
   * List available Claude models
   * Anthropic doesn't have a models list API, so this returns a curated list
   */
  async listModels(_apiKey?: string): Promise<ModelInfo[]> {
    return [
      // Claude 4 series (Latest)
      {
        id: 'claude-opus-4-20250514',
        name: 'Claude Opus 4',
        description: 'Most powerful Claude model with state-of-the-art coding and reasoning',
        contextWindow: 200000,
        maxOutputTokens: 32000,
        capabilities: ['chat', 'vision', 'function_calling', 'reasoning'],
        inputPricing: 15.00,
        outputPricing: 75.00,
      },
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        description: 'Balanced performance with improved reasoning and tool use',
        contextWindow: 200000,
        maxOutputTokens: 64000,
        capabilities: ['chat', 'vision', 'function_calling', 'reasoning'],
        inputPricing: 3.00,
        outputPricing: 15.00,
      },

      // Claude 3.5 series
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        description: 'Excellent for complex tasks and coding',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        capabilities: ['chat', 'vision', 'function_calling'],
        inputPricing: 3.00,
        outputPricing: 15.00,
      },
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        description: 'Fast and efficient for everyday tasks',
        contextWindow: 200000,
        maxOutputTokens: 8192,
        capabilities: ['chat', 'vision', 'function_calling'],
        inputPricing: 0.80,
        outputPricing: 4.00,
      },

      // Claude 3 series
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        description: 'Previous generation flagship model',
        contextWindow: 200000,
        maxOutputTokens: 4096,
        capabilities: ['chat', 'vision', 'function_calling'],
        inputPricing: 15.00,
        outputPricing: 75.00,
      },
      {
        id: 'claude-3-sonnet-20240229',
        name: 'Claude 3 Sonnet',
        description: 'Previous generation balanced model',
        contextWindow: 200000,
        maxOutputTokens: 4096,
        capabilities: ['chat', 'vision', 'function_calling'],
        inputPricing: 3.00,
        outputPricing: 15.00,
        deprecated: true,
      },
      {
        id: 'claude-3-haiku-20240307',
        name: 'Claude 3 Haiku',
        description: 'Previous generation fast model',
        contextWindow: 200000,
        maxOutputTokens: 4096,
        capabilities: ['chat', 'vision', 'function_calling'],
        inputPricing: 0.25,
        outputPricing: 1.25,
        deprecated: true,
      },
    ];
  }

  private buildMessagesRequestBody(model: string, params: Record<string, unknown>): Record<string, unknown> {
    // Convert messages to Anthropic format
    const messages = this.convertMessages(params.messages as Array<{ role: string; content: string }> || []);

    // If only prompt provided, convert to messages format
    if (!messages.length && params.prompt) {
      messages.push({ role: "user", content: params.prompt as string });
    }

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: params.maxTokens ?? params.max_tokens ?? 1024,
    };

    // Add system prompt if provided
    if (params.system || params.systemPrompt) {
      body.system = params.system || params.systemPrompt;
    }

    // Add temperature if provided
    if (params.temperature !== undefined) {
      body.temperature = params.temperature;
    }

    // Add tools if provided (for function calling)
    if (params.tools) {
      body.tools = this.convertTools(params.tools as Array<Record<string, unknown>>);
    }

    // Add stop sequences if provided
    if (params.stopSequences || params.stop) {
      body.stop_sequences = params.stopSequences || params.stop;
    }

    // Add top_p if provided
    if (params.topP !== undefined || params.top_p !== undefined) {
      body.top_p = params.topP ?? params.top_p;
    }

    // Add top_k if provided (Anthropic-specific)
    if (params.topK !== undefined || params.top_k !== undefined) {
      body.top_k = params.topK ?? params.top_k;
    }

    return body;
  }

  private convertMessages(
    messages: Array<{ role: string; content: string | unknown[] }>
  ): AnthropicMessage[] {
    // Filter out system messages (handled separately in Anthropic API)
    const filtered = messages.filter(m => m.role !== "system");

    return filtered.map(msg => {
      // Handle complex content (vision, etc.)
      if (Array.isArray(msg.content)) {
        return {
          role: msg.role as "user" | "assistant",
          content: msg.content.map(item => {
            if (typeof item === "string") {
              return { type: "text" as const, text: item };
            }
            // Handle image content for vision
            if (typeof item === "object" && item !== null) {
              const obj = item as Record<string, unknown>;
              if (obj.type === "image_url") {
                const url = (obj.image_url as { url: string })?.url;
                if (url?.startsWith("data:")) {
                  // Base64 image
                  const [header, data] = url.split(",");
                  const mediaType = header.match(/data:([^;]+)/)?.[1] || "image/jpeg";
                  return {
                    type: "image" as const,
                    source: {
                      type: "base64",
                      media_type: mediaType,
                      data,
                    },
                  };
                }
                // URL image
                return {
                  type: "image" as const,
                  source: {
                    type: "url",
                    url,
                  },
                };
              }
              if (obj.type === "text") {
                return { type: "text" as const, text: obj.text as string };
              }
            }
            return { type: "text" as const, text: String(item) };
          }),
        };
      }

      return {
        role: msg.role as "user" | "assistant",
        content: msg.content as string,
      };
    });
  }

  private convertTools(tools: Array<Record<string, unknown>>): AnthropicTool[] {
    // Convert OpenAI-style tools to Anthropic format
    return tools.map(tool => {
      // Handle OpenAI function calling format
      if (tool.type === "function" && tool.function) {
        const fn = tool.function as { name: string; description?: string; parameters?: Record<string, unknown> };
        return {
          name: fn.name,
          description: fn.description || "",
          input_schema: fn.parameters || { type: "object", properties: {} },
        };
      }

      // Direct Anthropic format
      return {
        name: tool.name as string,
        description: (tool.description as string) || "",
        input_schema: (tool.input_schema as Record<string, unknown>) || { type: "object", properties: {} },
      };
    });
  }

  private normalizeMessagesResponse(raw: AnthropicMessagesResponse): NormalizedLLMResponse {
    // Extract text content
    const textContent = raw.content
      .filter(block => block.type === "text")
      .map(block => block.text || "")
      .join("\n");

    // Extract tool calls
    const toolCalls = raw.content
      .filter(block => block.type === "tool_use")
      .map(block => ({
        id: block.id || "",
        type: "function",
        function: {
          name: block.name || "",
          arguments: JSON.stringify(block.input || {}),
        },
      }));

    return {
      provider: "anthropic",
      model: raw.model,
      content: textContent,
      usage: {
        promptTokens: raw.usage.input_tokens,
        completionTokens: raw.usage.output_tokens,
        totalTokens: raw.usage.input_tokens + raw.usage.output_tokens,
      },
      finishReason: this.normalizeStopReason(raw.stop_reason),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      metadata: {
        id: raw.id,
        stopSequence: raw.stop_sequence,
      },
    };
  }

  private normalizeStopReason(
    stopReason: string | null
  ): "stop" | "length" | "content_filter" | "tool_calls" | "error" | "incomplete" {
    if (!stopReason) return "stop";

    switch (stopReason) {
      case "end_turn":
      case "stop_sequence":
        return "stop";
      case "max_tokens":
        return "length";
      case "tool_use":
        return "tool_calls";
      default:
        return normalizeFinishReason(stopReason);
    }
  }
}

export const anthropicProvider = new AnthropicProvider();
