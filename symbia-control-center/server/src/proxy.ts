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
import {
  createProxyMiddleware,
  fixRequestBody,
  type Options,
  type RequestHandler,
} from 'http-proxy-middleware';
import type { Express } from 'express';
import type { Server } from 'node:http';
import type { Socket } from 'node:net';
import { ServiceId, RunningServices, resolveServiceTarget } from '@symbia/sys';

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

/**
 * Where a service actually lives.
 *
 * Delegates to @symbia/sys. This used to compute the host inline, and
 * service-admin computed it differently — same concern, two implementations,
 * disagreeing about the default. One function now, in the registry.
 */
export const serviceTarget = resolveServiceTarget;

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
    const target = resolveServiceTarget(id);

    const options: Options = {
      target,
      changeOrigin: true,
      // Socket.IO and raw WebSocket upgrades. Previously these bypassed the
      // proxy entirely and dialled localhost:PORT direct (F6) — cross-origin
      // where every HTTP call beside them was not.
      ws: true,
      // Matched HERE rather than by an Express mount path, and this is the
      // whole point.
      //
      // Mounted as `app.use('/svc/{id}', handler)`, Express strips the prefix
      // before the handler runs, so HTTP requests arrived pre-stripped and
      // worked. An `upgrade` never goes through Express, so the handler saw
      // the FULL url instead — two paths through one proxy, seeing different
      // URLs. Measured in a browser 6 Aug: polling returned 200 while the
      // upgrade returned 404, because the service was being asked for
      // /svc/messaging/socket.io/ which does not exist on it.
      //
      // Filtering here means the handler sees the same URL in both cases and
      // strips it itself. The two paths cannot disagree because there is now
      // only one rule.
      pathFilter: `/svc/${id}/**`,
      // Strip only the /svc/{id} prefix. Everything after it reaches the
      // service unaltered, so /svc/logging/health hits /health and
      // /svc/logging/api/logs hits /api/logs.
      pathRewrite: { [`^/svc/${id}`]: '' },
      // Server-sent events: nginx-style buffering would hold the stream until
      // it filled, which presents as a log view that shows nothing and then
      // everything at once.
      on: {
        proxyReq: (proxyReq, req, res) => {
          // WITHOUT THIS, EVERY WRITE HANGS.
          //
          // createSymbiaServer registers express.json() at server.ts:125 and
          // calls registerRoutes — where this proxy mounts — at line 293. By
          // the time a request reaches the proxy its body has already been
          // read off the socket and parsed, so the proxy forwarded a request
          // with correct headers including Content-Length and an EMPTY stream.
          // The upstream then waited for a body that would never arrive.
          //
          // The failure mode is the reason this went unnoticed: it does not
          // error, it hangs. GET worked, so every health check, every panel
          // load and every list view passed. Only writes were affected, and a
          // write that hangs looks like a slow network rather than a broken
          // proxy. Measured 6 Aug: POST /api/conversations returned in 12ms
          // direct and timed out at 12s through the proxy.
          //
          // fixRequestBody re-serialises the parsed body onto the outbound
          // request.
          // TRACE HEADERS FIRST, BEFORE fixRequestBody.
          //
          // Order is load-bearing and I got it wrong. fixRequestBody writes the
          // body onto the outbound request, which flushes the headers; any
          // setHeader after that throws ERR_HTTP_HEADERS_SENT out of an event
          // handler and KILLS THE PROCESS. The control center exited on the
          // first proxied request, twice, and I attributed it to the shell
          // reaping a background process — a plausible story that happened to
          // be wrong, and that I would have kept believing if the container
          // (which logs its own death) had not been the thing that crashed.
          //
          // Injected here at all because the fetch wrapper cannot see this
          // call: http-proxy-middleware uses Node's `http` module, not `fetch`.
          //
          // P4 from docs/2026-08-08-trace-propagation.md, registered as the
          // prediction most likely to catch me out and confirmed by reading
          // this file: http-proxy-middleware uses Node's `http` module, not
          // `fetch`, so the global wrapper installed in createSymbiaServer
          // misses every console → service request — which is the most common
          // call on the stack and the one an operator is most likely to be
          // looking at.
          //
          // The trace id comes from the browser if it sent one and is minted
          // here otherwise: this proxy is the edge, and the edge is where a
          // request's identity begins.
          const incoming = req.headers['x-trace-id'];
          proxyReq.setHeader(
            'x-trace-id',
            typeof incoming === 'string' && incoming
              ? incoming
              : `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
          );
          proxyReq.setHeader('x-symbia-caller', 'control-center');

          // NOW the body. This flushes headers, so nothing may setHeader after
          // it. See the comment above.
          fixRequestBody(proxyReq, req);

          if (req.url?.includes('/stream') || req.url?.includes('/events')) {
            proxyReq.setHeader('X-Accel-Buffering', 'no');
          }
          void res;
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
    // No mount path — pathFilter above decides. See the comment there.
    app.use(handler);
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
  // Node warns at 10 listeners. There are 11 here and it is NOT a leak, so the
  // count is set deliberately rather than left to look like one.
  //
  // Each of the 10 proxy handlers attaches its own `upgrade` listener because
  // ws:true is what makes handler.upgrade() available, and this function adds
  // the dispatcher below. MEASURED 7 Aug: with the dispatcher disabled, an
  // upgrade to /svc/messaging/socket.io TIMES OUT -- the library's own
  // listeners do not match. So the dispatcher does the work and the other ten
  // are inert. Removing ws:true to shed them would also remove .upgrade().
  //
  // Logged rather than worked around: this is a library shape, not a choice.
  httpServer.setMaxListeners(PROXIED_SERVICES.length + 5);

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
