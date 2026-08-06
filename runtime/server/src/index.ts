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
import { optionalAuth, requireAuth } from './auth.js';
import { registerComponent, getComponent } from './executor/components.js';
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

  // Alias: the OpenAPI spec advertises /health under the /api base; the real
  // endpoint is registered at root by @symbia/http. Serve both.
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Components registry — advertised in the OpenAPI spec and menu, absent from
  // v1.2.0's router. GETs expose the executor registry (reading the component
  // list is not privileged; a graph author needs it before writing anything).
  // POST registers a declarative custom component with passthrough semantics;
  // its outputs are marked apocryphal — the runtime cannot verify them by
  // recomputation.
  app.get('/api/components', (_req, res) => {
    const components = graphExecutor.listComponents();
    res.json({ components, count: components.length });
  });
  app.get('/api/components/:id', (req, res) => {
    const found = graphExecutor.listComponents().find((c) => c.id === req.params.id);
    if (!found) {
      res.status(404).json({ error: `Unknown component: ${req.params.id}` });
      return;
    }
    res.json(found);
  });
  app.post('/api/components', requireAuth, (req, res) => {
    const body = (req.body ?? {}) as Record<string, any>;
    const missing = ['id', 'name', 'version', 'ports', 'execution'].filter(
      (k) => body[k] === undefined
    );
    if (missing.length > 0) {
      res.status(400).json({ error: `Invalid component definition: missing ${missing.join(', ')}` });
      return;
    }
    if (typeof body.id !== 'string' || !/^[a-z0-9][a-z0-9\-_.]*$/i.test(body.id)) {
      res.status(400).json({ error: 'Invalid component definition: id must be an identifier string' });
      return;
    }
    if (getComponent(body.id)) {
      res.status(400).json({ error: `Component already registered: ${body.id}` });
      return;
    }
    const inputs: string[] = Array.isArray(body.ports?.inputs) ? body.ports.inputs.map(String) : [];
    const outputs: string[] = Array.isArray(body.ports?.outputs) ? body.ports.outputs.map(String) : [];
    registerComponent({
      id: body.id,
      name: String(body.name),
      description: String(body.description ?? 'Custom component (registered via API)'),
      inputs,
      outputs,
      emitsApocryphal: true,
      meta: {
        version: body.version,
        category: body.category,
        config: body.config,
        execution: body.execution,
        custom: true,
      },
      handler: (input) => {
        const out: Record<string, unknown> = {};
        for (const port of outputs.length > 0 ? outputs : ['out']) out[port] = input;
        return out;
      },
    });
    res.status(201).json({ registered: body.id });
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
