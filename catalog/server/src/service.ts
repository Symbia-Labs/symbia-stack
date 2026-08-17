/**
 * The catalog service as a value: routes plus the bootstrap that fills a
 * fresh database.
 *
 * Extracted 15 Aug 2026 (docs/proposals/service-composition.md, S2). The
 * seed lived in index.ts beside `server.start()`, so a host that was not
 * the container could not call it: the imagine sidecar had to POST rows
 * through /api/resources instead and got 20 rows the reader could not see,
 * because API-created rows do not carry what the bootstrap path sets. The
 * bootstrap is the definition of "what a fresh catalog contains" and
 * belongs where any host can reach it.
 *
 * One entry, not two files: each esbuild bundle owns its module graph, so
 * a separately bundled bootstrap would seed a different in-memory database
 * from the one the routes read.
 */
import { db } from "./db.js";
import { authMiddleware } from "./auth.js";
import { resources, systemSettings } from "../../shared/schema.js";
import { eq } from "drizzle-orm";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync, readdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export { registerRoutes } from "./routes.js";

/**
 * The middleware this service requires to behave correctly.
 *
 * Exported because a route table alone is not a service: mounted without
 * authMiddleware, every write returned 403 "You don't have permission to
 * create resources" — `req.user` was never populated, so even a super
 * admin looked anonymous (measured 15 Aug through the MCP dispatcher).
 * A host that mounts routes and skips this gets a service that is
 * reachable and wrong, which is worse than one that is absent.
 */
export { authMiddleware } from "./auth.js";
export const middleware = [authMiddleware];

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
  // In production: __dirname is /app/dist, data is at /app/data (one level up)
  // In development: __dirname is catalog/server/src, data is at catalog/data (two levels up)
  // WHERE THE BOOTSTRAP DATA IS, ACROSS EVERY LAYOUT THIS RUNS IN.
  //
  // This was `join(__dirname, "..", "data")` — correct only for the
  // container's /app/dist layout. From source, __dirname is
  // catalog/server/src, so it resolved catalog/server/data and the seed
  // silently loaded nothing (12 Aug EC2 findings §4, worked around on the
  // instance with a symlink and never fixed). From the sidecar's bundle it
  // resolved <repo>/data and failed a third way, measured 15 Aug.
  //
  // Candidates in order, first one that exists wins, and the choice is
  // logged: a seed that finds no data must say which paths it tried.
  const candidates = [
    process.env.CATALOG_DATA_DIR,
    join(__dirname, "..", "data"),        // container: /app/dist -> /app/data
    join(__dirname, "..", "..", "data"),  // source: server/src -> catalog/data
    join(__dirname, "data"),              // bundle at package root
  ].filter(Boolean) as string[];

  const dataDir = candidates.find((c) => existsSync(c));
  if (!dataDir) {
    console.log(`[catalog] Data directory not found. Tried: ${candidates.join(", ")}`);
    return 0;
  }
  console.log(`[catalog] Bootstrap data directory: ${dataDir}`);

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

/** Idempotent by its own flag: safe for a host to call on every boot. */
export async function bootstrap(): Promise<void> {
  await runFirstTimeBootstrap();
}
