import { Request, Response, NextFunction } from 'express';
import { config } from './config.js';

export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
  type: 'user' | 'agent';
  /** Agent identifier (e.g., "agent:onboarding") - only set for agents */
  agentId?: string;
  orgId?: string;
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    role: 'admin' | 'member' | 'viewer';
  }>;
  entitlements: string[];
  roles: string[];
  isSuperAdmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function getTokenFromHeader(req: Request): string | null {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}

function getApiKey(req: Request): string | null {
  return (req.headers['x-api-key'] as string) || null;
}

function getSessionCookie(req: Request): { name: string; value: string } | null {
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

function buildIdentityUrl(path: string): string {
  const base = config.identityServiceUrl.replace(/\/$/, '');
  if (base.endsWith('/api')) {
    return `${base}${path}`;
  }
  return `${base}/api${path}`;
}

export async function introspectToken(token: string): Promise<AuthUser | null> {
  try {
    const response = await fetch(buildIdentityUrl('/auth/introspect'), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (!data.active) return null;

    // Support both user and agent tokens from Identity service
    const isAgent = data.type === 'agent';

    return {
      // For agents, use agentId (e.g., "assistant:onboarding") as the principal ID
      // For users, use sub (the user's UUID)
      id: isAgent ? data.agentId : data.sub,
      email: data.email,
      name: data.name,
      type: isAgent ? 'agent' : 'user',
      agentId: isAgent ? data.agentId : undefined,
      orgId: isAgent ? data.orgId : data.organizations?.[0]?.id,
      organizations: data.organizations || [],
      entitlements: isAgent ? (data.capabilities || []) : (data.entitlements || []),
      roles: data.roles || [],
      isSuperAdmin: data.isSuperAdmin || false,
    };
  } catch (error) {
    console.error('Token introspection failed:', error);
    return null;
  }
}

export async function verifyApiKey(apiKey: string): Promise<AuthUser | null> {
  try {
    const response = await fetch(buildIdentityUrl('/auth/verify-api-key'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (!data.valid) return null;

    const orgId = data.orgId || undefined;
    const organizations = orgId
      ? [
          {
            id: orgId,
            name: 'API Key Org',
            slug: orgId,
            role: 'admin' as const,
          },
        ]
      : [];

    return {
      id: data.creator?.id || `api:${data.keyId}`,
      email: data.creator?.email,
      name: data.name,
      type: 'agent',
      orgId,
      organizations,
      entitlements: data.creator?.entitlements || data.scopes || [],
      roles: data.creator?.roles || [],
      isSuperAdmin: false,
    };
  } catch (error) {
    console.error('API key verification failed:', error);
    return null;
  }
}

export async function verifySessionCookie(sessionCookie: { name: string; value: string }): Promise<AuthUser | null> {
  try {
    const tokenUser = await introspectToken(sessionCookie.value);
    if (tokenUser) {
      return tokenUser;
    }

    const response = await fetch(buildIdentityUrl('/users/me'), {
      method: 'GET',
      headers: {
        'Cookie': `${sessionCookie.name}=${sessionCookie.value}`,
      },
      credentials: 'include',
    });

    if (!response.ok) return null;

    const data = await response.json();

    return {
      id: data.id,
      email: data.email,
      name: data.name,
      type: 'user',
      orgId: data.organizations?.[0]?.id,
      organizations: data.organizations || [],
      entitlements: data.entitlements || [],
      roles: data.roles || [],
      isSuperAdmin: data.isSuperAdmin || false,
    };
  } catch (error) {
    console.error('Session verification failed:', error);
    return null;
  }
}

export { buildIdentityUrl };

export async function getCurrentUser(req: Request): Promise<AuthUser | null> {
  const token = getTokenFromHeader(req);
  if (token) {
    const user = await introspectToken(token);
    if (user) return user;
  }

  const apiKey = getApiKey(req);
  if (apiKey) {
    const user = await verifyApiKey(apiKey);
    if (user) return user;
  }

  const session = getSessionCookie(req);
  if (session) {
    const user = await verifySessionCookie(session);
    if (user) return user;
  }

  return null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  getCurrentUser(req).then(user => {
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Support X-As-User-Id header for service-to-service impersonation
    // Only allowed for agents (services) and super admins
    const asUserId = req.headers['x-as-user-id'] as string | undefined;
    if (asUserId && (user.type === 'agent' || user.isSuperAdmin)) {
      // Create an impersonated user context
      req.user = {
        ...user,
        id: asUserId,
        // Determine type from userId format: assistant:xxx -> agent, otherwise user
        type: asUserId.startsWith('assistant:') || asUserId.startsWith('agent:') ? 'agent' : 'user',
        // Preserve the original caller's entitlements and admin status for authorization
      };
      console.log(`[Auth] Service ${user.id} impersonating ${asUserId}`);
    } else {
      req.user = user;
    }
    next();
  }).catch(next);
}

export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  getCurrentUser(req).then(user => {
    req.user = user || undefined;
    next();
  }).catch(next);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  getCurrentUser(req).then(user => {
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    
    const isAdmin = user.isSuperAdmin || 
                    user.roles.includes('admin') || 
                    user.entitlements.includes('messaging:admin') ||
                    user.entitlements.includes('collaborate:admin');
    
    if (!isAdmin) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    
    req.user = user;
    next();
  }).catch(next);
}

export function isOrgAdmin(user: AuthUser, orgId: string): boolean {
  if (user.isSuperAdmin) return true;
  const org = user.organizations.find(o => o.id === orgId);
  return org?.role === 'admin';
}

export function isOrgMember(user: AuthUser, orgId?: string): boolean {
  if (!orgId) return true;
  if (user.isSuperAdmin) return true;
  if (user.orgId === orgId) return true;
  return user.organizations.some(org => org.id === orgId);
}
