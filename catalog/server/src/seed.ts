/**
 * Catalog Service - Seed Script
 *
 * Seeds the Catalog database from the bootstrap snapshot file.
 * The snapshot contains all components, contexts, executors, and graphs
 * needed for the platform to function.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { db } from "./db.js";
import { resources } from "../../shared/schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Find the most recent snapshot file in the data directory
 */
function findSnapshotFile(): string {
  // From server/src/ go up to catalog/ then into data/
  const dataDir = join(__dirname, "..", "..", "data");

  if (!existsSync(dataDir)) {
    throw new Error(`Data directory not found: ${dataDir}`);
  }

  const files = readdirSync(dataDir)
    .filter(f => f.startsWith("catalog-snapshot-") && f.endsWith(".json"))
    .sort()
    .reverse();

  if (files.length === 0) {
    throw new Error(`No snapshot files found in ${dataDir}`);
  }

  return join(dataDir, files[0]);
}

/**
 * Load and parse snapshot file
 */
function loadSnapshot(filePath: string): any[] {
  console.log(`📂 Loading snapshot: ${filePath}`);
  const content = readFileSync(filePath, "utf-8");
  const data = JSON.parse(content);

  if (!Array.isArray(data)) {
    throw new Error("Snapshot must be an array of resources");
  }

  return data;
}

/**
 * Transform snapshot resource to database format
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

async function runSeed() {
  console.log("🌱 Starting Catalog service seeding from snapshot...\n");

  try {
    // Find and load snapshot
    const snapshotPath = findSnapshotFile();
    const snapshotData = loadSnapshot(snapshotPath);

    console.log(`📊 Snapshot contains ${snapshotData.length} resources\n`);

    // Count by type
    const typeCounts: Record<string, number> = {};
    for (const resource of snapshotData) {
      typeCounts[resource.type] = (typeCounts[resource.type] || 0) + 1;
    }

    console.log("📦 Resource breakdown:");
    for (const [type, count] of Object.entries(typeCounts).sort()) {
      console.log(`   • ${type}: ${count}`);
    }
    console.log("");

    // Check existing resources
    const existing = await db.select().from(resources);
    if (existing.length > 0) {
      console.log(`⚠️  Database already has ${existing.length} resources`);
      console.log("   Clearing existing data before seeding...\n");
      await db.delete(resources);
    }

    // Transform and insert resources in batches
    const batchSize = 50;
    let inserted = 0;

    for (let i = 0; i < snapshotData.length; i += batchSize) {
      const batch = snapshotData.slice(i, i + batchSize);
      const transformed = batch.map(transformResource);

      await db.insert(resources).values(transformed);
      inserted += batch.length;

      const progress = Math.round((inserted / snapshotData.length) * 100);
      process.stdout.write(`\r   Inserting resources... ${inserted}/${snapshotData.length} (${progress}%)`);
    }

    console.log("\n\n✅ Catalog seeding completed successfully!\n");
    console.log("📊 Final Summary:");
    console.log(`   • Total resources: ${snapshotData.length}`);
    for (const [type, count] of Object.entries(typeCounts).sort()) {
      console.log(`   • ${type}s: ${count}`);
    }
    console.log("");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Failed to seed catalog data:", error);
    process.exit(1);
  }
}

runSeed();
