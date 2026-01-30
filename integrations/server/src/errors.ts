/**
 * Integration Error Taxonomy
 *
 * Categorized errors for the gateway layer. Since integrations is the sole
 * bridge to the external world in most Symbia networks, callers (especially
 * the assistants graph engine) need to distinguish error types to decide
 * whether to retry, fall back, or surface the issue to the user.
 *
 * Error categories flow through the SDN relay into graph run context,
 * enabling rule-based error handling in assistant workflows.
 */

// =============================================================================
// Error Categories
// =============================================================================

export type IntegrationErrorCategory =
  | "auth"             // Credential missing, invalid, or expired
  | "validation"       // Request params failed validation
  | "rate_limit"       // Rate limit exceeded (local or provider-side)
  | "timeout"          // Request timed out
  | "provider"         // Provider returned an error (4xx/5xx from upstream API)
  | "network"          // Network-level failure (DNS, connection refused, etc.)
  | "not_found"        // Provider, operation, or model not found
  | "content_filter"   // Provider blocked content for safety
  | "quota"            // Provider quota or billing limit reached
  | "internal";        // Unexpected internal error

// =============================================================================
// Error Class
// =============================================================================

export class IntegrationError extends Error {
  readonly category: IntegrationErrorCategory;
  readonly statusCode: number;
  readonly provider?: string;
  readonly operation?: string;
  readonly retryable: boolean;
  readonly upstream?: {
    statusCode?: number;
    code?: string;
    message?: string;
  };

  constructor(opts: {
    message: string;
    category: IntegrationErrorCategory;
    statusCode?: number;
    provider?: string;
    operation?: string;
    retryable?: boolean;
    upstream?: {
      statusCode?: number;
      code?: string;
      message?: string;
    };
    cause?: Error;
  }) {
    super(opts.message, { cause: opts.cause });
    this.name = "IntegrationError";
    this.category = opts.category;
    this.statusCode = opts.statusCode ?? categoryToStatus(opts.category);
    this.provider = opts.provider;
    this.operation = opts.operation;
    this.retryable = opts.retryable ?? categoryRetryable(opts.category);
    this.upstream = opts.upstream;
  }

  /**
   * Serialize for API response — safe to send to callers
   */
  toResponse() {
    return {
      error: this.message,
      category: this.category,
      retryable: this.retryable,
      provider: this.provider,
      operation: this.operation,
      upstream: this.upstream ? {
        statusCode: this.upstream.statusCode,
        code: this.upstream.code,
      } : undefined,
    };
  }
}

// =============================================================================
// Classification Helpers
// =============================================================================

/**
 * Classify a raw error thrown by a provider adapter into an IntegrationError
 */
