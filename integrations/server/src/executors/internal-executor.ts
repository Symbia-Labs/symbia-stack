/**
 * Internal Service Executor
 *
 * Executes API calls to internal Symbia services (identity, catalog, logging, etc.).
 * Unlike the OpenAPI executor for external services, this executor:
 * - Forwards the user's JWT token instead of fetching external credentials
 * - Resolves service URLs via @symbia/sys
 * - Handles internal-specific headers (X-Org-Id, etc.)
 */

import type {
  IntegrationExecutor,
  ExecuteOperationRequest,
  ExecuteOperationResponse,
  APICallResult,
  OperationType,
} from "./types.js";
import { IntegrationError } from "../errors.js";
import { integrationRegistry } from "../spec-parser/integration-registry.js";
import { isInternalService } from "../internal-services.js";

/**
 * Internal Service Executor - handles API calls to Symbia internal services
 */
class InternalExecutor implements IntegrationExecutor {
  readonly supportedTypes: OperationType[] = ["api-call"];

  canHandle(operationType: OperationType): boolean {
    return this.supportedTypes.includes(operationType);
  }

  /**
   * Check if this executor should handle the request
   * (only for internal Symbia services)
   */
  shouldHandle(integrationKey: string): boolean {
    return isInternalService(integrationKey);
  }

  async execute(request: ExecuteOperationRequest): Promise<ExecuteOperationResponse> {
    const { operation, integrationKey, params, context } = request;

    // Get the integration definition
    const integration = integrationRegistry.get(integrationKey);
    if (!integration) {
      throw new IntegrationError({
        message: `Integration not found: ${integrationKey}`,
        category: "not_found",
      });
    }

    // Verify this is an internal service
    if (!isInternalService(integrationKey)) {
      throw new IntegrationError({
        message: `Not an internal service: ${integrationKey}`,
        category: "validation",
      });
    }

    // Get the server URL (already resolved by @symbia/sys during loading)
    const baseUrl = integration.openapi?.serverUrl;
    if (!baseUrl) {
      throw new IntegrationError({
        message: `No server URL configured for ${integrationKey}`,
        category: "internal",
      });
    }

    // Build the request URL
    const url = this.buildUrl(baseUrl, operation.path || "", params);

    // Build headers - forward user's JWT and org context
    const headers = this.buildHeaders(context, params);

    // Build request body for POST/PUT/PATCH
    const method = operation.method || "GET";
    const body = this.buildBody(method, operation, params);

    console.log(`[internal-executor] ${method} ${url}`);

    // Execute the request
    const controller = new AbortController();
    const timeout = context.timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Parse response
      const contentType = response.headers.get("content-type") || "";
      let responseBody: unknown;

      if (contentType.includes("application/json")) {
        responseBody = await response.json();
      } else {
        responseBody = await response.text();
      }

      // Convert headers to Record
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const result: APICallResult = {
        type: "api-call",
        data: {
          statusCode: response.status,
          headers: responseHeaders,
          body: responseBody,
        },
      };

      // Log errors
      if (!response.ok) {
        console.error(`[internal-executor] Error ${response.status}:`, responseBody);
      }

      return result;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new IntegrationError({
          message: `Request timed out after ${timeout}ms`,
          category: "timeout",
        });
      }

      throw new IntegrationError({
        message: error instanceof Error ? error.message : "Request failed",
        category: "network",
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  /**
   * Build the full URL with path parameters substituted
   */
  private buildUrl(baseUrl: string, path: string, params: Record<string, unknown>): string {
    // Normalize base URL (remove trailing slash)
    const normalizedBase = baseUrl.replace(/\/$/, "");

    // Build the full URL
    let url = `${normalizedBase}${path}`;

    // Substitute path parameters (e.g., /users/{id} -> /users/123)
    const pathParamMatches = path.match(/\{(\w+)\}/g);
    if (pathParamMatches) {
      for (const match of pathParamMatches) {
        const paramName = match.slice(1, -1);
        if (params[paramName] !== undefined) {
          url = url.replace(match, encodeURIComponent(String(params[paramName])));
          // Remove used path param from params object for body
          delete params[paramName];
        }
      }
    }

    // Add query parameters for GET requests
    // TODO: Use operation.parameters to determine which params are query params
    // For now, we'll add all remaining params as query params for GET

    return url;
  }

  /**
   * Build request headers with authentication and org context
   */
  private buildHeaders(
    context: ExecuteOperationRequest["context"],
    params: Record<string, unknown>
  ): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Forward the user's JWT token
    if (context.authToken) {
      headers["Authorization"] = `Bearer ${context.authToken}`;
    }

    // Forward organization context
    if (context.orgId) {
      headers["X-Org-Id"] = context.orgId;
    }

    // Forward request ID for tracing
    if (context.requestId) {
      headers["X-Request-Id"] = context.requestId;
    }

    return headers;
  }

  /**
   * Build request body from parameters
   */
  private buildBody(
    method: string,
    operation: any,
    params: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    if (method === "GET" || method === "HEAD") {
      return undefined;
    }

    // For DELETE, only include body if there are remaining params
    if (method === "DELETE") {
      const body: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          body[key] = value;
        }
      }
      return Object.keys(body).length > 0 ? body : undefined;
    }

    // For POST/PUT/PATCH, include all params as body
    const body: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        body[key] = value;
      }
    }

    return Object.keys(body).length > 0 ? body : undefined;
  }
}

export const internalExecutor = new InternalExecutor();
export { InternalExecutor };
