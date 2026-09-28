import { createRequire as __symbiaCreateRequire } from "node:module";globalThis.require ??= __symbiaCreateRequire(import.meta.url);

// build/plugin/symbia-imagine/vendor/symbia-auth/dist/client.js
function buildIdentityUrl(baseUrl, path) {
  const base = baseUrl.replace(/\/$/, "");
  if (base.endsWith("/api")) {
    return `${base}${path}`;
  }
  return `${base}/api${path}`;
}
function parseIntrospectionResponse(data) {
  if (!data.active)
    return null;
  const isAgent = data.type === "agent";
  return {
    // For agents, use agentId as the principal ID; for users, use sub
    id: isAgent && data.agentId ? data.agentId : data.sub || "",
    email: data.email,
    name: data.name,
    type: isAgent ? "agent" : "user",
    agentId: isAgent ? data.agentId : void 0,
    orgId: isAgent ? data.orgId : data.organizations?.[0]?.id,
    organizations: data.organizations || [],
    entitlements: isAgent ? data.capabilities || [] : data.entitlements || [],
    roles: data.roles || [],
    isSuperAdmin: data.isSuperAdmin || false
  };
}
function parseApiKeyResponse(data) {
  if (!data.valid)
    return null;
  const orgId = data.orgId || void 0;
  const organizations = orgId ? [{ id: orgId, name: "API Key Org", slug: orgId, role: "admin" }] : [];
  return {
    id: data.creator?.id || `api:${data.keyId}`,
    email: data.creator?.email,
    name: data.name,
    type: "agent",
    orgId,
    organizations,
    entitlements: data.creator?.entitlements || data.scopes || [],
    roles: data.creator?.roles || [],
    isSuperAdmin: false
  };
}
function createAuthClient(config) {
  const { identityServiceUrl } = config;
  async function introspectToken(token) {
    try {
      const response = await fetch(buildIdentityUrl(identityServiceUrl, "/auth/introspect"), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ token })
      });
      if (!response.ok)
        return null;
      const data = await response.json();
      return parseIntrospectionResponse(data);
    } catch (error) {
      console.error("[Auth] Token introspection failed:", error);
      return null;
    }
  }
  async function verifyApiKey(apiKey) {
    try {
      const response = await fetch(buildIdentityUrl(identityServiceUrl, "/auth/verify-api-key"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey })
      });
      if (!response.ok)
        return null;
      const data = await response.json();
      return parseApiKeyResponse(data);
    } catch (error) {
      console.error("[Auth] API key verification failed:", error);
      return null;
    }
  }
  async function verifySessionCookie(sessionCookie) {
    try {
      const tokenUser = await introspectToken(sessionCookie.value);
      if (tokenUser)
        return tokenUser;
      const response = await fetch(buildIdentityUrl(identityServiceUrl, "/users/me"), {
        method: "GET",
        headers: {
          "Cookie": `${sessionCookie.name}=${sessionCookie.value}`
        },
        credentials: "include"
      });
      if (!response.ok)
        return null;
      const data = await response.json();
      return {
        id: data.id,
        email: data.email,
        name: data.name,
        type: "user",
        orgId: data.organizations?.[0]?.id,
        organizations: data.organizations || [],
        entitlements: data.entitlements || [],
        roles: data.roles || [],
        isSuperAdmin: data.isSuperAdmin || false
      };
    } catch (error) {
      console.error("[Auth] Session verification failed:", error);
      return null;
    }
  }
  async function getUserOrganizations(token) {
    try {
      const response = await fetch(buildIdentityUrl(identityServiceUrl, "/orgs"), {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });
      if (!response.ok)
        return [];
      const data = await response.json();
      return data.organizations || [];
    } catch (error) {
      console.error("[Auth] Failed to fetch organizations:", error);
      return [];
    }
  }
  return {
    introspectToken,
    verifyApiKey,
    verifySessionCookie,
    getUserOrganizations,
    buildIdentityUrl: (path) => buildIdentityUrl(identityServiceUrl, path)
  };
}

