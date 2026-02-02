/**
 * Assistants Service Configuration
 */

import dotenv from 'dotenv';
import { resolveServicePort, resolveServiceUrl, ServiceId } from '@symbia/sys';
dotenv.config();

export const config = {
  port: resolveServicePort(ServiceId.ASSISTANTS),
  databaseUrl: process.env.DATABASE_URL || '',
  identityServiceUrl: resolveServiceUrl(ServiceId.IDENTITY),
  catalogServiceUrl: resolveServiceUrl(ServiceId.CATALOG),
  messagingServiceUrl: resolveServiceUrl(ServiceId.MESSAGING),
  integrationsServiceUrl: resolveServiceUrl(ServiceId.INTEGRATIONS),
  serviceId: process.env.SERVICE_ID || ServiceId.ASSISTANTS,
  serviceName: process.env.SERVICE_NAME || 'Symbia Assistants',

  // Rate limiting (disabled by default)
  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED === 'true',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),

  // Turn-taking protocol
  claimWindowMs: parseInt(process.env.ASSISTANT_CLAIM_WINDOW_MS || '100', 10),
};
