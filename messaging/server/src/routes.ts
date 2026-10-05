/**
 * Route registration for the Messaging service.
 *
 * Extracted from index.ts 15 Aug 2026. It was defined there as a local
 * function beside `server.start()`, which made the service impossible to
 * compose: importing index.ts starts a server, so nothing could reach the
 * routes without one. A route table is a value; this file is where it lives.
 * See docs/proposals/service-composition.md — the same move belongs on
 * middleware, health, and bootstrap, and this is only the first of them.
 */
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

export async function registerRoutes(_server: HttpServer, app: Express): Promise<void> {
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

  // Alias: the OpenAPI spec advertises /health under the /api base; the real
  // endpoint is registered at root by @symbia/http. Serve both.
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Service discovery endpoint (standardized across all services)
  // Mounted at both /api/bootstrap and /api/bootstrap/service: the OpenAPI spec
  // advertises GET /bootstrap (base /api), the standardized path is /bootstrap/service.
  app.get(['/api/bootstrap', '/api/bootstrap/service'], optionalAuth, (_req, res) => {
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
