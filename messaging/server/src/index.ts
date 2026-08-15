import express from 'express';
import path from 'path';
import type { Server as HttpServer } from 'http';
import type { Express } from 'express';
import { randomUUID } from 'crypto';
import { createSymbiaServer } from '@symbia/http';
import { createTelemetryClient } from '@symbia/logging-client';
import { initServiceRelay, shutdownRelay, emitEvent, type SandboxEvent } from '@symbia/relay';
import { ServiceId, traceIdFromRunId } from '@symbia/sys';
import { config } from './config.js';
import { initDatabase, exportToFile, isMemory, pool } from './database.js';
import { join } from 'path';
import { getCurrentUser, optionalAuth } from './auth.js';
import authRouter from './routes/auth.js';
import conversationsRouter from './routes/conversations.js';
import adminRouter from './routes/admin.js';
import { setupSocketHandlers, emitConversationEvent } from './socket.js';
import { setupDocRoutes } from './doc-routes.js';
import { MessageModel } from './models/message.js';
import { ParticipantModel } from './models/participant.js';
import { ConversationModel } from './models/conversation.js';

const docsDir = path.resolve(process.cwd(), 'docs');

const telemetry = createTelemetryClient({
  serviceId: process.env.TELEMETRY_SERVICE_ID || config.serviceId,
});

import { registerRoutes } from './routes.js';

/**
 * Retry helper with exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelay?: number; maxDelay?: number } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000 } = options;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        console.warn(`[Retry] Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, lastError.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Handle assistant responses received via SDN.
 * Creates a message in the conversation and broadcasts to connected clients.
 * Includes retry logic for database operations.
 */
async function handleAssistantResponse(event: SandboxEvent): Promise<void> {
  console.log(`[SDN] ====== HANDLE ASSISTANT RESPONSE ======`);
  console.log(`[SDN] Event payload type: ${event.payload.type}`);
  console.log(`[SDN] Event payload data keys: ${Object.keys(event.payload.data || {}).join(', ')}`);
  console.log(`[SDN] Raw payload:`, JSON.stringify(event.payload.data, null, 2).substring(0, 500));

  const data = event.payload.data as {
    conversationId: string;
    message: {
      content: string;
      content_type?: string;
      metadata?: Record<string, unknown>;
    };
    assistantKey?: string;
    senderEntityId?: string;
    // Legacy field names for backward compatibility
    assistant?: { key: string; userId: string; entityId?: string };
    orgId?: string;
    justification?: {
      reason: string;
      triggerRule?: string;
      conditions?: Array<{ field: string; operator: string; value: string; matched: boolean }>;
      confidence?: number;
    };
  };

  const { conversationId, message, orgId, justification } = data;

  console.log(`[SDN] Extracted conversationId: ${conversationId}`);
  console.log(`[SDN] Extracted message: ${JSON.stringify(message)?.substring(0, 200)}`);

  // Determine sender ID from various sources
  const assistantKey = data.assistantKey || data.assistant?.key;
  const assistantUserId = data.assistant?.userId || (assistantKey ? `assistant:${assistantKey}` : null);
  const senderEntityId = data.senderEntityId || data.assistant?.entityId;

  console.log(`[SDN] assistantKey: ${assistantKey}, assistantUserId: ${assistantUserId}`);

  if (!conversationId || !message?.content || !assistantUserId) {
    console.error('[SDN] Invalid assistant response payload:', data);
    console.error('[SDN] Missing: conversationId?', !conversationId, 'message.content?', !message?.content, 'assistantUserId?', !assistantUserId);
    return;
  }

  console.log(`[SDN] Received response from ${assistantKey || senderEntityId} for conversation ${conversationId}`);

  // Check if the assistant is a participant - if not, auto-add them
  // This supports coordinator routing where assistants are added dynamically
  const isParticipant = await ParticipantModel.isParticipant(conversationId, assistantUserId);
  if (!isParticipant) {
    console.log(`[SDN] Assistant ${assistantUserId} is not a participant in ${conversationId}, auto-adding...`);
    try {
      await ParticipantModel.add(conversationId, assistantUserId, 'agent', 'member');
      console.log(`[SDN] Auto-added ${assistantUserId} to conversation ${conversationId}`);
    } catch (addError) {
      console.error(`[SDN] Failed to auto-add assistant ${assistantUserId}:`, addError);
      return;
    }
  }

  try {
    // Create the message in the database with retry logic
    const savedMessage = await withRetry(async () => {
      // IMPORTANT: MessageModel.create expects camelCase field names
      // Note: run_id and trace_id columns are UUID type, so we can't pass string prefixes
      // Only pass runId/traceId if they are valid UUIDs (not prefixed strings)
      // A prefixed runId such as `run_msg_<uuid>` fails isValidUUID and was
      // previously written as undefined. Dropping a trace ID is the worst
      // outcome available: downstream the trace looks like it ended rather
      // than like it failed to persist. traceIdFromRunId recovers the embedded
      // UUID deterministically, returning null only when there is genuinely
      // none (or the nil UUID, which W3C defines as invalid).
      const isValidUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
      const asUuid = (hex: string | null): string | undefined =>
        hex ? `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}` : undefined;
      const runId = event.wrapper.runId && isValidUUID(event.wrapper.runId)
        ? event.wrapper.runId : asUuid(traceIdFromRunId(event.wrapper.runId));
      const traceId = event.wrapper.id && isValidUUID(event.wrapper.id)
        ? event.wrapper.id : asUuid(traceIdFromRunId(event.wrapper.id));

      return await MessageModel.create({
        conversationId: conversationId,
        senderId: assistantUserId,
        senderType: 'agent',
        content: message.content,
        contentType: message.content_type || 'text',
        orgId: orgId,
        runId: runId,
        traceId: traceId,
        metadata: {
          ...message.metadata,
          // Include justification in metadata for observability
          _sdnJustification: justification,
          _sdnEventId: event.wrapper.id,
          _sdnRunId: event.wrapper.runId,
        },
      });
    }, { maxRetries: 3, baseDelay: 500 });

    console.log(`[SDN] Created message ${savedMessage.id} from assistant ${assistantKey}`);

    // Broadcast to WebSocket clients in the conversation
    // Send message directly (not wrapped) - frontend expects Message object
    emitConversationEvent(conversationId, 'message:new', {
      id: savedMessage.id,
      conversation_id: conversationId,
      sender_id: savedMessage.sender_id,
      sender_type: savedMessage.sender_type,
      content: savedMessage.content,
      content_type: savedMessage.content_type,
      created_at: savedMessage.created_at.toISOString(),
      updated_at: savedMessage.updated_at?.toISOString(),
      metadata: savedMessage.metadata,
    });

    // If this is a channel-linked conversation, emit SDN event for bridge routing
    const conversation = await ConversationModel.getById(conversationId);
    const channelMetadata = conversation?.metadata?.channel as { type?: string; connectionId?: string; chatId?: string } | undefined;
    if (channelMetadata?.connectionId) {
      console.log(`[SDN] Assistant response to channel-linked conversation ${conversationId}, emitting message.new for bridge`);
      await emitEvent('message.new', {
        conversationId,
        message: {
          id: savedMessage.id,
          sender_id: savedMessage.sender_id,
          sender_type: savedMessage.sender_type,
          content: savedMessage.content,
          content_type: savedMessage.content_type,
          metadata: savedMessage.metadata,
          created_at: savedMessage.created_at.toISOString(),
        },
        channel: channelMetadata,
        orgId,
      }, event.wrapper.runId || `run_msg_${randomUUID()}`, { target: 'integrations', boundary: 'intra' });
    }
  } catch (err) {
    console.error(`[SDN] Failed to process assistant response after retries:`, err);
    // TODO: Consider adding to a dead letter queue for manual inspection
  }
}

