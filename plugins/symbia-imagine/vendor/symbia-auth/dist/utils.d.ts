/**
 * @symbia/auth - Utility functions
 */
import type { AuthUser } from './types.js';
/**
 * Check if a user is an admin for a specific organization
 */
export declare function isOrgAdmin(user: AuthUser, orgId: string): boolean;
/**
 * Check if a user is a member of a specific organization
 */
export declare function isOrgMember(user: AuthUser, orgId?: string): boolean;
/**
 * Check if a user has a specific entitlement
 */
export declare function hasEntitlement(user: AuthUser, entitlement: string): boolean;
/**
 * Check if a user has any of the specified entitlements
 */
export declare function hasAnyEntitlement(user: AuthUser, entitlements: string[]): boolean;
/**
 * Check if a user has all of the specified entitlements
 */
export declare function hasAllEntitlements(user: AuthUser, entitlements: string[]): boolean;
/**
 * Hash an API key using SHA-256
 */
export declare function hashApiKey(key: string): string;
/**
 * Generate a new API key with a given prefix
 * @param prefix - Key prefix (e.g., "sos" for catalog, "slk" for logging)
 * @returns Object with the key, its prefix portion, and hash
 */
export declare function generateApiKey(prefix?: string): {
    key: string;
    prefix: string;
    hash: string;
};
/**
 * Check if a user ID represents an agent
 */
export declare function isAgentId(userId: string): boolean;
/**
 * Extract the service/assistant name from an agent ID
 */
export declare function getAgentName(agentId: string): string | null;
//# sourceMappingURL=utils.d.ts.map