/**
 * Security Hardening Module
 *
 * Provides security middleware and utilities for the integrations service:
 * - Request body size limits
 * - Security headers
 * - Credential sanitization
 * - Circuit breaker for failing providers
 * - Input sanitization
 * - Centralized timeout configuration
 */

import type { Request, Response, NextFunction } from "express";
import { IntegrationError } from "./errors.js";
import { recordCircuitBreakerChange } from "./telemetry.js";

// =============================================================================
// Centralized Timeout Configuration
// =============================================================================

/**
 * Centralized timeout configuration for all outbound requests.
 * Makes it easy to adjust timeouts across the service.
 */
export const TIMEOUTS = {
  /** LLM chat/completion requests (longer for reasoning models) */
  LLM_REQUEST: 60_000,

  /** Embedding generation requests */
  EMBEDDING_REQUEST: 30_000,

  /** MCP tool/resource/prompt calls */
  MCP_REQUEST: 30_000,

  /** OpenAPI spec fetching */
  SPEC_FETCH: 30_000,

  /** HTTP requests to external APIs */
  HTTP_REQUEST: 30_000,

  /** Internal service-to-service calls */
  INTERNAL_REQUEST: 10_000,

  /** Model evaluation per test case */
  EVAL_TEST_CASE: 30_000,
} as const;

// =============================================================================
// Request Size Limits
// =============================================================================

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB - generous for base64 images in messages

/**
 * Middleware to enforce request body size limits.
 * Prevents memory exhaustion from oversized payloads.
 */
export function bodySizeLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const contentLength = parseInt(req.headers["content-length"] || "0", 10);

  if (contentLength > MAX_BODY_SIZE) {
    const error = new IntegrationError({
      message: `Request body too large. Maximum size is ${MAX_BODY_SIZE / 1024 / 1024}MB`,
      category: "validation",
      retryable: false,
    });
    res.status(error.statusCode).json(error.toResponse());
    return;
  }

  next();
}

// =============================================================================
// Security Headers
// =============================================================================

/**
 * Middleware to add security headers to all responses.
 */
export function securityHeadersMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Prevent clickjacking (API shouldn't be framed)
  res.setHeader("X-Frame-Options", "DENY");

  // XSS protection (mostly for error pages)
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Strict transport security (for HTTPS)
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");

  // Don't leak referrer info
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Restrict what the API can do
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'"
  );

  next();
}

// =============================================================================
// Credential Sanitization
// =============================================================================

/**
 * Patterns that indicate sensitive data
 */
const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /bearer/i,
  /authorization/i,
  /credential/i,
  /private[_-]?key/i,
];

/**
 * Sanitize an object for logging by redacting sensitive fields.
 * Returns a new object with sensitive values replaced by "[REDACTED]".
 */
export function sanitizeForLogging(obj: unknown, depth = 0): unknown {
  // Prevent infinite recursion
  if (depth > 10) return "[MAX_DEPTH]";

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "string") {
    // Redact strings that look like API keys (long alphanumeric strings)
    if (obj.length > 20 && /^[A-Za-z0-9_-]+$/.test(obj)) {
      return `[REDACTED:${obj.length}chars]`;
    }
    // Redact Bearer tokens in strings
    if (obj.toLowerCase().includes("bearer ")) {
      return obj.replace(/bearer\s+[A-Za-z0-9_.-]+/gi, "Bearer [REDACTED]");
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForLogging(item, depth + 1));
  }

  if (typeof obj === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Check if key name suggests sensitive data
      const isSensitive = SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));

      if (isSensitive) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = sanitizeForLogging(value, depth + 1);
      }
    }
    return sanitized;
  }

  return obj;
}

/**
 * Create a logger that automatically sanitizes sensitive data.
 */
export function createSafeLogger(prefix: string) {
  return {
    log: (...args: unknown[]) => {
      console.log(prefix, ...args.map((arg) => sanitizeForLogging(arg)));
    },
    warn: (...args: unknown[]) => {
      console.warn(prefix, ...args.map((arg) => sanitizeForLogging(arg)));
    },
    error: (...args: unknown[]) => {
      console.error(prefix, ...args.map((arg) => sanitizeForLogging(arg)));
    },
    debug: (...args: unknown[]) => {
      if (process.env.DEBUG) {
        console.debug(prefix, ...args.map((arg) => sanitizeForLogging(arg)));
      }
    },
  };
}

// =============================================================================
// Circuit Breaker
// =============================================================================

interface CircuitState {
  failures: number;
  lastFailure: number;
  state: "closed" | "open" | "half-open";
  successesSinceHalfOpen: number;
}

interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  /** Time in ms before attempting recovery */
  resetTimeout: number;
  /** Successes needed in half-open to close */
  successThreshold: number;
}

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeout: 30_000, // 30 seconds
  successThreshold: 2,
};

/**
 * Circuit breaker to prevent cascading failures.
 * When a provider fails repeatedly, the circuit opens and rejects requests
 * until a recovery period has passed.
 */
