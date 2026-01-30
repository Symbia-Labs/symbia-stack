/**
 * Example: Seeding Identity Service
 *
 * This example demonstrates how to use @symbia/seed to populate
 * the Identity service with default test data.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { seedIdentityData } from "../src/index.js";

// This would be your actual identity schema
// import * as schema from '../path/to/identity/schema';

async function seedIdentity() {
  // Example: Connect to your Identity database
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const db = drizzle(pool);

  try {
    console.log("Starting Identity service seeding...\n");

    const result = await seedIdentityData(
      db,
      {}, // Pass your actual schema here
      {
        createSuperAdmin: true,
        createDefaultOrgs: true,
        createDefaultPlans: true,
        verbose: true,
        skipIfExists: true,
      }
    );

    console.log("\n✅ Seeding completed successfully!\n");
    console.log("Summary:");
    console.log(`  - Users: ${result.users.length}`);
    console.log(`  - Organizations: ${result.organizations.length}`);
    console.log(`  - Plans: ${result.plans.length}`);
    console.log(`  - Memberships: ${result.memberships.length}`);
    console.log(`  - User Entitlements: ${result.userEntitlements.length}`);
    console.log(`  - User Roles: ${result.userRoles.length}`);
    console.log("\n");

    console.log("Test Credentials:");
    console.log("  Email: admin@symbia-labs.com");
    console.log("  Password: password123");
    console.log("\n⚠️  NEVER use these credentials in production!");
  } catch (error) {
    console.error("Failed to seed identity data:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedIdentity().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { seedIdentity };
