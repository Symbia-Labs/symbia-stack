import { resolveServiceUrl, ServiceId } from '@symbia/sys';

const IDENTITY_SERVICE_URL = resolveServiceUrl(ServiceId.IDENTITY);

export interface IdentityOrg {
  id: string;
  name: string;
  slug: string;
  role: 'admin' | 'member' | 'viewer';
}

export interface IdentityUser {
  id: string;
  email: string;
  name: string;
  isSuperAdmin?: boolean;
  organizations?: IdentityOrg[];
  entitlements?: string[];
  roles?: string[];
}

interface IdentityIntrospection {
  active?: boolean;
  sub?: string;
  email?: string;
  name?: string;
  isSuperAdmin?: boolean;
  organizations?: IdentityOrg[];
  entitlements?: string[];
  roles?: string[];
}

interface IdentityApiKeyVerification {
  valid?: boolean;
  error?: string;
  keyId?: string;
  name?: string;
  orgId?: string | null;
  scopes?: string[];
  creator?: {
    id?: string;
    email?: string;
    entitlements?: string[];
    roles?: string[];
  };
}

export async function verifyToken(token: string): Promise<IdentityUser | null> {
  try {
    const response = await fetch(`${IDENTITY_SERVICE_URL}/api/auth/introspect`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    if (response.ok) {
      const introspection = (await response.json()) as IdentityIntrospection;
      if (!introspection.active) {
        return null;
      }
      return {
        id: introspection.sub || '',
        email: introspection.email || '',
        name: introspection.name || '',
        isSuperAdmin: introspection.isSuperAdmin,
        organizations: introspection.organizations || [],
        entitlements: introspection.entitlements || [],
        roles: introspection.roles || [],
      };
    }

    const fallback = await fetch(`${IDENTITY_SERVICE_URL}/api/users/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!fallback.ok) {
      return null;
    }

    const user = await fallback.json();
    return user as IdentityUser;
  } catch (error) {
    console.error('Error verifying token with identity service:', error);
    return null;
  }
}

export async function verifyApiKey(apiKey: string): Promise<{ user: IdentityUser; orgId?: string; scopes: string[] } | null> {
  try {
    const response = await fetch(`${IDENTITY_SERVICE_URL}/api/auth/verify-api-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ apiKey }),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as IdentityApiKeyVerification;
    if (!data.valid) {
      return null;
    }

    const orgId = data.orgId || undefined;
    const scopes = data.scopes || [];
    const entitlements = new Set([...(data.creator?.entitlements || []), ...scopes]);
    const roles = new Set([...(data.creator?.roles || [])]);
    const organizations: IdentityOrg[] = orgId
      ? [
          {
            id: orgId,
            name: 'API Key Org',
            slug: orgId,
            role: 'admin',
          },
        ]
      : [];

    const user: IdentityUser = {
      id: data.creator?.id || data.keyId || `api-key:${data.keyId}`,
      email: data.creator?.email || 'api-key@system',
      name: data.name || 'API Key',
      isSuperAdmin: roles.has('role:admin'),
      organizations,
      entitlements: Array.from(entitlements),
      roles: Array.from(roles),
    };

    return { user, orgId, scopes };
  } catch (error) {
    console.error('Error verifying API key with identity service:', error);
    return null;
  }
}

export async function getUserOrganizations(token: string): Promise<IdentityOrg[]> {
  try {
    const response = await fetch(`${IDENTITY_SERVICE_URL}/api/orgs`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json() as { organizations?: IdentityOrg[] };
    return data.organizations || [];
  } catch (error) {
    console.error('Error fetching organizations:', error);
    return [];
  }
}

export function getIdentityServiceUrl(): string {
  return IDENTITY_SERVICE_URL;
}
