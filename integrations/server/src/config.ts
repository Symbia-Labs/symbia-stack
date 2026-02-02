/**
 * Integrations Service Configuration
 */

import dotenv from 'dotenv';
import { resolveServicePort, resolveServiceUrl, ServiceId } from '@symbia/sys';
dotenv.config();

export const config = {
  port: resolveServicePort(ServiceId.INTEGRATIONS),
  databaseUrl: process.env.DATABASE_URL || '',
  identityServiceUrl: resolveServiceUrl(ServiceId.IDENTITY),
  serviceId: process.env.SERVICE_ID || ServiceId.INTEGRATIONS,
  serviceName: process.env.SERVICE_NAME || 'Symbia Integrations',

  // Rate limiting (disabled by default)
  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED === 'true',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  rateLimitUserLimit: parseInt(process.env.RATE_LIMIT_USER || '100', 10),
  rateLimitOrgLimit: parseInt(process.env.RATE_LIMIT_ORG || '500', 10),
  rateLimitProviderLimit: parseInt(process.env.RATE_LIMIT_PROVIDER || '1000', 10),
};
