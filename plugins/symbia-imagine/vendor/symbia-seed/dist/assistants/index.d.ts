/**
 * Assistants Service Seed Data
 *
 * This module provides basic seed data for the Symbia Assistants Service,
 * including sample agents (runtime graph executors) and prompt graphs.
 *
 * Note: "assistants" (specialized AI capabilities) are stored in the Catalog,
 * not here. This seeds "agents" which execute graphs at runtime.
 */
import { SeedConfig } from "../shared/constants.js";
/**
 * Agent seed data interface
 */
export interface AgentSeedData {
    id: string;
    orgId: string;
    principalId: string;
    principalType?: string;
    name: string;
    description?: string;
    capabilities: string[];
    webhooks: any;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export type BotSeedData = AgentSeedData;
/**
 * Graph seed data interface
 */
export interface GraphSeedData {
    id: string;
    orgId: string;
    name: string;
    description: string | null;
    graphJson: any;
    triggerConditions: any;
    logLevel: string;
    version: number;
    isPublished: boolean;
    createdAt: Date;
    updatedAt: Date;
}
/**
 * Generate default agents
 *
 * Agents are runtime graph executors in the Assistants service.
 * They can be triggered by events and execute prompt graphs.
 */
export declare function generateDefaultAgents(): AgentSeedData[];
export declare const generateDefaultBots: typeof generateDefaultAgents;
/**
 * Generate default graphs
 */
export declare function generateDefaultPromptGraphs(): GraphSeedData[];
/**
 * Seed agents
 */
export declare function seedAgents(db: any, agentsTable: any, config?: SeedConfig): Promise<AgentSeedData[]>;
export declare const seedBots: typeof seedAgents;
/**
 * Seed graphs
 */
export declare function seedGraphs(db: any, graphsTable: any, config?: SeedConfig): Promise<GraphSeedData[]>;
/**
 * Seed all assistants data
 */
export declare function seedAssistantsData(db: any, schema: any, config?: SeedConfig): Promise<{
    agents: AgentSeedData[];
    graphs: GraphSeedData[];
}>;
