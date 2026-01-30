import type {
  TelemetryClient,
  TelemetryConfig,
  LogEntry,
  MetricEntry,
  SpanEntry,
  ObjectRefEntry,
} from "./types.js";
import {
  DEFAULT_CONFIG,
  normalizeEndpoint,
  getHeaders,
  nowIso,
  buildBaseMetadata,
  clampQueue,
} from "./config.js";
import { getMetricDefinition } from "./metrics.js";

/**
 * Create a telemetry client instance
 *
 * @param overrides - Partial config to override defaults from environment
 * @returns TelemetryClient instance (or no-op client if disabled)
 *
 * @example
 * ```typescript
 * const telemetry = createTelemetryClient({
 *   serviceId: 'my-service',
 * });
 *
 * telemetry.event('service.started', 'Service initialized');
 * telemetry.metric('service.request.count', 1);
 * ```
 */
export function createTelemetryClient(
  overrides: Partial<TelemetryConfig> & { serviceId: string }
): TelemetryClient {
  const config: TelemetryConfig = {
    ...DEFAULT_CONFIG,
    ...overrides,
    endpoint: normalizeEndpoint(overrides.endpoint || DEFAULT_CONFIG.endpoint),
  };

  // Return no-op client if disabled or no endpoint
  if (!config.enabled || !config.endpoint) {
    return {
      log: () => undefined,
      event: () => undefined,
      metric: () => undefined,
      span: () => undefined,
      objectRef: () => undefined,
      flush: async () => undefined,
      shutdown: async () => undefined,
    };
  }

  // Internal queues
  const logQueue: LogEntry[] = [];
  const metricQueue: MetricEntry[] = [];
  const traceQueue: SpanEntry[] = [];
  const objectQueue: ObjectRefEntry[] = [];

  // Stream/metric registration cache
  const metricRegistry = new Map<string, string>();
  let logStreamId: string | null = null;
  let objectStreamId: string | null = null;

  // Flush control
  let timer: NodeJS.Timeout | null = null;
  let flushing = false;

  /**
   * Make HTTP request to telemetry endpoint with retry logic
   */
  async function request(
    path: string,
    body: Record<string, unknown>,
    attempt = 0
  ): Promise<any> {
    try {
      const res = await fetch(`${config.endpoint}${path}`, {
        method: "POST",
        headers: getHeaders(config),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Telemetry request failed: ${res.status} ${text}`);
      }

      return res.json();
    } catch (error) {
      if (attempt >= config.retry) {
        // Silent failure after retries exhausted
        return null;
      }

      // Exponential backoff (max 5s)
      const backoff = Math.min(1000 * (attempt + 1), 5000);
      await new Promise((resolve) => setTimeout(resolve, backoff));
      return request(path, body, attempt + 1);
    }
  }

  /**
   * Ensure log stream exists and return its ID
   */
  async function ensureLogStream(): Promise<string | null> {
    if (logStreamId) return logStreamId;

    const response = await request("/logs/streams", {
      name: `service.${config.serviceId}.logs`,
      description: "Service telemetry logs",
      level: "info",
    });

    if (response?.id) {
      logStreamId = response.id;
    }

    return logStreamId;
  }

  /**
   * Ensure object stream exists and return its ID
   */
  async function ensureObjectStream(): Promise<string | null> {
    if (objectStreamId) return objectStreamId;

    const response = await request("/objects/streams", {
      name: `service.${config.serviceId}.objects`,
      description: "Service telemetry object references",
      contentType: "application/octet-stream",
    });

    if (response?.id) {
      objectStreamId = response.id;
    }

    return objectStreamId;
  }

  /**
   * Ensure metric exists and return its ID
   */
  async function ensureMetric(name: string): Promise<string | null> {
    if (metricRegistry.has(name)) {
      return metricRegistry.get(name) || null;
    }

    const definition = getMetricDefinition(name);
    const response = await request("/metrics", {
      name,
      metricType: definition.type,
      description: definition.description,
    });

    if (response?.id) {
      metricRegistry.set(name, response.id);
      return response.id;
    }

    return null;
  }

  /**
   * Flush logs to telemetry endpoint
   */
  async function flushLogs(): Promise<void> {
    if (!logQueue.length) return;

    const streamId = await ensureLogStream();
    if (!streamId) return;

    const batch = logQueue.splice(0, config.maxBatch);
    await request("/logs/ingest", { streamId, entries: batch });
  }

  /**
   * Flush metrics to telemetry endpoint
   */
  async function flushMetrics(): Promise<void> {
    if (!metricQueue.length) return;

    const batch = metricQueue.splice(0, config.maxBatch);

    // Group by metric name
    const grouped = new Map<string, Array<Record<string, unknown>>>();
    for (const item of batch) {
      if (!grouped.has(item.name)) {
        grouped.set(item.name, []);
      }
      grouped.get(item.name)?.push({
        timestamp: item.timestamp,
        value: item.value,
        labels: item.labels,
      });
    }

    // Ingest each metric separately
    const entries = Array.from(grouped.entries());
    for (const [name, dataPoints] of entries) {
      const metricId = await ensureMetric(name);
      if (!metricId) continue;
      await request("/metrics/ingest", { metricId, dataPoints });
    }
  }

  /**
   * Flush traces to telemetry endpoint
   */
  async function flushTraces(): Promise<void> {
    if (!traceQueue.length) return;

    const batch = traceQueue.splice(0, config.maxBatch);
    await request("/traces/ingest", { spans: batch });
  }

  /**
   * Flush object references to telemetry endpoint
   */
  async function flushObjects(): Promise<void> {
    if (!objectQueue.length) return;

    const streamId = await ensureObjectStream();
    if (!streamId) return;

    const batch = objectQueue.splice(0, config.maxBatch);
    for (const entry of batch) {
      await request("/objects/ingest", { streamId, ...entry });
    }
  }

  /**
   * Flush all queues
   */
  async function flush(): Promise<void> {
    if (flushing) return;

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

  /**
   * Start periodic flush timer
   */
  function startTimer(): void {
    if (timer) return;

    timer = setInterval(() => {
      flush().catch(() => undefined);
    }, config.flushMs);
  }

  /**
   * Log a message
   */
  function log(
    level: string,
    message: string,
    metadata: Record<string, unknown> = {}
  ): void {
    logQueue.push({
      timestamp: nowIso(),
      level,
      message,
      metadata: { ...buildBaseMetadata(config), ...metadata },
    });

    clampQueue(logQueue, config.maxQueue);
    startTimer();
  }

  /**
   * Track a domain event
   */
  function event(
    eventType: string,
    message: string,
    metadata: Record<string, unknown> = {},
    level = "info"
  ): void {
    log(level, message, { eventType, ...metadata });
  }

  /**
   * Record a metric
   */
  function metric(
    name: string,
    value: number,
    labels: Record<string, unknown> = {}
  ): void {
    metricQueue.push({
      name,
      timestamp: nowIso(),
      value,
      labels: { ...buildBaseMetadata(config), ...labels },
    });

    clampQueue(metricQueue, config.maxQueue);
    startTimer();
  }

  /**
   * Record a distributed tracing span
   */
  function span(spanData: SpanEntry): void {
    traceQueue.push({
      ...spanData,
      serviceName: spanData.serviceName || config.serviceId,
      attributes: { ...buildBaseMetadata(config), ...spanData.attributes },
    });

    clampQueue(traceQueue, config.maxQueue);
    startTimer();
  }

  /**
   * Track a binary object reference
   */
  function objectRef(entry: ObjectRefEntry): void {
    objectQueue.push({
      ...entry,
      metadata: { ...buildBaseMetadata(config), ...entry.metadata },
    });

    clampQueue(objectQueue, config.maxQueue);
    startTimer();
  }

  /**
   * Gracefully shutdown (stop timer and flush)
   */
  async function shutdown(): Promise<void> {
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
  };
}
