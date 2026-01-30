import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Service ports (remapped for Replit available ports)
const services = {
  identity: 8000,
  logging: 8008,
  catalog: 8080,
  assistants: 3000,
  messaging: 3001,
  runtime: 3002,
  integrations: 3003,
  network: 9000,
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
    port: 5000,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
