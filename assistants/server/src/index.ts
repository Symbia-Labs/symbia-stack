import { createSymbiaServer } from '@symbia/http';
import { registerRoutes } from './routes.js';
import { createTelemetryClient } from '@symbia/logging-client';
import { initServiceRelay, shutdownRelay, type SandboxEvent } from '@symbia/relay';
import { ServiceId } from '@symbia/sys';
import { handleSDNMessageNew } from './routes/webhooks.js';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { db, database, exportToFile, isMemory } from './lib/db.js';
import { join } from 'path';
import graphsRouter from './routes/graphs.js';
import runsRouter from './routes/runs.js';
import { optionalAuth } from './middleware/auth.js';
import actorsRouter from './routes/actors.js';
import webhooksRouter from './routes/webhooks.js';
import rulesRouter from './routes/rules.js';
import settingsRouter from './routes/settings.js';
import assistantsAdminRouter from './routes/assistants-admin.js';
import { setupDocRoutes } from './doc-routes.js';
import { provenanceSigningIdentity } from './engine/provenance.js';
import { loadAssistants, createAssistantsListRouter } from './services/assistant-loader.js';

const telemetry = createTelemetryClient({
  serviceId: process.env.TELEMETRY_SERVICE_ID || ServiceId.ASSISTANTS,
});

const server = createSymbiaServer({
  serviceId: ServiceId.ASSISTANTS,
  telemetry: {
    client: telemetry,
  },
  database,
  middleware: [
    helmet() as any,
    compression() as any,
    morgan('combined') as any,
  ],
  registerRoutes,
});

// Start server
server.start()
  .then(async () => {
    // Connect to network service after server starts
    await initServiceRelay({
      serviceId: ServiceId.ASSISTANTS,
      capabilities: [
        'assistants.graph.execute',
        'assistants.run.create',
        'assistants.run.status',
        'assistants.actor.register',
        'assistants.webhook.receive',
      ],
      // SDN event handlers for message routing
      eventHandlers: {
        // Handle new messages from SDN (replaces HTTP webhook)
        'message.new': handleSDNMessageNew,
      },
    });
  });

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  console.log(`\n[assistants] Received ${signal}, starting graceful shutdown...`);

  // Export in-memory database if applicable
  if (isMemory) {
    const exportPath = process.env.ASSISTANTS_DB_EXPORT_PATH ||
      join(process.cwd(), '.local-pids', `assistants-db-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    console.log(`[assistants] Exporting in-memory database to ${exportPath}...`);
    const success = exportToFile(exportPath);
    if (success) {
      console.log(`[assistants] ✓ Database exported successfully`);
    } else {
      console.log(`[assistants] ✗ Database export failed`);
    }
  }

  await shutdownRelay();
  console.log(`[assistants] Shutdown complete`);
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { server, db };
