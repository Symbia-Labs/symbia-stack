/**
 * Telemetry & Observability Integration
 *
 * Centralizes all telemetry, metrics, and observability for the integrations service.
 * Uses @symbia/logging-client for telemetry and @symbia/relay for SDN events.
 */

import { createTelemetryClient, type TelemetryClient } from "@symbia/logging-client";
import {
  emitEvent,
  emitHttpRequest,
  emitHttpResponse,
  startProcessMetricsInterval,
  type HttpRequestEvent,
  type HttpResponseEvent,
} from "@symbia/relay";
import { ServiceId } from "@symbia/sys";

// =============================================================================
// Telemetry Client Singleton
// =============================================================================

let telemetryClient: TelemetryClient | null = null;

/**
 * Initialize and get the telemetry client
 */
export function getTelemetry(): TelemetryClient {
  if (!telemetryClient) {
    telemetryClient = createTelemetryClient({
      serviceId: process.env.TELEMETRY_SERVICE_ID || ServiceId.INTEGRATIONS,
    });
  }
  return telemetryClient;
}

/**
 * Shutdown telemetry (call during graceful shutdown)
 */
export async function shutdownTelemetry(): Promise<void> {
  if (telemetryClient) {
    await telemetryClient.shutdown();
    telemetryClient = null;
  }
}

// =============================================================================
// Process Metrics
// =============================================================================

let metricsInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start automatic process metrics collection
 */
export function startMetricsCollection(): void {
  if (metricsInterval) return;

  // Start process metrics (CPU, memory, etc.) - emits to SDN every 30s
  startProcessMetricsInterval(30_000);

  console.log("[telemetry] Process metrics collection started");
}

/**
 * Stop process metrics collection
 */
export function stopMetricsCollection(): void {
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
  }
}

// =============================================================================
// Custom Metrics
// =============================================================================

/**
 * Record a custom metric
 */
export function recordMetric(
  name: string,
  value: number,
  tags?: Record<string, string>
): void {
  const telemetry = getTelemetry();
  telemetry.metric(name, value, tags);
}

/**
 * Record provider request metrics
 */
export function recordProviderRequest(
  provider: string,
  operation: string,
  durationMs: number,
  success: boolean,
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }
): void {
  const telemetry = getTelemetry();
  const tags = { provider, operation, success: String(success) };

  // Request count
  telemetry.metric("integrations.provider.request.count", 1, tags);

  // Duration
  telemetry.metric("integrations.provider.request.duration_ms", durationMs, tags);

  // Token usage
  if (usage) {
    if (usage.promptTokens) {
      telemetry.metric("integrations.provider.tokens.prompt", usage.promptTokens, { provider });
    }
    if (usage.completionTokens) {
      telemetry.metric("integrations.provider.tokens.completion", usage.completionTokens, { provider });
    }
    if (usage.totalTokens) {
      telemetry.metric("integrations.provider.tokens.total", usage.totalTokens, { provider });
    }
  }
}

/**
 * Record circuit breaker state change
 */
export function recordCircuitBreakerChange(
  provider: string,
  state: "closed" | "open" | "half-open"
): void {
  const telemetry = getTelemetry();
  telemetry.event("integrations.circuit_breaker.state_change", `Circuit breaker for ${provider} changed to ${state}`, {
    provider,
    state,
  });
}

/**
 * Record rate limit hit
 */
export function recordRateLimitHit(
  type: "user" | "org" | "provider",
  identifier: string
): void {
  const telemetry = getTelemetry();
  telemetry.metric("integrations.rate_limit.hit", 1, { type, identifier });
}

// =============================================================================
// Outbound HTTP Observability
// =============================================================================

/**
 * Wrap an outbound HTTP request to a provider with observability
 */
export async function withProviderObservability<T>(
  provider: string,
  operation: string,
  requestId: string,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  const traceId = requestId;

  // Emit request event to SDN
  const requestEvent: HttpRequestEvent = {
    method: "POST",
    path: `/${provider}/${operation}`,
    traceId,
  };
  emitHttpRequest(requestEvent, traceId).catch(() => {});

  // Also emit semantic event
  emitEvent("integrations.provider.request", {
    provider,
    operation,
    requestId,
  }, requestId, {
    target: `provider:${provider}`,
    boundary: "extra",
  }).catch(() => {});

  try {
    const result = await fn();
    const durationMs = Date.now() - startTime;

    // Emit response event
    const responseEvent: HttpResponseEvent = {
      method: "POST",
      path: `/${provider}/${operation}`,
      statusCode: 200,
      durationMs,
      traceId,
    };
    emitHttpResponse(responseEvent, traceId).catch(() => {});

    // Emit semantic event
    emitEvent("integrations.provider.response", {
      provider,
      operation,
      requestId,
      durationMs,
      success: true,
    }, requestId, {
      target: ServiceId.INTEGRATIONS,
      boundary: "extra",
    }).catch(() => {});

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;

    // Emit error response
    const responseEvent: HttpResponseEvent = {
      method: "POST",
      path: `/${provider}/${operation}`,
      statusCode: 502,
      durationMs,
      traceId,
    };
    emitHttpResponse(responseEvent, traceId).catch(() => {});

    // Emit semantic error event
    emitEvent("integrations.provider.error", {
      provider,
      operation,
      requestId,
      durationMs,
      error: error instanceof Error ? error.message : "Unknown error",
    }, requestId, {
      target: ServiceId.INTEGRATIONS,
      boundary: "extra",
    }).catch(() => {});

    throw error;
  }
}

// =============================================================================
// Logging Helpers
// =============================================================================

/**
 * Log with telemetry (structured logging)
 */
export function log(
  level: "debug" | "info" | "warn" | "error",
  message: string,
  data?: Record<string, unknown>
): void {
  const telemetry = getTelemetry();
  telemetry.log(level, message, data);
}

/**
 * Log an event
 */
export function logEvent(
  eventType: string,
  description: string,
  data?: Record<string, unknown>
): void {
  const telemetry = getTelemetry();
  telemetry.event(eventType, description, data);
}

// =============================================================================
// Distributed Tracing
// =============================================================================

/**
 * Create a span for distributed tracing
 */
export function createSpan(
  traceId: string,
  name: string,
  startTime: Date
): { end: () => void } {
  const spanId = `span_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const telemetry = getTelemetry();

  return {
    end: () => {
      telemetry.span({
        traceId,
        spanId,
        name,
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
      });
    },
  };
}
