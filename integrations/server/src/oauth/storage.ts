/**
 * OAuth Storage Implementation
 *
 * Database layer for OAuth-related operations.
 * Implements the OAuthStorage interface used by OAuthService.
 */

import { eq, and, desc } from "drizzle-orm";
import crypto from "crypto";
import type { OAuthStorage } from "./oauth-service.js";
import {
  oauthProviderConfigs,
  oauthStates,
  oauthConnections,
  type OAuthState,
  type OAuthProviderConfigRecord,
  type OAuthConnectionRecord,
  type InsertOAuthState,
  type InsertOAuthConnection,
} from "@shared/schema.js";

// Encryption key for client secrets (use same key as Identity service)
const ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY ||
  process.env.JWT_SECRET ||
  process.env.SESSION_SECRET ||
  "dev-encryption-key-change-in-production";

/**
 * Encrypt a string using AES-256-GCM
 */
function encrypt(text: string): string {
  const key = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt a string encrypted with AES-256-GCM
 */
function decrypt(encryptedText: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedText.split(":");

  const key = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Create OAuth storage implementation
 */
export function createOAuthStorage(db: any): OAuthStorage {
  return {
    // =======================================================================
    // Provider Configs
    // =======================================================================

    async getProviderConfig(provider: string) {
      const results = await db
        .select()
        .from(oauthProviderConfigs)
        .where(eq(oauthProviderConfigs.provider, provider))
        .limit(1);

      if (results.length === 0) {
        // Check for environment-based config (for providers not in DB)
        return getEnvProviderConfig(provider);
      }

      const config = results[0] as OAuthProviderConfigRecord;

      return {
        provider: config.provider,
        clientId: config.clientId,
        clientSecret: decrypt(config.clientSecretEncrypted),
        displayName: config.displayName,
        description: config.description || undefined,
        iconUrl: config.iconUrl || undefined,
        isEnabled: config.isEnabled,
      };
    },

    async getAllProviderConfigs() {
      const results = await db
        .select()
        .from(oauthProviderConfigs)
        .where(eq(oauthProviderConfigs.isEnabled, true));

      const dbConfigs = results.map((config: OAuthProviderConfigRecord) => ({
        provider: config.provider,
        clientId: config.clientId,
        clientSecret: decrypt(config.clientSecretEncrypted),
        displayName: config.displayName,
        description: config.description || undefined,
        iconUrl: config.iconUrl || undefined,
        isEnabled: config.isEnabled,
      }));

      // Also check environment variables for providers not in DB
      const envConfigs = getEnvProviderConfigs();

      // Merge, preferring DB configs
      const configMap = new Map();
      for (const config of envConfigs) {
        configMap.set(config.provider, config);
      }
      for (const config of dbConfigs) {
        configMap.set(config.provider, config);
      }

      return Array.from(configMap.values());
    },

    // =======================================================================
    // OAuth States
    // =======================================================================

    async createOAuthState(state: Omit<InsertOAuthState, "id" | "createdAt">) {
      const results = await db
        .insert(oauthStates)
        .values({
          ...state,
          scopes: state.scopes || [],
        })
        .returning();

      return results[0] as OAuthState;
    },

    async getOAuthState(state: string) {
      const results = await db
        .select()
        .from(oauthStates)
        .where(eq(oauthStates.state, state))
        .limit(1);

      return results.length > 0 ? (results[0] as OAuthState) : null;
    },

    async deleteOAuthState(state: string) {
      await db
        .delete(oauthStates)
        .where(eq(oauthStates.state, state));
    },

    // =======================================================================
    // OAuth Connections
    // =======================================================================

    async createOAuthConnection(connection: Omit<InsertOAuthConnection, "id" | "createdAt" | "updatedAt">) {
      const results = await db
        .insert(oauthConnections)
        .values({
          ...connection,
          scopes: connection.scopes || [],
        })
        .returning();

      return results[0] as OAuthConnectionRecord;
    },

    async getOAuthConnectionById(id: string) {
      const results = await db
        .select()
        .from(oauthConnections)
        .where(eq(oauthConnections.id, id))
        .limit(1);

      return results.length > 0 ? (results[0] as OAuthConnectionRecord) : null;
    },

    async getOAuthConnections(userId: string, orgId: string | null) {
      const conditions = [eq(oauthConnections.userId, userId)];

      if (orgId) {
        conditions.push(eq(oauthConnections.orgId, orgId));
      }

      const results = await db
        .select()
        .from(oauthConnections)
        .where(and(...conditions))
        .orderBy(desc(oauthConnections.connectedAt));

      return results as OAuthConnectionRecord[];
    },

    async updateOAuthConnection(id: string, update: Partial<OAuthConnectionRecord>) {
      await db
        .update(oauthConnections)
        .set({
          ...update,
          updatedAt: new Date(),
        })
        .where(eq(oauthConnections.id, id));
    },
  };
}

/**
 * Get provider config from environment variables
 * Format: OAUTH_{PROVIDER}_CLIENT_ID, OAUTH_{PROVIDER}_CLIENT_SECRET
 */
function getEnvProviderConfig(provider: string): {
  provider: string;
  clientId: string;
  clientSecret: string;
  displayName: string;
  description?: string;
  iconUrl?: string;
  isEnabled: boolean;
} | null {
  const upperProvider = provider.toUpperCase();
  const clientId = process.env[`OAUTH_${upperProvider}_CLIENT_ID`] ||
                   process.env[`${upperProvider}_CLIENT_ID`];
  const clientSecret = process.env[`OAUTH_${upperProvider}_CLIENT_SECRET`] ||
                       process.env[`${upperProvider}_CLIENT_SECRET`];

  if (!clientId || !clientSecret) {
    return null;
  }

  const displayNames: Record<string, string> = {
    replit: "Replit",
    github: "GitHub",
    google: "Google",
    microsoft: "Microsoft",
  };

  return {
    provider,
    clientId,
    clientSecret,
    displayName: displayNames[provider.toLowerCase()] || provider,
    isEnabled: true,
  };
}

/**
 * Get all provider configs from environment variables
 */
function getEnvProviderConfigs(): Array<{
  provider: string;
  clientId: string;
  clientSecret: string;
  displayName: string;
  description?: string;
  iconUrl?: string;
  isEnabled: boolean;
}> {
  const configs: ReturnType<typeof getEnvProviderConfig>[] = [];

  // Check for known OAuth providers
  const knownProviders = ["replit", "github", "google", "microsoft"];

  for (const provider of knownProviders) {
    const config = getEnvProviderConfig(provider);
    if (config) {
      configs.push(config);
    }
  }

  return configs.filter((c): c is NonNullable<typeof c> => c !== null);
}

// Type for OAuth connection record (matching database schema)
type OAuthConnectionRecord = {
  id: string;
  userId: string;
  orgId: string | null;
  provider: string;
  oauthUserId: string | null;
  oauthUserEmail: string | null;
  oauthUserName: string | null;
  oauthAvatarUrl: string | null;
  credentialId: string | null;
  scopes: string[] | null;
  status: string;
  expiresAt: Date | null;
  connectedAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
