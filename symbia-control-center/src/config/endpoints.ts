// Service endpoints - uses @symbia/sys for port definitions
import { ServiceId, ServicePorts } from '@symbia/sys';

// Helper to build endpoint URL
//
// SYMBIA_MARKER_A4_ENDPOINTS_PROXY_20260805
// This file carried the SAME defect that config/services.ts was fixed for
// earlier today, and the fix there did not reach here — a shared-looking
// concern with two independent implementations, which is how identity's
// forked authMiddleware also survived a patch to @symbia/auth.
//
// The defect: gating the proxy on `import.meta.env.DEV`. Measured in the
// running page, that flag is FALSE even under `npm run dev` (NODE_ENV leaks
// in from the environment), so every identity call fell through to an
// absolute http://localhost:5001 URL. Identity sends no CORS headers, so the
// browser blocked the response before the app saw it — surfacing as
// "Failed to load credentials: TypeError: Failed to fetch", which the
// provider cards then rendered as "Not configured" for every provider.
//
// Detect the dev server by the origin actually serving the page, exactly as
// services.ts does.
function buildUrl(serviceId: string, useProxy = true): string {
  const port = ServicePorts[serviceId as keyof typeof ServicePorts];
  if (useProxy && typeof window !== 'undefined' && window.location.port === '5173') {
    return `/svc/${serviceId}/api`;
  }
  const envVar = `VITE_${serviceId.toUpperCase()}_URL`;
  return import.meta.env[envVar] || `http://localhost:${port}/api`;
}

// Direct socket URL (no proxy for WebSocket)
function buildSocketUrl(serviceId: string): string {
  const port = ServicePorts[serviceId as keyof typeof ServicePorts];
  const envVar = `VITE_${serviceId.toUpperCase()}_URL`;
  return import.meta.env[envVar] || `http://localhost:${port}`;
}

export const endpoints = {
  identity: {
    get base() {
      return buildUrl(ServiceId.IDENTITY);
    },
    get login() {
      return `${this.base}/auth/user/login`;
    },
    get register() {
      return `${this.base}/auth/user/register`;
    },
    get logout() {
      return `${this.base}/auth/logout`;
    },
    get me() {
      return `${this.base}/auth/me`;
    },
    get refresh() {
      return `${this.base}/auth/refresh`;
    },
    // Credentials management
    get credentials() {
      return `${this.base}/credentials`;
    },
    credential(id: string) {
      return `${this.credentials}/${id}`;
    },
  },

  messaging: {
    get base() {
      // WebSocket needs direct URL, not proxy
      return buildSocketUrl(ServiceId.MESSAGING);
    },
    get api() {
      return `${this.base}/api`;
    },
    get conversations() {
      return `${this.api}/conversations`;
    },
    messages(conversationId: string) {
      return `${this.api}/conversations/${conversationId}/messages`;
    },
    control(conversationId: string) {
      return `${this.api}/conversations/${conversationId}/control`;
    },
  },

  logging: {
    get base() {
      return buildUrl(ServiceId.LOGGING);
    },
    get stats() {
      return `${this.base}/stats`;
    },
    get logs() {
      return `${this.base}/logs`;
    },
    get logStreams() {
      return `${this.base}/logs/streams`;
    },
    get logsQuery() {
      return `${this.base}/logs/query`;
    },
    get logsIngest() {
      return `${this.base}/logs/ingest`;
    },
    get metrics() {
      return `${this.base}/metrics`;
    },
    get metricsQuery() {
      return `${this.base}/metrics/query`;
    },
    get metricsIngest() {
      return `${this.base}/metrics/ingest`;
    },
    get traces() {
      return `${this.base}/traces`;
    },
    get tracesQuery() {
      return `${this.base}/traces/query`;
    },
  },

  catalog: {
    get base() {
      return buildUrl(ServiceId.CATALOG);
    },
  },

  runtime: {
    get base() {
      return buildUrl(ServiceId.RUNTIME);
    },
  },

  assistants: {
    get base() {
      return buildUrl(ServiceId.ASSISTANTS);
    },
    get graphs() {
      return `${this.base}/v1/graphs`;
    },
    get actors() {
      return `${this.base}/v1/actors`;
    },
    get runs() {
      return `${this.base}/v1/runs`;
    },
    graph(id: string) {
      return `${this.graphs}/${id}`;
    },
    actor(id: string) {
      return `${this.actors}/${id}`;
    },
    run(id: string) {
      return `${this.runs}/${id}`;
    },
  },

  integrations: {
    get base() {
      return buildUrl(ServiceId.INTEGRATIONS);
    },
    get execute() {
      return `${this.base}/integrations/execute`;
    },
    get providers() {
      return `${this.base}/integrations/providers`;
    },
    get status() {
      return `${this.base}/integrations/status`;
    },
    provider(name: string) {
      return `${this.providers}/${name}`;
    },
    providerModels(name: string) {
      return `${this.providers}/${name}/models`;
    },
  },

  network: {
    get base() {
      return buildUrl(ServiceId.NETWORK);
    },
    get socketBase() {
      return buildSocketUrl(ServiceId.NETWORK);
    },
    get nodes() {
      return `${this.base}/sdn/nodes`;
    },
    get contracts() {
      return `${this.base}/sdn/contracts`;
    },
    get bridges() {
      return `${this.base}/sdn/bridges`;
    },
    get topology() {
      return `${this.base}/sdn/topology`;
    },
    get events() {
      return `${this.base}/events`;
    },
    get eventStats() {
      return `${this.events}/stats`;
    },
  },
};
