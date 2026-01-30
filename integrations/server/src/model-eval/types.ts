/**
 * Model Evaluation System Types
 *
 * Type definitions for benchmarks, evaluations, and recommendations.
 */

import { z } from "zod";

// =============================================================================
// Task Types - What the model is being evaluated for
// =============================================================================

export const taskTypeSchema = z.enum([
  "routing",         // Intent classification for coordinator routing
  "conversational",  // General chat/assistant tasks
  "code",            // Code review, generation, analysis
  "reasoning",       // Complex reasoning, fact-checking
  "function_calling", // Tool selection and usage
  "embedding",       // Semantic similarity, retrieval
]);
export type TaskType = z.infer<typeof taskTypeSchema>;

// =============================================================================
// Evaluator Types - How test cases are scored
// =============================================================================

export const evaluatorTypeSchema = z.enum([
  "exact",           // Exact string match
  "contains",        // Output contains expected substring
  "semantic",        // Semantic similarity using embeddings
  "json_schema",     // Output matches JSON schema
  "function_call",   // Correct function/tool selected
  "regex",           // Regex pattern match
  "custom",          // Custom evaluator function
]);
export type EvaluatorType = z.infer<typeof evaluatorTypeSchema>;

// =============================================================================
// Test Case Definition
// =============================================================================

export const testCaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),

  // Input to the model
  input: z.object({
    messages: z.array(z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string(),
    })).optional(),
    prompt: z.string().optional(),
    tools: z.array(z.object({
      name: z.string(),
      description: z.string(),
      parameters: z.record(z.unknown()),
    })).optional(),
  }),

  // Expected output
  expected: z.object({
    content: z.string().optional(),
    pattern: z.string().optional(),      // Regex pattern
    contains: z.array(z.string()).optional(),
    notContains: z.array(z.string()).optional(),
    functionCall: z.object({
      name: z.string(),
      arguments: z.record(z.unknown()).optional(),
    }).optional(),
    schema: z.record(z.unknown()).optional(), // JSON schema
  }),

  // How to evaluate
  evaluator: evaluatorTypeSchema,

  // Scoring weights
  weight: z.number().default(1),

  // Tags for filtering
  tags: z.array(z.string()).optional(),
});
export type TestCase = z.infer<typeof testCaseSchema>;

// =============================================================================
// Benchmark Definition
// =============================================================================

export const benchmarkDefinitionSchema = z.object({
  id: z.string(),                        // e.g., "routing.intent-classification"
  name: z.string(),
  description: z.string(),
  version: z.string(),                   // Semantic version for tracking changes

  // Categorization
  taskType: taskTypeSchema,
  category: z.string(),                  // Sub-category within task type

  // Test cases
  testCases: z.array(testCaseSchema),

  // Configuration
  config: z.object({
    maxTokens: z.number().int().positive().optional(),
    temperature: z.number().min(0).max(2).optional(),
    seed: z.number().int().optional(),   // For deterministic generation
    timeout: z.number().int().positive().default(30000),
  }).optional(),

  // Metadata
  author: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});
export type BenchmarkDefinition = z.infer<typeof benchmarkDefinitionSchema>;

// =============================================================================
// Test Case Result
// =============================================================================

export const testCaseResultSchema = z.object({
  testCaseId: z.string(),

  // Model output
  output: z.object({
    content: z.string().optional(),
    functionCall: z.object({
      name: z.string(),
      arguments: z.record(z.unknown()),
    }).optional(),
    rawResponse: z.record(z.unknown()).optional(),
  }),

  // Scoring
  passed: z.boolean(),
  score: z.number().min(0).max(1),       // Normalized 0-1 score
  reason: z.string().optional(),          // Explanation for score

  // Metrics
  latencyMs: z.number().int(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),

  // Error handling
  error: z.string().optional(),
});
export type TestCaseResult = z.infer<typeof testCaseResultSchema>;

// =============================================================================
// Evaluation Run Configuration
// =============================================================================

export const evalRunConfigSchema = z.object({
  // Model to evaluate
  provider: z.string(),
  modelId: z.string(),

  // Benchmark to run
  benchmarkId: z.string(),
  benchmarkVersion: z.string().optional(),

  // Execution options
  parallelism: z.number().int().positive().default(1),
  retries: z.number().int().min(0).default(0),
  seed: z.number().int().optional(),     // Global seed for reproducibility

  // Filtering
  testCaseIds: z.array(z.string()).optional(), // Run specific test cases only
  tags: z.array(z.string()).optional(),        // Run test cases with these tags

  // Scope
  orgId: z.string().optional(),          // null = global
  scope: z.enum(["global", "org"]).default("global"),
});
export type EvalRunConfig = z.infer<typeof evalRunConfigSchema>;

// =============================================================================
// Evaluation Status
// =============================================================================

export const evalStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export type EvalStatus = z.infer<typeof evalStatusSchema>;

// =============================================================================
// Evaluation Result
// =============================================================================

export const evaluationResultSchema = z.object({
  id: z.string(),

  // Model info
  provider: z.string(),
  modelId: z.string(),

  // Benchmark info
  benchmarkId: z.string(),
  benchmarkVersion: z.string(),

  // Aggregate scores
  overallScore: z.number().min(0).max(1),
  accuracy: z.number().min(0).max(1),    // % of test cases passed

  // Performance metrics
  latencyP50Ms: z.number().int(),
  latencyP95Ms: z.number().int(),
  latencyP99Ms: z.number().int().optional(),

  // Token usage
  totalInputTokens: z.number().int(),
  totalOutputTokens: z.number().int(),
  estimatedCostCents: z.number(),

  // Individual results
  testCaseResults: z.array(testCaseResultSchema),

  // Run configuration
  runConfig: evalRunConfigSchema,

  // Scope
  orgId: z.string().nullable(),
  scope: z.enum(["global", "org"]),

  // Status
  status: evalStatusSchema,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  errorMessage: z.string().optional(),
});
export type EvaluationResult = z.infer<typeof evaluationResultSchema>;

