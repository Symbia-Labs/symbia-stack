import { createRequire as __symbiaCreateRequire } from "node:module";globalThis.require ??= __symbiaCreateRequire(import.meta.url);
import {
  DEFAULT_ORG_IDS,
  DEFAULT_ORG_SLUGS,
  DEFAULT_USER_EMAILS,
  DEFAULT_USER_IDS,
  ENTITLEMENT_KEYS,
  ROLE_KEYS,
  SeedLogger,
  createSeedConfig,
  getSeedTimestamp,
  shouldSeed
} from "./chunk-SYI65BHD.mjs";

// build/plugin/symbia-imagine/vendor/symbia-seed/dist/identity/users.js
function generateDefaultUsers(passwordHash) {
  if (!passwordHash) {
    throw new Error("generateDefaultUsers requires a passwordHash. It no longer carries one: a shared constant here put a publicly-known password on six seeded accounts (F24b). Hash a value the caller controls and pass it in.");
  }
  const now = getSeedTimestamp();
  return [
    {
      id: DEFAULT_USER_IDS.SUPER_ADMIN,
      email: DEFAULT_USER_EMAILS.SUPER_ADMIN,
      passwordHash,
      name: "Super Admin",
      isSuperAdmin: true,
      createdAt: getSeedTimestamp(-60),
      // Created 60 minutes ago
      updatedAt: now
    },
    {
      id: DEFAULT_USER_IDS.ADMIN_USER,
      email: DEFAULT_USER_EMAILS.ADMIN_USER,
      passwordHash,
      name: "Admin User",
      isSuperAdmin: false,
      createdAt: getSeedTimestamp(-50),
      updatedAt: now
    },
    {
      id: DEFAULT_USER_IDS.MEMBER_USER,
      email: DEFAULT_USER_EMAILS.MEMBER_USER,
      passwordHash,
      name: "Member User",
      isSuperAdmin: false,
      createdAt: getSeedTimestamp(-40),
      updatedAt: now
    },
    {
      id: DEFAULT_USER_IDS.VIEWER_USER,
      email: DEFAULT_USER_EMAILS.VIEWER_USER,
      passwordHash,
      name: "Viewer User",
      isSuperAdmin: false,
      createdAt: getSeedTimestamp(-30),
      updatedAt: now
    },
    {
      id: DEFAULT_USER_IDS.TEST_USER_1,
      email: DEFAULT_USER_EMAILS.TEST_USER_1,
      passwordHash,
      name: "Test User 1",
      isSuperAdmin: false,
      createdAt: getSeedTimestamp(-20),
      updatedAt: now
    },
    {
      id: DEFAULT_USER_IDS.TEST_USER_2,
      email: DEFAULT_USER_EMAILS.TEST_USER_2,
      passwordHash,
      name: "Test User 2",
      isSuperAdmin: false,
      createdAt: getSeedTimestamp(-10),
      updatedAt: now
    }
  ];
}
async function seedUsers(db, usersTable, passwordHash, config = {}) {
  const logger = new SeedLogger(config.verbose);
  try {
    logger.info("Checking existing users...");
    const existingUsers = await db.select().from(usersTable);
    if (!shouldSeed(config, existingUsers.length)) {
      logger.warn(`Skipping users - ${existingUsers.length} already exist`);
      return existingUsers;
    }
    const users = generateDefaultUsers(passwordHash);
    logger.info(`Seeding ${users.length} users...`);
    await db.insert(usersTable).values(users);
    logger.success(`Seeded ${users.length} users`);
    return users;
  } catch (error) {
    logger.error("Failed to seed users:", error);
    throw error;
  }
}

