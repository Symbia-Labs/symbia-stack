/**
 * LLM Configuration Resolver
 *
 * Resolves an assistant's LLM configuration by merging:
 * 1. System defaults
 * 2. Preset configuration (if specified)
 * 3. Assistant-level overrides
 * 4. Org-level settings (from settings service)
 *
 * This ensures every assistant has a fully-populated configuration
 * with sensible defaults for all settings.
 */

import type { AssistantLLMConfigRef, ResolvedLLMConfig } from '../engine/types.js';
import {
  ROUTING_CONFIG_DEFAULTS,
  CONVERSATIONAL_CONFIG_DEFAULTS,
  CODE_CONFIG_DEFAULTS,
  REASONING_CONFIG_DEFAULTS,
  type AssistantLLMConfig,
} from './llm-config.js';

// =============================================================================
// System Defaults
// =============================================================================

const SYSTEM_DEFAULTS: ResolvedLLMConfig = {
  provider: {
    type: 'openai',
  },
  generation: {
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 1024,
    responseFormat: 'text',
  },
  embedding: {
    provider: 'openai',
    model: 'text-embedding-3-small',
    dimensions: 512,
    normalize: true,
  },
  routing: {
    strategy: 'hybrid',
    similarityThreshold: 0.7,
    confidenceThreshold: 0.85,
    cacheEmbeddings: true,
  },
  safety: {
    contentFilterLevel: 'medium',
    piiDetection: false,
    promptInjectionProtection: true,
  },
  reliability: {
    timeoutMs: 45000,
    maxRetries: 3,
    enableFallback: true,
    fallbackModels: [
      { provider: 'openai', model: 'gpt-4o-mini' },
    ],
  },
  context: {
    maxContextTokens: 8000,
    reserveForResponse: 1024,
    truncationStrategy: 'oldest_first',
    enableRollingContext: false,
  },
  observability: {
    logLevel: 'info',
    logTokenUsage: true,
    logLatency: true,
  },
};

// =============================================================================
// Preset Configurations
// =============================================================================

const PRESETS: Record<string, Partial<ResolvedLLMConfig>> = {
  routing: {
    generation: {
      model: 'gpt-4o-mini',
      temperature: 0.1,
      maxTokens: 100,
      responseFormat: 'json',
    },
    routing: {
      strategy: 'hybrid',
      similarityThreshold: 0.7,
      confidenceThreshold: 0.85,
      cacheEmbeddings: true,
    },
    reliability: {
      timeoutMs: 10000,
      maxRetries: 2,
      enableFallback: true,
    },
    context: {
      maxContextTokens: 2000,
      reserveForResponse: 100,
      truncationStrategy: 'oldest_first',
      enableRollingContext: true,
    },
  },
  conversational: {
    generation: {
      model: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 2048,
      responseFormat: 'text',
    },
    safety: {
      contentFilterLevel: 'medium',
      piiDetection: false,
      promptInjectionProtection: true,
    },
    reliability: {
      timeoutMs: 45000,
      maxRetries: 3,
      enableFallback: true,
      fallbackModels: [
        { provider: 'openai', model: 'gpt-4o-mini' },
        { provider: 'anthropic', model: 'claude-3-haiku-20240307' },
      ],
    },
    context: {
      maxContextTokens: 8000,
      reserveForResponse: 2048,
      truncationStrategy: 'oldest_first',
      enableRollingContext: false,
    },
  },
  code: {
    generation: {
      model: 'gpt-4o',
      temperature: 0.2,
      maxTokens: 4096,
      topP: 0.95,
      responseFormat: 'text',
    },
    safety: {
      contentFilterLevel: 'low',
      piiDetection: false,
      promptInjectionProtection: false,
    },
    reliability: {
      timeoutMs: 60000,
      maxRetries: 2,
      enableFallback: true,
    },
    context: {
      maxContextTokens: 16000,
      reserveForResponse: 4096,
      truncationStrategy: 'sliding_window',
      enableRollingContext: false,
    },
  },
  reasoning: {
    generation: {
      model: 'o4-mini',
      temperature: 1, // o-series requires temp=1
      maxTokens: 16000,
      responseFormat: 'text',
      reasoningEffort: 'medium', // Options: none, low, medium, high, xhigh
    },
    reliability: {
      timeoutMs: 120000,
      maxRetries: 2,
      enableFallback: false, // Don't fallback from reasoning models
    },
    context: {
      maxContextTokens: 32000,
      reserveForResponse: 16000,
      truncationStrategy: 'summarize',
      enableRollingContext: false,
    },
  },
};

