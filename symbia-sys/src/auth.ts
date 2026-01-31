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
export const Capabilities = {
  // Global capabilities
  GLOBAL_READ: 'cap:global.read',           // Read across all orgs
  GLOBAL_ADMIN: 'cap:global.admin',         // Full admin across all orgs

  // Catalog/Registry capabilities
  CATALOG_READ: 'cap:catalog.read',
  CATALOG_WRITE: 'cap:catalog.write',
  CATALOG_PUBLISH: 'cap:catalog.publish',
  CATALOG_ADMIN: 'cap:catalog.admin',
  REGISTRY_READ: 'cap:registry.read',
  REGISTRY_WRITE: 'cap:registry.write',
  REGISTRY_PUBLISH: 'cap:registry.publish',
  REGISTRY_SIGN: 'cap:registry.sign',
  REGISTRY_CERTIFY: 'cap:registry.certify',

  // Logging/Telemetry capabilities
  TELEMETRY_READ: 'cap:telemetry.read',
  TELEMETRY_WRITE: 'cap:telemetry.write',
  TELEMETRY_INGEST: 'cap:telemetry.ingest',
  TELEMETRY_GLOBAL_READ: 'cap:telemetry.global-read',  // Read logs across all orgs
  TELEMETRY_ADMIN: 'cap:telemetry.admin',

  // Messaging capabilities
  MESSAGING_READ: 'cap:messaging.read',
  MESSAGING_WRITE: 'cap:messaging.write',
  MESSAGING_INTERRUPT: 'cap:messaging.interrupt',
  MESSAGING_ROUTE: 'cap:messaging.route',
  MESSAGING_ADMIN: 'cap:messaging.admin',

  // Assistants capabilities
  ASSISTANTS_EXECUTE: 'cap:assistants.execute',
  ASSISTANTS_MANAGE: 'cap:assistants.manage',
  ASSISTANTS_ADMIN: 'cap:assistants.admin',

  // Runtime capabilities
  RUNTIME_EXECUTE: 'cap:runtime.execute',
  RUNTIME_MANAGE: 'cap:runtime.manage',
  RUNTIME_ADMIN: 'cap:runtime.admin',

  // Integrations capabilities
  INTEGRATIONS_READ: 'cap:integrations.read',
  INTEGRATIONS_CONFIGURE: 'cap:integrations.configure',
  INTEGRATIONS_ADMIN: 'cap:integrations.admin',

  // Identity capabilities
  IDENTITY_READ: 'cap:identity.read',
  IDENTITY_MANAGE_USERS: 'cap:identity.manage-users',
  IDENTITY_MANAGE_ORGS: 'cap:identity.manage-orgs',
  IDENTITY_ADMIN: 'cap:identity.admin',
} as const;

export type Capability = typeof Capabilities[keyof typeof Capabilities];

/**
 * Standard role definitions
 */
export const Roles = {
  ADMIN: 'role:admin',
  PUBLISHER: 'role:publisher',
  DEVELOPER: 'role:developer',
  OPERATOR: 'role:operator',
  REVIEWER: 'role:reviewer',
  VIEWER: 'role:viewer',
} as const;

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
export function hasCapability(context: AuthContext, capability: string): boolean {
  if (context.isSuperAdmin) {
    return true;
  }
  return context.entitlements.includes(capability);
}

/**
 * Check if the context has any of the specified capabilities.
 * Super admins implicitly have all capabilities.
 */
export function hasAnyCapability(context: AuthContext, capabilities: string[]): boolean {
  if (context.isSuperAdmin) {
    return true;
  }
  return capabilities.some(cap => context.entitlements.includes(cap));
}

/**
 * Check if the context has all of the specified capabilities.
 * Super admins implicitly have all capabilities.
 */
export function hasAllCapabilities(context: AuthContext, capabilities: string[]): boolean {
  if (context.isSuperAdmin) {
    return true;
  }
  return capabilities.every(cap => context.entitlements.includes(cap));
}

/**
 * Check if the context has a specific role.
 * Super admins implicitly have all roles.
 */
export function hasRole(context: AuthContext, role: string): boolean {
  if (context.isSuperAdmin) {
    return true;
  }
  // Check both role:name format and raw role name
  return context.roles.includes(role) ||
         context.roles.includes(role.replace('role:', '')) ||
         context.entitlements.includes(role);
}

/**
 * Check if the context can bypass org-level filtering.
 * True for super admins or principals with global read capability.
 */
export function canBypassOrgFilter(context: AuthContext): boolean {
  return context.isSuperAdmin ||
         hasCapability(context, Capabilities.GLOBAL_READ) ||
         hasCapability(context, Capabilities.GLOBAL_ADMIN);
}

/**
 * Check if the context can bypass org filter for a specific service.
 * Uses the service-specific global-read capability.
 */
