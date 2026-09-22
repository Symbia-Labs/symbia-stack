/**
 * Express Middleware for Ephemeral Observability
 *
 * Automatically emits HTTP request/response events through the relay
 * for real-time observability without persistent storage.
 *
 * @example
 * ```ts
 * import { observabilityMiddleware } from '@symbia/relay';
 *
 * app.use(observabilityMiddleware({
 *   excludePaths: ['/health', '/health/live', '/health/ready'],
 * }));
 * ```
 */
import type { Request, Response, NextFunction } from 'express';
export interface ObservabilityMiddlewareOptions {
    /** Paths to exclude from observability (e.g., health checks) */
    excludePaths?: string[];
    /** Patterns to exclude (regex) */
    excludePatterns?: RegExp[];
    /** Include request headers (filtered for sensitive data) */
    includeHeaders?: boolean;
    /** Headers to exclude from logging */
    excludeHeaders?: string[];
    /** Slow request threshold in ms (emits warning event) */
    slowRequestThresholdMs?: number;
    /** Custom trace ID header name */
    traceIdHeader?: string;
}
/**
 * Express middleware that emits HTTP observability events.
 * Events flow through the SDN and can be watched in real-time.
 */
export declare function observabilityMiddleware(options?: ObservabilityMiddlewareOptions): (req: Request, res: Response, next: NextFunction) => void;
/**
 * Simplified middleware that only tracks timing (minimal overhead).
 * Useful for high-traffic endpoints where full observability isn't needed.
 */
export declare function timingMiddleware(options?: {
    slowThresholdMs?: number;
}): (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=middleware.d.ts.map