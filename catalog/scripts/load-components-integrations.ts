/**
 * Load integration component definitions into Catalog
 *
 * Run: npx tsx scripts/load-components-integrations.ts
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { db } from "../server/src/db.js";
import { resources } from "../shared/schema.js";
import { eq } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function loadIntegrationsComponents() {
  console.log("🔌 Loading integration component definitions...\n");

  try {
    const filePath = join(__dirname, "..", "data", "components-integrations-bootstrap.json");
    const content = readFileSync(filePath, "utf-8");
    const components = JSON.parse(content);

    console.log(`📦 Found ${components.length} integration component resources\n`);

    let inserted = 0;
    let updated = 0;

    for (const resource of components) {
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
        console.log(`   ♻️  Updated: ${resource.key}`);
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
        console.log(`   ✅ Inserted: ${resource.key}`);
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   • Inserted: ${inserted}`);
    console.log(`   • Updated: ${updated}`);
    console.log(`\n✅ Integration components loaded successfully!\n`);

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Failed to load integration components:", error);
    process.exit(1);
  }
}

loadIntegrationsComponents();
