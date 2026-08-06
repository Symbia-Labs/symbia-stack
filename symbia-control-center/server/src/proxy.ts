/**
 * /svc/{serviceId}/* -> that service's root, no path rewriting.
 *
 * This is the whole reason the console is a service rather than a bundler.
 *
 * Before: the page was served by Vite on 5173 and called services at
 * http://localhost:{port} — cross-origin, and five of the services send no
 * CORS headers, so the browser blocked responses before the app saw them. That
 * surfaced as "3/8 healthy" on a stack where every container was healthy, and
 * as "Not configured" on every integration provider. The workaround was a dev
 * proxy, which existed only under `npm run dev`, which meant the app had to
 * decide at runtime which mode it was in — and that decision was wrong,
 * twice, in two files.
 *
 * Now: the page and the API share one origin in every environment. There is no
 * mode to detect and no branch to get wrong.
 *
 * Path handling: the target is the service ROOT, not /api. `/health` lives at
 * the root on every service while the API lives under /api, and callers append
 * whichever they need. Rewriting away path segments here is what broke health
 * checks in the earlier /api/{service} entries.
 */
import { createProxyMiddleware, type Options, type RequestHandler } from 'http-proxy-middleware';
import type { Express } from 'express';
import type { Server } from 'node:http';
import type { Socket } from 'node:net';
import { ServicePorts, ServiceId, RunningServices } from '@symbia/sys';

/**
 * Services this app proxies to.
 *
 * Derived from the registry: a service cannot be reachable here without being
 * registered, and cannot linger here after being removed. The hand-maintained
 * map this replaces once carried `energy: 5010` for weeks after that service
 * ceased to exist.
 *
 * RunningServices already excludes `server` (registered, nothing listening).
 * The console does not proxy to itself.
 */
export const PROXIED_SERVICES: ServiceId[] = RunningServices.filter(
  (id) => id !== ServiceId.CONTROL_CENTER
);

/** Where a service actually lives. Container DNS in compose, localhost otherwise. */
export function serviceTarget(id: ServiceId): string {
  const host = process.env[`${id.toUpperCase().replace(/-/g, '_')}_HOST`];
  return `http://${host ?? 'localhost'}:${ServicePorts[id]}`;
}

/**
 * Keyed by service so the HTTP `upgrade` listener can reuse the same handler
 * instance the Express middleware uses — http-proxy-middleware requires this.
 * Registering a second handler for the upgrade would give the socket a
 * different proxy than its own polling requests, which fails intermittently
 * and looks like a network problem rather than a wiring one.
 */
const handlers = new Map<ServiceId, RequestHandler>();

export function mountServiceProxies(app: Express): void {
  for (const id of PROXIED_SERVICES) {
    const target = serviceTarget(id);

    const options: Options = {
      target,
      changeOrigin: true,
      // Socket.IO and raw WebSocket upgrades. Previously these bypassed the
      // proxy entirely and dialled localhost:PORT direct (F6) — cross-origin
      // where every HTTP call beside them was not.
      ws: true,
      // Strip only the /svc/{id} prefix. Everything after it reaches the
      // service unaltered, so /svc/logging/health hits /health and
      // /svc/logging/api/logs hits /api/logs.
      pathRewrite: { [`^/svc/${id}`]: '' },
      // Server-sent events: nginx-style buffering would hold the stream until
      // it filled, which presents as a log view that shows nothing and then
      // everything at once.
      on: {
        proxyReq: (proxyReq, req) => {
          if (req.url?.includes('/stream') || req.url?.includes('/events')) {
            proxyReq.setHeader('X-Accel-Buffering', 'no');
          }
        },
        error: (err, _req, res) => {
          // Report the failure as a failure. A proxy that swallows an
          // unreachable upstream and returns an empty 200 produces a panel
          // showing a confident zero, which is the defect this product exists
          // to prevent.
          const body = JSON.stringify({
            error: 'upstream_unreachable',
            service: id,
            target,
            message: err.message,
          });
          if ('writeHead' in res && !res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(body);
          }
        },
      },
    };

    const handler = createProxyMiddleware(options);
    handlers.set(id, handler);
    app.use(`/svc/${id}`, handler);
  }
}

/**
 * Route WebSocket upgrades to the right service.
 *
 * Express middleware never sees an `upgrade` request — it arrives on the HTTP
 * server, not through the router — so mounting the proxy on the app is not
 * enough. Without this, a Socket.IO client falls back to long-polling (which
 * DOES go through Express) and appears to work, while every upgrade silently
 * fails. That is the worst available outcome: chat and log streaming would
 * function, slowly, and nothing would say why.
 */
export function mountSocketUpgrades(httpServer: Server): void {
  httpServer.on('upgrade', (req, socket, head) => {
    const url = req.url ?? '';
    const id = PROXIED_SERVICES.find((s) => url.startsWith(`/svc/${s}/`));

    if (!id) {
      // Not ours. Destroy rather than leave it hanging — an unanswered
      // upgrade holds the connection open until the client times out, which
      // presents as "slow" instead of "wrong".
      socket.destroy();
      return;
    }

    // Node types the upgrade socket as Duplex; http-proxy-middleware wants
    // net.Socket. It is a net.Socket at runtime — this is a type-level gap in
    // the library's signature, not a behavioural one.
    handlers.get(id)?.upgrade?.(req, socket as Socket, head);
  });
}
