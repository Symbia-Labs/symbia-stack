/**
 * Comprehensive LLM & Embedding Configuration Schema
 *
 * This module defines the complete configuration schema for LLM and embedding
 * interactions across all assistants. It supports:
 *
 * - Multiple providers (OpenAI, Anthropic, HuggingFace, local/Ollama)
 * - Fine-grained generation parameters
 * - Embedding configuration for semantic routing
 * - Safety controls and content filtering
 * - Reliability features (retries, fallbacks, circuit breakers)
 * - Cost management and budgets
 * - Caching for performance
 * - Observability and logging
 */

import { z } from 'zod';

// =============================================================================
// Provider Configuration
// =============================================================================

export const providerTypeSchema = z.enum([
  'openai',
  'anthropic',
  'google',
  'mistral',
  'cohere',
  'huggingface',
  'ollama',      // Local models
  'custom',      // Custom endpoints
]);
export type ProviderType = z.infer<typeof providerTypeSchema>;

export const providerConfigSchema = z.object({
  type: providerTypeSchema,
  baseUrl: z.string().url().optional(), // Override default endpoint
  apiKeyRef: z.string().optional(), // Reference to credential in Identity service
  organizationId: z.string().optional(), // For OpenAI org IDs
  projectId: z.string().optional(), // For Google/Anthropic projects
});
export type ProviderConfig = z.infer<typeof providerConfigSchema>;

// =============================================================================
// LLM Generation Configuration
// =============================================================================

export const responseFormatSchema = z.enum([
  'text',        // Default free-form text
  'json',        // JSON mode (OpenAI, Anthropic)
  'json_schema', // Structured outputs with schema validation
]);
export type ResponseFormat = z.infer<typeof responseFormatSchema>;

export const llmGenerationConfigSchema = z.object({
  // Core parameters
  model: z.string().default('gpt-4o-mini'),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().positive().max(128000).default(1024),

  // Sampling parameters
  topP: z.number().min(0).max(1).optional(), // Nucleus sampling
  topK: z.number().int().positive().optional(), // Top-K sampling (Anthropic, local)

  // Repetition control
  frequencyPenalty: z.number().min(-2).max(2).optional(), // Reduce repetition
  presencePenalty: z.number().min(-2).max(2).optional(), // Encourage new topics

  // Output control
  stop: z.array(z.string()).max(4).optional(), // Stop sequences
  seed: z.number().int().optional(), // Deterministic outputs

  // Response format
  responseFormat: responseFormatSchema.default('text'),
  jsonSchema: z.record(z.unknown()).optional(), // For json_schema mode

  // Reasoning (o-series models: o1, o3, o4)
  // none = no extended thinking, low/medium/high = increasing compute, xhigh = maximum reasoning
  reasoningEffort: z.enum(['none', 'low', 'medium', 'high', 'xhigh']).optional(),

  // Tool/Function calling
  toolChoice: z.enum(['auto', 'none', 'required']).optional(),
  parallelToolCalls: z.boolean().optional(),
});
export type LLMGenerationConfig = z.infer<typeof llmGenerationConfigSchema>;

// =============================================================================
// Embedding Configuration
// =============================================================================

export const embeddingModelSchema = z.enum([
  // OpenAI
  'text-embedding-3-small',
  'text-embedding-3-large',
  'text-embedding-ada-002',
  // HuggingFace (local or API)
  'all-MiniLM-L6-v2',
  'bge-small-en-v1.5',
  'bge-base-en-v1.5',
  // Custom
  'custom',
]);
export type EmbeddingModel = z.infer<typeof embeddingModelSchema>;

export const embeddingConfigSchema = z.object({
  // Model selection
  provider: providerTypeSchema.default('openai'),
  model: z.string().default('text-embedding-3-small'),

  // Dimensions (for models that support dimension reduction)
  dimensions: z.number().int().positive().optional(), // e.g., 256, 512, 1536, 3072

  // Batch processing
  batchSize: z.number().int().positive().max(100).default(10),

  // Truncation
  truncation: z.enum(['start', 'end', 'none']).default('end'),
  maxInputTokens: z.number().int().positive().optional(),

  // Normalization
  normalize: z.boolean().default(true), // L2 normalize embeddings
});
export type EmbeddingConfig = z.infer<typeof embeddingConfigSchema>;

