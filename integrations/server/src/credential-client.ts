import { resolveServiceUrl, ServiceId } from "@symbia/sys";

const IDENTITY_SERVICE_URL = resolveServiceUrl(ServiceId.IDENTITY);

export interface CredentialLookup {
  apiKey: string;
  metadata: Record<string, unknown>;
  // Proxy tracking info
  credentialId: string;
  isProxy: boolean;        // True if user is using org-wide key (not their own)
  ownerId: string;         // Who owns this credential
  isOrgWide: boolean;      // Is this credential marked as org-wide
}

/**
 * Get a credential from Identity service for a user/org and provider
 *
 * This is a service-to-service call that requires the calling service
 * to pass along the user's auth token.
 */
export async function getCredential(
  userId: string,
  orgId: string | null,
  provider: string,
  authToken: string
): Promise<CredentialLookup | null> {
  try {
    const url = `${IDENTITY_SERVICE_URL}/api/internal/credentials/${userId}/${provider}`;

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${authToken}`,
      "X-Service-Id": "integrations",
    };

    if (orgId) {
      headers["X-Org-Id"] = orgId;
    }

    console.log(`[integrations] Credential lookup - userId: ${userId}, orgId: ${orgId}, provider: ${provider}`);
    console.log(`[integrations] Calling Identity: ${url}`);

    const response = await fetch(url, { headers });

    console.log(`[integrations] Identity response status: ${response.status}`);

    if (!response.ok) {
      if (response.status === 404) {
        const body = await response.text();
        console.log(`[integrations] Credential not found - response: ${body}`);
        return null; // Credential not found
      }
      console.error(`[integrations] Failed to fetch credential: ${response.statusText}`);
      return null;
    }

    const result = await response.json() as CredentialLookup;
    console.log(`[integrations] Credential found - has apiKey: ${!!result.apiKey}, isProxy: ${result.isProxy}, credentialId: ${result.credentialId}`);
    return result;
  } catch (error) {
    console.error(`[integrations] Error fetching credential:`, error);
    return null;
  }
}

/**
 * Get a credential directly by ID from Identity service.
 * Used when we've stored the credential ID in a connection.
 *
 * Note: This is an internal service call and doesn't require user auth token
 * since we already have the credential ID stored in our database.
 */
export async function getCredentialById(
  credentialId: string
): Promise<CredentialLookup | null> {
  try {
    const url = `${IDENTITY_SERVICE_URL}/api/internal/credentials/by-id/${credentialId}`;

    const response = await fetch(url, {
      headers: {
        "X-Service-Id": "integrations",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[integrations] Credential not found by ID: ${credentialId}`);
        return null;
      }
      console.error(`[integrations] Failed to fetch credential by ID: ${response.statusText}`);
      return null;
    }

    const result = await response.json() as CredentialLookup;
    console.log(`[integrations] Credential found by ID - has apiKey: ${!!result.apiKey}`);
    return result;
  } catch (error) {
    console.error(`[integrations] Error fetching credential by ID:`, error);
    return null;
  }
}

/**
 * Validate an auth token via Identity introspection endpoint
 */
export async function introspectToken(
  token: string
): Promise<{
  active: boolean;
  sub?: string;
  type?: string;
  orgId?: string;
  organizations?: Array<{ id: string; name?: string }>;
  isSuperAdmin?: boolean;
  entitlements?: string[];
} | null> {
  try {
    const url = `${IDENTITY_SERVICE_URL}/api/auth/introspect`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      return null;
    }

    return response.json() as Promise<{
      active: boolean;
      sub?: string;
      type?: string;
      orgId?: string;
      organizations?: Array<{ id: string; name?: string }>;
      isSuperAdmin?: boolean;
      entitlements?: string[];
    }>;
  } catch (error) {
    console.error(`[integrations] Error introspecting token:`, error);
    return null;
  }
}
