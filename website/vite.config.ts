import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Service ports
const services = {
  identity: 5001,
  logging: 5002,
  catalog: 5003,
  assistants: 5004,
  messaging: 5005,
  runtime: 5006,
  integrations: 5007,
  network: 5054,
};

const proxy: Record<string, object> = {};

// Proxy /api/{service}/* -> localhost:{port}/api/*
// e.g., /api/catalog/resources -> localhost:5003/api/resources
for (const [service, port] of Object.entries(services)) {
  proxy[`/api/${service}`] = {
    target: `http://localhost:${port}`,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(new RegExp(`^/api/${service}`), '/api'),
    configure: (proxy: any) => {
      proxy.on('proxyReq', (proxyReq: any, req: any) => {
        if (req.url?.includes('/stream')) {
          proxyReq.setHeader('X-Accel-Buffering', 'no');
        }
      });
    },
  };

  // Also proxy /svc/{service}/* -> localhost:{port}/* (no /api prefix)
  // e.g., /svc/catalog/health -> localhost:5003/health
  proxy[`/svc/${service}`] = {
    target: `http://localhost:${port}`,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(new RegExp(`^/svc/${service}`), ''),
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
    port: 8080,
    proxy,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
