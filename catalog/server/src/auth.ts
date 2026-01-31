import type { Request, Response, NextFunction } from 'express';
import { createHash, randomBytes } from 'crypto';
import { verifyApiKey, verifyToken, type IdentityUser } from './identity';
import { storage } from './storage';
import { setRLSContext } from "./db";

declare global {
  namespace Express {
    interface Request {
      user?: IdentityUser;
      token?: string;
      apiKey?: { id: string; name: string };
    }
  }
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const secureBytes = randomBytes(32).toString('hex');
  const key = `sos_${secureBytes}`;
  const prefix = key.substring(0, 8);
  const hash = hashApiKey(key);
  return { key, prefix, hash };
}

/**
 * Unified auth + RLS middleware for catalog.
 *
 * - Attempts to authenticate via token or API key (optional)
 * - Sets RLS context based on auth result
 * - Database handles access control via Row-Level Security
 *
 * Public resources (org_id = NULL) are visible to everyone.
 * Private resources are filtered by org_id at the database level.
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies?.token;
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;

  let user: IdentityUser | undefined;

  // Try API key auth
  if (apiKeyHeader) {
    const keyHash = hashApiKey(apiKeyHeader);
    const apiKey = await storage.getApiKeyByHash(keyHash);

    if (apiKey) {
      if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
        // Expired - continue as anonymous
      } else {
        storage.updateApiKeyLastUsed(apiKey.id).catch(() => {});
        user = {
          id: `api-key:${apiKey.id}`,
          email: `api-key@system`,
          name: apiKey.name,
          isSuperAdmin: true,
          organizations: [],
          entitlements: ['cap:catalog.admin', 'cap:registry.write', 'cap:registry.publish'],
        };
        req.apiKey = { id: apiKey.id, name: apiKey.name };
      }
    } else {
      // Try verifying with Identity service
      const verified = await verifyApiKey(apiKeyHeader);
      if (verified) {
        user = verified.user;
        req.apiKey = { id: verified.user.id, name: verified.user.name };
      }
    }
  }

  // Try token auth if no API key
  if (!user) {
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : cookieToken;

    if (token) {
      user = await verifyToken(token);
      if (user) {
        req.token = token;
      }
    }
  }

  // Set user on request (may be undefined for anonymous)
  req.user = user;

  // Set RLS context - database handles access control
  try {
    await setRLSContext({
      orgId: user?.organizations?.[0]?.id,
      userId: user?.id,
      isSuperAdmin: user?.isSuperAdmin,
      capabilities: user?.entitlements,
    });
  } catch (error) {
    console.error("[catalog] Failed to set RLS context:", error);
  }

  next();
}

/**
 * Require authentication - returns 401 if not authenticated.
 * Use after authMiddleware for endpoints that require auth.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}

/**
 * Require super admin - returns 403 if not super admin.
 * Use after authMiddleware for admin-only endpoints.
 */
export function requireSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (!req.user.isSuperAdmin) {
    res.status(403).json({ error: 'Super admin access required' });
    return;
  }

  next();
}
