/**
 * @symbia/auth - Express middleware for authentication
 */
import { createAuthClient } from './client.js';
/**
 * Extract Bearer token from Authorization header
 */
function getTokenFromHeader(req) {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7);
    }
    return null;
}
/**
 * Extract API key from X-API-Key header
 */
function getApiKey(req) {
    return req.headers['x-api-key'] || null;
}
/**
 * Extract session cookie from request
 */
function getSessionCookie(req) {
    const token = req.cookies?.token;
    if (token) {
        return { name: 'token', value: token };
    }
    const session = req.cookies?.symbia_session;
    if (session) {
        return { name: 'symbia_session', value: session };
    }
    return null;
}
/**
 * Get the authenticated user from the request using all available auth methods
 */
/**
 * Service-to-service admission, in the one place every service shares.
 *
 * WHY THIS IS HERE AND NOT IN EACH SERVICE. By 23 Aug 2026 eight services had
 * each written their own rule for admitting an internal caller, and they did
 * not agree: catalog, integrations, identity and assistants took
 * `X-Service-Auth`; logging and network refused it; the integrations channels
 * router had a private copy that took a bearer token only; messaging took
 * `X-Service-Id` on exactly one route and a bearer everywhere else. A call that
 * satisfied one service was rejected by the next, and the failure always
 * surfaced as a flat `401 Authentication required` one hop away from the code
 * that could explain it.
 *
 * Brian's instruction on finding the sixth was to normalise rather than patch
 * the seventh. This is that: one admission, inherited by every service that
 * builds its middleware from this factory.
 *
 * WHAT IT DOES NOT DO. It grants a full user identity to anything holding a
 * shared secret, which is a coarse instrument. Whether a service principal
 * should carry capabilities at all belongs to the single policy, security and
 * entitlements pass that is deferred, and this function is inside that pass
 * rather than a settlement of it.
 */
function serviceCaller(req, cfg) {
    const offered = req.headers['x-service-auth'];
    if (!offered)
        return null;
    const expected = cfg.token;
    // In local development the literal "internal" is accepted so a stack with no
    // secrets configured still works, and warns so it is not mistaken for
    // security. A configured token is compared exactly.
    if (expected ? offered !== expected : offered !== 'internal')
        return null;
    if (!expected)
        cfg.warn();
    // ORG COMES FROM THE HEADER THE CALLER ALREADY SENDS. Credential and resource
    // lookups are org-scoped, so a principal with no org resolves nothing and the
    // request fails a second gate after passing this one.
    const orgId = req.headers['x-org-id'];
    // A REAL USER ID, BECAUSE ROWS ARE FILED AGAINST ONE. Measured 23 Aug: filing
    // a credential under the literal `service:internal` answered 500 —
    // `user_credentials.user_id` is a uuid with a foreign key, so a service name
    // cannot own one.
    return {
        id: cfg.principalId,
        email: 'service@internal',
        name: 'Internal Service',
        type: 'agent',
        isSuperAdmin: true,
        orgId,
        organizations: orgId ? [{ id: orgId, role: 'admin' }] : [],
        entitlements: [],
        roles: [],
    };
}
async function getCurrentUserFromRequest(req, authClient, serviceAuth) {
    // Try Bearer token first
    const token = getTokenFromHeader(req);
    if (token) {
        const user = await authClient.introspectToken(token);
        if (user)
            return user;
    }
    // Try API key
    const apiKey = getApiKey(req);
    if (apiKey) {
        const user = await authClient.verifyApiKey(apiKey);
        if (user)
            return user;
    }
    // Try session cookie
    const session = getSessionCookie(req);
    if (session) {
        const user = await authClient.verifySessionCookie(session);
        if (user)
            return user;
    }
    // Try service-to-service admission. Last, so a real user identity always
    // wins over the shared service principal when both are presented.
    if (serviceAuth) {
        const svc = serviceCaller(req, serviceAuth);
        if (svc)
            return svc;
    }
    return null;
}
/**
 * Create authentication middleware for a service
 */
