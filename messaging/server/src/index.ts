import express from 'express';
import path from 'path';
import type { Server as HttpServer } from 'http';
import type { Express } from 'express';
import { randomUUID } from 'crypto';
import { createSymbiaServer } from '@symbia/http';
import { createTelemetryClient } from '@symbia/logging-client';
import { initServiceRelay, shutdownRelay, emitEvent, type SandboxEvent } from '@symbia/relay';
import { ServiceId } from '@symbia/sys';
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

async function registerRoutes(_server: HttpServer, app: Express): Promise<void> {
  // Initialize database
  await initDatabase();

  // Static file serving for docs
  app.use('/docs', express.static(docsDir));

  // No-cache header middleware
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    next();
  });

  // Setup documentation routes
  setupDocRoutes(app);

  // Auth config endpoint
  app.get('/api/auth/config', (_req, res) => {
    const identityBase = config.identityServiceUrl.replace(/\/$/, '');
    res.json({
      identityServiceUrl: identityBase,
      loginUrl: `${identityBase}/login`,
      logoutUrl: `${identityBase}/api/auth/logout`,
    });
  });

  // Current user endpoint
  app.get('/api/auth/me', async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    res.json({
      user,
      organizations: user.organizations || [],
    });
  });

  // Service discovery endpoint (standardized across all services)
  app.get('/api/bootstrap/service', optionalAuth, (_req, res) => {
    res.json({
      service: config.serviceId,
      version: '1.0.0',
      description: 'Real-time messaging bus for users and agents',
      docsUrls: {
        openapi: '/docs/openapi.json',
        llms: '/docs/llms.txt',
        llmsFull: '/docs/llms-full.txt',
        openapiDirect: '/api/openapi.json',
        openapiApi: '/api/docs/openapi.json',
        llmsApi: '/api/docs/llms.txt',
        llmsFullApi: '/api/docs/llms-full.txt',
      },
      endpoints: {
        auth: '/api/auth',
        rest: '/api/conversations',
        admin: '/api/admin',
        websocket: '/',
      },
      authentication: [
        'Bearer token (JWT)',
        'API key (X-API-Key header)',
        'Session cookie (token or symbia_session)',
      ],
      websocketEvents: {
        client: [
          'join:conversation',
          'leave:conversation',
          'message:send',
          'message:edit',
          'message:delete',
          'control:send',
          'typing:start',
          'typing:stop',
          'presence:update',
        ],
        server: [
          'message:new',
          'message:updated',
          'message:deleted',
          'stream.pause',
          'stream.resume',
          'stream.preempt',
          'stream.route',
          'stream.handoff',
          'stream.cancel',
          'stream.priority',
          'typing:started',
          'typing:stopped',
          'presence:changed',
        ],
      },
    });
  });

  // Stats endpoint for platform health monitoring
  app.get('/api/stats', async (_req, res) => {
    try {
      const conversationsResult = await pool.query('SELECT COUNT(*) FROM conversations');
      const messagesResult = await pool.query('SELECT COUNT(*) FROM messages');
      const participantsResult = await pool.query('SELECT COUNT(DISTINCT user_id) FROM participants');

      res.json({
        totalConversations: parseInt(conversationsResult.rows[0].count, 10),
        totalMessages: parseInt(messagesResult.rows[0].count, 10),
        uniqueParticipants: parseInt(participantsResult.rows[0].count, 10),
      });
    } catch (error) {
      console.error('Error getting stats:', error);
      res.status(500).json({ error: 'Failed to get stats' });
    }
  });

  // Internal service-to-service endpoints (no auth required, use X-Service-Id header)
  app.get('/api/internal/conversations/by-channel', async (req, res) => {
    const serviceId = req.headers['x-service-id'];
    if (!serviceId) {
      res.status(401).json({ error: 'X-Service-Id header required' });
      return;
    }

    const { channelType, connectionId, chatId } = req.query;
    if (!channelType || !connectionId || !chatId) {
      res.status(400).json({ error: 'channelType, connectionId, and chatId query params required' });
      return;
    }

    try {
      const { ConversationModel } = await import('./models/conversation.js');
      const conversation = await ConversationModel.findByChannelMetadata(
        channelType as string,
        connectionId as string,
        chatId as string
      );

      if (conversation) {
        res.json({ conversationId: conversation.id, conversation });
      } else {
        res.json({ conversationId: null });
      }
    } catch (error) {
      console.error('Error finding conversation by channel:', error);
      res.status(500).json({ error: 'Failed to find conversation' });
    }
  });

  // Demo chat endpoint for website (no auth required)
  // This allows anonymous users to chat with assistants via the website
  app.post('/api/send', async (req, res) => {
    const { content, assistant, channel } = req.body;
    
    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    const assistantKey = assistant || 'coordinator';
    const integrationsUrl = process.env.INTEGRATIONS_URL || 'http://localhost:5007';

    // Get assistant context from catalog to build proper system prompt
    let systemPrompt = `You are ${assistantKey}, a helpful AI assistant on the Symbia platform.`;
    try {
      const catalogUrl = process.env.CATALOG_URL || 'http://localhost:5003';
      const catalogRes = await fetch(`${catalogUrl}/api/bootstrap`);
      if (catalogRes.ok) {
        const resources = await catalogRes.json() as Array<{ key: string; type: string; description?: string; metadata?: Record<string, unknown> }>;
        const assistantResource = resources.find(r => 
          r.type === 'assistant' && 
          (r.key === assistantKey || r.key === `assistants/${assistantKey}` || r.metadata?.alias === assistantKey)
        );
        if (assistantResource?.description) {
          systemPrompt = `You are ${assistantKey}, an AI assistant. ${assistantResource.description}. Be helpful, concise, and friendly.`;
        }
      }
    } catch (e) {
      // Use default prompt
    }

    try {
      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      // Call integrations service to get LLM response using HuggingFace
      const internalSecret = process.env.INTERNAL_SERVICE_SECRET || 'symbia-internal-dev-secret';
      const llmResponse = await fetch(`${integrationsUrl}/api/internal/execute`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Service-Id': 'messaging',
          'X-Internal-Auth': internalSecret,
        },
        body: JSON.stringify({
          provider: 'huggingface',
          operation: 'chat.completions',
          params: {
            model: 'meta-llama/Llama-3.2-3B-Instruct',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content }
            ],
            temperature: 0.7,
            maxTokens: 512,
          }
        }),
      });

      if (!llmResponse.ok) {
        const errorText = await llmResponse.text();
        console.error('[Demo Chat] LLM error:', errorText);
        res.write(`data: ${JSON.stringify({ error: 'LLM request failed', details: errorText })}\n\n`);
        res.end();
        return;
      }

      const result = await llmResponse.json() as { 
        choices?: Array<{ message?: { content?: string } }>;
        content?: string; 
        error?: string;
      };
      
      // Extract content from OpenAI-compatible format or direct content
      const responseContent = result.choices?.[0]?.message?.content || result.content;
      
      if (responseContent) {
        // Stream the response word by word for a more natural feel
        const words = responseContent.split(' ');
        for (let i = 0; i < words.length; i++) {
          const word = words[i] + (i < words.length - 1 ? ' ' : '');
          res.write(`data: ${JSON.stringify({ content: word })}\n\n`);
          // Small delay between words for streaming effect
          await new Promise(r => setTimeout(r, 20));
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error('[Demo Chat] Error:', error);
      res.write(`data: ${JSON.stringify({ error: 'Chat failed', details: String(error) })}\n\n`);
      res.end();
    }
  });

  // API routes
  app.use('/api/conversations', conversationsRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);

  // Symbia namespace endpoint - exposes messaging as @messaging.* references
  app.get('/symbia-namespace', async (_req, res) => {
    res.json({
      namespace: 'messaging',
      version: '1.0.0',
      description: 'Real-time messaging and conversations',
      properties: {
        'conversations.count': { type: 'number', description: 'Total conversation count' },
        'messages.count': { type: 'number', description: 'Total message count' },
        'connections.active': { type: 'number', description: 'Active WebSocket connections' },
      },
    });
  });
}

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
      const isValidUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
      const runId = event.wrapper.runId && isValidUUID(event.wrapper.runId) ? event.wrapper.runId : undefined;
      const traceId = event.wrapper.id && isValidUUID(event.wrapper.id) ? event.wrapper.id : undefined;

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
      serviceName: 'Messaging Service',
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
