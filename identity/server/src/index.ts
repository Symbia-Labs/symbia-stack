import { createSymbiaServer, log } from "@symbia/http";
import { createTelemetryClient } from "@symbia/logging-client";
import { initServiceRelay, shutdownRelay } from "@symbia/relay";
import { ServiceId } from "@symbia/sys";
import { registerRoutes } from "./routes";
import { seedIdentityData, DEFAULT_USER_IDS, DEFAULT_ORG_IDS } from "@symbia/seed";
import { db, database, exportToFile, isMemory, ensureIdentitySchema } from "./db";
import * as schema from "../../shared/schema.js";
import { join } from "path";
import * as crypto from "crypto";
import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";

// Encryption key for credentials
const ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.JWT_SECRET || "dev-secret-key-32chars-minimum!!";

// Dev API keys loaded from environment variables (optional)
// Set DEV_OPENAI_API_KEY, DEV_HUGGINGFACE_API_KEY to enable auto-seeding
const DEV_API_KEYS: Record<string, string | undefined> = {
  openai: process.env.DEV_OPENAI_API_KEY,
  huggingface: process.env.DEV_HUGGINGFACE_API_KEY,
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
async function seedDevCredentials(): Promise<void> {
  const credentials: Array<{ provider: string; name: string }> = [
    { provider: "openai", name: "Dev OpenAI Key" },
    { provider: "huggingface", name: "Dev HuggingFace Key" },
  ];

  const userId = DEFAULT_USER_IDS.SUPER_ADMIN;
  const orgId = DEFAULT_ORG_IDS.SYMBIA_LABS;

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

    if (existing.length > 0) continue;

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
      isOrgWide: true,
      metadata: { source: "dev-auto-seed" },
    });

    console.log(`  ✓ Seeded ${provider} credential (${prefix})`);
  }
}

// Bootstrap assistants that need agent identities
const BOOTSTRAP_AGENTS = [
  { agentId: "assistant:log-analyst", name: "Log Analyst", capabilities: ["cap:messaging.send", "cap:messaging.receive", "cap:logs.read"] },
  { agentId: "assistant:catalog-search", name: "Catalog Search", capabilities: ["cap:messaging.send", "cap:messaging.receive", "cap:catalog.read"] },
  { agentId: "assistant:run-debugger", name: "Run Debugger", capabilities: ["cap:messaging.send", "cap:messaging.receive", "cap:runs.read"] },
  { agentId: "assistant:usage-reporter", name: "Usage Reporter", capabilities: ["cap:messaging.send", "cap:messaging.receive", "cap:metrics.read"] },
  { agentId: "assistant:onboarding", name: "Onboarding", capabilities: ["cap:messaging.send", "cap:messaging.receive"] },
  { agentId: "assistant:cli-assistant", name: "CLI Assistant", capabilities: ["cap:messaging.send", "cap:messaging.receive"] },
  { agentId: "assistant:test-assistant", name: "Test Assistant", capabilities: ["cap:messaging.send", "cap:messaging.receive"] },
];

// Default credential for all agents in dev
// Must be at least 32 characters to pass identity service validation
const AGENT_DEV_CREDENTIAL = process.env.AGENT_CREDENTIAL || "symbia-agent-dev-secret-32chars-min!!";
const SALT_ROUNDS = 10;

/**
 * Seed agent identities for bootstrap assistants
 */
async function seedAgents(): Promise<void> {
  const orgId = DEFAULT_ORG_IDS.SYMBIA_LABS;

  for (const agentDef of BOOTSTRAP_AGENTS) {
    // Check if agent already exists
    const existing = await db.select()
      .from(schema.agents)
      .where(eq(schema.agents.agentId, agentDef.agentId));

    if (existing.length > 0) continue;

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
      metadata: { source: "dev-auto-seed", version: "1.0" },
    });

    console.log(`  ✓ Seeded agent ${agentDef.agentId}`);
  }
}

const telemetry = createTelemetryClient({
  serviceId: process.env.TELEMETRY_SERVICE_ID || ServiceId.IDENTITY,
});

const server = createSymbiaServer({
  serviceId: ServiceId.IDENTITY,
  telemetry: {
    client: telemetry,
  },
  database,
  registerRoutes: async (httpServer, app) => {
    await registerRoutes(httpServer, app as any);

    // Auto-seed in-memory database for testing
    if (process.env.IDENTITY_USE_MEMORY_DB === "true") {
      console.log("Auto-seeding in-memory database...");
      try {
        await seedIdentityData(db, schema, {
          createSuperAdmin: true,
          createDefaultOrgs: true,
          createDefaultPlans: true,
          verbose: false,
          skipIfExists: true,
        });
        console.log("✓ In-memory database seeded successfully");

        // Always seed dev credentials with hardcoded keys for zero-config dev experience
        console.log("Seeding dev API credentials...");
        await seedDevCredentials();

        // Seed agent identities for assistants
        console.log("Seeding agent identities...");
        await seedAgents();

        // Verify credentials were seeded
        const allCreds = await db.select().from(schema.userCredentials);
        console.log(`✓ Credentials in database: ${allCreds.length}`);
        for (const cred of allCreds) {
          console.log(`  - ${cred.provider}: userId=${cred.userId}, orgId=${cred.orgId}, isOrgWide=${cred.isOrgWide}`);
        }
      } catch (error) {
        console.error("Failed to seed in-memory database:", error);
      }
    }
  },
});

async function start(): Promise<void> {
  // Ensure PostgreSQL schema exists for out-of-box local Docker runs.
  await ensureIdentitySchema();

  await server.start();

  // Connect to network service after server starts
  await initServiceRelay({
    serviceId: ServiceId.IDENTITY,
    serviceName: 'Identity Service',
    capabilities: [
      'identity.auth.login',
      'identity.auth.logout',
      'identity.auth.introspect',
      'identity.user.create',
      'identity.user.read',
      'identity.org.manage',
      'identity.apikey.manage',
    ],
  });
}

start().catch((error) => {
  console.error("[identity] Failed to start:", error);
  process.exit(1);
});

// Graceful shutdown handler for relay and database export
async function gracefulShutdown(signal: string) {
  console.log(`\n[identity] Received ${signal}, starting graceful shutdown...`);

  // Export in-memory database if applicable
  if (isMemory) {
    const exportPath = process.env.IDENTITY_DB_EXPORT_PATH ||
      join(process.cwd(), '.local-pids', `identity-db-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    console.log(`[identity] Exporting in-memory database to ${exportPath}...`);
    const success = exportToFile(exportPath);
    if (success) {
      console.log(`[identity] ✓ Database exported successfully`);
    } else {
      console.log(`[identity] ✗ Database export failed`);
    }
  }

  // Shutdown relay connection
  await shutdownRelay();

  console.log(`[identity] Shutdown complete`);
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { log };
