/**
 * Identity seed data - Organizations
 */
import { SeedConfig } from "../shared/constants.js";
/**
 * Organization seed data interface
 */
export interface OrganizationSeedData {
    id: string;
    name: string;
    slug: string;
    planId: string | null;
    createdAt: Date;
}
/**
 * Plan seed data interface
 */
export interface PlanSeedData {
    id: string;
    name: string;
    featuresJson: string[];
    limitsJson: Record<string, number>;
    priceCents: number;
}
/**
 * Generate default plans
 */
export declare function generateDefaultPlans(): PlanSeedData[];
/**
 * Generate default organizations
 */
export declare function generateDefaultOrganizations(): OrganizationSeedData[];
/**
 * Seed plans into the database
 */
export declare function seedPlans(db: any, plansTable: any, config?: SeedConfig): Promise<PlanSeedData[]>;
/**
 * Seed organizations into the database
 */
export declare function seedOrganizations(db: any, organizationsTable: any, config?: SeedConfig): Promise<OrganizationSeedData[]>;
