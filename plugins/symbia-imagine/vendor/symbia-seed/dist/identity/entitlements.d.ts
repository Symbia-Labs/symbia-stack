/**
 * Identity seed data - Entitlements
 */
import { SeedConfig } from "../shared/constants.js";
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
export declare function generateDefaultUserEntitlements(): UserEntitlementSeedData[];
/**
 * Generate default user roles
 */
export declare function generateDefaultUserRoles(): UserRoleSeedData[];
/**
 * Seed user entitlements into the database
 */
export declare function seedUserEntitlements(db: any, userEntitlementsTable: any, config?: SeedConfig): Promise<UserEntitlementSeedData[]>;
/**
 * Seed user roles into the database
 */
export declare function seedUserRoles(db: any, userRolesTable: any, config?: SeedConfig): Promise<UserRoleSeedData[]>;
