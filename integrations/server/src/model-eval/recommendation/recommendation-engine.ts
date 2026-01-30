/**
 * Recommendation Engine
 *
 * Multi-criteria model selection based on evaluation scores.
 * Provides recommendations for best models for specific task types.
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  EvalRepository,
  getEvalRepository,
  generateRecommendationCacheKey,
} from "../storage/eval-repository.js";
import { getModelDiscoveryService } from "../discovery/model-discovery.js";
import type {
  TaskType,
  RecommendationRequest,
  RecommendationResponse,
  RecommendedModel,
  RecommendationConstraints,
  RecommendationWeights,
  DiscoveredModel,
} from "../types.js";
import type { ModelScoreRecord } from "../storage/eval-schema.js";

// =============================================================================
// Types
// =============================================================================

export interface RecommendationOptions {
  /** Use cached recommendations if available */
  useCache?: boolean;

  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTTLMs?: number;

  /** Include models without scores (using defaults) */
  includeUnscored?: boolean;
}

// =============================================================================
// Default Weights
// =============================================================================

const DEFAULT_WEIGHTS: RecommendationWeights = {
  quality: 0.4,
  speed: 0.25,
  cost: 0.25,
  reliability: 0.1,
};

// =============================================================================
// Recommendation Engine
// =============================================================================

export class RecommendationEngine {
  private repository: EvalRepository;
  private inMemoryCache: Map<string, { data: RecommendationResponse; expiresAt: number }> = new Map();
  private readonly defaultCacheTTLMs = 5 * 60 * 1000; // 5 minutes

  constructor(db: PostgresJsDatabase) {
    this.repository = getEvalRepository(db);
  }

  /**
   * Get model recommendations for a task type
   */
  async getRecommendations(
    request: RecommendationRequest,
    options: RecommendationOptions = {}
  ): Promise<RecommendationResponse> {
    const {
      useCache = true,
      cacheTTLMs = this.defaultCacheTTLMs,
      includeUnscored = false,
    } = options;

    const cacheKey = generateRecommendationCacheKey(
      request.taskType,
      request.constraints,
      request.orgId
    );

    // Check in-memory cache first
    if (useCache) {
      const cached = this.inMemoryCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
      }

      // Check database cache
      const dbCached = await this.repository.getCachedRecommendation(cacheKey);
      if (dbCached) {
        const response: RecommendationResponse = {
          taskType: request.taskType,
          recommendations: dbCached.recommendations,
          cacheKey,
          cachedAt: dbCached.createdAt.toISOString(),
          expiresAt: dbCached.expiresAt.toISOString(),
        };

        // Store in memory cache too
        this.inMemoryCache.set(cacheKey, {
          data: response,
          expiresAt: dbCached.expiresAt.getTime(),
        });

        return response;
      }
    }

    // Generate fresh recommendations
    const recommendations = await this.generateRecommendations(
      request,
      includeUnscored
    );

    const response: RecommendationResponse = {
      taskType: request.taskType,
      recommendations,
    };

    // Cache the results
    if (useCache && recommendations.length > 0) {
      const expiresAt = new Date(Date.now() + cacheTTLMs);

      // Store in database
      await this.repository.cacheRecommendation({
        taskType: request.taskType,
        constraints: request.constraints,
        recommendations,
        cacheKey,
        orgId: request.orgId,
        expiresAt,
      });

      // Store in memory
      this.inMemoryCache.set(cacheKey, {
        data: { ...response, cacheKey, cachedAt: new Date().toISOString(), expiresAt: expiresAt.toISOString() },
        expiresAt: expiresAt.getTime(),
      });
    }

