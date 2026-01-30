/**
 * Channel Bridge
 *
 * Bridges channel messages to/from Symbia Messaging conversations.
 *
 * Inbound flow:
 *   channel.message.inbound -> Find/create conversation -> POST message to Messaging
 *
 * Outbound flow:
 *   message.new (from assistant) -> Check if channel-linked -> channel.message.outbound
 */

import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getRelay, emitEvent, type SandboxEvent } from "@symbia/relay";
import { ServiceId, resolveServiceUrl } from "@symbia/sys";
import {
  channelConnections,
  type ChannelInboundMessage,
} from "@shared/schema.js";
import { db } from "../db.js";

// Messaging service URL for internal API calls
const MESSAGING_SERVICE_URL = resolveServiceUrl(ServiceId.MESSAGING);

/**
 * Internal mapping of channel chats to Symbia conversations.
 * Key: `${channelType}:${connectionId}:${chatId}`
 * Value: Symbia conversationId
 */
const chatToConversationMap = new Map<string, string>();

/**
 * Handle inbound channel messages
 *
 * Routes messages from external channels to Symbia Messaging conversations.
 * This is exported so it can be called directly by providers in polling mode.
 */
export async function handleInboundMessage(
  payload: ChannelInboundMessage,
  runId: string
): Promise<void> {
  console.log(`[bridge] Inbound message received:`, {
    channelType: payload.channelType,
    connectionId: payload.connectionId,
    chatId: payload.chat.id,
    senderName: payload.sender.name,
    textPreview: payload.text?.slice(0, 50),
    runId,
  });

  try {
    // Get connection to find org context
    const [connection] = await db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.id, payload.connectionId))
      .limit(1);

    if (!connection) {
      console.error(`[bridge] Connection not found: ${payload.connectionId}`);
      return;
    }

    const orgId = connection.orgId || undefined;

    // Find or create conversation for this chat
    const conversationId = await findOrCreateConversation(
      payload,
      orgId,
      connection.userId
    );

    if (!conversationId) {
      console.error(`[bridge] Failed to find/create conversation for chat: ${payload.chat.id}`);
      return;
    }

    // Post message to the conversation
    await postMessageToConversation(
      conversationId,
      payload,
      connection.userId,
      orgId,
      runId
    );

    // Update connection metrics
    await db
      .update(channelConnections)
      .set({
        messagesReceived: (connection.messagesReceived || 0) + 1,
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(channelConnections.id, payload.connectionId));

    console.log(`[bridge] Message routed to conversation: ${conversationId}`);
  } catch (error) {
    console.error(`[bridge] Error handling inbound message:`, error);
  }
}

/**
 * Find existing conversation for a channel chat, or create a new one
 */
async function findOrCreateConversation(
  message: ChannelInboundMessage,
  orgId: string | undefined,
  ownerId: string
): Promise<string | null> {
  const chatKey = `${message.channelType}:${message.connectionId}:${message.chat.id}`;

  // Check memory cache first
  const cached = chatToConversationMap.get(chatKey);
  if (cached) {
    console.log(`[bridge] Found cached conversation: ${cached}`);
    return cached;
  }

  // Try to find existing conversation by metadata
  try {
    const searchResponse = await fetch(
      `${MESSAGING_SERVICE_URL}/api/internal/conversations/by-channel?` +
        new URLSearchParams({
          channelType: message.channelType,
          connectionId: message.connectionId,
          chatId: message.chat.id,
        }),
      {
        headers: {
          "X-Service-Id": "integrations",
          "Content-Type": "application/json",
        },
      }
    );

    if (searchResponse.ok) {
      const data = await searchResponse.json() as { conversationId?: string };
      if (data.conversationId) {
        chatToConversationMap.set(chatKey, data.conversationId);
        console.log(`[bridge] Found existing conversation via API: ${data.conversationId}`);
        return data.conversationId;
      }
    }
  } catch (error) {
    console.log(`[bridge] Channel lookup not available, will create new conversation`);
  }

  // Create new conversation
  const conversationName = message.chat.name ||
    `${message.channelType} - ${message.sender.name || message.sender.username || "Unknown"}`;

  const conversationResponse = await fetch(
    `${MESSAGING_SERVICE_URL}/api/conversations`,
    {
      method: "POST",
      headers: {
        "X-Service-Id": "integrations",
        "X-As-User-Id": ownerId,
        "Content-Type": "application/json",
        ...(orgId && { "X-Org-Id": orgId }),
      },
      body: JSON.stringify({
        type: message.chat.type === "private" ? "private" : "group",
        name: conversationName,
        metadata: {
          channel: {
            type: message.channelType,
            connectionId: message.connectionId,
            chatId: message.chat.id,
            chatType: message.chat.type,
            chatName: message.chat.name,
          },
          channelSender: {
            id: message.sender.id,
            name: message.sender.name,
            username: message.sender.username,
          },
        },
      }),
    }
  );

  if (!conversationResponse.ok) {
    const errorText = await conversationResponse.text();
    console.error(`[bridge] Failed to create conversation:`, errorText);
    return null;
  }

  const conversation = await conversationResponse.json() as { id: string };
  chatToConversationMap.set(chatKey, conversation.id);
  console.log(`[bridge] Created new conversation: ${conversation.id}`);

  return conversation.id;
}

