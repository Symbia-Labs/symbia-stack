/**
 * Symbia Runtime Service
 *
 * Graph execution engine for Symbia Script workflows.
 *
 * The catalog is the source of truth; this service is the handler. On boot it
 * publishes its component manifests to the catalog, hydrates published graph
 * resources, and stands up the ones declared as pipelines/services — so a
 * graph does not require an external actor to load and execute it before
 * anything can be delivered to it.
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
import { CatalogSync } from './catalog/sync.js';
import { checkIngressAccess, readIngress } from './catalog/ingress.js';

const docsDir = path.resolve(process.cwd(), 'docs');

// Initialize telemetry
const telemetry = createTelemetryClient({
  serviceId: process.env.TELEMETRY_SERVICE_ID || config.serviceId,
});

// State store, metric/log sinks and the component side-effect registrations
// all live in service.ts now, so a host that is not this file gets them too.
// Keeping a second copy here is what produced the 16 Aug hydration failure
// in the imagine sidecar.
import { graphExecutor, catalogSync, wireComponents, stateStore, isDurable } from './service.js';
wireComponents();

import { registerRoutes } from './routes.js';

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
      capabilities: [
        'runtime.graph.load',
        'runtime.routine.compile',
        'runtime.routine.load',
        'runtime.execution.manage',
      ],
    });

    console.log(`[Runtime] Service started on port ${config.port}`);
    console.log(
      `[Runtime] manifest enforcement: ${config.runtime.manifestEnforcement}` +
        (config.runtime.manifestEnforcement === 'strict'
          ? ' (graphs referencing unmanifested components are refused on load)'
          : '')
    );
    console.log(
      isDurable
        ? '[Runtime] operator state: durable (Postgres) — restarts resume accumulated joins and windows'
        : '[Runtime] operator state: IN-MEMORY ONLY — state is lost on restart (no DATABASE_URL)'
    );

    // Catalog -> runtime edge. Publish manifests, hydrate published graphs,
    // stand up the ones declared as pipelines/services, then keep reconciling.
    try {
      const report = await catalogSync!.start();
      console.log(
        `[Runtime] catalog sync — loaded ${report.graphsLoaded.length} graph(s), started ${report.graphsStarted.length}` +
          (report.errors.length ? `, ${report.errors.length} error(s)` : '')
      );
      for (const e of report.errors) {
        console.error(`[Runtime] catalog sync error (${e.key}): ${e.error}`);
      }
    } catch (error) {
      console.error('[Runtime] catalog sync failed at boot:', (error as Error).message);
      if (config.catalog.failFast) process.exit(1);
    }
  })
  .catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });

// Graceful shutdown handler for relay
process.on('SIGTERM', async () => {
  catalogSync?.stop();
  // Flush operator state before exit so a planned restart loses nothing.
  await stateStore()?.stop();
  await shutdownRelay();
});
process.on('SIGINT', async () => {
  catalogSync?.stop();
  await stateStore()?.stop();
  await shutdownRelay();
});
