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
import { registerSinkComponents } from './executor/components-sinks.js';
import { MetricWriter } from './executor/metric-writer.js';
import { StateStore, setStateStore } from './executor/state-store.js';
import { pool, isDurable } from './db.js';
import './executor/components-state.js';
import './executor/components-sources.js';
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

// Operator state is durable and keyed by graph identity, so a restart resumes
// a pipeline rather than restarting it (roadmap Phase 3). Wired before the
// executor so the first execution can hydrate from it.
const stateStore = new StateStore({
  pool: pool as never,
  durable: isDurable,
  flushIntervalMs: parseInt(process.env.RUNTIME_STATE_FLUSH_MS || '2000', 10),
});
setStateStore(stateStore);

import { graphExecutor, catalogSync } from './executor.js';

// Metric sinks write through the runtime's own writer rather than the shared
// telemetry client, because a graph's derived series must be attributed to the
// org that owns the graph, deduplicated across restarts, and able to report a
// failed write instead of silently dropping it (defects D6/D7).
const metricWriter = new MetricWriter({ serviceId: config.serviceId });

registerSinkComponents({
  metric: (name, value, labels, orgId) => metricWriter.write({ name, value, labels, orgId }),
  // Report the writer's health back to the sink. `log()` itself is
  // fire-and-forget (batched flush), so the honest answer is "is the write
  // path currently failing", not "did this line land" -- the same distinction
  // MetricWriter.write() already makes above.
  log: (level, message, metadata) => {
    telemetry.log(level, message, metadata);
    return telemetry.getLastError() === null;
  },
});

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
  await stateStore.stop();
  await shutdownRelay();
});
process.on('SIGINT', async () => {
  catalogSync?.stop();
  await stateStore.stop();
  await shutdownRelay();
});
