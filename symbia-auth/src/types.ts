/**
 * @symbia/auth - Type definitions
 */

/**
 * Organization membership information
 */
export interface AuthOrganization {
  id: string;
  name: string;
  slug: string;
  role: 'admin' | 'member' | 'viewer';
}

/**
 * Authenticated user information
 */
export interface AuthUser {
  /** User or agent ID */
  id: string;
  /** Email address (may be undefined for agents) */
  email?: string;
  /** Display name */
  name?: string;
  /** Principal type */
  type: 'user' | 'agent';
  /** Agent identifier (e.g., "assistant:onboarding") - only set for agents */
  agentId?: string;
  /** Primary organization ID */
  orgId?: string;
  /** Organization memberships */
  organizations: AuthOrganization[];
  /** Capability entitlements */
  entitlements: string[];
  /** Role assignments */
  roles: string[];
  /** Super admin flag */
  isSuperAdmin: boolean;
}

/**
 * Session cookie information
 */
export interface SessionCookie {
  name: string;
  value: string;
}

/**
 * Configuration for the auth client
 */
export interface AuthClientConfig {
  /** Identity service URL (e.g., "http://localhost:5001") */
  identityServiceUrl: string;
}

/**
 * Options for auth middleware creation
 */
export interface AuthMiddlewareOptions {
  /** Identity service URL */
  identityServiceUrl: string;
  /** Service-specific admin entitlements to check (e.g., ["messaging:admin"]) */
  adminEntitlements?: string[];
  /** Enable X-As-User-Id impersonation header (default: false) */
  enableImpersonation?: boolean;
  /** Custom logger function */
  logger?: (level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void;
}

/**
 * Token introspection response from Identity service
 */
export interface TokenIntrospectionResponse {
  active?: boolean;
  sub?: string;
  email?: string;
  name?: string;
  type?: 'user' | 'agent';
  agentId?: string;
  orgId?: string;
  organizations?: AuthOrganization[];
  entitlements?: string[];
  capabilities?: string[];
  roles?: string[];
  isSuperAdmin?: boolean;
}

/**
 * API key verification response from Identity service
 */
export interface ApiKeyVerificationResponse {
  valid?: boolean;
  error?: string;
  keyId?: string;
  name?: string;
  orgId?: string | null;
  scopes?: string[];
  creator?: {
    id?: string;
    email?: string;
    entitlements?: string[];
    roles?: string[];
  };
}