const server = createSymbiaServer({
  serviceId: ServiceId.MESSAGING,
  cors: {
    origins: config.corsOrigins,
    allowLocalhost: process.env.NODE_ENV !== 'production',
  },
  socket: {
    enabled: true,
    setupHandlers: setupSocketHandlers,
    options: {
      pingTimeout: config.socketPingTimeoutMs,      // How long to wait for pong before disconnect
      pingInterval: config.socketPingIntervalMs,    // How often to send ping packets
      connectTimeout: 45000,                        // Connection establishment timeout
    },
  },
  telemetry: {
    client: telemetry,
    excludePaths: ['/health', '/health/live', '/health/ready'],
  },
  registerRoutes,
});

server.start()
  .then(async () => {
    // Connect to network service after server starts
    await initServiceRelay({
      serviceId: ServiceId.MESSAGING,
      capabilities: [
        'messaging.conversation.create',
        'messaging.conversation.read',
        'messaging.message.send',
        'messaging.message.receive',
        'messaging.control.send',
      ],
      // SDN event handlers for assistant responses
      eventHandlers: {
        // Handle responses from assistants via SDN
        'message.response': handleAssistantResponse,
        'assistant.action.respond': handleAssistantResponse,
      },
    });
  })
  .catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });

// Graceful shutdown handler for relay and database export
async function gracefulShutdown(signal: string) {
  console.log(`\n[messaging] Received ${signal}, starting graceful shutdown...`);

  // Export in-memory database if applicable
  if (isMemory) {
    const exportPath = process.env.MESSAGING_DB_EXPORT_PATH ||
      join(process.cwd(), '.local-pids', `messaging-db-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    console.log(`[messaging] Exporting in-memory database to ${exportPath}...`);
    const success = await exportToFile(exportPath);
    if (success) {
      console.log(`[messaging] ✓ Database exported successfully`);
    } else {
      console.log(`[messaging] ✗ Database export failed`);
    }
  }

  // Shutdown relay connection
  await shutdownRelay();

  console.log(`[messaging] Shutdown complete`);
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
