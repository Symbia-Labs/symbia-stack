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
  /** Serialized into catalog resource metadata, which is an open record. */
  [key: string]: unknown;
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
    // Artifact identity — durable, so it belongs on the card (unlike the
    // live fields removed below). `sha256:<hex>` of the weights file.
    ...(model.digest ? { digest: `sha256:${model.digest}` } : {}),
    ...(model.sizeBytes ? { sizeBytes: model.sizeBytes } : {}),
    // No `loaded`, `status`, or `memoryUsageMB` here. The card describes the
    // ARTIFACT; whether it is loaded right now is the registry's answer
    // (12 Aug ruling: real-time point instances never live in the catalog).
    // Those three fields were written on every boot until 15 Aug 2026 —
    // see experiments/model-derivation/DEFECTS.md §5.
  };

  return {
    key: buildModelKey(model.id),
    name: model.name,
    type: "integration",
    status: "published",
    // A runtime upsert is not a seed file. `true` here conflated the two,
    // which is STATUS §6.1's territory.
    isBootstrap: false,
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
/**
 * Find a catalog row by exact key, or null.
 *
 * Uses the list route with a `key` filter and re-filters client-side, so it
 * works against catalogs deployed before the filter existed (those ignore
 * unknown query params and return the full list). The previous
 * implementation GETed the key against `/api/resources/:id` — an id route —
 * saw 404 every time, and concluded "absent": the update branch of the
 * upsert below had NEVER run, and a second boot's re-POST died on the key's
 * unique constraint. Found 15 Aug 2026 by measuring, not by reading.
 */
async function findResourceByKey(
  key: string
): Promise<{ id: string; metadata?: Record<string, unknown> } | null> {
  const catalogUrl = config.catalogServiceUrl;
  const response = await fetch(
    `${catalogUrl}/api/resources?key=${encodeURIComponent(key)}`,
    {
      headers: { "X-Service-Auth": "internal" },
      signal: AbortSignal.timeout(5000),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to query resources by key: ${response.status}`);
  }
  const body = (await response.json()) as Array<{
    id: string;
    key: string;
    metadata?: Record<string, unknown>;
  }>;
  const rows = Array.isArray(body) ? body.filter((r) => r.key === key) : [];
  return rows[0] ?? null;
}

async function upsertCatalogResource(resource: CatalogResource): Promise<void> {
  const catalogUrl = config.catalogServiceUrl;
  const existing = await findResourceByKey(resource.key);

  if (existing) {
    // PATCH by row id — the only update verb the catalog has. The old code
    // PUT by key: no PUT route exists, so even with a working lookup the
    // update would have 404ed.
    const response = await fetch(`${catalogUrl}/api/resources/${existing.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Auth": "internal",
      },
      body: JSON.stringify({
        name: resource.name,
        tags: resource.tags,
        metadata: resource.metadata,
        status: resource.status,
        accessPolicy: resource.accessPolicy,
      }),
    });
    if (!response.ok) {
      throw new Error(`Failed to update resource: ${response.status}`);
    }
  } else {
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
  }
}

/**
 * The card's digest claim for a model, or null.
 *
 * Null means "could not ask" or "card makes no claim" — it must never be
 * read as a pass. The caller (engine load path) compares it against the
 * file's digest and DISCLOSES a mismatch rather than refusing; see the
 * ruling recorded on `LocalModel.cardDigestMismatch`.
 */
export async function fetchCardDigest(modelId: string): Promise<string | null> {
  const catalogUrl = config.catalogServiceUrl;
  if (!catalogUrl) return null;
  try {
    const row = await findResourceByKey(buildModelKey(modelId));
    const digest = row?.metadata?.digest;
    return typeof digest === "string" ? digest : null;
  } catch {
    return null;
  }
}

// `updateModelStatus` was removed 15 Aug 2026: its one job was writing
// `loaded`/`status` into catalog metadata — live state the card must not
// carry — and an import search found it had never had a caller. A function
// that exists only to commit a rule violation nothing invokes is worse than
// absent: it looks like the sanctioned way to do the wrong thing.

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
