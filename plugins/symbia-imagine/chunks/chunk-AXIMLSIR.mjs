import { createRequire as __symbiaCreateRequire } from "node:module";globalThis.require ??= __symbiaCreateRequire(import.meta.url);
import {
  ServiceId,
  clearBootstrapCache,
  fetchBootstrapConfig,
  resolveServiceUrl
} from "./chunk-B6I54FM5.mjs";

// build/plugin/symbia-imagine/vendor/symbia-logging-client/dist/config.js
var RAW_ENDPOINT = process.env.TELEMETRY_ENDPOINT || process.env.LOGGING_ENDPOINT || process.env.LOGGING_BASE_URL || resolveServiceUrl(ServiceId.LOGGING);
var EXPLICIT_ENABLED = process.env.TELEMETRY_ENABLED;
var RESOLVED_ENABLED = EXPLICIT_ENABLED ? EXPLICIT_ENABLED === "true" : Boolean(RAW_ENDPOINT);
var RESOLVED_API_KEY = process.env.TELEMETRY_API_KEY || process.env.LOGGING_API_KEY || "";
var RESOLVED_BEARER = process.env.TELEMETRY_BEARER || process.env.LOGGING_BEARER || "";
var EXPLICIT_AUTH_MODE = process.env.TELEMETRY_AUTH_MODE;
var FALLBACK_AUTH_MODE = process.env.LOGGING_AUTH_MODE;
var RESOLVED_AUTH_MODE = EXPLICIT_AUTH_MODE || FALLBACK_AUTH_MODE || (RESOLVED_API_KEY ? "apiKey" : RESOLVED_BEARER ? "bearer" : "system");
var systemBootstrap = null;
var bootstrapInitialized = false;
async function initSystemAuth() {
  if (bootstrapInitialized && systemBootstrap) {
    return systemBootstrap;
  }
  systemBootstrap = await fetchBootstrapConfig();
  bootstrapInitialized = true;
  return systemBootstrap;
}
function clearSystemAuth() {
  systemBootstrap = null;
  bootstrapInitialized = false;
  clearBootstrapCache();
}
function getSystemAuth() {
  return systemBootstrap;
}
var DEFAULT_CONFIG = {
  enabled: RESOLVED_ENABLED,
  endpoint: RAW_ENDPOINT,
  authMode: RESOLVED_AUTH_MODE,
  apiKey: RESOLVED_API_KEY,
  bearer: RESOLVED_BEARER,
  orgId: process.env.TELEMETRY_ORG_ID || process.env.LOGGING_ORG_ID || "",
  env: process.env.TELEMETRY_ENV || process.env.LOGGING_ENV || process.env.NODE_ENV || "dev",
  dataClass: process.env.TELEMETRY_DATA_CLASS || process.env.LOGGING_DATA_CLASS || "none",
  policyRef: process.env.TELEMETRY_POLICY_REF || process.env.LOGGING_POLICY_REF || "policy/default",
  maxBatch: Number.parseInt(process.env.TELEMETRY_MAX_BATCH || "50", 10),
  flushMs: Number.parseInt(process.env.TELEMETRY_FLUSH_MS || "1000", 10),
  retry: Number.parseInt(process.env.TELEMETRY_RETRY || "3", 10),
  maxQueue: Number.parseInt(process.env.TELEMETRY_MAX_QUEUE || "1000", 10)
};
function normalizeEndpoint(endpoint) {
  if (!endpoint)
    return "";
  const trimmed = endpoint.replace(/\/$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}
function getHeaders(config) {
  const bootstrap = config.authMode === "system" ? getSystemAuth() : null;
  const headers = {
    "Content-Type": "application/json",
    "X-Org-Id": bootstrap?.orgId || config.orgId,
    "X-Service-Id": config.serviceId,
    "X-Env": config.env,
    "X-Data-Class": config.dataClass,
    "X-Policy-Ref": config.policyRef
  };
  if (config.authMode === "apiKey" && config.apiKey) {
    headers["X-API-Key"] = config.apiKey;
  }
  if (config.authMode === "bearer" && config.bearer) {
    headers["Authorization"] = `Bearer ${config.bearer}`;
  }
  if (config.authMode === "system" && bootstrap?.secret) {
    headers["Authorization"] = `Bearer ${bootstrap.secret}`;
  }
  return headers;
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function buildBaseMetadata(config) {
  return {
    orgId: config.orgId,
    serviceId: config.serviceId,
    env: config.env
  };
}
function clampQueue(queue, maxQueue) {
  while (queue.length > maxQueue) {
    queue.shift();
  }
}

// build/plugin/symbia-imagine/vendor/symbia-logging-client/dist/metrics.js
var METRIC_DEFINITIONS = {
  "service.request.count": {
    type: "counter",
    description: "Total HTTP requests"
  },
  "service.error.count": {
    type: "counter",
    description: "Total HTTP errors"
  },
  "service.request.latency_ms": {
    type: "histogram",
    description: "HTTP request latency (ms)"
  },
  "service.dependency.latency_ms": {
    type: "histogram",
    description: "Dependency latency (ms)"
  }
};
function getMetricDefinition(name) {
  return METRIC_DEFINITIONS[name] || { type: "gauge", description: "Custom metric" };
}

// build/plugin/symbia-imagine/vendor/symbia-logging-client/dist/client.js
function createTelemetryClient(overrides) {
  const config = {
    ...DEFAULT_CONFIG,
    ...overrides,
    endpoint: normalizeEndpoint(overrides.endpoint || DEFAULT_CONFIG.endpoint)
  };
  if (!config.enabled || !config.endpoint) {
    return {
      // Disabled is not broken. Telemetry was switched off on purpose here, so
      // the write path is not "failing" — there is no write path. Returning an
      // error string would make every sink route to its error port on a stack
      // that is behaving exactly as configured.
      getLastError: () => null,
      log: () => void 0,
      event: () => void 0,
      metric: () => void 0,
      span: () => void 0,
      objectRef: () => void 0,
      flush: async () => void 0,
      shutdown: async () => void 0
    };
  }
  const logQueue = [];
  const metricQueue = [];
  const traceQueue = [];
  const objectQueue = [];
  const metricRegistry = /* @__PURE__ */ new Map();
  let logStreamId = null;
  let objectStreamId = null;
  let timer = null;
  let flushing = false;
  let systemAuthInitialized = false;
  let lastError = null;
  async function ensureSystemAuth() {
    if (config.authMode !== "system" || systemAuthInitialized)
      return;
    await initSystemAuth();
    systemAuthInitialized = true;
  }
  async function request(path, body, attempt = 0, retriedAuth = false) {
    try {
      await ensureSystemAuth();
      const res = await fetch(`${config.endpoint}${path}`, {
        method: "POST",
        headers: getHeaders(config),
        body: JSON.stringify(body)
      });
      if (res.status === 401 && config.authMode === "system" && !retriedAuth) {
        clearSystemAuth();
        systemAuthInitialized = false;
        await ensureSystemAuth();
        return request(path, body, attempt, true);
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Telemetry request failed: ${res.status} ${text}`);
      }
      lastError = null;
      return res.json();
    } catch (error) {
      if (attempt >= config.retry) {
        lastError = error instanceof Error ? error.message : `telemetry write to ${path} failed`;
        return null;
      }
      const backoff = Math.min(1e3 * (attempt + 1), 5e3);
      await new Promise((resolve) => setTimeout(resolve, backoff));
      return request(path, body, attempt + 1, retriedAuth);
    }
  }
  async function ensureLogStream() {
    if (logStreamId)
      return logStreamId;
    const response = await request("/logs/streams", {
      name: `service.${config.serviceId}.logs`,
      description: "Service telemetry logs",
      level: "info"
    });
    if (response?.id) {
      logStreamId = response.id;
    }
    return logStreamId;
  }
  async function ensureObjectStream() {
    if (objectStreamId)
      return objectStreamId;
    const response = await request("/objects/streams", {
      name: `service.${config.serviceId}.objects`,
      description: "Service telemetry object references",
      contentType: "application/octet-stream"
    });
    if (response?.id) {
      objectStreamId = response.id;
    }
    return objectStreamId;
  }
  async function ensureMetric(name) {
    if (metricRegistry.has(name)) {
      return metricRegistry.get(name) || null;
    }
    const definition = getMetricDefinition(name);
    const response = await request("/metrics", {
      name,
      metricType: definition.type,
      description: definition.description
    });
    if (response?.id) {
      metricRegistry.set(name, response.id);
      return response.id;
    }
    return null;
  }
  async function flushLogs() {
    if (!logQueue.length)
      return;
    const streamId = await ensureLogStream();
    if (!streamId)
      return;
    const batch = logQueue.splice(0, config.maxBatch);
    await request("/logs/ingest", { streamId, entries: batch });
  }
  async function flushMetrics() {
    if (!metricQueue.length)
      return;
    const batch = metricQueue.splice(0, config.maxBatch);
    const grouped = /* @__PURE__ */ new Map();
    for (const item of batch) {
      if (!grouped.has(item.name)) {
        grouped.set(item.name, []);
      }
      grouped.get(item.name)?.push({
        timestamp: item.timestamp,
        value: item.value,
        labels: item.labels
      });
    }
    const entries = Array.from(grouped.entries());
    for (const [name, dataPoints] of entries) {
      const metricId = await ensureMetric(name);
      if (!metricId)
        continue;
      await request("/metrics/ingest", { metricId, dataPoints });
    }
  }
  async function flushTraces() {
    if (!traceQueue.length)
      return;
    const batch = traceQueue.splice(0, config.maxBatch);
    await request("/traces/ingest", { spans: batch });
  }
  async function flushObjects() {
    if (!objectQueue.length)
      return;
    const streamId = await ensureObjectStream();
    if (!streamId)
      return;
    const batch = objectQueue.splice(0, config.maxBatch);
    for (const entry of batch) {
      await request("/objects/ingest", { streamId, ...entry });
    }
  }
  async function flush() {
    if (flushing)
      return;
    flushing = true;
    try {
      await flushLogs();
      await flushMetrics();
      await flushTraces();
      await flushObjects();
    } finally {
      flushing = false;
    }
  }
  function startTimer() {
    if (timer)
      return;
    timer = setInterval(() => {
      flush().catch(() => void 0);
    }, config.flushMs);
  }
  function log(level, message, metadata = {}) {
    logQueue.push({
      timestamp: nowIso(),
      level,
      message,
      metadata: { ...buildBaseMetadata(config), ...metadata }
    });
    clampQueue(logQueue, config.maxQueue);
    startTimer();
  }
  function event(eventType, message, metadata = {}, level = "info") {
    log(level, message, { eventType, ...metadata });
  }
  function metric(name, value, labels = {}) {
    metricQueue.push({
      name,
      timestamp: nowIso(),
      value,
      labels: { ...buildBaseMetadata(config), ...labels }
    });
    clampQueue(metricQueue, config.maxQueue);
    startTimer();
  }
  function span(spanData) {
    traceQueue.push({
      ...spanData,
      serviceName: spanData.serviceName || config.serviceId,
      attributes: { ...buildBaseMetadata(config), ...spanData.attributes }
    });
    clampQueue(traceQueue, config.maxQueue);
    startTimer();
  }
  function objectRef(entry) {
    objectQueue.push({
      ...entry,
      metadata: { ...buildBaseMetadata(config), ...entry.metadata }
    });
    clampQueue(objectQueue, config.maxQueue);
    startTimer();
  }
  async function shutdown() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    await flush();
  }
  return {
    log,
    event,
    metric,
    span,
    objectRef,
    flush,
    shutdown,
    /**
     * Why the last flush failed, or null if the writer is healthy.
     *
     * Health, not per-write outcome: writes are batched, so a `log()` that has
     * just returned has not been attempted yet. "The write path is currently
     * failing" is the strongest honest claim available, and it is strictly
     * better than the silence it replaces.
     */
    getLastError: () => lastError
  };
}

export {
  createTelemetryClient
};
