/**
 * Identity seed data - Users
 */

import {
  DEFAULT_USER_IDS,
  DEFAULT_USER_EMAILS,
  DEFAULT_TEST_PASSWORD_HASH,
  SeedConfig,
} from "../shared/constants.js";
import { SeedLogger, shouldSeed, getSeedTimestamp } from "../shared/utils.js";

/**
 * User seed data interface
 */
export interface UserSeedData {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  isSuperAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Generate default users for seed data
 */
export function generateDefaultUsers(): UserSeedData[] {
  const now = getSeedTimestamp();

  return [
    {
      id: DEFAULT_USER_IDS.SUPER_ADMIN,
      email: DEFAULT_USER_EMAILS.SUPER_ADMIN,
      passwordHash: DEFAULT_TEST_PASSWORD_HASH,
      name: "Super Admin",
      isSuperAdmin: true,
      createdAt: getSeedTimestamp(-60), // Created 60 minutes ago
      updatedAt: now,
    },
    {
      id: DEFAULT_USER_IDS.ADMIN_USER,
      email: DEFAULT_USER_EMAILS.ADMIN_USER,
      passwordHash: DEFAULT_TEST_PASSWORD_HASH,
      name: "Admin User",
      isSuperAdmin: false,
      createdAt: getSeedTimestamp(-50),
      updatedAt: now,
    },
    {
      id: DEFAULT_USER_IDS.MEMBER_USER,
      email: DEFAULT_USER_EMAILS.MEMBER_USER,
      passwordHash: DEFAULT_TEST_PASSWORD_HASH,
      name: "Member User",
      isSuperAdmin: false,
      createdAt: getSeedTimestamp(-40),
      updatedAt: now,
    },
    {
      id: DEFAULT_USER_IDS.VIEWER_USER,
      email: DEFAULT_USER_EMAILS.VIEWER_USER,
      passwordHash: DEFAULT_TEST_PASSWORD_HASH,
      name: "Viewer User",
      isSuperAdmin: false,
      createdAt: getSeedTimestamp(-30),
      updatedAt: now,
    },
    {
      id: DEFAULT_USER_IDS.TEST_USER_1,
      email: DEFAULT_USER_EMAILS.TEST_USER_1,
      passwordHash: DEFAULT_TEST_PASSWORD_HASH,
      name: "Test User 1",
      isSuperAdmin: false,
      createdAt: getSeedTimestamp(-20),
      updatedAt: now,
    },
    {
      id: DEFAULT_USER_IDS.TEST_USER_2,
      email: DEFAULT_USER_EMAILS.TEST_USER_2,
      passwordHash: DEFAULT_TEST_PASSWORD_HASH,
      name: "Test User 2",
      isSuperAdmin: false,
      createdAt: getSeedTimestamp(-10),
      updatedAt: now,
    },
  ];
}

/**
 * Seed users into the database
 */
export async function seedUsers(
  db: any,
  usersTable: any,
  config: SeedConfig = {}
): Promise<UserSeedData[]> {
  const logger = new SeedLogger(config.verbose);

  try {
    logger.info("Checking existing users...");
    const existingUsers = await db.select().from(usersTable);

    if (!shouldSeed(config, existingUsers.length)) {
      logger.warn(`Skipping users - ${existingUsers.length} already exist`);
      return existingUsers;
    }

    const users = generateDefaultUsers();
    logger.info(`Seeding ${users.length} users...`);

    await db.insert(usersTable).values(users);

    logger.success(`Seeded ${users.length} users`);
    return users;
  } catch (error) {
    logger.error("Failed to seed users:", error);
    throw error;
  }
}