// =============================================================================
// Routing Configuration (Coordinator)
// =============================================================================

export const routingStrategySchema = z.enum([
  'embedding',     // Fast semantic similarity
  'llm',           // LLM-based classification
  'hybrid',        // Embedding first, LLM fallback
  'rules',         // Rule-based (keywords, patterns)
]);
export type RoutingStrategy = z.infer<typeof routingStrategySchema>;

export const routingConfigSchema = z.object({
  // Strategy selection
  strategy: routingStrategySchema.default('hybrid'),

  // Embedding routing settings
  embedding: z.object({
    enabled: z.boolean().default(true),
    config: embeddingConfigSchema.optional(),
    similarityThreshold: z.number().min(0).max(1).default(0.75), // Min similarity to route
    confidenceThreshold: z.number().min(0).max(1).default(0.85), // Skip LLM if above this
  }).optional(),

  // LLM routing settings (fallback or primary)
  llm: z.object({
    enabled: z.boolean().default(true),
    config: llmGenerationConfigSchema.optional(),
    // Use smaller/faster model for routing
    model: z.string().default('gpt-4o-mini'),
    temperature: z.number().default(0.1), // Low temp for deterministic routing
    maxTokens: z.number().default(100), // Small output for routing decision
  }).optional(),

  // Caching
  cacheEmbeddings: z.boolean().default(true),
  cacheRoutingDecisions: z.boolean().default(false),
  cacheTTLSeconds: z.number().int().positive().default(3600),
});
export type RoutingConfig = z.infer<typeof routingConfigSchema>;

// =============================================================================
// Safety & Security Configuration
// =============================================================================

export const contentFilterLevelSchema = z.enum([
  'none',     // No filtering
  'low',      // Block only clearly harmful content
  'medium',   // Block harmful + suggestive content
  'high',     // Strict filtering
]);
export type ContentFilterLevel = z.infer<typeof contentFilterLevelSchema>;

export const safetyConfigSchema = z.object({
  // Content filtering
  contentFilter: z.object({
    enabled: z.boolean().default(true),
    level: contentFilterLevelSchema.default('medium'),
    categories: z.object({
      hate: z.boolean().default(true),
      harassment: z.boolean().default(true),
      selfHarm: z.boolean().default(true),
      sexual: z.boolean().default(true),
      violence: z.boolean().default(true),
    }).optional(),
  }).default({}),

  // PII protection
  pii: z.object({
    enabled: z.boolean().default(false),
    detectInInput: z.boolean().default(true),
    redactInOutput: z.boolean().default(true),
    categories: z.array(z.enum([
      'email', 'phone', 'ssn', 'credit_card', 'address', 'name', 'ip_address'
    ])).default(['email', 'phone', 'ssn', 'credit_card']),
  }).optional(),

  // Prompt injection protection
  promptInjection: z.object({
    enabled: z.boolean().default(true),
    blockSuspicious: z.boolean().default(true),
    logAttempts: z.boolean().default(true),
  }).default({}),

  // Output validation
  outputValidation: z.object({
    enabled: z.boolean().default(false),
    maxLength: z.number().int().positive().optional(),
    blockedPatterns: z.array(z.string()).optional(), // Regex patterns to block
    requiredPatterns: z.array(z.string()).optional(), // Must match at least one
  }).optional(),
});
export type SafetyConfig = z.infer<typeof safetyConfigSchema>;

// =============================================================================
// Reliability Configuration
// =============================================================================

export const retryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxRetries: z.number().int().min(0).max(10).default(3),
  initialDelayMs: z.number().int().positive().default(1000),
  maxDelayMs: z.number().int().positive().default(30000),
  backoffMultiplier: z.number().positive().default(2),
  retryOn: z.array(z.enum([
    'timeout',
    'rate_limit',
    'server_error',
    'network_error',
  ])).default(['timeout', 'rate_limit', 'server_error']),
});
export type RetryConfig = z.infer<typeof retryConfigSchema>;

