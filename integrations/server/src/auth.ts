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

  // WRITE THE RESOLVED ORG BACK ONTO THE USER.
  //
  // This is the same shape as the raw-token defect documented above, in this
  // same function: a value resolved in one place and read from another that
  // never received it. `orgId` above is resolved header > token > fallback and
  // then used for RLS only. Six call sites in routes.ts read `user.orgId` to
  // look up a credential, and `user` still carried whatever token
  // introspection produced.
  //
  // For a human that is harmless — their token names their org, so the two
  // agree. For an AGENT it is fatal and silent. A bootstrap assistant
  // registers with no organization (`orgId: null, organizations: []`,
  // measured 11 Aug 2026 against /api/auth/agent/me), so `user.orgId` is null
  // no matter what the caller says. `resolveUsableProvider` sends X-Org-Id
  // precisely to say which org to look in; the header reached this middleware,
  // was used for RLS, and was then dropped on the floor before the handler.
  //
  // The result: identity was asked for `userId: assistant:coordinator,
  // orgId: null`, could not reach the org-wide fallback in
  // getCredentialForUserOrOrg, returned 404 for every provider, and the chat
  // window told the operator to add an API key that was already configured.
  // No assistant in this platform could resolve an org credential.
  req.user = { ...user, orgId };

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
