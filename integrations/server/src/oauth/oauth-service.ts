/**
 * OAuth Service
 *
 * Orchestrates the OAuth 2.0 authorization flow:
 * 1. Generate authorization URLs with CSRF state tokens
 * 2. Handle callbacks (validate state, exchange code for tokens)
 * 3. Store tokens in Identity service
 * 4. Manage OAuth connections
 */

import crypto from "crypto";
import { resolveServiceUrl, ServiceId } from "@symbia/sys";
import { getOAuthProvider, type OAuthProvider, OAuthError } from "./providers/index.js";
import type {
  OAuthAuthorizeRequest,
  OAuthAuthorizeResponse,
  OAuthConnection,
  OAuthState,
  InsertOAuthState,
  InsertOAuthConnection,
} from "../../shared/schema.js";

const IDENTITY_SERVICE_URL = resolveServiceUrl(ServiceId.IDENTITY);

// OAuth state TTL (10 minutes)
const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * OAuth Service class
 */
export class OAuthService {
  private storage: OAuthStorage;

  constructor(storage: OAuthStorage) {
    this.storage = storage;
  }

  /**
   * Generate authorization URL for initiating OAuth flow
   */
  async authorize(
    request: OAuthAuthorizeRequest,
    userId: string,
    orgId: string | null
  ): Promise<OAuthAuthorizeResponse> {
    const provider = getOAuthProvider(request.provider);
    if (!provider) {
      throw new OAuthError(
        `Unknown OAuth provider: ${request.provider}`,
        "unknown_provider"
      );
    }

    // Get provider config (client credentials)
    const providerConfig = await this.storage.getProviderConfig(request.provider);
    if (!providerConfig) {
      throw new OAuthError(
        `OAuth provider "${request.provider}" is not configured`,
        "provider_not_configured"
      );
    }

    if (!providerConfig.isEnabled) {
      throw new OAuthError(
        `OAuth provider "${request.provider}" is disabled`,
        "provider_disabled"
      );
    }

    // Generate cryptographically secure state token
    const state = crypto.randomBytes(32).toString("hex");

    // Determine redirect URI
    const callbackUrl = this.getCallbackUrl();
    const redirectUri = request.redirectUri || callbackUrl;

    // Determine scopes
    const scopes = request.scopes?.length
      ? request.scopes
      : provider.config.defaultScopes;

    // Generate PKCE if required
    let pkceVerifier: string | undefined;
    let pkceChallenge: string | undefined;
    if (provider.config.pkceRequired) {
      pkceVerifier = crypto.randomBytes(32).toString("base64url");
      pkceChallenge = crypto
        .createHash("sha256")
        .update(pkceVerifier)
        .digest("base64url");
    }

    // Store state for validation during callback
    const expiresAt = new Date(Date.now() + STATE_TTL_MS);
    await this.storage.createOAuthState({
      state,
      userId,
      orgId: orgId || undefined,
      provider: request.provider,
      redirectUri,
      scopes,
      pkceVerifier,
      pkceChallenge,
      clientState: request.state,
      expiresAt,
    });

    // Build authorization URL
    const authorizationUrl = provider.buildAuthorizationUrl({
      clientId: providerConfig.clientId,
      redirectUri: callbackUrl, // Always use our callback URL
      state,
      scopes,
      codeChallenge: pkceChallenge,
      codeChallengeMethod: pkceChallenge ? "S256" : undefined,
    });

    return {
      authorizationUrl,
      state,
      provider: request.provider,
    };
  }

