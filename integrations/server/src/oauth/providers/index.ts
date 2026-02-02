/**
 * OAuth Provider Registry
 *
 * Central registry for OAuth provider implementations.
 * Providers are registered at startup and looked up by name.
 */

import type { OAuthProvider } from "./base.js";
import { replitProvider } from "./replit.js";

/**
 * Registry of available OAuth providers
 */
const providerRegistry = new Map<string, OAuthProvider>();

/**
 * Register an OAuth provider
 */
export function registerOAuthProvider(provider: OAuthProvider): void {
  const name = provider.config.provider.toLowerCase();
  if (providerRegistry.has(name)) {
    console.warn(`[oauth] Provider "${name}" is being re-registered`);
  }
  providerRegistry.set(name, provider);
}

/**
 * Get an OAuth provider by name
 */
export function getOAuthProvider(name: string): OAuthProvider | undefined {
  return providerRegistry.get(name.toLowerCase());
}

/**
 * Get all registered OAuth providers
 */
export function getRegisteredOAuthProviders(): OAuthProvider[] {
  return Array.from(providerRegistry.values());
}

/**
 * Get list of registered provider names
 */
export function getOAuthProviderNames(): string[] {
  return Array.from(providerRegistry.keys());
}

/**
 * Check if a provider is registered
 */
export function isOAuthProviderRegistered(name: string): boolean {
  return providerRegistry.has(name.toLowerCase());
}

/**
 * Initialize all built-in OAuth providers
 */
export function initializeOAuthProviders(): void {
  // Register built-in providers
  registerOAuthProvider(replitProvider);

  console.log(`[oauth] Registered providers: ${getOAuthProviderNames().join(", ")}`);
}

// Re-export provider classes and types
export type { OAuthProvider } from "./base.js";
export { BaseOAuthProvider, OAuthError } from "./base.js";
export { replitProvider, ReplitOAuthProvider } from "./replit.js";
