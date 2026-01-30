/**
 * Channel Event Handlers
 *
 * SDN event handlers for channel-related events.
 * Subscribes to outbound message events and routes them to the appropriate channel provider.
 */

import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getRelay, emitEvent, type SandboxEvent } from "@symbia/relay";
import {
  channelConnections,
  channelOutboundMessageSchema,
  type ChannelOutboundMessage,
  type ChannelType,
} from "@shared/schema.js";
import { db } from "../db.js";
import { getCredentialById } from "../credential-client.js";
import { channelProviders, type ChannelConnectionContext } from "./providers/index.js";

/**
 * Handle outbound channel message events
 *
 * Listens for `channel.message.outbound` events from the SDN and routes them
 * to the appropriate channel provider for delivery.
 */
async function handleOutboundMessage(
  payload: ChannelOutboundMessage,
  runId: string
): Promise<void> {
  const startTime = Date.now();

  console.log(`[channels] Outbound message received:`, {
    connectionId: payload.connectionId,
    channelType: payload.channelType,
    chatId: payload.chatId,
    textPreview: payload.text?.slice(0, 50),
    runId,
  });

  try {
    // Validate payload
    const parseResult = channelOutboundMessageSchema.safeParse(payload);
    if (!parseResult.success) {
      console.error(`[channels] Invalid outbound message payload:`, parseResult.error);
      await emitDeliveryStatus(payload, "failed", "Invalid message payload", runId);
      return;
    }

    const message = parseResult.data;

    // Get connection
    const [connection] = await db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.id, message.connectionId))
      .limit(1);

    if (!connection) {
      console.error(`[channels] Connection not found: ${message.connectionId}`);
      await emitDeliveryStatus(message, "failed", "Connection not found", runId);
      return;
    }

    if (connection.status !== "connected") {
      console.error(`[channels] Connection not active: ${connection.status}`);
      await emitDeliveryStatus(message, "failed", `Connection not active (${connection.status})`, runId);
      return;
    }

    // Get provider
    const provider = channelProviders.get(connection.channelType as ChannelType);
    if (!provider) {
      console.error(`[channels] Provider not available: ${connection.channelType}`);
      await emitDeliveryStatus(message, "failed", "Channel provider not available", runId);
      return;
    }

    // Get credential
    let apiKey: string | undefined;
    if (connection.credentialId) {
      const credential = await getCredentialById(connection.credentialId);
      apiKey = credential?.apiKey;
    }

    // Fall back to session data if credential lookup fails
    if (!apiKey) {
      const sessionData = connection.sessionData as Record<string, unknown> | null;
      apiKey = sessionData?.botToken as string | undefined;
    }

    if (!apiKey) {
      console.error(`[channels] No credentials available for connection: ${message.connectionId}`);
      await emitDeliveryStatus(message, "failed", "No credentials available", runId);
      return;
    }

    // Build context
    const ctx: ChannelConnectionContext = {
      connectionId: message.connectionId,
      userId: connection.userId,
      orgId: connection.orgId || undefined,
      credentialId: connection.credentialId || undefined,
    };

    // Send message via provider
    const result = await provider.sendMessage(
      ctx,
      message,
      apiKey,
      connection.sessionData as Record<string, unknown>
    );

    const durationMs = Date.now() - startTime;

    if (result.success) {
      console.log(`[channels] Message sent successfully:`, {
        connectionId: message.connectionId,
        messageId: result.messageId,
        durationMs,
      });

      // Update message count
      await db
        .update(channelConnections)
        .set({
          messagesSent: (connection.messagesSent || 0) + 1,
          lastMessageAt: new Date(),
          updatedAt: new Date(),
          consecutiveErrors: 0,
        })
        .where(eq(channelConnections.id, message.connectionId));

      // Emit delivery success
      await emitDeliveryStatus(message, "delivered", undefined, runId, {
        messageId: result.messageId,
        timestamp: result.timestamp?.toISOString(),
        durationMs,
      });
    } else {
      console.error(`[channels] Message send failed:`, {
        connectionId: message.connectionId,
        error: result.error,
        durationMs,
      });

      // Update error count
      await db
        .update(channelConnections)
        .set({
          errorCount: (connection.errorCount || 0) + 1,
          consecutiveErrors: (connection.consecutiveErrors || 0) + 1,
          lastError: result.error,
          lastErrorAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(channelConnections.id, message.connectionId));

      await emitDeliveryStatus(message, "failed", result.error, runId, { durationMs });
    }
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    console.error(`[channels] Outbound message handler error:`, error);
    await emitDeliveryStatus(payload, "failed", errorMessage, runId, { durationMs });
  }
}

/**
 * Emit delivery status event
 */
