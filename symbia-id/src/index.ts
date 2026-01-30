/**
 * @symbia/id - Unified Identity Client
 *
 * Provides authentication for both users and agents across Symbia services.
 *
 * @example
 * ```typescript
 * import { createIdentityClient, getAgentToken } from '@symbia/id';
 *
 * // For user auth
 * const client = createIdentityClient();
 * const { token } = await client.loginUser('email@example.com', 'password');
 *
 * // For agent auth
 * const agentToken = await getAgentToken('assistant:onboarding');
 * ```
 */

// Default port for Identity service (matches @symbia/sys ServicePorts.identity)
const IDENTITY_DEFAULT_PORT = 5001;

/**
 * Get the Identity service URL
 * Priority: IDENTITY_SERVICE_URL env > IDENTITY_URL env > default localhost
 */
function getIdentityServiceUrl(): string {
  return (
    process.env.IDENTITY_SERVICE_URL ||
    process.env.IDENTITY_URL ||
    `http://localhost:${IDENTITY_DEFAULT_PORT}`
  );
}

// =============================================================================
// Types
// =============================================================================

export interface User {
  id: string;
  email: string;
  name?: string;
  isSuperAdmin: boolean;
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    role: 'admin' | 'member' | 'viewer';
  }>;
  entitlements: string[];
  roles: string[];
}

export interface Agent {
  id: string;
  agentId: string;
  name: string;
  orgId?: string;
  capabilities: string[];
}

export interface TokenInfo {
  token: string;
  expiresAt?: number;
}

export interface IdentityClientConfig {
  /** Base URL of the Identity service. Defaults to resolved URL from @symbia/sys */
  baseUrl?: string;
  /** Default credential for agents. Defaults to AGENT_CREDENTIAL env var */
  agentCredential?: string;
}

// =============================================================================
// Token Cache
// =============================================================================

interface CachedToken {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();

// Refresh tokens 5 minutes before expiry
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

// Default token lifetime (7 days)
const DEFAULT_TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

// =============================================================================
// Identity Client
// =============================================================================

export class IdentityClient {
  private baseUrl: string;
  private agentCredential: string;

  constructor(config: IdentityClientConfig = {}) {
    this.baseUrl = config.baseUrl || getIdentityServiceUrl();
    this.agentCredential = config.agentCredential ||
      process.env.AGENT_CREDENTIAL ||
      'symbia-agent-dev-secret-32chars-min!!';
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    token?: string
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Identity API error: ${response.status} - ${error}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  // ===========================================================================
  // User Authentication
  // ===========================================================================

  /**
   * Login a user with email and password
   */
  async loginUser(email: string, password: string): Promise<{ user: User; token: string }> {
    return this.request('POST', '/api/auth/user/login', { email, password });
  }

  /**
   * Get current user info from a token
   */
  async getUser(token: string): Promise<User> {
    return this.request('GET', '/api/auth/user/me', undefined, token);
  }

  /**
   * Introspect a token to get user/agent info
   */
  async introspect(token: string): Promise<{
    active: boolean;
    sub: string;
    type: 'user' | 'agent';
    email?: string;
    name?: string;
    agentId?: string;
    orgId?: string;
    organizations?: Array<{ id: string; name: string; slug: string; role: string }>;
    entitlements?: string[];
    capabilities?: string[];
    roles?: string[];
    isSuperAdmin?: boolean;
  }> {
    return this.request('POST', '/api/auth/introspect', { token }, token);
  }

  // ===========================================================================
  // Agent Authentication
  // ===========================================================================

  /**
   * Login an agent with agentId and credential
   */
  async loginAgent(agentId: string, credential?: string): Promise<{ agent: Agent; token: string }> {
    return this.request('POST', '/api/auth/agent/login', {
      agentId,
      credential: credential || this.agentCredential,
    });
  }

  /**
   * Get current agent info from a token
   */
  async getAgent(token: string): Promise<Agent> {
    return this.request('GET', '/api/auth/agent/me', undefined, token);
  }

  /**
   * Register a new agent
   */
  async registerAgent(data: {
    agentId: string;
    credential: string;
    name: string;
    orgId?: string;
    capabilities?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<{ agent: Agent; token: string }> {
    return this.request('POST', '/api/auth/agent/register', data);
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

let defaultClient: IdentityClient | null = null;

/**
 * Get or create the default identity client
 */
export function getDefaultClient(): IdentityClient {
  if (!defaultClient) {
    defaultClient = new IdentityClient();
  }
  return defaultClient;
}

/**
 * Create a new identity client with custom config
 */
export function createIdentityClient(config?: IdentityClientConfig): IdentityClient {
  return new IdentityClient(config);
}

/**
 * Get a valid token for an agent, logging in if needed.
 * Tokens are cached and automatically refreshed before expiry.
 */
export async function getAgentToken(agentId: string, client?: IdentityClient): Promise<string> {
  const cacheKey = agentId;
  const cached = tokenCache.get(cacheKey);

  // Return cached token if still valid
  if (cached && cached.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
    return cached.token;
  }

  // Login and get a new token
  const identityClient = client || getDefaultClient();
  const { token } = await identityClient.loginAgent(agentId);

  // Cache the token
  tokenCache.set(cacheKey, {
    token,
    expiresAt: Date.now() + DEFAULT_TOKEN_LIFETIME_MS,
  });

  console.log(`[Identity] Agent ${agentId} authenticated`);

  return token;
}

/**
 * Pre-authenticate multiple agents on startup
 */
export async function initializeAgentTokens(
  agentIds: string[],
  client?: IdentityClient
): Promise<{ succeeded: number; failed: number }> {
  console.log(`[Identity] Initializing ${agentIds.length} agent tokens...`);

  const results = await Promise.allSettled(
    agentIds.map(agentId => getAgentToken(agentId, client))
  );

  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  if (failed > 0) {
    console.warn(`[Identity] ${failed} agents failed to authenticate`);
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.warn(`[Identity] Failed: ${agentIds[i]} - ${(r as PromiseRejectedResult).reason}`);
      }
    });
  }

  console.log(`[Identity] ${succeeded}/${agentIds.length} agents authenticated`);

  return { succeeded, failed };
}

/**
 * Clear all cached tokens
 */
export function clearTokenCache(): void {
  tokenCache.clear();
}

/**
 * Clear a specific agent's cached token
 */
export function clearAgentToken(agentId: string): void {
  tokenCache.delete(agentId);
}
