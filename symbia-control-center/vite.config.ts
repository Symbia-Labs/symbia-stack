import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

import { ServicePorts, ServiceId, RunningServices } from '@symbia/sys';

// Defect D5 — the route table used to be hand-maintained here, duplicating a
// registry this app already depends on. Two consequences showed up in practice:
// it drifted (an `energy: 5010` entry survived the deletion of that service on
// 6 Aug 2026, pointing at nothing), and it had to be edited by hand whenever a
// service moved — the "hand-maintained proxy map" the roadmap's Phase 4 exists
// to remove.
//
// It is now derived from @symbia/sys, which is the canonical registry of
// service identifiers and ports. A service cannot be reachable here without
// being in that registry, and cannot linger here after leaving it.
//
// Note what is deliberately absent: per-app entries. Apps do not get their own
// ports any more. An app's delivery surface is a declared ingress on the
// runtime (`POST /api/ingress/{graph}`), gated per Phase 2 — so the route table
// is exactly the platform's services and nothing else. `energy: 5010` existed
// only because energy was, at the time, an unregistered service; that is the
// condition the app model removes rather than routes around.
// NOTE: this file is deleted in step 6 of
// docs/2026-08-06-control-center-rebuild.md. The same route table now lives in
// symbia-control-center/server/src/proxy.ts, which serves it in every
// environment rather than only under a dev server.
//
// The `server` filter is no longer repeated here — @symbia/sys exports
// RunningServices, which is the one place "registered but not listening" is
// expressed. A service also does not proxy to itself.
const serviceProxies: Record<string, number> = Object.fromEntries(
  RunningServices
    .filter((id) => id !== ServiceId.CONTROL_CENTER)
    .map((id) => [id, ServicePorts[id]])
);

const proxy: Record<string, object> = {};

// /svc/{service}/* -> http://localhost:{port}/*  (NO path rewriting)
// Used by getServiceUrl() so the app never makes cross-origin calls. The
// existing /api/{service} entries below strip the service segment, which works
// for services mounted at /api but cannot reach /health at the root — and five
// of eight services send no CORS headers, so direct calls were being blocked
// by the browser entirely.
for (const [service, port] of Object.entries(serviceProxies)) {
  proxy[`/svc/${service}`] = {
    target: `http://localhost:${port}`,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(new RegExp(`^/svc/${service}`), ''),
  };
}

for (const [service, port] of Object.entries(serviceProxies)) {
  proxy[`/api/${service}`] = {
    target: `http://localhost:${port}`,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(new RegExp(`^/api/${service}`), '/api'),
    // Required for SSE connections to work properly
    configure: (proxy: any) => {
      proxy.on('proxyReq', (proxyReq: any, req: any) => {
        // Disable buffering for SSE endpoints
        if (req.url?.includes('/stream')) {
          proxyReq.setHeader('X-Accel-Buffering', 'no');
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