async function emitDeliveryStatus(
  message: ChannelOutboundMessage,
  status: "delivered" | "failed" | "pending",
  error?: string,
  runId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await emitEvent(
      "channel.message.delivery",
      {
        connectionId: message.connectionId,
        channelType: message.channelType,
        chatId: message.chatId,
        conversationId: message.conversationId,
        assistantId: message.assistantId,
        requestId: message.requestId,
        status,
        error,
        timestamp: new Date().toISOString(),
        ...metadata,
      },
      runId || `run_dlv_${randomUUID().slice(0, 8)}`
    );
  } catch (emitError) {
    console.error(`[channels] Failed to emit delivery status:`, emitError);
  }
}

/**
 * Initialize channel event handlers
 *
 * Call this during service startup to subscribe to channel-related SDN events.
 * Must be called after initServiceRelay() has been called.
 */
export async function initializeChannelEventHandlers(): Promise<void> {
  console.log("[channels] Initializing event handlers...");

  const relay = getRelay();
  if (!relay) {
    console.warn("[channels] Relay not initialized - event handlers not registered");
    console.warn("[channels] Outbound messages will only work via direct API calls");
    return;
  }

  // Subscribe to outbound message events
  relay.onEvent("channel.message.outbound", (event: SandboxEvent) => {
    const payload = event.payload.data as ChannelOutboundMessage;
    const runId = event.wrapper?.runId || `run_out_${randomUUID().slice(0, 8)}`;

    // Handle asynchronously, don't block the event loop
    handleOutboundMessage(payload, runId).catch((error) => {
      console.error("[channels] Error handling outbound message:", error);
    });
  });

  console.log("[channels] Event handlers initialized - subscribed to channel.message.outbound");
}

/**
 * Send a message through a channel (programmatic API)
 *
 * This can be called directly from other services without going through SDN,
 * useful for testing or when you need synchronous response.
 */
export async function sendChannelMessage(
  message: ChannelOutboundMessage
): Promise<{
  success: boolean;
  messageId?: string;
  timestamp?: string;
  error?: string;
}> {
  const runId = `run_send_${randomUUID().slice(0, 8)}`;

  return new Promise((resolve) => {
    // We'll handle this synchronously instead of through SDN
    handleOutboundMessageSync(message, runId)
      .then(resolve)
      .catch((error) => {
        resolve({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      });
  });
}

/**
 * Synchronous version of handleOutboundMessage that returns result directly
 */
async function handleOutboundMessageSync(
  payload: ChannelOutboundMessage,
  runId: string
): Promise<{
  success: boolean;
  messageId?: string;
  timestamp?: string;
  error?: string;
}> {
  // Validate payload
  const parseResult = channelOutboundMessageSchema.safeParse(payload);
  if (!parseResult.success) {
    return { success: false, error: "Invalid message payload" };
  }

  const message = parseResult.data;

  // Get connection
  const [connection] = await db
    .select()
    .from(channelConnections)
    .where(eq(channelConnections.id, message.connectionId))
    .limit(1);

  if (!connection) {
    return { success: false, error: "Connection not found" };
  }

  if (connection.status !== "connected") {
    return { success: false, error: `Connection not active (${connection.status})` };
  }

  // Get provider
  const provider = channelProviders.get(connection.channelType as ChannelType);
  if (!provider) {
    return { success: false, error: "Channel provider not available" };
  }

  // Get credential
  let apiKey: string | undefined;
  if (connection.credentialId) {
    const credential = await getCredentialById(connection.credentialId);
    apiKey = credential?.apiKey;
  }

  if (!apiKey) {
    const sessionData = connection.sessionData as Record<string, unknown> | null;
    apiKey = sessionData?.botToken as string | undefined;
  }

  if (!apiKey) {
    return { success: false, error: "No credentials available" };
  }

  // Build context
  const ctx: ChannelConnectionContext = {
    connectionId: message.connectionId,
    userId: connection.userId,
    orgId: connection.orgId || undefined,
    credentialId: connection.credentialId || undefined,
  };

  // Send message via provider
  const result = await provider.sendMessage(
    ctx,
    message,
    apiKey,
    connection.sessionData as Record<string, unknown>
  );

  if (result.success) {
    // Update message count
    await db
      .update(channelConnections)
      .set({
        messagesSent: (connection.messagesSent || 0) + 1,
        lastMessageAt: new Date(),
        updatedAt: new Date(),
        consecutiveErrors: 0,
      })
      .where(eq(channelConnections.id, message.connectionId));
  }

  return {
    success: result.success,
    messageId: result.messageId,
    timestamp: result.timestamp?.toISOString(),
    error: result.error,
  };
}
