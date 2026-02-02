/**
 * @symbia/auth - Authentication client for Identity service
 */

import type {
  AuthUser,
  AuthOrganization,
  AuthClientConfig,
  SessionCookie,
  TokenIntrospectionResponse,
  ApiKeyVerificationResponse,
} from './types.js';

/**
 * Build a URL for the Identity service API
 */
function buildIdentityUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, '');
  if (base.endsWith('/api')) {
    return `${base}${path}`;
  }
  return `${base}/api${path}`;
}

/**
 * Parse token introspection response into AuthUser
 */
function parseIntrospectionResponse(data: TokenIntrospectionResponse): AuthUser | null {
  if (!data.active) return null;

  const isAgent = data.type === 'agent';

  return {
    // For agents, use agentId as the principal ID; for users, use sub
    id: isAgent && data.agentId ? data.agentId : (data.sub || ''),
    email: data.email,
    name: data.name,
    type: isAgent ? 'agent' : 'user',
    agentId: isAgent ? data.agentId : undefined,
    orgId: isAgent ? data.orgId : data.organizations?.[0]?.id,
    organizations: data.organizations || [],
    entitlements: isAgent ? (data.capabilities || []) : (data.entitlements || []),
    roles: data.roles || [],
    isSuperAdmin: data.isSuperAdmin || false,
  };
}

/**
 * Parse API key verification response into AuthUser
 */
function parseApiKeyResponse(data: ApiKeyVerificationResponse): AuthUser | null {
  if (!data.valid) return null;

  const orgId = data.orgId || undefined;
  const organizations: AuthOrganization[] = orgId
    ? [{ id: orgId, name: 'API Key Org', slug: orgId, role: 'admin' as const }]
    : [];

  return {
    id: data.creator?.id || `api:${data.keyId}`,
    email: data.creator?.email,
    name: data.name,
    type: 'agent',
    orgId,
    organizations,
    entitlements: data.creator?.entitlements || data.scopes || [],
    roles: data.creator?.roles || [],
    isSuperAdmin: false,
  };
}

/**
 * Create an authentication client for the Identity service
 */
export function createAuthClient(config: AuthClientConfig) {
  const { identityServiceUrl } = config;

  /**
   * Introspect a JWT token with the Identity service
   */
  async function introspectToken(token: string): Promise<AuthUser | null> {
    try {
      const response = await fetch(buildIdentityUrl(identityServiceUrl, '/auth/introspect'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      if (!response.ok) return null;

      const data = await response.json() as TokenIntrospectionResponse;
      return parseIntrospectionResponse(data);
    } catch (error) {
      console.error('[Auth] Token introspection failed:', error);
      return null;
    }
  }

  /**
   * Verify an API key with the Identity service
   */
  async function verifyApiKey(apiKey: string): Promise<AuthUser | null> {
    try {
      const response = await fetch(buildIdentityUrl(identityServiceUrl, '/auth/verify-api-key'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });

      if (!response.ok) return null;

      const data = await response.json() as ApiKeyVerificationResponse;
      return parseApiKeyResponse(data);
    } catch (error) {
      console.error('[Auth] API key verification failed:', error);
      return null;
    }
  }

  /**
   * Verify a session cookie with the Identity service
   */
  async function verifySessionCookie(sessionCookie: SessionCookie): Promise<AuthUser | null> {
    try {
      // First try to introspect as a token (cookies often contain JWTs)
      const tokenUser = await introspectToken(sessionCookie.value);
      if (tokenUser) return tokenUser;

      // Fall back to /users/me endpoint with cookie
      const response = await fetch(buildIdentityUrl(identityServiceUrl, '/users/me'), {
        method: 'GET',
        headers: {
          'Cookie': `${sessionCookie.name}=${sessionCookie.value}`,
        },
        credentials: 'include',
      });

      if (!response.ok) return null;

      const data = await response.json() as {
        id: string;
        email?: string;
        name?: string;
        organizations?: AuthOrganization[];
        entitlements?: string[];
        roles?: string[];
        isSuperAdmin?: boolean;
      };
      return {
        id: data.id,
        email: data.email,
        name: data.name,
        type: 'user' as const,
        orgId: data.organizations?.[0]?.id,
        organizations: data.organizations || [],
        entitlements: data.entitlements || [],
        roles: data.roles || [],
        isSuperAdmin: data.isSuperAdmin || false,
      };
    } catch (error) {
      console.error('[Auth] Session verification failed:', error);
      return null;
    }
  }

  /**
   * Fetch user's organizations from the Identity service
   */
  async function getUserOrganizations(token: string): Promise<AuthOrganization[]> {
    try {
      const response = await fetch(buildIdentityUrl(identityServiceUrl, '/orgs'), {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) return [];

      const data = await response.json() as { organizations?: AuthOrganization[] };
      return data.organizations || [];
    } catch (error) {
      console.error('[Auth] Failed to fetch organizations:', error);
      return [];
    }
  }

  return {
    introspectToken,
    verifyApiKey,
    verifySessionCookie,
    getUserOrganizations,
    buildIdentityUrl: (path: string) => buildIdentityUrl(identityServiceUrl, path),
  };
}

export type AuthClient = ReturnType<typeof createAuthClient>;
