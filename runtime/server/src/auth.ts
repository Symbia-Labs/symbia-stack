/**
 * Runtime Service Authentication
 *
 * Uses @symbia/auth for core authentication with runtime-specific configuration.
 */

import {
  createAuthMiddleware,
  type AuthUser,
} from '@symbia/auth';
import { config } from './config.js';

// Re-export AuthUser type for backward compatibility
export type { AuthUser };

// Create auth middleware with runtime-specific configuration
const auth = createAuthMiddleware({
  identityServiceUrl: config.identityServiceUrl,
  adminEntitlements: ['runtime:admin'],
  enableImpersonation: false,
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
