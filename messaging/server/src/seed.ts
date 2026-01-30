/**
 * Messaging Service - Seed Script
 *
 * Seeds the Messaging database with default conversations using @symbia/seed
 */

import { generateDefaultConversations } from "@symbia/seed";
import { pool } from "./database.js";
import { initDatabase } from "./database.js";

async function runSeed() {
  console.log("🌱 Starting Messaging service seeding...\n");

  try {
    // Initialize database schema
    await initDatabase();

    // Generate conversations
    const conversations = generateDefaultConversations();

    console.log(`Seeding ${conversations.length} conversations...`);

    // Insert conversations
    for (const conv of conversations) {
      await pool.query(
        `INSERT INTO conversations (id, org_id, type, name, description, created_by, created_at, updated_at, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING`,
        [
          conv.id,
          conv.orgId,
          'group', // default type
          conv.title,
          null, // description
          conv.createdBy,
          conv.createdAt,
          conv.updatedAt,
          {}
        ]
      );
    }

    console.log("\n✅ Messaging seeding completed successfully!\n");
    console.log("📊 Summary:");
    console.log(`   • Conversations: ${conversations.length}`);
    console.log("\n💬 Seeded Conversations:");
    console.log("     - Welcome to Symbia");
    console.log("     - Support Request\n");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Failed to seed messaging data:", error);
    process.exit(1);
  }
}

runSeed();
