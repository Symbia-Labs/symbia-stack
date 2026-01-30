/**
 * Model Evaluation Database Schema
 *
 * Drizzle schema for storing evaluation results, model scores,
 * and cached recommendations.
 */

import { pgTable, varchar, text, integer, timestamp, json, index, real, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type {
  TestCaseResult,
  EvalRunConfig,
  TaskType,
  EvalStatus,
  RecommendedModel,
  RecommendationConstraints,
} from "../types.js";

// =============================================================================
// Model Evaluations - Individual benchmark runs
// =============================================================================

export const modelEvaluations = pgTable("model_evaluations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Model identity
  provider: varchar("provider", { length: 100 }).notNull(),
  modelId: varchar("model_id", { length: 255 }).notNull(),

  // Benchmark identity
  benchmarkId: varchar("benchmark_id", { length: 255 }).notNull(),
  benchmarkVersion: varchar("benchmark_version", { length: 50 }).notNull(),

  // Aggregate scores (0-1 normalized)
  overallScore: real("overall_score").notNull(),
  accuracy: real("accuracy").notNull(),

  // Latency metrics (milliseconds)
  latencyP50Ms: integer("latency_p50_ms").notNull(),
  latencyP95Ms: integer("latency_p95_ms").notNull(),
  latencyP99Ms: integer("latency_p99_ms"),

  // Token usage
  totalInputTokens: integer("total_input_tokens").notNull(),
  totalOutputTokens: integer("total_output_tokens").notNull(),
  estimatedCostCents: real("estimated_cost_cents").notNull(),

  // Individual test case results (stored as JSON)
  testCaseResults: json("test_case_results").$type<TestCaseResult[]>().notNull(),

  // Run configuration
  runConfig: json("run_config").$type<EvalRunConfig>().notNull(),

  // Scope
  orgId: varchar("org_id", { length: 100 }),
  scope: varchar("scope", { length: 20 }).notNull().default("global"),

  // Status
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  errorMessage: text("error_message"),

  // Timestamps
  startedAt: timestamp("started_at").notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  providerIdx: index("idx_model_evaluations_provider").on(table.provider),
  modelIdx: index("idx_model_evaluations_model").on(table.modelId),
  benchmarkIdx: index("idx_model_evaluations_benchmark").on(table.benchmarkId),
  providerModelIdx: index("idx_model_evaluations_provider_model").on(table.provider, table.modelId),
  statusIdx: index("idx_model_evaluations_status").on(table.status),
  orgIdx: index("idx_model_evaluations_org").on(table.orgId),
  completedIdx: index("idx_model_evaluations_completed").on(table.completedAt),
}));

export type ModelEvaluationRecord = typeof modelEvaluations.$inferSelect;
export type InsertModelEvaluation = typeof modelEvaluations.$inferInsert;

// =============================================================================
// Model Scores - Aggregated scores by task type
// =============================================================================

export const modelScores = pgTable("model_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // Model identity
  provider: varchar("provider", { length: 100 }).notNull(),
  modelId: varchar("model_id", { length: 255 }).notNull(),

  // Task type this score applies to
  taskType: varchar("task_type", { length: 50 }).notNull(),

  // Component scores (0-100 scale)
  qualityScore: real("quality_score").notNull(),
  speedScore: real("speed_score").notNull(),
  costScore: real("cost_score").notNull(),
  reliabilityScore: real("reliability_score").notNull(),

  // Weighted composite score
  compositeScore: real("composite_score").notNull(),

  // Source evaluations that contributed to this score
  evaluationIds: json("evaluation_ids").$type<string[]>().notNull().default([]),

  // Scope
  orgId: varchar("org_id", { length: 100 }),

  // Timestamps
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  providerIdx: index("idx_model_scores_provider").on(table.provider),
  modelIdx: index("idx_model_scores_model").on(table.modelId),
  taskTypeIdx: index("idx_model_scores_task_type").on(table.taskType),
  providerModelTaskIdx: index("idx_model_scores_provider_model_task").on(
    table.provider,
    table.modelId,
    table.taskType
  ),
  compositeIdx: index("idx_model_scores_composite").on(table.compositeScore),
  orgIdx: index("idx_model_scores_org").on(table.orgId),
}));

