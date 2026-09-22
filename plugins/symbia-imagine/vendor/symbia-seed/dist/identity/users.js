/**
 * Identity seed data - Users
 */
import { DEFAULT_USER_IDS, DEFAULT_USER_EMAILS, } from "../shared/constants.js";
import { SeedLogger, shouldSeed, getSeedTimestamp } from "../shared/utils.js";
/**
 * Generate default users for seed data.
 *
 * THE PASSWORD HASH IS A PARAMETER, NOT A CONSTANT — 23 Aug 2026, finding F24b.
 *
 * This function used to assign `DEFAULT_TEST_PASSWORD_HASH` to all six users,
 * a bcrypt hash of "password123" with the plaintext named in the comment beside
 * it, in a repository verified anonymously readable. Every stack that ran
 * `npm run seed` therefore had six accounts whose password was public,
 * `SUPER_ADMIN` among them.
 *
 * Credential invention belongs to the service that owns a database, not to a
 * library that generates data shapes. `identity/server/src/seed.ts` has bcryptjs
 * and now resolves the value through the same `default-admin.ts` helper the boot
 * bootstrap uses; this module is handed the result.
 *
 * Required rather than defaulted on purpose. A default here is how the constant
 * comes back — the caller would omit it, the tests would pass, and the hash
 * would be in a database again with nothing to notice it.
 */
export function generateDefaultUsers(passwordHash) {
    if (!passwordHash) {
        throw new Error("generateDefaultUsers requires a passwordHash. It no longer carries one: " +
            "a shared constant here put a publicly-known password on six seeded " +
            "accounts (F24b). Hash a value the caller controls and pass it in.");
    }
    const now = getSeedTimestamp();
    return [
        {
            id: DEFAULT_USER_IDS.SUPER_ADMIN,
            email: DEFAULT_USER_EMAILS.SUPER_ADMIN,
            passwordHash,
            name: "Super Admin",
            isSuperAdmin: true,
            createdAt: getSeedTimestamp(-60), // Created 60 minutes ago
            updatedAt: now,
        },
        {
            id: DEFAULT_USER_IDS.ADMIN_USER,
            email: DEFAULT_USER_EMAILS.ADMIN_USER,
            passwordHash,
            name: "Admin User",
            isSuperAdmin: false,
            createdAt: getSeedTimestamp(-50),
            updatedAt: now,
        },
        {
            id: DEFAULT_USER_IDS.MEMBER_USER,
            email: DEFAULT_USER_EMAILS.MEMBER_USER,
            passwordHash,
            name: "Member User",
            isSuperAdmin: false,
            createdAt: getSeedTimestamp(-40),
            updatedAt: now,
        },
        {
            id: DEFAULT_USER_IDS.VIEWER_USER,
            email: DEFAULT_USER_EMAILS.VIEWER_USER,
            passwordHash,
            name: "Viewer User",
            isSuperAdmin: false,
            createdAt: getSeedTimestamp(-30),
            updatedAt: now,
        },
        {
            id: DEFAULT_USER_IDS.TEST_USER_1,
            email: DEFAULT_USER_EMAILS.TEST_USER_1,
            passwordHash,
            name: "Test User 1",
            isSuperAdmin: false,
            createdAt: getSeedTimestamp(-20),
            updatedAt: now,
        },
        {
            id: DEFAULT_USER_IDS.TEST_USER_2,
            email: DEFAULT_USER_EMAILS.TEST_USER_2,
            passwordHash,
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
export async function seedUsers(db, usersTable, 
/** Required. See generateDefaultUsers — this used to be a published constant. */
passwordHash, config = {}) {
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
    }
    catch (error) {
        logger.error("Failed to seed users:", error);
        throw error;
    }
}
