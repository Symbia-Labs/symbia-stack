/**
 * Google OAuth Provider
 *
 * Handles OAuth 2.0 authentication with Google.
 * Used for accessing Google APIs (Gmail, Drive, Calendar, Sheets, etc.)
 *
 * Google OAuth Documentation:
 * https://developers.google.com/identity/protocols/oauth2
 *
 * Scopes reference:
 * https://developers.google.com/identity/protocols/oauth2/scopes
 */

import type { OAuthProviderConfig, OAuthUserInfo } from "@shared/schema.js";
import { BaseOAuthProvider } from "./base.js";

/**
 * Google OAuth provider configuration
 */
export const googleConfig: OAuthProviderConfig = {
  provider: "google",
  displayName: "Google",
  description: "Sign in with Google to access Gmail, Drive, Calendar, and more",

  // OAuth endpoints
  authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  userinfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
  revokeUrl: "https://oauth2.googleapis.com/revoke",

  // OAuth settings
  defaultScopes: ["openid", "profile", "email"],
  scopeDelimiter: " ",
  responseType: "code",
  grantType: "authorization_code",
  pkceRequired: true, // Google recommends PKCE

  // Token settings
  supportsRefresh: true,
  tokenExpiresIn: 3600, // 1 hour default
};

/**
 * Google OAuth Provider Implementation
 */
export class GoogleOAuthProvider extends BaseOAuthProvider {
  readonly config = googleConfig;

  /**
   * Build authorization URL with Google-specific parameters
   */
  buildAuthorizationUrl(params: import("./base.js").BuildAuthorizationUrlParams): string {
    const url = new URL(this.config.authorizationUrl);

    url.searchParams.set("client_id", params.clientId);
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("response_type", this.config.responseType);
    url.searchParams.set("state", params.state);
    url.searchParams.set("scope", params.scopes.join(this.config.scopeDelimiter));

    // Google-specific: request offline access for refresh tokens
    url.searchParams.set("access_type", "offline");

    // Google-specific: force consent screen to ensure refresh token is returned
    // Only needed for first-time authorization or when scopes change
    url.searchParams.set("prompt", "consent");

    // Add PKCE parameters if provided
    if (params.codeChallenge) {
      url.searchParams.set("code_challenge", params.codeChallenge);
      url.searchParams.set("code_challenge_method", params.codeChallengeMethod || "S256");
    }

    return url.toString();
  }

  /**
   * Normalize Google's user info response
   *
   * Google's userinfo response:
   * {
   *   id: "123456789",
   *   email: "user@gmail.com",
   *   verified_email: true,
   *   name: "John Doe",
   *   given_name: "John",
   *   family_name: "Doe",
   *   picture: "https://lh3.googleusercontent.com/...",
   *   locale: "en"
   * }
   */
  protected normalizeUserInfo(data: Record<string, unknown>): OAuthUserInfo {
    return {
      id: String(data.id || data.sub || ""),
      email: data.email ? String(data.email) : undefined,
      name: data.name ? String(data.name) : undefined,
      username: data.email ? String(data.email).split("@")[0] : undefined,
      avatarUrl: data.picture ? String(data.picture) : undefined,
    };
  }
}

/**
 * Singleton instance of the Google OAuth provider
 */
export const googleProvider = new GoogleOAuthProvider();