  /**
   * Handle OAuth callback - validate state, exchange code, store tokens
   */
  async handleCallback(
    code: string,
    state: string
  ): Promise<{
    connection: OAuthConnection;
    redirectUri: string;
    clientState?: string;
  }> {
    // Validate and retrieve state
    const oauthState = await this.storage.getOAuthState(state);
    if (!oauthState) {
      throw new OAuthError(
        "Invalid or expired OAuth state",
        "invalid_state"
      );
    }

    // Check expiration
    if (new Date(oauthState.expiresAt) < new Date()) {
      await this.storage.deleteOAuthState(state);
      throw new OAuthError(
        "OAuth state has expired",
        "state_expired"
      );
    }

    // Get provider
    const provider = getOAuthProvider(oauthState.provider);
    if (!provider) {
      throw new OAuthError(
        `Unknown OAuth provider: ${oauthState.provider}`,
        "unknown_provider"
      );
    }

    // Get provider config
    const providerConfig = await this.storage.getProviderConfig(oauthState.provider);
    if (!providerConfig) {
      throw new OAuthError(
        `OAuth provider not configured: ${oauthState.provider}`,
        "provider_not_configured"
      );
    }

    // Exchange code for tokens
    const callbackUrl = this.getCallbackUrl();
    const tokens = await provider.exchangeCode({
      code,
      clientId: providerConfig.clientId,
      clientSecret: providerConfig.clientSecret,
      redirectUri: callbackUrl,
      codeVerifier: oauthState.pkceVerifier || undefined,
    });

    // Get user info if supported
    let userInfo = null;
    if (provider.getUserInfo) {
      try {
        userInfo = await provider.getUserInfo(tokens.accessToken);
      } catch (error) {
        console.warn(`[oauth] Failed to get user info from ${oauthState.provider}:`, error);
      }
    }

    // Calculate expiration
    const expiresAt = tokens.expiresIn
      ? new Date(Date.now() + tokens.expiresIn * 1000)
      : undefined;

    // Store tokens in Identity service
    const credentialId = await this.storeTokenInIdentity(
      oauthState.userId,
      oauthState.orgId || null,
      oauthState.provider,
      tokens.accessToken,
      tokens.refreshToken,
      expiresAt,
      userInfo
    );

    // Create OAuth connection record
    const connection = await this.storage.createOAuthConnection({
      userId: oauthState.userId,
      orgId: oauthState.orgId,
      provider: oauthState.provider,
      oauthUserId: userInfo?.id,
      oauthUserEmail: userInfo?.email,
      oauthUserName: userInfo?.name || userInfo?.username,
      oauthAvatarUrl: userInfo?.avatarUrl,
      credentialId,
      scopes: oauthState.scopes || [],
      status: "active",
      expiresAt,
      connectedAt: new Date(),
    });

    // Clean up state
    await this.storage.deleteOAuthState(state);

    const connectionResponse: OAuthConnection = {
      id: connection.id,
      provider: connection.provider,
      displayName: providerConfig.displayName,
      connectedAt: connection.connectedAt.toISOString(),
      expiresAt: connection.expiresAt?.toISOString(),
      scopes: connection.scopes || [],
      status: connection.status as "active" | "expired" | "revoked",
      oauthUserId: connection.oauthUserId || undefined,
      oauthUserEmail: connection.oauthUserEmail || undefined,
      oauthUserName: connection.oauthUserName || undefined,
    };

    return {
      connection: connectionResponse,
      redirectUri: oauthState.redirectUri,
      clientState: oauthState.clientState || undefined,
    };
  }

  /**
   * Get list of OAuth connections for a user
   */
  async getConnections(userId: string, orgId: string | null): Promise<OAuthConnection[]> {
    const connections = await this.storage.getOAuthConnections(userId, orgId);

    return Promise.all(
      connections.map(async (conn) => {
        const providerConfig = await this.storage.getProviderConfig(conn.provider);
        return {
          id: conn.id,
          provider: conn.provider,
          displayName: providerConfig?.displayName || conn.provider,
          connectedAt: conn.connectedAt.toISOString(),
          expiresAt: conn.expiresAt?.toISOString(),
          scopes: conn.scopes || [],
          status: conn.status as "active" | "expired" | "revoked",
          oauthUserId: conn.oauthUserId || undefined,
          oauthUserEmail: conn.oauthUserEmail || undefined,
          oauthUserName: conn.oauthUserName || undefined,
        };
      })
    );
  }

  /**
   * Revoke an OAuth connection
   */
  async revokeConnection(connectionId: string, userId: string): Promise<void> {
    const connection = await this.storage.getOAuthConnectionById(connectionId);
    if (!connection) {
      throw new OAuthError(
        "Connection not found",
        "connection_not_found"
      );
    }

    if (connection.userId !== userId) {
      throw new OAuthError(
        "Not authorized to revoke this connection",
        "not_authorized"
      );
    }

    // Try to revoke token at provider (best effort)
    const provider = getOAuthProvider(connection.provider);
    const providerConfig = await this.storage.getProviderConfig(connection.provider);

    if (provider?.revokeToken && providerConfig && connection.credentialId) {
      try {
        // Get the token from Identity
        const credential = await this.getCredentialFromIdentity(connection.credentialId);
        if (credential?.apiKey) {
          await provider.revokeToken({
            token: credential.apiKey,
            clientId: providerConfig.clientId,
            clientSecret: providerConfig.clientSecret,
          });
        }
      } catch (error) {
        console.warn(`[oauth] Failed to revoke token at provider:`, error);
        // Continue with local revocation even if provider revocation fails
      }
    }

    // Delete credential from Identity
    if (connection.credentialId) {
      await this.deleteCredentialFromIdentity(connection.credentialId, userId);
    }

    // Update connection status
    await this.storage.updateOAuthConnection(connectionId, {
      status: "revoked",
      revokedAt: new Date(),
    });
  }

