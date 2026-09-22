/**
 * Identity seed data - Memberships
 */
import { randomUUID } from "crypto";
import { DEFAULT_USER_IDS, DEFAULT_ORG_IDS, } from "../shared/constants.js";
import { SeedLogger, shouldSeed, getSeedTimestamp } from "../shared/utils.js";
/**
 * Generate default memberships
 */
export function generateDefaultMemberships() {
    const now = getSeedTimestamp();
    return [
        // Symbia Labs memberships
        {
            id: randomUUID(),
            userId: DEFAULT_USER_IDS.SUPER_ADMIN,
            orgId: DEFAULT_ORG_IDS.SYMBIA_LABS,
            role: "admin",
            createdAt: getSeedTimestamp(-90),
        },
        {
            id: randomUUID(),
            userId: DEFAULT_USER_IDS.ADMIN_USER,
            orgId: DEFAULT_ORG_IDS.SYMBIA_LABS,
            role: "admin",
            createdAt: getSeedTimestamp(-85),
        },
        // Acme Corp memberships
        {
            id: randomUUID(),
            userId: DEFAULT_USER_IDS.ADMIN_USER,
            orgId: DEFAULT_ORG_IDS.ACME_CORP,
            role: "admin",
            createdAt: getSeedTimestamp(-60),
        },
        {
            id: randomUUID(),
            userId: DEFAULT_USER_IDS.MEMBER_USER,
            orgId: DEFAULT_ORG_IDS.ACME_CORP,
            role: "member",
            createdAt: getSeedTimestamp(-55),
        },
        {
            id: randomUUID(),
            userId: DEFAULT_USER_IDS.VIEWER_USER,
            orgId: DEFAULT_ORG_IDS.ACME_CORP,
            role: "viewer",
            createdAt: getSeedTimestamp(-50),
        },
        // Test Org memberships
        {
            id: randomUUID(),
            userId: DEFAULT_USER_IDS.TEST_USER_1,
            orgId: DEFAULT_ORG_IDS.TEST_ORG,
            role: "admin",
            createdAt: getSeedTimestamp(-30),
        },
        {
            id: randomUUID(),
            userId: DEFAULT_USER_IDS.TEST_USER_2,
            orgId: DEFAULT_ORG_IDS.TEST_ORG,
            role: "member",
            createdAt: getSeedTimestamp(-25),
        },
    ];
}
/**
 * Seed memberships into the database
 */
export async function seedMemberships(db, membershipsTable, config = {}) {
    const logger = new SeedLogger(config.verbose);
    try {
        logger.info("Checking existing memberships...");
        const existingMemberships = await db.select().from(membershipsTable);
        if (!shouldSeed(config, existingMemberships.length)) {
            logger.warn(`Skipping memberships - ${existingMemberships.length} already exist`);
            return existingMemberships;
        }
        const memberships = generateDefaultMemberships();
        logger.info(`Seeding ${memberships.length} memberships...`);
        await db.insert(membershipsTable).values(memberships);
        logger.success(`Seeded ${memberships.length} memberships`);
        return memberships;
    }
    catch (error) {
        logger.error("Failed to seed memberships:", error);
        throw error;
    }
}