// build/plugin/symbia-imagine/vendor/symbia-seed/dist/identity/orgs.js
function generateDefaultPlans() {
  return [
    {
      id: "plan-free",
      name: "Free",
      featuresJson: ["cap:catalog.read", "cap:messaging.read"],
      limitsJson: {
        api_calls: 1e3,
        storage_mb: 100,
        users: 5
      },
      priceCents: 0
    },
    {
      id: "plan-pro",
      name: "Pro",
      featuresJson: [
        "cap:catalog.read",
        "cap:catalog.write",
        "cap:messaging.read",
        "cap:messaging.write"
      ],
      limitsJson: {
        api_calls: 1e5,
        storage_mb: 1e4,
        users: 50
      },
      priceCents: 4900
      // $49/month
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
        "cap:messaging.interrupt"
      ],
      limitsJson: {
        api_calls: -1,
        // unlimited
        storage_mb: -1,
        users: -1
      },
      priceCents: 24900
      // $249/month
    }
  ];
}
function generateDefaultOrganizations() {
  return [
    {
      id: DEFAULT_ORG_IDS.SYMBIA_LABS,
      name: "Symbia Labs",
      slug: DEFAULT_ORG_SLUGS.SYMBIA_LABS,
      planId: "plan-enterprise",
      createdAt: getSeedTimestamp(-90)
    },
    {
      id: DEFAULT_ORG_IDS.ACME_CORP,
      name: "Acme Corp",
      slug: DEFAULT_ORG_SLUGS.ACME_CORP,
      planId: "plan-pro",
      createdAt: getSeedTimestamp(-60)
    },
    {
      id: DEFAULT_ORG_IDS.TEST_ORG,
      name: "Test Organization",
      slug: DEFAULT_ORG_SLUGS.TEST_ORG,
      planId: "plan-free",
      createdAt: getSeedTimestamp(-30)
    }
  ];
}
async function seedPlans(db, plansTable, config = {}) {
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
  } catch (error) {
    logger.error("Failed to seed plans:", error);
    throw error;
  }
}
async function seedOrganizations(db, organizationsTable, config = {}) {
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
  } catch (error) {
    logger.error("Failed to seed organizations:", error);
    throw error;
  }
}

// build/plugin/symbia-imagine/vendor/symbia-seed/dist/identity/memberships.js
import { randomUUID } from "crypto";
function generateDefaultMemberships() {
  const now = getSeedTimestamp();
  return [
    // Symbia Labs memberships
    {
      id: randomUUID(),
      userId: DEFAULT_USER_IDS.SUPER_ADMIN,
      orgId: DEFAULT_ORG_IDS.SYMBIA_LABS,
      role: "admin",
      createdAt: getSeedTimestamp(-90)
    },
    {
      id: randomUUID(),
      userId: DEFAULT_USER_IDS.ADMIN_USER,
      orgId: DEFAULT_ORG_IDS.SYMBIA_LABS,
      role: "admin",
      createdAt: getSeedTimestamp(-85)
    },
    // Acme Corp memberships
    {
      id: randomUUID(),
      userId: DEFAULT_USER_IDS.ADMIN_USER,
      orgId: DEFAULT_ORG_IDS.ACME_CORP,
      role: "admin",
      createdAt: getSeedTimestamp(-60)
    },
    {
      id: randomUUID(),
      userId: DEFAULT_USER_IDS.MEMBER_USER,
      orgId: DEFAULT_ORG_IDS.ACME_CORP,
      role: "member",
      createdAt: getSeedTimestamp(-55)
    },
    {
      id: randomUUID(),
      userId: DEFAULT_USER_IDS.VIEWER_USER,
      orgId: DEFAULT_ORG_IDS.ACME_CORP,
      role: "viewer",
      createdAt: getSeedTimestamp(-50)
    },
    // Test Org memberships
    {
      id: randomUUID(),
      userId: DEFAULT_USER_IDS.TEST_USER_1,
      orgId: DEFAULT_ORG_IDS.TEST_ORG,
      role: "admin",
      createdAt: getSeedTimestamp(-30)
    },
    {
      id: randomUUID(),
      userId: DEFAULT_USER_IDS.TEST_USER_2,
      orgId: DEFAULT_ORG_IDS.TEST_ORG,
      role: "member",
      createdAt: getSeedTimestamp(-25)
    }
  ];
}
async function seedMemberships(db, membershipsTable, config = {}) {
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
  } catch (error) {
    logger.error("Failed to seed memberships:", error);
    throw error;
  }
}