export function classifyProviderError(
  err: unknown,
  provider: string,
  operation: string,
): IntegrationError {
  if (err instanceof IntegrationError) {
    return err;
  }

  const message = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error ? err : undefined;

  // Timeout (AbortSignal.timeout throws this)
  if (
    message.includes("The operation was aborted") ||
    message.includes("aborted") ||
    message.includes("timeout") ||
    message.includes("Timeout") ||
    (err instanceof DOMException && err.name === "TimeoutError")
  ) {
    return new IntegrationError({
      message: `Request to ${provider} timed out`,
      category: "timeout",
      provider,
      operation,
      cause,
    });
  }

  // Network errors
  if (
    message.includes("fetch failed") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ECONNRESET") ||
    message.includes("ENOTFOUND") ||
    message.includes("EAI_AGAIN") ||
    message.includes("socket hang up") ||
    message.includes("network")
  ) {
    return new IntegrationError({
      message: `Network error connecting to ${provider}: ${message}`,
      category: "network",
      provider,
      operation,
      cause,
    });
  }

  // Provider-level errors (parsed from HTTP responses by adapters)
  const upstreamStatus = extractUpstreamStatus(message);

  if (upstreamStatus) {
    // Auth errors from provider
    if (upstreamStatus === 401 || upstreamStatus === 403) {
      return new IntegrationError({
        message: `${provider} rejected the API key. Check your credentials in Settings.`,
        category: "auth",
        provider,
        operation,
        retryable: false,
        upstream: { statusCode: upstreamStatus, message },
        cause,
      });
    }

    // Rate limit from provider
    if (upstreamStatus === 429) {
      return new IntegrationError({
        message: `${provider} rate limit exceeded. Try again shortly.`,
        category: "rate_limit",
        provider,
        operation,
        retryable: true,
        upstream: { statusCode: upstreamStatus, message },
        cause,
      });
    }

    // Quota / billing
    if (upstreamStatus === 402 || message.toLowerCase().includes("quota") || message.toLowerCase().includes("billing")) {
      return new IntegrationError({
        message: `${provider} quota or billing limit reached.`,
        category: "quota",
        provider,
        operation,
        retryable: false,
        upstream: { statusCode: upstreamStatus, message },
        cause,
      });
    }

    // Content filter
    if (message.toLowerCase().includes("content_filter") || message.toLowerCase().includes("safety") || message.toLowerCase().includes("harmful")) {
      return new IntegrationError({
        message: `${provider} blocked the request due to content policy.`,
        category: "content_filter",
        provider,
        operation,
        retryable: false,
        upstream: { statusCode: upstreamStatus, message },
        cause,
      });
    }
  }

  // Also check for known error patterns without status codes
  if (message.toLowerCase().includes("rate limit") || message.toLowerCase().includes("rate_limit")) {
    return new IntegrationError({
      message: `${provider} rate limit exceeded. Try again shortly.`,
      category: "rate_limit",
      provider,
      operation,
      retryable: true,
      cause,
    });
  }

  if (message.toLowerCase().includes("quota") || message.toLowerCase().includes("insufficient_quota") || message.toLowerCase().includes("billing")) {
    return new IntegrationError({
      message: `${provider} quota or billing limit reached.`,
      category: "quota",
      provider,
      operation,
      retryable: false,
      cause,
    });
  }

  if (message.toLowerCase().includes("invalid api key") || message.toLowerCase().includes("unauthorized") || message.toLowerCase().includes("authentication")) {
    return new IntegrationError({
      message: `${provider} rejected the API key. Check your credentials in Settings.`,
      category: "auth",
      provider,
      operation,
      retryable: false,
      cause,
    });
  }

  if (message.toLowerCase().includes("content_filter") || message.toLowerCase().includes("content policy") || message.toLowerCase().includes("safety")) {
    return new IntegrationError({
      message: `${provider} blocked the request due to content policy.`,
      category: "content_filter",
      provider,
      operation,
      retryable: false,
      cause,
    });
  }

  // Default: treat as provider error (retryable 5xx assumption)
  return new IntegrationError({
    message: `${provider} error: ${message}`,
    category: "provider",
    provider,
    operation,
    upstream: upstreamStatus ? { statusCode: upstreamStatus, message } : undefined,
    cause,
  });
}

// =============================================================================
// Internal Helpers
// =============================================================================

function categoryToStatus(category: IntegrationErrorCategory): number {
  switch (category) {
    case "auth":           return 401;
    case "validation":     return 400;
    case "rate_limit":     return 429;
    case "timeout":        return 504;
    case "provider":       return 502;
    case "network":        return 502;
    case "not_found":      return 404;
    case "content_filter": return 422;
    case "quota":          return 402;
    case "internal":       return 500;
  }
}

function categoryRetryable(category: IntegrationErrorCategory): boolean {
  switch (category) {
    case "timeout":
    case "network":
    case "rate_limit":
    case "provider":
      return true;
    case "auth":
    case "validation":
    case "not_found":
    case "content_filter":
    case "quota":
    case "internal":
      return false;
  }
}

/**
 * Try to extract an HTTP status code from a provider error message.
 * Providers throw messages like "OpenAI API error: ..." after checking response.ok,
 * so we also look at common patterns.
 */
function extractUpstreamStatus(message: string): number | undefined {
  // Match patterns like "status 429" or "HTTP 429" or "error 429"
  const statusMatch = message.match(/(?:status|HTTP|error)\s+(\d{3})/i);
  if (statusMatch) {
    return parseInt(statusMatch[1], 10);
  }

  // Match patterns like "429 Too Many Requests"
  const codeMatch = message.match(/\b(4\d{2}|5\d{2})\b/);
  if (codeMatch) {
    return parseInt(codeMatch[1], 10);
  }

  return undefined;
}
