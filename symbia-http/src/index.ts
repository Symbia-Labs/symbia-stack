/**
 * @symbia/http - Shared Express server setup for Symbia services
 *
 * This package provides standardized Express server configuration and middleware
 * for all Symbia microservices. It handles:
 * - CORS with wildcard pattern support
 * - Multi-tenant scope headers (X-Org-Id, X-Service-Id, etc.)
 * - Telemetry integration (metrics, tracing, events)
 * - Request/response logging
 * - Session management (optional)
 * - Health check endpoints
 * - Graceful shutdown
 *
 * @example
 * ```typescript
 * import { createSymbiaServer } from '@symbia/http';
 * import { createTelemetryClient } from '@symbia/logging-client';
 *
 * const telemetry = createTelemetryClient({ serviceId: 'my-service' });
 *
 * const server = createSymbiaServer({
 *   serviceId: 'my-service',
 *   telemetry: { client: telemetry },
 *   registerRoutes: async (httpServer, app) => {
 *     app.get('/api/data', (req, res) => res.json({ data: [] }));
 *   },
 * });
 *
 * await server.start();
 * ```
 */

export * from "./types.js";
export * from "./server.js";
export * from "./cors.js";
export * from "./telemetry.js";
export * from "./logging.js";
export * from "./scope.js";
