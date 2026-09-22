/**
 * Identity seed data - Users
 */
import { SeedConfig } from "../shared/constants.js";
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
export declare function generateDefaultUsers(passwordHash: string): UserSeedData[];
/**
 * Seed users into the database
 */
export declare function seedUsers(db: any, usersTable: any, 
/** Required. See generateDefaultUsers — this used to be a published constant. */
passwordHash: string, config?: SeedConfig): Promise<UserSeedData[]>;
