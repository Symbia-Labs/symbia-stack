import type { NormalizedLLMResponse, NormalizedEmbeddingResponse, ProviderConfig } from "@shared/schema.js";

export interface ExecuteOptions {
  operation: string;
  model: string;
  params: Record<string, unknown>;
  apiKey: string;
  timeout?: number;
}

/**
 * Model information returned by providers
 */
export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  capabilities: ('chat' | 'completion' | 'embedding' | 'vision' | 'function_calling' | 'reasoning')[];
  inputPricing?: number;  // per 1M tokens
  outputPricing?: number; // per 1M tokens
  deprecated?: boolean;
}

export interface ProviderAdapter {
  name: string;
  supportedOperations: string[];

  /**
   * Execute an LLM operation
   */
  execute(options: ExecuteOptions): Promise<NormalizedLLMResponse>;

  /**
   * Execute an embedding operation
   */
  embed?(options: ExecuteOptions): Promise<NormalizedEmbeddingResponse>;

  /**
   * List available models from the provider
   * Returns cached/static list if API key is not provided
   */
  listModels?(apiKey?: string): Promise<ModelInfo[]>;

  /**
   * Validate request parameters
   */
  validateParams(operation: string, params: Record<string, unknown>): { valid: boolean; errors?: string[] };

  /**
   * Estimate token count for text
   */
  estimateTokens(text: string): number;
}

/**
 * Registry of provider adapters
 */
const providerRegistry = new Map<string, ProviderAdapter>();

export function registerProvider(adapter: ProviderAdapter): void {
  providerRegistry.set(adapter.name, adapter);
}

export function getProvider(name: string): ProviderAdapter | undefined {
  return providerRegistry.get(name);
}

export function getRegisteredProviders(): string[] {
  return Array.from(providerRegistry.keys());
}

/**
 * Normalize finish reason across providers
 */
export function normalizeFinishReason(
  raw: string | undefined | null
): "stop" | "length" | "content_filter" | "tool_calls" | "error" | "incomplete" {
  if (!raw) return "stop";

  const normalized = raw.toLowerCase();

  if (normalized === "stop" || normalized === "end_turn") return "stop";
  if (normalized === "length" || normalized === "max_tokens") return "length";
  if (normalized === "content_filter" || normalized === "safety") return "content_filter";
  if (normalized === "tool_calls" || normalized === "function_call") return "tool_calls";
  if (normalized === "incomplete") return "incomplete"; // OpenAI Responses API

  return "stop";
}