export function canBypassOrgFilterForService(
  context: AuthContext,
  service: 'telemetry' | 'catalog' | 'messaging' | 'runtime' | 'assistants' | 'integrations'
): boolean {
  if (context.isSuperAdmin) {
    return true;
  }

  // Check service-specific global read capability
  const serviceGlobalReadCap = `cap:${service}.global-read`;
  if (context.entitlements.includes(serviceGlobalReadCap)) {
    return true;
  }

  // Check service admin capability (admins can see everything in their service)
  const serviceAdminCap = `cap:${service}.admin`;
  if (context.entitlements.includes(serviceAdminCap)) {
    return true;
  }

  // Check global capabilities
  return hasCapability(context, Capabilities.GLOBAL_READ) ||
         hasCapability(context, Capabilities.GLOBAL_ADMIN);
}

/**
 * Check if the context is an admin for a specific organization.
 */
export function isOrgAdmin(context: AuthContext, orgId: string): boolean {
  if (context.isSuperAdmin) {
    return true;
  }
  return context.entitlements.includes(`role:admin:${orgId}`);
}

/**
 * Check if the context is a member of a specific organization.
 */
export function isOrgMember(context: AuthContext, orgId: string): boolean {
  if (context.isSuperAdmin) {
    return true;
  }
  return context.entitlements.includes(`org:${orgId}`) ||
         context.entitlements.includes(`role:member:${orgId}`) ||
         context.entitlements.includes(`role:admin:${orgId}`);
}

/**
 * Get all organization IDs the context has access to.
 * Returns empty array for super admins (they have access to all).
 */
export function getAccessibleOrgIds(context: AuthContext): string[] | 'all' {
  if (context.isSuperAdmin || canBypassOrgFilter(context)) {
    return 'all';
  }

  const orgIds: string[] = [];
  for (const ent of context.entitlements) {
    if (ent.startsWith('org:')) {
      orgIds.push(ent.slice(4));
    }
  }

  // Always include the current context's orgId
  if (context.orgId && !orgIds.includes(context.orgId)) {
    orgIds.push(context.orgId);
  }

  return orgIds;
}

/**
 * Build entitlements array from a user object.
 * Standard pattern used across services.
 */
export function buildEntitlements(user: {
  isSuperAdmin?: boolean;
  entitlements?: string[];
  roles?: string[];
  organizations?: Array<{ id: string; role?: string }>;
}): string[] {
  const entitlements: string[] = ['public', 'authenticated'];

  // Super admins get all standard capabilities
  if (user.isSuperAdmin) {
    entitlements.push(
      Roles.ADMIN,
      Capabilities.GLOBAL_READ,
      Capabilities.GLOBAL_ADMIN,
      Capabilities.TELEMETRY_GLOBAL_READ,
      Capabilities.TELEMETRY_ADMIN,
      Capabilities.CATALOG_ADMIN,
      Capabilities.MESSAGING_ADMIN,
      Capabilities.RUNTIME_ADMIN,
      Capabilities.ASSISTANTS_ADMIN,
      Capabilities.INTEGRATIONS_ADMIN,
      Capabilities.IDENTITY_ADMIN
    );
  }

  // Add user's explicit entitlements
  if (user.entitlements) {
    entitlements.push(...user.entitlements);
  }

  // Add roles in role:name format
  if (user.roles) {
    for (const role of user.roles) {
      const roleKey = role.startsWith('role:') ? role : `role:${role}`;
      entitlements.push(roleKey);
    }
  }

  // Add org memberships
  if (user.organizations) {
    for (const org of user.organizations) {
      entitlements.push(`org:${org.id}`);
      if (org.role === 'admin') {
        entitlements.push(`role:admin:${org.id}`);
      }
      if (org.role === 'member' || org.role === 'admin') {
        entitlements.push(`role:member:${org.id}`);
      }
    }
  }

  return Array.from(new Set(entitlements));
}

/**
 * Create a minimal auth context for anonymous/public access.
 */
export function anonymousContext(defaults: {
  orgId?: string;
  serviceId?: string;
  env?: string;
} = {}): AuthContext {
  return {
    authType: 'anonymous',
    actorId: 'anonymous',
    orgId: defaults.orgId || '',
    serviceId: defaults.serviceId || '',
    env: defaults.env || 'dev',
    entitlements: ['public'],
    roles: [],
    isSuperAdmin: false,
  };
}

/**
 * Create an auth context for system/service-to-service calls.
 */
export function systemContext(serviceId: string, orgId: string): AuthContext {
  return {
    authType: 'system',
    actorId: `system:${serviceId}`,
    orgId,
    serviceId,
    env: process.env.NODE_ENV || 'dev',
    entitlements: [
      'authenticated',
      Capabilities.TELEMETRY_INGEST,
      `cap:${serviceId}.system`,
    ],
    roles: [],
    isSuperAdmin: false,
  };
}
