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
import { setRLSContext } from './db.js';

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

  // Set RLS context
  try {
    await setRLSContext({
      orgId: user?.organizations?.[0]?.id,
      userId: user?.id,
      isSuperAdmin: user?.isSuperAdmin,
      capabilities: user?.entitlements,
    });
  } catch (error) {
    console.error('[Catalog Auth] Failed to set RLS context:', error);
  }

  next();
}
