/**
 * @symbia/auth - Shared authentication and authorization for Symbia services
 *
 * This package provides:
 * - Authentication client for Identity service integration
 * - Express middleware for protecting routes
 * - Utility functions for authorization checks
 *
 * @example
 * ```typescript
 * import { createAuthMiddleware, isOrgMember } from '@symbia/auth';
 * import { resolveServiceUrl, ServiceId } from '@symbia/sys';
 *
 * const auth = createAuthMiddleware({
 *   identityServiceUrl: resolveServiceUrl(ServiceId.IDENTITY),
 *   adminEntitlements: ['messaging:admin'],
 *   enableImpersonation: true,
 * });
 *
 * app.get('/api/protected', auth.requireAuth, (req, res) => {
 *   const user = req.user!;
 *   if (isOrgMember(user, req.params.orgId)) {
 *     res.json({ data: 'secret' });
 *   } else {
 *     res.status(403).json({ error: 'Not a member' });
 *   }
 * });
 * ```
 */

// Types
export type {
  AuthUser,
  AuthOrganization,
  AuthClientConfig,
  AuthMiddlewareOptions,
  SessionCookie,
  TokenIntrospectionResponse,
  ApiKeyVerificationResponse,
} from './types.js';

// Auth client
export { createAuthClient, type AuthClient } from './client.js';

// Middleware
export { createAuthMiddleware, type AuthMiddleware } from './middleware.js';

// Utilities
export {
  isOrgAdmin,
  isOrgMember,
  hasEntitlement,
  hasAnyEntitlement,
  hasAllEntitlements,
  hashApiKey,
  generateApiKey,
  isAgentId,
  getAgentName,
} from './utils.js';
