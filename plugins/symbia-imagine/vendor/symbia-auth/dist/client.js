/**
 * @symbia/auth - Authentication client for Identity service
 */
/**
 * Build a URL for the Identity service API
 */
function buildIdentityUrl(baseUrl, path) {
    const base = baseUrl.replace(/\/$/, '');
    if (base.endsWith('/api')) {
        return `${base}${path}`;
    }
    return `${base}/api${path}`;
}
/**
 * Parse token introspection response into AuthUser
 */
function parseIntrospectionResponse(data) {
    if (!data.active)
        return null;
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
function parseApiKeyResponse(data) {
    if (!data.valid)
        return null;
    const orgId = data.orgId || undefined;
    const organizations = orgId
        ? [{ id: orgId, name: 'API Key Org', slug: orgId, role: 'admin' }]
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
export function createAuthClient(config) {
    const { identityServiceUrl } = config;
    /**
     * Introspect a JWT token with the Identity service
     */
    async function introspectToken(token) {
        try {
            const response = await fetch(buildIdentityUrl(identityServiceUrl, '/auth/introspect'), {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ token }),
            });
            if (!response.ok)
                return null;
            const data = await response.json();
            return parseIntrospectionResponse(data);
        }
        catch (error) {
            console.error('[Auth] Token introspection failed:', error);
            return null;
        }
    }
    /**
     * Verify an API key with the Identity service
     */
    async function verifyApiKey(apiKey) {
        try {
            const response = await fetch(buildIdentityUrl(identityServiceUrl, '/auth/verify-api-key'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey }),
            });
            if (!response.ok)
                return null;
            const data = await response.json();
            return parseApiKeyResponse(data);
        }
        catch (error) {
            console.error('[Auth] API key verification failed:', error);
            return null;
        }
    }
    /**
     * Verify a session cookie with the Identity service
     */
    async function verifySessionCookie(sessionCookie) {
        try {
            // First try to introspect as a token (cookies often contain JWTs)
            const tokenUser = await introspectToken(sessionCookie.value);
            if (tokenUser)
                return tokenUser;
            // Fall back to /users/me endpoint with cookie
            const response = await fetch(buildIdentityUrl(identityServiceUrl, '/users/me'), {
                method: 'GET',
                headers: {
                    'Cookie': `${sessionCookie.name}=${sessionCookie.value}`,
                },
                credentials: 'include',
            });
            if (!response.ok)
                return null;
            const data = await response.json();
            return {
                id: data.id,
                email: data.email,
                name: data.name,
                type: 'user',
                orgId: data.organizations?.[0]?.id,
                organizations: data.organizations || [],
                entitlements: data.entitlements || [],
                roles: data.roles || [],
                isSuperAdmin: data.isSuperAdmin || false,
            };
        }
        catch (error) {
            console.error('[Auth] Session verification failed:', error);
            return null;
        }
    }
    /**
     * Fetch user's organizations from the Identity service
     */
    async function getUserOrganizations(token) {
        try {
            const response = await fetch(buildIdentityUrl(identityServiceUrl, '/orgs'), {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            if (!response.ok)
                return [];
            const data = await response.json();
            return data.organizations || [];
        }
        catch (error) {
            console.error('[Auth] Failed to fetch organizations:', error);
            return [];
        }
    }
    return {
        introspectToken,
        verifyApiKey,
        verifySessionCookie,
        getUserOrganizations,
        buildIdentityUrl: (path) => buildIdentityUrl(identityServiceUrl, path),
    };
}
//# sourceMappingURL=client.js.map