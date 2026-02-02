/**
 * Model Sync - Catalog Registration
 *
 * Registers local models with the catalog service for discovery.
 * Models are stored as resources with key pattern:
 *   integrations/symbia-labs/models/{modelId}
 */

import { config } from "../config.js";
import type { LocalModel } from "../llama/engine.js";

export interface CatalogResource {
  key: string;
  name: string;
  type: "integration";
  status: "published" | "draft" | "archived";
  isBootstrap: boolean;
  tags: string[];
  metadata: Record<string, unknown>;
  accessPolicy?: {
    visibility: "public" | "private" | "org";
    actions: Record<string, { anyOf: string[] }>;
  };
}

export interface ModelCatalogMetadata {
  provider: string;
  modelId: string;
  filename: string;
  contextWindow: number;
  capabilities: string[];
  supportedOperations: string[];
  source?: {
    type: "local" | "huggingface";
    repo?: string;
    file?: string;
  };
  runtime: {
    framework: string;
    gpuLayers: number;
    threads: number;
  };
  memoryUsageMB: number;
  loaded: boolean;
  status: string;
}

/**
 * Build catalog resource key for a model
 */
export function buildModelKey(modelId: string): string {
  return `integrations/${config.providerName}/models/${modelId}`;
}

/**
 * Convert a LocalModel to a CatalogResource
 */
export function modelToCatalogResource(model: LocalModel): CatalogResource {
  const metadata: ModelCatalogMetadata = {
    provider: config.providerName,
    modelId: model.id,
    filename: model.filename,
    contextWindow: model.contextLength,
    capabilities: model.capabilities,
    supportedOperations: ["chat.completions", "completions"],
    source: {
      type: "local",
    },
    runtime: {
      framework: "node-llama-cpp",
      gpuLayers: config.defaultGpuLayers,
      threads: config.defaultThreads,
    },
    memoryUsageMB: model.memoryUsageMB,
    loaded: model.loaded,
    status: model.status,
  };

  return {
    key: buildModelKey(model.id),
    name: model.name,
    type: "integration",
    status: "published",
    isBootstrap: true,
    tags: ["ai", "llm", config.providerName, "local", "model", "gguf"],
    metadata,
    accessPolicy: {
      visibility: "public",
      actions: {
        read: { anyOf: ["public"] },
        write: { anyOf: ["cap:registry.write", "role:admin"] },
        delete: { anyOf: ["role:admin"] },
        publish: { anyOf: ["cap:registry.publish", "role:publisher"] },
      },
    },
  };
}

/**
 * Sync models to catalog service
 */
export async function syncModelsToCatalog(models: LocalModel[]): Promise<void> {
  const catalogUrl = config.catalogServiceUrl;
  if (!catalogUrl) {
    console.warn("[model-sync] CATALOG_SERVICE_URL not configured, skipping sync");
    return;
  }

  console.log(`[model-sync] Syncing ${models.length} models to catalog...`);

  for (const model of models) {
    try {
      const resource = modelToCatalogResource(model);
      await upsertCatalogResource(resource);
      console.log(`[model-sync] Synced model: ${model.id}`);
    } catch (err) {
      console.error(`[model-sync] Failed to sync model ${model.id}:`, err);
    }
  }

  console.log("[model-sync] Catalog sync complete");
}

/**
 * Upsert a resource in the catalog service
 */
async function upsertCatalogResource(resource: CatalogResource): Promise<void> {
  const catalogUrl = config.catalogServiceUrl;

  // Check if resource exists
  const existingRes = await fetch(
    `${catalogUrl}/api/resources/${encodeURIComponent(resource.key)}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        // Use internal service auth - catalog trusts internal requests
        "X-Service-Auth": "internal",
      },
    }
  );

  if (existingRes.ok) {
    // Update existing
    const response = await fetch(
      `${catalogUrl}/api/resources/${encodeURIComponent(resource.key)}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Service-Auth": "internal",
        },
        body: JSON.stringify(resource),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to update resource: ${response.status}`);
    }
  } else if (existingRes.status === 404) {
    // Create new
    const response = await fetch(`${catalogUrl}/api/resources`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Auth": "internal",
      },
      body: JSON.stringify(resource),
    });

    if (!response.ok) {
      throw new Error(`Failed to create resource: ${response.status}`);
    }
  } else {
    throw new Error(`Failed to check resource: ${existingRes.status}`);
  }
}

/**
 * Update model status in catalog (e.g., when loaded/unloaded)
 */
export async function updateModelStatus(
  modelId: string,
  loaded: boolean,
  status: string
): Promise<void> {
  const catalogUrl = config.catalogServiceUrl;
  if (!catalogUrl) return;

  const key = buildModelKey(modelId);

  try {
    // Fetch current resource
    const response = await fetch(
      `${catalogUrl}/api/resources/${encodeURIComponent(key)}`,
      {
        headers: {
          "X-Service-Auth": "internal",
        },
      }
    );

    if (!response.ok) {
      console.warn(`[model-sync] Model ${modelId} not in catalog`);
      return;
    }

    const resource = (await response.json()) as CatalogResource;
    const metadata = resource.metadata as ModelCatalogMetadata;
    metadata.loaded = loaded;
    metadata.status = status;

    // Update
    await fetch(`${catalogUrl}/api/resources/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Auth": "internal",
      },
      body: JSON.stringify(resource),
    });
  } catch (err) {
    console.error(`[model-sync] Failed to update model status:`, err);
  }
}

/**
 * Remove a model from catalog (e.g., when file deleted)
 */
export async function removeModelFromCatalog(modelId: string): Promise<void> {
  const catalogUrl = config.catalogServiceUrl;
  if (!catalogUrl) return;

  const key = buildModelKey(modelId);

  try {
    await fetch(`${catalogUrl}/api/resources/${encodeURIComponent(key)}`, {
      method: "DELETE",
      headers: {
        "X-Service-Auth": "internal",
      },
    });
    console.log(`[model-sync] Removed model from catalog: ${modelId}`);
  } catch (err) {
    console.error(`[model-sync] Failed to remove model:`, err);
  }
}

/**
 * Query catalog for all symbia-labs models
 */
export async function queryModelsFromCatalog(): Promise<CatalogResource[]> {
  const catalogUrl = config.catalogServiceUrl;
  if (!catalogUrl) return [];

  try {
    const prefix = `integrations/${config.providerName}/models`;
    const response = await fetch(
      `${catalogUrl}/api/resources?type=integration&prefix=${encodeURIComponent(prefix)}`,
      {
        headers: {
          "X-Service-Auth": "internal",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to query catalog: ${response.status}`);
    }

    const data = (await response.json()) as { resources: CatalogResource[] };
    return data.resources || [];
  } catch (err) {
    console.error("[model-sync] Failed to query catalog:", err);
    return [];
  }
}
