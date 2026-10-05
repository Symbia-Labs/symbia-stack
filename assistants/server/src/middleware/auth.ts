/**
 * Authentication middleware for Assistants Service
 *
 * Validates tokens via Identity Service introspection endpoint.
 */

import type { Request, Response, NextFunction } from 'express';
import { resolveServiceUrl } from '@symbia/sys';
import { runWithRLSContext, type RLSContext } from '@symbia/db';

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

  // Determine orgId. SECURITY (A4, 13 Aug 2026): a header-supplied org is
  // only honored if the authenticated principal actually belongs to it (or
  // is a super admin). Previously the header was trusted outright, letting
  // any authenticated user run in any org's scope.
  const orgId = resolveOrgId(req, introspection, res);
  if (orgId === null) return; // response already sent

  // Set auth context on request
  req.userId = introspection.sub;
  req.orgId = orgId;
  req.userType = introspection.type;
  req.token = token;

  // Scope all downstream queries to this request's RLS context.
  // Fail-closed: if the context cannot be established, the request does not
  // proceed ("continue without RLS" was the A4 fail-open).
  runRequestWithRLS(
    {
      orgId,
      userId: introspection.sub ?? 'anonymous',
      isSuperAdmin: introspection.isSuperAdmin,
      capabilities: introspection.entitlements || [],
      serviceId: 'assistants',
    },
    res,
    next
  );
}

/**
 * Resolve and authorize the org for this request.
 * Returns the orgId, or null if a response has been sent (403/400).
 */
function resolveOrgId(
  req: AuthenticatedRequest,
  introspection: TokenIntrospection,
  res: Response
): string | null {
  const headerOrgId = req.headers['x-org-id'] as string | undefined;

  const memberOrgs = new Set<string>();
  if (introspection.orgId) memberOrgs.add(introspection.orgId);
  for (const org of introspection.organizations ?? []) memberOrgs.add(org.id);

  if (headerOrgId) {
    if (introspection.isSuperAdmin || memberOrgs.has(headerOrgId)) {
      return headerOrgId;
    }
    res.status(403).json({
      error: 'Forbidden: authenticated principal is not a member of the requested organization',
    });
    return null;
  }

  // No header: fall back to token data.
  let orgId: string | undefined;
  if (introspection.type === 'agent') {
    orgId = introspection.orgId;
  } else if (introspection.organizations && introspection.organizations.length > 0) {
    orgId = introspection.organizations[0].id;
  }

  if (!orgId) {
    const env = process.env.NODE_ENV || 'development';
    if (env === 'production') {
      res.status(400).json({
        error: 'Organization context required. Provide X-Org-Id header or ensure token includes org membership.',
      });
      return null;
    }
    // Dev-only fallback
    orgId = 'dev-default-org';
  }

  return orgId;
}

/**
 * Run the rest of the request inside an AsyncLocalStorage RLS scope so every
 * pooled query executes on a pinned client with SET LOCAL context
 * (see @symbia/db als-context.ts). Fail-closed.
 */
function runRequestWithRLS(context: RLSContext, res: Response, next: NextFunction): void {
  try {
    runWithRLSContext(context, () => next());
  } catch (error) {
    console.error('[assistants-service] Failed to establish RLS context:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to establish request security context' });
    }
  }
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
      // Same membership rule as requireAuth (A4): header org must be one the
      // principal belongs to, or the principal must be a super admin.
      const orgId = resolveOrgId(req, introspection, res);
      if (orgId === null) return; // 403 already sent

      req.userId = introspection.sub;
      req.orgId = orgId || 'dev-default-org';
      req.userType = introspection.type;
      req.token = token;

      // Fail-closed RLS scope for the rest of the request.
      runRequestWithRLS(
        {
          orgId: req.orgId,
          userId: introspection.sub ?? 'anonymous',
          isSuperAdmin: introspection.isSuperAdmin,
          capabilities: introspection.entitlements || [],
          serviceId: 'assistants',
        },
        res,
        next
      );
      return;
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

  // Fail-closed (A4): previously this continued without RLS on error, which
  // with pooling could mean running with a previous request's context.
  runRequestWithRLS(
    {
      orgId: req.orgId ?? '',
      userId: req.userId,
      isSuperAdmin: false, // Need to check introspection for this
      capabilities: [],
      serviceId: 'assistants',
    },
    res,
    next
  );
}
