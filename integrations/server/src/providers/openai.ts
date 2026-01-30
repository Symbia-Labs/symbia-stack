/**
 * OpenAI Provider
 *
 * Supports both Chat Completions API and Responses API.
 * - chat.completions: Traditional stateless chat endpoint
 * - responses: Newer stateful API with built-in tools
 */

import type { NormalizedLLMResponse, NormalizedEmbeddingResponse } from "@shared/schema.js";
import type { ProviderAdapter, ExecuteOptions, ModelInfo } from "./base.js";
import { normalizeFinishReason } from "./base.js";

const OPENAI_BASE_URL = "https://api.openai.com/v1";

interface OpenAIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  system_fingerprint?: string;
}

/**
 * OpenAI Responses API response format
 * Updated for GPT-5.2 and o-series models with reasoning support
 */
interface OpenAIResponsesResponse {
  id: string;
  object: "response";
  created_at: number;
  model: string;
  status: "completed" | "failed" | "in_progress" | "incomplete";
  output: Array<{
    type: "message" | "reasoning" | "tool_call" | "preamble";
    id: string;
    role?: "assistant";
    content?: Array<{
      type: "output_text" | "reasoning_text";
      text: string;
    }>;
    // For tool calls
    name?: string;
    arguments?: string;
    // For preambles
    preamble_text?: string;
  }>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    // Reasoning tokens (o-series models)
    reasoning_tokens?: number;
    // Cached tokens (GPT-5.2 with 90% discount)
    cached_tokens?: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

interface OpenAIEmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export class OpenAIProvider implements ProviderAdapter {
  name = "openai";
  supportedOperations = ["chat.completions", "responses", "embeddings"];

  async execute(options: ExecuteOptions): Promise<NormalizedLLMResponse> {
    const { operation, model, params, apiKey, timeout } = options;

    // Route to appropriate API based on operation
    if (operation === "responses") {
      return this.executeResponses(options);
    }

    if (operation !== "chat.completions") {
      throw new Error(`OpenAI provider does not support operation: ${operation}`);
    }

    const url = `${OPENAI_BASE_URL}/chat/completions`;
    const body = this.buildChatRequestBody(model, params);

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
      const error = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }

    const raw = await response.json() as OpenAIChatResponse;
    return this.normalizeChatResponse(raw);
  }

  /**
   * Execute using the Responses API (stateful conversations)
   * Supports both standard and compact modes
   */
  private async executeResponses(options: ExecuteOptions): Promise<NormalizedLLMResponse> {
    const { model, params, apiKey, timeout } = options;

    // Use compact endpoint for smaller payloads (GPT-5.2+)
    const useCompact = params.compactMode === true;
    const url = useCompact
      ? `${OPENAI_BASE_URL}/responses/compact`
      : `${OPENAI_BASE_URL}/responses`;

    const body = this.buildResponsesRequestBody(model, params);

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
      const error = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(`OpenAI Responses API error: ${error.error?.message || response.statusText}`);
    }