    return response;
  }

  /**
   * Generate recommendations based on scores
   */
  private async generateRecommendations(
    request: RecommendationRequest,
    includeUnscored: boolean
  ): Promise<RecommendedModel[]> {
    const weights = { ...DEFAULT_WEIGHTS, ...request.weights };
    const limit = request.limit || 5;

    // Get scored models for this task type
    const scores = await this.repository.queryScores({
      taskType: request.taskType,
      orgId: request.orgId,
    });

    // Build recommendations from scores
    const recommendations: RecommendedModel[] = [];

    for (const score of scores) {
      const recommendation = this.scoreToRecommendation(score, weights);

      // Check constraints
      const violations = this.checkConstraints(recommendation, request.constraints);
      if (violations.length > 0) {
        recommendation.constraintViolations = violations;
        // Skip if hard constraints are violated
        if (this.hasHardViolation(violations)) {
          continue;
        }
      }

      recommendations.push(recommendation);
    }

    // If including unscored models, add discovered models without scores
    if (includeUnscored) {
      const discovery = getModelDiscoveryService();
      const discovered = await discovery.getModelsForTask(request.taskType);

      const scoredModelIds = new Set(scores.map((s) => `${s.provider}:${s.modelId}`));

      for (const model of discovered) {
        const key = `${model.provider}:${model.modelId}`;
        if (!scoredModelIds.has(key)) {
          recommendations.push(this.discoveredToRecommendation(model, weights));
        }
      }
    }

    // Sort by composite score (descending)
    recommendations.sort((a, b) => b.compositeScore - a.compositeScore);

    // Apply exclusions from constraints
    const filtered = this.applyExclusions(recommendations, request.constraints);

    return filtered.slice(0, limit);
  }

  /**
   * Convert a score record to a recommendation
   */
  private scoreToRecommendation(
    score: ModelScoreRecord,
    weights: RecommendationWeights
  ): RecommendedModel {
    // Recalculate composite with provided weights
    const compositeScore =
      score.qualityScore * weights.quality +
      score.speedScore * weights.speed +
      score.costScore * weights.cost +
      score.reliabilityScore * weights.reliability;

    return {
      provider: score.provider,
      modelId: score.modelId,
      compositeScore,
      qualityScore: score.qualityScore,
      speedScore: score.speedScore,
      costScore: score.costScore,
      reliabilityScore: score.reliabilityScore,
    };
  }

  /**
   * Convert a discovered model to a recommendation (using estimated scores)
   */
  private discoveredToRecommendation(
    model: DiscoveredModel,
    weights: RecommendationWeights
  ): RecommendedModel {
    // Estimate scores based on model properties
    const qualityScore = this.estimateQualityScore(model);
    const speedScore = this.estimateSpeedScore(model);
    const costScore = this.estimateCostScore(model);
    const reliabilityScore = 50; // Default for unscored models

    const compositeScore =
      qualityScore * weights.quality +
      speedScore * weights.speed +
      costScore * weights.cost +
      reliabilityScore * weights.reliability;

    return {
      provider: model.provider,
      modelId: model.modelId,
      compositeScore,
      qualityScore,
      speedScore,
      costScore,
      reliabilityScore,
      modelName: model.name,
      contextWindow: model.contextWindow,
      inputPricePerMillion: model.inputPricePerMillion,
      outputPricePerMillion: model.outputPricePerMillion,
      matchReason: "Estimated scores (not yet evaluated)",
    };
  }

  /**
   * Estimate quality score based on model properties
   */
  private estimateQualityScore(model: DiscoveredModel): number {
    let score = 50; // Base score

    // Larger context = potentially higher quality
    if (model.contextWindow) {
      if (model.contextWindow >= 128000) score += 15;
      else if (model.contextWindow >= 32000) score += 10;
      else if (model.contextWindow >= 8000) score += 5;
    }

    // More capabilities = higher quality
    if (model.capabilities) {
      score += model.capabilities.length * 3;
    }

    // Reasoning capability is valuable
    if (model.capabilities?.includes("reasoning")) {
      score += 10;
    }

    return Math.min(100, score);
  }

  /**
   * Estimate speed score based on model properties
   */
  private estimateSpeedScore(model: DiscoveredModel): number {
    // Smaller/simpler models are generally faster
    if (model.modelId.includes("mini")) return 85;
    if (model.modelId.includes("small")) return 80;
    if (model.modelId.includes("pro")) return 40;
    if (model.modelId.includes("large")) return 45;

    return 60; // Default
  }

  /**
   * Estimate cost score based on pricing
   */
  private estimateCostScore(model: DiscoveredModel): number {
    const inputPrice = model.inputPricePerMillion || 0;
    const outputPrice = model.outputPricePerMillion || 0;
    const avgPrice = (inputPrice + outputPrice) / 2;

    // Lower price = higher score
    if (avgPrice === 0) return 50; // Unknown
    if (avgPrice < 0.5) return 95;
    if (avgPrice < 2) return 80;
    if (avgPrice < 5) return 65;
    if (avgPrice < 15) return 50;
    if (avgPrice < 30) return 35;
    return 20;
  }

  /**
   * Check recommendation against constraints
   */
  private checkConstraints(
    recommendation: RecommendedModel,
    constraints?: RecommendationConstraints
  ): string[] {
    const violations: string[] = [];

    if (!constraints) return violations;

    if (
      constraints.minQualityScore !== undefined &&
      recommendation.qualityScore < constraints.minQualityScore
    ) {
      violations.push(
        `Quality score ${recommendation.qualityScore.toFixed(1)} below minimum ${constraints.minQualityScore}`
      );
    }

    // Note: latency and cost constraints would need actual metrics from evaluations
    // For now, we only check quality score

    return violations;
  }

  /**
   * Check if any violations are hard (should exclude model)
   */
  private hasHardViolation(violations: string[]): boolean {
    // Currently all violations are soft, but this could be extended
    return false;
  }

  /**
   * Apply exclusion filters from constraints
   */
  private applyExclusions(
    recommendations: RecommendedModel[],
    constraints?: RecommendationConstraints
  ): RecommendedModel[] {
    if (!constraints) return recommendations;

    let filtered = recommendations;

    if (constraints.excludeProviders && constraints.excludeProviders.length > 0) {
      const excluded = new Set(constraints.excludeProviders);
      filtered = filtered.filter((r) => !excluded.has(r.provider));
    }

    if (constraints.excludeModels && constraints.excludeModels.length > 0) {
      const excluded = new Set(constraints.excludeModels);
      filtered = filtered.filter((r) => !excluded.has(r.modelId));
    }

    return filtered;
  }

  /**
   * Clear the in-memory cache
   */
  clearCache(): void {
    this.inMemoryCache.clear();
  }

  /**
   * Cleanup expired entries from cache
   */
  async cleanupExpired(): Promise<void> {
    // Clean in-memory cache
    const now = Date.now();
    for (const [key, value] of this.inMemoryCache) {
      if (value.expiresAt < now) {
        this.inMemoryCache.delete(key);
      }
    }

    // Clean database cache
    await this.repository.clearExpiredRecommendations();
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let engineInstance: RecommendationEngine | null = null;

export function getRecommendationEngine(db: PostgresJsDatabase): RecommendationEngine {
  if (!engineInstance) {
    engineInstance = new RecommendationEngine(db);
  }
  return engineInstance;
}
