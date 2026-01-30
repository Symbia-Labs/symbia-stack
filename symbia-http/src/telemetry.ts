import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import type { TelemetryClient } from "@symbia/logging-client";
import { getScopeHeaders, buildScopeLabels } from "./scope.js";

/**
 * Create telemetry middleware for request/response tracking
 */
export function createTelemetryMiddleware(
  telemetry: TelemetryClient,
  excludePaths: string[] = []
) {
  const excludePathsSet = new Set(excludePaths);

  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const inboundTrace = req.headers["x-trace-id"];
    const traceId = typeof inboundTrace === "string" && inboundTrace ? inboundTrace : randomUUID();
    const spanId = randomUUID();

    res.setHeader("x-trace-id", traceId);

    res.on("finish", () => {
      const durationMs = Date.now() - start;
      const status = res.statusCode;
      const path = req.path;

      // Skip telemetry for excluded paths
      if (excludePathsSet.has(path)) {
        return;
      }

      const scopeLabels = buildScopeLabels(getScopeHeaders(req));

      telemetry.metric("service.request.count", 1, {
        endpoint: path,
        method: req.method,
        status: String(status),
        ...scopeLabels,
      });

      telemetry.metric("service.request.latency_ms", durationMs, {
        endpoint: path,
        method: req.method,
        status: String(status),
        ...scopeLabels,
      });

      telemetry.span({
        traceId,
        spanId,
        parentSpanId: null,
        name: `${req.method} ${path}`,
        kind: "server",
        status: status >= 500 ? "error" : "ok",
        startTime: new Date(start).toISOString(),
        endTime: new Date().toISOString(),
        attributes: {
          status,
          ...scopeLabels,
        },
      });

      if (status >= 500) {
        telemetry.event(
          "service.error",
          "HTTP request failed",
          {
            status,
            endpoint: path,
            method: req.method,
            ...scopeLabels,
          },
          "error"
        );
        telemetry.metric("service.error.count", 1, {
          endpoint: path,
          method: req.method,
          status: String(status),
          ...scopeLabels,
        });
      }
    });

    next();
  };
}
