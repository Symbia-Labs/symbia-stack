/**
 * Assistants Service Authentication
 *
 * Uses @symbia/auth for core authentication with assistants-specific configuration.
 */

import type { Request, Response, NextFunction } from 'express';
import {
  createAuthMiddleware,
  type AuthUser,
} from '@symbia/auth';
import { config } from './config.js';

// Re-export AuthUser type for backward compatibility
export type { AuthUser };

// Create auth middleware with assistants-specific configuration
const auth = createAuthMiddleware({
  identityServiceUrl: config.identityServiceUrl,
  adminEntitlements: ['assistants:admin', 'cap:assistants.admin'],
  enableImpersonation: true,
  logger: (level, message) => console.log(`[Assistants Auth] ${message}`),
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
