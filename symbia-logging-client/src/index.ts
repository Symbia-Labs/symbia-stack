/**
 * @symbia/telem - Shared telemetry client for Symbia services
 *
 * This package provides standardized telemetry (logging, metrics, tracing, object tracking)
 * for all Symbia microservices. It handles:
 * - Batched telemetry data shipping to Symbia Logging Service
 * - Automatic retry with exponential backoff
 * - Queue management with configurable limits
 * - Standard metric definitions
 * - Distributed tracing support
 *
 * @example
 * ```typescript
 * import { createTelemetryClient } from '@symbia/telem';
 *
 * const telemetry = createTelemetryClient({
 *   serviceId: 'my-service',
 * });
 *
 * // Track events
 * telemetry.event('service.started', 'Service initialized successfully');
 *
 * // Record metrics
 * telemetry.metric('service.request.count', 1, { endpoint: '/api/users' });
 *
 * // Log messages
 * telemetry.log('info', 'Processing request', { userId: '123' });
 *
 * // Distributed tracing
 * telemetry.span({
 *   traceId: 'trace-123',
 *   spanId: 'span-456',
 *   name: 'database.query',
 *   startTime: '2024-01-01T00:00:00Z',
 *   endTime: '2024-01-01T00:00:01Z',
 * });
 *
 * // Graceful shutdown
 * await telemetry.shutdown();
 * ```
 */

export * from "./types.js";
export * from "./client.js";
export * from "./config.js";
export * from "./metrics.js";
