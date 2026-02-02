/**
 * Authentication middleware for the Models Service
 */

import { createAuthMiddleware } from "@symbia/auth";
import { config } from "./config.js";

const auth = createAuthMiddleware({
  identityServiceUrl: config.identityServiceUrl,
  adminEntitlements: ["models:admin", "cap:models.admin"],
  enableImpersonation: true,
  logger: (level, msg) => console.log(`[models-auth] ${msg}`),
});

export const {
  getCurrentUser,
  requireAuth,
  optionalAuth,
  requireAdmin,
  authClient,
} = auth;

export const authMiddleware = optionalAuth;
