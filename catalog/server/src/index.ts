import { createSymbiaServer } from "@symbia/http";
import { createTelemetryClient } from "@symbia/logging-client";
import { initServiceRelay, shutdownRelay } from "@symbia/relay";
import { ServiceId } from "@symbia/sys";
import { registerRoutes } from "./routes.js";
import { db, database, exportToFile, isMemory } from "./db.js";
import { authMiddleware } from "./auth.js";
import { resources, systemSettings } from "../../shared/schema.js";
import { eq } from "drizzle-orm";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync, readdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Transform a resource for database insertion
 */
import { bootstrap as runFirstTimeBootstrap } from './service.js';

const telemetry = createTelemetryClient({
  serviceId: process.env.TELEMETRY_SERVICE_ID || ServiceId.CATALOG,
});

const server = createSymbiaServer({
  serviceId: ServiceId.CATALOG,
  telemetry: {
    client: telemetry,
  },
  database,
  middleware: [
    authMiddleware as any,  // Handles auth + sets RLS context
  ],
  registerRoutes: async (httpServer, app) => {
    await registerRoutes(httpServer, app as any);

    // Run first-time bootstrap (only runs once, ever)
    await runFirstTimeBootstrap();
  },
});

server.start()
  .then(async () => {
    // Connect to network service after server starts
    await initServiceRelay({
      serviceId: ServiceId.CATALOG,
      capabilities: [
        'catalog.resource.create',
        'catalog.resource.read',
        'catalog.resource.update',
        'catalog.resource.delete',
        'catalog.search',
        'catalog.bootstrap',
      ],
    });
  });

// Graceful shutdown handler for relay and database export
async function gracefulShutdown(signal: string) {
  console.log(`\n[catalog] Received ${signal}, starting graceful shutdown...`);

  // Export in-memory database if applicable
  if (isMemory) {
    const exportPath = process.env.CATALOG_DB_EXPORT_PATH ||
      join(process.cwd(), '.local-pids', `catalog-db-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    console.log(`[catalog] Exporting in-memory database to ${exportPath}...`);
    const success = exportToFile(exportPath);
    if (success) {
      console.log(`[catalog] ✓ Database exported successfully`);
    } else {
      console.log(`[catalog] ✗ Database export failed`);
    }
  }

  // Shutdown relay connection
  await shutdownRelay();

  console.log(`[catalog] Shutdown complete`);
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
