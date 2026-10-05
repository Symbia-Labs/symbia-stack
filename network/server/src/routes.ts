/**
 * Route registration for the Network service.
 *
 * Extracted from index.ts 15 Aug 2026. It was defined there as a local
 * function beside `server.start()`, which made the service impossible to
 * compose: importing index.ts starts a server, so nothing could reach the
 * routes without one. A route table is a value; this file is where it lives.
 * See docs/proposals/service-composition.md — the same move belongs on
 * middleware, health, and bootstrap, and this is only the first of them.
 */
import type { Server as HttpServer } from 'http';
import type { Express } from 'express';
import { createSymbiaServer } from '@symbia/http';
import { ServiceId, resolveServiceUrl } from '@symbia/sys';
import { config } from './config.js';
import { setupSocketHandlers } from './socket.js';
import * as policy from './services/policy.js';
import * as registry from './services/registry.js';
import { telemetry, NetworkEvents, NetworkMetrics } from './telemetry.js';
import registryRouter from './routes/registry.js';
import eventsRouter from './routes/events.js';
import policiesRouter from './routes/policies.js';
import sdnRouter from './routes/sdn.js';
import { registerDocRoutes } from './doc-routes.js';
import { seedDevServices } from './seed.js';

export async function registerRoutes(_server: HttpServer, app: Express): Promise<void> {
  // Initialize default policies
  policy.initDefaultPolicies();

  // Register documentation routes
  registerDocRoutes(app);

  // Service discovery endpoint (standardized across all services)
  app.get('/api/bootstrap/service', (_req, res) => {
    res.json({
      service: config.serviceId,
      version: '1.0.0',
      description: 'Event routing, policy enforcement, and SoftSDN observability',
      docsUrls: {
        openapi: '/docs/openapi.json',
        llms: '/docs/llms.txt',
      },
      endpoints: {
        registry: '/api/registry',
        events: '/api/events',
        policies: '/api/policies',
        sdn: '/api/sdn',
        websocket: '/',
      },
      authentication: [
        'Bearer token (JWT)',
        'API key (X-API-Key header)',
      ],
      websocketEvents: {
        client: [
          'node:register',
          'node:heartbeat',
          'node:unregister',
          'event:send',
          'contract:create',
          'sdn:watch',
          'sdn:unwatch',
          'sdn:topology',
        ],
        server: [
          'network:node:joined',
          'network:node:left',
          'network:node:disconnected',
          'network:contract:created',
          'event:received',
          'sdn:event',
        ],
      },
    });
  });

  // API routes
  app.use('/api/registry', registryRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/policies', policiesRouter);
  app.use('/api/sdn', sdnRouter);

  // Platform health aggregation endpoint
  // Checks all services and returns aggregated status
  app.get('/api/platform/health', async (_req, res) => {
    const services = [
      { id: ServiceId.IDENTITY, name: 'Identity' },
      { id: ServiceId.LOGGING, name: 'Logging' },
      { id: ServiceId.CATALOG, name: 'Catalog' },
      { id: ServiceId.MESSAGING, name: 'Messaging' },
      { id: ServiceId.RUNTIME, name: 'Runtime' },
      { id: ServiceId.ASSISTANTS, name: 'Assistants' },
    ];

    const results = await Promise.all(
      services.map(async ({ id, name }) => {
        const url = resolveServiceUrl(id);
        try {
          const response = await fetch(`${url}/health`, {
            signal: AbortSignal.timeout(3000),
          });
          return {
            service: name,
            serviceId: id,
            url,
            status: response.ok ? 'healthy' : 'unhealthy',
            statusCode: response.status,
          };
        } catch (error) {
          return {
            service: name,
            serviceId: id,
            url,
            status: 'unreachable',
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    const healthy = results.filter((r) => r.status === 'healthy').length;
    const total = results.length;
    const allHealthy = healthy === total;

    res.status(allHealthy ? 200 : 503).json({
      platform: allHealthy ? 'healthy' : 'degraded',
      summary: `${healthy}/${total} services healthy`,
      services: results,
      timestamp: new Date().toISOString(),
    });
  });

  // Start cleanup interval for stale nodes
  setInterval(() => {
    const staleNodes = registry.cleanupStaleNodes();
    if (staleNodes.length > 0) {
      console.log(`[Network] Cleaned up ${staleNodes.length} stale nodes:`, staleNodes);
      telemetry.event(
        NetworkEvents.NODE_STALE_CLEANUP,
        `Cleaned up ${staleNodes.length} stale nodes`,
        { nodeIds: staleNodes, count: staleNodes.length }
      );
      telemetry.metric(NetworkMetrics.NODE_STALE_CLEANUP, staleNodes.length);
    }
    const expiredContracts = registry.cleanupExpiredContracts();
    if (expiredContracts.length > 0) {
      console.log(`[Network] Cleaned up ${expiredContracts.length} expired contracts`);
      telemetry.event(
        NetworkEvents.CONTRACT_EXPIRED,
        `Cleaned up ${expiredContracts.length} expired contracts`,
        { count: expiredContracts.length }
      );
      telemetry.metric(NetworkMetrics.CONTRACT_EXPIRED, expiredContracts.length);
    }

    // Report current topology counts
    const topology = registry.getTopology();
    telemetry.metric(NetworkMetrics.NODE_ACTIVE_COUNT, topology.nodes.length);
    telemetry.metric(NetworkMetrics.CONTRACT_ACTIVE_COUNT, topology.contracts.length);
    telemetry.metric(NetworkMetrics.BRIDGE_ACTIVE_COUNT, topology.bridges.length);
  }, config.heartbeatIntervalMs);

  // Seed dev services after a short delay (allow other services to start)
  if (process.env.NODE_ENV === 'development' || process.env.NETWORK_DEV_SEED === 'true') {
    setTimeout(() => {
      seedDevServices().catch((err) => {
        console.error('[Network] Failed to seed dev services:', err);
      });
    }, 3000);
  }
}
