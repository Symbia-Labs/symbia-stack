/**
 * Logging Service Configuration
 */

import dotenv from 'dotenv';
import { resolveServicePort, resolveServiceUrl, ServiceId } from '@symbia/sys';
dotenv.config();

export const config = {
  port: resolveServicePort(ServiceId.LOGGING),
  databaseUrl: process.env.DATABASE_URL || '',
  identityServiceUrl: resolveServiceUrl(ServiceId.IDENTITY),
  serviceId: process.env.SERVICE_ID || ServiceId.LOGGING,
  serviceName: process.env.SERVICE_NAME || 'Symbia Logging',

  // Auth mode: 'required' | 'optional' | 'off'
  authMode: (process.env.LOGGING_AUTH_MODE ||
    (process.env.NODE_ENV === 'production' ? 'required' : 'optional')) as 'required' | 'optional' | 'off',

  // Rate limiting (disabled by default)
  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED === 'true',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),

  // Default scope values for telemetry
  defaults: {
    orgId: process.env.LOGGING_DEFAULT_ORG_ID || 'symbia-dev',
    serviceId: process.env.LOGGING_DEFAULT_SERVICE_ID || 'logging-service',
    env: process.env.LOGGING_DEFAULT_ENV || (process.env.NODE_ENV === 'production' ? 'prod' : 'dev'),
    dataClass: process.env.LOGGING_DEFAULT_DATA_CLASS || 'none',
    policyRef: process.env.LOGGING_DEFAULT_POLICY_REF || 'policy/default',
  },
};
