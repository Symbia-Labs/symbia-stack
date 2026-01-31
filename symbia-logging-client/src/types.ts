/**
 * Authentication mode for telemetry endpoint
 * - "apiKey": Use X-API-Key header
 * - "bearer": Use Authorization: Bearer header with provided token
 * - "system": Auto-fetch system secret from Identity service (service-to-service auth)
 * - "none": No authentication (dev mode only)
 */
export type TelemetryAuthMode = "apiKey" | "bearer" | "system" | "none";

/**
 * Telemetry client configuration
 */
export type TelemetryConfig = {
  /** Enable/disable telemetry */
  enabled: boolean;

  /** Telemetry endpoint URL */
  endpoint: string;

  /** Authentication mode */
  authMode: TelemetryAuthMode;

  /** API key for apiKey auth mode */
  apiKey: string;

  /** Bearer token for bearer auth mode */
  bearer: string;

  /** Organization ID */
  orgId: string;

  /** Service ID (unique identifier for this service) */
  serviceId: string;

  /** Environment (dev, stage, prod) */
  env: string;

  /** Data classification level */
  dataClass: string;

  /** Policy reference */
  policyRef: string;

  /** Maximum batch size before forcing flush */
  maxBatch: number;

  /** Flush interval in milliseconds */
  flushMs: number;

  /** Number of retry attempts */
  retry: number;

  /** Maximum queue size (older entries dropped when exceeded) */
  maxQueue: number;
};

/**
 * Log entry structure
 */
export type LogEntry = {
  timestamp: string;
  level: string;
  message: string;
  metadata?: Record<string, unknown>;
};

/**
 * Metric entry structure
 */
export type MetricEntry = {
  name: string;
  timestamp: string;
  value: number;
  labels?: Record<string, unknown>;
};

/**
 * Distributed tracing span entry
 */
export type SpanEntry = {
  traceId: string;
  spanId: string;
  parentSpanId?: string | null;
  name: string;
  serviceName?: string;
  kind?: string;
  status?: string;
  startTime: string;
  endTime?: string;
  attributes?: Record<string, unknown>;
  events?: Array<Record<string, unknown>>;
};

/**
 * Object reference entry for tracking binary objects
 */
export type ObjectRefEntry = {
  storageUrl: string;
  size?: number;
  checksum?: string;
  contentType?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Telemetry client interface
 */
export interface TelemetryClient {
  /**
   * Log a message with level and optional metadata
   */
  log(level: string, message: string, metadata?: Record<string, unknown>): void;

  /**
   * Track a domain event
   */
  event(eventType: string, message: string, metadata?: Record<string, unknown>, level?: string): void;

  /**
   * Record a metric value
   */
  metric(name: string, value: number, labels?: Record<string, unknown>): void;

  /**
   * Record a distributed tracing span
   */
  span(spanData: SpanEntry): void;

  /**
   * Track a reference to a binary object
   */
  objectRef(entry: ObjectRefEntry): void;

  /**
   * Manually flush all pending telemetry data
   */
  flush(): Promise<void>;

  /**
   * Gracefully shutdown telemetry client (flush and stop timers)
   */
  shutdown(): Promise<void>;
}

/**
 * Metric definition for pre-registered metrics
 */
export type MetricDefinition = {
  type: string;
  description: string;
};