export const fallbackConfigSchema = z.object({
  enabled: z.boolean().default(true),
  // Ordered list of fallback models
  models: z.array(z.object({
    provider: providerTypeSchema,
    model: z.string(),
    priority: z.number().int().default(0), // Lower = higher priority
  })).default([]),
  // When to trigger fallback
  triggerOn: z.array(z.enum([
    'error',
    'timeout',
    'rate_limit',
    'content_filter',
    'low_confidence',
  ])).default(['error', 'timeout', 'rate_limit']),
});
export type FallbackConfig = z.infer<typeof fallbackConfigSchema>;

export const reliabilityConfigSchema = z.object({
  // Timeouts
  timeoutMs: z.number().int().positive().default(45000),
  streamTimeoutMs: z.number().int().positive().default(120000), // For streaming

  // Retries
  retry: retryConfigSchema.default({}),

  // Fallbacks
  fallback: fallbackConfigSchema.default({}),

  // Circuit breaker
  circuitBreaker: z.object({
    enabled: z.boolean().default(true),
    failureThreshold: z.number().int().positive().default(5), // Failures before opening
    resetTimeoutMs: z.number().int().positive().default(60000), // Time before trying again
  }).optional(),
});
export type ReliabilityConfig = z.infer<typeof reliabilityConfigSchema>;

// =============================================================================
// Cost Management Configuration
// =============================================================================

export const costConfigSchema = z.object({
  // Budget limits
  budgets: z.object({
    // Per-request limit (in USD cents)
    perRequestCents: z.number().int().positive().optional(),
    // Daily limit per assistant
    dailyPerAssistantCents: z.number().int().positive().optional(),
    // Daily limit per user
    dailyPerUserCents: z.number().int().positive().optional(),
    // Monthly org limit
    monthlyOrgCents: z.number().int().positive().optional(),
  }).optional(),

  // Cost optimization
  optimization: z.object({
    // Prefer cheaper models when possible
    preferCheaperModels: z.boolean().default(false),
    // Max input tokens (truncate if exceeded)
    maxInputTokens: z.number().int().positive().optional(),
    // Cache responses to reduce costs
    cacheResponses: z.boolean().default(false),
  }).optional(),

  // Alerting
  alerts: z.object({
    enabled: z.boolean().default(true),
    thresholdPercent: z.number().min(0).max(100).default(80),
    notifyEmail: z.string().email().optional(),
    notifyWebhook: z.string().url().optional(),
  }).optional(),
});
export type CostConfig = z.infer<typeof costConfigSchema>;

// =============================================================================
// Caching Configuration
// =============================================================================

export const cacheConfigSchema = z.object({
  // Response caching
  responses: z.object({
    enabled: z.boolean().default(false),
    ttlSeconds: z.number().int().positive().default(3600),
    maxEntries: z.number().int().positive().default(1000),
    // Only cache for these temperatures (deterministic outputs)
    cacheableTemperatures: z.array(z.number()).default([0, 0.1]),
  }).optional(),

  // Embedding caching
  embeddings: z.object({
    enabled: z.boolean().default(true),
    ttlSeconds: z.number().int().positive().default(86400), // 24 hours
    maxEntries: z.number().int().positive().default(10000),
  }).optional(),

  // Routing decision caching
  routing: z.object({
    enabled: z.boolean().default(false),
    ttlSeconds: z.number().int().positive().default(300),
  }).optional(),
});
export type CacheConfig = z.infer<typeof cacheConfigSchema>;

// =============================================================================
// Context Management Configuration
// =============================================================================

