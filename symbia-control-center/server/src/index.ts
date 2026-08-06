/**
 * Symbia Control Center — service #10.
 *
 * Serves the built operator console and proxies /svc/{id} to the services.
 * Nothing else. It holds no database credentials, implements no auth logic of
 * its own, and exposes no API of its own: if the console needs something no
 * service provides, that is a platform defect to log, not an endpoint to add
 * here.
 *
 * See docs/2026-08-06-control-center-rebuild.md §4.
 */
import { createSymbiaServer } from '@symbia/http';
import { ServiceId, resolveServicePort } from '@symbia/sys';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mountServiceProxies, PROXIED_SERVICES } from './proxy.js';
import { mountStatic } from './static.js';

const serviceId = ServiceId.CONTROL_CENTER;
const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = process.env.CONTROL_CENTER_DIST ?? path.resolve(here, '..', 'dist');

const server = createSymbiaServer({
  serviceId,
  port: resolveServicePort(serviceId),

  // No CORS configuration on purpose. Every request this app makes is
  // same-origin by construction — that is the point of the /svc proxy. If a
  // CORS header ever becomes necessary here, something has started making
  // cross-origin calls again and the finding belongs in a document, not in a
  // config.
  cors: { origins: [], allowLocalhost: false },

  registerRoutes: async (_httpServer, app) => {
    // Proxies BEFORE static: /svc/* must never be answered by the SPA
    // fallback. A proxy route silently returning index.html is the
    // "API call succeeds while the button does nothing" failure inverted, and
    // just as hard to see.
    mountServiceProxies(app);
    mountStatic(app, distDir);
  },

  health: {
    enabled: true,
    enableLiveness: true,
    enableReadiness: true,
    // Readiness reports on this service only. It deliberately does NOT probe
    // the services behind the proxy: a console that reports itself unready
    // because logging is down would be reporting someone else's state as its
    // own, and the console's whole job is to show that state rather than to be
    // conflated with it.
    //
    // What it does check is the one thing that is genuinely its own
    // precondition — that there is something to serve. mountStatic already
    // refuses to start without dist/index.html, so reaching here means it is
    // present.
    readinessCheck: async () => true,
  },
});

server
  .start()
  .then(() => {
    console.log(
      `[control-center] on ${resolveServicePort(serviceId)} — ` +
        `serving ${distDir}, proxying ${PROXIED_SERVICES.length} services: ` +
        PROXIED_SERVICES.join(', ')
    );
  })
  .catch((err) => {
    console.error('[control-center] failed to start:', err);
    process.exit(1);
  });

async function gracefulShutdown(signal: string) {
  console.log(`[control-center] received ${signal}, shutting down...`);
  await server.shutdown();
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
