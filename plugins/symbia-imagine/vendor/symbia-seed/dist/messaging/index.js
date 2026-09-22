/**
 * Messaging Service Seed Data
 *
 * This module provides basic seed data for the Symbia Messaging Service,
 * including sample conversations and messages.
 */
import { DEFAULT_CONVERSATION_IDS, DEFAULT_USER_IDS, DEFAULT_ORG_IDS, } from "../shared/constants.js";
import { SeedLogger, shouldSeed, getSeedTimestamp } from "../shared/utils.js";
/**
 * Generate default conversations
 */
export function generateDefaultConversations() {
    const now = getSeedTimestamp();
    return [
        {
            id: DEFAULT_CONVERSATION_IDS.WELCOME_CONVERSATION,
            orgId: DEFAULT_ORG_IDS.SYMBIA_LABS,
            title: "Welcome to Symbia",
            status: "active",
            createdBy: DEFAULT_USER_IDS.SUPER_ADMIN,
            createdAt: getSeedTimestamp(-60),
            updatedAt: now,
        },
        {
            id: DEFAULT_CONVERSATION_IDS.SUPPORT_CONVERSATION,
            orgId: DEFAULT_ORG_IDS.ACME_CORP,
            title: "Support Request",
            status: "active",
            createdBy: DEFAULT_USER_IDS.MEMBER_USER,
            createdAt: getSeedTimestamp(-30),
            updatedAt: now,
        },
    ];
}
/**
 * Seed conversations
 */
export async function seedConversations(db, conversationsTable, config = {}) {
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
    }
    catch (error) {
        logger.error("Failed to seed conversations:", error);
        throw error;
    }
}
/**
 * Seed all messaging data
 */
export async function seedMessagingData(db, schema, config = {}) {
    const logger = new SeedLogger(config.verbose);
    logger.info("Starting messaging data seeding...");
    try {
        const conversations = await seedConversations(db, schema.conversations, config);
        logger.success("Messaging data seeding completed successfully");
        logger.info(`Summary:
      - Conversations: ${conversations.length}
    `);
        return { conversations };
    }
    catch (error) {
        logger.error("Failed to seed messaging data:", error);
        throw error;
    }
}
