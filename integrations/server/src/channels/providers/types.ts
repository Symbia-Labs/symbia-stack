/**
 * Channel Provider Types
 *
 * Defines the interface that all channel providers must implement.
 * Providers handle platform-specific logic for connecting, sending,
 * and receiving messages from external messaging platforms.
 */

import type {
  ChannelType,
  ChannelConnectionMode,
  ChannelConfig,
  ChannelCapabilities,
  ChannelFormatting,
  ChannelInboundMessage,
  ChannelOutboundMessage,
  ChannelConnectionStatus,
} from "@shared/schema.js";

/**
 * Connection context passed to provider methods
 */
export interface ChannelConnectionContext {
  connectionId: string;
  userId: string;
  orgId?: string;
  credentialId?: string;
  authToken?: string;
}

/**
 * Result of initiating a connection
 */
export interface ConnectionInitResult {
  success: boolean;
  status: ChannelConnectionStatus;

  // For QR-link mode
  qrCode?: string;
  qrExpiresAt?: Date;

  // For OAuth mode
  authUrl?: string;
  state?: string;

  // For webhook mode
  webhookUrl?: string;
  webhookSecret?: string;

  // Error info
  error?: string;

  // Platform-specific data
  metadata?: Record<string, unknown>;
}

/**
 * Result of checking connection status
 */
export interface ConnectionStatusResult {
  status: ChannelConnectionStatus;
  channelAccountId?: string;
  channelAccountName?: string;
  lastPingAt?: Date;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Result of sending a message
 */
export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  timestamp?: Date;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Webhook verification result
 */
export interface WebhookVerifyResult {
  valid: boolean;
  challenge?: string; // Some platforms require echoing a challenge
  error?: string;
}

/**
 * Parsed webhook payload
 */
export interface ParsedWebhook {
  type: "message" | "status" | "delivery" | "read" | "typing" | "unknown";
  message?: ChannelInboundMessage;
  statusUpdate?: {
    connectionId?: string;
    newStatus?: ChannelConnectionStatus;
    reason?: string;
  };
  raw: unknown;
}

/**
 * Channel Provider Interface
 *
 * All channel providers must implement this interface to be registered
 * with the channel system.
 */
export interface ChannelProvider {
  /**
   * Channel type identifier
   */
  readonly type: ChannelType;

  /**
   * Human-readable name
   */
  readonly name: string;

  /**
   * Connection mode (webhook, qr-link, oauth, local)
   */
  readonly connectionMode: ChannelConnectionMode;

  /**
   * Channel capabilities
   */
  readonly capabilities: ChannelCapabilities;

  /**
   * Message formatting constraints
   */
  readonly formatting: ChannelFormatting;

  /**
   * Initialize a new connection to the platform.
   * For webhook mode: sets up webhook URL
   * For QR-link mode: generates QR code for scanning
   * For OAuth mode: returns authorization URL
   */
  initConnection(
    ctx: ChannelConnectionContext,
    credential: string,
    config?: Record<string, unknown>
  ): Promise<ConnectionInitResult>;

  /**
   * Check the current status of a connection
   */
  getStatus(
    ctx: ChannelConnectionContext,
    sessionData?: Record<string, unknown>
  ): Promise<ConnectionStatusResult>;

  /**
   * Disconnect from the platform
   */
  disconnect(
    ctx: ChannelConnectionContext,
    sessionData?: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string }>;

  /**
   * Send a message to the platform
   */
  sendMessage(
    ctx: ChannelConnectionContext,
    message: ChannelOutboundMessage,
    credential: string,
    sessionData?: Record<string, unknown>
  ): Promise<SendMessageResult>;

  /**
   * Verify an incoming webhook request.
   * Returns challenge response if platform requires it.
   */
  verifyWebhook(
    headers: Record<string, string>,
    body: unknown,
    secret?: string
  ): WebhookVerifyResult;

  /**
   * Parse an incoming webhook payload into a normalized message
   */
  parseWebhook(
    headers: Record<string, string>,
    body: unknown
  ): ParsedWebhook;

  /**
   * Format a message for the platform (apply platform-specific formatting)
   */
  formatMessage(text: string, options?: {
    parseMode?: "plain" | "markdown" | "html";
    truncate?: boolean;
  }): string;

  /**
   * Get default configuration for this channel type
   */
  getDefaultConfig(): Partial<ChannelConfig>;
}

/**
 * Provider registration entry
 */
export interface ChannelProviderEntry {
  provider: ChannelProvider;
  enabled: boolean;
}

/**
 * Channel provider registry
 */
export class ChannelProviderRegistry {
  private providers = new Map<ChannelType, ChannelProviderEntry>();

  register(provider: ChannelProvider, enabled = true): void {
    this.providers.set(provider.type, { provider, enabled });
    console.log(`[channels] Registered provider: ${provider.type} (${provider.name})`);
  }

  get(type: ChannelType): ChannelProvider | undefined {
    const entry = this.providers.get(type);
    return entry?.enabled ? entry.provider : undefined;
  }

  getAll(): ChannelProvider[] {
    return Array.from(this.providers.values())
      .filter(e => e.enabled)
      .map(e => e.provider);
  }

  isRegistered(type: ChannelType): boolean {
    return this.providers.has(type) && this.providers.get(type)!.enabled;
  }

  setEnabled(type: ChannelType, enabled: boolean): void {
    const entry = this.providers.get(type);
    if (entry) {
      entry.enabled = enabled;
    }
  }
}

// Global provider registry instance
export const channelProviders = new ChannelProviderRegistry();
