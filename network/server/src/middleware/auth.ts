/**
 * Network Service Authentication Middleware
 *
 * Uses @symbia/auth for core authentication with network-specific extensions:
 * - User/Agent principal distinction for telemetry
 * - Permission-based access control
 */

import type { Request, Response, NextFunction } from 'express';
import {
  createAuthClient,
  hasEntitlement,
  type AuthUser,
} from '@symbia/auth';
import type { UserPrincipal, AgentPrincipal } from '../types.js';
import { telemetry, NetworkEvents, NetworkMetrics } from '../telemetry.js';
import { config } from '../config.js';

// Create auth client using @symbia/auth
const authClient = createAuthClient({
  identityServiceUrl: config.identityServiceUrl,
});

// Export for external use
export { authClient };

// Extend Express Request type to include network-specific principal types
// Note: AuthUser is already declared on Request.user by @symbia/auth
declare global {
  namespace Express {
    interface Request {
      agent?: AgentPrincipal;
      principalType?: 'user' | 'agent' | 'anonymous';
      userPrincipal?: UserPrincipal;
    }
  }
}

/**
 * Extract bearer token from Authorization header
 */
function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Convert AuthUser to UserPrincipal
 */
function toUserPrincipal(user: AuthUser): UserPrincipal {
  return {
    id: user.id,
    email: user.email || '',
    name: user.name || '',
    entitlements: user.entitlements,
    roles: user.roles,
    organizations: user.organizations,
    isSuperAdmin: user.isSuperAdmin,
  };
}

/**
 * Convert AuthUser (agent type) to AgentPrincipal
 */
function toAgentPrincipal(user: AuthUser): AgentPrincipal {
  return {
    id: user.id,
    agentId: user.agentId || user.id,
    name: user.name || '',
    orgId: user.orgId || '',
    capabilities: user.entitlements,
  };
}

/**
 * Optional authentication middleware
 * Attempts to authenticate, attaches principal if valid, continues either way
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractBearerToken(req);

  if (!token) {
    req.principalType = 'anonymous';
    next();
    return;
  }

  // Use @symbia/auth for token introspection
  const authUser = await authClient.introspectToken(token);

  if (!authUser) {
    req.principalType = 'anonymous';
    telemetry.metric(NetworkMetrics.USER_AUTH_FAILURE, 1, { source: 'rest' });
    next();
    return;
  }

  if (authUser.type === 'agent') {
    req.agent = toAgentPrincipal(authUser);
    req.principalType = 'agent';
    telemetry.metric(NetworkMetrics.AGENT_AUTH_SUCCESS, 1, { agentId: authUser.agentId, source: 'rest' });
  } else {
    req.user = authUser;
    req.userPrincipal = toUserPrincipal(authUser);
    req.principalType = 'user';
    telemetry.metric(NetworkMetrics.USER_AUTH_SUCCESS, 1, { source: 'rest' });
  }

  next();
}

/**
 * Required authentication middleware
 * Returns 401 if not authenticated
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractBearerToken(req);

  if (!token) {
    res.status(401).json({ error: 'authentication_required', message: 'Authorization header required' });
    return;
  }

  // Use @symbia/auth for token introspection
  const authUser = await authClient.introspectToken(token);

  if (!authUser) {
    telemetry.metric(NetworkMetrics.USER_AUTH_FAILURE, 1, { source: 'rest' });
    res.status(401).json({ error: 'invalid_token', message: 'Token is invalid or expired' });
    return;
  }

  if (authUser.type === 'agent') {
    req.agent = toAgentPrincipal(authUser);
    req.principalType = 'agent';
    telemetry.metric(NetworkMetrics.AGENT_AUTH_SUCCESS, 1, { agentId: authUser.agentId, source: 'rest' });
  } else {
    req.user = authUser;
    req.userPrincipal = toUserPrincipal(authUser);
    req.principalType = 'user';
    telemetry.metric(NetworkMetrics.USER_AUTH_SUCCESS, 1, { source: 'rest' });
  }

  next();
}

/**
 * Permission middleware factory
 * Requires authentication AND specific permission
 */
export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = extractBearerToken(req);

    if (!token) {
      res.status(401).json({ error: 'authentication_required', message: 'Authorization header required' });
      return;
    }

    // Use @symbia/auth for token introspection
    const authUser = await authClient.introspectToken(token);

    if (!authUser) {
      telemetry.metric(NetworkMetrics.USER_AUTH_FAILURE, 1, { source: 'rest' });
      res.status(401).json({ error: 'invalid_token', message: 'Token is invalid or expired' });
      return;
    }

    if (authUser.type === 'agent') {
      req.agent = toAgentPrincipal(authUser);
      req.principalType = 'agent';
      telemetry.metric(NetworkMetrics.AGENT_AUTH_SUCCESS, 1, { agentId: authUser.agentId, source: 'rest' });
      // Agents have full access
      next();
      return;
    }

    // User authentication
    req.user = authUser;
    req.userPrincipal = toUserPrincipal(authUser);
    req.principalType = 'user';
    telemetry.metric(NetworkMetrics.USER_AUTH_SUCCESS, 1, { source: 'rest' });

    // Super admins bypass permission checks
    if (authUser.isSuperAdmin) {
      next();
      return;
    }

    // Check permission using @symbia/auth utility
    if (!hasEntitlement(authUser, permission)) {
      telemetry.event(
        NetworkEvents.PERMISSION_DENIED,
        `REST permission denied: ${permission}`,
        { userId: authUser.id, email: authUser.email, operation: req.path, requiredPermission: permission },
        'warn'
      );
      telemetry.metric(NetworkMetrics.PERMISSION_DENIED, 1, { operation: req.path });
      res.status(403).json({
        error: 'insufficient_permissions',
        message: `Required permission: ${permission}`,
        requiredPermission: permission,
      });
      return;
    }

    next();
  };
}
