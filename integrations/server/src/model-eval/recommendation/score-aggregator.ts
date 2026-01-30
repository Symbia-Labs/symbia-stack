/**
 * Score Aggregator
 *
 * Aggregates evaluation results into composite model scores
 * across quality, speed, cost, and reliability dimensions.
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { EvalRepository, getEvalRepository } from "../storage/eval-repository.js";
import { getModelDiscoveryService } from "../discovery/model-discovery.js";
import type { TaskType, EvaluationResult, ModelScores } from "../types.js";
import type { ModelEvaluationRecord, InsertModelScore } from "../storage/eval-schema.js";

// =============================================================================
// Types
// =============================================================================

export interface AggregationOptions {
  /** Only consider evaluations from this time window */
  sinceDate?: Date;

  /** Minimum number of evaluations required */
  minEvaluations?: number;

  /** Whether to update scores in database */
  persist?: boolean;
}

interface ScoreComponents {
  quality: number;
  speed: number;
  cost: number;
  reliability: number;
}

// =============================================================================
// Score Thresholds (for normalization)
// =============================================================================

const LATENCY_THRESHOLDS = {
  excellent: 500,   // < 500ms = 100 score
  good: 1000,       // < 1000ms = 80 score
  acceptable: 2000, // < 2000ms = 60 score
  slow: 5000,       // < 5000ms = 40 score
  // > 5000ms = 20 score
};

const COST_THRESHOLDS = {
  // Cost per 1M tokens (input + output average)
  cheap: 0.5,       // < $0.50 = 100 score
  affordable: 2,    // < $2 = 80 score
  moderate: 5,      // < $5 = 60 score
  expensive: 15,    // < $15 = 40 score
  // > $15 = 20 score
};

// =============================================================================
// Score Aggregator
// =============================================================================

export class ScoreAggregator {
  private repository: EvalRepository;

  constructor(db: PostgresJsDatabase) {
    this.repository = getEvalRepository(db);
  }

