/**
 * @symbia/auth - Authentication client for Identity service
 */
import type { AuthUser, AuthOrganization, AuthClientConfig, SessionCookie } from './types.js';
/**
 * Create an authentication client for the Identity service
 */
export declare function createAuthClient(config: AuthClientConfig): {
    introspectToken: (token: string) => Promise<AuthUser | null>;
    verifyApiKey: (apiKey: string) => Promise<AuthUser | null>;
    verifySessionCookie: (sessionCookie: SessionCookie) => Promise<AuthUser | null>;
    getUserOrganizations: (token: string) => Promise<AuthOrganization[]>;
    buildIdentityUrl: (path: string) => string;
};
export type AuthClient = ReturnType<typeof createAuthClient>;
//# sourceMappingURL=client.d.ts.map