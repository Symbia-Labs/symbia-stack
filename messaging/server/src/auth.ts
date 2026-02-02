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
import { config } from './config.js';

// Re-export AuthUser type for backward compatibility
export type { AuthUser };

// Re-export utility functions
export { isOrgAdmin, isOrgMember };

// Create auth middleware with messaging-specific configuration
const auth = createAuthMiddleware({
  identityServiceUrl: config.identityServiceUrl,
  adminEntitlements: ['messaging:admin', 'collaborate:admin'],
  enableImpersonation: true,
  logger: (level, message) => console.log(`[Auth] ${message}`),
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
