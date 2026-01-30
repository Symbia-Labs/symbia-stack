import type { Request, Response, NextFunction } from "express";
import type { TelemetryClient } from "@symbia/logging-client";

/**
 * Format log message with timestamp
 */
export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export interface LoggingMiddlewareOptions {
  verbose?: boolean;
  telemetry?: TelemetryClient;
  excludePaths?: string[];
}

/**
 * Create request/response logging middleware with enhanced verbosity
 *
 * When telemetry is provided, sends structured log entries to the logging service
 * in addition to console output.
 */
export function createLoggingMiddleware(options: LoggingMiddlewareOptions = {}) {
  const verbose = options.verbose ?? true; // Default to verbose
  const telemetry = options.telemetry;
  const excludePathsSet = new Set(options.excludePaths || []);

  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    // Skip excluded paths
    if (excludePathsSet.has(path)) {
      return next();
    }

    // Build request metadata
    const headers: Record<string, any> = {};
    if (req.headers['x-org-id']) headers['x-org-id'] = req.headers['x-org-id'];
    if (req.headers['x-trace-id']) headers['x-trace-id'] = req.headers['x-trace-id'];
    if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];

    const requestInfo: any = {
      method: req.method,
      path,
      query: Object.keys(req.query).length > 0 ? req.query : undefined,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    };

    // Log body for non-GET requests (but sanitize sensitive fields)
    if (req.method !== 'GET' && req.body && Object.keys(req.body).length > 0) {
      const sanitizedBody = { ...req.body };
      if (sanitizedBody.password) sanitizedBody.password = '[REDACTED]';
      if (sanitizedBody.token) sanitizedBody.token = '[REDACTED]';
      if (sanitizedBody.apiKey) sanitizedBody.apiKey = '[REDACTED]';
      if (sanitizedBody.secret) sanitizedBody.secret = '[REDACTED]';
      requestInfo.body = sanitizedBody;
    }

    // Log incoming request to console
    if (verbose) {
      log(`→ ${req.method} ${path} ${JSON.stringify(requestInfo)}`);
    }

    // Send request event to telemetry
    if (telemetry) {
      telemetry.event(
        "http.request",
        `${req.method} ${path}`,
        {
          ...requestInfo,
          direction: "inbound",
        },
        "debug"
      );
    }

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      const status = res.statusCode;
      const isError = status >= 400;

      // Build response metadata
      const responseInfo: Record<string, any> = {
        method: req.method,
        path,
        status,
        duration,
      };

      // Include truncated response body for errors or verbose mode
      if (capturedJsonResponse && (isError || verbose)) {
        const jsonStr = JSON.stringify(capturedJsonResponse);
        if (jsonStr.length > 500) {
          responseInfo.responseBody = jsonStr.substring(0, 500) + '...';
          responseInfo.responseTruncated = true;
          responseInfo.responseSize = jsonStr.length;
        } else {
          responseInfo.responseBody = capturedJsonResponse;
        }
      }

      // Log to console
      if (path.startsWith("/api") || path.startsWith("/health") || verbose) {
        let logLine = `← ${req.method} ${path} ${status} in ${duration}ms`;

        if (verbose && capturedJsonResponse) {
          const jsonStr = JSON.stringify(capturedJsonResponse);
          if (jsonStr.length > 500) {
            logLine += ` :: ${jsonStr.substring(0, 500)}... [truncated ${jsonStr.length} bytes]`;
          } else {
            logLine += ` :: ${jsonStr}`;
          }
        }

        log(logLine);
      }

      // Send response event to telemetry
      if (telemetry) {
        const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
        telemetry.event(
          "http.response",
          `${req.method} ${path} ${status}`,
          {
            ...responseInfo,
            direction: "outbound",
          },
          level
        );
      }
    });

    next();
  };
}
