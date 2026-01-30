/**
 * Model Evaluation System
 *
 * Main entry point for the model evaluation, benchmarking,
 * and recommendation system.
 */

// =============================================================================
// Types
// =============================================================================

export * from "./types.js";

// =============================================================================
// Discovery
// =============================================================================

export {
  ModelDiscoveryService,
  getModelDiscoveryService,
  discoverAllModels,
  getModelsForTask,
  type DiscoveryOptions,
  type DiscoveryResult,
} from "./discovery/model-discovery.js";

// =============================================================================
// Benchmarks
// =============================================================================

export {
  registerBenchmark,
  registerBenchmarks,
  getBenchmark,
  getAllBenchmarks,
  getBenchmarksByTaskType,
  getBenchmarksByCategory,
  getBenchmarkIds,
  hasBenchmark,
  getBenchmarkSummary,
  initializeBuiltinBenchmarks,
  clearBenchmarkRegistry,
} from "./benchmarks/benchmark-registry.js";

export { routingBenchmarks } from "./benchmarks/suites/routing-benchmarks.js";
export { codeReviewBenchmarks } from "./benchmarks/suites/code-review-benchmarks.js";
export { reasoningBenchmarks } from "./benchmarks/suites/reasoning-benchmarks.js";
export { functionCallingBenchmarks } from "./benchmarks/suites/function-calling-benchmarks.js";

export {
  evaluate,
  registerEvaluator,
  getEvaluator,
  exactEvaluator,
  containsEvaluator,
  regexEvaluator,
  jsonSchemaEvaluator,
  functionCallEvaluator,
  semanticEvaluator,
  type EvaluatorContext,
  type EvaluatorResult,
  type Evaluator,
} from "./benchmarks/evaluators.js";

export {
  BenchmarkRunner,
  getBenchmarkRunner,
  type RunnerOptions,
} from "./benchmarks/benchmark-runner.js";

// =============================================================================
// Storage
// =============================================================================

export {
  modelEvaluations,
  modelScores,
  modelRecommendations,
  benchmarkDefinitions,
  evaluationSchedules,
  type ModelEvaluationRecord,
  type InsertModelEvaluation,
  type ModelScoreRecord,
  type InsertModelScore,
  type ModelRecommendationRecord,
  type InsertModelRecommendation,
  type BenchmarkDefinitionRecord,
  type InsertBenchmarkDefinition,
  type EvaluationScheduleRecord,
  type InsertEvaluationSchedule,
} from "./storage/eval-schema.js";

export {
  EvalRepository,
  getEvalRepository,
  generateRecommendationCacheKey,
  type EvaluationQuery,
  type ScoreQuery,
} from "./storage/eval-repository.js";

// =============================================================================
// Recommendation
// =============================================================================

export {
  RecommendationEngine,
  getRecommendationEngine,
  type RecommendationOptions,
} from "./recommendation/recommendation-engine.js";

export {
  ScoreAggregator,
  getScoreAggregator,
  type AggregationOptions,
} from "./recommendation/score-aggregator.js";

// =============================================================================
// API Routes
// =============================================================================

export { createEvalRoutes } from "./api/eval-routes.js";

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize the model evaluation system
 */
export async function initializeModelEvalSystem(): Promise<void> {
  // Initialize built-in benchmarks
  const { initializeBuiltinBenchmarks } = await import("./benchmarks/benchmark-registry.js");
  initializeBuiltinBenchmarks();

  console.log("[model-eval] System initialized");
}
