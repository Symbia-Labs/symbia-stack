import { createRequire as __symbiaCreateRequire } from "node:module";globalThis.require ??= __symbiaCreateRequire(import.meta.url);
import {
  DEFAULT_CONVERSATION_IDS,
  DEFAULT_ORG_IDS,
  DEFAULT_USER_IDS,
  SeedLogger,
  getSeedTimestamp,
  shouldSeed
} from "./chunk-SYI65BHD.mjs";

// build/plugin/symbia-imagine/vendor/symbia-seed/dist/messaging/index.js
function generateDefaultConversations() {
  const now = getSeedTimestamp();
  return [
    {
      id: DEFAULT_CONVERSATION_IDS.WELCOME_CONVERSATION,
      orgId: DEFAULT_ORG_IDS.SYMBIA_LABS,
      title: "Welcome to Symbia",
      status: "active",
      createdBy: DEFAULT_USER_IDS.SUPER_ADMIN,
      createdAt: getSeedTimestamp(-60),
      updatedAt: now
    },
    {
      id: DEFAULT_CONVERSATION_IDS.SUPPORT_CONVERSATION,
      orgId: DEFAULT_ORG_IDS.ACME_CORP,
      title: "Support Request",
      status: "active",
      createdBy: DEFAULT_USER_IDS.MEMBER_USER,
      createdAt: getSeedTimestamp(-30),
      updatedAt: now
    }
  ];
}
async function seedConversations(db, conversationsTable, config = {}) {
  const logger = new SeedLogger(config.verbose);
  try {
    logger.info("Checking existing conversations...");
    const existing = await db.select().from(conversationsTable);
    if (!shouldSeed(config, existing.length)) {
      logger.warn(`Skipping conversations - ${existing.length} already exist`);
      return existing;
    }
    const conversations = generateDefaultConversations();
    logger.info(`Seeding ${conversations.length} conversations...`);
    await db.insert(conversationsTable).values(conversations);
    logger.success(`Seeded ${conversations.length} conversations`);
    return conversations;
  } catch (error) {
    logger.error("Failed to seed conversations:", error);
    throw error;
  }
}
async function seedMessagingData(db, schema, config = {}) {
  const logger = new SeedLogger(config.verbose);
  logger.info("Starting messaging data seeding...");
  try {
    const conversations = await seedConversations(db, schema.conversations, config);
    logger.success("Messaging data seeding completed successfully");
    logger.info(`Summary:
      - Conversations: ${conversations.length}
    `);
    return { conversations };
  } catch (error) {
    logger.error("Failed to seed messaging data:", error);
    throw error;
  }
}

export {
  generateDefaultConversations,
  seedConversations,
  seedMessagingData
};