  /**
   * Aggregate scores for a specific model and task type
   */
  async aggregateModelScores(
    provider: string,
    modelId: string,
    taskType: TaskType,
    options: AggregationOptions = {}
  ): Promise<ModelScores | null> {
    const { sinceDate, minEvaluations = 1, persist = true } = options;

    // Get relevant evaluations
    const evaluations = await this.repository.queryEvaluations({
      provider,
      modelId,
      status: "completed",
      limit: 100,
    });

    // Filter by task type based on benchmark ID prefix
    let relevantEvals = evaluations.filter((e) => {
      // Benchmark IDs are formatted as "taskType.category" (e.g., "code.security-detection")
      const benchmarkTaskType = e.benchmarkId.split(".")[0];
      return benchmarkTaskType === taskType;
    });

    if (sinceDate) {
      relevantEvals = relevantEvals.filter(
        (e) => e.completedAt && e.completedAt >= sinceDate
      );
    }

    if (relevantEvals.length < minEvaluations) {
      return null;
    }

    // Calculate component scores
    const scores = this.calculateScoreComponents(relevantEvals, provider, modelId);

    // Calculate composite score (default weights)
    const compositeScore =
      scores.quality * 0.4 +
      scores.speed * 0.25 +
      scores.cost * 0.25 +
      scores.reliability * 0.1;

    const evaluationIds = relevantEvals.map((e) => e.id);

    // Persist if requested
    if (persist) {
      await this.repository.upsertScore({
        provider,
        modelId,
        taskType,
        qualityScore: scores.quality,
        speedScore: scores.speed,
        costScore: scores.cost,
        reliabilityScore: scores.reliability,
        compositeScore,
        evaluationIds,
      });
    }

    return {
      id: `${provider}:${modelId}:${taskType}`,
      provider,
      modelId,
      taskType,
      qualityScore: scores.quality,
      speedScore: scores.speed,
      costScore: scores.cost,
      reliabilityScore: scores.reliability,
      compositeScore,
      evaluationIds,
      orgId: null,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Aggregate scores for all models with recent evaluations
   */
  async aggregateAllScores(
    taskType: TaskType,
    options: AggregationOptions = {}
  ): Promise<ModelScores[]> {
    // Get all recent evaluations
    const evaluations = await this.repository.queryEvaluations({
      status: "completed",
      limit: 1000,
    });

    // Group by provider:modelId
    const byModel = new Map<string, ModelEvaluationRecord[]>();
    for (const eval_ of evaluations) {
      const key = `${eval_.provider}:${eval_.modelId}`;
      if (!byModel.has(key)) {
        byModel.set(key, []);
      }
      byModel.get(key)!.push(eval_);
    }

    // Aggregate each model
    const results: ModelScores[] = [];
    for (const [key, modelEvals] of byModel) {
      const [provider, modelId] = key.split(":");
      const score = await this.aggregateModelScores(
        provider,
        modelId,
        taskType,
        { ...options, persist: options.persist }
      );
      if (score) {
        results.push(score);
      }
    }

    // Sort by composite score
    results.sort((a, b) => b.compositeScore - a.compositeScore);

    return results;
  }

  /**
   * Calculate score components from evaluations
   */
  private calculateScoreComponents(
    evaluations: ModelEvaluationRecord[],
    provider: string,
    modelId: string
  ): ScoreComponents {
    if (evaluations.length === 0) {
      return { quality: 50, speed: 50, cost: 50, reliability: 50 };
    }

    // Quality: based on overall scores and accuracy
    const qualityScores = evaluations.map((e) => e.overallScore * 100);
    const qualityAvg = this.average(qualityScores);

    // Speed: based on latency percentiles
    const latencies = evaluations.map((e) => e.latencyP50Ms);
    const avgLatency = this.average(latencies);
    const speedScore = this.latencyToScore(avgLatency);

    // Cost: based on estimated costs (or inferred from model info)
    const costScore = this.calculateCostScore(evaluations, provider, modelId);

    // Reliability: based on success rate and consistency
    const successRate = evaluations.filter((e) => e.status === "completed").length / evaluations.length;
    const scoreVariance = this.variance(qualityScores);
    const consistencyBonus = Math.max(0, 20 - scoreVariance); // Lower variance = bonus
    const reliabilityScore = successRate * 80 + consistencyBonus;

    return {
      quality: Math.round(qualityAvg),
      speed: Math.round(speedScore),
      cost: Math.round(costScore),
      reliability: Math.round(Math.min(100, reliabilityScore)),
    };
  }

  /**
   * Convert latency to 0-100 score
   */
  private latencyToScore(latencyMs: number): number {
    if (latencyMs < LATENCY_THRESHOLDS.excellent) return 100;
    if (latencyMs < LATENCY_THRESHOLDS.good) return 80;
    if (latencyMs < LATENCY_THRESHOLDS.acceptable) return 60;
    if (latencyMs < LATENCY_THRESHOLDS.slow) return 40;
    return 20;
  }

  /**
   * Calculate cost score from evaluations or model metadata
   */
  private calculateCostScore(
    evaluations: ModelEvaluationRecord[],
    provider: string,
    modelId: string
  ): number {
    // First, try to use actual cost data from evaluations
    const costs = evaluations
      .filter((e) => e.estimatedCostCents > 0)
      .map((e) => {
        const totalTokens = e.totalInputTokens + e.totalOutputTokens;
        if (totalTokens === 0) return 0;
        // Convert cents per tokens to dollars per million tokens
        return (e.estimatedCostCents / 100) / (totalTokens / 1_000_000);
      })
      .filter((c) => c > 0);

    if (costs.length > 0) {
      const avgCostPerMillion = this.average(costs);
      return this.costToScore(avgCostPerMillion);
    }

    // Fallback: estimate from model metadata
    const discovery = getModelDiscoveryService();
    // Note: This is sync access to potentially cached data
    // In production, you'd want to pre-fetch this
    return 50; // Default middle score if no cost data
  }

  /**
   * Convert cost per million tokens to 0-100 score
   */
  private costToScore(costPerMillion: number): number {
    if (costPerMillion < COST_THRESHOLDS.cheap) return 100;
    if (costPerMillion < COST_THRESHOLDS.affordable) return 80;
    if (costPerMillion < COST_THRESHOLDS.moderate) return 60;
    if (costPerMillion < COST_THRESHOLDS.expensive) return 40;
    return 20;
  }

  /**
   * Calculate average of numbers
   */
  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * Calculate variance of numbers
   */
  private variance(values: number[]): number {
    if (values.length < 2) return 0;
    const avg = this.average(values);
    const squaredDiffs = values.map((v) => Math.pow(v - avg, 2));
    return this.average(squaredDiffs);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

let aggregatorInstance: ScoreAggregator | null = null;

export function getScoreAggregator(db: PostgresJsDatabase): ScoreAggregator {
  if (!aggregatorInstance) {
    aggregatorInstance = new ScoreAggregator(db);
  }
  return aggregatorInstance;
}
