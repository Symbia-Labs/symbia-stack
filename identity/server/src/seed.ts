/**
 * Identity Service - Seed Script
 *
 * Seeds the Identity database with default test data using @symbia/seed
 */

import { seedIdentityData, DEFAULT_USER_IDS, DEFAULT_ORG_IDS } from "@symbia/seed";
import { db } from "./db.js";
import * as schema from "../../shared/schema.js";
import * as crypto from "crypto";
import * as bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";

// Encryption key for credentials (use JWT_SECRET as fallback)
const ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.JWT_SECRET || "dev-secret-key-32chars-minimum!!";

// Dev API keys loaded from environment variables (optional)
// Set DEV_OPENAI_API_KEY, DEV_HUGGINGFACE_API_KEY, DEV_TELEGRAM_BOT_TOKEN to enable auto-seeding
const DEV_API_KEYS: Record<string, string | undefined> = {
  openai: process.env.DEV_OPENAI_API_KEY,
  huggingface: process.env.DEV_HUGGINGFACE_API_KEY,
  telegram: process.env.DEV_TELEGRAM_BOT_TOKEN,
};

/**
 * Encrypt an API key for storage
 */
function encryptApiKey(apiKey: string): string {
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32));
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Seed default API credentials for dev user
 */
async function seedDevCredentials(userId: string, orgId: string): Promise<number> {
  const credentials: Array<{ provider: string; name: string }> = [
    { provider: "openai", name: "Dev OpenAI Key" },
    { provider: "huggingface", name: "Dev HuggingFace Key" },
    { provider: "telegram", name: "Dev Telegram Bot Token" },
  ];

  let seededCount = 0;

  for (const { provider, name } of credentials) {
    const apiKey = DEV_API_KEYS[provider];
    if (!apiKey) continue;

    // Check if credential already exists
    const existing = await db.select()
      .from(schema.userCredentials)
      .where(and(
        eq(schema.userCredentials.userId, userId),
        eq(schema.userCredentials.provider, provider)
      ));

    if (existing.length > 0) {
      console.log(`   • Skipping ${provider} credential (already exists)`);
      continue;
    }

    // Encrypt and store
    const encrypted = encryptApiKey(apiKey);
    const prefix = apiKey.substring(0, 8) + "...";

    await db.insert(schema.userCredentials).values({
      id: crypto.randomUUID(),
      userId,
      orgId,
      provider,
      name,
      credentialEncrypted: encrypted,
      credentialPrefix: prefix,
      isOrgWide: true, // Available to all org members in dev mode
      metadata: { source: "dev-seed" },
    });

    console.log(`   • Seeded ${provider} credential (${prefix})`);
    seededCount++;
  }

  return seededCount;
}

// Bootstrap assistants that need agent identities
const BOOTSTRAP_AGENTS = [
  // Core assistants
  { agentId: "assistant:log-analyst", name: "Log Analyst", capabilities: ["cap:messaging.send", "cap:messaging.receive", "cap:logs.read"] },
  { agentId: "assistant:catalog-search", name: "Catalog Search", capabilities: ["cap:messaging.send", "cap:messaging.receive", "cap:catalog.read"] },
  { agentId: "assistant:run-debugger", name: "Run Debugger", capabilities: ["cap:messaging.send", "cap:messaging.receive", "cap:runs.read"] },
  { agentId: "assistant:usage-reporter", name: "Usage Reporter", capabilities: ["cap:messaging.send", "cap:messaging.receive", "cap:metrics.read"] },
  { agentId: "assistant:onboarding", name: "Onboarding", capabilities: ["cap:messaging.send", "cap:messaging.receive"] },
  { agentId: "assistant:cli-assistant", name: "CLI Assistant", capabilities: ["cap:messaging.send", "cap:messaging.receive"] },
  { agentId: "assistant:code-agent", name: "Code Agent", capabilities: ["cap:messaging.send", "cap:messaging.receive"] },
  { agentId: "assistant:test-assistant", name: "Test Assistant", capabilities: ["cap:messaging.send", "cap:messaging.receive"] },
  { agentId: "assistant:assistants-assistant", name: "Assistants Assistant", capabilities: ["cap:messaging.send", "cap:messaging.receive"] },
  { agentId: "assistant:coordinator", name: "Coordinator", capabilities: ["cap:messaging.send", "cap:messaging.receive", "cap:coordinator"] },
  // Batch 1 assistants
  { agentId: "assistant:echo-assistant", name: "Echo", capabilities: ["cap:messaging.send", "cap:messaging.receive"] },
  { agentId: "assistant:motivator-assistant", name: "Motivator", capabilities: ["cap:messaging.send", "cap:messaging.receive"] },
  { agentId: "assistant:timer-assistant", name: "Timer", capabilities: ["cap:messaging.send", "cap:messaging.receive"] },
  { agentId: "assistant:math-assistant", name: "Math", capabilities: ["cap:messaging.send", "cap:messaging.receive"] },
  { agentId: "assistant:summarizer-assistant", name: "Summarizer", capabilities: ["cap:messaging.send", "cap:messaging.receive"] },
  { agentId: "assistant:translator-assistant", name: "Translator", capabilities: ["cap:messaging.send", "cap:messaging.receive"] },
  { agentId: "assistant:sentiment-assistant", name: "Sentiment", capabilities: ["cap:messaging.send", "cap:messaging.receive"] },
  { agentId: "assistant:json-assistant", name: "JSON", capabilities: ["cap:messaging.send", "cap:messaging.receive"] },
  { agentId: "assistant:regex-assistant", name: "Regex", capabilities: ["cap:messaging.send", "cap:messaging.receive"] },
  { agentId: "assistant:orchestrator-assistant", name: "Orchestrator", capabilities: ["cap:messaging.send", "cap:messaging.receive", "cap:orchestrator"] },
  // Batch 2 assistants
  { agentId: "assistant:weather-assistant", name: "Weather", capabilities: ["cap:messaging.send", "cap:messaging.receive"] },
  { agentId: "assistant:dictionary-assistant", name: "Dictionary", capabilities: ["cap:messaging.send", "cap:messaging.receive"] },
  { agentId: "assistant:converter-assistant", name: "Converter", capabilities: ["cap:messaging.send", "cap:messaging.receive"] },
  { agentId: "assistant:reminder-assistant", name: "Reminder", capabilities: ["cap:messaging.send", "cap:messaging.receive"] },
  { agentId: "assistant:todo-assistant", name: "Todo", capabilities: ["cap:messaging.send", "cap:messaging.receive"] },
  { agentId: "assistant:fact-checker-assistant", name: "Fact Checker", capabilities: ["cap:messaging.send", "cap:messaging.receive"] },
  { agentId: "assistant:code-reviewer-assistant", name: "Code Reviewer", capabilities: ["cap:messaging.send", "cap:messaging.receive"] },
  { agentId: "assistant:docs-writer-assistant", name: "Docs Writer", capabilities: ["cap:messaging.send", "cap:messaging.receive"] },
  { agentId: "assistant:sql-helper-assistant", name: "SQL Helper", capabilities: ["cap:messaging.send", "cap:messaging.receive"] },
  { agentId: "assistant:git-helper-assistant", name: "Git Helper", capabilities: ["cap:messaging.send", "cap:messaging.receive"] },
];