export function createAuthMiddleware(options) {
    const { identityServiceUrl, adminEntitlements = [], enableImpersonation = false, logger = (level, msg) => console[level](`[Auth] ${msg}`), } = options;
    const authClient = createAuthClient({ identityServiceUrl });
    let warnedUnsecured = false;
    const serviceAuth = options.serviceAuth?.enabled === false
        ? undefined
        : {
            token: options.serviceAuth?.token ?? process.env.SYMBIA_INTERNAL_SERVICE_TOKEN,
            principalId: options.serviceAuth?.principalId ??
                process.env.SYMBIA_SERVICE_PRINCIPAL_ID ??
                '650e8400-e29b-41d4-a716-446655440000',
            warn: () => {
                if (warnedUnsecured)
                    return;
                warnedUnsecured = true;
                logger('warn', 'X-Service-Auth accepted with the literal "internal" — no ' +
                    'SYMBIA_INTERNAL_SERVICE_TOKEN is configured, so any caller that can reach ' +
                    'this port is admitted as a service principal');
            },
        };
    // Run the rest of the request through the optional onAuthenticated hook (e.g.
    // an RLS scope), or straight to next() when no hook is configured. Absent hook
    // ⇒ identical behaviour to before, so existing consumers are unaffected.
    const finish = (req, res, next) => {
        if (options.onAuthenticated)
            options.onAuthenticated(req, res, next);
        else
            next();
    };
    /**
     * Get the current authenticated user
     */
    async function getCurrentUser(req) {
        return getCurrentUserFromRequest(req, authClient, serviceAuth);
    }
    /**
     * Middleware that requires authentication
     */
    function requireAuth(req, res, next) {
        getCurrentUser(req)
            .then((user) => {
            if (!user) {
                // Name the other door. The whole cost of this class of defect was
                // that the error described one way in and there were several.
                res.status(401).json({
                    error: 'Authentication required',
                    accepts: 'a user bearer token, an API key, a session cookie, or X-Service-Auth ' +
                        'for service-to-service calls (SYMBIA_INTERNAL_SERVICE_TOKEN when configured, ' +
                        'otherwise the literal "internal" in local development)',
                });
                return;
            }
            // Support X-As-User-Id header for service-to-service impersonation
            if (enableImpersonation) {
                const asUserId = req.headers['x-as-user-id'];
                if (asUserId && (user.type === 'agent' || user.isSuperAdmin)) {
                    req.user = {
                        ...user,
                        id: asUserId,
                        type: asUserId.startsWith('assistant:') || asUserId.startsWith('agent:') ? 'agent' : 'user',
                    };
                    logger('info', `Service ${user.id} impersonating ${asUserId}`);
                }
                else {
                    req.user = user;
                }
            }
            else {
                req.user = user;
            }
            finish(req, res, next);
        })
            .catch(next);
    }
    /**
     * Middleware that optionally authenticates (no 401 on failure)
     */
    function optionalAuth(req, res, next) {
        getCurrentUser(req)
            .then((user) => {
            req.user = user || undefined;
            finish(req, res, next);
        })
            .catch(next);
    }
    /**
     * Middleware that requires admin access
     */
    function requireAdmin(req, res, next) {
        getCurrentUser(req)
            .then((user) => {
            if (!user) {
                res.status(401).json({ error: 'Authentication required' });
                return;
            }
            // Check admin status
            const isAdmin = user.isSuperAdmin ||
                user.roles.includes('admin') ||
                adminEntitlements.some((ent) => user.entitlements.includes(ent));
            if (!isAdmin) {
                res.status(403).json({ error: 'Admin access required' });
                return;
            }
            req.user = user;
            finish(req, res, next);
        })
            .catch(next);
    }
    /**
     * Middleware that requires super admin access
     */
    function requireSuperAdmin(req, res, next) {
        getCurrentUser(req)
            .then((user) => {
            if (!user) {
                res.status(401).json({ error: 'Authentication required' });
                return;
            }
            if (!user.isSuperAdmin) {
                res.status(403).json({ error: 'Super admin access required' });
                return;
            }
            req.user = user;
            finish(req, res, next);
        })
            .catch(next);
    }
    return {
        getCurrentUser,
        requireAuth,
        optionalAuth,
        requireAdmin,
        requireSuperAdmin,
        authClient,
    };
}
//# sourceMappingURL=middleware.js.map