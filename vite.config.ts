import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Service proxy configuration - maps /api/{service} to localhost:{port}/api
const serviceProxies = {
  identity: 5001,
  logging: 5002,
  catalog: 5003,
  assistants: 5004,
  messaging: 5005,
  runtime: 5006,
  integrations: 5007,
  network: 5054,
  // Symbia Energy — runs natively on :5010 (dev/local standard: local process,
  // JSONL sink, no remote TSDB). Proxied like every other service so the app
  // never makes a cross-origin call; that defect has now cost this project
  // three separate debugging sessions.
  energy: 5010,
};

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
