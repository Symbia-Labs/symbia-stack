/**
 * Symbia Runtime Service
 *
 * Graph execution engine for Symbia Script workflows.
 *
 * NOTE: This service has been simplified. The component-based execution model
 * has been removed and requires a complete rework. Graph loading and validation
 * work, but actual execution is stubbed.
 */

import express from 'express';
import path from 'path';
import type { Server as HttpServer } from 'http';
import type { Express } from 'express';
import { createSymbiaServer } from '@symbia/http';
import { createTelemetryClient } from '@symbia/logging-client';
import { initServiceRelay, shutdownRelay } from '@symbia/relay';
import { ServiceId } from '@symbia/sys';
import { config } from './config.js';
import { optionalAuth } from './auth.js';
import { setupDocRoutes } from './doc-routes.js';

// Runtime modules
import { GraphExecutor } from './executor/index.js';
import { createGraphRoutes, createExecutionRoutes, createRoutineRoutes } from './routes/index.js';
import { createSocketHandlers } from './socket.js';

const docsDir = path.resolve(process.cwd(), 'docs');

// Initialize telemetry
const telemetry = createTelemetryClient({
  serviceId: process.env.TELEMETRY_SERVICE_ID || config.serviceId,
});

// Initialize graph executor
const graphExecutor = new GraphExecutor({
  maxConcurrentExecutions: config.runtime.maxConcurrentExecutions,
  defaultTimeout: config.runtime.defaultExecutionTimeout,
  maxBackpressureQueue: config.runtime.maxBackpressureQueue,
  enableMetrics: config.runtime.enableMetrics,
});

async function registerRoutes(_server: HttpServer, app: Express): Promise<void> {
  // Static file serving for docs
  app.use('/docs', express.static(docsDir));

  // No-cache header middleware
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    next();
  });

  // Setup documentation routes
  setupDocRoutes(app);

  // Service discovery endpoint
  app.get('/api/bootstrap/service', optionalAuth, (_req, res) => {
    res.json({
      service: config.serviceId,
      version: '1.0.0',
      description: 'Graph execution engine for Symbia Script workflows',
      status: 'limited',
      statusNote: 'Runtime service requires rework - graph loading works, execution is stubbed',
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
        graphs: '/api/graphs',
        routines: '/api/routines',
        executions: '/api/executions',
        websocket: '/',
      },
      authentication: [
        'Bearer token (JWT)',
        'API key (X-API-Key header)',
        'Session cookie (token or symbia_session)',
      ],
      websocketEvents: {
        client: [
          'execution:subscribe',
          'execution:unsubscribe',
          'execution:start',
          'execution:pause',
          'execution:resume',
          'execution:stop',
          'execution:inject',
        ],
        server: [
          'execution:started',
          'execution:paused',
          'execution:resumed',
          'execution:completed',
          'execution:failed',
          'execution:state',
          'port:emit',
          'metrics:update',
          'error',
        ],
      },
      runtime: {
        maxConcurrentExecutions: config.runtime.maxConcurrentExecutions,
        defaultExecutionTimeout: config.runtime.defaultExecutionTimeout,
      },
    });
  });

  // API routes
  app.use('/api/graphs', createGraphRoutes(graphExecutor));
  app.use('/api/routines', createRoutineRoutes(graphExecutor));
  app.use('/api/executions', createExecutionRoutes(graphExecutor));

  // Stats endpoint
  app.get('/api/stats', optionalAuth, (_req, res) => {
    res.json(graphExecutor.getStats());
  });
}

const server = createSymbiaServer({
  serviceId: ServiceId.RUNTIME,
  cors: {
    origins: config.corsOrigins,
    allowLocalhost: process.env.NODE_ENV !== 'production',
  },
  socket: {
    enabled: true,
    setupHandlers: createSocketHandlers(graphExecutor),
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
      serviceId: ServiceId.RUNTIME,
      serviceName: 'Runtime Service',
      capabilities: [
        'runtime.graph.load',
        'runtime.routine.compile',
        'runtime.routine.load',
        'runtime.execution.manage',
      ],
    });

    console.log(`[Runtime] Service started on port ${config.port}`);
    console.log('[Runtime] NOTE: Execution functionality is stubbed pending runtime rework');
  })
  .catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });

// Graceful shutdown handler for relay
process.on('SIGTERM', async () => {
  await shutdownRelay();
});
process.on('SIGINT', async () => {
  await shutdownRelay();
});
