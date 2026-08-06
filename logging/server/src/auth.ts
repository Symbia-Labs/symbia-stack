/**
 * Logging Service Authentication
 *
 * Uses @symbia/auth for core authentication with logging-specific extensions:
 * - AuthContext for telemetry scoping (orgId, serviceId, env, dataClass)
 * - System bootstrap secret support for service-to-service auth
 * - RLS context integration
 */

import type { Request, Response, NextFunction } from 'express';
import type { Session, SessionData } from 'express-session';
import {
  createAuthMiddleware,
  createAuthClient,
  hashApiKey,
  generateApiKey as generateApiKeyBase,
  type AuthUser,
} from '@symbia/auth';
import { timingSafeEqual } from 'crypto';
import { config } from './config.js';
import { setRLSContext } from './db.js';
import { storage } from './storage.js';

// Re-export from @symbia/auth
export { hashApiKey };
export type { AuthUser };

// Wrap generateApiKey to use logging's prefix
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  return generateApiKeyBase('slk');
}

declare module 'express' {
  interface Request {
    session: Session & Partial<SessionData> & {
      userId?: string;
      username?: string;
      identityUser?: AuthUser;
    };
  }
}

/**
 * Auth context for telemetry scoping.
 * Extends beyond simple user auth to include service metadata.
 */
export type AuthContext = {
  authType: 'jwt' | 'apiKey' | 'session' | 'anonymous';
  orgId: string;
  serviceId: string;
  env: string;
  dataClass: string;
  policyRef: string;
  actorId: string;
  entitlements: string[];
  roles: string[];
  isSuperAdmin: boolean;
};

declare module 'express-serve-static-core' {
  interface Request {
    authContext?: AuthContext;
  }
}

// Create auth client and middleware using @symbia/auth
const authClient = createAuthClient({
  identityServiceUrl: config.identityServiceUrl,
});

const auth = createAuthMiddleware({
  identityServiceUrl: config.identityServiceUrl,
  adminEntitlements: ['logging:admin', 'cap:logging.admin'],
  enableImpersonation: false,
  logger: (level, message) => console.log(`[Logging Auth] ${message}`),
});

// Export for backward compatibility
export const { requireAuth, optionalAuth, requireAdmin, requireSuperAdmin } = auth;
export const introspectToken = authClient.introspectToken;
export const verifyApiKey = authClient.verifyApiKey;

// System bootstrap config cache
interface SystemBootstrapConfig {
  secret: string;
  orgId: string;
  orgName: string;
  serviceId: string;
}

let systemBootstrapConfig: SystemBootstrapConfig | null = null;
let bootstrapFetchPromise: Promise<SystemBootstrapConfig | null> | null = null;