// build/plugin/symbia-imagine/vendor/symbia-seed/dist/identity/entitlements.js
import { randomUUID as randomUUID2 } from "crypto";
function generateDefaultUserEntitlements() {
  const now = getSeedTimestamp();
  return [
    // Super Admin - all capabilities
    {
      id: randomUUID2(),
      userId: DEFAULT_USER_IDS.SUPER_ADMIN,
      entitlementKey: ENTITLEMENT_KEYS.CATALOG_ADMIN,
      grantedBy: null,
      expiresAt: null,
      createdAt: getSeedTimestamp(-90)
    },
    {
      id: randomUUID2(),
      userId: DEFAULT_USER_IDS.SUPER_ADMIN,
      entitlementKey: ENTITLEMENT_KEYS.REGISTRY_PUBLISH,
      grantedBy: null,
      expiresAt: null,
      createdAt: getSeedTimestamp(-90)
    },
    {
      id: randomUUID2(),
      userId: DEFAULT_USER_IDS.SUPER_ADMIN,
      entitlementKey: ENTITLEMENT_KEYS.MESSAGING_INTERRUPT,
      grantedBy: null,
      expiresAt: null,
      createdAt: getSeedTimestamp(-90)
    },
    // Admin User - publishing and management capabilities
    {
      id: randomUUID2(),
      userId: DEFAULT_USER_IDS.ADMIN_USER,
      entitlementKey: ENTITLEMENT_KEYS.CATALOG_WRITE,
      grantedBy: DEFAULT_USER_IDS.SUPER_ADMIN,
      expiresAt: null,
      createdAt: getSeedTimestamp(-85)
    },
    {
      id: randomUUID2(),
      userId: DEFAULT_USER_IDS.ADMIN_USER,
      entitlementKey: ENTITLEMENT_KEYS.CATALOG_PUBLISH,
      grantedBy: DEFAULT_USER_IDS.SUPER_ADMIN,
      expiresAt: null,
      createdAt: getSeedTimestamp(-85)
    },
    {
      id: randomUUID2(),
      userId: DEFAULT_USER_IDS.ADMIN_USER,
      entitlementKey: ENTITLEMENT_KEYS.REGISTRY_WRITE,
      grantedBy: DEFAULT_USER_IDS.SUPER_ADMIN,
      expiresAt: null,
      createdAt: getSeedTimestamp(-85)
    },
    // Member User - write capabilities
    {
      id: randomUUID2(),
      userId: DEFAULT_USER_IDS.MEMBER_USER,
      entitlementKey: ENTITLEMENT_KEYS.CATALOG_WRITE,
      grantedBy: DEFAULT_USER_IDS.ADMIN_USER,
      expiresAt: null,
      createdAt: getSeedTimestamp(-55)
    },
    {
      id: randomUUID2(),
      userId: DEFAULT_USER_IDS.MEMBER_USER,
      entitlementKey: ENTITLEMENT_KEYS.MESSAGING_WRITE,
      grantedBy: DEFAULT_USER_IDS.ADMIN_USER,
      expiresAt: null,
      createdAt: getSeedTimestamp(-55)
    },
    // Viewer User - read-only
    {
      id: randomUUID2(),
      userId: DEFAULT_USER_IDS.VIEWER_USER,
      entitlementKey: ENTITLEMENT_KEYS.CATALOG_READ,
      grantedBy: DEFAULT_USER_IDS.ADMIN_USER,
      expiresAt: null,
      createdAt: getSeedTimestamp(-50)
    },
    {
      id: randomUUID2(),
      userId: DEFAULT_USER_IDS.VIEWER_USER,
      entitlementKey: ENTITLEMENT_KEYS.MESSAGING_READ,
      grantedBy: DEFAULT_USER_IDS.ADMIN_USER,
      expiresAt: null,
      createdAt: getSeedTimestamp(-50)
    }
  ];
}
function generateDefaultUserRoles() {
  return [
    // Super Admin - all roles
    {
      id: randomUUID2(),
      userId: DEFAULT_USER_IDS.SUPER_ADMIN,
      roleKey: ROLE_KEYS.PUBLISHER,
      grantedBy: null,
      expiresAt: null,
      createdAt: getSeedTimestamp(-90)
    },
    {
      id: randomUUID2(),
      userId: DEFAULT_USER_IDS.SUPER_ADMIN,
      roleKey: ROLE_KEYS.DEVELOPER,
      grantedBy: null,
      expiresAt: null,
      createdAt: getSeedTimestamp(-90)
    },
    {
      id: randomUUID2(),
      userId: DEFAULT_USER_IDS.SUPER_ADMIN,
      roleKey: ROLE_KEYS.OPERATOR,
      grantedBy: null,
      expiresAt: null,
      createdAt: getSeedTimestamp(-90)
    },
    // Admin User - publisher role
    {
      id: randomUUID2(),
      userId: DEFAULT_USER_IDS.ADMIN_USER,
      roleKey: ROLE_KEYS.PUBLISHER,
      grantedBy: DEFAULT_USER_IDS.SUPER_ADMIN,
      expiresAt: null,
      createdAt: getSeedTimestamp(-85)
    },
    // Member User - developer role
    {
      id: randomUUID2(),
      userId: DEFAULT_USER_IDS.MEMBER_USER,
      roleKey: ROLE_KEYS.DEVELOPER,
      grantedBy: DEFAULT_USER_IDS.ADMIN_USER,
      expiresAt: null,
      createdAt: getSeedTimestamp(-55)
    }
  ];
}
async function seedUserEntitlements(db, userEntitlementsTable, config = {}) {
  const logger = new SeedLogger(config.verbose);
  try {
    logger.info("Checking existing user entitlements...");
    const existing = await db.select().from(userEntitlementsTable);
    if (!shouldSeed(config, existing.length)) {
      logger.warn(`Skipping user entitlements - ${existing.length} already exist`);
      return existing;
    }
    const entitlements = generateDefaultUserEntitlements();
    logger.info(`Seeding ${entitlements.length} user entitlements...`);
    await db.insert(userEntitlementsTable).values(entitlements);
    logger.success(`Seeded ${entitlements.length} user entitlements`);
    return entitlements;
  } catch (error) {
    logger.error("Failed to seed user entitlements:", error);
    throw error;
  }
}
async function seedUserRoles(db, userRolesTable, config = {}) {
  const logger = new SeedLogger(config.verbose);
  try {
    logger.info("Checking existing user roles...");
    const existing = await db.select().from(userRolesTable);
    if (!shouldSeed(config, existing.length)) {
      logger.warn(`Skipping user roles - ${existing.length} already exist`);
      return existing;
    }
    const roles = generateDefaultUserRoles();
    logger.info(`Seeding ${roles.length} user roles...`);
    await db.insert(userRolesTable).values(roles);
    logger.success(`Seeded ${roles.length} user roles`);
    return roles;
  } catch (error) {
    logger.error("Failed to seed user roles:", error);
    throw error;
  }
}

