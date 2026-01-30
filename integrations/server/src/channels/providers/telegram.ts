/**
 * Telegram Channel Provider
 *
 * Implements the ChannelProvider interface for Telegram Bot API.
 * Supports both webhook and polling modes for receiving messages.
 *
 * Polling mode is useful for local development without a public URL.
 */

import type {
  ChannelType,
  ChannelConnectionMode,
  ChannelCapabilities,
  ChannelFormatting,
  ChannelConfig,
  ChannelOutboundMessage,
  ChannelInboundMessage,
  ChannelConnectionStatus,
} from "@shared/schema.js";
import type {
  ChannelProvider,
  ChannelConnectionContext,
  ConnectionInitResult,
  ConnectionStatusResult,
  SendMessageResult,
  WebhookVerifyResult,
  ParsedWebhook,
} from "./types.js";
import { createHmac, randomUUID } from "crypto";
import { handleInboundMessage } from "../index.js";

const TELEGRAM_API_BASE = "https://api.telegram.org";
const POLLING_INTERVAL_MS = 1000; // How often to poll when no updates
const POLLING_TIMEOUT_S = 30; // Long-polling timeout

/**
 * Active polling loops for connections in polling mode
 */
const activePollers = new Map<string, {
  running: boolean;
  offset: number;
  stop: () => void;
}>();

/**
 * Telegram Bot API response types
 */
interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
  reply_to_message?: TelegramMessage;
  photo?: Array<{ file_id: string; width: number; height: number }>;
  document?: { file_id: string; file_name?: string; mime_type?: string };
  audio?: { file_id: string; duration: number; mime_type?: string };
  video?: { file_id: string; duration: number; width: number; height: number };
  voice?: { file_id: string; duration: number };
  sticker?: { file_id: string; emoji?: string };
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
}

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

/**
 * Telegram Channel Provider Implementation
 */
export class TelegramProvider implements ChannelProvider {
  readonly type: ChannelType = "telegram";
  readonly name = "Telegram";
  readonly connectionMode: ChannelConnectionMode = "webhook";

  readonly capabilities: ChannelCapabilities = {
    directMessages: true,
    groupChats: true,
    threads: false, // Telegram has reply threads but not true threading
    reactions: true,
    fileAttachments: true,
    voiceMessages: true,
    edits: true,
    deletions: true,
    typing: true,
    readReceipts: false,
  };

  readonly formatting: ChannelFormatting = {
    maxLength: 4096,
    supportsMarkdown: true,
    supportsHtml: true,
    supportsMentions: true,
    supportsEmoji: true,
  };

