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

  // Rate limiting (disabled by default)
  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED === 'true',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),

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
    // How hard to enforce that a graph node's component has a registered
    // catalog manifest: strict (refuse to load) | warn (log and load) | off.
    // Strict is the default deliberately — a gate that can be skipped by
    // default is not a gate.
    manifestEnforcement: (process.env.RUNTIME_MANIFEST_ENFORCEMENT || 'strict') as
      | 'strict'
      | 'warn'
      | 'off',
  },

  // Catalog -> runtime edge (roadmap Phase 1). The catalog is the source of
  // truth for components and graphs; the runtime is the handler.
  catalog: {
    // Publish this runtime's component manifests to the catalog on boot.
    registerManifests: process.env.RUNTIME_REGISTER_MANIFESTS !== 'false',
    // Load published graph resources from the catalog on boot.
    hydrateGraphs: process.env.RUNTIME_HYDRATE_GRAPHS !== 'false',
    // Auto-execute hydrated graphs declaring a pipeline/service role with an
    // ingress. This is what removes the "someone must stand the execution up"
    // concession.
    autoExecute: process.env.RUNTIME_AUTO_EXECUTE !== 'false',
    // Reconciliation poll interval (ms). 0 disables the loop (boot-only sync).
    // Polling is the interim; the roadmap's end state drives this off Network
    // service events.
    reconcileIntervalMs: parseInt(process.env.RUNTIME_RECONCILE_INTERVAL_MS || '30000', 10),
    // Fail service startup if the boot-time catalog sync fails. Off by default
    // so a catalog outage degrades the runtime rather than removing it — but
    // strict manifest enforcement still refuses to load graphs, so the
    // degradation is loud, not silent.
    failFast: process.env.RUNTIME_CATALOG_FAIL_FAST === 'true',
  },
};
