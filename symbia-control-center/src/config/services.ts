// Symbia service definitions using @symbia/sys
import { ServiceId, ServicePorts, ServiceLocalEndpoints, ProxiedServices } from '@symbia/sys';

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
  [ServiceId.MODELS]: '#14b8a6',      // teal
  [ServiceId.API]: '#f43f5e',         // rose
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
  [ServiceId.MODELS]: 'Local model inference',
  [ServiceId.API]: 'Admin & service API',
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
  [ServiceId.MODELS]: 'Models',
  [ServiceId.API]: 'API',
};

/**
 * The services the console displays and health-checks.
 *
 * DERIVED, not listed. This was a hand-written literal of eight — network,
 * identity, logging, catalog, assistants, messaging, runtime, integrations —
 * while the registry held ten reachable services and the server's proxy
 * already derived all ten correctly. `models` and `api` were missing.
 *
 * The visible symptom was the Overview tile reading **8/8, "responding to
 * /health"** on a stack running eleven containers, with the mesh reporting
 * ten nodes. Brian asked "I thought this should show 11/11 by now?" and the
 * card had no way to answer, because it was not counting a total — it was
 * counting the length of this array.
 *
 * That tile takes care to separate healthy from unhealthy from unknown, and it
 * was still wrong, because the care went into the numerator. `models` and
 * `api` were not unknown; they were never asked. Blank beats green, but only
 * if the thing you failed to ask about is still in the denominator.
 *
 * Measured 8 Aug 2026 through the console's own proxy: all ten answer
 * `/health` with HTTP 200. `control-center` answers 404 there and is excluded
 * by `ProxiedServices` — the console does not proxy to itself.
 */
export const SERVICES: ServiceConfig[] = ProxiedServices.map((id) => ({
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