  /**
   * Get available OAuth providers
   */
  async getAvailableProviders(userId: string): Promise<Array<{
    provider: string;
    displayName: string;
    description?: string;
    iconUrl?: string;
    connected: boolean;
    connectionId?: string;
  }>> {
    const configs = await this.storage.getAllProviderConfigs();
    const connections = await this.storage.getOAuthConnections(userId, null);

    return configs
      .filter((config) => config.isEnabled)
      .map((config) => {
        const connection = connections.find(
          (c) => c.provider === config.provider && c.status === "active"
        );
        return {
          provider: config.provider,
          displayName: config.displayName,
          description: config.description || undefined,
          iconUrl: config.iconUrl || undefined,
          connected: !!connection,
          connectionId: connection?.id,
        };
      });
  }

  /**
   * Get callback URL for OAuth redirects
   */
  private getCallbackUrl(): string {
    const baseUrl = process.env.OAUTH_CALLBACK_BASE_URL ||
      process.env.INTEGRATIONS_SERVICE_URL ||
      `http://localhost:${process.env.PORT || 5007}`;
    return `${baseUrl}/api/oauth/callback`;
  }

  /**
   * Store OAuth token in Identity service
   */
  private async storeTokenInIdentity(
    userId: string,
    orgId: string | null,
    provider: string,
    accessToken: string,
    refreshToken: string | undefined,
    expiresAt: Date | undefined,
    userInfo: { id?: string; email?: string; name?: string; username?: string } | null
  ): Promise<string> {
    const url = `${IDENTITY_SERVICE_URL}/api/internal/credentials/oauth`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Id": "integrations",
      },
      body: JSON.stringify({
        userId,
        orgId,
        provider,
        accessToken,
        refreshToken,
        expiresAt: expiresAt?.toISOString(),
        oauthUserId: userInfo?.id,
        oauthUserEmail: userInfo?.email,
        oauthUserName: userInfo?.name || userInfo?.username,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new OAuthError(
        `Failed to store OAuth token: ${response.statusText}`,
        "token_storage_failed",
        error
      );
    }

    const result = await response.json() as { credentialId: string };
    return result.credentialId;
  }

  /**
   * Get credential from Identity service by ID
   */
  private async getCredentialFromIdentity(
    credentialId: string
  ): Promise<{ apiKey: string } | null> {
    const url = `${IDENTITY_SERVICE_URL}/api/internal/credentials/by-id/${credentialId}`;

    const response = await fetch(url, {
      headers: {
        "X-Service-Id": "integrations",
      },
    });

    if (!response.ok) {
      return null;
    }

    return response.json() as Promise<{ apiKey: string }>;
  }

  /**
   * Delete credential from Identity service
   */
  private async deleteCredentialFromIdentity(
    credentialId: string,
    userId: string
  ): Promise<void> {
    const url = `${IDENTITY_SERVICE_URL}/api/internal/credentials/${credentialId}`;

    await fetch(url, {
      method: "DELETE",
      headers: {
        "X-Service-Id": "integrations",
        "X-User-Id": userId,
      },
    });
  }
}

/**
 * Storage interface for OAuth data
 * Implementations should use the database tables defined in schema.ts
 */
export interface OAuthStorage {
  // Provider configs
  getProviderConfig(provider: string): Promise<{
    provider: string;
    clientId: string;
    clientSecret: string;
    displayName: string;
    description?: string;
    iconUrl?: string;
    isEnabled: boolean;
  } | null>;
  getAllProviderConfigs(): Promise<Array<{
    provider: string;
    clientId: string;
    clientSecret: string;
    displayName: string;
    description?: string;
    iconUrl?: string;
    isEnabled: boolean;
  }>>;

  // OAuth states
  createOAuthState(state: Omit<InsertOAuthState, "id" | "createdAt">): Promise<OAuthState>;
  getOAuthState(state: string): Promise<OAuthState | null>;
  deleteOAuthState(state: string): Promise<void>;

  // OAuth connections
  createOAuthConnection(connection: Omit<InsertOAuthConnection, "id" | "createdAt" | "updatedAt">): Promise<OAuthConnectionRecord>;
  getOAuthConnectionById(id: string): Promise<OAuthConnectionRecord | null>;
  getOAuthConnections(userId: string, orgId: string | null): Promise<OAuthConnectionRecord[]>;
  updateOAuthConnection(id: string, update: Partial<OAuthConnectionRecord>): Promise<void>;
}

// Type alias for database records
type OAuthConnectionRecord = {
  id: string;
  userId: string;
  orgId?: string | null;
  provider: string;
  oauthUserId?: string | null;
  oauthUserEmail?: string | null;
  oauthUserName?: string | null;
  oauthAvatarUrl?: string | null;
  credentialId?: string | null;
  scopes: string[] | null;
  status: string;
  expiresAt?: Date | null;
  connectedAt: Date;
  lastUsedAt?: Date | null;
  revokedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
