/**
 * Network Service Authentication
 *
 * Uses @symbia/auth for core authentication with network-specific configuration.
 */

import type { Request, Response, NextFunction } from 'express';
import {
  createAuthMiddleware,
  hasEntitlement,
  type AuthUser,
} from '@symbia/auth';
import { config } from './config.js';

// Re-export AuthUser type
export type { AuthUser };

// Network-specific permissions
export const NetworkPermissions = {
  TOPOLOGY_READ: 'cap:network.topology.read',
  TRACES_READ: 'cap:network.traces.read',
  EVENTS_READ: 'cap:network.events.read',
  EVENTS_WRITE: 'cap:network.events.write',
  POLICIES_READ: 'cap:network.policies.read',
  POLICIES_WRITE: 'cap:network.policies.write',
  CONTRACTS_WRITE: 'cap:network.contracts.write',
  NODES_ADMIN: 'cap:network.nodes.admin',
} as const;

// Create auth middleware with network-specific configuration
const auth = createAuthMiddleware({
  identityServiceUrl: config.identityServiceUrl,
  adminEntitlements: ['network:admin', 'cap:network.admin'],
  enableImpersonation: false,
  logger: (level, message) => console.log(`[Network Auth] ${message}`),
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

// Re-export client functions
export const introspectToken = authClient.introspectToken;
export const verifyApiKey = authClient.verifyApiKey;

/**
 * Permission middleware factory.
 * Requires authentication AND specific permission.
 */
export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Use the auth middleware's getCurrentUser
    const user = await getCurrentUser(req);

    if (!user) {
      res.status(401).json({ error: 'authentication_required', message: 'Authorization header required' });
      return;
    }

    req.user = user;

    // Agents have full access (service-to-service)
    if (user.type === 'agent') {
      next();
      return;
    }

    // Super admins have all permissions
    if (user.isSuperAdmin) {
      next();
      return;
    }

    // Check if user has the specific entitlement
    if (hasEntitlement(user, permission)) {
      next();
      return;
    }

    res.status(403).json({
      error: 'insufficient_permissions',
      message: `Required permission: ${permission}`,
      requiredPermission: permission,
    });
  };
}
