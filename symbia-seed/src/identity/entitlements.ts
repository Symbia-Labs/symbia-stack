/**
 * Identity seed data - Entitlements
 */

import { randomUUID } from "crypto";
import {
  DEFAULT_USER_IDS,
  ENTITLEMENT_KEYS,
  ROLE_KEYS,
  SeedConfig,
} from "../shared/constants.js";
import { SeedLogger, shouldSeed, getSeedTimestamp } from "../shared/utils.js";

/**
 * User Entitlement seed data interface
 */
export interface UserEntitlementSeedData {
  id: string;
  userId: string;
  entitlementKey: string;
  grantedBy: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}

/**
 * User Role seed data interface
 */
export interface UserRoleSeedData {
  id: string;
  userId: string;
  roleKey: string;
  grantedBy: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}

/**
 * Generate default user entitlements
 */
export function generateDefaultUserEntitlements(): UserEntitlementSeedData[] {
  const now = getSeedTimestamp();

  return [
    // Super Admin - all capabilities
    {
      id: randomUUID(),
      userId: DEFAULT_USER_IDS.SUPER_ADMIN,
      entitlementKey: ENTITLEMENT_KEYS.CATALOG_ADMIN,
      grantedBy: null,
      expiresAt: null,
      createdAt: getSeedTimestamp(-90),
    },
    {
      id: randomUUID(),
      userId: DEFAULT_USER_IDS.SUPER_ADMIN,
      entitlementKey: ENTITLEMENT_KEYS.REGISTRY_PUBLISH,
      grantedBy: null,
      expiresAt: null,
      createdAt: getSeedTimestamp(-90),
    },
    {
      id: randomUUID(),
      userId: DEFAULT_USER_IDS.SUPER_ADMIN,
      entitlementKey: ENTITLEMENT_KEYS.MESSAGING_INTERRUPT,
      grantedBy: null,
      expiresAt: null,
      createdAt: getSeedTimestamp(-90),
    },

    // Admin User - publishing and management capabilities
    {
      id: randomUUID(),
      userId: DEFAULT_USER_IDS.ADMIN_USER,
      entitlementKey: ENTITLEMENT_KEYS.CATALOG_WRITE,
      grantedBy: DEFAULT_USER_IDS.SUPER_ADMIN,
      expiresAt: null,
      createdAt: getSeedTimestamp(-85),
    },
    {
      id: randomUUID(),
      userId: DEFAULT_USER_IDS.ADMIN_USER,
      entitlementKey: ENTITLEMENT_KEYS.CATALOG_PUBLISH,
      grantedBy: DEFAULT_USER_IDS.SUPER_ADMIN,
      expiresAt: null,
      createdAt: getSeedTimestamp(-85),
    },
    {
      id: randomUUID(),
      userId: DEFAULT_USER_IDS.ADMIN_USER,
      entitlementKey: ENTITLEMENT_KEYS.REGISTRY_WRITE,
      grantedBy: DEFAULT_USER_IDS.SUPER_ADMIN,
      expiresAt: null,
      createdAt: getSeedTimestamp(-85),
    },

    // Member User - write capabilities
    {
      id: randomUUID(),
      userId: DEFAULT_USER_IDS.MEMBER_USER,
      entitlementKey: ENTITLEMENT_KEYS.CATALOG_WRITE,
      grantedBy: DEFAULT_USER_IDS.ADMIN_USER,
      expiresAt: null,
      createdAt: getSeedTimestamp(-55),
    },
    {
      id: randomUUID(),
      userId: DEFAULT_USER_IDS.MEMBER_USER,
      entitlementKey: ENTITLEMENT_KEYS.MESSAGING_WRITE,
      grantedBy: DEFAULT_USER_IDS.ADMIN_USER,
      expiresAt: null,
      createdAt: getSeedTimestamp(-55),
    },

    // Viewer User - read-only
    {
      id: randomUUID(),
      userId: DEFAULT_USER_IDS.VIEWER_USER,
      entitlementKey: ENTITLEMENT_KEYS.CATALOG_READ,
      grantedBy: DEFAULT_USER_IDS.ADMIN_USER,
      expiresAt: null,
      createdAt: getSeedTimestamp(-50),
    },
    {
      id: randomUUID(),
      userId: DEFAULT_USER_IDS.VIEWER_USER,
      entitlementKey: ENTITLEMENT_KEYS.MESSAGING_READ,
      grantedBy: DEFAULT_USER_IDS.ADMIN_USER,
      expiresAt: null,
      createdAt: getSeedTimestamp(-50),
    },
  ];
}

/**
 * Generate default user roles
 */
export function generateDefaultUserRoles(): UserRoleSeedData[] {
  return [
    // Super Admin - all roles
    {
      id: randomUUID(),
      userId: DEFAULT_USER_IDS.SUPER_ADMIN,
      roleKey: ROLE_KEYS.PUBLISHER,
      grantedBy: null,
      expiresAt: null,
      createdAt: getSeedTimestamp(-90),
    },
    {
      id: randomUUID(),
      userId: DEFAULT_USER_IDS.SUPER_ADMIN,
      roleKey: ROLE_KEYS.DEVELOPER,
      grantedBy: null,
      expiresAt: null,
      createdAt: getSeedTimestamp(-90),
    },
    {
      id: randomUUID(),
      userId: DEFAULT_USER_IDS.SUPER_ADMIN,
      roleKey: ROLE_KEYS.OPERATOR,
      grantedBy: null,
      expiresAt: null,
      createdAt: getSeedTimestamp(-90),
    },

    // Admin User - publisher role
    {
      id: randomUUID(),
      userId: DEFAULT_USER_IDS.ADMIN_USER,
      roleKey: ROLE_KEYS.PUBLISHER,
      grantedBy: DEFAULT_USER_IDS.SUPER_ADMIN,
      expiresAt: null,
      createdAt: getSeedTimestamp(-85),
    },

    // Member User - developer role
    {
      id: randomUUID(),
      userId: DEFAULT_USER_IDS.MEMBER_USER,
      roleKey: ROLE_KEYS.DEVELOPER,
      grantedBy: DEFAULT_USER_IDS.ADMIN_USER,
      expiresAt: null,
      createdAt: getSeedTimestamp(-55),
    },
  ];
}

/**
 * Seed user entitlements into the database
 */
export async function seedUserEntitlements(
  db: any,
  userEntitlementsTable: any,
  config: SeedConfig = {}
): Promise<UserEntitlementSeedData[]> {
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

/**
 * Seed user roles into the database
 */
export async function seedUserRoles(
  db: any,
  userRolesTable: any,
  config: SeedConfig = {}
): Promise<UserRoleSeedData[]> {
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
