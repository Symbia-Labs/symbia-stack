/**
 * Messaging Service Authentication
 *
 * Uses @symbia/auth for core authentication with messaging-specific configuration.
 */

import { Request, Response, NextFunction } from 'express';
import {
  createAuthMiddleware,
  isOrgAdmin,
  isOrgMember,
  type AuthUser,
} from '@symbia/auth';
import { runWithRLSContext } from '@symbia/db';
import { config } from './config.js';

// Re-export AuthUser type for backward compatibility
export type { AuthUser };

// Re-export utility functions
export { isOrgAdmin, isOrgMember };

// Create auth middleware with messaging-specific configuration.
//
// onAuthenticated (R1, 13 Aug 2026): messaging had no RLS context — it owns its
// own pool and uses the shared @symbia/auth, which had no RLS awareness, so its
// RLS policies were inert. This resolves the request org (X-Org-Id validated
// against membership, or the user's own org) and runs the rest of the request
// inside an ALS/RLS scope, which the wrapped pool (database.ts) honors. It never
// 403s on org here — router-level isOrgMember still guards access; this only
// sets the database context. Super-admins may cross orgs via the header.
const auth = createAuthMiddleware({
  identityServiceUrl: config.identityServiceUrl,
  adminEntitlements: ['messaging:admin', 'collaborate:admin'],
  enableImpersonation: true,
  logger: (level, message) => console.log(`[Auth] ${message}`),
  onAuthenticated: (req: Request, _res: Response, next: NextFunction) => {
    const user = (req as Request & { user?: AuthUser }).user;
    if (!user) {
      next();
      return;
    }
    const headerOrg = req.headers['x-org-id'];
    const isMember = (o: string) => user.organizations?.some((m) => m.id === o);
    const orgId =
      typeof headerOrg === 'string' && (user.isSuperAdmin || isMember(headerOrg))
        ? headerOrg
        : user.orgId || user.organizations?.[0]?.id || '';
    runWithRLSContext(
      {
        orgId,
        userId: user.id,
        isSuperAdmin: user.isSuperAdmin,
        capabilities: user.entitlements || [],
        serviceId: 'messaging',
      },
      () => next(),
    );
  },
});

// Export auth functions
export const {
  getCurrentUser,
  requireAuth,
  optionalAuth,
  requireAdmin,
  requireSuperAdmin,
  authClient,
} = auth;

// Re-export client functions for backward compatibility
export const introspectToken = authClient.introspectToken;
export const verifyApiKey = authClient.verifyApiKey;
export const verifySessionCookie = authClient.verifySessionCookie;
export const buildIdentityUrl = authClient.buildIdentityUrl;
