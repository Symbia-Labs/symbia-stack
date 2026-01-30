/**
 * Load ALL integration-related resources into Catalog
 *
 * This script loads:
 * - Provider configurations (integrations-bootstrap.json)
 * - Generic integration components (components-integrations-bootstrap.json)
 * - OpenAI-specific components (components-openai-bootstrap.json)
 * - HuggingFace-specific components (components-huggingface-bootstrap.json)
 * - Context objects (context-integrations-bootstrap.json)
 *
 * Run: npx tsx scripts/load-all-integrations.ts
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { db } from "../server/src/db.js";
import { resources } from "../shared/schema.js";
import { eq } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ResourceData {
  id: string;
  key: string;
  name: string;
  description?: string;
  type: string;
  status?: string;
  isBootstrap?: boolean;
  tags?: string[];
  orgId?: string | null;
  accessPolicy?: any;
  metadata?: any;
}

const BOOTSTRAP_FILES = [
  { name: "Provider Configurations", file: "integrations-bootstrap.json" },
  { name: "Generic Integration Components", file: "components-integrations-bootstrap.json" },
  { name: "OpenAI Components", file: "components-openai-bootstrap.json" },
  { name: "HuggingFace Components", file: "components-huggingface-bootstrap.json" },
  { name: "Context Objects", file: "context-integrations-bootstrap.json" },
];

async function loadBootstrapFile(name: string, filename: string): Promise<{ inserted: number; updated: number }> {
  const filePath = join(__dirname, "..", "data", filename);

  if (!existsSync(filePath)) {
    console.log(`   ⚠️  File not found: ${filename}`);
    return { inserted: 0, updated: 0 };
  }

  const content = readFileSync(filePath, "utf-8");
  const resources_data: ResourceData[] = JSON.parse(content);

  let inserted = 0;
  let updated = 0;

  for (const resource of resources_data) {
    // Check if already exists
    const existing = await db.select().from(resources).where(eq(resources.key, resource.key));

    if (existing.length > 0) {
      // Update existing
      await db.update(resources)
        .set({
          name: resource.name,
          description: resource.description,
          status: resource.status,
          metadata: resource.metadata,
          tags: resource.tags,
          updatedAt: new Date(),
        })
        .where(eq(resources.key, resource.key));
      updated++;
    } else {
      // Insert new
      await db.insert(resources).values({
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
            write: { anyOf: ["role:admin"] },
          },
        },
        metadata: resource.metadata || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      inserted++;
    }
  }

  return { inserted, updated };
}

async function loadAllIntegrations() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Loading ALL Integration Resources into Catalog");
  console.log("═══════════════════════════════════════════════════════════════\n");

  let totalInserted = 0;
  let totalUpdated = 0;

  for (const { name, file } of BOOTSTRAP_FILES) {
    console.log(`📦 ${name}`);
    console.log(`   File: ${file}`);

    try {
      const { inserted, updated } = await loadBootstrapFile(name, file);
      totalInserted += inserted;
      totalUpdated += updated;
      console.log(`   ✅ Inserted: ${inserted}, Updated: ${updated}\n`);
    } catch (error) {
      console.log(`   ❌ Error: ${error}\n`);
    }
  }

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Summary");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Total Inserted: ${totalInserted}`);
  console.log(`  Total Updated:  ${totalUpdated}`);
  console.log(`  Total Resources: ${totalInserted + totalUpdated}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  // List all loaded resources by type
  const allResources = await db.select().from(resources);
  const integrationResources = allResources.filter(r =>
    r.key.startsWith("integrations/") ||
    r.key.startsWith("openai/") ||
    r.key.startsWith("huggingface/") ||
    r.key.startsWith("context/integrations") ||
    r.key.startsWith("executor/node/integrations") ||
    r.key.startsWith("executor/node/openai") ||
    r.key.startsWith("executor/node/huggingface")
  );

  console.log("📋 Loaded Integration Resources:\n");

  const byType: Record<string, string[]> = {};
  for (const r of integrationResources) {
    const type = r.type;
    if (!byType[type]) byType[type] = [];
    byType[type].push(r.key);
  }

  for (const [type, keys] of Object.entries(byType).sort()) {
    console.log(`  ${type}s (${keys.length}):`);
    for (const key of keys.sort()) {
      console.log(`    • ${key}`);
    }
    console.log("");
  }

  process.exit(0);
}

loadAllIntegrations().catch(error => {
  console.error("\n❌ Failed to load integrations:", error);
  process.exit(1);
});