    const raw = await response.json() as OpenAIResponsesResponse;
    return this.normalizeResponsesResponse(raw);
  }

  async embed(options: ExecuteOptions): Promise<NormalizedEmbeddingResponse> {
    const { model, params, apiKey, timeout } = options;

    const url = `${OPENAI_BASE_URL}/embeddings`;
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
      const error = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }

    const raw = await response.json() as OpenAIEmbeddingResponse;
    return this.normalizeEmbeddingResponse(raw);
  }

  validateParams(operation: string, params: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (operation === "chat.completions") {
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
    // Rough estimate: ~4 chars per token for English
    return Math.ceil(text.length / 4);
  }

  /**
   * List available models from OpenAI
   * When API key is provided, fetches dynamically from OpenAI API
   */
  async listModels(apiKey?: string): Promise<ModelInfo[]> {
    // Metadata for known models (pricing, capabilities, context windows)
    // Updated Jan 2026 with GPT-5.2 series and modern o-series models
    const modelMetadata: Record<string, Partial<ModelInfo>> = {
      // ==========================================================================
      // GPT-5.2 Series (Released Jan 2026) - Latest flagship models
      // ==========================================================================
      'gpt-5.2': {
        name: 'GPT-5.2',
        description: 'Latest flagship model with breakthrough capabilities, 90% cached discount',
        contextWindow: 1000000, // 1M context
        maxOutputTokens: 100000,
        capabilities: ['chat', 'vision', 'function_calling'],
        inputPricing: 1.75,  // $1.75/1M input (90% discount with caching)
        outputPricing: 14.00, // $14/1M output
      },
      'gpt-5.2-thinking': {
        name: 'GPT-5.2 Thinking',
        description: 'Extended reasoning with visible chain-of-thought, ideal for complex problems',
        contextWindow: 1000000,
        maxOutputTokens: 100000,
        capabilities: ['chat', 'vision', 'function_calling', 'reasoning'],
        inputPricing: 3.50,
        outputPricing: 28.00,
      },
      'gpt-5.2-pro': {
        name: 'GPT-5.2 Pro',
        description: 'Maximum compute version for hardest problems',
        contextWindow: 1000000,
        maxOutputTokens: 100000,
        capabilities: ['chat', 'vision', 'function_calling', 'reasoning'],
        inputPricing: 15.00,
        outputPricing: 60.00,
      },
      'gpt-5.2-codex': {
        name: 'GPT-5.2 Codex',
        description: 'Specialized for code generation, editing, and analysis',
        contextWindow: 1000000,
        maxOutputTokens: 100000,
        capabilities: ['chat', 'vision', 'function_calling', 'completion'],
        inputPricing: 2.00,
        outputPricing: 16.00,
      },
      // ==========================================================================
      // o-Series Reasoning Models (o3/o4 - Jan 2026)
      // Reasoning effort: none, low, medium, high, xhigh
      // ==========================================================================
      'o3': {
        name: 'o3',
        description: 'Advanced reasoning model with adaptive compute (successor to o1)',
        contextWindow: 200000,
        maxOutputTokens: 100000,
        capabilities: ['chat', 'reasoning', 'vision', 'function_calling'],
        inputPricing: 10.00,
        outputPricing: 40.00,
      },
      'o4-mini': {
        name: 'o4 Mini',
        description: 'Fast, efficient reasoning for everyday tasks',
        contextWindow: 200000,
        maxOutputTokens: 100000,
        capabilities: ['chat', 'reasoning', 'function_calling'],
        inputPricing: 1.10,
        outputPricing: 4.40,
      },
      'o3-pro': {
        name: 'o3 Pro',
        description: 'Extended compute reasoning for hardest problems, supports xhigh effort',
        contextWindow: 200000,
        maxOutputTokens: 100000,
        capabilities: ['chat', 'reasoning', 'vision', 'function_calling'],
        inputPricing: 150.00,
        outputPricing: 600.00,
      },
      'o3-deep-research': {
        name: 'o3 Deep Research',
        description: 'Autonomous multi-step research with web access and extended reasoning',
        contextWindow: 200000,
        maxOutputTokens: 100000,
        capabilities: ['chat', 'reasoning', 'vision', 'function_calling'],
        inputPricing: 50.00,
        outputPricing: 200.00,
      },
      'o4-mini-deep-research': {
        name: 'o4 Mini Deep Research',
        description: 'Cost-effective autonomous research with o4-mini backbone',
        contextWindow: 200000,
        maxOutputTokens: 100000,
        capabilities: ['chat', 'reasoning', 'function_calling'],
        inputPricing: 5.00,
        outputPricing: 20.00,
      },
      // ==========================================================================
      // Legacy o-Series (o1) - Still available
      // ==========================================================================
      'o1': {
        name: 'o1',
        description: 'Original reasoning model (consider o3 or o4-mini instead)',
        contextWindow: 200000,
        maxOutputTokens: 100000,
        capabilities: ['chat', 'reasoning', 'vision', 'function_calling'],
        inputPricing: 15.00,
        outputPricing: 60.00,
      },
      'o1-mini': {
        name: 'o1 Mini',
        description: 'Original fast reasoning model (consider o4-mini instead)',
        contextWindow: 128000,
        maxOutputTokens: 65536,
        capabilities: ['chat', 'reasoning'],
        inputPricing: 3.00,
        outputPricing: 12.00,
      },
      // ==========================================================================
      // GPT-4o Series - Previous generation flagship
      // ==========================================================================
      'gpt-4o': {
        name: 'GPT-4o',
        description: 'Multimodal model, great for complex tasks (previous generation)',
        contextWindow: 128000,
        maxOutputTokens: 16384,
        capabilities: ['chat', 'vision', 'function_calling'],
        inputPricing: 2.50,
        outputPricing: 10.00,
      },
      'gpt-4o-mini': {
        name: 'GPT-4o Mini',
        description: 'Fast and affordable for simpler tasks',
        contextWindow: 128000,
        maxOutputTokens: 16384,
        capabilities: ['chat', 'vision', 'function_calling'],
        inputPricing: 0.15,
        outputPricing: 0.60,
      },
      // ==========================================================================
      // Legacy GPT-4 Models
      // ==========================================================================
      'gpt-4-turbo': {
        name: 'GPT-4 Turbo',
        description: 'GPT-4 Turbo with vision capabilities',
        contextWindow: 128000,
        maxOutputTokens: 4096,
        capabilities: ['chat', 'vision', 'function_calling'],
        inputPricing: 10.00,
        outputPricing: 30.00,
      },
      'gpt-4': {
        name: 'GPT-4',
        description: 'Original GPT-4 model (legacy)',
        contextWindow: 8192,
        maxOutputTokens: 4096,
        capabilities: ['chat', 'function_calling'],
        inputPricing: 30.00,
        outputPricing: 60.00,
        deprecated: true,
      },
      'gpt-3.5-turbo': {
        name: 'GPT-3.5 Turbo',
        description: 'Fast and economical for simple tasks (legacy)',
        contextWindow: 16385,
        maxOutputTokens: 4096,
        capabilities: ['chat', 'function_calling'],
        inputPricing: 0.50,
        outputPricing: 1.50,
        deprecated: true,
      },
      // ==========================================================================
      // Embedding Models
      // ==========================================================================
      'text-embedding-3-large': {
        name: 'Text Embedding 3 Large',
        description: 'Most capable embedding model, 3072 dimensions',
        contextWindow: 8191,
        capabilities: ['embedding'],
        inputPricing: 0.13,
      },
      'text-embedding-3-small': {
        name: 'Text Embedding 3 Small',
        description: 'Efficient embedding model, 1536 dimensions',
        contextWindow: 8191,
        capabilities: ['embedding'],
        inputPricing: 0.02,
      },
      'text-embedding-ada-002': {
        name: 'Text Embedding Ada 002',
        description: 'Legacy embedding model',
        contextWindow: 8191,
        capabilities: ['embedding'],
        inputPricing: 0.10,
        deprecated: true,
      },
    };

    // If API key provided, fetch dynamically from OpenAI
    if (apiKey) {
      try {
        const response = await fetch(`${OPENAI_BASE_URL}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });

        if (response.ok) {
          const data = await response.json() as { data: Array<{ id: string; created: number; owned_by: string }> };

          // Filter to relevant models and sort by creation date (newest first)
          const relevantModels = data.data
            .filter(m =>
              m.id.startsWith('gpt-') ||    // gpt-4o, gpt-4, gpt-3.5, gpt-5.2
              m.id.startsWith('o1') ||       // o1, o1-mini, o1-pro
              m.id.startsWith('o3') ||       // o3, o3-pro, o3-deep-research
              m.id.startsWith('o4') ||       // o4-mini, o4-mini-deep-research
              m.id.includes('embedding')
            )
            .filter(m =>
              // Exclude internal/fine-tuned models
              !m.id.includes('ft:') &&
              !m.id.includes(':ft-') &&
              !m.id.includes('-instruct') &&
              m.owned_by !== 'user'
            )
            .sort((a, b) => b.created - a.created);

          // Build model list with metadata
          return relevantModels.map(m => {
            const metadata = modelMetadata[m.id] || this.inferModelMetadata(m.id);
            return {
              id: m.id,
              name: metadata.name || this.formatModelName(m.id),
              description: metadata.description,
              contextWindow: metadata.contextWindow,
              maxOutputTokens: metadata.maxOutputTokens,
              capabilities: metadata.capabilities || ['chat'],
              inputPricing: metadata.inputPricing,
              outputPricing: metadata.outputPricing,
              deprecated: metadata.deprecated,
            };
          });
        }
      } catch (error) {
        console.warn('[openai] Failed to fetch models from API:', error);
        // Fall through to static list
      }
    }

    // Fallback: return curated static list when no API key or API fails
    return [
      // GPT-5.2 series (newest - Jan 2026)
      { id: 'gpt-5.2', ...modelMetadata['gpt-5.2'] } as ModelInfo,
      { id: 'gpt-5.2-thinking', ...modelMetadata['gpt-5.2-thinking'] } as ModelInfo,
      { id: 'gpt-5.2-pro', ...modelMetadata['gpt-5.2-pro'] } as ModelInfo,
      { id: 'gpt-5.2-codex', ...modelMetadata['gpt-5.2-codex'] } as ModelInfo,
      // o-series reasoning (o3/o4 - Jan 2026)
      { id: 'o4-mini', ...modelMetadata['o4-mini'] } as ModelInfo,
      { id: 'o3', ...modelMetadata['o3'] } as ModelInfo,
      { id: 'o3-pro', ...modelMetadata['o3-pro'] } as ModelInfo,
      { id: 'o3-deep-research', ...modelMetadata['o3-deep-research'] } as ModelInfo,
      { id: 'o4-mini-deep-research', ...modelMetadata['o4-mini-deep-research'] } as ModelInfo,
      // GPT-4o series (previous generation)
      { id: 'gpt-4o', ...modelMetadata['gpt-4o'] } as ModelInfo,
      { id: 'gpt-4o-mini', ...modelMetadata['gpt-4o-mini'] } as ModelInfo,
      // Legacy o1 series
      { id: 'o1', ...modelMetadata['o1'] } as ModelInfo,
      { id: 'o1-mini', ...modelMetadata['o1-mini'] } as ModelInfo,
      // Embeddings
      { id: 'text-embedding-3-large', ...modelMetadata['text-embedding-3-large'] } as ModelInfo,
      { id: 'text-embedding-3-small', ...modelMetadata['text-embedding-3-small'] } as ModelInfo,
    ];
  }

  /**
   * Format model ID into display name
   */
  private formatModelName(id: string): string {
    return id
      .replace('gpt-5.2', 'GPT-5.2')
      .replace('gpt-', 'GPT-')
      .replace('-turbo', ' Turbo')
      .replace('-mini', ' Mini')
      .replace('-thinking', ' Thinking')
      .replace('-codex', ' Codex')
      .replace('-pro', ' Pro')
      .replace('-deep-research', ' Deep Research')
      .replace('-preview', ' Preview')
      .replace(/-(\d{4}-\d{2}-\d{2})/, ' ($1)');
  }

  /**
   * Infer metadata for unknown models based on ID patterns
   */
  private inferModelMetadata(id: string): Partial<ModelInfo> {
    if (id.includes('embedding')) {
      return {
        capabilities: ['embedding'],
        contextWindow: 8191,
      };
    }
    // GPT-5.2 series (gpt-5.2, gpt-5.2-thinking, gpt-5.2-pro, gpt-5.2-codex)
    if (id.startsWith('gpt-5.2')) {
      const isReasoning = id.includes('thinking') || id.includes('pro');
      return {
        capabilities: isReasoning
          ? ['chat', 'vision', 'function_calling', 'reasoning']
          : ['chat', 'vision', 'function_calling'],
        contextWindow: 1000000,
        maxOutputTokens: 100000,
      };
    }
    // o-series reasoning models (o1, o3, o4)
    if (id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4')) {
      const isDeepResearch = id.includes('deep-research');
      return {
        capabilities: ['chat', 'reasoning', 'function_calling'],
        contextWindow: 200000,
        maxOutputTokens: 100000,
        // Deep research models have web access
        ...(isDeepResearch && { description: 'Autonomous research with web access' }),
      };
    }
    if (id.startsWith('gpt-4o')) {
      return {
        capabilities: ['chat', 'vision', 'function_calling'],
        contextWindow: 128000,
        maxOutputTokens: 16384,
      };
    }
    if (id.startsWith('gpt-4')) {
      return {
        capabilities: ['chat', 'function_calling'],
        contextWindow: 128000,
        maxOutputTokens: 4096,
      };
    }
    if (id.startsWith('gpt-3.5')) {
      return {
        capabilities: ['chat', 'function_calling'],
        contextWindow: 16385,
        maxOutputTokens: 4096,
      };
    }
    return {
      capabilities: ['chat'],
    };
  }

  /**
   * Check if a model is an o-series reasoning model
   */
  private isReasoningModel(model: string): boolean {
    return model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')
      || model.includes('-thinking');
  }

  private buildChatRequestBody(model: string, params: Record<string, unknown>): Record<string, unknown> {
    const messages = params.messages || [{ role: "user", content: params.prompt }];

    return {
      model,
      messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 1024,
      ...this.filterParams(params),
    };
  }

  private filterParams(params: Record<string, unknown>): Record<string, unknown> {
    // Remove params we've already handled
    const { messages, prompt, temperature, maxTokens, ...rest } = params;
    return rest;
  }

  /**
   * Build request body for Responses API
   * Supports GPT-5.2 and o-series models with full reasoning and preamble support
   */
  private buildResponsesRequestBody(model: string, params: Record<string, unknown>): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model,
    };

    // Handle input - can be string or structured messages
    if (params.messages) {
      body.input = params.messages;
    } else if (params.prompt) {
      body.input = params.prompt;
    }

    // Previous response ID for conversation continuity
    if (params.previousResponseId) {
      body.previous_response_id = params.previousResponseId;
    }

    // Instructions (system prompt)
    if (params.instructions || params.systemPrompt || params.system) {
      body.instructions = params.instructions || params.systemPrompt || params.system;
    }

    // Temperature - only set for non-reasoning models or if explicitly provided
    // o-series models require temp=1
    if (params.temperature !== undefined) {
      body.temperature = this.isReasoningModel(model) ? 1 : params.temperature;
    }

    // Max output tokens
    if (params.maxTokens !== undefined) {
      body.max_output_tokens = params.maxTokens;
    }

    // Built-in tools (web_search, code_interpreter, file_search)
    if (params.tools) {
      body.tools = params.tools;
    }

    // Tool choice
    if (params.toolChoice) {
      body.tool_choice = params.toolChoice;
    }

    // Preambles for tool calls (GPT-5.2+)
    // Preambles allow the model to explain reasoning before tool execution
    if (params.enablePreambles !== undefined) {
      body.enable_preambles = params.enablePreambles;
    }

    // Reasoning configuration for o-series and GPT-5.2-thinking models
    if (params.reasoningEffort || this.isReasoningModel(model)) {
      const reasoning: Record<string, unknown> = {};

      // Effort level: none, low, medium, high, xhigh (xhigh only on o3-pro)
      if (params.reasoningEffort) {
        reasoning.effort = params.reasoningEffort;
      }

      // Show reasoning in output (for thinking models)
      if (params.showReasoning !== undefined) {
        reasoning.show_reasoning = params.showReasoning;
      }

      if (Object.keys(reasoning).length > 0) {
        body.reasoning = reasoning;
      }
    }

    // Compact mode (use /responses/compact endpoint for smaller payloads)
    // This is handled by the caller setting compactMode: true
    if (params.compactMode) {
      body.compact = true;
    }

    // Response format (json, json_schema)
    if (params.responseFormat === 'json' || params.responseFormat === 'json_schema') {
      body.text = {
        format: params.responseFormat === 'json_schema'
          ? { type: 'json_schema', json_schema: params.jsonSchema }
          : { type: 'json_object' },
      };
    }

    // Parallel tool calls
    if (params.parallelToolCalls !== undefined) {
      body.parallel_tool_calls = params.parallelToolCalls;
    }

    return body;
  }

  /**
   * Normalize Responses API response
   * Handles message, reasoning, preamble, and tool call outputs
   */
  private normalizeResponsesResponse(raw: OpenAIResponsesResponse): NormalizedLLMResponse {
    // Extract text content from message outputs
    const textContent = raw.output
      ?.filter(o => o.type === "message")
      .flatMap(o => o.content || [])
      .filter(c => c.type === "output_text")
      .map(c => c.text)
      .join("\n") || "";

    // Extract reasoning content (from o-series and thinking models)
    const reasoningContent = raw.output
      ?.filter(o => o.type === "reasoning")
      .flatMap(o => o.content || [])
      .filter(c => c.type === "reasoning_text")
      .map(c => c.text)
      .join("\n") || undefined;

    // Extract preambles (explanations before tool calls)
    const preambles = raw.output
      ?.filter(o => o.type === "preamble")
      .map(o => o.preamble_text)
      .filter(Boolean) as string[] | undefined;

    // Extract tool calls
    const toolCalls = raw.output
      ?.filter(o => o.type === "tool_call")
      .map(tc => ({
        id: tc.id,
        type: "function" as const,
        function: {
          name: tc.name || "",
          arguments: tc.arguments || "{}",
        },
      }));

    return {
      provider: "openai",
      model: raw.model,
      content: textContent,
      usage: {
        promptTokens: raw.usage?.input_tokens || 0,
        completionTokens: raw.usage?.output_tokens || 0,
        totalTokens: raw.usage?.total_tokens || 0,
      },
      finishReason: raw.status === "completed"
        ? (toolCalls && toolCalls.length > 0 ? "tool_calls" : "stop")
        : raw.status === "incomplete" ? "length" : "error",
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      metadata: {
        id: raw.id,
        createdAt: raw.created_at,
        status: raw.status,
        // Include response ID for conversation continuity
        responseId: raw.id,
        // Include reasoning output if present (o-series models)
        reasoning: reasoningContent,
        // Include preambles if present (GPT-5.2+)
        preambles: preambles && preambles.length > 0 ? preambles : undefined,
        // Include token breakdown
        reasoningTokens: raw.usage?.reasoning_tokens,
        cachedTokens: raw.usage?.cached_tokens,
      },
    };
  }

  private normalizeChatResponse(raw: OpenAIChatResponse): NormalizedLLMResponse {
    const choice = raw.choices?.[0];

    return {
      provider: "openai",
      model: raw.model,
      content: choice?.message?.content || "",
      usage: {
        promptTokens: raw.usage?.prompt_tokens || 0,
        completionTokens: raw.usage?.completion_tokens || 0,
        totalTokens: raw.usage?.total_tokens || 0,
      },
      finishReason: normalizeFinishReason(choice?.finish_reason),
      toolCalls: choice?.message?.tool_calls?.map(tc => ({
        id: tc.id,
        type: tc.type,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
      metadata: {
        id: raw.id,
        created: raw.created,
        systemFingerprint: raw.system_fingerprint,
      },
    };
  }

  private normalizeEmbeddingResponse(raw: OpenAIEmbeddingResponse): NormalizedEmbeddingResponse {
    return {
      provider: "openai",
      model: raw.model,
      embeddings: raw.data.map(d => d.embedding),
      usage: {
        promptTokens: raw.usage.prompt_tokens,
        totalTokens: raw.usage.total_tokens,
      },
      metadata: {},
    };
  }
}

export const openaiProvider = new OpenAIProvider();
