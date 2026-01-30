/**
 * OpenAPI Executor
 *
 * Executes operations discovered from OpenAPI specifications.
 * Handles REST API calls with proper auth, parameter placement, and response parsing.
 */

import type {
  IntegrationExecutor,
  ExecuteOperationRequest,
  ExecuteOperationResponse,
  APICallResult,
  OperationType,
} from "./types.js";
import { IntegrationError } from "../errors.js";
import { getCredential } from "../credential-client.js";
import { integrationRegistry } from "../spec-parser/integration-registry.js";

/**
 * OpenAPI Executor - handles generic REST API calls via OpenAPI specs
 */
class OpenAPIExecutor implements IntegrationExecutor {
  readonly supportedTypes: OperationType[] = ["api-call"];

  canHandle(operationType: OperationType): boolean {
    return this.supportedTypes.includes(operationType);
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

    // Get credential for this integration
    const credential = await getCredential(
      context.userId,
      context.orgId,
      integrationKey,
      context.authToken
    );

    if (!credential?.apiKey) {
      throw new IntegrationError({
        message: `No credentials configured for ${integrationKey}`,
        category: "auth",
      });
    }

    // Build the request URL
    const baseUrl = this.getBaseUrl(integration, credential.apiKey);
    const url = this.buildUrl(baseUrl, operation.path || "", params);

    // Build headers with auth
    const headers = this.buildHeaders(integration, credential.apiKey, params);

    // Build request body for POST/PUT/PATCH
    const method = operation.method || "GET";
    const body = this.buildBody(method, operation, params);

    console.log(`[openapi-executor] ${method} ${url}`);

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

      // Check for error status codes
      if (!response.ok) {
        console.error(`[openapi-executor] Error ${response.status}:`, responseBody);
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
   * Get base URL, substituting token if needed (e.g., Telegram uses bot{token})
   */
  private getBaseUrl(integration: any, apiKey: string): string {
    let baseUrl = integration.openapi?.serverUrl || "";

    // Handle token-in-path pattern (e.g., Telegram: https://api.telegram.org/bot{token})
    if (baseUrl.includes("{token}")) {
      baseUrl = baseUrl.replace("{token}", apiKey);
    }

    // Also check metadata for serverUrl (catalog bootstrap pattern)
    if (!baseUrl && integration.metadata?.serverUrl) {
      baseUrl = integration.metadata.serverUrl.replace("{token}", apiKey);
    }

    return baseUrl.replace(/\/$/, ""); // Remove trailing slash
  }

  /**
   * Build the full URL with path parameters substituted
   */
  private buildUrl(baseUrl: string, path: string, params: Record<string, unknown>): string {
    let url = `${baseUrl}${path}`;

    // Substitute path parameters (e.g., /users/{id} -> /users/123)
    const pathParamMatches = path.match(/\{(\w+)\}/g);
    if (pathParamMatches) {
      for (const match of pathParamMatches) {
        const paramName = match.slice(1, -1);
        if (params[paramName] !== undefined) {
          url = url.replace(match, String(params[paramName]));
        }
      }
    }

    // Add query parameters
    const queryParams = new URLSearchParams();
    // TODO: Use operation.parameters to determine which params are query params
    // For now, we skip query params as most Telegram operations use POST with body

    return url;
  }

  /**
   * Build request headers with authentication
   */
  private buildHeaders(
    integration: any,
    apiKey: string,
    params: Record<string, unknown>
  ): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const authType = integration.auth?.type || integration.metadata?.authType;

    switch (authType) {
      case "bearer":
        headers["Authorization"] = `Bearer ${apiKey}`;
        break;
      case "header":
      case "apiKey":
        const headerName = integration.auth?.header || integration.metadata?.authHeader || "X-API-Key";
        headers[headerName] = apiKey;
        break;
      case "path":
        // Token already substituted in URL
        break;
      case "none":
        // No auth needed
        break;
      // For Telegram, auth is in the path, so no header needed
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
    if (method === "GET" || method === "HEAD" || method === "DELETE") {
      return undefined;
    }

    // Filter out path parameters and return the rest as body
    // TODO: Use operation.parameters to be more precise
    const body: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        body[key] = value;
      }
    }

    return Object.keys(body).length > 0 ? body : undefined;
  }
}

export const openapiExecutor = new OpenAPIExecutor();
export { OpenAPIExecutor };
