// Symbia service definitions using @symbia/sys
import { ServiceId, ServicePorts, ServiceLocalEndpoints } from '@symbia/sys';

export interface ServiceConfig {
  id: string;
  name: string;
  port: number;
  description: string;
  color: string;
}

// Service display config with colors for UI
const SERVICE_COLORS: Record<string, string> = {
  [ServiceId.NETWORK]: '#8b5cf6',     // purple
  [ServiceId.IDENTITY]: '#06b6d4',    // cyan
  [ServiceId.LOGGING]: '#22c55e',     // green
  [ServiceId.CATALOG]: '#f59e0b',     // amber
  [ServiceId.ASSISTANTS]: '#ec4899',  // pink
  [ServiceId.MESSAGING]: '#00d4ff',   // primary cyan
  [ServiceId.RUNTIME]: '#f97316',     // orange
  [ServiceId.INTEGRATIONS]: '#a855f7', // violet
};

const SERVICE_DESCRIPTIONS: Record<string, string> = {
  [ServiceId.NETWORK]: 'Service mesh & event routing',
  [ServiceId.IDENTITY]: 'Auth, users, organizations',
  [ServiceId.LOGGING]: 'Telemetry, metrics, traces',
  [ServiceId.CATALOG]: 'Resource registry & versioning',
  [ServiceId.ASSISTANTS]: 'AI assistant orchestration',
  [ServiceId.MESSAGING]: 'Real-time messaging bus',
  [ServiceId.RUNTIME]: 'Graph execution engine',
  [ServiceId.INTEGRATIONS]: 'Third-party API gateway',
};

const SERVICE_NAMES: Record<string, string> = {
  [ServiceId.NETWORK]: 'Network',
  [ServiceId.IDENTITY]: 'Identity',
  [ServiceId.LOGGING]: 'Logging',
  [ServiceId.CATALOG]: 'Catalog',
  [ServiceId.ASSISTANTS]: 'Assistants',
  [ServiceId.MESSAGING]: 'Messaging',
  [ServiceId.RUNTIME]: 'Runtime',
  [ServiceId.INTEGRATIONS]: 'Integrations',
};

// Export service list for UI
export const SERVICES: ServiceConfig[] = [
  ServiceId.NETWORK,
  ServiceId.IDENTITY,
  ServiceId.LOGGING,
  ServiceId.CATALOG,
  ServiceId.ASSISTANTS,
  ServiceId.MESSAGING,
  ServiceId.RUNTIME,
  ServiceId.INTEGRATIONS,
].map((id) => ({
  id,
  name: SERVICE_NAMES[id] || id,
  port: ServicePorts[id],
  description: SERVICE_DESCRIPTIONS[id] || '',
  color: SERVICE_COLORS[id] || '#64748b',
}));

// Get service URL - in browser, use local endpoints
export function getServiceUrl(serviceId: string): string {
  // In dev, go through the Vite proxy — never straight at http://localhost:PORT.
  //
  // Absolute URLs make these cross-origin requests, and only messaging, runtime
  // and network send CORS headers. That is precisely why the dashboard read
  // "3/8 healthy" while every container was in fact healthy, and why the
  // Integrations panel died with "Failed to fetch": the browser blocked the
  // response before the app ever saw it. The proxy makes them same-origin.
  //
  // Health lives at /health (root) on every service, while the API lives under
  // /api — so callers append either. `/svc/{id}` is proxied to the service
  // root, which serves both without rewriting away path segments.
  // Do NOT gate this on import.meta.env.DEV — measured in the running page,
  // that flag is FALSE here even under `npm run dev` (NODE_ENV leaks in from
  // the environment), so an earlier version of this fix silently did nothing.
  // Detect the dev server by the origin actually serving the page instead.
  if (typeof window !== 'undefined' && window.location.port === '5173') {
    return `/svc/${serviceId}`;
  }

  const endpoint = ServiceLocalEndpoints[serviceId as keyof typeof ServiceLocalEndpoints];
  if (endpoint) return endpoint;

  // Fallback
  const service = SERVICES.find((s) => s.id === serviceId);
  if (!service) throw new Error(`Unknown service: ${serviceId}`);
  return `http://localhost:${service.port}`;
}

// Re-export ServiceId for convenience
export { ServiceId, ServicePorts, ServiceLocalEndpoints };
