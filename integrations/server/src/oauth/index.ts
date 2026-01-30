/**
 * OAuth Integration Module
 *
 * Provides OAuth 2.0 authentication integration for external providers.
 * Handles the complete OAuth flow: authorization, callback, token storage.
 */

export { OAuthService } from "./oauth-service.js";
export type { OAuthStorage } from "./oauth-service.js";
export { createOAuthStorage } from "./storage.js";
export {
  initializeOAuthProviders,
  getOAuthProvider,
  getRegisteredOAuthProviders,
  getOAuthProviderNames,
  isOAuthProviderRegistered,
  registerOAuthProvider,
  OAuthProvider,
  BaseOAuthProvider,
  OAuthError,
} from "./providers/index.js";
export { replitProvider, ReplitOAuthProvider, replitConfig } from "./providers/replit.js";
