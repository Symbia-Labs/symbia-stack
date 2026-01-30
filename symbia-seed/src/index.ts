/**
 * @symbia/seed - Shared seed data and fixtures for Symbia microservices
 *
 * This package provides consistent, default-safe test data for all Symbia services.
 * It ensures that development, testing, and auditing environments have predictable
 * and repeatable seed data across the entire platform.
 *
 * Note: Catalog data is loaded directly from JSON files in catalog/data/, not from this package.
 *
 * @example Basic usage
 * ```typescript
 * import { seedIdentityData } from '@symbia/seed';
 * import { drizzle } from 'drizzle-orm/node-postgres';
 * import * as identitySchema from './identity-schema';
 *
 * // Seed identity service
 * const identityDb = drizzle(identityPool, { schema: identitySchema });
 * await seedIdentityData(identityDb, identitySchema, {
 *   createSuperAdmin: true,
 *   createDefaultOrgs: true,
 *   verbose: true,
 * });
 * ```
 *
 * @example Using individual seeders
 * ```typescript
 * import { seedUsers, seedOrganizations } from '@symbia/seed';
 * import * as schema from './schema';
 *
 * const users = await seedUsers(db, schema.users, { verbose: true });
 * const orgs = await seedOrganizations(db, schema.organizations);
 * ```
 *
 * @module @symbia/seed
 */

// Export shared constants and utilities
export * from "./shared/constants.js";
export * from "./shared/utils.js";

// Export identity seeders
export * from "./identity/index.js";
export * from "./identity/users.js";
export * from "./identity/orgs.js";
export * from "./identity/memberships.js";
export * from "./identity/entitlements.js";

// Export messaging seeders
export * from "./messaging/index.js";

// Export assistants seeders (agents/graphs, not catalog assistants)
export * from "./assistants/index.js";

/**
 * Seed all services with default data
 *
 * This is a convenience function that seeds all services in the correct order.
 * For production use, you should seed each service individually with its own
 * database connection.
 *
 * Note: Catalog is not seeded here - it loads from JSON files in catalog/data/
 *
 * @param dbs - Object containing database instances for each service
 * @param schemas - Object containing schema definitions for each service
 * @param config - Seeding configuration
 */
export async function seedAllServices(
  dbs: {
    identity: any;
    messaging?: any;
    assistants?: any;
  },
  schemas: {
    identity: any;
    messaging?: any;
    assistants?: any;
  },
  config: any = {}
) {
  const { seedIdentityData } = await import("./identity/index.js");
  const { seedMessagingData } = await import("./messaging/index.js");
  const { seedAssistantsData } = await import("./assistants/index.js");

  console.log("[SEED] Starting comprehensive seed across all services...");

  // Seed in order of dependencies
  const identityResult = await seedIdentityData(dbs.identity, schemas.identity, config);

  const results: any = { identity: identityResult };

  if (dbs.messaging && schemas.messaging) {
    results.messaging = await seedMessagingData(dbs.messaging, schemas.messaging, config);
  }

  if (dbs.assistants && schemas.assistants) {
    results.assistants = await seedAssistantsData(dbs.assistants, schemas.assistants, config);
  }

  console.log("[SEED] ✓ All services seeded successfully");

  return results;
}
