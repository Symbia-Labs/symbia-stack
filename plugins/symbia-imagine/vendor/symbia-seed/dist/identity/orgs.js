/**
 * Identity seed data - Organizations
 */
import { DEFAULT_ORG_IDS, DEFAULT_ORG_SLUGS, } from "../shared/constants.js";
import { SeedLogger, shouldSeed, getSeedTimestamp } from "../shared/utils.js";
/**
 * Generate default plans
 */
export function generateDefaultPlans() {
    return [
        {
            id: "plan-free",
            name: "Free",
            featuresJson: ["cap:catalog.read", "cap:messaging.read"],
            limitsJson: {
                api_calls: 1000,
                storage_mb: 100,
                users: 5,
            },
            priceCents: 0,
        },
        {
            id: "plan-pro",
            name: "Pro",
            featuresJson: [
                "cap:catalog.read",
                "cap:catalog.write",
                "cap:messaging.read",
                "cap:messaging.write",
            ],
            limitsJson: {
                api_calls: 100000,
                storage_mb: 10000,
                users: 50,
            },
            priceCents: 4900, // $49/month
        },
        {
            id: "plan-enterprise",
            name: "Enterprise",
            featuresJson: [
                "cap:catalog.read",
                "cap:catalog.write",
                "cap:catalog.publish",
                "cap:messaging.read",
                "cap:messaging.write",
                "cap:messaging.interrupt",
            ],
            limitsJson: {
                api_calls: -1, // unlimited
                storage_mb: -1,
                users: -1,
            },
            priceCents: 24900, // $249/month
        },
    ];
}
/**
 * Generate default organizations
 */
export function generateDefaultOrganizations() {
    return [
        {
            id: DEFAULT_ORG_IDS.SYMBIA_LABS,
            name: "Symbia Labs",
            slug: DEFAULT_ORG_SLUGS.SYMBIA_LABS,
            planId: "plan-enterprise",
            createdAt: getSeedTimestamp(-90),
        },
        {
            id: DEFAULT_ORG_IDS.ACME_CORP,
            name: "Acme Corp",
            slug: DEFAULT_ORG_SLUGS.ACME_CORP,
            planId: "plan-pro",
            createdAt: getSeedTimestamp(-60),
        },
        {
            id: DEFAULT_ORG_IDS.TEST_ORG,
            name: "Test Organization",
            slug: DEFAULT_ORG_SLUGS.TEST_ORG,
            planId: "plan-free",
            createdAt: getSeedTimestamp(-30),
        },
    ];
}
/**
 * Seed plans into the database
 */
export async function seedPlans(db, plansTable, config = {}) {
    const logger = new SeedLogger(config.verbose);
    try {
        logger.info("Checking existing plans...");
        const existingPlans = await db.select().from(plansTable);
        if (!shouldSeed(config, existingPlans.length)) {
            logger.warn(`Skipping plans - ${existingPlans.length} already exist`);
            return existingPlans;
        }
        const plans = generateDefaultPlans();
        logger.info(`Seeding ${plans.length} plans...`);
        await db.insert(plansTable).values(plans);
        logger.success(`Seeded ${plans.length} plans`);
        return plans;
    }
    catch (error) {
        logger.error("Failed to seed plans:", error);
        throw error;
    }
}
/**
 * Seed organizations into the database
 */
export async function seedOrganizations(db, organizationsTable, config = {}) {
    const logger = new SeedLogger(config.verbose);
    try {
        logger.info("Checking existing organizations...");
        const existingOrgs = await db.select().from(organizationsTable);
        if (!shouldSeed(config, existingOrgs.length)) {
            logger.warn(`Skipping organizations - ${existingOrgs.length} already exist`);
            return existingOrgs;
        }
        const orgs = generateDefaultOrganizations();
        logger.info(`Seeding ${orgs.length} organizations...`);
        await db.insert(organizationsTable).values(orgs);
        logger.success(`Seeded ${orgs.length} organizations`);
        return orgs;
    }
    catch (error) {
        logger.error("Failed to seed organizations:", error);
        throw error;
    }
}
