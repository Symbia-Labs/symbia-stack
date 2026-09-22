/**
 * @symbia/sys - Shared Authorization Utilities
 *
 * Provides capability-based authorization for all Symbia services.
 * Uses a consistent naming convention: `cap:{service}.{action}`
 *
 * This module defines:
 * - Standard capability constants
 * - Helper functions for checking capabilities
 * - Query context builders that respect authorization
 */
/**
 * Standard capability definitions across all services.
 * Format: `cap:{service}.{action}` or `role:{role-name}`
 */
export declare const Capabilities: {
    readonly GLOBAL_READ: "cap:global.read";
    readonly GLOBAL_ADMIN: "cap:global.admin";
    readonly CATALOG_READ: "cap:catalog.read";
    readonly CATALOG_WRITE: "cap:catalog.write";
    readonly CATALOG_PUBLISH: "cap:catalog.publish";
    readonly CATALOG_ADMIN: "cap:catalog.admin";
    readonly REGISTRY_READ: "cap:registry.read";
    readonly REGISTRY_WRITE: "cap:registry.write";
    readonly REGISTRY_PUBLISH: "cap:registry.publish";
    readonly REGISTRY_SIGN: "cap:registry.sign";
    readonly REGISTRY_CERTIFY: "cap:registry.certify";
    readonly TELEMETRY_READ: "cap:telemetry.read";
    readonly TELEMETRY_WRITE: "cap:telemetry.write";
    readonly TELEMETRY_INGEST: "cap:telemetry.ingest";
    readonly TELEMETRY_GLOBAL_READ: "cap:telemetry.global-read";
    readonly TELEMETRY_ADMIN: "cap:telemetry.admin";
    readonly MESSAGING_READ: "cap:messaging.read";
    readonly MESSAGING_WRITE: "cap:messaging.write";
    readonly MESSAGING_INTERRUPT: "cap:messaging.interrupt";
    readonly MESSAGING_ROUTE: "cap:messaging.route";
    readonly MESSAGING_ADMIN: "cap:messaging.admin";
    readonly ASSISTANTS_EXECUTE: "cap:assistants.execute";
    readonly ASSISTANTS_MANAGE: "cap:assistants.manage";
    readonly ASSISTANTS_ADMIN: "cap:assistants.admin";
    readonly RUNTIME_EXECUTE: "cap:runtime.execute";
    readonly RUNTIME_MANAGE: "cap:runtime.manage";
    readonly RUNTIME_ADMIN: "cap:runtime.admin";
    readonly INTEGRATIONS_READ: "cap:integrations.read";
    readonly INTEGRATIONS_CONFIGURE: "cap:integrations.configure";
    readonly INTEGRATIONS_ADMIN: "cap:integrations.admin";
    readonly IDENTITY_READ: "cap:identity.read";
    readonly IDENTITY_MANAGE_USERS: "cap:identity.manage-users";
    readonly IDENTITY_MANAGE_ORGS: "cap:identity.manage-orgs";
    readonly IDENTITY_ADMIN: "cap:identity.admin";
};
export type Capability = typeof Capabilities[keyof typeof Capabilities];
/**
 * Standard role definitions
 */
export declare const Roles: {
    readonly ADMIN: "role:admin";
    readonly PUBLISHER: "role:publisher";
    readonly DEVELOPER: "role:developer";
    readonly OPERATOR: "role:operator";
    readonly REVIEWER: "role:reviewer";
    readonly VIEWER: "role:viewer";
};
export type Role = typeof Roles[keyof typeof Roles];
/**
 * Authorization context passed through requests.
 * Services should populate this from their auth middleware.
 */
export interface AuthContext {
    /** Type of authentication used */
    authType: 'jwt' | 'apiKey' | 'session' | 'anonymous' | 'system';
    /** User/principal ID */
    actorId: string;
    /** Organization ID the request is scoped to */
    orgId: string;
    /** Service ID making the request */
    serviceId: string;
    /** Environment (dev, staging, prod) */
    env: string;
    /** All capabilities/entitlements the principal has */
    entitlements: string[];
    /** All roles the principal has */
    roles: string[];
    /** Whether this is a super admin (has all capabilities) */
    isSuperAdmin: boolean;
    /** Data classification level */
    dataClass?: 'none' | 'pii' | 'phi' | 'secret';
    /** Policy reference for compliance */
    policyRef?: string;
}
/**
 * Check if the context has a specific capability.
 * Super admins implicitly have all capabilities.
 */
export declare function hasCapability(context: AuthContext, capability: string): boolean;
/**
 * Check if the context has any of the specified capabilities.
 * Super admins implicitly have all capabilities.
 */
export declare function hasAnyCapability(context: AuthContext, capabilities: string[]): boolean;
/**
 * Check if the context has all of the specified capabilities.
 * Super admins implicitly have all capabilities.
 */
export declare function hasAllCapabilities(context: AuthContext, capabilities: string[]): boolean;
/**
 * Check if the context has a specific role.
 * Super admins implicitly have all roles.
 */
export declare function hasRole(context: AuthContext, role: string): boolean;
/**
 * Check if the context can bypass org-level filtering.
 * True for super admins or principals with global read capability.
 */
export declare function canBypassOrgFilter(context: AuthContext): boolean;
/**
 * Check if the context can bypass org filter for a specific service.
 * Uses the service-specific global-read capability.
 */
export declare function canBypassOrgFilterForService(context: AuthContext, service: 'telemetry' | 'catalog' | 'messaging' | 'runtime' | 'assistants' | 'integrations'): boolean;
/**
 * Check if the context is an admin for a specific organization.
 */
export declare function isOrgAdmin(context: AuthContext, orgId: string): boolean;
/**
 * Check if the context is a member of a specific organization.
 */
export declare function isOrgMember(context: AuthContext, orgId: string): boolean;
/**
 * Get all organization IDs the context has access to.
 * Returns empty array for super admins (they have access to all).
 */
export declare function getAccessibleOrgIds(context: AuthContext): string[] | 'all';
/**
 * Build entitlements array from a user object.
 * Standard pattern used across services.
 */
export declare function buildEntitlements(user: {
    isSuperAdmin?: boolean;
    entitlements?: string[];
    roles?: string[];
    organizations?: Array<{
        id: string;
        role?: string;
    }>;
}): string[];
/**
 * Create a minimal auth context for anonymous/public access.
 */
export declare function anonymousContext(defaults?: {
    orgId?: string;
    serviceId?: string;
    env?: string;
}): AuthContext;
/**
 * Create an auth context for system/service-to-service calls.
 */
export declare function systemContext(serviceId: string, orgId: string): AuthContext;
//# sourceMappingURL=auth.d.ts.map