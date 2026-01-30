/**
 * OpenAPI V3 Documentation for Integrations Service
 */

interface OpenAPIDocument {
  openapi: string;
  info: {
    title: string;
    description?: string;
    version: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  tags?: Array<{ name: string; description?: string }>;
  paths: Record<string, unknown>;
  components?: {
    securitySchemes?: Record<string, unknown>;
    schemas?: Record<string, unknown>;
  };
}

export const apiDocumentation: OpenAPIDocument = {
  openapi: "3.0.3",
  info: {
    title: "Symbia Integrations Service",
    description: "Centralized gateway for third-party API traffic. Sole bridge to the external world in most Symbia networks.",
    version: "2.0.0",
  },
  servers: [
    {
      url: "http://localhost:5007",
      description: "Local development",
    },
  ],
  tags: [
    { name: "Execute", description: "Execute operations via providers" },
    { name: "Providers", description: "Provider configuration and discovery" },
    { name: "Registry", description: "Integration registry management" },
    { name: "MCP", description: "MCP server and client endpoints" },
    { name: "Usage", description: "Usage analytics" },
    { name: "Health", description: "Service health and monitoring" },
    { name: "Database", description: "Database management (in-memory mode)" },
  ],
  paths: {
    "/api/integrations/execute": {
      post: {
        tags: ["Execute"],
        summary: "Execute an LLM operation",
        description: "Execute a chat completion or embedding operation through a configured provider",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ExecuteRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Successful execution",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ExecuteResponse" },
              },
            },
          },
          "400": { description: "Invalid request or validation error" },
          "401": { description: "Authentication required" },
          "429": { description: "Rate limit exceeded" },
          "502": { description: "Provider error" },
          "503": { description: "Circuit breaker open or service unavailable" },
          "504": { description: "Request timed out" },
        },
      },
    },
    "/api/integrations/invoke": {
      post: {
        tags: ["Execute"],
        summary: "Invoke any registered integration operation",
        description: "Invoke operations from registered OpenAPI specs, MCP servers, or built-in providers",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/InvokeRequest" },
            },
          },
        },
        responses: {
          "200": { description: "Successful invocation" },
          "400": { description: "Invalid request" },
          "401": { description: "Authentication required" },
          "404": { description: "Operation not found" },
        },
      },
    },
    "/api/integrations/providers": {
      get: {
        tags: ["Providers"],
        summary: "List available providers",
        responses: {
          "200": {
            description: "List of providers",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    providers: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ProviderInfo" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/integrations/providers/{provider}": {
      get: {
        tags: ["Providers"],
        summary: "Get provider configuration",
        parameters: [
          { name: "provider", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Provider configuration" },
          "404": { description: "Provider not found" },
        },
      },
    },
    "/api/integrations/providers/{provider}/models": {
      get: {
        tags: ["Providers"],
        summary: "Get available models for a provider",
        parameters: [
          { name: "provider", in: "path", required: true, schema: { type: "string" } },
          { name: "capability", in: "query", schema: { type: "string" } },
        ],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "List of models" },
        },
      },
    },
    "/api/integrations/capabilities": {
      get: {
        tags: ["Providers"],
        summary: "Get comprehensive provider capabilities",
        description: "System of Record for UI - includes access status, models by purpose, defaults",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Provider capabilities",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CapabilitiesResponse" },
              },
            },
          },
        },
      },
    },
    "/api/integrations/registry": {
      get: {
        tags: ["Registry"],
        summary: "List all registered integrations",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "List of integrations" },
        },
      },
    },
    "/api/integrations/register": {
      post: {
        tags: ["Registry"],
        summary: "Register a new integration",
        description: "Register an OpenAPI spec or MCP server as a callable integration",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RegisterRequest" },
            },
          },
        },
        responses: {
          "200": { description: "Integration registered" },
          "400": { description: "Invalid request" },
        },
      },
    },
    "/api/integrations/registry/{key}/operations": {
      get: {
        tags: ["Registry"],
        summary: "Get operations for an integration",
        parameters: [
          { name: "key", in: "path", required: true, schema: { type: "string" } },
        ],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "List of operations" },
          "404": { description: "Integration not found" },
        },
      },
    },
    "/api/integrations/mcp": {
      post: {
        tags: ["MCP"],
        summary: "MCP JSON-RPC endpoint",
        description: "HTTP transport for MCP protocol. Supports initialize, tools/list, tools/call",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MCPRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "MCP response",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MCPResponse" },
              },
            },
          },
        },
      },
    },
    "/api/integrations/mcp/info": {
      get: {
        tags: ["MCP"],
        summary: "Get MCP server info",
        responses: {
          "200": { description: "Server info" },
        },
      },
    },
    "/api/integrations/mcp/register": {
      post: {
        tags: ["MCP"],
        summary: "Register an external MCP server",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RegisterMCPRequest" },
            },
          },
        },
        responses: {
          "200": { description: "MCP server registered" },
          "400": { description: "Failed to connect to MCP server" },
        },
      },
    },
    "/api/integrations/usage": {
      get: {
        tags: ["Usage"],
        summary: "Get usage summary for organization",
        parameters: [
          { name: "days", in: "query", schema: { type: "integer", default: 30 } },
          { name: "integration", in: "query", schema: { type: "string" } },
        ],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Usage summary" },
        },
      },
    },
    "/api/integrations/status": {
      get: {
        tags: ["Health"],
        summary: "Get service status",
        description: "Returns provider status and circuit breaker state",
        responses: {
          "200": {
            description: "Service status",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StatusResponse" },
              },
            },
          },
        },
      },
    },
    "/api/integrations/circuit-breaker": {
      get: {
        tags: ["Health"],
        summary: "Get circuit breaker status",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Circuit breaker status",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CircuitBreakerStatus" },
              },
            },
          },
        },
      },
    },
    "/api/integrations/circuit-breaker/reset": {
      post: {
        tags: ["Health"],
        summary: "Reset all circuit breakers",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "All circuits reset" },
        },
      },
    },
    "/api/integrations/circuit-breaker/reset/{provider}": {
      post: {
        tags: ["Health"],
        summary: "Reset circuit breaker for a provider",
        parameters: [
          { name: "provider", in: "path", required: true, schema: { type: "string" } },
        ],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Circuit reset" },
        },
      },
    },
    "/api/integrations/db/export": {
      post: {
        tags: ["Database"],
        summary: "Export in-memory database to file",
        description: "Exports the in-memory database to a backup file. Only applicable when using in-memory mode.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Export successful",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    path: { type: "string" },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
          "401": { description: "Authentication required" },
          "500": { description: "Export failed" },
        },
      },
    },
    "/api/integrations/db/status": {
      get: {
        tags: ["Database"],
        summary: "Get database status",
        description: "Returns information about the database mode (in-memory vs PostgreSQL) and persistence status.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Database status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    isMemory: { type: "boolean" },
                    persistsOnRestart: { type: "boolean" },
                    recommendation: { type: "string" },
                  },
                },
              },
            },
          },
          "401": { description: "Authentication required" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      ExecuteRequest: {
        type: "object",
        required: ["provider", "operation", "params"],
        properties: {
          provider: {
            type: "string",
            enum: ["openai", "anthropic", "google", "mistral", "cohere", "huggingface"],
          },
          operation: {
            type: "string",
            enum: ["chat.completions", "messages", "embeddings", "responses"],
          },
          params: {
            type: "object",
            required: ["model"],
            properties: {
              model: { type: "string" },
              messages: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    role: { type: "string", enum: ["system", "user", "assistant"] },
                    content: { type: "string" },
                  },
                },
              },
              temperature: { type: "number", minimum: 0, maximum: 2 },
              maxTokens: { type: "integer" },
              topP: { type: "number" },
              frequencyPenalty: { type: "number" },
              presencePenalty: { type: "number" },
              stop: { type: "array", items: { type: "string" } },
              seed: { type: "integer" },
              input: { type: "string", description: "For embedding operations" },
            },
          },
          credentialId: { type: "string" },
        },
      },
      ExecuteResponse: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          data: { $ref: "#/components/schemas/NormalizedLLMResponse" },
          error: { type: "string" },
          errorCategory: { $ref: "#/components/schemas/ErrorCategory" },
          retryable: { type: "boolean" },
          requestId: { type: "string" },
          durationMs: { type: "number" },
        },
      },
      NormalizedLLMResponse: {
        type: "object",
        properties: {
          provider: { type: "string" },
          model: { type: "string" },
          content: { type: "string" },
          usage: {
            type: "object",
            properties: {
              promptTokens: { type: "integer" },
              completionTokens: { type: "integer" },
              totalTokens: { type: "integer" },
            },
          },
          finishReason: {
            type: "string",
            enum: ["stop", "length", "content_filter", "tool_calls", "error", "incomplete"],
          },
          metadata: { type: "object" },
        },
      },
      ErrorCategory: {
        type: "string",
        enum: [
          "auth",
          "validation",
          "rate_limit",
          "timeout",
          "provider",
          "network",
          "not_found",
          "content_filter",
          "quota",
          "internal",
        ],
        description: "Error category for retry/fallback decisions",
      },
      InvokeRequest: {
        type: "object",
        required: ["operation"],
        properties: {
          operation: { type: "string", description: "Fully qualified operation ID" },
          body: { type: "object" },
          timeout: { type: "integer" },
        },
      },
      ProviderInfo: {
        type: "object",
        properties: {
          name: { type: "string" },
          baseUrl: { type: "string" },
          defaultModel: { type: "string" },
          supportedOperations: { type: "array", items: { type: "string" } },
        },
      },
      CapabilitiesResponse: {
        type: "object",
        properties: {
          providers: { type: "array", items: { type: "object" } },
          byProvider: { type: "object" },
          modelsByPurpose: {
            type: "object",
            properties: {
              chat: { type: "array", items: { type: "object" } },
              embedding: { type: "array", items: { type: "object" } },
              vision: { type: "array", items: { type: "object" } },
              reasoning: { type: "array", items: { type: "object" } },
            },
          },
          defaults: { type: "object" },
        },
      },
      RegisterRequest: {
        type: "object",
        required: ["key", "name", "type"],
        properties: {
          key: { type: "string" },
          name: { type: "string" },
          type: { type: "string", enum: ["openapi", "mcp", "builtin", "custom"] },
          openapi: {
            type: "object",
            properties: {
              specUrl: { type: "string" },
              serverUrl: { type: "string" },
            },
          },
          mcp: {
            type: "object",
            properties: {
              transport: { type: "string", enum: ["stdio", "http", "websocket"] },
              command: { type: "string" },
              args: { type: "array", items: { type: "string" } },
              serverUrl: { type: "string" },
            },
          },
          auth: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["none", "bearer", "apiKey"] },
            },
          },
        },
      },
      MCPRequest: {
        type: "object",
        required: ["jsonrpc", "method"],
        properties: {
          jsonrpc: { type: "string", enum: ["2.0"] },
          id: { oneOf: [{ type: "string" }, { type: "integer" }] },
          method: { type: "string" },
          params: { type: "object" },
        },
      },
      MCPResponse: {
        type: "object",
        properties: {
          jsonrpc: { type: "string" },
          id: { oneOf: [{ type: "string" }, { type: "integer" }] },
          result: { type: "object" },
          error: {
            type: "object",
            properties: {
              code: { type: "integer" },
              message: { type: "string" },
            },
          },
        },
      },
      RegisterMCPRequest: {
        type: "object",
        required: ["key", "name", "mcp"],
        properties: {
          key: { type: "string" },
          name: { type: "string" },
          mcp: {
            type: "object",
            properties: {
              transport: { type: "string", enum: ["stdio", "http", "websocket"] },
              command: { type: "string" },
              args: { type: "array", items: { type: "string" } },
              serverUrl: { type: "string" },
            },
          },
        },
      },
      StatusResponse: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["healthy", "degraded", "unhealthy"] },
          providers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                configured: { type: "boolean" },
              },
            },
          },
          circuitBreaker: { $ref: "#/components/schemas/CircuitBreakerStatus" },
        },
      },
      CircuitBreakerStatus: {
        type: "object",
        additionalProperties: {
          type: "object",
          properties: {
            state: { type: "string", enum: ["closed", "open", "half-open"] },
            failures: { type: "integer" },
            lastFailure: { type: "string" },
          },
        },
      },
    },
  },
};
