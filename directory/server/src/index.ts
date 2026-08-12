/**
 * Symbia Directory Service — federation control plane.
 *
 * Holds the peer directory (BDT), the foreign-node table (FDT), and admission
 * for network-to-network federation. It is the control plane; the bridge node
 * is the data plane and carries no policy of its own. No event is ever routed
 * through this service.
 *
 * Design: docs/2026-08-09-network-bridge-bbmd.md.
 */
import { createSymbiaServer } from '@symbia/http';
import { ServiceId, resolveServicePort } from '@symbia/sys';
import { config } from './config.js';
import { createRouter } from './routes.js';
import * as registry from './registry.js';
import { telemetry, DirectoryEvents, DirectoryMetrics } from './telemetry.js';

const serviceId = ServiceId.DIRECTORY;

const server = createSymbiaServer({
  serviceId,
  port: resolveServicePort(serviceId),
  host: config.host,
  cors: {
    origins: config.corsOrigins,
    allowLocalhost: process.env.NODE_ENV !== 'production',
  },
  telemetry: {
    client: telemetry,
    excludePaths: ['/health', '/health/live', '/health/ready'],
  },
  registerRoutes: async (_httpServer, app) => {
    // Service discovery, standardized across services.
    app.get('/api/bootstrap/service', (_req, res) => {
      res.json({
        service: serviceId,
        version: '1.0.0',
        description: 'Federation directory (control plane): peer directory (BDT), foreign-node table (FDT), admission',
        endpoints: {
          offer: '/api/offer',
          peers: '/api/peers',
          foreignNodes: '/api/foreign-nodes',
        },
        authentication: ['Join secret (x-symbia-join-secret) when DIRECTORY_JOIN_SECRET is set'],
      });
    });

    app.use('/api', createRouter());

    // Sweep expired foreign registrations. "Stale" and "left on purpose" are
    // the same to the FDT, exactly as BACnet foreign-device registration.
    setInterval(() => {
      const evicted = registry.evictExpiredForeign();
      if (evicted.length > 0) {
        telemetry.event(
          DirectoryEvents.FOREIGN_EVICTED,
          `Evicted ${evicted.length} expired foreign node(s)`,
          { nodeIds: evicted, count: evicted.length }
        );
        telemetry.metric(DirectoryMetrics.FOREIGN_EVICTED, evicted.length);
      }
      telemetry.metric(DirectoryMetrics.PEER_ACTIVE_COUNT, registry.listPeers().length);
      telemetry.metric(DirectoryMetrics.FOREIGN_ACTIVE_COUNT, registry.listForeign().length);
    }, config.evictIntervalMs);

    // Blank beats green: an open admission door is a stated state, never silent.
    if (!config.joinSecret) {
      console.warn(
        '[Directory] DIRECTORY_JOIN_SECRET is not set — admission is OPEN. ' +
          'Acceptable inside a trusted boundary; set the secret before exposing this service across one.'
      );
    }
    telemetry.event(DirectoryEvents.SERVICE_STARTED, 'Directory service started', {
      admission: config.joinSecret ? 'join-secret' : 'open',
    });
  },
});

server.start().catch((error) => {
  console.error('Failed to start directory service:', error);
  process.exit(1);
});
