/**
 * Replit OAuth Provider
 *
 * Handles OAuth 2.0 authentication with Replit.
 * Used for "Login with Replit" functionality.
 *
 * Replit OAuth Documentation:
 * https://docs.replit.com/hosting/authenticating-users-repl-auth
 *
 * Note: Replit uses a simplified auth flow. Update endpoints as needed
 * based on their current OAuth implementation.
 */

import type { OAuthProviderConfig, OAuthUserInfo } from "../../../shared/schema.js";
import { BaseOAuthProvider, OAuthError } from "./base.js";

/**
 * Replit OAuth provider configuration
 */
export const replitConfig: OAuthProviderConfig = {
  provider: "replit",
  displayName: "Replit",
  description: "Authenticate with your Replit account",

  // OAuth endpoints
  // Note: These are standard OAuth 2.0 endpoints. Replit may use different URLs.
  // Update these based on Replit's OAuth documentation.
  authorizationUrl: "https://replit.com/oauth2/authorize",
  tokenUrl: "https://replit.com/oauth2/token",
  userinfoUrl: "https://replit.com/api/v1/users/current",
  revokeUrl: "https://replit.com/oauth2/revoke",

  // OAuth settings
  defaultScopes: ["identity"], // Basic identity scope for authentication
  scopeDelimiter: " ",
  responseType: "code",
  grantType: "authorization_code",
  pkceRequired: false,

  // Token settings
  supportsRefresh: true,
  tokenExpiresIn: 3600, // 1 hour default if not specified in response
};

/**
 * Replit OAuth Provider Implementation
 */
export class ReplitOAuthProvider extends BaseOAuthProvider {
  readonly config = replitConfig;

  /**
   * Normalize Replit's user info response
   *
   * Replit's user object structure (may vary):
   * {
   *   id: number,
   *   username: string,
   *   email?: string,
   *   firstName?: string,
   *   lastName?: string,
   *   profileImage?: string,
   *   ...
   * }
   */
  protected normalizeUserInfo(data: Record<string, unknown>): OAuthUserInfo {
    // Handle Replit's specific user info format
    const id = data.id ? String(data.id) : "";
    const username = data.username ? String(data.username) : undefined;
    const email = data.email ? String(data.email) : undefined;

    // Construct display name from available fields
    let name: string | undefined;
    if (data.firstName || data.lastName) {
      const parts = [data.firstName, data.lastName].filter(Boolean);
      name = parts.join(" ");
    } else if (data.name) {
      name = String(data.name);
    } else if (username) {
      name = username;
    }

    // Get avatar URL
    let avatarUrl: string | undefined;
    if (data.profileImage) {
      avatarUrl = String(data.profileImage);
    } else if (data.avatar_url) {
      avatarUrl = String(data.avatar_url);
    } else if (data.image) {
      avatarUrl = String(data.image);
    }

    return {
      id,
      email,
      name,
      username,
      avatarUrl,
    };
  }

  /**
   * Get Replit user info with custom handling
   */
  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    if (!this.config.userinfoUrl) {
      throw new OAuthError(
        "Replit user info URL not configured",
        "userinfo_not_configured"
      );
    }

    const response = await fetch(this.config.userinfoUrl, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json",
        "User-Agent": "Symbia-Stack/1.0",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new OAuthError(
        `Replit user info request failed: ${response.status} ${response.statusText}`,
        "userinfo_failed",
        errorText
      );
    }

    const data = await response.json() as Record<string, unknown>;
    return this.normalizeUserInfo(data);
  }
}

/**
 * Singleton instance of the Replit OAuth provider
 */
export const replitProvider = new ReplitOAuthProvider();
