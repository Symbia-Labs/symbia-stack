import { createSymbiaServer, log } from "@symbia/http";
import { createTelemetryClient } from "@symbia/logging-client";
import { initServiceRelay, shutdownRelay } from "@symbia/relay";
import { ServiceId } from "@symbia/sys";
import { registerRoutes } from "./routes";
import { authMiddleware, rlsMiddleware, initSystemBootstrap } from "./auth";
import { database, exportToFile, isMemory, ensureLoggingSchema } from "./db";
import { join } from "path";

const telemetry = createTelemetryClient({
  serviceId: process.env.TELEMETRY_SERVICE_ID || ServiceId.LOGGING,
});

// Telemetry ingest paths should not generate their own telemetry
const TELEMETRY_INGEST_PATHS = [
  "/api/logs/ingest",
  "/api/metrics/ingest",
  "/api/traces/ingest",
  "/api/objects/ingest",
];

const server = createSymbiaServer({
  serviceId: ServiceId.LOGGING,
  telemetry: {
    client: telemetry,
    excludePaths: TELEMETRY_INGEST_PATHS,
  },
  session: {
    enabled: true,
    secret: process.env.SESSION_SECRET || "symbia-logging-dev-secret",
  },
  database,
  middleware: [
    authMiddleware as any,
    rlsMiddleware as any,  // Sets PostgreSQL RLS context after auth
  ],
  registerRoutes: async (httpServer, app) => {
    await registerRoutes(httpServer, app as any);
  },
});

async function start(): Promise<void> {
  // Ensure PostgreSQL schema exists for out-of-box local Docker runs.
  await ensureLoggingSchema();

  // Fetch system bootstrap config from Identity for service-to-service auth
  await initSystemBootstrap();

  await server.start();

  // Connect to network service after server starts
  await initServiceRelay({
    serviceId: ServiceId.LOGGING,
    serviceName: 'Logging Service',
    capabilities: [
      'logging.log.ingest',
      'logging.log.query',
      'logging.metric.ingest',
      'logging.metric.query',
      'logging.trace.ingest',
      'logging.trace.query',
      'logging.stream.manage',
    ],
  });
}

start().catch((error) => {
  console.error("[logging] Failed to start:", error);
  process.exit(1);
});

// Graceful shutdown handler for relay and database export
async function gracefulShutdown(signal: string) {
  console.log(`\n[logging] Received ${signal}, starting graceful shutdown...`);

  // Export in-memory database if applicable
  if (isMemory) {
    const exportPath = process.env.LOGGING_DB_EXPORT_PATH ||
      join(process.cwd(), '.local-pids', `logging-db-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    console.log(`[logging] Exporting in-memory database to ${exportPath}...`);
    const success = exportToFile(exportPath);
    if (success) {
      console.log(`[logging] ✓ Database exported successfully`);
    } else {
      console.log(`[logging] ✗ Database export failed`);
    }
  }

  // Shutdown relay connection
  await shutdownRelay();

  console.log(`[logging] Shutdown complete`);
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { log };
