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
interface User {
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
interface Agent {
    id: string;
    agentId: string;
    name: string;
    orgId?: string;
    capabilities: string[];
}
interface TokenInfo {
    token: string;
    expiresAt?: number;
}
interface IdentityClientConfig {
    /** Base URL of the Identity service. Defaults to resolved URL from @symbia/sys */
    baseUrl?: string;
    /** Default credential for agents. Defaults to AGENT_CREDENTIAL env var */
    agentCredential?: string;
}
declare class IdentityClient {
    private baseUrl;
    private agentCredential;
    constructor(config?: IdentityClientConfig);
    private request;
    /**
     * Login a user with email and password
     */
    loginUser(email: string, password: string): Promise<{
        user: User;
        token: string;
    }>;
    /**
     * Get current user info from a token
     */
    getUser(token: string): Promise<User>;
    /**
     * Introspect a token to get user/agent info
     */
    introspect(token: string): Promise<{
        active: boolean;
        sub: string;
        type: 'user' | 'agent';
        email?: string;
        name?: string;
        agentId?: string;
        orgId?: string;
        organizations?: Array<{
            id: string;
            name: string;
            slug: string;
            role: string;
        }>;
        entitlements?: string[];
        capabilities?: string[];
        roles?: string[];
        isSuperAdmin?: boolean;
    }>;
    /**
     * Login an agent with agentId and credential
     */
    loginAgent(agentId: string, credential?: string): Promise<{
        agent: Agent;
        token: string;
    }>;
    /**
     * Get current agent info from a token
     */
    getAgent(token: string): Promise<Agent>;
    /**
     * Register a new agent
     */
    registerAgent(data: {
        agentId: string;
        credential: string;
        name: string;
        orgId?: string;
        capabilities?: string[];
        metadata?: Record<string, unknown>;
    }): Promise<{
        agent: Agent;
        token: string;
    }>;
}
/**
 * Get or create the default identity client
 */
declare function getDefaultClient(): IdentityClient;
/**
 * Create a new identity client with custom config
 */
declare function createIdentityClient(config?: IdentityClientConfig): IdentityClient;
/**
 * Get a valid token for an agent, logging in if needed.
 * Tokens are cached and automatically refreshed before expiry.
 */
declare function getAgentToken(agentId: string, client?: IdentityClient): Promise<string>;
/**
 * Pre-authenticate multiple agents on startup
 */
declare function initializeAgentTokens(agentIds: string[], client?: IdentityClient): Promise<{
    succeeded: number;
    failed: number;
}>;
/**
 * Clear all cached tokens
 */
declare function clearTokenCache(): void;
/**
 * Clear a specific agent's cached token
 */
declare function clearAgentToken(agentId: string): void;

export { type Agent, IdentityClient, type IdentityClientConfig, type TokenInfo, type User, clearAgentToken, clearTokenCache, createIdentityClient, getAgentToken, getDefaultClient, initializeAgentTokens };
