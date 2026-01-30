/**
 * OAuth Provider Base Interface
 *
 * Defines the contract for OAuth provider implementations.
 * Each provider (Replit, GitHub, Google, etc.) implements this interface.
 */

import type { OAuthProviderConfig, OAuthTokenResponse, OAuthUserInfo } from "@shared/schema.js";

/**
 * Parameters for building the authorization URL
 */
export interface BuildAuthorizationUrlParams {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes: string[];
  codeChallenge?: string; // For PKCE
  codeChallengeMethod?: "S256" | "plain";
}

/**
 * Parameters for exchanging authorization code for tokens
 */
export interface ExchangeCodeParams {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  codeVerifier?: string; // For PKCE
}

/**
 * Parameters for refreshing an access token
 */
export interface RefreshTokenParams {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}

/**
 * Parameters for revoking a token
 */
export interface RevokeTokenParams {
  token: string;
  clientId: string;
  clientSecret: string;
  tokenTypeHint?: "access_token" | "refresh_token";
}

/**
 * OAuth Provider Interface
 *
 * Each OAuth provider must implement this interface to handle
 * provider-specific authentication flows.
 */
export interface OAuthProvider {
  /**
   * Provider configuration
   */
  readonly config: OAuthProviderConfig;

  /**
   * Build the authorization URL for the OAuth flow
   */
  buildAuthorizationUrl(params: BuildAuthorizationUrlParams): string;

  /**
   * Exchange authorization code for access and refresh tokens
   */
  exchangeCode(params: ExchangeCodeParams): Promise<OAuthTokenResponse>;

  /**
   * Refresh an expired access token using a refresh token
   */
  refreshToken(params: RefreshTokenParams): Promise<OAuthTokenResponse>;

  /**
   * Get user information using the access token (optional)
   */
  getUserInfo?(accessToken: string): Promise<OAuthUserInfo>;

  /**
   * Revoke a token (optional)
   */
  revokeToken?(params: RevokeTokenParams): Promise<void>;
}

/**
 * Base OAuth Provider Implementation
 *
 * Provides common functionality for OAuth providers.
 * Specific providers can extend this class.
 */
export abstract class BaseOAuthProvider implements OAuthProvider {
  abstract readonly config: OAuthProviderConfig;

  /**
   * Build the authorization URL with standard OAuth 2.0 parameters
   */
  buildAuthorizationUrl(params: BuildAuthorizationUrlParams): string {
    const url = new URL(this.config.authorizationUrl);

    url.searchParams.set("client_id", params.clientId);
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("response_type", this.config.responseType);
    url.searchParams.set("state", params.state);
    url.searchParams.set("scope", params.scopes.join(this.config.scopeDelimiter));

    // Add PKCE parameters if provided
    if (params.codeChallenge) {
      url.searchParams.set("code_challenge", params.codeChallenge);
      url.searchParams.set("code_challenge_method", params.codeChallengeMethod || "S256");
    }

    return url.toString();
  }

  /**
   * Exchange authorization code for tokens using standard OAuth 2.0 token endpoint
   */
  async exchangeCode(params: ExchangeCodeParams): Promise<OAuthTokenResponse> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
    });

    // Add PKCE verifier if provided
    if (params.codeVerifier) {
      body.set("code_verifier", params.codeVerifier);
    }

    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new OAuthError(
        `Token exchange failed: ${response.status} ${response.statusText}`,
        "token_exchange_failed",
        errorText
      );
    }

    const data = await response.json() as Record<string, unknown>;
    return this.normalizeTokenResponse(data);
  }

  /**
   * Refresh access token using standard OAuth 2.0 refresh flow
   */
  async refreshToken(params: RefreshTokenParams): Promise<OAuthTokenResponse> {
    if (!this.config.supportsRefresh) {
      throw new OAuthError(
        "This provider does not support token refresh",
        "refresh_not_supported"
      );
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: params.refreshToken,
      client_id: params.clientId,
      client_secret: params.clientSecret,
    });

    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new OAuthError(
        `Token refresh failed: ${response.status} ${response.statusText}`,
        "token_refresh_failed",
        errorText
      );
    }

    const data = await response.json() as Record<string, unknown>;
    return this.normalizeTokenResponse(data);
  }

  /**
   * Get user info - must be implemented by subclasses if userinfoUrl is set
   */
  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    if (!this.config.userinfoUrl) {
      throw new OAuthError(
        "This provider does not support user info endpoint",
        "userinfo_not_supported"
      );
    }

    const response = await fetch(this.config.userinfoUrl, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new OAuthError(
        `User info request failed: ${response.status} ${response.statusText}`,
        "userinfo_failed",
        errorText
      );
    }

    const data = await response.json() as Record<string, unknown>;
    return this.normalizeUserInfo(data);
  }

  /**
   * Revoke a token - default implementation using RFC 7009
   */
  async revokeToken(params: RevokeTokenParams): Promise<void> {
    if (!this.config.revokeUrl) {
      throw new OAuthError(
        "This provider does not support token revocation",
        "revoke_not_supported"
      );
    }

    const body = new URLSearchParams({
      token: params.token,
      client_id: params.clientId,
      client_secret: params.clientSecret,
    });

    if (params.tokenTypeHint) {
      body.set("token_type_hint", params.tokenTypeHint);
    }

    const response = await fetch(this.config.revokeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    // RFC 7009: Revocation endpoint should return 200 even if token was already revoked
    if (!response.ok && response.status !== 200) {
      const errorText = await response.text();
      throw new OAuthError(
        `Token revocation failed: ${response.status} ${response.statusText}`,
        "revoke_failed",
        errorText
      );
    }
  }

  /**
   * Normalize token response from provider-specific format to standard format
   * Override in subclasses if provider uses non-standard response format
   */
  protected normalizeTokenResponse(data: Record<string, unknown>): OAuthTokenResponse {
    return {
      accessToken: String(data.access_token || data.accessToken || ""),
      refreshToken: data.refresh_token || data.refreshToken
        ? String(data.refresh_token || data.refreshToken)
        : undefined,
      expiresIn: typeof data.expires_in === "number"
        ? data.expires_in
        : typeof data.expiresIn === "number"
          ? data.expiresIn
          : this.config.tokenExpiresIn,
      tokenType: String(data.token_type || data.tokenType || "Bearer"),
      scope: data.scope ? String(data.scope) : undefined,
    };
  }

  /**
   * Normalize user info response from provider-specific format
   * Override in subclasses for provider-specific user info formats
   */
  protected normalizeUserInfo(data: Record<string, unknown>): OAuthUserInfo {
    return {
      id: String(data.id || data.sub || data.user_id || ""),
      email: data.email ? String(data.email) : undefined,
      name: data.name ? String(data.name) : undefined,
      username: data.username || data.login ? String(data.username || data.login) : undefined,
      avatarUrl: data.avatar_url || data.picture ? String(data.avatar_url || data.picture) : undefined,
    };
  }
}

/**
 * OAuth-specific error class
 */
export class OAuthError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: string
  ) {
    super(message);
    this.name = "OAuthError";
  }
}
