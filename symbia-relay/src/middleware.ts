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
import { withTrace, traceIdFromHeaders, callerFromHeaders, mintTraceId } from './trace-context.js';
import { emitHttpRequest, emitHttpResponse } from './integration.js';
import type { HttpRequestEvent, HttpResponseEvent } from './integration.js';

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

const DEFAULT_EXCLUDE_HEADERS = [
  'authorization',
  'cookie',
  'x-api-key',
  'x-auth-token',
];

/**
 * Express middleware that emits HTTP observability events.
 * Events flow through the SDN and can be watched in real-time.
 */
export function observabilityMiddleware(
  options: ObservabilityMiddlewareOptions = {}
): (req: Request, res: Response, next: NextFunction) => void {
  const {
    excludePaths = ['/health', '/health/live', '/health/ready', '/favicon.ico'],
    excludePatterns = [],
    includeHeaders = false,
    excludeHeaders = DEFAULT_EXCLUDE_HEADERS,
    slowRequestThresholdMs = 5000,
    traceIdHeader = 'x-trace-id',
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Check exclusions
    if (excludePaths.includes(req.path)) {
      next();
      return;
    }

    for (const pattern of excludePatterns) {
      if (pattern.test(req.path)) {
        next();
        return;
      }
    }

    const startTime = Date.now();
    // Adopt the inbound trace, or mint one. `traceIdFromHeaders` also reads
    // W3C `traceparent`, so a request from anything already tracing is not
    // given a second identity halfway through its own journey.
    const traceId =
      (req.headers[traceIdHeader] as string) ||
      traceIdFromHeaders(req.headers as Record<string, unknown>) ||
      mintTraceId();
    // Who called us. Absent for browser-originated requests, which do not send
    // the header, and absent for calls made outside a request's async context.
    // Those are different things and must not be read as one.
    const caller = callerFromHeaders(req.headers as Record<string, unknown>);

    // Build request event data
    const requestEvent: HttpRequestEvent = {
      method: req.method,
      path: req.path,
      query: Object.keys(req.query).length > 0 ? req.query as Record<string, string> : undefined,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      traceId,
      caller,
    };

    // Optionally include filtered headers
    if (includeHeaders) {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (!excludeHeaders.includes(key.toLowerCase()) && typeof value === 'string') {
          headers[key] = value;
        }
      }
      if (Object.keys(headers).length > 0) {
        requestEvent.headers = headers;
      }
    }

    // Emit request event (fire and forget)
    emitHttpRequest(requestEvent, traceId).catch(() => {
      // Ignore errors - observability should not affect request handling
    });

    // Everything downstream of here runs inside this request's trace.
    //
    // The fetch wrapper installed at startup reads this store, so any outbound
    // call made while handling this request carries the same trace id and this
    // service as the caller — without a single call site being changed. Calls
    // made from timers or socket handlers are outside this context and get
    // neither, which is correct: they are not part of this request.
    const serviceId = process.env.SERVICE_ID || process.env.SYMBIA_SERVICE_ID || '';

    // Capture response
    const originalEnd = res.end;
    let responseSize = 0;

    // Track response size
    const originalWrite = res.write;
    res.write = function(chunk: unknown, ...args: unknown[]): boolean {
      if (chunk) {
        responseSize += Buffer.isBuffer(chunk) ? chunk.length : String(chunk).length;
      }
      return originalWrite.apply(res, [chunk, ...args] as Parameters<typeof originalWrite>);
    };

    res.end = function(chunk?: unknown, ...args: unknown[]): Response {
      if (chunk) {
        responseSize += Buffer.isBuffer(chunk) ? chunk.length : String(chunk).length;
      }

      const durationMs = Date.now() - startTime;

      // Build response event
      const responseEvent: HttpResponseEvent = {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs,
        caller,
        size: responseSize > 0 ? responseSize : undefined,
        traceId,
      };

      // Emit response event (fire and forget)
      emitHttpResponse(responseEvent, traceId).catch(() => {
        // Ignore errors
      });

      // Log slow requests
      if (durationMs > slowRequestThresholdMs) {
        console.warn(`[Observability] Slow request: ${req.method} ${req.path} took ${durationMs}ms`);
      }

      return originalEnd.apply(res, [chunk, ...args] as Parameters<typeof originalEnd>);
    };

    // next() INSIDE the store, not after it. AsyncLocalStorage propagates into
    // everything the callback awaits, so the whole downstream handler chain
    // runs in this request's trace. Calling next() outside would establish a
    // context that nothing could see.
    withTrace({ traceId, serviceId }, () => next());
  };
}

/**
 * Simplified middleware that only tracks timing (minimal overhead).
 * Useful for high-traffic endpoints where full observability isn't needed.
 */
export function timingMiddleware(
  options: { slowThresholdMs?: number } = {}
): (req: Request, res: Response, next: NextFunction) => void {
  const { slowThresholdMs = 5000 } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();

    res.on('finish', () => {
      const durationMs = Date.now() - startTime;
      if (durationMs > slowThresholdMs) {
        console.warn(`[Timing] Slow: ${req.method} ${req.path} ${res.statusCode} ${durationMs}ms`);
      }
    });

    next();
  };
}
