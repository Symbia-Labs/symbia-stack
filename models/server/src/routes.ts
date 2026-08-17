/**
 * Route registration for the Models Service
 */

import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { requireAuth } from "./auth.js";
import { handleChatCompletions } from "./handlers/chat-completions.js";
import { handleListModels, handleGetModel, handleLoadModel, handleUnloadModel } from "./handlers/models.js";
import { handleExecute } from "./handlers/execute.js";
import { handlePullModel } from "./handlers/pull.js";

import { classifyImage, visionReadiness } from "./vision.js";
import { apiDocumentation } from "./openapi.js";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<void> {
  // THE SPEC IS A ROUTE, SO IT BELONGS WITH THE ROUTES.
  //
  // This was mounted in index.ts, which meant it existed on the deployed
  // stack and nowhere else. Measured 16 Aug in the imagine sidecar: the
  // dispatcher fetches /docs/openapi.json to learn what a service can do,
  // got 404 for models, and reported zero operations — so every models
  // endpoint was unreachable through MCP, and the failure read as "no such
  // operation" rather than "the spec could not be fetched".
  app.get("/docs/openapi.json", (_req, res) => {
    res.json(apiDocumentation);
  });
  // OpenAI-compatible endpoints
  app.post("/v1/chat/completions", handleChatCompletions);
  app.get("/v1/models", handleListModels);
  app.get("/v1/models/:id", handleGetModel);

  // Symbia integration endpoint
  app.post("/api/integrations/execute", requireAuth, handleExecute);

  // Model management endpoints
  app.get("/api/models", handleListModels);

  // Acquire weights through the platform: egress-gated download, digest
  // during the stream, signed artifact.registered in the ledger, card in
  // the catalog. Replaces the QUICKSTART hand-curl (DEFECTS.md §2).
  app.post("/api/models/pull", requireAuth, handlePullModel);

  // Vision classification for captured frames (the spyglass).
  //
  // Reachable and registered whether or not a model exists. When none is
  // loaded it REFUSES with the specific thing that is missing, rather than
  // 404ing (which would read as "no such feature") or guessing (which would be
  // a confident answer standing on nothing).
  app.get("/api/vision/status", (_req, res) => {
    const missing = visionReadiness();
    res.json({ ready: missing.length === 0, missing });
  });

  app.post("/api/vision/classify", async (req, res) => {
    const { imageBase64, prompt, source } = (req.body ?? {}) as {
      imageBase64?: string; prompt?: string; source?: string;
    };
    if (!imageBase64) {
      res.status(400).json({ error: "imageBase64 required" });
      return;
    }
    res.json(await classifyImage({ imageBase64, prompt, source }));
  });
  app.get("/api/models/:id", handleGetModel);
  app.post("/api/models/:id/load", requireAuth, handleLoadModel);
  app.post("/api/models/:id/unload", requireAuth, handleUnloadModel);

  // Stats endpoint
  app.get("/api/stats", (req: Request, res: Response) => {
    // TODO: Return loaded models, memory usage, etc.
    res.json({
      loadedModels: 0,
      memoryUsageMB: 0,
      totalRequests: 0,
    });
  });

  // Error handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    console.error(`[models] Error: ${err.message}`);
    res.status(status).json({
      error: {
        message: err.message || "Internal server error",
        type: err.type || "internal_error",
        code: err.code || null,
      },
    });
  });
}
