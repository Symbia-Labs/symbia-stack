/**
 * Symbia Network Service
 *
 * Event routing, policy enforcement, and SoftSDN observability.
 *
 * This service provides:
 * - Node registry for service discovery
 * - Event routing with hash-based policy enforcement
 * - Contract-based communication between nodes
 * - Bridge management for external systems
 * - SoftSDN API for read-only observability (assistant access)
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

// Routes
import registryRouter from './routes/registry.js';
import eventsRouter from './routes/events.js';
import policiesRouter from './routes/policies.js';
import sdnRouter from './routes/sdn.js';
import { registerDocRoutes } from './doc-routes.js';
import { seedDevServices } from './seed.js';

import { registerRoutes } from './routes.js';

const server = createSymbiaServer({
  serviceId: ServiceId.NETWORK,
  cors: {
    origins: config.corsOrigins,
    allowLocalhost: process.env.NODE_ENV !== 'production',
  },
  socket: {
    enabled: true,
    setupHandlers: setupSocketHandlers,
  },
  telemetry: {
    client: telemetry,
    excludePaths: ['/health', '/health/live', '/health/ready'],
  },
  registerRoutes,
});

server.start().catch((error) => {
  console.error('Failed to start network service:', error);
  process.exit(1);
});