export const contextConfigSchema = z.object({
  // Token budget management
  tokenBudget: z.object({
    // Max tokens for context window
    maxContextTokens: z.number().int().positive().default(8000),
    // Reserve tokens for response
    reserveForResponse: z.number().int().positive().default(1024),
    // Truncation strategy when over budget
    truncationStrategy: z.enum([
      'oldest_first',   // Remove oldest messages first
      'summarize',      // Summarize old messages
      'sliding_window', // Keep recent N messages
    ]).default('oldest_first'),
  }).optional(),

  // Conversation summarization
  summarization: z.object({
    enabled: z.boolean().default(false),
    triggerTokenCount: z.number().int().positive().default(4000),
    summaryModel: z.string().default('gpt-4o-mini'),
    summaryMaxTokens: z.number().int().positive().default(500),
  }).optional(),

  // Rolling context (for coordinator)
  rollingContext: z.object({
    enabled: z.boolean().default(false),
    // Include recent system events
    includeSystemEvents: z.boolean().default(true),
    maxEvents: z.number().int().positive().default(10),
    // Include recent log summaries
    includeLogSummaries: z.boolean().default(false),
    logSummaryWindow: z.enum(['1h', '6h', '24h']).default('1h'),
  }).optional(),
});
export type ContextConfig = z.infer<typeof contextConfigSchema>;

// =============================================================================
// Observability Configuration
// =============================================================================

export const observabilityConfigSchema = z.object({
  // Logging
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    logPrompts: z.boolean().default(false), // Log full prompts (security risk)
    logResponses: z.boolean().default(false), // Log full responses
    logTokenUsage: z.boolean().default(true),
    logLatency: z.boolean().default(true),
  }).default({}),

  // Metrics
  metrics: z.object({
    enabled: z.boolean().default(true),
    includeModelMetrics: z.boolean().default(true),
    includeLatencyHistogram: z.boolean().default(true),
    includeTokenHistogram: z.boolean().default(true),
    includeCostMetrics: z.boolean().default(true),
  }).default({}),

  // Tracing
  tracing: z.object({
    enabled: z.boolean().default(true),
    sampleRate: z.number().min(0).max(1).default(1.0), // 1.0 = trace all
    includePrompts: z.boolean().default(false),
    includeResponses: z.boolean().default(false),
  }).default({}),
});
export type ObservabilityConfig = z.infer<typeof observabilityConfigSchema>;

// =============================================================================
// Complete Assistant LLM Configuration
// =============================================================================

export const assistantLLMConfigSchema = z.object({
  // Provider configuration
  provider: providerConfigSchema.optional(),

  // Generation settings
  generation: llmGenerationConfigSchema.default({}),

  // Embedding settings (for semantic search, routing)
  embedding: embeddingConfigSchema.optional(),

  // Routing settings (primarily for coordinator)
  routing: routingConfigSchema.optional(),

  // Safety and security
  safety: safetyConfigSchema.default({}),

  // Reliability
  reliability: reliabilityConfigSchema.default({}),

  // Cost management
  cost: costConfigSchema.optional(),

  // Caching
  cache: cacheConfigSchema.optional(),

  // Context management
  context: contextConfigSchema.optional(),

  // Observability
  observability: observabilityConfigSchema.default({}),
});
export type AssistantLLMConfig = z.infer<typeof assistantLLMConfigSchema>;

// =============================================================================
// Default Configurations by Use Case
// =============================================================================

/**
 * Fast routing configuration (coordinator)
 */
export const ROUTING_CONFIG_DEFAULTS: Partial<AssistantLLMConfig> = {
  generation: {
    model: 'gpt-4o-mini',
    temperature: 0.1,
    maxTokens: 100,
    responseFormat: 'json',
  },
  routing: {
    strategy: 'hybrid',
    embedding: {
      enabled: true,
      config: {
        provider: 'openai',
        model: 'text-embedding-3-small',
        dimensions: 512,
        normalize: true,
        batchSize: 10,
        truncation: 'end',
      },
      similarityThreshold: 0.7,
      confidenceThreshold: 0.85,
    },
    llm: {
      enabled: true,
      model: 'gpt-4o-mini',
      temperature: 0.1,
      maxTokens: 100,
    },
    cacheEmbeddings: true,
  },
  reliability: {
    timeoutMs: 10000, // Fast timeout for routing
    retry: {
      enabled: true,
      maxRetries: 2,
      initialDelayMs: 500,
      maxDelayMs: 2000,
      backoffMultiplier: 2,
      retryOn: ['timeout', 'rate_limit'],
    },
  },
};

/**
 * Conversational assistant configuration
 */
