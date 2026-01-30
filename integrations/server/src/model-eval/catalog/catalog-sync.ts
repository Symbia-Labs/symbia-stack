/**
 * Catalog Sync Service
 *
 * Synchronizes discovered models from provider adapters to the Catalog service.
 * This keeps the catalog's integration resources in sync with what's actually
 * available from each provider.
 */

import { resolveServiceUrl, ServiceId } from "@symbia/sys";
import { getModelDiscoveryService, type DiscoveryResult } from "../discovery/model-discovery.js";
import type { DiscoveredModel } from "../types.js";
import { getRegisteredProviders } from "../../providers/base.js";

const CATALOG_SERVICE_URL = resolveServiceUrl(ServiceId.CATALOG);

// =============================================================================
// Types
// =============================================================================

export interface CatalogResource {
  id: string;
  key: string;
  name: string;
  description?: string;
  type: string;
  status: string;
  isBootstrap: boolean;
  tags: string[];
  accessPolicy?: {
    visibility: string;
    actions?: Record<string, { anyOf: string[] }>;
  };
  metadata: Record<string, unknown>;
}

export interface SyncOptions {
  /** Only sync these providers (default: all registered) */
  providers?: string[];

  /** API keys for dynamic discovery */
  apiKeys?: Record<string, string>;

  /** Dry run - don't actually update catalog */
  dryRun?: boolean;

  /** Force update even if resource exists */
  forceUpdate?: boolean;
}

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ key: string; error: string }>;
  resources: CatalogResource[];
  syncedAt: string;
}

// =============================================================================
// Provider Configuration Templates
// =============================================================================

const PROVIDER_CONFIGS: Record<string, Partial<CatalogResource>> = {
  openai: {
    name: "OpenAI Provider Configuration",
    description: "Configuration for OpenAI API integration",
    tags: ["ai", "llm", "openai", "integration"],
    metadata: {
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      authType: "bearer",
      endpoints: {
        "chat.completions": "/chat/completions",
        "responses": "/responses",
        "embeddings": "/embeddings",
      },
      defaultModel: "gpt-4o-mini",
      supportedOperations: ["chat.completions", "responses", "embeddings"],
    },
  },
  anthropic: {
    name: "Anthropic Provider Configuration",
    description: "Configuration for Anthropic Claude API",
    tags: ["ai", "llm", "anthropic", "integration"],
    metadata: {
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      authType: "header",
      authHeader: "x-api-key",
      endpoints: {
        messages: "/messages",
      },
      defaultModel: "claude-sonnet-4-20250514",
      supportedOperations: ["messages"],
    },
  },
  huggingface: {
    name: "HuggingFace Provider Configuration",
    description: "Configuration for HuggingFace Inference API",
    tags: ["ai", "llm", "huggingface", "integration"],
    metadata: {
      provider: "huggingface",
      baseUrl: "https://router.huggingface.co",
      authType: "bearer",
      endpoints: {
        "chat.completions": "/v1/chat/completions",
        "text.generation": "/v1/chat/completions",
        embeddings: "/v1/embeddings",
      },
      defaultModel: "meta-llama/Llama-3.2-3B-Instruct",
      supportedOperations: ["text.generation", "chat.completions", "embeddings"],
      note: "Uses OpenAI-compatible API format",
    },
  },
};

// =============================================================================
// Catalog Sync Service
// =============================================================================

export class CatalogSyncService {
  private discoveryService = getModelDiscoveryService();

  /**
   * Sync all discovered models to the catalog
   */
  async syncModels(options: SyncOptions = {}): Promise<SyncResult> {
    const {
      providers = getRegisteredProviders(),
      apiKeys = {},
      dryRun = false,
      forceUpdate = false,
    } = options;

    const result: SyncResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      resources: [],
      syncedAt: new Date().toISOString(),
    };

    // Filter to only supported providers
    const supportedProviders = providers.filter((p) =>
      ["openai", "anthropic", "huggingface"].includes(p)
    );

