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
  // image.description was already possible here and nobody could ask for it.
  // Every Claude model below declares `vision`, and convertMessages has
  // translated OpenAI-style image_url parts — including base64 data URIs —
  // into Anthropic image blocks the whole time. The capability existed; the
  // operation name to reach it did not.
  supportedOperations = ["chat.completions", "messages", "image.description"];

  async execute(options: ExecuteOptions): Promise<NormalizedLLMResponse> {
    const { operation, model, params, apiKey, timeout } = options;

    if (
      operation !== "chat.completions" &&
      operation !== "messages" &&
      operation !== "image.description"
    ) {
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
    } else if (operation === "image.description") {
      // The point of a separate operation: reject a vision request that
      // carries no image, rather than returning a confident description of a
      // picture the model never received. chat.completions cannot make this
      // check, because a text-only message is legitimate there.
      const messages = params.messages as
        | Array<{ role: string; content: unknown }>
        | undefined;
      const hasImage = messages?.some(
        (m) =>
          Array.isArray(m.content) &&
          (m.content as Array<{ type?: string }>).some(
            (p) => p?.type === "image_url" || p?.type === "image"
          )
      );
      if (!messages) errors.push("messages is required for image.description");
      else if (!hasImage) {
        errors.push(
          "image.description requires a message containing an image part; none was present"
        );
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
    // ORDER IS LOAD-BEARING. Anything selecting a model automatically takes
    // the first entry, so a dead id at the top breaks every default caller.
    // That is not hypothetical: the spyglass drove itself successfully all the
    // way to the gateway and got a 502 because the first id here was rejected
    // by the API. The list is now ordered by what has been MEASURED to answer,
    // 7 Aug 2026, through /api/integrations/execute with a real image:
    //
    //   claude-sonnet-5             OK — "**Checkerboard** pattern"
    //   claude-opus-5               OK — returned empty at maxTokens 30
    //   claude-haiku-4-5-20251001   OK — "Checkerboard"
    //   claude-opus-4-20250514      502 — "Anthropic API error: model:
    //                                     claude-opus-4-20250514"
    //
    // The claude-3-* entries below are NOT marked deprecated, because they
    // were not tested. Absence of a test is not evidence of a failure, and
    // marking them would be inventing a measurement.
    return [
      {
        id: 'claude-sonnet-5',
        name: 'Claude Sonnet 5',
        description: 'Balanced performance with strong vision. Measured working 7 Aug 2026.',
        contextWindow: 200000,
        maxOutputTokens: 64000,
        capabilities: ['chat', 'vision', 'function_calling', 'reasoning'],
        inputPricing: 3.00,
        outputPricing: 15.00,
      },
      {
        id: 'claude-opus-5',
        name: 'Claude Opus 5',
        description: 'Most capable Claude model. Measured reachable 7 Aug 2026.',
        contextWindow: 200000,
        maxOutputTokens: 64000,
        capabilities: ['chat', 'vision', 'function_calling', 'reasoning'],
        inputPricing: 15.00,
        outputPricing: 75.00,
      },
      {
        id: 'claude-haiku-4-5-20251001',
        name: 'Claude Haiku 4.5',
        description: 'Fast and inexpensive. Measured working 7 Aug 2026.',
        contextWindow: 200000,
        maxOutputTokens: 32000,
        capabilities: ['chat', 'vision', 'function_calling'],
        inputPricing: 1.00,
        outputPricing: 5.00,
      },
      {
        id: 'claude-opus-4-20250514',
        name: 'Claude Opus 4',
        description: 'Rejected by the API on 7 Aug 2026 with "model: claude-opus-4-20250514".',
        contextWindow: 200000,
        maxOutputTokens: 32000,
        capabilities: ['chat', 'vision', 'function_calling', 'reasoning'],
        inputPricing: 15.00,
        outputPricing: 75.00,
        deprecated: true,
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
    // content may be a string OR an array of parts. The narrower cast that was
    // here said images were impossible while convertMessages below has always
    // handled them — the same wrong-direction type found in the HuggingFace
    // adapter, in a file nobody re-read after writing the vision support.
    const messages = this.convertMessages(
      (params.messages as Array<{ role: string; content: string | unknown[] }>) || []
    );

    // If only prompt provided, convert to messages format
    if (!messages.length && params.prompt) {
      messages.push({ role: "user", content: params.prompt as string });
    }

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: params.maxTokens ?? params.max_tokens ?? 1024,
    };

    // THE SYSTEM PROMPT.
    //
    // Anthropic takes it as a top-level field, not a message, so
    // convertMessages() drops `role: "system"` — correctly. Nothing put it
    // back. A caller that follows the OpenAI convention and passes the system
    // prompt as messages[0] therefore had it deleted in transit, and the model
    // answered as if it had never been given a role at all.
    //
    // MEASURED 8 Aug 2026, scripts/probe-anthropic-adapter.mts. A system
    // message carrying a secret code, asked for in the user turn:
    //   in messages[]          -> "I don't have a secret code."
    //   as params.systemPrompt -> "HALIBUT-7391"
    //
    // Every assistant on this stack sends it in messages[] — see
    // assistants/server/src/integrations-client.ts, which builds params from
    // `messages` alone. So no assistant has ever had a system prompt on the
    // Anthropic path. That is why the coordinator said it had "no access to
    // your screen, dashboard, or any live system data" while sitting on four
    // successful fetches: the instruction forbidding exactly that sentence was
    // removed before the model saw it.
    //
    // I wrote that instruction and checked it by re-reading the prompt I had
    // written. The prompt was never the thing being tested.
    //
    // Explicit params win; messages are the fallback, joined in order because
    // Anthropic accepts one system field and dropping the second would repeat
    // this defect at smaller scale.
    const systemFromMessages = ((params.messages as Array<{ role?: string; content?: unknown }>) || [])
      .filter((m) => m?.role === "system")
      .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
      .filter((s) => s && s.trim() !== "")
      .join("\n\n");

    const system = params.system || params.systemPrompt || (systemFromMessages || undefined);
    if (system) {
      body.system = system;
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
