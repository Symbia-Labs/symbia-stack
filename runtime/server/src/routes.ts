import { graphExecutor, catalogSync } from './executor.js';
/**
 * Route registration for the Runtime service.
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
import { createSymbiaServer } from '@symbia/http';
import { createTelemetryClient } from '@symbia/logging-client';
import { initServiceRelay, shutdownRelay } from '@symbia/relay';
import { ServiceId } from '@symbia/sys';
import { config } from './config.js';
import { optionalAuth, requireAuth } from './auth.js';
import { registerComponent, getComponent } from './executor/components.js';
import { registerSinkComponents } from './executor/components-sinks.js';
import { MetricWriter } from './executor/metric-writer.js';
import { StateStore, setStateStore } from './executor/state-store.js';
import { pool, isDurable } from './db.js';
import './executor/components-state.js';
import './executor/components-sources.js';
import { setupDocRoutes } from './doc-routes.js';
import { GraphExecutor } from './executor/index.js';
import { createGraphRoutes, createExecutionRoutes, createRoutineRoutes } from './routes/index.js';
import { createSocketHandlers } from './socket.js';
import { CatalogSync } from './catalog/sync.js';
import { checkIngressAccess, readIngress } from './catalog/ingress.js';

const docsDir = path.resolve(process.cwd(), 'docs');

export async function registerRoutes(_server: HttpServer, app: Express): Promise<void> {
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

  // Push ingress: external producers deliver into a named RUNNING graph
  // without tracking execution ids. The graph declares its entry in
  // metadata.ingress ({node, port, capability}); defaults to entry/in.
  //
  // Phase 2: this is a *gated* capability, not merely an authenticated route.
  // Delivery is checked against the org that owns the graph and any capability
  // the ingress declares — authentication alone would let any logged-in
  // principal push into any running pipeline.
  app.post('/api/ingress/:graphName', requireAuth, async (req, res) => {
    try {
      const name = String(req.params.graphName);
      const graph = graphExecutor.getAllGraphs().find((g) => g.definition.name === name);
      if (!graph) {
        res.status(404).json({ error: `No loaded graph named: ${name}` });
        return;
      }

      const declared = readIngress(graph.definition) ?? { node: 'entry', port: 'in' };
      const gate = checkIngressAccess({
        graphOrgId: graph.orgId ?? catalogSync?.getGraphOrg(name),
        ingress: declared,
        caller: {
          isSuperAdmin: req.user?.isSuperAdmin,
          entitlements: req.user?.entitlements,
          organizations: req.user?.organizations,
        },
        enforcement: config.ingressEnforcement,
      });
      if (!gate.allowed) {
        res.status(403).json({
          error: `Delivery to ingress "${name}" refused: ${gate.reason}`,
          ingress: {
            graph: name,
            requiresCapability: declared.capability ?? null,
            declaredIn: `catalog resource ingress/${name}`,
          },
        });
        return;
      }

      const exec = graphExecutor.getAllExecutions()
        .filter((e) => e.graphId === graph.id && e.state === 'running')
        .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))[0];
      if (!exec) {
        res.status(409).json({ error: `Graph "${name}" has no running execution` });
        return;
      }
      const node = declared.node;
      const port = declared.port;
      // An array body is a batch: one delivery per element, one HTTP call total.
      // (Also keeps the request-metrics volume proportional to ticks, not
      // readings — per-reading HTTP calls flooded the telemetry queue.)
      const values: unknown[] = Array.isArray(req.body) ? req.body : [req.body];
      let outputs: Record<string, unknown> = {};
      let hops = 0;
      for (const value of values) {
        const result = await graphExecutor.injectMessage(exec.id, node, port, value);
        hops += result.trace.length;
        if (Object.keys(result.outputs).length > 0) outputs = result.outputs;
      }
      res.json({
        success: true,
        executionId: exec.id,
        delivered: values.length,
        outputs,
        hops,
      });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
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