export type ModelScoreRecord = typeof modelScores.$inferSelect;
export type InsertModelScore = typeof modelScores.$inferInsert;

// =============================================================================
// Model Recommendations - Cached recommendation results
// =============================================================================

export const modelRecommendations = pgTable("model_recommendations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // What task type this recommendation is for
  taskType: varchar("task_type", { length: 50 }).notNull(),

  // Request constraints used to generate this recommendation
  constraints: json("constraints").$type<RecommendationConstraints>(),

  // The actual recommendations
  recommendations: json("recommendations").$type<RecommendedModel[]>().notNull(),

  // Cache key for quick lookup
  cacheKey: varchar("cache_key", { length: 255 }).notNull().unique(),

  // Scope
  orgId: varchar("org_id", { length: 100 }),

  // Cache expiry
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  taskTypeIdx: index("idx_model_recommendations_task_type").on(table.taskType),
  cacheKeyIdx: index("idx_model_recommendations_cache_key").on(table.cacheKey),
  expiresIdx: index("idx_model_recommendations_expires").on(table.expiresAt),
  orgIdx: index("idx_model_recommendations_org").on(table.orgId),
}));

export type ModelRecommendationRecord = typeof modelRecommendations.$inferSelect;
export type InsertModelRecommendation = typeof modelRecommendations.$inferInsert;

// =============================================================================
// Benchmark Definitions - Stored benchmark configurations
// =============================================================================

export const benchmarkDefinitions = pgTable("benchmark_definitions", {
  id: varchar("id").primaryKey(),  // e.g., "routing.intent-classification"

  // Metadata
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  version: varchar("version", { length: 50 }).notNull(),

  // Categorization
  taskType: varchar("task_type", { length: 50 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),

  // Test cases stored as JSON
  testCases: json("test_cases").$type<unknown[]>().notNull(),

  // Configuration
  config: json("config").$type<{
    maxTokens?: number;
    temperature?: number;
    seed?: number;
    timeout?: number;
  }>(),

  // Metadata
  author: varchar("author", { length: 255 }),
  isBuiltin: boolean("is_builtin").notNull().default(false),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  taskTypeIdx: index("idx_benchmark_definitions_task_type").on(table.taskType),
  categoryIdx: index("idx_benchmark_definitions_category").on(table.category),
  versionIdx: index("idx_benchmark_definitions_version").on(table.version),
}));

export type BenchmarkDefinitionRecord = typeof benchmarkDefinitions.$inferSelect;
export type InsertBenchmarkDefinition = typeof benchmarkDefinitions.$inferInsert;

// =============================================================================
// Evaluation Schedule - Track scheduled evaluation jobs
// =============================================================================

export const evaluationSchedules = pgTable("evaluation_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // What to evaluate
  provider: varchar("provider", { length: 100 }),  // null = all providers
  modelId: varchar("model_id", { length: 255 }),   // null = all models
  benchmarkId: varchar("benchmark_id", { length: 255 }),  // null = all benchmarks
  taskType: varchar("task_type", { length: 50 }),  // null = all task types

  // Schedule configuration
  cronExpression: varchar("cron_expression", { length: 100 }).notNull(),
  intervalHours: integer("interval_hours"),  // Alternative to cron

  // Status
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  lastError: text("last_error"),

  // Scope
  orgId: varchar("org_id", { length: 100 }),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  enabledIdx: index("idx_evaluation_schedules_enabled").on(table.enabled),
  nextRunIdx: index("idx_evaluation_schedules_next_run").on(table.nextRunAt),
  orgIdx: index("idx_evaluation_schedules_org").on(table.orgId),
}));

export type EvaluationScheduleRecord = typeof evaluationSchedules.$inferSelect;
export type InsertEvaluationSchedule = typeof evaluationSchedules.$inferInsert;
