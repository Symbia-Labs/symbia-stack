/**
 * Identity Service Seed Data
 *
 * This module provides comprehensive seed data for the Symbia Identity Service,
 * including users, organizations, memberships, plans, and entitlements.
 */
import { SeedConfig } from "../shared/constants.js";
import { UserSeedData } from "./users.js";
import { PlanSeedData, OrganizationSeedData } from "./orgs.js";
import { MembershipSeedData } from "./memberships.js";
import { UserEntitlementSeedData, UserRoleSeedData } from "./entitlements.js";
/**
 * Identity seed data configuration
 */
export interface IdentitySeedConfig extends SeedConfig {
    /**
     * Number of additional test users to create
     */
    additionalTestUsers?: number;
    /**
     * Create admin user with all permissions
     */
    createSuperAdmin?: boolean;
    /**
     * Create default organizations
     */
    createDefaultOrgs?: boolean;
    /**
     * Create default plans
     */
    createDefaultPlans?: boolean;
    /**
     * The bcrypt hash to give every seeded user. REQUIRED when users are seeded.
     *
     * Added 23 Aug 2026, finding F24b. A shared constant in this package put a
     * publicly-known password on six accounts including the super admin, on every
     * stack that ran the seed. Hashing belongs to the caller, which owns both the
     * database and a bcrypt implementation; this package generates data shapes.
     *
     * No default, deliberately — a default is how the constant returns.
     */
    passwordHash?: string;
}
/**
 * Identity seed data results
 */
export interface IdentitySeedResult {
    users: UserSeedData[];
    plans: PlanSeedData[];
    organizations: OrganizationSeedData[];
    memberships: MembershipSeedData[];
    userEntitlements: UserEntitlementSeedData[];
    userRoles: UserRoleSeedData[];
}
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
export declare function seedIdentityData(db: any, schema: any, partialConfig?: Partial<IdentitySeedConfig>): Promise<IdentitySeedResult>;
export * from "./users.js";
export * from "./orgs.js";
export * from "./memberships.js";
export * from "./entitlements.js";
