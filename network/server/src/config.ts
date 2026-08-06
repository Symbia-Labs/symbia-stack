/**
 * Network Service Configuration
 */

import { ServiceId, resolveServiceUrl, resolveServicePort } from '@symbia/sys';

function getEnvArray(key: string, defaultValue: string[]): string[] {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

export const config = {
  serviceId: ServiceId.NETWORK,
  // Derived. Was `parseInt(process.env.PORT || '5054', 10)` — a hardcoded
  // default in a file that already imports the registry holding it.
  port: resolveServicePort(ServiceId.NETWORK),
  host: process.env.HOST || '0.0.0.0',

  // CORS origins.
  //
  // The control center is served from its own service on 8000 and calls
  // services through its own /svc/{id} proxy, so it is same-origin and needs
  // no entry here. The 5173 Vite entry is retained only until step 6 of
  // docs/2026-08-06-control-center-rebuild.md removes the dev server.
  corsOrigins: getEnvArray('CORS_ORIGINS', [
    'http://localhost:5173', // Vite dev server (control center) — removed at step 6
  ]),

  // Service endpoints - resolved via @symbia/sys (supports env overrides)
  identityServiceUrl: process.env.IDENTITY_SERVICE_URL || resolveServiceUrl(ServiceId.IDENTITY),
  loggingServiceUrl: process.env.TELEMETRY_ENDPOINT || resolveServiceUrl(ServiceId.LOGGING),

  // Rate limiting (disabled by default)
  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED === 'true',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),

  // Network configuration
  heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '30000', 10),
  nodeTimeoutMs: parseInt(process.env.NODE_TIMEOUT_MS || '90000', 10),
  maxEventHistorySize: parseInt(process.env.MAX_EVENT_HISTORY_SIZE || '10000', 10),
  maxTraceHistorySize: parseInt(process.env.MAX_TRACE_HISTORY_SIZE || '5000', 10),
};
