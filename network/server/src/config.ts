/**
 * Network Service Configuration
 */

import { ServiceId, resolveServiceUrl } from '@symbia/sys';

function getEnvArray(key: string, defaultValue: string[]): string[] {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

export const config = {
  serviceId: ServiceId.NETWORK,
  port: parseInt(process.env.PORT || '5054', 10),
  host: process.env.HOST || '0.0.0.0',

  // CORS origins
  corsOrigins: getEnvArray('CORS_ORIGINS', [
    'http://localhost:3000',
    'http://localhost:5000',
    'http://localhost:5173', // Vite dev server (control center)
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
