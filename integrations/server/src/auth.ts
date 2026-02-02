/**
 * Integrations Service Authentication
 *
 * Uses @symbia/auth with RLS context for database access control.
 */

import type { Request, Response, NextFunction } from 'express';
import { createAuthMiddleware, type AuthUser } from '@symbia/auth';
import { config } from './config.js';
import { setRLSContext } from './db.js';

export type { AuthUser };

const auth = createAuthMiddleware({
  identityServiceUrl: config.identityServiceUrl,
  adminEntitlements: ['integrations:admin', 'cap:integrations.admin'],
  enableImpersonation: true,
  logger: (level, message) => console.log(`[Integrations Auth] ${message}`),
});

export const {
  getCurrentUser,
  requireAuth,
  optionalAuth,
  requireAdmin,
  requireSuperAdmin,
  authClient,
} = auth;

/**
 * Auth middleware with RLS context.
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = await getCurrentUser(req);

  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  req.user = user;

  // Resolve orgId: header > user's primary org > fallback
  const headerOrgId = req.headers['x-org-id'] as string | undefined;
  let orgId = headerOrgId || user.orgId || user.organizations[0]?.id;

  if (!orgId && process.env.NODE_ENV !== 'production') {
    orgId = 'dev-default-org';
  }

  if (!orgId) {
    res.status(400).json({ error: 'Organization context required. Provide X-Org-Id header.' });
    return;
  }

  try {
    await setRLSContext({
      orgId,
      userId: user.id,
      isSuperAdmin: user.isSuperAdmin,
      capabilities: user.entitlements,
    });
  } catch (error) {
    console.error('[Integrations Auth] Failed to set RLS context:', error);
  }

  next();
}
