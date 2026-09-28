import { createRequire as __symbiaCreateRequire } from "node:module";globalThis.require ??= __symbiaCreateRequire(import.meta.url);

// build/plugin/symbia-imagine/vendor/symbia-seed/dist/shared/constants.js
var DEFAULT_ORG_IDS = {
  SYMBIA_SYSTEM: "00000000-0000-0000-0000-000000000001",
  // System org (auto-created, all services)
  SYMBIA_LABS: "550e8400-e29b-41d4-a716-446655440000",
  // Symbia Labs (default org)
  ACME_CORP: "550e8400-e29b-41d4-a716-446655440001",
  // Acme Corp (test org)
  TEST_ORG: "550e8400-e29b-41d4-a716-446655440002"
  // Generic test org
};
var DEFAULT_USER_IDS = {
  SUPER_ADMIN: "650e8400-e29b-41d4-a716-446655440000",
  ADMIN_USER: "650e8400-e29b-41d4-a716-446655440001",
  MEMBER_USER: "650e8400-e29b-41d4-a716-446655440002",
  VIEWER_USER: "650e8400-e29b-41d4-a716-446655440003",
  TEST_USER_1: "650e8400-e29b-41d4-a716-446655440004",
  TEST_USER_2: "650e8400-e29b-41d4-a716-446655440005"
};
var DEFAULT_PROJECT_IDS = {
  SYMBIA_CORE: "750e8400-e29b-41d4-a716-446655440000",
  TEST_PROJECT: "750e8400-e29b-41d4-a716-446655440001"
};
var DEFAULT_COMPONENT_IDS = {
  IDENTITY_COMPONENT: "850e8400-e29b-41d4-a716-446655440000",
  HTTP_REQUEST_COMPONENT: "850e8400-e29b-41d4-a716-446655440001",
  JSON_PARSE_COMPONENT: "850e8400-e29b-41d4-a716-446655440002",
  TEMPLATE_COMPONENT: "850e8400-e29b-41d4-a716-446655440003"
};
var DEFAULT_GRAPH_IDS = {
  HELLO_WORLD_GRAPH: "950e8400-e29b-41d4-a716-446655440000",
  AUTH_FLOW_GRAPH: "950e8400-e29b-41d4-a716-446655440001"
};
var DEFAULT_CONVERSATION_IDS = {
  WELCOME_CONVERSATION: "a50e8400-e29b-41d4-a716-446655440000",
  SUPPORT_CONVERSATION: "a50e8400-e29b-41d4-a716-446655440001"
};
var DEFAULT_AGENT_IDS = {
  WELCOME_AGENT: "b50e8400-e29b-41d4-a716-446655440000",
  SUPPORT_AGENT: "b50e8400-e29b-41d4-a716-446655440001"
};
var DEFAULT_BOT_IDS = DEFAULT_AGENT_IDS;
var TEST_ONLY_PASSWORD_HASH = "$2b$10$81J.RrrhFSuCorK//jVlm.c0cqDurO8DFPqOE9A9bNSsQeARfTcxa";
var DEFAULT_TEST_PASSWORD_HASH = TEST_ONLY_PASSWORD_HASH;
var ENTITLEMENT_KEYS = {
  // Catalog entitlements
  CATALOG_READ: "cap:catalog.read",
  CATALOG_WRITE: "cap:catalog.write",
  CATALOG_PUBLISH: "cap:catalog.publish",
  CATALOG_ADMIN: "cap:catalog.admin",
  // Registry entitlements
  REGISTRY_READ: "cap:registry.read",
  REGISTRY_WRITE: "cap:registry.write",
  REGISTRY_PUBLISH: "cap:registry.publish",
  // Messaging entitlements
  MESSAGING_READ: "cap:messaging.read",
  MESSAGING_WRITE: "cap:messaging.write",
  MESSAGING_INTERRUPT: "cap:messaging.interrupt",
  MESSAGING_ROUTE: "cap:messaging.route",
  // Assistants entitlements
  ASSISTANTS_EXECUTE: "cap:assistants.execute",
  ASSISTANTS_MANAGE: "cap:assistants.manage"
};
var ROLE_KEYS = {
  PUBLISHER: "role:publisher",
  DEVELOPER: "role:developer",
  OPERATOR: "role:operator"
};
var DEFAULT_ORG_SLUGS = {
  SYMBIA_SYSTEM: "symbia-system",
  SYMBIA_LABS: "symbia-labs",
  ACME_CORP: "acme-corp",
  TEST_ORG: "test-org"
};
var DEFAULT_USER_EMAILS = {
  SUPER_ADMIN: "dev@example.com",
  ADMIN_USER: "admin@acme-corp.com",
  MEMBER_USER: "member@acme-corp.com",
  VIEWER_USER: "viewer@acme-corp.com",
  TEST_USER_1: "test1@example.com",
  TEST_USER_2: "test2@example.com"
};

// build/plugin/symbia-imagine/vendor/symbia-seed/dist/shared/utils.js
var SeedLogger = class {
  verbose;
  constructor(verbose = false) {
    this.verbose = verbose;
  }
  info(message, ...args) {
    if (this.verbose) {
      console.log(`[SEED] ${message}`, ...args);
    }
  }
  success(message, ...args) {
    console.log(`[SEED] \u2713 ${message}`, ...args);
  }
  error(message, ...args) {
    console.error(`[SEED] \u2717 ${message}`, ...args);
  }
  warn(message, ...args) {
    if (this.verbose) {
      console.warn(`[SEED] \u26A0 ${message}`, ...args);
    }
  }
};
function shouldSeed(config, existingCount) {
  if (config.skipIfExists && existingCount > 0) {
    return false;
  }
  return true;
}
function getSeedTimestamp(offsetMinutes = 0) {
  const now = /* @__PURE__ */ new Date();
  now.setMinutes(now.getMinutes() + offsetMinutes);
  return now;
}
async function batchInsert(items, insertFn, batchSize = 100) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await insertFn(batch);
  }
}
function createSeedConfig(partial = {}) {
  return {
    environment: partial.environment || "development",
    verbose: partial.verbose ?? true,
    skipIfExists: partial.skipIfExists ?? true,
    orgId: partial.orgId || ""
  };
}

export {
  DEFAULT_ORG_IDS,
  DEFAULT_USER_IDS,
  DEFAULT_PROJECT_IDS,
  DEFAULT_COMPONENT_IDS,
  DEFAULT_GRAPH_IDS,
  DEFAULT_CONVERSATION_IDS,
  DEFAULT_AGENT_IDS,
  DEFAULT_BOT_IDS,
  TEST_ONLY_PASSWORD_HASH,
  DEFAULT_TEST_PASSWORD_HASH,
  ENTITLEMENT_KEYS,
  ROLE_KEYS,
  DEFAULT_ORG_SLUGS,
  DEFAULT_USER_EMAILS,
  SeedLogger,
  shouldSeed,
  getSeedTimestamp,
  batchInsert,
  createSeedConfig
};