export const CONVERSATIONAL_CONFIG_DEFAULTS: Partial<AssistantLLMConfig> = {
  generation: {
    model: 'gpt-4o',
    temperature: 0.7,
    maxTokens: 2048,
  },
  safety: {
    contentFilter: {
      enabled: true,
      level: 'medium',
    },
    promptInjection: {
      enabled: true,
      blockSuspicious: true,
      logAttempts: true,
    },
  },
  reliability: {
    timeoutMs: 45000,
    retry: {
      enabled: true,
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      retryOn: ['timeout', 'rate_limit', 'server_error'],
    },
    fallback: {
      enabled: true,
      models: [
        { provider: 'openai', model: 'gpt-4o-mini', priority: 1 },
        { provider: 'anthropic', model: 'claude-3-haiku-20240307', priority: 2 },
      ],
      triggerOn: ['error', 'timeout', 'rate_limit'],
    },
  },
  context: {
    tokenBudget: {
      maxContextTokens: 8000,
      reserveForResponse: 2048,
      truncationStrategy: 'oldest_first',
    },
  },
};

/**
 * Code/technical assistant configuration
 */
export const CODE_CONFIG_DEFAULTS: Partial<AssistantLLMConfig> = {
  generation: {
    model: 'gpt-4o',
    temperature: 0.2, // Lower for code accuracy
    maxTokens: 4096,
    topP: 0.95,
  },
  safety: {
    contentFilter: {
      enabled: false, // Code often contains "dangerous" patterns
      level: 'low',
    },
  },
  reliability: {
    timeoutMs: 60000, // Longer for complex code generation
    retry: {
      enabled: true,
      maxRetries: 2,
      initialDelayMs: 2000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      retryOn: ['timeout', 'rate_limit', 'server_error'],
    },
  },
  context: {
    tokenBudget: {
      maxContextTokens: 16000, // Larger context for code
      reserveForResponse: 4096,
      truncationStrategy: 'sliding_window',
    },
  },
};

/**
 * Reasoning/analysis assistant configuration
 * Uses o4-mini by default (fast reasoning), can upgrade to o3 or o3-pro for harder problems
 */
export const REASONING_CONFIG_DEFAULTS: Partial<AssistantLLMConfig> = {
  generation: {
    model: 'o4-mini', // Fast reasoning model (Jan 2026)
    temperature: 1, // o-series models require temp=1
    maxTokens: 16000,
    reasoningEffort: 'medium', // Can be: none, low, medium, high, xhigh
  },
  reliability: {
    timeoutMs: 120000, // Longer for reasoning
    retry: {
      enabled: true,
      maxRetries: 2,
      initialDelayMs: 5000,
      maxDelayMs: 60000,
      backoffMultiplier: 2,
      retryOn: ['timeout', 'rate_limit'],
    },
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Merge user config with defaults
 */
export function mergeWithDefaults(
  userConfig: Partial<AssistantLLMConfig>,
  defaults: Partial<AssistantLLMConfig> = {}
): AssistantLLMConfig {
  return assistantLLMConfigSchema.parse({
    ...defaults,
    ...userConfig,
    generation: {
      ...defaults.generation,
      ...userConfig.generation,
    },
    embedding: userConfig.embedding ?? defaults.embedding,
    routing: userConfig.routing ?? defaults.routing,
    safety: {
      ...defaults.safety,
      ...userConfig.safety,
    },
    reliability: {
      ...defaults.reliability,
      ...userConfig.reliability,
      retry: {
        ...defaults.reliability?.retry,
        ...userConfig.reliability?.retry,
      },
      fallback: {
        ...defaults.reliability?.fallback,
        ...userConfig.reliability?.fallback,
      },
    },
    cost: userConfig.cost ?? defaults.cost,
    cache: userConfig.cache ?? defaults.cache,
    context: userConfig.context ?? defaults.context,
    observability: {
      ...defaults.observability,
      ...userConfig.observability,
    },
  });
}

/**
 * Validate configuration
 */
export function validateConfig(config: unknown): {
  valid: boolean;
  errors?: string[];
  config?: AssistantLLMConfig;
} {
  const result = assistantLLMConfigSchema.safeParse(config);
  if (result.success) {
    return { valid: true, config: result.data };
  }
  return {
    valid: false,
    errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
  };
}
