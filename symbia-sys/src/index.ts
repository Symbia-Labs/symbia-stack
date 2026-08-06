/**
 * @symbia/sys - System utilities and service registry
 *
 * Provides service ID constants, port resolution, and endpoint mappings
 * for all Symbia microservices.
 *
 * Also includes Symbia Script - the unified reference syntax for the platform.
 */

// Symbia Script - unified reference system
export * from './script.js';

// Namespace client - fetches and caches namespace data from services
export * from './namespace-client.js';

// System bootstrap - service-to-service authentication
export * from './bootstrap.js';

// Shared authorization utilities and capabilities
export * from './auth.js';

/**
 * Service identifiers used across the platform
 */
export const ServiceId = {
  /**
   * Reserved. Nothing listens on this. Held so the slot is not claimed by
   * something else. See `RunningServices` — anything enumerating this registry
   * in order to *reach* a service must exclude it, and must do so through that
   * export rather than by repeating the filter.
   */
  SERVER: "server",
  IDENTITY: "identity",
  LOGGING: "logging",
  CATALOG: "catalog",
  ASSISTANTS: "assistants",
  MESSAGING: "messaging",
  RUNTIME: "runtime",
  INTEGRATIONS: "integrations",
  MODELS: "models",
  NETWORK: "network",
  /** Operator console. Serves its own built assets and proxies /svc/{id}. */
  CONTROL_CENTER: "control-center",
  /** Admin/API front end. Was `service-admin` on 3000, unregistered. */
  API: "api",
} as const;

export type ServiceId = (typeof ServiceId)[keyof typeof ServiceId];

/**
 * Default ports for each service.
 *
 * Tiers: base services 5000+, control center 8000, API 9000.
 */
export const ServicePorts: Record<ServiceId, number> = {
  [ServiceId.SERVER]: 5000,
  [ServiceId.IDENTITY]: 5001,
  [ServiceId.LOGGING]: 5002,
  [ServiceId.CATALOG]: 5003,
  [ServiceId.ASSISTANTS]: 5004,
  [ServiceId.MESSAGING]: 5005,
  [ServiceId.RUNTIME]: 5006,
  [ServiceId.INTEGRATIONS]: 5007,
  [ServiceId.MODELS]: 5008,
  [ServiceId.NETWORK]: 5009,
  [ServiceId.CONTROL_CENTER]: 8000,
  [ServiceId.API]: 9000,
};

/**
 * Services that actually listen.
 *
 * `SERVER` is registered but not running, so "registered" and "running" are
 * different predicates. This is the ONE place that difference is expressed.
 * A second copy of this filter — inline in a proxy config, a compose
 * generator, a health sweep — is the drift this export exists to prevent.
 */
export const RunningServices: ServiceId[] = (
  Object.values(ServiceId) as ServiceId[]
).filter((id) => id !== ServiceId.SERVER);

/**
 * Local development endpoints for each service.
 *
 * Derived from ServicePorts. Previously hand-maintained alongside it, which
 * meant the two could disagree and nothing would say so.
 */
export const ServiceLocalEndpoints: Record<ServiceId, string> =
  Object.fromEntries(
    (Object.entries(ServicePorts) as [ServiceId, number][]).map(
      ([id, port]) => [id, `http://localhost:${port}`]
    )
  ) as Record<ServiceId, string>;

/**
 * Environment variable names for service ports
 */
const ServicePortEnvVars: Record<ServiceId, string> = {
  [ServiceId.SERVER]: "SERVER_PORT",
  [ServiceId.IDENTITY]: "IDENTITY_PORT",
  [ServiceId.LOGGING]: "LOGGING_PORT",
  [ServiceId.CATALOG]: "CATALOG_PORT",
  [ServiceId.ASSISTANTS]: "ASSISTANTS_PORT",
  [ServiceId.MESSAGING]: "MESSAGING_PORT",
  [ServiceId.RUNTIME]: "RUNTIME_PORT",
  [ServiceId.INTEGRATIONS]: "INTEGRATIONS_PORT",
  [ServiceId.MODELS]: "MODELS_PORT",
  [ServiceId.NETWORK]: "NETWORK_PORT",
  [ServiceId.CONTROL_CENTER]: "CONTROL_CENTER_PORT",
  [ServiceId.API]: "API_PORT",
};

/**
 * Resolve the port for a service.
 *
 * Priority:
 * 1. Service-specific environment variable (e.g., IDENTITY_PORT)
 * 2. Generic PORT environment variable
 * 3. Default port from ServicePorts
 *
 * @param serviceId - The service identifier
 * @returns The resolved port number
 */
export function resolveServicePort(serviceId: ServiceId | string): number {
  const id = serviceId as ServiceId;

  // Check service-specific env var
  const serviceEnvVar = ServicePortEnvVars[id];
  if (serviceEnvVar && process.env[serviceEnvVar]) {
    const port = parseInt(process.env[serviceEnvVar]!, 10);
    if (!isNaN(port)) return port;
  }

  // Check generic PORT env var
  if (process.env.PORT) {
    const port = parseInt(process.env.PORT, 10);
    if (!isNaN(port)) return port;
  }

  // Return default port
  return ServicePorts[id] ?? 3000;
}

/**
 * Resolve the HOST a service is reachable at.
 *
 * `{SERVICE_ID}_HOST` if set, else localhost. In compose the service name is
 * the DNS name, so compose sets these explicitly rather than relying on a
 * default that means different things in different places.
 *
 * This exists because two proxies had two conventions: the control center
 * defaulted to `localhost`, service-admin defaulted to the docker service
 * name. Same concern, two implementations, which is the defect that let
 * identity's forked authMiddleware survive a patch to @symbia/auth. Both now
 * call this.
 */
export function resolveServiceHost(serviceId: ServiceId | string): string {
  const envVar = `${String(serviceId).toUpperCase().replace(/-/g, "_")}_HOST`;
  return process.env[envVar] || "localhost";
}

/**
 * Resolve the full base URL for a service: host from the environment, port
 * from the registry. Never a hardcoded literal at the call site.
 */
export function resolveServiceTarget(serviceId: ServiceId | string): string {
  const id = serviceId as ServiceId;
  return `http://${resolveServiceHost(id)}:${resolveServicePort(id)}`;
}

/**
 * Get the local endpoint URL for a service
 *
 * @param serviceId - The service identifier
 * @returns The local endpoint URL
 */
export function getServiceLocalEndpoint(serviceId: ServiceId | string): string {
  const id = serviceId as ServiceId;
  return ServiceLocalEndpoints[id] ?? `http://localhost:${resolveServicePort(id)}`;
}

/**
 * Get environment variable for service URL
 *
 * @param serviceId - The service identifier
 * @returns The environment variable name for the service URL
 */
export function getServiceUrlEnvVar(serviceId: ServiceId | string): string {
  const id = (serviceId as string).toUpperCase().replace(/-/g, "_");
  return `${id}_SERVICE_URL`;
}

/**
 * Resolve service URL from environment or default
 *
 * @param serviceId - The service identifier
 * @returns The service URL
 */
export function resolveServiceUrl(serviceId: ServiceId | string): string {
  const envVar = getServiceUrlEnvVar(serviceId);
  return process.env[envVar] ?? getServiceLocalEndpoint(serviceId);
}
