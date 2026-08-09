/**
 * Integrations Service Configuration
 */

import dotenv from 'dotenv';
import { resolveServicePort, resolveServiceUrl, ServiceId, ServicePorts } from '@symbia/sys';
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

  /**
   * Where a browser is sent when an OAuth callback fails.
   *
   * This is a redirect for the *user's* browser, so it must be an externally
   * reachable URL. The service cannot derive one — it knows the port it was
   * registered on, not the address a browser outside the network reaches it
   * at — so a real deployment has to say. `oauthRedirectConfigured` records
   * whether anyone did.
   *
   * The previous fallback was a literal `http://localhost:3000`, a port retired
   * when service-admin moved to 9000, pointing at a marketing site that is no
   * longer in this repo. Neither OAUTH_ERROR_REDIRECT_URL nor WEBSITE_URL is
   * set in .env.example or compose, so that dead address was not an edge case:
   * it was the only path this code ever took.
   */
  oauthErrorRedirectUrl:
    process.env.OAUTH_ERROR_REDIRECT_URL ||
    process.env.WEBSITE_URL ||
    `http://localhost:${ServicePorts[ServiceId.CONTROL_CENTER]}`,
  oauthRedirectConfigured: Boolean(
    process.env.OAUTH_ERROR_REDIRECT_URL || process.env.WEBSITE_URL
  ),
};
