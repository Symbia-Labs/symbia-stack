import { createRequire as __symbiaCreateRequire } from "node:module";globalThis.require ??= __symbiaCreateRequire(import.meta.url);
import {
  DEFAULT_AGENT_IDS,
  DEFAULT_ORG_IDS,
  SeedLogger,
  getSeedTimestamp,
  shouldSeed
} from "./chunk-SYI65BHD.mjs";

// build/plugin/symbia-imagine/vendor/symbia-seed/dist/assistants/index.js
import { randomUUID } from "crypto";
function generateDefaultAgents() {
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
      updatedAt: now
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
      updatedAt: now
    }
  ];
}
var generateDefaultBots = generateDefaultAgents;
function generateDefaultPromptGraphs() {
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
          { id: "greet", type: "message", data: { text: "Welcome to Symbia!" } }
        ],
        edges: [{ source: "start", target: "greet" }]
      },
      triggerConditions: { event: "conversation.start" },
      logLevel: "info",
      version: 1,
      isPublished: true,
      createdAt: getSeedTimestamp(-45),
      updatedAt: now
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
          { id: "route", type: "router", data: { paths: ["urgent", "normal", "low"] } }
        ],
        edges: [
          { source: "start", target: "analyze" },
          { source: "analyze", target: "route" }
        ]
      },
      triggerConditions: { event: "message.received", type: "support" },
      logLevel: "warn",
      version: 1,
      isPublished: true,
      createdAt: getSeedTimestamp(-35),
      updatedAt: now
    }
  ];
}
async function seedAgents(db, agentsTable, config = {}) {
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
var seedBots = seedAgents;
async function seedGraphs(db, graphsTable, config = {}) {
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
async function seedAssistantsData(db, schema, config = {}) {
  const logger = new SeedLogger(config.verbose);
  logger.info("Starting assistants data seeding...");
  try {
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

export {
  generateDefaultAgents,
  generateDefaultBots,
  generateDefaultPromptGraphs,
  seedAgents,
  seedBots,
  seedGraphs,
  seedAssistantsData
};
