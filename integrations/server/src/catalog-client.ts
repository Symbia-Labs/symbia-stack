import { resolveServiceUrl, ServiceId } from "@symbia/sys";
import type { ProviderConfig, ModelConfig, Integration, OpenAPIConfig } from "@shared/schema.js";
import { getProvider } from "./providers/index.js";
import type { ModelInfo } from "./providers/base.js";
import { integrationRegistry } from "./spec-parser/integration-registry.js";

const CATALOG_SERVICE_URL = resolveServiceUrl(ServiceId.CATALOG);

// Cache provider configs on startup
const providerConfigCache = new Map<string, ProviderConfig>();
const modelConfigCache = new Map<string, ModelConfig[]>();

interface CatalogResource {
  id: string;
  key: string;
  name: string;
  description?: string;
  type: string;
  status: string;
  metadata: Record<string, unknown>;
}

/**
 * Load all provider configurations from Catalog at startup
 */
export async function loadProviderConfigs(): Promise<void> {
  try {
    // Try to fetch bootstrap resources that include integration configs
    const response = await fetch(`${CATALOG_SERVICE_URL}/api/bootstrap`);

    if (!response.ok) {
      console.warn(`[integrations] Could not load provider configs from Catalog: ${response.statusText}`);
      loadDefaultConfigs();
      return;
    }

    const resources = await response.json() as CatalogResource[];

    for (const resource of resources) {
      // Load AI provider configs
      if (resource.key.startsWith("integrations/ai/") && resource.key.endsWith("/config")) {
        const config = resource.metadata as unknown as ProviderConfig;
        if (config.provider) {
          providerConfigCache.set(config.provider, config);
          console.log(`[integrations] Loaded config for provider: ${config.provider}`);
        }
      }

      // Load OpenAPI integrations (like Telegram)
      if (resource.type === "integration" && resource.metadata?.integrationType === "openapi") {
        await loadOpenAPIIntegration(resource);
      }
    }

    // If no configs loaded, use defaults
    if (providerConfigCache.size === 0) {
      loadDefaultConfigs();
    }
  } catch (error) {
    console.warn(`[integrations] Failed to connect to Catalog, using default configs:`, error);
    loadDefaultConfigs();
  }
}

/**
 * Load and register an OpenAPI integration from a catalog resource
 */
async function loadOpenAPIIntegration(resource: CatalogResource): Promise<void> {
  const metadata = resource.metadata as {
    integrationType: string;
    specUrl?: string;
    serverUrl?: string;
    authType?: string;
    channelType?: string;
    [key: string]: unknown;
  };

  if (!metadata.specUrl) {
    console.warn(`[integrations] OpenAPI integration ${resource.key} has no specUrl`);
    return;
  }

  const integration: Integration = {
    id: resource.id,
    key: resource.key,
    name: resource.name,
    description: resource.description,
    type: "openapi",
    openapi: {
      specUrl: metadata.specUrl,
      serverUrl: metadata.serverUrl,
    },
    auth: metadata.authType ? {
      type: metadata.authType as "bearer" | "none",
    } as any : undefined,
    status: "pending",
    version: 1,
    metadata: metadata,
  };

  try {
    const result = await integrationRegistry.register(integration);
    if (result.success) {
      console.log(`[integrations] Registered OpenAPI integration: ${resource.key} with ${result.operationCount} operations`);
    } else {
      console.warn(`[integrations] Failed to register ${resource.key}: ${result.error}`);
    }
  } catch (error) {
    console.error(`[integrations] Error registering ${resource.key}:`, error);
  }
}

/**
 * Load default provider configurations when Catalog is unavailable
 */
function loadDefaultConfigs(): void {
  const defaultOpenAI: ProviderConfig = {
    provider: "openai",
    baseUrl: "https://api.openai.com/v1",
    authType: "bearer",
    endpoints: {
      "chat.completions": "/chat/completions",
      "embeddings": "/embeddings",
    },
    defaultModel: "gpt-4o-mini",
    supportedOperations: ["chat.completions", "embeddings"],
  };

  const defaultHuggingFace: ProviderConfig = {
    provider: "huggingface",
    baseUrl: "https://router.huggingface.co",
    authType: "bearer",
    endpoints: {
      "chat.completions": "/v1/chat/completions",
      "text.generation": "/v1/chat/completions",
      "embeddings": "/v1/embeddings",
    },
    defaultModel: "meta-llama/Llama-3.2-3B-Instruct",
    supportedOperations: ["text.generation", "chat.completions", "embeddings"],
  };

  providerConfigCache.set("openai", defaultOpenAI);
  providerConfigCache.set("huggingface", defaultHuggingFace);

  console.log(`[integrations] Loaded default configs for: ${Array.from(providerConfigCache.keys()).join(", ")}`);
}

/**
 * Get provider configuration
 */
export function getProviderConfig(provider: string): ProviderConfig | undefined {
  return providerConfigCache.get(provider);
}

/**
 * Get all cached provider configurations
 */
export function getAllProviderConfigs(): ProviderConfig[] {
  return Array.from(providerConfigCache.values());
}

/**
 * Fetch available models for a provider
 * First tries to get from the provider adapter's listModels method,
 * then falls back to Catalog service
 */
export async function getModelsForProvider(provider: string, apiKey?: string): Promise<ModelConfig[]> {
  // Check cache first (unless apiKey is provided for dynamic fetch)
  if (!apiKey) {
    const cached = modelConfigCache.get(provider);
    if (cached && cached.length > 0) {
      return cached;
    }
  }

  // Try to get models from provider adapter first
  const adapter = getProvider(provider);
  if (adapter?.listModels) {
    try {
      const models = await adapter.listModels(apiKey);
      const modelConfigs = models.map(modelInfoToConfig);

      // Cache for future requests
      modelConfigCache.set(provider, modelConfigs);

      return modelConfigs;
    } catch (error) {
      console.warn(`[integrations] Failed to list models from ${provider} adapter:`, error);
    }
  }

  // Fallback to Catalog service
  try {
    const response = await fetch(
      `${CATALOG_SERVICE_URL}/api/resources?type=integration&prefix=integrations/ai/${provider}/models/`
    );

    if (!response.ok) {
      return [];
    }

    const resources = await response.json() as CatalogResource[];
    const models = resources.map(r => r.metadata as unknown as ModelConfig);

    // Cache for future requests
    modelConfigCache.set(provider, models);

    return models;
  } catch (error) {
    console.warn(`[integrations] Failed to fetch models for ${provider}:`, error);
    return [];
  }
}

/**
 * Convert ModelInfo from provider to ModelConfig
 */
function modelInfoToConfig(model: ModelInfo): ModelConfig {
  return {
    id: model.id,
    name: model.name,
    description: model.description,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutputTokens,
    capabilities: model.capabilities,
    inputPricing: model.inputPricing,
    outputPricing: model.outputPricing,
    deprecated: model.deprecated,
  };
}