/**
 * Post a channel message to a Symbia conversation
 */
async function postMessageToConversation(
  conversationId: string,
  message: ChannelInboundMessage,
  userId: string,
  orgId: string | undefined,
  runId: string
): Promise<void> {
  const content = message.text || "[Attachment]";

  const response = await fetch(
    `${MESSAGING_SERVICE_URL}/api/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: {
        "X-Service-Id": "integrations",
        "X-As-User-Id": userId,
        "Content-Type": "application/json",
        ...(orgId && { "X-Org-Id": orgId }),
      },
      body: JSON.stringify({
        content,
        contentType: message.contentType || "text",
        senderType: "user",
        metadata: {
          _channelMessage: {
            id: message.id,
            channelType: message.channelType,
            connectionId: message.connectionId,
            sender: message.sender,
            timestamp: message.timestamp,
            replyToMessageId: message.replyToMessageId,
          },
          channelSender: {
            id: message.sender.id,
            name: message.sender.name,
            username: message.sender.username,
          },
          ...(message.attachments?.length && { attachments: message.attachments }),
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to post message: ${errorText}`);
  }

  console.log(`[bridge] Posted message to conversation ${conversationId}`);
}

/**
 * Handle outbound messages from assistants
 */
async function handleAssistantMessage(
  event: SandboxEvent,
  runId: string
): Promise<void> {
  const payload = event.payload.data as {
    conversationId: string;
    message: {
      id: string;
      sender_id: string;
      sender_type: string;
      content: string;
      content_type?: string;
      metadata?: Record<string, unknown>;
    };
    orgId?: string;
    channel?: {
      type: string;
      connectionId: string;
      chatId: string;
    };
  };

  // Skip if not from an assistant/agent
  if (payload.message.sender_type !== "agent") {
    return;
  }

  // Skip if it's a channel-originated message (avoid loops)
  if (payload.message.sender_id.startsWith("channel:")) {
    return;
  }

  console.log(`[bridge] Assistant message in conversation ${payload.conversationId}:`, {
    senderId: payload.message.sender_id,
    contentPreview: payload.message.content?.slice(0, 50),
    runId,
  });

  try {
    const channelMeta = payload.channel;

    if (!channelMeta) {
      return;
    }

    console.log(`[bridge] Conversation is channel-linked:`, channelMeta);

    await emitEvent(
      "channel.message.outbound",
      {
        channelType: channelMeta.type,
        connectionId: channelMeta.connectionId,
        chatId: channelMeta.chatId,
        contentType: payload.message.content_type || "text",
        text: payload.message.content,
        conversationId: payload.conversationId,
        assistantId: payload.message.sender_id,
        requestId: payload.message.id,
        formatting: {
          parseMode: "markdown",
        },
      },
      runId
    );

    console.log(`[bridge] Emitted channel.message.outbound for ${channelMeta.type}`);
  } catch (error) {
    console.error(`[bridge] Error handling assistant message:`, error);
  }
}

/**
 * Initialize the channel bridge
 */
export async function initializeChannelBridge(): Promise<void> {
  console.log("[bridge] Initializing channel bridge...");

  const relay = getRelay();
  if (!relay) {
    console.warn("[bridge] Relay not initialized - bridge not active");
    console.warn("[bridge] Channel messages will not be routed to conversations");
    return;
  }

  relay.onEvent("channel.message.inbound", (event: SandboxEvent) => {
    const payload = event.payload.data as ChannelInboundMessage;
    const runId = event.wrapper?.runId || `run_in_${randomUUID().slice(0, 8)}`;

    handleInboundMessage(payload, runId).catch((error) => {
      console.error("[bridge] Error handling inbound message:", error);
    });
  });

  relay.onEvent("message.new", (event: SandboxEvent) => {
    const runId = event.wrapper?.runId || `run_msg_${randomUUID().slice(0, 8)}`;

    handleAssistantMessage(event, runId).catch((error) => {
      console.error("[bridge] Error handling assistant message:", error);
    });
  });

  console.log("[bridge] Channel bridge initialized");
  console.log("[bridge] - Subscribed to: channel.message.inbound");
  console.log("[bridge] - Subscribed to: message.new");
}
