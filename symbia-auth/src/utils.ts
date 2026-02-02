/**
 * @symbia/auth - Utility functions
 */

import { createHash, randomBytes } from 'crypto';
import type { AuthUser } from './types.js';

/**
 * Check if a user is an admin for a specific organization
 */
export function isOrgAdmin(user: AuthUser, orgId: string): boolean {
  if (user.isSuperAdmin) return true;
  const org = user.organizations.find((o) => o.id === orgId);
  return org?.role === 'admin';
}

/**
 * Check if a user is a member of a specific organization
 */
export function isOrgMember(user: AuthUser, orgId?: string): boolean {
  if (!orgId) return true;
  if (user.isSuperAdmin) return true;
  if (user.orgId === orgId) return true;
  return user.organizations.some((org) => org.id === orgId);
}

/**
 * Check if a user has a specific entitlement
 */
export function hasEntitlement(user: AuthUser, entitlement: string): boolean {
  if (user.isSuperAdmin) return true;
  return user.entitlements.includes(entitlement);
}

/**
 * Check if a user has any of the specified entitlements
 */
export function hasAnyEntitlement(user: AuthUser, entitlements: string[]): boolean {
  if (user.isSuperAdmin) return true;
  return entitlements.some((ent) => user.entitlements.includes(ent));
}

/**
 * Check if a user has all of the specified entitlements
 */
export function hasAllEntitlements(user: AuthUser, entitlements: string[]): boolean {
  if (user.isSuperAdmin) return true;
  return entitlements.every((ent) => user.entitlements.includes(ent));
}

/**
 * Hash an API key using SHA-256
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Generate a new API key with a given prefix
 * @param prefix - Key prefix (e.g., "sos" for catalog, "slk" for logging)
 * @returns Object with the key, its prefix portion, and hash
 */
export function generateApiKey(prefix: string = 'sk'): {
  key: string;
  prefix: string;
  hash: string;
} {
  const secureBytes = randomBytes(32).toString('hex');
  const key = `${prefix}_${secureBytes}`;
  const keyPrefix = key.substring(0, 8);
  const hash = hashApiKey(key);
  return { key, prefix: keyPrefix, hash };
}

/**
 * Check if a user ID represents an agent
 */
export function isAgentId(userId: string): boolean {
  return userId.startsWith('assistant:') || userId.startsWith('agent:');
}

/**
 * Extract the service/assistant name from an agent ID
 */
export function getAgentName(agentId: string): string | null {
  if (agentId.startsWith('assistant:')) {
    return agentId.slice('assistant:'.length);
  }
  if (agentId.startsWith('agent:')) {
    return agentId.slice('agent:'.length);
  }
  return null;
}
