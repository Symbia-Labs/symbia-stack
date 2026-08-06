// Service endpoints.
//
// SYMBIA_MARKER_A4_ENDPOINTS_PROXY_20260805
//
// This file is the second half of a forked concern. config/services.ts had
// the same defect, was fixed, and the fix did not reach here — the same shape
// as identity's authMiddleware surviving a patch to @symbia/auth. Both halves
// are now one line each, calling the same thing, so there is nothing left to
// fork.
//
// The defect both files carried: choosing between a dev proxy and an absolute
// http://localhost:PORT URL. `import.meta.env.DEV` measured FALSE in the
// running page even under `npm run dev`, so identity calls fell through to
// absolute URLs; identity sends no CORS headers, so the browser blocked the
// response before the app saw it, surfacing as "Failed to load credentials:
// TypeError: Failed to fetch" and rendering every provider as
// "Not configured".
//
// The page is now served by the control center service, which proxies
// /svc/{id} on the same origin in every environment. No branch.
import { ServiceId } from '@symbia/sys';
import { getServiceUrl } from './services';

function buildUrl(serviceId: string): string {
  return `${getServiceUrl(serviceId)}/api`;
}

// Socket URLs go through the proxy too. They previously did NOT — they dialled
// http://localhost:PORT directly, which made them cross-origin where the HTTP
// calls beside them were not (F6). That worked only because messaging and
// network happen to be two of the four services that send CORS headers; it was
// never a design, just a survivor.
//
// Socket.IO takes the page origin plus an explicit path. The upgrade request
// then goes to /svc/{id}/socket.io on this server, which strips the prefix and
// forwards /socket.io to the service — identical to how every HTTP call is
// handled, over the same origin, through the same proxy.
function buildSocketUrl(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

/**
 * Socket.IO `path` option for a service.
 *
 * Must be passed wherever `io()` is called. Without it Socket.IO defaults to
 * `/socket.io`, which on this origin is the control center's own root and
 * belongs to no service — the connection would hang rather than fail loudly,
 * which is the worse of the two outcomes.
 */
export function socketPath(serviceId: string): string {
  return `/svc/${serviceId}/socket.io`;
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
    // The Socket.IO origin. Paired with socketPath('messaging') at the io()
    // call site — the origin alone is not enough.
    get base() {
      return buildSocketUrl();
    },
    // HTTP. Note this used to be `${base}/api`, which after base became the
    // page origin would have resolved to http://localhost:8000/api — this
    // service's own root, not messaging's. Caught before it shipped, but it is
    // exactly the class of thing that survives a port: a getter that still
    // composes cleanly and now means something else.
    get api() {
      return `${buildUrl(ServiceId.MESSAGING)}`;
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
      return buildSocketUrl();
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
