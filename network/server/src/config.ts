/**
 * Network Service Configuration
 */

import { ServiceId, ServicePorts, resolveServiceUrl, resolveServicePort } from '@symbia/sys';

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
  // I got this wrong on 6 Aug and a browser caught it. I trimmed this list to
  // only the Vite dev server on 5173 — a port that no longer exists — and did
  // not add 8000, where the console now actually lives. Measured:
  //
  //   Origin: http://localhost:5173  ->  101 Switching Protocols
  //   Origin: http://localhost:8000  ->  400 Bad Request
  //
  // HTTP calls were fine because they are genuinely same-origin through the
  // /svc proxy. But Socket.IO checks Origin on the handshake regardless of who
  // proxied it, so the network graph's socket was the one thing the proxy
  // could not make same-origin. Every HTTP-level check passed while the
  // network panel retried forever — the exact "API call works, button does
  // nothing" failure this project hunts.
  //
  // Derived from the registry, so moving the console's port cannot orphan this
  // the way hardcoding 5173 did.
  corsOrigins: getEnvArray('CORS_ORIGINS', [
    `http://localhost:${ServicePorts[ServiceId.CONTROL_CENTER]}`,
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
