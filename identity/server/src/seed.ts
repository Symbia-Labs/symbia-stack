/**
 * Identity Service - Seed Script
 *
 * Seeds the Identity database with default test data using @symbia/seed
 */

import { seedIdentityData, DEFAULT_USER_IDS, DEFAULT_ORG_IDS } from "@symbia/seed";
import { db } from "./db.js";
import * as schema from "../../shared/schema.js";
import * as crypto from "crypto";
// DEFAULT IMPORT, NOT NAMESPACE.
//
// This package is `"type": "module"` and bcryptjs is CommonJS, so
// `import * as bcrypt` yields a namespace object whose `hash` is not callable —
// `bcrypt.hash is not a function` at runtime, never at compile time.
// `server/src/routes.ts:6` has always used the default import and has always
// worked; this file used the namespace form and every call site in it was
// dead. That is why `seedAgents` failed too, and it is a second independent
// reason `npm run seed` has never completed on this stack.
import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";
import { encryptSecret } from "@symbia/crypto";

// Dev API keys loaded from environment variables (optional)
// Set DEV_OPENAI_API_KEY, DEV_HUGGINGFACE_API_KEY, DEV_TELEGRAM_BOT_TOKEN to enable auto-seeding
const DEV_API_KEYS: Record<string, string | undefined> = {
  openai: process.env.DEV_OPENAI_API_KEY,
  huggingface: process.env.DEV_HUGGINGFACE_API_KEY,
  telegram: process.env.DEV_TELEGRAM_BOT_TOKEN,
};

/**
 * Encrypt an API key for storage (A2: @symbia/crypto vault, HKDF-keyed
 * AES-256-GCM — no JWT_SECRET coupling, no hardcoded fallback).
 */
function encryptApiKey(apiKey: string): string {
  return encryptSecret(apiKey);
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

/**
 * The MCP probe account.
 *
 * WHY THIS IS SEEDED RATHER THAN CREATED BY HAND.
 *
 * `symbia-mcp-server` authenticates against Identity as a real user before it
 * can read anything but `/health`. That account existed, was created by hand,
 * and was destroyed when the identity database was re-initialised on 9 August
 * 2026 — `dev@example.com` carries that timestamp and is the only user left.
 * Nothing recreated it, so every authenticated MCP tool returned 401 while
 * `symbia_stack_health` kept working, which reads as "the MCP server is
 * broken" rather than "an account is missing". STATUS §6.10 recorded the
 * symptom and not the cause for two days.
 *
 * An account that only exists because someone typed it once is not
 * infrastructure. Seeding it means a database reset restores it, which is the
 * only version of "fixed" that survives the next reset.
 *
 * ON THE CREDENTIAL. Commit 5d94452 removed a hardcoded default password from
 * the MCP server, correctly — publishing the repo would have shipped a known
 * credential for the probe user on every stack running with defaults. That
 * fix is preserved here: production must supply `MCP_PROBE_PASSWORD` and this
 * refuses to seed without it. The development literal matches the one the MCP
 * server documented before it was removed, so an existing local config keeps
 * working, and it is no more exposed than `password123` two lines below.
 */
const MCP_PROBE_EMAIL = process.env.MCP_PROBE_EMAIL || "gap-probe@symbia.test";
const MCP_PROBE_PASSWORD =
  process.env.MCP_PROBE_PASSWORD ||
  (process.env.NODE_ENV === "production" ? undefined : "GapProbe!2026x");

async function seedMcpProbe(orgId: string): Promise<boolean> {
  if (!MCP_PROBE_PASSWORD) {
    console.log(
      "   • SKIPPED: MCP_PROBE_PASSWORD is not set and NODE_ENV=production. " +
        "The MCP server will not be able to authenticate until it is."
    );
    return false;
  }

  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, MCP_PROBE_EMAIL));
  if (existing.length > 0) {
    console.log(`   • ${MCP_PROBE_EMAIL} already exists`);
    return false;
  }

  const userId = crypto.randomUUID();
  await db.insert(schema.users).values({
    id: userId,
    email: MCP_PROBE_EMAIL,
    passwordHash: await bcrypt.hash(MCP_PROBE_PASSWORD, SALT_ROUNDS),
    name: "MCP Probe",
    isSuperAdmin: false,
  });

  // Membership, or the account authenticates and then sees nothing — which is
  // the same failure one layer along, and the one integrations hit today when
  // an agent with no organisation could not resolve a credential.
  await db.insert(schema.memberships).values({
    id: crypto.randomUUID(),
    userId,
    orgId,
    role: "member",
  });

  console.log(`   • Seeded ${MCP_PROBE_EMAIL} (read-only probe, member of ${orgId})`);
  return true;
}

