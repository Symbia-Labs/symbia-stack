/**
 * Evaluation Repository
 *
 * Data access layer for model evaluations, scores, and recommendations.
 */

import { eq, and, desc, sql, gte, lte, isNull, or } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
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
} from "./eval-schema.js";
import type {
  TaskType,
  EvalStatus,
  EvaluationResult,
  ModelScores,
  RecommendedModel,
  RecommendationConstraints,
  BenchmarkDefinition,
} from "../types.js";

// =============================================================================
// Types
// =============================================================================

export interface EvaluationQuery {
  provider?: string;
  modelId?: string;
  benchmarkId?: string;
  taskType?: TaskType;
  status?: EvalStatus;
  orgId?: string | null;
  limit?: number;
  offset?: number;
}

export interface ScoreQuery {
  provider?: string;
  modelId?: string;
  taskType?: TaskType;
  orgId?: string | null;
  minCompositeScore?: number;
}

// =============================================================================
// Evaluation Repository Class
// =============================================================================

export class EvalRepository {
  constructor(private db: PostgresJsDatabase) {}

  // ===========================================================================
  // Evaluations
  // ===========================================================================

  /**
   * Create a new evaluation record
   */
  async createEvaluation(data: InsertModelEvaluation): Promise<ModelEvaluationRecord> {
    const [result] = await this.db.insert(modelEvaluations).values(data).returning();
    return result;
  }

  /**
   * Update an evaluation record
   */
  async updateEvaluation(
    id: string,
    data: Partial<InsertModelEvaluation>
  ): Promise<ModelEvaluationRecord | null> {
    const [result] = await this.db
      .update(modelEvaluations)
      .set(data)
      .where(eq(modelEvaluations.id, id))
      .returning();
    return result || null;
  }

  /**
   * Get an evaluation by ID
   */
  async getEvaluation(id: string): Promise<ModelEvaluationRecord | null> {
    const [result] = await this.db
      .select()
      .from(modelEvaluations)
      .where(eq(modelEvaluations.id, id))
      .limit(1);
    return result || null;
  }