// build/plugin/symbia-imagine/vendor/symbia-auth/dist/middleware.js
function getTokenFromHeader(req) {
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return null;
}
function getApiKey(req) {
  return req.headers["x-api-key"] || null;
}
function getSessionCookie(req) {
  const token = req.cookies?.token;
  if (token) {
    return { name: "token", value: token };
  }
  const session = req.cookies?.symbia_session;
  if (session) {
    return { name: "symbia_session", value: session };
  }
  return null;
}
function serviceCaller(req, cfg) {
  const offered = req.headers["x-service-auth"];
  if (!offered)
    return null;
  const expected = cfg.token;
  if (expected ? offered !== expected : offered !== "internal")
    return null;
  if (!expected)
    cfg.warn();
  const orgId = req.headers["x-org-id"];
  return {
    id: cfg.principalId,
    email: "service@internal",
    name: "Internal Service",
    type: "agent",
    isSuperAdmin: true,
    orgId,
    organizations: orgId ? [{ id: orgId, role: "admin" }] : [],
    entitlements: [],
    roles: []
  };
}
async function getCurrentUserFromRequest(req, authClient, serviceAuth) {
  const token = getTokenFromHeader(req);
  if (token) {
    const user = await authClient.introspectToken(token);
    if (user)
      return user;
  }
  const apiKey = getApiKey(req);
  if (apiKey) {
    const user = await authClient.verifyApiKey(apiKey);
    if (user)
      return user;
  }
  const session = getSessionCookie(req);
  if (session) {
    const user = await authClient.verifySessionCookie(session);
    if (user)
      return user;
  }
  if (serviceAuth) {
    const svc = serviceCaller(req, serviceAuth);
    if (svc)
      return svc;
  }
  return null;
}
function createAuthMiddleware(options) {
  const { identityServiceUrl, adminEntitlements = [], enableImpersonation = false, logger = (level, msg) => console[level](`[Auth] ${msg}`) } = options;
  const authClient = createAuthClient({ identityServiceUrl });
  let warnedUnsecured = false;
  const serviceAuth = options.serviceAuth?.enabled === false ? void 0 : {
    token: options.serviceAuth?.token ?? process.env.SYMBIA_INTERNAL_SERVICE_TOKEN,
    principalId: options.serviceAuth?.principalId ?? process.env.SYMBIA_SERVICE_PRINCIPAL_ID ?? "650e8400-e29b-41d4-a716-446655440000",
    warn: () => {
      if (warnedUnsecured)
        return;
      warnedUnsecured = true;
      logger("warn", 'X-Service-Auth accepted with the literal "internal" \u2014 no SYMBIA_INTERNAL_SERVICE_TOKEN is configured, so any caller that can reach this port is admitted as a service principal');
    }
  };
  const finish = (req, res, next) => {
    if (options.onAuthenticated)
      options.onAuthenticated(req, res, next);
    else
      next();
  };
  async function getCurrentUser(req) {
    return getCurrentUserFromRequest(req, authClient, serviceAuth);
  }
  function requireAuth(req, res, next) {
    getCurrentUser(req).then((user) => {
      if (!user) {
        res.status(401).json({
          error: "Authentication required",
          accepts: 'a user bearer token, an API key, a session cookie, or X-Service-Auth for service-to-service calls (SYMBIA_INTERNAL_SERVICE_TOKEN when configured, otherwise the literal "internal" in local development)'
        });
        return;
      }
      if (enableImpersonation) {
        const asUserId = req.headers["x-as-user-id"];
        if (asUserId && (user.type === "agent" || user.isSuperAdmin)) {
          req.user = {
            ...user,
            id: asUserId,
            type: asUserId.startsWith("assistant:") || asUserId.startsWith("agent:") ? "agent" : "user"
          };
          logger("info", `Service ${user.id} impersonating ${asUserId}`);
        } else {
          req.user = user;
        }
      } else {
        req.user = user;
      }
      finish(req, res, next);
    }).catch(next);
  }
  function optionalAuth(req, res, next) {
    getCurrentUser(req).then((user) => {
      req.user = user || void 0;
      finish(req, res, next);
    }).catch(next);
  }
  function requireAdmin(req, res, next) {
    getCurrentUser(req).then((user) => {
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const isAdmin = user.isSuperAdmin || user.roles.includes("admin") || adminEntitlements.some((ent) => user.entitlements.includes(ent));
      if (!isAdmin) {
        res.status(403).json({ error: "Admin access required" });
        return;
      }
      req.user = user;
      finish(req, res, next);
    }).catch(next);
  }
  function requireSuperAdmin(req, res, next) {
    getCurrentUser(req).then((user) => {
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      if (!user.isSuperAdmin) {
        res.status(403).json({ error: "Super admin access required" });
        return;
      }
      req.user = user;
      finish(req, res, next);
    }).catch(next);
  }
  return {
    getCurrentUser,
    requireAuth,
    optionalAuth,
    requireAdmin,
    requireSuperAdmin,
    authClient
  };
}

// build/plugin/symbia-imagine/vendor/symbia-auth/dist/utils.js
import { createHash, randomBytes } from "crypto";
function isOrgAdmin(user, orgId) {
  if (user.isSuperAdmin)
    return true;
  const org = user.organizations.find((o) => o.id === orgId);
  return org?.role === "admin";
}
function isOrgMember(user, orgId) {
  if (!orgId)
    return true;
  if (user.isSuperAdmin)
    return true;
  if (user.orgId === orgId)
    return true;
  return user.organizations.some((org) => org.id === orgId);
}
function hasEntitlement(user, entitlement) {
  if (user.isSuperAdmin)
    return true;
  return user.entitlements.includes(entitlement);
}
function hashApiKey(key) {
  return createHash("sha256").update(key).digest("hex");
}
function generateApiKey(prefix = "sk") {
  const secureBytes = randomBytes(32).toString("hex");
  const key = `${prefix}_${secureBytes}`;
  const keyPrefix = key.substring(0, 8);
  const hash = hashApiKey(key);
  return { key, prefix: keyPrefix, hash };
}

export {
  createAuthClient,
  createAuthMiddleware,
  isOrgAdmin,
  isOrgMember,
  hasEntitlement,
  hashApiKey,
  generateApiKey
};
