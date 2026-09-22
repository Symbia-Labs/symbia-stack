/**
 * Identity seed data - Memberships
 */
import { SeedConfig } from "../shared/constants.js";
/**
 * Membership seed data interface
 */
export interface MembershipSeedData {
    id: string;
    userId: string;
    orgId: string;
    role: "admin" | "member" | "viewer";
    createdAt: Date;
}
/**
 * Generate default memberships
 */
export declare function generateDefaultMemberships(): MembershipSeedData[];
/**
 * Seed memberships into the database
 */
export declare function seedMemberships(db: any, membershipsTable: any, config?: SeedConfig): Promise<MembershipSeedData[]>;
