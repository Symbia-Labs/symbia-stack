/**
 * Shared constants and identifiers for seed data
 *
 * These constants ensure consistency across all services
 * and prevent foreign key conflicts in cross-service references.
 */
/**
 * Default organization IDs for seed data
 */
export declare const DEFAULT_ORG_IDS: {
    readonly SYMBIA_SYSTEM: "00000000-0000-0000-0000-000000000001";
    readonly SYMBIA_LABS: "550e8400-e29b-41d4-a716-446655440000";
    readonly ACME_CORP: "550e8400-e29b-41d4-a716-446655440001";
    readonly TEST_ORG: "550e8400-e29b-41d4-a716-446655440002";
};
/**
 * Default user IDs for seed data
 */
export declare const DEFAULT_USER_IDS: {
    readonly SUPER_ADMIN: "650e8400-e29b-41d4-a716-446655440000";
    readonly ADMIN_USER: "650e8400-e29b-41d4-a716-446655440001";
    readonly MEMBER_USER: "650e8400-e29b-41d4-a716-446655440002";
    readonly VIEWER_USER: "650e8400-e29b-41d4-a716-446655440003";
    readonly TEST_USER_1: "650e8400-e29b-41d4-a716-446655440004";
    readonly TEST_USER_2: "650e8400-e29b-41d4-a716-446655440005";
};
/**
 * Default project IDs for seed data
 */
export declare const DEFAULT_PROJECT_IDS: {
    readonly SYMBIA_CORE: "750e8400-e29b-41d4-a716-446655440000";
    readonly TEST_PROJECT: "750e8400-e29b-41d4-a716-446655440001";
};
/**
 * Default component/resource IDs for catalog
 */
export declare const DEFAULT_COMPONENT_IDS: {
    readonly IDENTITY_COMPONENT: "850e8400-e29b-41d4-a716-446655440000";
    readonly HTTP_REQUEST_COMPONENT: "850e8400-e29b-41d4-a716-446655440001";
    readonly JSON_PARSE_COMPONENT: "850e8400-e29b-41d4-a716-446655440002";
    readonly TEMPLATE_COMPONENT: "850e8400-e29b-41d4-a716-446655440003";
};
/**
 * Default graph IDs for catalog
 */
export declare const DEFAULT_GRAPH_IDS: {
    readonly HELLO_WORLD_GRAPH: "950e8400-e29b-41d4-a716-446655440000";
    readonly AUTH_FLOW_GRAPH: "950e8400-e29b-41d4-a716-446655440001";
};
/**
 * Default conversation IDs for messaging
 */
export declare const DEFAULT_CONVERSATION_IDS: {
    readonly WELCOME_CONVERSATION: "a50e8400-e29b-41d4-a716-446655440000";
    readonly SUPPORT_CONVERSATION: "a50e8400-e29b-41d4-a716-446655440001";
};
/**
 * Default agent IDs for assistants service
 */
export declare const DEFAULT_AGENT_IDS: {
    readonly WELCOME_AGENT: "b50e8400-e29b-41d4-a716-446655440000";
    readonly SUPPORT_AGENT: "b50e8400-e29b-41d4-a716-446655440001";
};
export declare const DEFAULT_BOT_IDS: {
    readonly WELCOME_AGENT: "b50e8400-e29b-41d4-a716-446655440000";
    readonly SUPPORT_AGENT: "b50e8400-e29b-41d4-a716-446655440001";
};
/**
 * Common seed data configuration
 */
export interface SeedConfig {
    /**
     * Environment to seed for (affects data volume and types)
     */
    environment?: "development" | "test" | "staging" | "production";
    /**
     * Whether to include verbose logging during seeding
     */
    verbose?: boolean;
    /**
     * Whether to skip if data already exists
     */
    skipIfExists?: boolean;
    /**
     * Custom organization ID (overrides defaults)
     */
    orgId?: string;
}
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
export declare const TEST_ONLY_PASSWORD_HASH = "$2b$10$81J.RrrhFSuCorK//jVlm.c0cqDurO8DFPqOE9A9bNSsQeARfTcxa";
/** @deprecated Renamed to TEST_ONLY_PASSWORD_HASH so its scope is legible at
 *  the call site. Do not use in anything that writes to a real database. */
export declare const DEFAULT_TEST_PASSWORD_HASH = "$2b$10$81J.RrrhFSuCorK//jVlm.c0cqDurO8DFPqOE9A9bNSsQeARfTcxa";
/**
 * Common entitlement keys used across services
 */
export declare const ENTITLEMENT_KEYS: {
    readonly CATALOG_READ: "cap:catalog.read";
    readonly CATALOG_WRITE: "cap:catalog.write";
    readonly CATALOG_PUBLISH: "cap:catalog.publish";
    readonly CATALOG_ADMIN: "cap:catalog.admin";
    readonly REGISTRY_READ: "cap:registry.read";
    readonly REGISTRY_WRITE: "cap:registry.write";
    readonly REGISTRY_PUBLISH: "cap:registry.publish";
    readonly MESSAGING_READ: "cap:messaging.read";
    readonly MESSAGING_WRITE: "cap:messaging.write";
    readonly MESSAGING_INTERRUPT: "cap:messaging.interrupt";
    readonly MESSAGING_ROUTE: "cap:messaging.route";
    readonly ASSISTANTS_EXECUTE: "cap:assistants.execute";
    readonly ASSISTANTS_MANAGE: "cap:assistants.manage";
};
/**
 * Common role keys
 */
export declare const ROLE_KEYS: {
    readonly PUBLISHER: "role:publisher";
    readonly DEVELOPER: "role:developer";
    readonly OPERATOR: "role:operator";
};
/**
 * Default slugs for organizations
 */
export declare const DEFAULT_ORG_SLUGS: {
    readonly SYMBIA_SYSTEM: "symbia-system";
    readonly SYMBIA_LABS: "symbia-labs";
    readonly ACME_CORP: "acme-corp";
    readonly TEST_ORG: "test-org";
};
/**
 * Default email addresses for test users
 */
export declare const DEFAULT_USER_EMAILS: {
    readonly SUPER_ADMIN: "dev@example.com";
    readonly ADMIN_USER: "admin@acme-corp.com";
    readonly MEMBER_USER: "member@acme-corp.com";
    readonly VIEWER_USER: "viewer@acme-corp.com";
    readonly TEST_USER_1: "test1@example.com";
    readonly TEST_USER_2: "test2@example.com";
};
