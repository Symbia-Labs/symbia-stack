import { createSymbiaServer } from '@symbia/http';
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
import actorsRouter from './routes/actors.js';
import webhooksRouter from './routes/webhooks.js';
import rulesRouter from './routes/rules.js';
import settingsRouter from './routes/settings.js';
import assistantsAdminRouter from './routes/assistants-admin.js';
import { setupDocRoutes } from './doc-routes.js';
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
  registerRoutes: async (_, app) => {
    // Setup documentation routes (type cast for Express v4 compatibility)
    setupDocRoutes(app as any);

    // Auto-seed in-memory database for development/testing
    if (isMemory) {
      console.log("Auto-seeding in-memory database...");
      try {
        const { orgs, agentPrincipals, promptGraphs } = await import("@shared/schema.js");
        const { DEFAULT_ORG_IDS } = await import("@symbia/seed");

        // First, seed the orgs table (required for foreign keys) - must match identity service
        await db.insert(orgs).values([
          {
            id: DEFAULT_ORG_IDS.SYMBIA_LABS,
            name: "Symbia Labs",
            slug: "symbia-labs",
            planId: "plan-enterprise",
            createdAt: new Date(),
          },
          {
            id: DEFAULT_ORG_IDS.ACME_CORP,
            name: "Acme Corp",
            slug: "acme-corp",
            planId: "plan-pro",
            createdAt: new Date(),
          },
          {
            id: DEFAULT_ORG_IDS.TEST_ORG,
            name: "Test Organization",
            slug: "test-org",
            planId: "plan-free",
            createdAt: new Date(),
          },
        ]).onConflictDoNothing();
        console.log("[SEED] ✓ Seeded orgs table");

        // Then seed agents and graphs
        const { seedAssistantsData } = await import("@symbia/seed");
        await seedAssistantsData(db, {
          agents: agentPrincipals,
          graphs: promptGraphs,
        }, {
          verbose: false,
          skipIfExists: true,
        });
        console.log("✓ In-memory database seeded successfully");
      } catch (error) {
        console.error("Failed to seed in-memory database:", error);
      }
    }

    // Simple health check
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', service: 'assistants' });
    });

    // Service discovery endpoint (standardized across all services)
    app.get('/api/bootstrap/service', (_req, res) => {
      res.json({
        service: 'assistants',
        version: '1.0.0',
        description: 'Rule-based assistant agents with prompt graphs and run orchestration',
        docsUrls: {
          openapi: '/docs/openapi.json',
          llms: '/docs/llms.txt',
          llmsFull: '/docs/llms-full.txt',
        },
        endpoints: {
          auth: '/api/auth',
          assistants: '/api/assistants',
          graphs: '/api/graphs',
          runs: '/api/runs',
          actors: '/api/actors',
          rules: '/api/rules',
          settings: '/api/settings',
          webhooks: '/api/webhook',
        },
        authentication: [
          'Bearer token (JWT)',
          'Session cookie (proxied to identity)',
        ],
      });
    });

    // Health check with database status
    app.get('/api/status', async (_req, res) => {
      if (!process.env.DATABASE_URL) {
        res.json({
          status: 'degraded',
          database: 'unconfigured',
          message: 'DATABASE_URL not set',
        });
        return;
      }

      try {
        const { pool } = await import('./lib/db.js');
        const client = await pool.connect();
        const result = await client.query('SELECT NOW() as time');
        client.release();
        res.json({
          status: 'connected',
          database: 'postgresql',
          serverTime: result.rows[0]?.time,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        res.json({ status: 'degraded', database: 'unreachable', message: msg });
      }
    });

    // Stats endpoint for platform health monitoring
    app.get('/api/stats', async (_req, res) => {
      try {
        const { promptGraphs, graphRuns } = await import('@shared/schema.js');
        const { getAllLoadedAssistants } = await import('./services/assistant-loader.js');
        const graphs = await db.select().from(promptGraphs);
        const allRuns = await db.select().from(graphRuns);
        const activeRuns = allRuns.filter((r: { status: string }) => r.status === 'running');
        const loadedAssistants = getAllLoadedAssistants();

        res.json({
          loadedAssistants: loadedAssistants.length,
          totalGraphs: graphs.length,
          activeRuns: activeRuns.length,
          totalRuns: allRuns.length,
        });
      } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({ error: 'Failed to get stats' });
      }
    });

    // Register API routes (type cast for Express v4 compatibility)
    (app as any).use('/api/graphs', graphsRouter);
    (app as any).use('/api/runs', runsRouter);
    (app as any).use('/api/actors', actorsRouter);
    (app as any).use('/api/rules', rulesRouter);
    (app as any).use('/api/settings', settingsRouter);
    (app as any).use('/api/assistants-admin', assistantsAdminRouter);
    (app as any).use('/api/webhook', webhooksRouter);

    // Register assistants list endpoint
    (app as any).use('/api/assistants', createAssistantsListRouter());

    // Proxy identity service requests to avoid CORS issues
    const IDENTITY_ENDPOINT = process.env.IDENTITY_ENDPOINT || 'https://identity.symbia-labs.com';
    (app as any).use('/api/auth', async (req: any, res: any) => {
      try {
        const url = `${IDENTITY_ENDPOINT}/api/auth${req.url}`;
        const response = await fetch(url, {
          method: req.method,
          headers: {
            'Content-Type': 'application/json',
            ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
            ...(req.headers.cookie ? { Cookie: req.headers.cookie } : {}),
          },
          body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? JSON.stringify(req.body) : undefined,
        });
        const data = await response.json();

        // Forward set-cookie headers
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) {
          res.setHeader('Set-Cookie', setCookie);
        }

        res.status(response.status).json(data);
      } catch (error) {
        console.error('[Identity Proxy] Error:', error);
        res.status(502).json({ message: 'Identity service unavailable' });
      }
    });

    (app as any).get('/api/users/me', async (req: any, res: any) => {
      try {
        const url = `${IDENTITY_ENDPOINT}/api/users/me`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
            ...(req.headers.cookie ? { Cookie: req.headers.cookie } : {}),
          },
        });
        const data = await response.json();
        res.status(response.status).json(data);
      } catch (error) {
        console.error('[Identity Proxy] Error:', error);
        res.status(502).json({ message: 'Identity service unavailable' });
      }
    });

    // Load assistants from Catalog and register their routes
    await loadAssistants(app as any);
  },
});

// Start server
server.start()
  .then(async () => {
    // Connect to network service after server starts
    await initServiceRelay({
      serviceId: ServiceId.ASSISTANTS,
      serviceName: 'Assistants Service',
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