/**
 * Run one stage, and let the rest run if it fails.
 *
 * THE SEED WAS ALL-OR-NOTHING, AND IT WAS NOTHING.
 *
 * Every stage sat inside one `try`, so the first throw skipped everything
 * after it and exited non-zero. Measured 11 Aug 2026: `seedIdentityData`
 * fails on this stack with
 * `user_entitlements_user_id_fkey ... Key (user_id)=(650e8400-…-440001) is not
 * present in table "users"` — it seeds entitlements for default users
 * (ADMIN_USER, MEMBER_USER, VIEWER_USER) that were never created, because only
 * the super-admin exists here.
 *
 * So `npm run seed` has not worked on this stack at all, and "re-run the seed"
 * was not a recovery path — it was a suggestion nobody had tested. The MCP
 * probe account, added minutes earlier, sat behind that throw and would never
 * have been created.
 *
 * This is the shape of STATUS §6.1 in a second place: one failure, nothing
 * applied, and the failure repeats every run. A seed that stops at the first
 * problem leaves the database in a state nobody chose. Each stage now stands
 * or falls on its own, every failure is named, and the exit code still reflects
 * that something went wrong.
 */
async function stage<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    failures.push(label);
    console.error(`\n❌ ${label} FAILED — continuing with the remaining stages.`);
    console.error(`   ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}

const failures: string[] = [];

async function runSeed() {
  console.log("🌱 Starting Identity service seeding...\n");

  try {
    const result = await stage("core identity data", () =>
      seedIdentityData(db, schema, {
        createSuperAdmin: true,
        createDefaultOrgs: true,
        createDefaultPlans: true,
        verbose: true,
        skipIfExists: true,
      })
    );

    // Seed dev credentials if API keys are provided in environment
    console.log("\n🔑 Seeding dev credentials...");
    const devUserId = DEFAULT_USER_IDS.SUPER_ADMIN;
    const devOrgId = DEFAULT_ORG_IDS.SYMBIA_LABS;
    const credentialCount = (await stage("dev credentials", () =>
      seedDevCredentials(devUserId, devOrgId)
    )) ?? 0;

    if (credentialCount === 0) {
      console.log("   • No new credentials seeded (already exist)");
    }

    // Seed agent identities for assistants
    console.log("\n🤖 Seeding agent identities...");
    const agentCount = (await stage("agent identities", () => seedAgents(devOrgId))) ?? 0;

    if (agentCount === 0) {
      console.log("   • No new agents seeded (already exist)");
    }

    // Seed the MCP probe account. Deliberately independent of everything
    // above: the MCP server is how this stack gets inspected, and it must not
    // be collateral damage from an unrelated seeding failure.
    console.log("\n🔎 Seeding MCP probe account...");
    await stage("MCP probe account", () => seedMcpProbe(devOrgId));

    if (failures.length > 0) {
      console.log(`\n⚠️  Identity seeding completed WITH FAILURES: ${failures.join(", ")}\n`);
    } else {
      console.log("\n✅ Identity seeding completed successfully!\n");
    }
    if (!result) {
      console.log("   (core identity data did not run — counts below are unavailable)\n");
      process.exit(failures.length > 0 ? 1 : 0);
    }
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

    // Non-zero when any stage failed, even though the others ran. "Partly
    // seeded" must not exit 0 — that is how a broken seed goes unnoticed.
    process.exit(failures.length > 0 ? 1 : 0);
  } catch (error) {
    console.error("\n❌ Failed to seed identity data:", error);
    process.exit(1);
  }
}

runSeed();