// =============================================================================
// Resolver Functions
// =============================================================================

/**
 * Deep merge two objects, with source taking precedence
 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[keyof T];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[keyof T];
    }
  }

  return result;
}

/**
 * Resolve an assistant's LLM configuration to a fully-populated config
 */
export function resolveLLMConfig(
  configRef?: AssistantLLMConfigRef,
  orgDefaults?: Partial<ResolvedLLMConfig>
): ResolvedLLMConfig {
  // Start with system defaults
  let resolved = { ...SYSTEM_DEFAULTS };

  // Apply org defaults if provided
  if (orgDefaults) {
    resolved = deepMerge(resolved, orgDefaults);
  }

  // If no config ref, return defaults
  if (!configRef) {
    return resolved;
  }

  // Apply preset if specified
  if (configRef.preset && configRef.preset !== 'custom') {
    const preset = PRESETS[configRef.preset];
    if (preset) {
      resolved = deepMerge(resolved, preset);
    }
  }

  // Apply overrides
  if (configRef.overrides) {
    const overrides = configRef.overrides;

    // Generation overrides
    if (overrides.generation) {
      resolved.generation = {
        ...resolved.generation,
        ...overrides.generation,
      };
    }

    // Embedding overrides
    if (overrides.embedding) {
      resolved.embedding = {
        ...resolved.embedding,
        provider: overrides.embedding.provider || resolved.embedding?.provider || 'openai',
        model: overrides.embedding.model || resolved.embedding?.model || 'text-embedding-3-small',
        dimensions: overrides.embedding.dimensions ?? resolved.embedding?.dimensions,
        normalize: resolved.embedding?.normalize ?? true,
      };
    }

    // Routing overrides
    if (overrides.routing) {
      resolved.routing = {
        ...resolved.routing,
        strategy: overrides.routing.strategy || resolved.routing?.strategy || 'hybrid',
        similarityThreshold: overrides.routing.similarityThreshold ?? resolved.routing?.similarityThreshold ?? 0.7,
        confidenceThreshold: overrides.routing.confidenceThreshold ?? resolved.routing?.confidenceThreshold ?? 0.85,
        cacheEmbeddings: resolved.routing?.cacheEmbeddings ?? true,
      };
    }

    // Safety overrides
    if (overrides.safety) {
      resolved.safety = {
        ...resolved.safety,
        contentFilterLevel: overrides.safety.contentFilterLevel || resolved.safety.contentFilterLevel,
        piiDetection: overrides.safety.piiDetection ?? resolved.safety.piiDetection,
        promptInjectionProtection: overrides.safety.promptInjectionProtection ?? resolved.safety.promptInjectionProtection,
      };
    }

    // Reliability overrides
    if (overrides.reliability) {
      resolved.reliability = {
        ...resolved.reliability,
        timeoutMs: overrides.reliability.timeoutMs ?? resolved.reliability.timeoutMs,
        maxRetries: overrides.reliability.maxRetries ?? resolved.reliability.maxRetries,
        enableFallback: overrides.reliability.enableFallback ?? resolved.reliability.enableFallback,
      };
    }

    // Context overrides
    if (overrides.context) {
      resolved.context = {
        ...resolved.context,
        maxContextTokens: overrides.context.maxContextTokens ?? resolved.context.maxContextTokens,
        truncationStrategy: overrides.context.truncationStrategy || resolved.context.truncationStrategy,
        enableRollingContext: overrides.context.enableRollingContext ?? resolved.context.enableRollingContext,
      };
    }
  }

  return resolved;
}

