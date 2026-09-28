import { createRequire as __symbiaCreateRequire } from "node:module";globalThis.require ??= __symbiaCreateRequire(import.meta.url);

// build/plugin/symbia-imagine/vendor/symbia-relay/dist/integration.js
var globalRelay = null;
async function emitEvent(type, data, runId, options) {
  if (!globalRelay || !globalRelay.isReady()) {
    return null;
  }
  try {
    return await globalRelay.send({ type, data }, runId, options);
  } catch (error) {
    console.error(`[Relay] Failed to emit event ${type}:`, error);
    return null;
  }
}
async function emitHttpRequest(data, runId) {
  const traceId = runId || data.traceId || `trace_${Date.now()}`;
  await emitEvent("obs.http.request", data, traceId, { boundary: "intra" });
}
async function emitHttpResponse(data, runId) {
  const traceId = runId || data.traceId || `trace_${Date.now()}`;
  await emitEvent("obs.http.response", data, traceId, { boundary: "intra" });
}

// build/plugin/symbia-imagine/vendor/symbia-relay/dist/trace-context.js
import { AsyncLocalStorage } from "node:async_hooks";
var TRACE_HEADER = "x-trace-id";
var CALLER_HEADER = "x-symbia-caller";
var ORIGIN_HEADER = "x-symbia-origin";
var TRAFFIC_ORIGINS = [
  "internal",
  "user",
  "agent",
  "unknown"
];
function isTrafficOrigin(v) {
  return typeof v === "string" && TRAFFIC_ORIGINS.includes(v);
}
var storage = new AsyncLocalStorage();
function withTrace(ctx, fn) {
  return storage.run(ctx, fn);
}
function mintTraceId() {
  return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function traceIdFromHeaders(headers) {
  const direct = headers[TRACE_HEADER];
  if (typeof direct === "string" && direct.length > 0)
    return direct;
  const traceparent = headers["traceparent"];
  if (typeof traceparent === "string") {
    const parts = traceparent.split("-");
    if (parts.length >= 3 && parts[1] && /^[0-9a-f]{32}$/i.test(parts[1]))
      return parts[1];
  }
  return void 0;
}
function callerFromHeaders(headers) {
  const c = headers[CALLER_HEADER];
  return typeof c === "string" && c.length > 0 ? c : void 0;
}
function originFromHeaders(headers) {
  const raw = headers[ORIGIN_HEADER];
  return isTrafficOrigin(raw) ? raw : "unknown";
}

// build/plugin/symbia-imagine/vendor/symbia-relay/dist/middleware.js
var DEFAULT_EXCLUDE_HEADERS = [
  "authorization",
  "cookie",
  "x-api-key",
  "x-auth-token"
];
function observabilityMiddleware(options = {}) {
  const { excludePaths = ["/health", "/health/live", "/health/ready", "/favicon.ico"], excludePatterns = [], includeHeaders = false, excludeHeaders = DEFAULT_EXCLUDE_HEADERS, slowRequestThresholdMs = 5e3, traceIdHeader = "x-trace-id" } = options;
  return (req, res, next) => {
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
    const traceId = req.headers[traceIdHeader] || traceIdFromHeaders(req.headers) || mintTraceId();
    const caller = callerFromHeaders(req.headers);
    const origin = originFromHeaders(req.headers);
    const requestEvent = {
      method: req.method,
      path: req.path,
      query: Object.keys(req.query).length > 0 ? req.query : void 0,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.headers["user-agent"],
      traceId,
      caller,
      origin
    };
    if (includeHeaders) {
      const headers = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (!excludeHeaders.includes(key.toLowerCase()) && typeof value === "string") {
          headers[key] = value;
        }
      }
      if (Object.keys(headers).length > 0) {
        requestEvent.headers = headers;
      }
    }
    emitHttpRequest(requestEvent, traceId).catch(() => {
    });
    const serviceId = process.env.SERVICE_ID || process.env.SYMBIA_SERVICE_ID || "";
    const originalEnd = res.end;
    let responseSize = 0;
    const originalWrite = res.write;
    res.write = function(chunk, ...args) {
      if (chunk) {
        responseSize += Buffer.isBuffer(chunk) ? chunk.length : String(chunk).length;
      }
      return originalWrite.apply(res, [chunk, ...args]);
    };
    res.end = function(chunk, ...args) {
      if (chunk) {
        responseSize += Buffer.isBuffer(chunk) ? chunk.length : String(chunk).length;
      }
      const durationMs = Date.now() - startTime;
      const responseEvent = {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs,
        caller,
        origin,
        size: responseSize > 0 ? responseSize : void 0,
        traceId
      };
      emitHttpResponse(responseEvent, traceId).catch(() => {
      });
      if (durationMs > slowRequestThresholdMs) {
        console.warn(`[Observability] Slow request: ${req.method} ${req.path} took ${durationMs}ms`);
      }
      return originalEnd.apply(res, [chunk, ...args]);
    };
    withTrace({ traceId, serviceId, origin }, () => next());
  };
}

export {
  emitEvent,
  emitHttpRequest,
  emitHttpResponse,
  observabilityMiddleware
};
