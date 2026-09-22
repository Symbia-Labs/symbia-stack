/**
 * Shared constants and identifiers for seed data
 *
 * These constants ensure consistency across all services
 * and prevent foreign key conflicts in cross-service references.
 */
import { randomUUID } from "crypto";
// Generate deterministic UUIDs for seed data (can be overridden for true randomness)
function generateSeedUUID(namespace, id) {
    // For seed data, we use deterministic IDs based on a namespace + identifier
    // This ensures the same seed data always generates the same UUIDs
    // In production, you'd use a proper UUID v5 implementation
    return randomUUID(); // Simple for now, can be made deterministic later
}
/**
 * Default organization IDs for seed data
 */
export const DEFAULT_ORG_IDS = {
    SYMBIA_SYSTEM: "00000000-0000-0000-0000-000000000001", // System org (auto-created, all services)
    SYMBIA_LABS: "550e8400-e29b-41d4-a716-446655440000", // Symbia Labs (default org)
    ACME_CORP: "550e8400-e29b-41d4-a716-446655440001", // Acme Corp (test org)
    TEST_ORG: "550e8400-e29b-41d4-a716-446655440002", // Generic test org
};
/**
 * Default user IDs for seed data
 */
export const DEFAULT_USER_IDS = {
    SUPER_ADMIN: "650e8400-e29b-41d4-a716-446655440000",
    ADMIN_USER: "650e8400-e29b-41d4-a716-446655440001",
    MEMBER_USER: "650e8400-e29b-41d4-a716-446655440002",
    VIEWER_USER: "650e8400-e29b-41d4-a716-446655440003",
    TEST_USER_1: "650e8400-e29b-41d4-a716-446655440004",
    TEST_USER_2: "650e8400-e29b-41d4-a716-446655440005",
};
/**
 * Default project IDs for seed data
 */
export const DEFAULT_PROJECT_IDS = {
    SYMBIA_CORE: "750e8400-e29b-41d4-a716-446655440000",
    TEST_PROJECT: "750e8400-e29b-41d4-a716-446655440001",
};
/**
 * Default component/resource IDs for catalog
 */
export const DEFAULT_COMPONENT_IDS = {
    IDENTITY_COMPONENT: "850e8400-e29b-41d4-a716-446655440000",
    HTTP_REQUEST_COMPONENT: "850e8400-e29b-41d4-a716-446655440001",
    JSON_PARSE_COMPONENT: "850e8400-e29b-41d4-a716-446655440002",
    TEMPLATE_COMPONENT: "850e8400-e29b-41d4-a716-446655440003",
};
/**
 * Default graph IDs for catalog
 */
export const DEFAULT_GRAPH_IDS = {
    HELLO_WORLD_GRAPH: "950e8400-e29b-41d4-a716-446655440000",
    AUTH_FLOW_GRAPH: "950e8400-e29b-41d4-a716-446655440001",
};
/**
 * Default conversation IDs for messaging
 */
export const DEFAULT_CONVERSATION_IDS = {
    WELCOME_CONVERSATION: "a50e8400-e29b-41d4-a716-446655440000",
    SUPPORT_CONVERSATION: "a50e8400-e29b-41d4-a716-446655440001",
};
/**
 * Default agent IDs for assistants service
 */
export const DEFAULT_AGENT_IDS = {
    WELCOME_AGENT: "b50e8400-e29b-41d4-a716-446655440000",
    SUPPORT_AGENT: "b50e8400-e29b-41d4-a716-446655440001",
};
// Backward compatibility
export const DEFAULT_BOT_IDS = DEFAULT_AGENT_IDS;
/**
 * A bcrypt hash of "password123", kept for TESTS ONLY.
 *
 * REMOVED FROM THE SEEDING PATH 23 Aug 2026 (finding F24b). Publishing a bcrypt
 * hash beside its own plaintext — the line above used to name it — is the same
 * disclosure as publishing the password. This was assigned to six users
 * including SUPER_ADMIN by `generateDefaultUsers()`, and it ships inside the
 * plugin at `vendor/symbia-seed/dist/shared/constants.js`.
 *
 * `seedUsers` now requires a `passwordHash` from its caller, so nothing reaches
 * a database from here by default. It remains exported because test fixtures
 * legitimately want a known, fixed hash and inventing one per test run makes
 * failures harder to read.
 *
 * If it ever appears in a seeding path again, that is the defect.
 */
export const TEST_ONLY_PASSWORD_HASH = "$2b$10$81J.RrrhFSuCorK//jVlm.c0cqDurO8DFPqOE9A9bNSsQeARfTcxa";
/** @deprecated Renamed to TEST_ONLY_PASSWORD_HASH so its scope is legible at
 *  the call site. Do not use in anything that writes to a real database. */
export const DEFAULT_TEST_PASSWORD_HASH = TEST_ONLY_PASSWORD_HASH;
/**
 * Common entitlement keys used across services
 */
export const ENTITLEMENT_KEYS = {
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
    ASSISTANTS_MANAGE: "cap:assistants.manage",
};
/**
 * Common role keys
 */
export const ROLE_KEYS = {
    PUBLISHER: "role:publisher",
    DEVELOPER: "role:developer",
    OPERATOR: "role:operator",
};
/**
 * Default slugs for organizations
 */
export const DEFAULT_ORG_SLUGS = {
    SYMBIA_SYSTEM: "symbia-system",
    SYMBIA_LABS: "symbia-labs",
    ACME_CORP: "acme-corp",
    TEST_ORG: "test-org",
};
/**
 * Default email addresses for test users
 */
export const DEFAULT_USER_EMAILS = {
    SUPER_ADMIN: "dev@example.com",
    ADMIN_USER: "admin@acme-corp.com",
    MEMBER_USER: "member@acme-corp.com",
    VIEWER_USER: "viewer@acme-corp.com",
    TEST_USER_1: "test1@example.com",
    TEST_USER_2: "test2@example.com",
};
