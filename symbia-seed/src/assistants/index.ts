/**
 * Assistants Service Seed Data
 *
 * This module provides basic seed data for the Symbia Assistants Service,
 * including sample agents (runtime graph executors) and prompt graphs.
 *
 * Note: "assistants" (specialized AI capabilities) are stored in the Catalog,
 * not here. This seeds "agents" which execute graphs at runtime.
 */

import { randomUUID } from "crypto";
import {
  DEFAULT_AGENT_IDS,
  DEFAULT_BOT_IDS,
  DEFAULT_ORG_IDS,
  DEFAULT_USER_IDS,
  SeedConfig,
} from "../shared/constants.js";
import { SeedLogger, shouldSeed, getSeedTimestamp } from "../shared/utils.js";

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

// Backward compatibility alias
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
export function generateDefaultAgents(): AgentSeedData[] {
  const now = getSeedTimestamp();

  return [
    {
      id: DEFAULT_AGENT_IDS.WELCOME_AGENT,
      orgId: DEFAULT_ORG_IDS.SYMBIA_LABS,
      principalId: "agent:welcome",
      principalType: "agent",
      name: "Welcome Agent",
      description: "Greets new users and provides initial guidance",
      capabilities: ["cap:messaging.interrupt", "cap:messaging.route"],
      webhooks: {},
      isActive: true,
      createdAt: getSeedTimestamp(-50),
      updatedAt: now,
    },
    {
      id: DEFAULT_AGENT_IDS.SUPPORT_AGENT,
      orgId: DEFAULT_ORG_IDS.ACME_CORP,
      principalId: "agent:support",
      principalType: "agent",
      name: "Support Agent",
      description: "Routes support requests to appropriate handlers",
      capabilities: ["cap:messaging.interrupt", "cap:messaging.route"],
      webhooks: {},
      isActive: true,
      createdAt: getSeedTimestamp(-40),
      updatedAt: now,
    },
  ];
}

// Backward compatibility
export const generateDefaultBots = generateDefaultAgents;

/**
 * Generate default graphs
 */
export function generateDefaultPromptGraphs(): GraphSeedData[] {
  const now = getSeedTimestamp();

  return [
    {
      id: randomUUID(),
      orgId: DEFAULT_ORG_IDS.SYMBIA_LABS,
      name: "Welcome Flow",
      description: "Greets new users and provides initial guidance",
      graphJson: {
        nodes: [
          { id: "start", type: "trigger", data: { event: "conversation.start" } },
          { id: "greet", type: "message", data: { text: "Welcome to Symbia!" } },
        ],
        edges: [{ source: "start", target: "greet" }],
      },
      triggerConditions: { event: "conversation.start" },
      logLevel: "info",
      version: 1,
      isPublished: true,
      createdAt: getSeedTimestamp(-45),
      updatedAt: now,
    },
    {
      id: randomUUID(),
      orgId: DEFAULT_ORG_IDS.ACME_CORP,
      name: "Support Triage",
      description: "Routes support requests to appropriate handlers",
      graphJson: {
        nodes: [
          { id: "start", type: "trigger", data: { event: "message.received" } },
          { id: "analyze", type: "llm", data: { prompt: "Analyze support request" } },
          { id: "route", type: "router", data: { paths: ["urgent", "normal", "low"] } },
        ],
        edges: [
          { source: "start", target: "analyze" },
          { source: "analyze", target: "route" },
        ],
      },
      triggerConditions: { event: "message.received", type: "support" },
      logLevel: "warn",
      version: 1,
      isPublished: true,
      createdAt: getSeedTimestamp(-35),
      updatedAt: now,
    },
  ];
}

/**
 * Seed agents
 */
export async function seedAgents(
  db: any,
  agentsTable: any,
  config: SeedConfig = {}
): Promise<AgentSeedData[]> {
  const logger = new SeedLogger(config.verbose);

  try {
    logger.info("Checking existing agents...");
    const existing = await db.select().from(agentsTable);

    if (!shouldSeed(config, existing.length)) {
      logger.warn(`Skipping agents - ${existing.length} already exist`);
      return existing;
    }

    const agents = generateDefaultAgents();
    logger.info(`Seeding ${agents.length} agents...`);

    await db.insert(agentsTable).values(agents);

    logger.success(`Seeded ${agents.length} agents`);
    return agents;
  } catch (error) {
    logger.error("Failed to seed agents:", error);
    throw error;
  }
}

// Backward compatibility
export const seedBots = seedAgents;

/**
 * Seed graphs
 */
export async function seedGraphs(
  db: any,
  graphsTable: any,
  config: SeedConfig = {}
): Promise<GraphSeedData[]> {
  const logger = new SeedLogger(config.verbose);

  try {
    logger.info("Checking existing graphs...");
    const existing = await db.select().from(graphsTable);

    if (!shouldSeed(config, existing.length)) {
      logger.warn(`Skipping graphs - ${existing.length} already exist`);
      return existing;
    }

    const graphs = generateDefaultPromptGraphs();
    logger.info(`Seeding ${graphs.length} graphs...`);

    await db.insert(graphsTable).values(graphs);

    logger.success(`Seeded ${graphs.length} graphs`);
    return graphs;
  } catch (error) {
    logger.error("Failed to seed graphs:", error);
    throw error;
  }
}

/**
 * Seed all assistants data
 */
export async function seedAssistantsData(
  db: any,
  schema: any,
  config: SeedConfig = {}
): Promise<{ agents: AgentSeedData[]; graphs: GraphSeedData[] }> {
  const logger = new SeedLogger(config.verbose);

  logger.info("Starting assistants data seeding...");

  try {
    // Support both new 'agents' and legacy 'bots' schema keys
    const agentsTable = schema.agents || schema.bots;
    const agents = agentsTable ? await seedAgents(db, agentsTable, config) : [];
    const graphs = schema.graphs ? await seedGraphs(db, schema.graphs, config) : [];

    logger.success("Assistants data seeding completed successfully");
    logger.info(`Summary:
      - Agents: ${agents.length}
      - Graphs: ${graphs.length}
    `);

    return { agents, graphs };
  } catch (error) {
    logger.error("Failed to seed assistants data:", error);
    throw error;
  }
}