export class CircuitBreaker {
  private circuits = new Map<string, CircuitState>();
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
  }

  /**
   * Get the current state for a provider
   */
  private getState(provider: string): CircuitState {
    if (!this.circuits.has(provider)) {
      this.circuits.set(provider, {
        failures: 0,
        lastFailure: 0,
        state: "closed",
        successesSinceHalfOpen: 0,
      });
    }
    return this.circuits.get(provider)!;
  }

  /**
   * Check if requests should be allowed through
   */
  canRequest(provider: string): { allowed: boolean; reason?: string } {
    const state = this.getState(provider);
    const now = Date.now();

    switch (state.state) {
      case "closed":
        return { allowed: true };

      case "open":
        // Check if reset timeout has passed
        if (now - state.lastFailure >= this.config.resetTimeout) {
          state.state = "half-open";
          state.successesSinceHalfOpen = 0;
          // Emit telemetry for state change (transitioning from open to half-open)
          recordCircuitBreakerChange(provider, "half-open");
          return { allowed: true };
        }
        return {
          allowed: false,
          reason: `Circuit open for ${provider}. Too many recent failures. Retry after ${Math.ceil((this.config.resetTimeout - (now - state.lastFailure)) / 1000)}s`,
        };

      case "half-open":
        // Allow limited requests to test recovery
        return { allowed: true };
    }
  }

  /**
   * Record a successful request
   */
  recordSuccess(provider: string): void {
    const state = this.getState(provider);

    if (state.state === "half-open") {
      state.successesSinceHalfOpen++;
      if (state.successesSinceHalfOpen >= this.config.successThreshold) {
        // Recovery confirmed, close the circuit
        state.state = "closed";
        state.failures = 0;
        state.successesSinceHalfOpen = 0;
        // Emit telemetry for recovery
        recordCircuitBreakerChange(provider, "closed");
      }
    } else if (state.state === "closed") {
      // Reset failure count on success
      state.failures = 0;
    }
  }

  /**
   * Record a failed request
   */
  recordFailure(provider: string): void {
    const state = this.getState(provider);
    const now = Date.now();
    const previousState = state.state;

    state.failures++;
    state.lastFailure = now;

    if (state.state === "half-open") {
      // Failed during recovery, reopen
      state.state = "open";
      recordCircuitBreakerChange(provider, "open");
    } else if (state.failures >= this.config.failureThreshold && previousState !== "open") {
      // Too many failures, open the circuit
      state.state = "open";
      recordCircuitBreakerChange(provider, "open");
    }
  }

  /**
   * Get status for monitoring
   */
  getStatus(): Record<string, { state: string; failures: number; lastFailure: string }> {
    const status: Record<string, { state: string; failures: number; lastFailure: string }> = {};
    for (const [provider, state] of this.circuits) {
      status[provider] = {
        state: state.state,
        failures: state.failures,
        lastFailure: state.lastFailure ? new Date(state.lastFailure).toISOString() : "never",
      };
    }
    return status;
  }

  /**
   * Reset a circuit (for manual intervention)
   */
  reset(provider: string): void {
    this.circuits.delete(provider);
  }

  /**
   * Reset all circuits
   */
  resetAll(): void {
    this.circuits.clear();
  }
}

// Singleton circuit breaker
export const circuitBreaker = new CircuitBreaker();

// =============================================================================
// Input Sanitization
// =============================================================================

/**
 * Sanitize a string to prevent injection attacks.
 * Removes or escapes potentially dangerous characters.
 */
export function sanitizeString(input: string, maxLength = 10000): string {
  if (typeof input !== "string") {
    return "";
  }

  // Truncate to max length
  let sanitized = input.slice(0, maxLength);

  // Remove null bytes (can break string handling)
  sanitized = sanitized.replace(/\0/g, "");

  // Remove control characters except newlines and tabs
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  return sanitized;
}

/**
 * Validate and sanitize a model ID.
 * Model IDs should be alphanumeric with limited special characters.
 */
export function sanitizeModelId(modelId: string): string {
  if (typeof modelId !== "string") {
    return "";
  }

  // Allow alphanumeric, hyphens, underscores, dots, colons, and forward slashes
  // (e.g., "gpt-4o-mini", "claude-3-opus", "meta-llama/Llama-3.2-11B-Vision-Instruct")
  const sanitized = modelId.replace(/[^a-zA-Z0-9\-_.:\/]/g, "");

  // Max reasonable length for a model ID
  return sanitized.slice(0, 256);
}

/**
 * Validate and sanitize a provider name.
 */
export function sanitizeProviderName(provider: string): string {
  if (typeof provider !== "string") {
    return "";
  }

  // Providers should be simple lowercase identifiers
  const sanitized = provider.toLowerCase().replace(/[^a-z0-9\-_]/g, "");

  return sanitized.slice(0, 64);
}

/**
 * Validate an operation ID matches expected format.
 */
export function isValidOperationId(operationId: string): boolean {
  if (typeof operationId !== "string") {
    return false;
  }

  // Operation IDs are dot-separated identifiers
  // e.g., "chat.completions", "integrations.openai.chat.completions.create"
  return /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)*$/.test(operationId);
}

// =============================================================================
// Request Validation
// =============================================================================

/**
 * Validate that required headers are present and valid.
 */
export function validateRequiredHeaders(
  req: Request,
  required: string[]
): { valid: boolean; missing: string[] } {
  const missing = required.filter(
    (header) => !req.headers[header.toLowerCase()]
  );
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Extract and validate content type.
 */
export function validateContentType(
  req: Request,
  allowed: string[] = ["application/json"]
): boolean {
  const contentType = req.headers["content-type"]?.split(";")[0]?.trim();
  return allowed.includes(contentType || "");
}
