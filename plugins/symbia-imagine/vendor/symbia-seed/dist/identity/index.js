/**
 * Identity Service Seed Data
 *
 * This module provides comprehensive seed data for the Symbia Identity Service,
 * including users, organizations, memberships, plans, and entitlements.
 */
import { SeedLogger, createSeedConfig } from "../shared/utils.js";
import { seedUsers } from "./users.js";
import { seedPlans, seedOrganizations } from "./orgs.js";
import { seedMemberships } from "./memberships.js";
import { seedUserEntitlements, seedUserRoles } from "./entitlements.js";
/**
 * Seed all identity data
 *
 * This function seeds all identity-related data in the correct order
 * to satisfy foreign key constraints.
 *
 * @param db - Drizzle database instance
 * @param schema - Identity schema containing all table definitions
 * @param config - Seeding configuration
 * @returns Object containing all seeded data
 *
 * @example
 * ```typescript
 * import { drizzle } from 'drizzle-orm/node-postgres';
 * import * as schema from './schema';
 * import { seedIdentityData } from '@symbia/seed';
 *
 * const db = drizzle(pool, { schema });
 *
 * const result = await seedIdentityData(db, schema, {
 *   createSuperAdmin: true,
 *   createDefaultOrgs: true,
 *   verbose: true,
 *   passwordHash: bcrypt.hashSync(yourPassword, 10), // required — see below
 * });
 *
 * console.log(`Seeded ${result.users.length} users`);
 * ```
 */
export async function seedIdentityData(db, schema, partialConfig = {}) {
    const config = {
        ...createSeedConfig(partialConfig),
        additionalTestUsers: partialConfig.additionalTestUsers ?? 0,
        createSuperAdmin: partialConfig.createSuperAdmin ?? true,
        createDefaultOrgs: partialConfig.createDefaultOrgs ?? true,
        createDefaultPlans: partialConfig.createDefaultPlans ?? true,
        // Refused rather than defaulted — see IdentitySeedConfig.passwordHash.
        passwordHash: partialConfig.passwordHash ?? "",
    };
    if (!config.passwordHash) {
        throw new Error("seedIdentityData requires config.passwordHash. Until 23 Aug this package " +
            "carried a bcrypt hash of a password published in its own source and gave " +
            "it to six users including the super admin (F24b). Hash a value your " +
            "service controls — identity/server/src/default-admin.ts resolves one — " +
            "and pass it here.");
    }
    const logger = new SeedLogger(config.verbose);
    logger.info("Starting identity data seeding...");
    try {
        // 1. Seed plans first (organizations reference plans)
        let plans = [];
        if (config.createDefaultPlans) {
            plans = await seedPlans(db, schema.plans, config);
        }
        // 2. Seed users (no dependencies)
        const users = await seedUsers(db, schema.users, config.passwordHash, config);
        // 3. Seed organizations (depends on plans)
        let organizations = [];
        if (config.createDefaultOrgs) {
            organizations = await seedOrganizations(db, schema.organizations, config);
        }
        // 4. Seed memberships (depends on users and organizations)
        const memberships = await seedMemberships(db, schema.memberships, config);
        // 5. Seed user entitlements (depends on users)
        const userEntitlements = await seedUserEntitlements(db, schema.userEntitlements, config);
        // 6. Seed user roles (depends on users)
        const userRoles = await seedUserRoles(db, schema.userRoles, config);
        logger.success("Identity data seeding completed successfully");
        logger.info(`Summary:
      - Users: ${users.length}
      - Plans: ${plans.length}
      - Organizations: ${organizations.length}
      - Memberships: ${memberships.length}
      - User Entitlements: ${userEntitlements.length}
      - User Roles: ${userRoles.length}
    `);
        return {
            users,
            plans,
            organizations,
            memberships,
            userEntitlements,
            userRoles,
        };
    }
    catch (error) {
        logger.error("Failed to seed identity data:", error);
        throw error;
    }
}
// Export individual seeders for granular control
export * from "./users.js";
export * from "./orgs.js";
export * from "./memberships.js";
export * from "./entitlements.js";
