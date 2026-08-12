/**
 * Model management handlers
 */

import type { Request, Response } from "express";
import { getEngine } from "../llama/engine.js";
import { unifiedRegistry } from "../registry.js";

/**
 * List all available models — local AND remote (OpenAI-compatible format).
 *
 * Listed only local models until 12 Aug 2026, which is why `/v1/models`
 * returned `{"data": []}` on a stack with three usable remote providers
 * configured. The service named for models could not see most of them.
 *
 * THE OPENAI SHAPE IS KEPT AND EXTENDED, NOT REPLACED. Every entry still has
 * `id` / `object` / `created` / `owned_by`, so an OpenAI-compatible client
 * reads this without knowing anything about Symbia. The fields that shape
 * cannot carry — where a model runs, whether this service can actually execute
 * it, whether it is available to the caller — go under a single `symbia` key
 * rather than being scattered as loose extensions, so it is obvious which half
 * of the response is standard and which is ours.
 *
 * `symbia.brokered` is the load-bearing one. It is `false` for every remote
 * model today: they are LISTED, and this service cannot yet execute them.
 * Listing is not offering, and a registry that implied otherwise would be the
 * "registered ≠ running" defect this codebase already carries twice.
 */
export async function handleListModels(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // FORWARDED, NOT HELD. If the caller presents a token, it is passed to
    // integrations so the model ids can be the adapter's MEASURED list rather
    // than an advertised default. Without one the listing still works and says
    // `verified: false`. This service stores no credential either way.
    const bearer = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined;
    const orgId = req.headers["x-org-id"];
    const entries = await unifiedRegistry(
      bearer
        ? { token: bearer, orgId: typeof orgId === "string" ? orgId : undefined }
        : undefined
    );

    const response = {
      object: "list",
      data: entries.map((e) => ({
        id: e.id,
        object: "model",
        created: e.createdAt ? Math.floor(new Date(e.createdAt).getTime() / 1000) : 0,
        owned_by: e.provider,
        permission: [],
        root: e.id,
        parent: null,
        // Extended fields, kept for existing readers
        capabilities: e.capabilities,
        context_length: e.contextLength,
        status: e.status,
        // Symbia-native, in one place
        symbia: {
          source: e.source,
          provider: e.provider,
          brokered: e.brokered,
          availability: e.availability,
          availabilityReason: e.availabilityReason,
          operations: e.operations,
          // Where this id came from, and whether anything checked it.
          idSource: e.idSource,
          verified: e.verified,
          isProviderDefault: e.isProviderDefault,
        },
      })),
    };

    res.json(response);
  } catch (err) {
    console.error("[models] Error listing models:", err);
    res.status(500).json({
      error: {
        message: err instanceof Error ? err.message : "Failed to list models",
        type: "server_error",
      },
    });
  }
}

/**
 * Get a specific model's details
 */
export async function handleGetModel(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const engine = getEngine();
    const model = await engine.getModel(id);

    if (!model) {
      res.status(404).json({
        error: {
          message: `Model '${id}' not found`,
          type: "invalid_request_error",
          code: "model_not_found",
        },
      });
      return;
    }

    res.json({
      id: model.id,
      object: "model",
      created: model.createdAt ? Math.floor(new Date(model.createdAt).getTime() / 1000) : 0,
      owned_by: "symbia-labs",
      capabilities: model.capabilities,
      context_length: model.contextLength,
      status: model.status,
      loaded: model.loaded,
      memory_usage_mb: model.memoryUsageMB,
    });
  } catch (err) {
    console.error("[models] Error getting model:", err);
    res.status(500).json({
      error: {
        message: err instanceof Error ? err.message : "Failed to get model",
        type: "server_error",
      },
    });
  }
}

/**
 * Load a model into memory
 */
export async function handleLoadModel(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const engine = getEngine();

    // Unknown model is a client error (404), not a server fault.
    const known = await engine.getModel(id);
    if (!known) {
      res.status(404).json({
        error: {
          message: `Model '${id}' not found`,
          type: "invalid_request_error",
        },
      });
      return;
    }

    console.log(`[models] Loading model: ${id}`);
    await engine.loadModel(id);

    const model = await engine.getModel(id);
    res.json({
      success: true,
      model: {
        id: model?.id,
        status: model?.status,
        loaded: model?.loaded,
        memory_usage_mb: model?.memoryUsageMB,
      },
    });
  } catch (err) {
    console.error("[models] Error loading model:", err);
    res.status(500).json({
      error: {
        message: err instanceof Error ? err.message : "Failed to load model",
        type: "server_error",
      },
    });
  }
}

/**
 * Unload a model from memory
 */
export async function handleUnloadModel(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const engine = getEngine();

    // Unknown model is a client error (404), not a server fault.
    const known = await engine.getModel(id);
    if (!known) {
      res.status(404).json({
        error: {
          message: `Model '${id}' not found`,
          type: "invalid_request_error",
        },
      });
      return;
    }

    console.log(`[models] Unloading model: ${id}`);
    await engine.unloadModel(id);

    res.json({
      success: true,
      message: `Model '${id}' unloaded`,
    });
  } catch (err) {
    console.error("[models] Error unloading model:", err);
    res.status(500).json({
      error: {
        message: err instanceof Error ? err.message : "Failed to unload model",
        type: "server_error",
      },
    });
  }
}
