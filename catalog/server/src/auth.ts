/**
 * Catalog Service Authentication
 *
 * Uses @symbia/auth for core authentication with catalog-specific extensions:
 * - Local API key fallback
 * - RLS context for database access control
 */

import type { Request, Response, NextFunction } from 'express';
import {
  createAuthMiddleware,
  hashApiKey,
  generateApiKey as generateApiKeyBase,
  type AuthUser,
} from '@symbia/auth';
import { config } from './config.js';
import { storage } from './storage.js';
import { runWithRLSContext } from '@symbia/db';

// Re-export
export type { AuthUser };
export { hashApiKey };

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  return generateApiKeyBase('sos');
}

// Standard auth middleware
const auth = createAuthMiddleware({
  identityServiceUrl: config.identityServiceUrl,
  adminEntitlements: ['catalog:admin', 'cap:catalog.admin'],
  enableImpersonation: true,
  logger: (level, message) => console.log(`[Catalog Auth] ${message}`),
});

export const {
  getCurrentUser,
  requireAuth,
  optionalAuth,
  requireAdmin,
  requireSuperAdmin,
  authClient,
} = auth;

// Extend Express Request for catalog-specific properties
declare global {
  namespace Express {
    interface Request {
      token?: string;
      apiKey?: { id: string; name: string };
    }
  }
}

/**
 * Auth middleware with RLS context + local API key fallback.
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Try standard auth first
  let user: AuthUser | undefined = (await getCurrentUser(req)) ?? undefined;

  // Fallback: check for internal service auth (service-to-service communication)
  if (!user) {
    const serviceAuth = req.headers['x-service-auth'] as string | undefined;
    // Gate: when CATALOG_INTERNAL_SERVICE_TOKEN is set, the header must match that
    // secret (a real credential). Otherwise fall back to the literal 'internal' for
    // local development. This turns a spoofable trusted header into an enforced gate
    // in any deployment that sets the secret, without breaking local dev.
    const expectedServiceToken = process.env.CATALOG_INTERNAL_SERVICE_TOKEN;
    const serviceAuthOk = expectedServiceToken
      ? serviceAuth === expectedServiceToken
      : serviceAuth === 'internal';
    if (serviceAuthOk) {
      // Trust internal service requests bearing the configured service credential
      user = {
        id: 'service:internal',
        email: 'service@internal',
        name: 'Internal Service',
        type: 'agent',
        isSuperAdmin: true,
        organizations: [],
        entitlements: ['cap:catalog.admin', 'cap:registry.write', 'cap:registry.publish'],
        roles: [],
      };
    }
  }

  // Fallback: check local API key storage
  if (!user) {
    const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
    if (apiKeyHeader) {
      const keyHash = hashApiKey(apiKeyHeader);
      const localKey = await storage.getApiKeyByHash(keyHash);

      if (localKey && (!localKey.expiresAt || new Date(localKey.expiresAt) >= new Date())) {
        storage.updateApiKeyLastUsed(localKey.id).catch(() => {});
        user = {
          id: `api-key:${localKey.id}`,
          email: 'api-key@system',
          name: localKey.name,
          type: 'agent',
          isSuperAdmin: true,
          organizations: [],
          entitlements: ['cap:catalog.admin', 'cap:registry.write', 'cap:registry.publish'],
          roles: [],
        };
      }
    }
  }

  req.user = user;

  // Fail-closed AsyncLocalStorage RLS scope (A4, 13 Aug 2026): pooled
  // queries run on a pinned client with SET LOCAL context. The previous
  // pool-level setRLSContext was a no-op under pooling, and errors fell open.
  try {
    runWithRLSContext(
      {
        orgId: user?.organizations?.[0]?.id ?? '',
        userId: user?.id ?? 'anonymous',
        isSuperAdmin: user?.isSuperAdmin,
        capabilities: user?.entitlements,
        serviceId: 'catalog',
      },
      () => next()
    );
  } catch (error) {
    console.error('[Catalog Auth] Failed to establish RLS context:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to establish request security context' });
    }
  }
}

/**
 * "Nobody is here" and "this person may not" are different answers.
 *
 * Measured 16 Aug: every catalog write answered 403 whether a caller sent a
 * valid token, an expired one, or none at all — so a client whose session
 * died could not tell that from a real permission denial, and no client
 * retried. 401 invites re-authentication; 403 tells you to stop asking.
 * The MCP server re-logs-in on 401 only, so a host restart left every shim
 * permanently unable to write.
 *
 * logging and runtime already answered 401 here. Catalog was the outlier.
 */
export function requirePrincipal(req: any, res: any): boolean {
  if (req.user) return true;
  res.status(401).json({
    error: "Not authenticated",
    detail:
      "No principal on this request. A token was absent, expired, or issued by a different host — " +
      "which is a different thing from lacking permission. Authenticate and retry.",
  });
  return false;
}
