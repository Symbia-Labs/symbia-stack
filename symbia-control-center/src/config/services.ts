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

/**
 * Where to reach a service from the browser.
 *
 * Always same-origin, in every environment. The page is served by the control
 * center service on 8000, which proxies /svc/{id} to that service's root.
 *
 * There is no branch here any more, and that is the point of the rebuild.
 * This function used to choose between a dev proxy and an absolute
 * http://localhost:PORT URL. Absolute URLs are cross-origin, and five of the
 * services send no CORS headers, so the browser blocked responses before the
 * app saw them — which is why the dashboard read "3/8 healthy" on a stack
 * where every container was healthy, and why every integration provider
 * rendered as "Not configured".
 *
 * Two attempts to pick the right branch both failed:
 *   - `import.meta.env.DEV` measured FALSE in the running page even under
 *     `npm run dev`, because NODE_ENV leaked in from the environment.
 *   - `window.location.port === '5173'` worked, but only because a dev server
 *     happened to be on that port, and it left production silently taking the
 *     cross-origin path.
 *
 * A branch that cannot be evaluated correctly should not exist. Now there is
 * one origin and no decision.
 *
 * Path shape: /svc/{id} maps to the service ROOT, so callers append either
 * `/health` (root) or `/api/...` themselves.
 */
export function getServiceUrl(serviceId: string): string {
  return `/svc/${serviceId}`;
}

// Re-export ServiceId for convenience
export { ServiceId, ServicePorts, ServiceLocalEndpoints };