/**
 * Get configuration for a specific action, merging action-level params with resolved config
 */
export function getActionConfig(
  resolvedConfig: ResolvedLLMConfig,
  actionParams: Record<string, unknown>
): {
  model: string;
  temperature: number;
  maxTokens: number;
  provider: string;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
  seed?: number;
  responseFormat: 'text' | 'json' | 'json_schema';
  jsonSchema?: Record<string, unknown>;
} {
  return {
    provider: (actionParams.provider as string) || resolvedConfig.provider.type,
    model: (actionParams.model as string) || resolvedConfig.generation.model,
    temperature: (actionParams.temperature as number) ?? resolvedConfig.generation.temperature,
    maxTokens: (actionParams.maxTokens as number) ?? resolvedConfig.generation.maxTokens,
    topP: (actionParams.topP as number) ?? resolvedConfig.generation.topP,
    topK: (actionParams.topK as number) ?? resolvedConfig.generation.topK,
    frequencyPenalty: (actionParams.frequencyPenalty as number) ?? resolvedConfig.generation.frequencyPenalty,
    presencePenalty: (actionParams.presencePenalty as number) ?? resolvedConfig.generation.presencePenalty,
    stop: (actionParams.stop as string[]) ?? resolvedConfig.generation.stop,
    seed: (actionParams.seed as number) ?? resolvedConfig.generation.seed,
    responseFormat: (actionParams.responseFormat as 'text' | 'json' | 'json_schema') || resolvedConfig.generation.responseFormat,
    jsonSchema: (actionParams.jsonSchema as Record<string, unknown>) ?? resolvedConfig.generation.jsonSchema,
  };
}

/**
 * Get embedding configuration, merging action-level params with resolved config
 */
export function getEmbeddingConfig(
  resolvedConfig: ResolvedLLMConfig,
  actionParams: Record<string, unknown> = {}
): {
  provider: string;
  model: string;
  dimensions?: number;
  normalize: boolean;
} {
  const embeddingConfig = resolvedConfig.embedding || {
    provider: 'openai',
    model: 'text-embedding-3-small',
    normalize: true,
  };

  return {
    provider: (actionParams.provider as string) || embeddingConfig.provider,
    model: (actionParams.model as string) || embeddingConfig.model,
    dimensions: (actionParams.dimensions as number) ?? embeddingConfig.dimensions,
    normalize: (actionParams.normalize as boolean) ?? embeddingConfig.normalize,
  };
}

/**
 * Check if an action should use embedding-based routing
 */
export function shouldUseEmbeddingRouting(resolvedConfig: ResolvedLLMConfig): boolean {
  const strategy = resolvedConfig.routing?.strategy;
  return strategy === 'embedding' || strategy === 'hybrid';
}

/**
 * Check if LLM fallback should be used for routing
 */
export function shouldUseLLMFallback(
  resolvedConfig: ResolvedLLMConfig,
  embeddingSimilarity?: number
): boolean {
  const strategy = resolvedConfig.routing?.strategy;

  // Always use LLM if strategy is 'llm'
  if (strategy === 'llm') return true;

  // Never use LLM if strategy is 'embedding' or 'rules'
  if (strategy === 'embedding' || strategy === 'rules') return false;

  // For hybrid, use LLM if similarity is below confidence threshold
  if (strategy === 'hybrid' && embeddingSimilarity !== undefined) {
    const confidenceThreshold = resolvedConfig.routing?.confidenceThreshold ?? 0.85;
    return embeddingSimilarity < confidenceThreshold;
  }

  return true; // Default to LLM
}

// =============================================================================
// Exports
// =============================================================================

export { SYSTEM_DEFAULTS, PRESETS };
