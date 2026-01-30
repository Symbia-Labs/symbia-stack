/**
 * Authentication Middleware
 *
 * Provides REST API authentication via JWT tokens validated through Identity Service.
 * Supports both user and agent tokens for control plane UIs and services.
 *
 * Usage:
 * - optionalAuth: Attempts authentication, attaches principal if valid, continues either way
 * - requireAuth: Requires valid authentication, returns 401 if not authenticated
 * - requirePermission(perm): Requires authentication AND specific entitlement
 */

import type { Request, Response, NextFunction } from 'express';
import { resolveServiceUrl, ServiceId } from '@symbia/sys';
import type { UserPrincipal, AgentPrincipal } from '../types.js';
import { telemetry, NetworkEvents, NetworkMetrics } from '../telemetry.js';

// Extend Express Request type to include principal
declare global {
  namespace Express {
    interface Request {
      user?: UserPrincipal;
      agent?: AgentPrincipal;
      principalType?: 'user' | 'agent' | 'anonymous';
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
 * Validate user token via Identity service introspection
 */
async function validateUserToken(token: string): Promise<UserPrincipal | null> {
  const identityUrl = resolveServiceUrl(ServiceId.IDENTITY);

  try {
    const response = await fetch(`${identityUrl}/api/auth/introspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (!data.active || data.type !== 'user') {
      return null;
    }

    return {
      id: data.sub,
      email: data.email,
      name: data.name,
      entitlements: data.entitlements || [],
      roles: data.roles || [],
      organizations: data.organizations || [],
      isSuperAdmin: data.isSuperAdmin || false,
    };
  } catch (error) {
    console.error('[Network] REST user token validation error:', error);
    return null;
  }
}

/**
 * Validate agent token via Identity service introspection
 */
async function validateAgentToken(token: string): Promise<AgentPrincipal | null> {
  const identityUrl = resolveServiceUrl(ServiceId.IDENTITY);

  try {
    const response = await fetch(`${identityUrl}/api/auth/introspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (!data.active || data.type !== 'agent') {
      return null;
    }

    return {
      id: data.sub,
      agentId: data.agentId,
      name: data.name,
      orgId: data.orgId,
      capabilities: data.capabilities || [],
    };
  } catch (error) {
    console.error('[Network] REST agent token validation error:', error);
    return null;
  }
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

  // Try agent validation first
  const agent = await validateAgentToken(token);
  if (agent) {
    req.agent = agent;
    req.principalType = 'agent';
    telemetry.metric(NetworkMetrics.AGENT_AUTH_SUCCESS, 1, { agentId: agent.agentId, source: 'rest' });
    next();
    return;
  }

  // Try user validation
  const user = await validateUserToken(token);
  if (user) {
    req.user = user;
    req.principalType = 'user';
    telemetry.metric(NetworkMetrics.USER_AUTH_SUCCESS, 1, { source: 'rest' });
    next();
    return;
  }

  // Token provided but invalid
  req.principalType = 'anonymous';
  telemetry.metric(NetworkMetrics.USER_AUTH_FAILURE, 1, { source: 'rest' });
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

  // Try agent validation first
  const agent = await validateAgentToken(token);
  if (agent) {
    req.agent = agent;
    req.principalType = 'agent';
    telemetry.metric(NetworkMetrics.AGENT_AUTH_SUCCESS, 1, { agentId: agent.agentId, source: 'rest' });
    next();
    return;
  }

  // Try user validation
  const user = await validateUserToken(token);
  if (user) {
    req.user = user;
    req.principalType = 'user';
    telemetry.metric(NetworkMetrics.USER_AUTH_SUCCESS, 1, { source: 'rest' });
    next();
    return;
  }

  // Token invalid
  telemetry.metric(NetworkMetrics.USER_AUTH_FAILURE, 1, { source: 'rest' });
  res.status(401).json({ error: 'invalid_token', message: 'Token is invalid or expired' });
}

/**
 * Check if user has a specific permission
 * Super admins bypass all permission checks
 */
function hasPermission(req: Request, permission: string): boolean {
  // Agents have full access (they're services)
  if (req.principalType === 'agent') {
    return true;
  }

  if (!req.user) {
    return false;
  }

  // Super admins have all permissions
  if (req.user.isSuperAdmin) {
    return true;
  }

  // Check if user has the specific entitlement
  return req.user.entitlements.includes(permission);
}

/**
 * Permission middleware factory
 * Requires authentication AND specific permission
 *
 * @param permission The cap:network.* entitlement required
 */
export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // First ensure authenticated
    const token = extractBearerToken(req);

    if (!token) {
      res.status(401).json({ error: 'authentication_required', message: 'Authorization header required' });
      return;
    }

    // Try agent validation first
    const agent = await validateAgentToken(token);
    if (agent) {
      req.agent = agent;
      req.principalType = 'agent';
      telemetry.metric(NetworkMetrics.AGENT_AUTH_SUCCESS, 1, { agentId: agent.agentId, source: 'rest' });
      // Agents have full access
      next();
      return;
    }

    // Try user validation
    const user = await validateUserToken(token);
    if (user) {
      req.user = user;
      req.principalType = 'user';
      telemetry.metric(NetworkMetrics.USER_AUTH_SUCCESS, 1, { source: 'rest' });

      // Check permission
      if (!hasPermission(req, permission)) {
        telemetry.event(
          NetworkEvents.PERMISSION_DENIED,
          `REST permission denied: ${permission}`,
          { userId: user.id, email: user.email, operation: req.path, requiredPermission: permission },
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
      return;
    }

    // Token invalid
    telemetry.metric(NetworkMetrics.USER_AUTH_FAILURE, 1, { source: 'rest' });
    res.status(401).json({ error: 'invalid_token', message: 'Token is invalid or expired' });
  };
}