  /**
   * Call Telegram Bot API
   */
  private async callApi<T>(
    botToken: string,
    method: string,
    params?: Record<string, unknown>
  ): Promise<TelegramResponse<T>> {
    const url = `${TELEGRAM_API_BASE}/bot${botToken}/${method}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: params ? JSON.stringify(params) : undefined,
    });

    return response.json() as Promise<TelegramResponse<T>>;
  }

  async initConnection(
    ctx: ChannelConnectionContext,
    credential: string,
    config?: Record<string, unknown>
  ): Promise<ConnectionInitResult> {
    try {
      // Verify bot token by calling getMe
      const meResponse = await this.callApi<TelegramUser>(credential, "getMe");

      if (!meResponse.ok || !meResponse.result) {
        return {
          success: false,
          status: "error",
          error: meResponse.description || "Invalid bot token",
        };
      }

      const bot = meResponse.result;
      const usePolling = config?.usePolling === true ||
        process.env.TELEGRAM_USE_POLLING === "true";

      if (usePolling) {
        // Polling mode - no webhook needed, start background polling
        console.log(`[telegram] Using polling mode for connection ${ctx.connectionId}`);

        // Delete any existing webhook first
        await this.callApi<boolean>(credential, "deleteWebhook", {
          drop_pending_updates: config?.dropPendingUpdates ?? false,
        });

        // Start polling loop
        this.startPolling(ctx.connectionId, credential);

        return {
          success: true,
          status: "connected",
          metadata: {
            botId: bot.id,
            botUsername: bot.username,
            botName: `${bot.first_name}${bot.last_name ? ` ${bot.last_name}` : ""}`,
            connectionMode: "polling",
          },
        };
      }

      // Webhook mode (default)
      const baseUrl = config?.webhookBaseUrl as string ||
        process.env.INTEGRATIONS_WEBHOOK_BASE_URL ||
        "https://api.symbia.ai";
      const webhookPath = `/api/integrations/channels/telegram/webhook/${ctx.connectionId}`;
      const webhookUrl = `${baseUrl}${webhookPath}`;

      // Generate webhook secret for verification
      const webhookSecret = createHmac("sha256", credential)
        .update(ctx.connectionId)
        .digest("hex")
        .slice(0, 32);

      // Set webhook
      const webhookResponse = await this.callApi<boolean>(credential, "setWebhook", {
        url: webhookUrl,
        secret_token: webhookSecret,
        allowed_updates: ["message", "edited_message", "channel_post"],
        drop_pending_updates: config?.dropPendingUpdates ?? false,
      });

      if (!webhookResponse.ok) {
        return {
          success: false,
          status: "error",
          error: webhookResponse.description || "Failed to set webhook",
        };
      }

      return {
        success: true,
        status: "connected",
        webhookUrl,
        webhookSecret,
        metadata: {
          botId: bot.id,
          botUsername: bot.username,
          botName: `${bot.first_name}${bot.last_name ? ` ${bot.last_name}` : ""}`,
          connectionMode: "webhook",
        },
      };
    } catch (error) {
      return {
        success: false,
        status: "error",
        error: error instanceof Error ? error.message : "Connection failed",
      };
    }
  }

  /**
   * Start polling loop for a connection
   */
  private startPolling(connectionId: string, botToken: string): void {
    if (activePollers.has(connectionId)) {
      console.log(`[telegram] Poller already running for ${connectionId}`);
      return;
    }

    let running = true;
    let offset = 0;

    const poller = {
      running: true,
      offset: 0,
      stop: () => {
        running = false;
        poller.running = false;
      },
    };

    activePollers.set(connectionId, poller);

    const poll = async () => {
      while (running) {
        try {
          const response = await this.callApi<TelegramUpdate[]>(botToken, "getUpdates", {
            offset: offset > 0 ? offset : undefined,
            timeout: POLLING_TIMEOUT_S,
            allowed_updates: ["message", "edited_message", "channel_post"],
          });

          if (!response.ok || !response.result) {
            console.error(`[telegram] Polling error for ${connectionId}:`, response.description);
            await this.sleep(POLLING_INTERVAL_MS * 5); // Back off on error
            continue;
          }

          for (const update of response.result) {
            offset = update.update_id + 1;
            poller.offset = offset;

            // Parse the update
            const parsed = this.parseWebhook({}, update);
            if (parsed.type === "message" && parsed.message) {
              parsed.message.connectionId = connectionId;

              // Call bridge handler directly (same service, no need for SDN)
              const runId = `run_poll_${randomUUID().slice(0, 8)}`;

              console.log(
                `[telegram] Polled message for ${connectionId}: ${parsed.message.text?.slice(0, 50)}...`
              );

              // Handle inbound message directly
              handleInboundMessage(parsed.message, runId).catch((error) => {
                console.error(`[telegram] Error handling inbound message:`, error);
              });
            }
          }
        } catch (error) {
          console.error(`[telegram] Polling error for ${connectionId}:`, error);
          await this.sleep(POLLING_INTERVAL_MS * 5); // Back off on error
        }
      }

      activePollers.delete(connectionId);
      console.log(`[telegram] Polling stopped for ${connectionId}`);
    };

    // Start polling in background
    poll().catch((error) => {
      console.error(`[telegram] Fatal polling error for ${connectionId}:`, error);
      activePollers.delete(connectionId);
    });

    console.log(`[telegram] Polling started for ${connectionId}`);
  }

  /**
   * Stop polling for a connection
   */
  private stopPolling(connectionId: string): void {
    const poller = activePollers.get(connectionId);
    if (poller) {
      poller.stop();
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getStatus(
    ctx: ChannelConnectionContext,
    sessionData?: Record<string, unknown>
  ): Promise<ConnectionStatusResult> {
    const botToken = sessionData?.botToken as string;
    if (!botToken) {
      return {
        status: "error",
        error: "No bot token in session data",
      };
    }

    // Check if polling mode
    const isPolling = activePollers.has(ctx.connectionId);

    try {
      const meResponse = await this.callApi<TelegramUser>(botToken, "getMe");

      if (!meResponse.ok || !meResponse.result) {
        return {
          status: "error",
          error: meResponse.description || "Failed to get bot info",
        };
      }

      if (isPolling) {
        // In polling mode, check if poller is running
        const poller = activePollers.get(ctx.connectionId);
        return {
          status: poller?.running ? "connected" : "error",
          channelAccountId: String(meResponse.result.id),
          channelAccountName: meResponse.result.username,
          lastPingAt: new Date(),
          metadata: {
            connectionMode: "polling",
            pollingOffset: poller?.offset,
          },
        };
      }

      // Webhook mode
      const webhookResponse = await this.callApi<{
        url: string;
        has_custom_certificate: boolean;
        pending_update_count: number;
        last_error_date?: number;
        last_error_message?: string;
      }>(botToken, "getWebhookInfo");

      const webhook = webhookResponse.result;
      const hasError = webhook?.last_error_message;

      return {
        status: hasError ? "error" : "connected",
        channelAccountId: String(meResponse.result.id),
        channelAccountName: meResponse.result.username,
        lastPingAt: new Date(),
        error: webhook?.last_error_message,
        metadata: {
          connectionMode: "webhook",
          pendingUpdates: webhook?.pending_update_count,
          webhookUrl: webhook?.url,
        },
      };
    } catch (error) {
      return {
        status: "error",
        error: error instanceof Error ? error.message : "Status check failed",
      };
    }
  }

  async disconnect(
    ctx: ChannelConnectionContext,
    sessionData?: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string }> {
    const botToken = sessionData?.botToken as string;

    // Stop polling if active
    this.stopPolling(ctx.connectionId);

    if (!botToken) {
      return { success: true }; // No bot token, but polling stopped
    }

    try {
      const response = await this.callApi<boolean>(botToken, "deleteWebhook", {
        drop_pending_updates: true,
      });

      return {
        success: response.ok,
        error: response.ok ? undefined : response.description,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Disconnect failed",
      };
    }
  }

  async sendMessage(
    ctx: ChannelConnectionContext,
    message: ChannelOutboundMessage,
    credential: string,
    sessionData?: Record<string, unknown>
  ): Promise<SendMessageResult> {
    try {
      const parseMode = message.formatting?.parseMode === "html" ? "HTML" :
        message.formatting?.parseMode === "markdown" ? "MarkdownV2" : undefined;

      const params: Record<string, unknown> = {
        chat_id: message.chatId,
        text: message.text,
        parse_mode: parseMode,
        disable_web_page_preview: message.formatting?.disablePreview,
        disable_notification: message.formatting?.silent,
      };

      if (message.replyToMessageId) {
        params.reply_to_message_id = parseInt(message.replyToMessageId);
      }

      const response = await this.callApi<TelegramMessage>(
        credential,
        "sendMessage",
        params
      );

      if (!response.ok || !response.result) {
        return {
          success: false,
          error: response.description || "Failed to send message",
        };
      }

      return {
        success: true,
        messageId: String(response.result.message_id),
        timestamp: new Date(response.result.date * 1000),
        metadata: {
          chatId: response.result.chat.id,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Send failed",
      };
    }
  }

  verifyWebhook(
    headers: Record<string, string>,
    body: unknown,
    secret?: string
  ): WebhookVerifyResult {
    // Telegram sends secret token in X-Telegram-Bot-Api-Secret-Token header
    const receivedSecret = headers["x-telegram-bot-api-secret-token"];

    if (!secret) {
      // No secret configured, accept all (not recommended for production)
      return { valid: true };
    }

    if (receivedSecret !== secret) {
      return {
        valid: false,
        error: "Invalid webhook secret",
      };
    }

    return { valid: true };
  }

  parseWebhook(
    headers: Record<string, string>,
    body: unknown
  ): ParsedWebhook {
    const update = body as TelegramUpdate;

    // Handle message updates
    const telegramMessage = update.message || update.edited_message ||
      update.channel_post || update.edited_channel_post;

    if (!telegramMessage) {
      return { type: "unknown", raw: body };
    }

    const isEdited = !!update.edited_message || !!update.edited_channel_post;

    // Map Telegram chat type to our chat type
    const chatTypeMap: Record<string, "private" | "group" | "channel" | "thread"> = {
      private: "private",
      group: "group",
      supergroup: "group",
      channel: "channel",
    };

    // Determine content type
    let contentType: ChannelInboundMessage["contentType"] = "text";
    if (telegramMessage.photo) contentType = "image";
    else if (telegramMessage.document) contentType = "document";
    else if (telegramMessage.audio) contentType = "audio";
    else if (telegramMessage.video) contentType = "video";
    else if (telegramMessage.voice) contentType = "audio";
    else if (telegramMessage.sticker) contentType = "sticker";

    const message: ChannelInboundMessage = {
      id: String(telegramMessage.message_id),
      channelType: "telegram",
      connectionId: "", // Will be filled by the route handler
      contentType,
      text: telegramMessage.text || telegramMessage.caption,
      sender: {
        id: String(telegramMessage.from?.id || telegramMessage.chat.id),
        name: telegramMessage.from
          ? `${telegramMessage.from.first_name}${telegramMessage.from.last_name ? ` ${telegramMessage.from.last_name}` : ""}`
          : telegramMessage.chat.title,
        username: telegramMessage.from?.username || telegramMessage.chat.username,
        isBot: telegramMessage.from?.is_bot,
      },
      chat: {
        id: String(telegramMessage.chat.id),
        type: chatTypeMap[telegramMessage.chat.type] || "private",
        name: telegramMessage.chat.title ||
          `${telegramMessage.chat.first_name || ""}${telegramMessage.chat.last_name ? ` ${telegramMessage.chat.last_name}` : ""}`.trim() ||
          undefined,
      },
      replyToMessageId: telegramMessage.reply_to_message
        ? String(telegramMessage.reply_to_message.message_id)
        : undefined,
      timestamp: new Date(telegramMessage.date * 1000).toISOString(),
      editedAt: isEdited ? new Date().toISOString() : undefined,
      raw: body as Record<string, unknown>,
    };

    return {
      type: "message",
      message,
      raw: body,
    };
  }

  formatMessage(
    text: string,
    options?: { parseMode?: "plain" | "markdown" | "html"; truncate?: boolean }
  ): string {
    let formatted = text;

    // Escape special characters for MarkdownV2 if needed
    if (options?.parseMode === "markdown") {
      // Telegram MarkdownV2 requires escaping these characters
      formatted = text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
    }

    // Truncate if needed
    if (options?.truncate && formatted.length > this.formatting.maxLength!) {
      formatted = formatted.slice(0, this.formatting.maxLength! - 3) + "...";
    }

    return formatted;
  }

  getDefaultConfig(): Partial<ChannelConfig> {
    return {
      channelType: "telegram",
      connectionMode: "webhook",
      capabilities: this.capabilities,
      formatting: this.formatting,
    };
  }
}

// Export singleton instance
export const telegramProvider = new TelegramProvider();
