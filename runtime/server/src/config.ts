import dotenv from 'dotenv';
import { resolveServicePort, resolveServiceUrl, ServiceId } from '@symbia/sys';
dotenv.config();

export const config = {
  port: resolveServicePort(ServiceId.RUNTIME),
  identityServiceUrl: resolveServiceUrl(ServiceId.IDENTITY),
  serviceId: process.env.SERVICE_ID || ServiceId.RUNTIME,
  serviceName: process.env.SERVICE_NAME || 'Symbia Runtime',
  corsOrigins: (process.env.CORS_ALLOWED_ORIGINS || process.env.CORS_ORIGINS || '*')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean),

  // Runtime-specific configuration
  runtime: {
    // Maximum concurrent graph executions
    maxConcurrentExecutions: parseInt(process.env.MAX_CONCURRENT_EXECUTIONS || '100', 10),
    // Default execution timeout (ms)
    defaultExecutionTimeout: parseInt(process.env.DEFAULT_EXECUTION_TIMEOUT || '300000', 10),
    // Maximum messages in backpressure queue per port
    maxBackpressureQueue: parseInt(process.env.MAX_BACKPRESSURE_QUEUE || '10000', 10),
    // Isolate pool size for V8 instances
    isolatePoolSize: parseInt(process.env.ISOLATE_POOL_SIZE || '10', 10),
    // Enable metrics collection
    enableMetrics: process.env.ENABLE_METRICS !== 'false',
  },
};
