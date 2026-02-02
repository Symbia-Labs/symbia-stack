/**
 * @symbia/auth - Express middleware for authentication
 */

import type { Request, Response, NextFunction } from 'express';
import type { AuthUser, AuthMiddlewareOptions, SessionCookie } from './types.js';
import { createAuthClient, type AuthClient } from './client.js';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Extract Bearer token from Authorization header
 */
function getTokenFromHeader(req: Request): string | null {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}

/**
 * Extract API key from X-API-Key header
 */
function getApiKey(req: Request): string | null {
  return (req.headers['x-api-key'] as string) || null;
}

/**
 * Extract session cookie from request
 */
function getSessionCookie(req: Request): SessionCookie | null {
  const token = req.cookies?.token;
  if (token) {
    return { name: 'token', value: token };
  }
  const session = req.cookies?.symbia_session;
  if (session) {
    return { name: 'symbia_session', value: session };
  }
  return null;
}

/**
 * Get the authenticated user from the request using all available auth methods
 */
async function getCurrentUserFromRequest(
  req: Request,
  authClient: AuthClient
): Promise<AuthUser | null> {
  // Try Bearer token first
  const token = getTokenFromHeader(req);
  if (token) {
    const user = await authClient.introspectToken(token);
    if (user) return user;
  }

  // Try API key
  const apiKey = getApiKey(req);
  if (apiKey) {
    const user = await authClient.verifyApiKey(apiKey);
    if (user) return user;
  }

  // Try session cookie
  const session = getSessionCookie(req);
  if (session) {
    const user = await authClient.verifySessionCookie(session);
    if (user) return user;
  }

  return null;
}

/**
 * Create authentication middleware for a service
 */
export function createAuthMiddleware(options: AuthMiddlewareOptions) {
  const {
    identityServiceUrl,
    adminEntitlements = [],
    enableImpersonation = false,
    logger = (level, msg) => console[level](`[Auth] ${msg}`),
  } = options;

  const authClient = createAuthClient({ identityServiceUrl });

  /**
   * Get the current authenticated user
   */
  async function getCurrentUser(req: Request): Promise<AuthUser | null> {
    return getCurrentUserFromRequest(req, authClient);
  }

  /**
   * Middleware that requires authentication
   */
  function requireAuth(req: Request, res: Response, next: NextFunction): void {
    getCurrentUser(req)
      .then((user) => {
        if (!user) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }

        // Support X-As-User-Id header for service-to-service impersonation
        if (enableImpersonation) {
          const asUserId = req.headers['x-as-user-id'] as string | undefined;
          if (asUserId && (user.type === 'agent' || user.isSuperAdmin)) {
            req.user = {
              ...user,
              id: asUserId,
              type: asUserId.startsWith('assistant:') || asUserId.startsWith('agent:') ? 'agent' : 'user',
            };
            logger('info', `Service ${user.id} impersonating ${asUserId}`);
          } else {
            req.user = user;
          }
        } else {
          req.user = user;
        }

        next();
      })
      .catch(next);
  }

  /**
   * Middleware that optionally authenticates (no 401 on failure)
   */
  function optionalAuth(req: Request, res: Response, next: NextFunction): void {
    getCurrentUser(req)
      .then((user) => {
        req.user = user || undefined;
        next();
      })
      .catch(next);
  }

  /**
   * Middleware that requires admin access
   */
  function requireAdmin(req: Request, res: Response, next: NextFunction): void {
    getCurrentUser(req)
      .then((user) => {
        if (!user) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }

        // Check admin status
        const isAdmin =
          user.isSuperAdmin ||
          user.roles.includes('admin') ||
          adminEntitlements.some((ent) => user.entitlements.includes(ent));

        if (!isAdmin) {
          res.status(403).json({ error: 'Admin access required' });
          return;
        }

        req.user = user;
        next();
      })
      .catch(next);
  }

  /**
   * Middleware that requires super admin access
   */
  function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
    getCurrentUser(req)
      .then((user) => {
        if (!user) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }

        if (!user.isSuperAdmin) {
          res.status(403).json({ error: 'Super admin access required' });
          return;
        }

        req.user = user;
        next();
      })
      .catch(next);
  }

  return {
    getCurrentUser,
    requireAuth,
    optionalAuth,
    requireAdmin,
    requireSuperAdmin,
    authClient,
  };
}

export type AuthMiddleware = ReturnType<typeof createAuthMiddleware>;