  /**
   * Query evaluations with filters
   */
  async queryEvaluations(query: EvaluationQuery): Promise<ModelEvaluationRecord[]> {
    const conditions = [];

    if (query.provider) {
      conditions.push(eq(modelEvaluations.provider, query.provider));
    }
    if (query.modelId) {
      conditions.push(eq(modelEvaluations.modelId, query.modelId));
    }
    if (query.benchmarkId) {
      conditions.push(eq(modelEvaluations.benchmarkId, query.benchmarkId));
    }
    if (query.status) {
      conditions.push(eq(modelEvaluations.status, query.status));
    }
    if (query.orgId !== undefined) {
      if (query.orgId === null) {
        conditions.push(isNull(modelEvaluations.orgId));
      } else {
        conditions.push(eq(modelEvaluations.orgId, query.orgId));
      }
    }

    return this.db
      .select()
      .from(modelEvaluations)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(modelEvaluations.completedAt))
      .limit(query.limit || 50)
      .offset(query.offset || 0);
  }

  /**
   * Get the latest evaluation for a model/benchmark combination
   */
  async getLatestEvaluation(
    provider: string,
    modelId: string,
    benchmarkId: string
  ): Promise<ModelEvaluationRecord | null> {
    const [result] = await this.db
      .select()
      .from(modelEvaluations)
      .where(
        and(
          eq(modelEvaluations.provider, provider),
          eq(modelEvaluations.modelId, modelId),
          eq(modelEvaluations.benchmarkId, benchmarkId),
          eq(modelEvaluations.status, "completed")
        )
      )
      .orderBy(desc(modelEvaluations.completedAt))
      .limit(1);
    return result || null;
  }

  /**
   * Delete old evaluations (for cleanup)
   */
  async deleteOldEvaluations(olderThan: Date): Promise<number> {
    const result = await this.db
      .delete(modelEvaluations)
      .where(lte(modelEvaluations.createdAt, olderThan));
    return result.count || 0;
  }

  // ===========================================================================
  // Model Scores
  // ===========================================================================

  /**
   * Upsert a model score
   */
  async upsertScore(data: InsertModelScore): Promise<ModelScoreRecord> {
    const [result] = await this.db
      .insert(modelScores)
      .values(data)
      .onConflictDoUpdate({
        target: [modelScores.provider, modelScores.modelId, modelScores.taskType],
        set: {
          qualityScore: data.qualityScore,
          speedScore: data.speedScore,
          costScore: data.costScore,
          reliabilityScore: data.reliabilityScore,
          compositeScore: data.compositeScore,
          evaluationIds: data.evaluationIds,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  /**
   * Get scores for a specific model and task type
   */
  async getScore(
    provider: string,
    modelId: string,
    taskType: TaskType
  ): Promise<ModelScoreRecord | null> {
    const [result] = await this.db
      .select()
      .from(modelScores)
      .where(
        and(
          eq(modelScores.provider, provider),
          eq(modelScores.modelId, modelId),
          eq(modelScores.taskType, taskType)
        )
      )
      .limit(1);
    return result || null;
  }

  /**
   * Query model scores
   */
  async queryScores(query: ScoreQuery): Promise<ModelScoreRecord[]> {
    const conditions = [];

    if (query.provider) {
      conditions.push(eq(modelScores.provider, query.provider));
    }
    if (query.modelId) {
      conditions.push(eq(modelScores.modelId, query.modelId));
    }
    if (query.taskType) {
      conditions.push(eq(modelScores.taskType, query.taskType));
    }
    if (query.minCompositeScore !== undefined) {
      conditions.push(gte(modelScores.compositeScore, query.minCompositeScore));
    }
    if (query.orgId !== undefined) {
      if (query.orgId === null) {
        conditions.push(isNull(modelScores.orgId));
      } else {
        conditions.push(
          or(isNull(modelScores.orgId), eq(modelScores.orgId, query.orgId))
        );
      }
    }

    return this.db
      .select()
      .from(modelScores)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(modelScores.compositeScore));
  }

  /**
   * Get top models for a task type
   */
  async getTopModels(
    taskType: TaskType,
    limit: number = 10,
    constraints?: RecommendationConstraints
  ): Promise<ModelScoreRecord[]> {
    const conditions = [eq(modelScores.taskType, taskType)];

    if (constraints?.minQualityScore !== undefined) {
      conditions.push(gte(modelScores.qualityScore, constraints.minQualityScore));
    }

    return this.db
      .select()
      .from(modelScores)
      .where(and(...conditions))
      .orderBy(desc(modelScores.compositeScore))
      .limit(limit);
  }

  // ===========================================================================
  // Recommendations Cache
  // ===========================================================================

  /**
   * Get cached recommendation
   */
  async getCachedRecommendation(
    cacheKey: string
  ): Promise<ModelRecommendationRecord | null> {
    const [result] = await this.db
      .select()
      .from(modelRecommendations)
      .where(
        and(
          eq(modelRecommendations.cacheKey, cacheKey),
          gte(modelRecommendations.expiresAt, new Date())
        )
      )
      .limit(1);
    return result || null;
  }

  /**
   * Save recommendation to cache
   */
  async cacheRecommendation(
    data: InsertModelRecommendation
  ): Promise<ModelRecommendationRecord> {
    // Delete existing cache entry if any
    await this.db
      .delete(modelRecommendations)
      .where(eq(modelRecommendations.cacheKey, data.cacheKey));

    const [result] = await this.db
      .insert(modelRecommendations)
      .values(data)
      .returning();
    return result;
  }

  /**
   * Clear expired recommendations
   */
  async clearExpiredRecommendations(): Promise<number> {
    const result = await this.db
      .delete(modelRecommendations)
      .where(lte(modelRecommendations.expiresAt, new Date()));
    return result.count || 0;
  }

  // ===========================================================================
  // Benchmark Definitions (stored in DB for version tracking)
  // ===========================================================================

  /**
   * Upsert a benchmark definition
   */
  async upsertBenchmark(
    data: InsertBenchmarkDefinition
  ): Promise<BenchmarkDefinitionRecord> {
    const [result] = await this.db
      .insert(benchmarkDefinitions)
      .values(data)
      .onConflictDoUpdate({
        target: benchmarkDefinitions.id,
        set: {
          name: data.name,
          description: data.description,
          version: data.version,
          taskType: data.taskType,
          category: data.category,
          testCases: data.testCases,
          config: data.config,
          author: data.author,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  /**
   * Get a benchmark definition by ID
   */
  async getBenchmark(id: string): Promise<BenchmarkDefinitionRecord | null> {
    const [result] = await this.db
      .select()
      .from(benchmarkDefinitions)
      .where(eq(benchmarkDefinitions.id, id))
      .limit(1);
    return result || null;
  }

  /**
   * List all benchmark definitions
   */
  async listBenchmarks(): Promise<BenchmarkDefinitionRecord[]> {
    return this.db
      .select()
      .from(benchmarkDefinitions)
      .orderBy(benchmarkDefinitions.taskType, benchmarkDefinitions.category);
  }

  // ===========================================================================
  // Evaluation Schedules
  // ===========================================================================

  /**
   * Get due schedules
   */
  async getDueSchedules(): Promise<typeof evaluationSchedules.$inferSelect[]> {
    return this.db
      .select()
      .from(evaluationSchedules)
      .where(
        and(
          eq(evaluationSchedules.enabled, true),
          lte(evaluationSchedules.nextRunAt, new Date())
        )
      );
  }

  /**
   * Update schedule after run
   */
  async updateScheduleRun(
    id: string,
    nextRunAt: Date,
    error?: string
  ): Promise<void> {
    await this.db
      .update(evaluationSchedules)
      .set({
        lastRunAt: new Date(),
        nextRunAt,
        lastError: error || null,
        updatedAt: new Date(),
      })
      .where(eq(evaluationSchedules.id, id));
  }
}

// =============================================================================
// Factory Function
// =============================================================================

let repositoryInstance: EvalRepository | null = null;

export function getEvalRepository(db: PostgresJsDatabase): EvalRepository {
  if (!repositoryInstance) {
    repositoryInstance = new EvalRepository(db);
  }
  return repositoryInstance;
}

/**
 * Generate cache key for recommendations
 */
export function generateRecommendationCacheKey(
  taskType: TaskType,
  constraints?: RecommendationConstraints,
  orgId?: string
): string {
  const parts = [
    taskType,
    orgId || "global",
    constraints ? JSON.stringify(constraints) : "no-constraints",
  ];
  return parts.join(":");
}
