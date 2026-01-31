/**
 * Authentication middleware for Assistants Service
 *
 * Validates tokens via Identity Service introspection endpoint.
 */

import type { Request, Response, NextFunction } from 'express';
import { resolveServiceUrl } from '@symbia/sys';
import { setRLSContext } from '../lib/db.js';

const IDENTITY_SERVICE_URL = process.env.IDENTITY_ENDPOINT || resolveServiceUrl('identity');

/**
 * Token introspection response from Identity service
 */
interface TokenIntrospection {
  active: boolean;
  sub?: string;
  type?: 'user' | 'agent';
  orgId?: string;
  isSuperAdmin?: boolean;
  entitlements?: string[];
  organizations?: Array<{ id: string; name?: string }>;
}

/**
 * Extended request with auth context
 */
export interface AuthenticatedRequest extends Request {
  userId?: string;
  orgId?: string;
  userType?: 'user' | 'agent';
  token?: string;
}

/**
 * Extract auth token from request
 */
function extractToken(req: Request): string | null {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Check cookie
  const cookies = req.headers.cookie;
  if (cookies) {
    const tokenMatch = cookies.match(/token=([^;]+)/);
    if (tokenMatch) {
      return tokenMatch[1];
    }
  }

  return null;
}

/**
 * Validate token via Identity service introspection
 */
async function introspectToken(token: string): Promise<TokenIntrospection | null> {
  try {
    const url = `${IDENTITY_SERVICE_URL}/api/auth/introspect`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      return null;
    }

    return response.json() as Promise<TokenIntrospection>;
  } catch (error) {
    console.error('[assistants] Error introspecting token:', error);
    return null;
  }
}

/**
 * Auth middleware - validates token and extracts user info
 *
 * Requires valid authentication. Use for admin routes and sensitive operations.
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const introspection = await introspectToken(token);

  if (!introspection?.active) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  // Determine orgId: prefer header, fall back to token data
  const headerOrgId = req.headers['x-org-id'] as string | undefined;
  let orgId: string | undefined = headerOrgId;

  if (!orgId) {
    // For agents, use orgId directly; for users, use first organization
    if (introspection.type === 'agent') {
      orgId = introspection.orgId;
    } else if (introspection.organizations && introspection.organizations.length > 0) {
      orgId = introspection.organizations[0].id;
    }
  }

  // Require explicit org context in production
  if (!orgId) {
    const env = process.env.NODE_ENV || 'development';
    if (env === 'production') {
      res.status(400).json({
        error: 'Organization context required. Provide X-Org-Id header or ensure token includes org membership.',
      });
      return;
    }
    // Dev-only fallback
    orgId = 'dev-default-org';
  }

  // Set auth context on request
  req.userId = introspection.sub;
  req.orgId = orgId;
  req.userType = introspection.type;
  req.token = token;

  // Set RLS context for database queries
  try {
    await setRLSContext({
      orgId,
      userId: introspection.sub,
      isSuperAdmin: introspection.isSuperAdmin,
      capabilities: introspection.entitlements || [],
    });
  } catch (error) {
    console.error("[assistants-service] Failed to set RLS context:", error);
    // Continue without RLS on error
  }

  next();
}

/**
 * Optional auth middleware - extracts user info if available but doesn't require it
 *
 * Use for routes that can work both authenticated and unauthenticated.
 */
export async function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractToken(req);

  if (token) {
    const introspection = await introspectToken(token);

    if (introspection?.active) {
      const headerOrgId = req.headers['x-org-id'] as string | undefined;
      let orgId: string | undefined = headerOrgId;

      if (!orgId) {
        if (introspection.type === 'agent') {
          orgId = introspection.orgId;
        } else if (introspection.organizations && introspection.organizations.length > 0) {
          orgId = introspection.organizations[0].id;
        }
      }

      req.userId = introspection.sub;
      req.orgId = orgId || 'dev-default-org';
      req.userType = introspection.type;
      req.token = token;

      // Set RLS context for database queries
      try {
        await setRLSContext({
          orgId: req.orgId,
          userId: introspection.sub,
          isSuperAdmin: introspection.isSuperAdmin,
          capabilities: introspection.entitlements || [],
        });
      } catch (error) {
        console.error("[assistants-service] Failed to set RLS context:", error);
        // Continue without RLS on error
      }
    }
  }

  next();
}

/**
 * RLS middleware - sets PostgreSQL session context for row-level security.
 * Can be used standalone after other authentication middleware.
 */
export async function rlsMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.userId) {
    // No auth context, skip RLS
    return next();
  }

  try {
    await setRLSContext({
      orgId: req.orgId,
      userId: req.userId,
      isSuperAdmin: false, // Need to check introspection for this
      capabilities: [],
    });
    next();
  } catch (error) {
    console.error("[assistants-service] Failed to set RLS context:", error);
    next(); // Continue without RLS on error
  }
}