// build/plugin/symbia-imagine/vendor/symbia-seed/dist/identity/index.js
async function seedIdentityData(db, schema, partialConfig = {}) {
  const config = {
    ...createSeedConfig(partialConfig),
    additionalTestUsers: partialConfig.additionalTestUsers ?? 0,
    createSuperAdmin: partialConfig.createSuperAdmin ?? true,
    createDefaultOrgs: partialConfig.createDefaultOrgs ?? true,
    createDefaultPlans: partialConfig.createDefaultPlans ?? true,
    // Refused rather than defaulted — see IdentitySeedConfig.passwordHash.
    passwordHash: partialConfig.passwordHash ?? ""
  };
  if (!config.passwordHash) {
    throw new Error("seedIdentityData requires config.passwordHash. Until 23 Aug this package carried a bcrypt hash of a password published in its own source and gave it to six users including the super admin (F24b). Hash a value your service controls \u2014 identity/server/src/default-admin.ts resolves one \u2014 and pass it here.");
  }
  const logger = new SeedLogger(config.verbose);
  logger.info("Starting identity data seeding...");
  try {
    let plans = [];
    if (config.createDefaultPlans) {
      plans = await seedPlans(db, schema.plans, config);
    }
    const users = await seedUsers(db, schema.users, config.passwordHash, config);
    let organizations = [];
    if (config.createDefaultOrgs) {
      organizations = await seedOrganizations(db, schema.organizations, config);
    }
    const memberships = await seedMemberships(db, schema.memberships, config);
    const userEntitlements = await seedUserEntitlements(db, schema.userEntitlements, config);
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
      userRoles
    };
  } catch (error) {
    logger.error("Failed to seed identity data:", error);
    throw error;
  }
}

export {
  generateDefaultUsers,
  seedUsers,
  generateDefaultPlans,
  generateDefaultOrganizations,
  seedPlans,
  seedOrganizations,
  generateDefaultMemberships,
  seedMemberships,
  generateDefaultUserEntitlements,
  generateDefaultUserRoles,
  seedUserEntitlements,
  seedUserRoles,
  seedIdentityData
};