// =============================================================================
// Model Scores (Aggregated)
// =============================================================================

export const modelScoresSchema = z.object({
  id: z.string(),

  // Model identity
  provider: z.string(),
  modelId: z.string(),

  // Task type this score is for
  taskType: taskTypeSchema,

  // Composite scores (0-100 scale)
  qualityScore: z.number().min(0).max(100),
  speedScore: z.number().min(0).max(100),
  costScore: z.number().min(0).max(100),
  reliabilityScore: z.number().min(0).max(100),

  // Weighted composite
  compositeScore: z.number().min(0).max(100),

  // Source evaluations
  evaluationIds: z.array(z.string()),

  // Scope
  orgId: z.string().nullable(),

  // Timestamps
  updatedAt: z.string().datetime(),
});
export type ModelScores = z.infer<typeof modelScoresSchema>;

// =============================================================================
// Recommendation Request/Response
// =============================================================================

export const recommendationConstraintsSchema = z.object({
  maxLatencyMs: z.number().int().positive().optional(),
  maxCostPerMTokens: z.number().positive().optional(),
  minQualityScore: z.number().min(0).max(100).optional(),
  requiredCapabilities: z.array(z.string()).optional(),
  excludeProviders: z.array(z.string()).optional(),
  excludeModels: z.array(z.string()).optional(),
});
export type RecommendationConstraints = z.infer<typeof recommendationConstraintsSchema>;

export const recommendationWeightsSchema = z.object({
  quality: z.number().min(0).max(1).default(0.4),
  speed: z.number().min(0).max(1).default(0.25),
  cost: z.number().min(0).max(1).default(0.25),
  reliability: z.number().min(0).max(1).default(0.1),
});
export type RecommendationWeights = z.infer<typeof recommendationWeightsSchema>;

export const recommendationRequestSchema = z.object({
  taskType: taskTypeSchema,
  constraints: recommendationConstraintsSchema.optional(),
  weights: recommendationWeightsSchema.optional(),
  limit: z.number().int().positive().default(5),
  orgId: z.string().optional(),
});
export type RecommendationRequest = z.infer<typeof recommendationRequestSchema>;

export const recommendedModelSchema = z.object({
  provider: z.string(),
  modelId: z.string(),

  // Scores
  compositeScore: z.number(),
  qualityScore: z.number(),
  speedScore: z.number(),
  costScore: z.number(),
  reliabilityScore: z.number(),

  // Metadata
  modelName: z.string().optional(),
  contextWindow: z.number().int().optional(),
  inputPricePerMillion: z.number().optional(),
  outputPricePerMillion: z.number().optional(),

  // Match info
  matchReason: z.string().optional(),
  constraintViolations: z.array(z.string()).optional(),
});
export type RecommendedModel = z.infer<typeof recommendedModelSchema>;

export const recommendationResponseSchema = z.object({
  taskType: taskTypeSchema,
  recommendations: z.array(recommendedModelSchema),

  // Cache info
  cacheKey: z.string().optional(),
  cachedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
});
export type RecommendationResponse = z.infer<typeof recommendationResponseSchema>;

// =============================================================================
// Model Discovery Types
// =============================================================================

export const discoveredModelSchema = z.object({
  provider: z.string(),
  modelId: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),

  // Capabilities
  contextWindow: z.number().int().optional(),
  maxOutputTokens: z.number().int().optional(),
  capabilities: z.array(z.string()).optional(),

  // Pricing (per 1M tokens)
  inputPricePerMillion: z.number().optional(),
  outputPricePerMillion: z.number().optional(),

  // Status
  deprecated: z.boolean().optional(),
  available: z.boolean().default(true),

  // Last evaluation info
  lastEvaluatedAt: z.string().datetime().optional(),
  hasScores: z.boolean().default(false),
});
export type DiscoveredModel = z.infer<typeof discoveredModelSchema>;

// =============================================================================
// API Request/Response Types
// =============================================================================

export const runBenchmarkRequestSchema = z.object({
  provider: z.string(),
  modelId: z.string(),
  benchmarkId: z.string(),
  testCaseIds: z.array(z.string()).optional(),
  seed: z.number().int().optional(),
  /** Run in mock mode - returns simulated results without calling the actual provider */
  mock: z.boolean().optional().default(false),
});
export type RunBenchmarkRequest = z.infer<typeof runBenchmarkRequestSchema>;

export const listEvaluationsRequestSchema = z.object({
  provider: z.string().optional(),
  modelId: z.string().optional(),
  benchmarkId: z.string().optional(),
  taskType: taskTypeSchema.optional(),
  status: evalStatusSchema.optional(),
  limit: z.number().int().positive().default(50),
  offset: z.number().int().min(0).default(0),
});
export type ListEvaluationsRequest = z.infer<typeof listEvaluationsRequestSchema>;

export const getModelScoresRequestSchema = z.object({
  provider: z.string().optional(),
  modelId: z.string().optional(),
  taskType: taskTypeSchema.optional(),
});
export type GetModelScoresRequest = z.infer<typeof getModelScoresRequestSchema>;