// Default credential for all agents in dev (production uses env vars)
// Must be at least 32 characters to pass identity service validation
const AGENT_DEV_CREDENTIAL = process.env.AGENT_CREDENTIAL || "symbia-agent-dev-secret-32chars-min!!";
const SALT_ROUNDS = 10;

/**
 * Seed agent identities for bootstrap assistants
 */
async function seedAgents(orgId: string): Promise<number> {
  let seededCount = 0;

  for (const agentDef of BOOTSTRAP_AGENTS) {
    // Check if agent already exists
    const existing = await db.select()
      .from(schema.agents)
      .where(eq(schema.agents.agentId, agentDef.agentId));

    if (existing.length > 0) {
      console.log(`   • Skipping agent ${agentDef.agentId} (already exists)`);
      continue;
    }

    // Hash the credential
    const credentialHash = await bcrypt.hash(AGENT_DEV_CREDENTIAL, SALT_ROUNDS);

    await db.insert(schema.agents).values({
      id: crypto.randomUUID(),
      agentId: agentDef.agentId,
      credentialHash,
      name: agentDef.name,
      orgId,
      capabilities: agentDef.capabilities,
      isActive: true,
      metadata: { source: "dev-seed", version: "1.0" },
    });

    console.log(`   • Seeded agent ${agentDef.agentId} (${agentDef.name})`);
    seededCount++;
  }

  return seededCount;
}

async function runSeed() {
  console.log("🌱 Starting Identity service seeding...\n");

  try {
    const result = await seedIdentityData(db, schema, {
      createSuperAdmin: true,
      createDefaultOrgs: true,
      createDefaultPlans: true,
      verbose: true,
      skipIfExists: true,
    });

    // Seed dev credentials if API keys are provided in environment
    console.log("\n🔑 Seeding dev credentials...");
    const devUserId = DEFAULT_USER_IDS.SUPER_ADMIN;
    const devOrgId = DEFAULT_ORG_IDS.SYMBIA_LABS;
    const credentialCount = await seedDevCredentials(devUserId, devOrgId);

    if (credentialCount === 0) {
      console.log("   • No new credentials seeded (already exist)");
    }

    // Seed agent identities for assistants
    console.log("\n🤖 Seeding agent identities...");
    const agentCount = await seedAgents(devOrgId);

    if (agentCount === 0) {
      console.log("   • No new agents seeded (already exist)");
    }

    console.log("\n✅ Identity seeding completed successfully!\n");
    console.log("📊 Summary:");
    console.log(`   • Users: ${result.users.length}`);
    console.log(`   • Organizations: ${result.organizations.length}`);
    console.log(`   • Plans: ${result.plans.length}`);
    console.log(`   • Memberships: ${result.memberships.length}`);
    console.log(`   • User Entitlements: ${result.userEntitlements.length}`);
    console.log(`   • User Roles: ${result.userRoles.length}`);
    console.log(`   • Dev Credentials: ${credentialCount}`);
    console.log(`   • Agents: ${agentCount}`);
    console.log("\n🔐 Test Credentials:");
    console.log("   Email: dev@example.com");
    console.log("   Password: password123");
    console.log("\n🤖 Agent Credential:");
    console.log(`   Credential: ${AGENT_DEV_CREDENTIAL}`);
    console.log("\n⚠️  NEVER use these credentials in production!\n");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Failed to seed identity data:", error);
    process.exit(1);
  }
}

runSeed();