async function fetchSystemBootstrap(): Promise<SystemBootstrapConfig | null> {
  if (bootstrapFetchPromise) return bootstrapFetchPromise;

  bootstrapFetchPromise = (async () => {
    try {
      const response = await fetch(authClient.buildIdentityUrl('/bootstrap/internal'), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (response.ok) {
        systemBootstrapConfig = (await response.json()) as SystemBootstrapConfig;
        console.log('[logging] Fetched system bootstrap config from Identity');
        return systemBootstrapConfig;
      }
    } catch (error) {
      console.warn('[logging] Failed to fetch system bootstrap config:', error);
    }
    return null;
  })();

  const result = await bootstrapFetchPromise;
  bootstrapFetchPromise = null;
  return result;
}

export async function initSystemBootstrap(): Promise<void> {
  await fetchSystemBootstrap();
}

async function validateSystemSecret(secret: string): Promise<SystemBootstrapConfig | null> {
  if (systemBootstrapConfig) {
    try {
      const secretBuffer = Buffer.from(secret);
      const cachedBuffer = Buffer.from(systemBootstrapConfig.secret);
      if (secretBuffer.length === cachedBuffer.length && timingSafeEqual(secretBuffer, cachedBuffer)) {
        return systemBootstrapConfig;
      }
    } catch { /* try re-fetching */ }
  }

  const freshConfig = await fetchSystemBootstrap();
  if (freshConfig) {
    try {
      const secretBuffer = Buffer.from(secret);
      const freshBuffer = Buffer.from(freshConfig.secret);
      if (secretBuffer.length === freshBuffer.length && timingSafeEqual(secretBuffer, freshBuffer)) {
        return freshConfig;
      }
    } catch { /* validation failed */ }
  }

  return null;
}

// Public paths
const PUBLIC_API_PATHS = new Set([
  '/api/openapi.json',
  '/api/docs/openapi.json',
  '/api/auth/config',
  '/api/auth/login',
  '/api/auth/session',
]);

const INGEST_PATHS = new Set([
  '/api/logs/ingest',
  '/api/metrics/ingest',
  '/api/traces/ingest',
  '/api/objects/ingest',
  '/api/ingest',
  '/api/logs/streams',
  '/api/metrics',
  '/api/objects/streams',
]);

/**
 * Telemetry read paths the system bootstrap credential may use.
 *
 * Defect D6 (energy/API-MEASUREMENTS.md): the system credential was accepted
 * on INGEST_PATHS but refused everywhere else, so a service could write a
 * metric series and then be told "Invalid or expired token" when it tried to
 * read the same series back. Values were persisted that the writer itself
 * could not retrieve — write-only telemetry.
 *
 * The grant here is deliberately narrow: query and list for telemetry the
 * credential can already write. It confers `telemetry:read` only, never
 * `telemetry:ingest`, and covers no admin, data-source or integration route.
 * Read symmetry with what it can write — nothing wider.
 */
const TELEMETRY_READ_PATHS = new Set([
  '/api/metrics',
  '/api/metrics/query',
  '/api/logs',
  '/api/logs/query',
  '/api/logs/streams',
  '/api/traces',
  '/api/traces/query',
  '/api/query',
]);

/** GET on a read path, or the POST-body query endpoints. */
function isTelemetryRead(method: string, path: string): boolean {
  if (!TELEMETRY_READ_PATHS.has(path)) return false;
  if (method === 'GET') return true;
  return method === 'POST' && path.endsWith('/query');
}

function getHeader(req: Request, name: string): string | undefined {
  const value = req.get(name);
  return value?.trim() || undefined;
}

function normalizeDataClass(value?: string): string {
  const valid = new Set(['none', 'pii', 'phi', 'secret']);
  return value && valid.has(value.toLowerCase()) ? value.toLowerCase() : config.defaults.dataClass;
}

function buildContextFromDefaults(): AuthContext {
  return {
    authType: 'anonymous',
    orgId: config.defaults.orgId,
    serviceId: config.defaults.serviceId,
    env: config.defaults.env,
    dataClass: config.defaults.dataClass,
    policyRef: config.defaults.policyRef,
    actorId: 'anonymous',
    entitlements: [],
    roles: [],
    isSuperAdmin: false,
  };
}

/**
 * Auth middleware that builds AuthContext for telemetry scoping.
 * Uses @symbia/auth for token/API key validation.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.path.startsWith('/api')) {
    next();
    return;
  }

  if (req.method === 'OPTIONS' || PUBLIC_API_PATHS.has(req.path)) {
    next();
    return;
  }

  if (req.path.startsWith('/docs')) {
    next();
    return;
  }

  const bearer = getHeader(req, 'authorization');
  const apiKey = getHeader(req, 'x-api-key');
  const requestedOrgId = getHeader(req, 'x-org-id');
  const requestedServiceId = getHeader(req, 'x-service-id');
  const requestedEnv = getHeader(req, 'x-env') || getHeader(req, 'x-environment');
  const requestedDataClass = getHeader(req, 'x-data-class');
  const requestedPolicyRef = getHeader(req, 'x-policy-ref');

  // Check session auth
  if (req.session?.userId) {
    const identityUser = req.session.identityUser;
    const userOrgs = identityUser?.organizations || [];
    const isSuperAdmin = identityUser?.isSuperAdmin || false;

    let sessionOrgId = requestedOrgId || userOrgs[0]?.id || config.defaults.orgId;

    if (!isSuperAdmin && requestedOrgId && !userOrgs.some((org: { id: string }) => org.id === requestedOrgId)) {
      res.status(403).json({ error: 'Access denied to requested organization' });
      return;
    }

    req.authContext = {
      authType: 'session',
      orgId: sessionOrgId,
      serviceId: requestedServiceId || config.defaults.serviceId,
      env: requestedEnv || config.defaults.env,
      dataClass: normalizeDataClass(requestedDataClass),
      policyRef: requestedPolicyRef || config.defaults.policyRef,
      actorId: req.session.userId,
      entitlements: identityUser?.entitlements || [],
      roles: identityUser?.roles || [],
      isSuperAdmin,
    };
    next();
    return;
  }

  // Check bearer token
  if (bearer?.toLowerCase().startsWith('bearer ')) {
    const token = bearer.slice(7).trim();

    // Check system bootstrap secret for ingest paths, and for the narrow set of
    // telemetry read paths that make writes retrievable by their writer (D6).
    const wantsIngest = INGEST_PATHS.has(req.path);
    const wantsRead = isTelemetryRead(req.method, req.path);
    if (wantsIngest || wantsRead) {
      const systemConfig = await validateSystemSecret(token);
      if (systemConfig) {
        req.authContext = {
          authType: 'apiKey',
          orgId: requestedOrgId || systemConfig.orgId,
          serviceId: requestedServiceId || systemConfig.serviceId,
          env: requestedEnv || config.defaults.env,
          dataClass: normalizeDataClass(requestedDataClass),
          policyRef: requestedPolicyRef || config.defaults.policyRef,
          actorId: `system:${requestedServiceId || 'unknown'}`,
          // Ingest is granted only on ingest paths. A read-path request gets
          // read and nothing else, so widening the read surface cannot widen
          // what the credential may write.
          entitlements: wantsIngest ? ['telemetry:ingest', 'telemetry:read'] : ['telemetry:read'],
          roles: [],
          isSuperAdmin: false,
        };
        next();
        return;
      }
    }

    // Use @symbia/auth for token introspection
    const user = await authClient.introspectToken(token);
    if (!user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    const orgId = requestedOrgId || user.orgId || user.organizations[0]?.id || config.defaults.orgId;

    req.authContext = {
      authType: 'jwt',
      orgId,
      serviceId: requestedServiceId || config.defaults.serviceId,
      env: requestedEnv || config.defaults.env,
      dataClass: normalizeDataClass(requestedDataClass),
      policyRef: requestedPolicyRef || config.defaults.policyRef,
      actorId: user.id,
      entitlements: user.entitlements,
      roles: user.roles,
      isSuperAdmin: user.isSuperAdmin,
    };
    req.user = user;
    next();
    return;
  }

  // Check API key
  if (apiKey) {
    // Try @symbia/auth first
    const user = await authClient.verifyApiKey(apiKey);
    if (user) {
      req.authContext = {
        authType: 'apiKey',
        orgId: user.orgId || requestedOrgId || config.defaults.orgId,
        serviceId: requestedServiceId || config.defaults.serviceId,
        env: requestedEnv || config.defaults.env,
        dataClass: normalizeDataClass(requestedDataClass),
        policyRef: requestedPolicyRef || config.defaults.policyRef,
        actorId: user.id,
        entitlements: user.entitlements,
        roles: user.roles,
        isSuperAdmin: user.isSuperAdmin,
      };
      req.user = user;
      next();
      return;
    }

    // Fall back to local storage
    const storedKey = await storage.validateApiKey(apiKey);
    if (storedKey) {
      await storage.updateApiKeyLastUsed(storedKey.id);
      req.authContext = {
        authType: 'apiKey',
        orgId: storedKey.orgId || config.defaults.orgId,
        serviceId: storedKey.serviceId || config.defaults.serviceId,
        env: storedKey.env || config.defaults.env,
        dataClass: normalizeDataClass(requestedDataClass),
        policyRef: requestedPolicyRef || config.defaults.policyRef,
        actorId: `apikey:${storedKey.id}`,
        entitlements: storedKey.scopes || [],
        roles: [],
        isSuperAdmin: false,
      };
      next();
      return;
    }

    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  // Anonymous access
  if (config.authMode === 'off' || config.authMode === 'optional') {
    req.authContext = buildContextFromDefaults();
    next();
    return;
  }

  res.status(401).json({ error: 'Authentication required' });
}

export function requireAuthContext(req: Request): AuthContext {
  if (!req.authContext) {
    const error = new Error('Auth context unavailable') as Error & { status: number };
    error.status = 401;
    throw error;
  }
  return req.authContext;
}

/**
 * RLS middleware - sets PostgreSQL session context for row-level security.
 */
export async function rlsMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.authContext) {
    next();
    return;
  }

  try {
    await setRLSContext({
      orgId: req.authContext.orgId,
      userId: req.authContext.actorId,
      isSuperAdmin: req.authContext.isSuperAdmin,
      capabilities: req.authContext.entitlements,
    });
    next();
  } catch (error) {
    console.error('[logging-service] Failed to set RLS context:', error);
    next();
  }
}
