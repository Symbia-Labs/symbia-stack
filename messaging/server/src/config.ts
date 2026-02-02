import dotenv from 'dotenv';
import { resolveServicePort, resolveServiceUrl, ServiceId } from '@symbia/sys';
dotenv.config();

export const config = {
  port: resolveServicePort(ServiceId.MESSAGING),
  databaseUrl: process.env.DATABASE_URL || '',
  identityServiceUrl: resolveServiceUrl(ServiceId.IDENTITY),
  serviceId: process.env.SERVICE_ID || ServiceId.MESSAGING,
  serviceName: process.env.SERVICE_NAME || 'Symbia Messaging',
  corsOrigins: (process.env.CORS_ALLOWED_ORIGINS || process.env.CORS_ORIGINS || '*')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean),
  assistantsWebhookUrl: process.env.ASSISTANTS_WEBHOOK_URL || `${resolveServiceUrl(ServiceId.ASSISTANTS)}/api/webhook/messaging`,

  // Rate limiting (disabled by default)
  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED === 'true',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),

  // Timeout configurations
  // Increased webhook timeout to 60s to allow complex assistant processing
  webhookTimeoutMs: parseInt(process.env.WEBHOOK_TIMEOUT_MS || '60000', 10),
  httpRequestTimeoutMs: parseInt(process.env.HTTP_REQUEST_TIMEOUT_MS || '120000', 10),
  // Socket.IO ping configuration
  // pingTimeout should be ~2x pingInterval to handle network jitter
  // pingInterval: How often to send ping packets (25s)
  // pingTimeout: How long to wait for pong before disconnect (60s = 2.4x interval)
  socketPingTimeoutMs: parseInt(process.env.SOCKET_PING_TIMEOUT_MS || '60000', 10),
  socketPingIntervalMs: parseInt(process.env.SOCKET_PING_INTERVAL_MS || '25000', 10),
};
