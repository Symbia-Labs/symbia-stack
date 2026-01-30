/**
 * Model Discovery Service
 *
 * Aggregates models from all registered providers (OpenAI, HuggingFace, etc.)
 * and provides a unified interface for model enumeration.
 */

import { getProvider, getRegisteredProviders, type ModelInfo } from "../../providers/base.js";
import type { DiscoveredModel } from "../types.js";

// =============================================================================
// Types
// =============================================================================

export interface DiscoveryOptions {
  /** Only discover models from these providers */
  providers?: string[];

  /** Include deprecated models */
  includeDeprecated?: boolean;

  /** Filter by capabilities */
  capabilities?: string[];

  /** API keys by provider (for dynamic discovery) */
  apiKeys?: Record<string, string>;
}

export interface DiscoveryResult {
  models: DiscoveredModel[];
  errors: Array<{ provider: string; error: string }>;
  discoveredAt: string;
}

// =============================================================================
// Model Discovery Service
// =============================================================================

export class ModelDiscoveryService {
  private cache: Map<string, { models: DiscoveredModel[]; timestamp: number }> = new Map();
  private readonly cacheTTLMs = 5 * 60 * 1000; // 5 minutes

  /**
   * Discover all available models across providers
   */
  async discoverModels(options: DiscoveryOptions = {}): Promise<DiscoveryResult> {
    const {
      providers = getRegisteredProviders(),
      includeDeprecated = false,
      capabilities,
      apiKeys = {},
    } = options;

    const models: DiscoveredModel[] = [];
    const errors: Array<{ provider: string; error: string }> = [];

    // Discover models from each provider in parallel
    const discoveryPromises = providers.map(async (providerName) => {
      try {
        const providerModels = await this.discoverFromProvider(
          providerName,
          apiKeys[providerName]
        );
        return { provider: providerName, models: providerModels, error: null };
      } catch (error) {
        return {
          provider: providerName,
          models: [],
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    const results = await Promise.all(discoveryPromises);

    // Aggregate results
    for (const result of results) {
      if (result.error) {
        errors.push({ provider: result.provider, error: result.error });
      } else {
        models.push(...result.models);
      }
    }

    // Apply filters
    let filteredModels = models;

    if (!includeDeprecated) {
      filteredModels = filteredModels.filter((m) => !m.deprecated);
    }

    if (capabilities && capabilities.length > 0) {
      filteredModels = filteredModels.filter((m) =>
        capabilities.some((cap) => m.capabilities?.includes(cap))
      );
    }

    return {
      models: filteredModels,
      errors,
      discoveredAt: new Date().toISOString(),
    };
  }

  /**
   * Discover models from a specific provider
   */
  async discoverFromProvider(
    providerName: string,
    apiKey?: string
  ): Promise<DiscoveredModel[]> {
    // Check cache first (only if no API key - dynamic discovery bypasses cache)
    if (!apiKey) {
      const cached = this.cache.get(providerName);
      if (cached && Date.now() - cached.timestamp < this.cacheTTLMs) {
        return cached.models;
      }
    }

    const provider = getProvider(providerName);
    if (!provider) {
      throw new Error(`Provider "${providerName}" not registered`);
    }

    if (!provider.listModels) {
      // Provider doesn't support model listing
      return [];
    }

    const modelInfos = await provider.listModels(apiKey);
    const discoveredModels = modelInfos.map((info) =>
      this.convertToDiscoveredModel(providerName, info)
    );

    // Cache results (without API key)
    if (!apiKey) {
      this.cache.set(providerName, {
        models: discoveredModels,
        timestamp: Date.now(),
      });
    }

    return discoveredModels;
  }

  /**
   * Get a specific model by provider and ID
   */
  async getModel(
    provider: string,
    modelId: string,
    apiKey?: string
  ): Promise<DiscoveredModel | null> {
    const models = await this.discoverFromProvider(provider, apiKey);
    return models.find((m) => m.modelId === modelId) || null;
  }

  /**
   * Get models suitable for a specific task type
   */
  async getModelsForTask(
    taskType: "routing" | "conversational" | "code" | "reasoning" | "embedding" | "function_calling",
    options: DiscoveryOptions = {}
  ): Promise<DiscoveredModel[]> {
    // Map task types to required capabilities
    const capabilityMap: Record<string, string[]> = {
      routing: ["chat", "function_calling"],
      conversational: ["chat"],
      code: ["chat", "function_calling"],
      reasoning: ["chat", "reasoning"],
      embedding: ["embedding"],
      function_calling: ["chat", "function_calling"],
    };

    const requiredCapabilities = capabilityMap[taskType] || ["chat"];

    const result = await this.discoverModels({
      ...options,
      capabilities: requiredCapabilities,
    });

    // Sort by suitability for task
    return this.sortModelsForTask(result.models, taskType);
  }

  /**
   * Clear the discovery cache
   */
  clearCache(provider?: string): void {
    if (provider) {
      this.cache.delete(provider);
    } else {
      this.cache.clear();
    }
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private convertToDiscoveredModel(
    provider: string,
    info: ModelInfo
  ): DiscoveredModel {
    return {
      provider,
      modelId: info.id,
      name: info.name,
      description: info.description,
      contextWindow: info.contextWindow,
      maxOutputTokens: info.maxOutputTokens,
      capabilities: info.capabilities,
      inputPricePerMillion: info.inputPricing,
      outputPricePerMillion: info.outputPricing,
      deprecated: info.deprecated,
      available: true,
      hasScores: false, // Will be updated when scores are loaded
    };
  }

  private sortModelsForTask(
    models: DiscoveredModel[],
    taskType: string
  ): DiscoveredModel[] {
    return models.sort((a, b) => {
      // Prefer models with all required capabilities
      const capScore = (m: DiscoveredModel) => {
        let score = 0;
        if (m.capabilities?.includes("chat")) score += 1;
        if (m.capabilities?.includes("function_calling")) score += 2;
        if (m.capabilities?.includes("reasoning") && taskType === "reasoning") score += 4;
        if (m.capabilities?.includes("embedding") && taskType === "embedding") score += 10;
        return score;
      };

      const aScore = capScore(a);
      const bScore = capScore(b);

      if (aScore !== bScore) {
        return bScore - aScore;
      }

      // Then by context window (larger is better for most tasks)
      const aContext = a.contextWindow || 0;
      const bContext = b.contextWindow || 0;

      return bContext - aContext;
    });
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let discoveryInstance: ModelDiscoveryService | null = null;

export function getModelDiscoveryService(): ModelDiscoveryService {
  if (!discoveryInstance) {
    discoveryInstance = new ModelDiscoveryService();
  }
  return discoveryInstance;
}

/**
 * Convenience function to discover all models
 */
export async function discoverAllModels(
  options?: DiscoveryOptions
): Promise<DiscoveryResult> {
  return getModelDiscoveryService().discoverModels(options);
}

/**
 * Convenience function to get models for a task
 */
export async function getModelsForTask(
  taskType: "routing" | "conversational" | "code" | "reasoning" | "embedding" | "function_calling",
  options?: DiscoveryOptions
): Promise<DiscoveredModel[]> {
  return getModelDiscoveryService().getModelsForTask(taskType, options);
}
