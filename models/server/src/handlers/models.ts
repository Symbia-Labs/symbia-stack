/**
 * Model management handlers
 */

import type { Request, Response } from "express";
import { getEngine } from "../llama/engine.js";

/**
 * List all available models (OpenAI-compatible format)
 */
export async function handleListModels(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const engine = getEngine();
    const models = await engine.listModels();

    // OpenAI-compatible response format
    const response = {
      object: "list",
      data: models.map((model) => ({
        id: model.id,
        object: "model",
        created: model.createdAt ? Math.floor(new Date(model.createdAt).getTime() / 1000) : 0,
        owned_by: "symbia-labs",
        permission: [],
        root: model.id,
        parent: null,
        // Extended fields
        capabilities: model.capabilities,
        context_length: model.contextLength,
        status: model.status,
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