    // 1. Sync provider configs
    for (const provider of supportedProviders) {
      try {
        const configResource = this.createProviderConfigResource(provider);
        const syncResult = await this.syncResource(configResource, dryRun, forceUpdate);
        this.updateResultCounts(result, syncResult);
        result.resources.push(configResource);
      } catch (error) {
        result.errors.push({
          key: `integrations/ai/${provider}/config`,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // 2. Discover models from providers
    const discoveryResult: DiscoveryResult = await this.discoveryService.discoverModels({
      providers: supportedProviders,
      apiKeys,
      includeDeprecated: false,
    });

    // Log any discovery errors
    for (const err of discoveryResult.errors) {
      result.errors.push({
        key: `discovery/${err.provider}`,
        error: err.error,
      });
    }

    // 3. Sync model resources
    for (const model of discoveryResult.models) {
      try {
        const modelResource = this.createModelResource(model);
        const syncResult = await this.syncResource(modelResource, dryRun, forceUpdate);
        this.updateResultCounts(result, syncResult);
        result.resources.push(modelResource);
      } catch (error) {
        result.errors.push({
          key: `integrations/ai/${model.provider}/models/${model.modelId}`,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return result;
  }

  /**
   * Generate catalog resources without syncing (for preview/export)
   */
  async generateResources(options: SyncOptions = {}): Promise<CatalogResource[]> {
    const {
      providers = getRegisteredProviders(),
      apiKeys = {},
    } = options;

    const resources: CatalogResource[] = [];

    // Filter to only supported providers
    const supportedProviders = providers.filter((p) =>
      ["openai", "anthropic", "huggingface"].includes(p)
    );

    // Add provider configs
    for (const provider of supportedProviders) {
      resources.push(this.createProviderConfigResource(provider));
    }

    // Discover and add models
    const discoveryResult = await this.discoveryService.discoverModels({
      providers: supportedProviders,
      apiKeys,
      includeDeprecated: false,
    });

    for (const model of discoveryResult.models) {
      resources.push(this.createModelResource(model));
    }

    return resources;
  }

  /**
   * Export resources to JSON format (for bootstrap file)
   */
  async exportToJson(options: SyncOptions = {}): Promise<string> {
    const resources = await this.generateResources(options);
    return JSON.stringify(resources, null, 2);
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private createProviderConfigResource(provider: string): CatalogResource {
    const config = PROVIDER_CONFIGS[provider];
    if (!config) {
      throw new Error(`No config template for provider: ${provider}`);
    }

    return {
      id: `int-${provider}-config`,
      key: `integrations/ai/${provider}/config`,
      name: config.name || `${provider} Provider Configuration`,
      description: config.description,
      type: "integration",
      status: "published",
      isBootstrap: true,
      tags: config.tags || ["ai", "llm", provider, "integration"],
      accessPolicy: {
        visibility: "public",
        actions: {
          read: { anyOf: ["public"] },
          write: { anyOf: ["role:admin"] },
        },
      },
      metadata: config.metadata || {},
    };
  }

  private createModelResource(model: DiscoveredModel): CatalogResource {
    // Generate a clean ID from the model
    const modelIdClean = model.modelId
      .replace(/[^a-zA-Z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .toLowerCase();
    const id = `int-${model.provider}-${modelIdClean}`.slice(0, 64);

    // Determine capabilities for tags
    const capabilityTags = model.capabilities || [];
    const isEmbedding = capabilityTags.includes("embedding");
    const isReasoning = capabilityTags.includes("reasoning");

    // Build tags
    const tags = [
      "ai",
      isEmbedding ? "embedding" : "llm",
      model.provider,
      "model",
    ];

    // Add capability-specific tags
    if (isReasoning) tags.push("reasoning");
    if (capabilityTags.includes("vision")) tags.push("vision");
    if (capabilityTags.includes("function_calling")) tags.push("function_calling");
    if (capabilityTags.includes("open_source")) tags.push("open-source");

    return {
      id,
      key: `integrations/ai/${model.provider}/models/${model.modelId}`,
      name: model.name || model.modelId,
      description: model.description || `${model.provider} model: ${model.modelId}`,
      type: "integration",
      status: "published",
      isBootstrap: true,
      tags,
      metadata: {
        provider: model.provider,
        modelId: model.modelId,
        displayName: model.name || model.modelId,
        contextWindow: model.contextWindow,
        maxOutputTokens: model.maxOutputTokens,
        inputPricePerMillion: model.inputPricePerMillion,
        outputPricePerMillion: model.outputPricePerMillion,
        supportedOperations: isEmbedding ? ["embeddings"] : ["chat.completions"],
        capabilities: model.capabilities,
        deprecated: model.deprecated,
      },
    };
  }

  private async syncResource(
    resource: CatalogResource,
    dryRun: boolean,
    forceUpdate: boolean
  ): Promise<"created" | "updated" | "skipped"> {
    if (dryRun) {
      return "skipped";
    }

    try {
      // Check if resource exists
      const existingResponse = await fetch(
        `${CATALOG_SERVICE_URL}/api/resources?key=${encodeURIComponent(resource.key)}`
      );

      if (existingResponse.ok) {
        const existing = (await existingResponse.json()) as CatalogResource[];
        if (existing.length > 0) {
          if (!forceUpdate) {
            return "skipped";
          }

          // Update existing resource
          const updateResponse = await fetch(
            `${CATALOG_SERVICE_URL}/api/resources/${existing[0].id}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: resource.name,
                description: resource.description,
                tags: resource.tags,
                metadata: resource.metadata,
              }),
            }
          );

          if (!updateResponse.ok) {
            throw new Error(`Failed to update: ${updateResponse.statusText}`);
          }

          return "updated";
        }
      }

      // Create new resource
      const createResponse = await fetch(`${CATALOG_SERVICE_URL}/api/resources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resource),
      });

      if (!createResponse.ok) {
        throw new Error(`Failed to create: ${createResponse.statusText}`);
      }

      return "created";
    } catch (error) {
      throw error;
    }
  }

  private updateResultCounts(
    result: SyncResult,
    status: "created" | "updated" | "skipped"
  ): void {
    switch (status) {
      case "created":
        result.created++;
        break;
      case "updated":
        result.updated++;
        break;
      case "skipped":
        result.skipped++;
        break;
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let syncServiceInstance: CatalogSyncService | null = null;

export function getCatalogSyncService(): CatalogSyncService {
  if (!syncServiceInstance) {
    syncServiceInstance = new CatalogSyncService();
  }
  return syncServiceInstance;
}

/**
 * Convenience function to sync models to catalog
 */
export async function syncModelsToCatalog(
  options?: SyncOptions
): Promise<SyncResult> {
  return getCatalogSyncService().syncModels(options);
}

/**
 * Convenience function to export resources as JSON
 */
export async function exportCatalogResources(
  options?: SyncOptions
): Promise<string> {
  return getCatalogSyncService().exportToJson(options);
}
