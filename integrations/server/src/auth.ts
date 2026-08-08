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

  // Attach the RAW bearer token.
  //
  // Credential lookup is a service-to-service call that forwards the caller's
  // own token — see credential-client.ts, "requires the calling service to
  // pass along the user's auth token". Five call sites in routes.ts read
  // `(req as any).token` to do that, and NOTHING SET IT. The only assignment
  // in the service lived in channels/routes.ts:106, so the channels router
  // worked and every other route sent `Authorization: Bearer undefined`.
  //
  // Measured 7 Aug: identity returned 401 in 0ms for every provider —
  // anthropic, openai, huggingface, symbia-labs — while the credential was
  // present and decryptable. Presenting a valid token by hand to the same
  // endpoint returned the key immediately. So this never was a missing key,
  // and every provider rendered "No API key configured" because of it.
  //
  // Set here, in the shared middleware, rather than per-router: a concern with
  // one implementation in one router and none in the others is the forked
  // pattern this codebase keeps producing.
  const rawToken =
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : undefined) ?? (req as { cookies?: Record<string, string> }).cookies?.token;
  (req as unknown as { token?: string }).token = rawToken;

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
