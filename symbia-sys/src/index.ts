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
  IDENTITY: "identity",
  LOGGING: "logging",
  CATALOG: "catalog",
  ASSISTANTS: "assistants",
  MESSAGING: "messaging",
  NETWORK: "network",
  SERVER: "server",
  RUNTIME: "runtime",
  INTEGRATIONS: "integrations",
} as const;

export type ServiceId = (typeof ServiceId)[keyof typeof ServiceId];

/**
 * Default ports for each service
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
  [ServiceId.NETWORK]: 5054,
};

/**
 * Local development endpoints for each service
 */
export const ServiceLocalEndpoints: Record<ServiceId, string> = {
  [ServiceId.SERVER]: "http://localhost:5000",
  [ServiceId.IDENTITY]: "http://localhost:5001",
  [ServiceId.LOGGING]: "http://localhost:5002",
  [ServiceId.CATALOG]: "http://localhost:5003",
  [ServiceId.ASSISTANTS]: "http://localhost:5004",
  [ServiceId.MESSAGING]: "http://localhost:5005",
  [ServiceId.RUNTIME]: "http://localhost:5006",
  [ServiceId.INTEGRATIONS]: "http://localhost:5007",
  [ServiceId.NETWORK]: "http://localhost:5054",
};

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
  [ServiceId.NETWORK]: "NETWORK_PORT",
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
