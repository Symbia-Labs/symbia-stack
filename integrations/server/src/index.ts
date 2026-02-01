import { createSymbiaServer } from "@symbia/http";
import { initServiceRelay, shutdownRelay } from "@symbia/relay";
import { ServiceId } from "@symbia/sys";
import { registerRoutes } from "./routes.js";
import { database, exportToFile, isMemory } from "./db.js";
import { loadProviderConfigs } from "./catalog-client.js";
import { loadInternalServices } from "./internal-services.js";
import { join } from "path";
import {
  getTelemetry,
  shutdownTelemetry,
  startMetricsCollection,
  stopMetricsCollection,
  log,
} from "./telemetry.js";

// Get telemetry client singleton
const telemetry = getTelemetry();

const server = createSymbiaServer({
  serviceId: ServiceId.INTEGRATIONS,
  telemetry: {
    client: telemetry,
  },
  database,
  registerRoutes: async (httpServer, app) => {
    // Load provider configurations from Catalog
    log("info", "Loading provider configurations...");
    await loadProviderConfigs();
    log("info", "Provider configurations loaded");

    // Load internal Symbia services as MCP-accessible integrations
    log("info", "Loading internal Symbia services...");
    const internalResult = await loadInternalServices();
    log("info", `Internal services loaded: ${internalResult.loaded.length} services`);
    if (internalResult.failed.length > 0) {
      log("warn", `Failed to load ${internalResult.failed.length} internal services: ${internalResult.failed.map(f => f.service).join(", ")}`);
    }

    await registerRoutes(httpServer, app as any);
  },
});

server.start()
  .then(async () => {
    // Connect to network service after server starts
    await initServiceRelay({
      serviceId: ServiceId.INTEGRATIONS,
      serviceName: "Integrations Service",
      capabilities: [
        "integrations.execute",
        "integrations.providers.list",
        "integrations.providers.get",
      ],
    });

    // Start process metrics collection (CPU, memory, etc.)
    startMetricsCollection();

    log("info", "Integrations service started and connected to SDN");
  });

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  log("info", `Received ${signal}, starting graceful shutdown...`);

  // Stop metrics collection
  stopMetricsCollection();

  // Export in-memory database if applicable
  if (isMemory) {
    const exportPath = process.env.INTEGRATIONS_DB_EXPORT_PATH ||
      join(process.cwd(), ".local-pids", `integrations-db-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    log("info", `Exporting in-memory database to ${exportPath}...`);
    const success = exportToFile(exportPath);
    if (success) {
      log("info", "Database exported successfully");
    } else {
      log("error", "Database export failed");
    }
  }

  // Shutdown telemetry (flush remaining data)
  await shutdownTelemetry();

  // Shutdown relay connection
  await shutdownRelay();

  log("info", "Shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
