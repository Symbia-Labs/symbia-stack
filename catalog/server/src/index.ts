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
function transformResource(resource: any): any {
  return {
    id: resource.id,
    key: resource.key,
    name: resource.name,
    description: resource.description || null,
    type: resource.type,
    status: resource.status || "published",
    isBootstrap: resource.isBootstrap ?? true,
    tags: resource.tags || [],
    orgId: resource.orgId || null,
    accessPolicy: resource.accessPolicy || {
      visibility: "public",
      actions: {
        read: { anyOf: ["public"] },
        write: { anyOf: ["cap:registry.write", "role:admin"] },
        publish: { anyOf: ["cap:registry.publish", "role:publisher"] },
        delete: { anyOf: ["role:admin"] },
      },
    },
    metadata: resource.metadata || {},
    createdAt: resource.createdAt ? new Date(resource.createdAt) : new Date(),
    updatedAt: resource.updatedAt ? new Date(resource.updatedAt) : new Date(),
  };
}

/**
 * Insert resources in batches
 */
async function insertResources(data: any[]): Promise<number> {
  const batchSize = 50;
  let inserted = 0;

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const transformed = batch.map(transformResource);
    await db.insert(resources).values(transformed);
    inserted += batch.length;
  }

  return inserted;
}

/**
 * Seed the database from snapshot and bootstrap files
 *
 * Loading order:
 * 1. Load snapshot file (base data)
 * 2. Load bootstrap files (override/add to snapshot)
 *
 * Bootstrap files take precedence over snapshot for duplicate IDs.
 */
async function seedFromDataFiles(): Promise<number> {
  // From server/src/ go up to catalog/ then into data/
  const dataDir = join(__dirname, "..", "..", "data");

  if (!existsSync(dataDir)) {
    console.log(`[catalog] Data directory not found: ${dataDir}`);
    return 0;
  }

  // Collect all resources, using a Map to dedupe by ID (later files win)
  const resourceMap = new Map<string, any>();

  // 1. Load the most recent snapshot file (if any)
  const snapshotFiles = readdirSync(dataDir)
    .filter(f => f.startsWith("catalog-snapshot-") && f.endsWith(".json"))
    .sort()
    .reverse();

  if (snapshotFiles.length > 0) {
    const snapshotPath = join(dataDir, snapshotFiles[0]);
    console.log(`[catalog] Loading snapshot: ${snapshotFiles[0]}`);

    try {
      const content = readFileSync(snapshotPath, "utf-8");
      const snapshotData = JSON.parse(content);

      if (Array.isArray(snapshotData)) {
        for (const resource of snapshotData) {
          if (resource.id) {
            resourceMap.set(resource.id, resource);
          }
        }
        console.log(`[catalog]   ✓ Found ${snapshotData.length} resources in snapshot`);
      }
    } catch (error) {
      console.error(`[catalog] Failed to load snapshot:`, error);
    }
  }

  // 2. Load all bootstrap files (these override snapshot for duplicate IDs)
  const bootstrapFiles = readdirSync(dataDir)
    .filter(f => f.endsWith("-bootstrap.json"))
    .sort();

  for (const file of bootstrapFiles) {
    const filePath = join(dataDir, file);
    console.log(`[catalog] Loading bootstrap: ${file}`);

    try {
      const content = readFileSync(filePath, "utf-8");
      const data = JSON.parse(content);

      if (!Array.isArray(data)) {
        console.warn(`[catalog]   Skipping ${file}: not an array`);
        continue;
      }

      let added = 0;
      let updated = 0;
      for (const resource of data) {
        if (resource.id) {
          if (resourceMap.has(resource.id)) {
            updated++;
          } else {
            added++;
          }
          resourceMap.set(resource.id, resource);
        }
      }
      console.log(`[catalog]   ✓ ${file}: ${added} added, ${updated} updated`);
    } catch (error) {
      console.error(`[catalog]   Failed to load ${file}:`, error);
    }
  }

  // 3. Insert all resources into database
  const allResources = Array.from(resourceMap.values());
  console.log(`[catalog] Inserting ${allResources.length} total resources...`);

  const inserted = await insertResources(allResources);
  return inserted;
}

const BOOTSTRAP_COMPLETED_KEY = "bootstrap_completed";

/**
 * Check if bootstrap has already been completed.
 * This is a one-time flag - once set, bootstrap will never run again.
 */
async function isBootstrapCompleted(): Promise<boolean> {
  try {
    const result = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, BOOTSTRAP_COMPLETED_KEY));
    return result.length > 0 && result[0].value === "true";
  } catch (error) {
    // Table might not exist yet (first run before schema migration)
    console.log("[catalog] Could not check bootstrap flag (table may not exist yet)");
    return false;
  }
}

/**
 * Mark bootstrap as completed. This flag persists forever.
 */
async function markBootstrapCompleted(): Promise<void> {
  try {
    await db
      .insert(systemSettings)
      .values({
        key: BOOTSTRAP_COMPLETED_KEY,
        value: "true",
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: "true", updatedAt: new Date() },
      });
  } catch (error) {
    console.error("[catalog] Failed to mark bootstrap as completed:", error);
  }
}

/**
 * Run first-time bootstrap if not already completed.
 * This only runs once ever - deleting resources will NOT trigger a re-bootstrap.
 */
async function runFirstTimeBootstrap(): Promise<void> {
  // Check if bootstrap has already been completed
  const completed = await isBootstrapCompleted();
  if (completed) {
    console.log("[catalog] Bootstrap already completed, skipping.");
    return;
  }

  console.log("[catalog] First run detected, loading bootstrap data...");

  try {
    const count = await seedFromDataFiles();
    if (count > 0) {
      console.log(`[catalog] ✓ Loaded ${count} bootstrap resources`);
      await markBootstrapCompleted();
      console.log("[catalog] ✓ Bootstrap marked as completed (will not run again)");
    } else {
      console.log("[catalog] No bootstrap data found to load");
    }
  } catch (error) {
    console.error("[catalog] Failed to run bootstrap:", error);
  }
}

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
      serviceName: 'Catalog Service',
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
