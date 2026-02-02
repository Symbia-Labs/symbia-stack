/**
 * Symbia Models Service
 *
 * Local LLM inference service using node-llama-cpp with HuggingFace integration.
 * Provides OpenAI-compatible API endpoints for chat completions and embeddings.
 * Models are registered in the catalog service for discovery.
 */

import { createSymbiaServer } from "@symbia/http";
import { createTelemetryClient } from "@symbia/logging-client";
import { initServiceRelay, shutdownRelay } from "@symbia/relay";
import { ServiceId, resolveServicePort } from "@symbia/sys";
import { registerRoutes } from "./routes.js";
import { authMiddleware } from "./auth.js";
import { config } from "./config.js";
import { getEngine, initializeEngine } from "./llama/engine.js";
import { syncModelsToCatalog } from "./catalog/model-sync.js";

const serviceId = ServiceId.MODELS;

const telemetry = createTelemetryClient({
  serviceId,
});

const server = createSymbiaServer({
  serviceId,
  port: resolveServicePort(serviceId),
  host: config.host,
  telemetry: {
    client: telemetry,
    excludePaths: ["/health", "/health/live", "/health/ready"],
  },
  middleware: [authMiddleware],
  registerRoutes: async (httpServer, app) => {
    await registerRoutes(httpServer, app);
  },
  health: {
    enabled: true,
    enableLiveness: true,
    enableReadiness: true,
    livenessCheck: async () => {
      return { status: "ok" };
    },
    readinessCheck: async () => {
      // TODO: Check if at least one model is available
      return { status: "ok" };
    },
  },
  shutdown: {
    gracePeriodMs: 30000,
    preShutdownDelayMs: 5000,
    hooks: [
      async () => {
        console.log("[models] Unloading models...");
        try {
          const engine = getEngine();
          const models = await engine.listModels();
          for (const model of models) {
            if (model.loaded) {
              await engine.unloadModel(model.id);
            }
          }
        } catch (err) {
          console.warn("[models] Error unloading models:", err);
        }
      },
    ],
  },
});

server.start().then(async () => {
  console.log(`[models] Service started on port ${resolveServicePort(serviceId)}`);

  // Register with network service
  try {
    await initServiceRelay({
      serviceId,
      serviceName: "Models Service",
      capabilities: [
        "models.list",
        "models.load",
        "models.unload",
        "models.chat",
        "models.embed",
      ],
    });
    console.log("[models] Registered with network service");
  } catch (err) {
    console.warn("[models] Failed to register with network:", err);
  }

  // Initialize engine and scan models directory
  try {
    console.log("[models] Initializing LLM engine...");
    await initializeEngine();

    // Sync discovered models to catalog
    const engine = getEngine();
    const models = await engine.listModels();
    console.log(`[models] Found ${models.length} local models`);

    if (models.length > 0) {
      await syncModelsToCatalog(models);
    }
  } catch (err) {
    console.error("[models] Failed to initialize engine:", err);
  }
});

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  console.log(`[models] Received ${signal}, shutting down...`);
  try {
    await shutdownRelay();
  } catch (err) {
    console.warn("[models] Error during relay shutdown:", err);
  }
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
