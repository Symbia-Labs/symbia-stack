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
    // Declared 16 Aug. The route has existed since the models rework, but
    // an undeclared route is an unreachable one for any caller that
    // resolves against this document — the MCP dispatcher reported models'
    // weight download as "no such operation" while the handler sat there
    // working. Spec completeness is a capability gap, measurably.
    "/api/integrations/download": {
      post: {
        tags: ["Execute"],
        summary: "Stream a file from a provider through this service",
        description:
          "Streams bytes from the provider to the caller. This service supplies the org's credential when it holds one, so gated repositories work and the key never leaves here. It makes no claim about what the bytes are — the caller hashes, ledgers and cards them.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["provider", "repo", "file"],
                properties: {
                  provider: { type: "string", enum: ["huggingface"] },
                  repo: { type: "string", example: "TheBloke/Llama-2-7B-GGUF" },
                  file: { type: "string", description: "A plain .gguf file name, no path", example: "llama-2-7b.Q4_K_M.gguf" },
                  revision: { type: "string", default: "main" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "The file, streamed", content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } },
          "400": { description: "provider, repo and a plain .gguf file name required" },
          "401": { description: "Authentication required" },
          "500": { description: "The provider refused or the stream failed" },
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


// --- Auto-documented endpoints (added by the API documentation validation sweep) ---
// These routes are implemented but were missing from the spec above. Entries are
// thin-but-accurate (method, path, params, standard responses); field-level request/
// response schemas are marked `x-auto-documented` and can be enriched over time.
{
  const __autoDocumentedPaths: Record<string, any> = {
  "/api/oauth/connections/{id}": {
    "delete": {
      "tags": [
        "Api"
      ],
      "summary": "Delete connections",
      "description": "Documented from the implemented route. Request/response schema to be enriched.",
      "x-auto-documented": true,
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "schema": {
            "type": "string"
          }
        }
      ],
      "responses": {
        "204": {
          "description": "Deleted"
        },
        "401": {
          "description": "Unauthorized"
        },
        "404": {
          "description": "Not found"
        }
      }
    }
  },
  "/admin/users": {
    "get": {
      "tags": [
        "Admin"
      ],
      "summary": "List users",
      "description": "Documented from the implemented route. Request/response schema to be enriched.",
      "x-auto-documented": true,
      "responses": {
        "200": {
          "description": "Success",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "401": {
          "description": "Unauthorized"
        }
      }
    }
  },
  "/api/integrations/channels/benchmarks": {
    "get": {
      "tags": [
        "Api"
      ],
      "summary": "List benchmarks",
      "description": "Documented from the implemented route. Request/response schema to be enriched.",
      "x-auto-documented": true,
      "responses": {
        "200": {
          "description": "Success",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "401": {
          "description": "Unauthorized"
        }
      }
    }
  },
  "/api/integrations/channels/benchmarks/{id}": {
    "get": {
      "tags": [
        "Api"
      ],
      "summary": "Get benchmarks",
      "description": "Documented from the implemented route. Request/response schema to be enriched.",
      "x-auto-documented": true,
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "schema": {
            "type": "string"
          }
        }
      ],
      "responses": {
        "200": {
          "description": "Success",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "401": {
          "description": "Unauthorized"
        },
        "404": {
          "description": "Not found"
        }
      }
    }
  },
  "/api/integrations/channels/catalog/export": {
    "get": {
      "tags": [
        "Api"
      ],
      "summary": "Export api integrations channels catalog export",
      "description": "Documented from the implemented route. Request/response schema to be enriched.",
      "x-auto-documented": true,
      "responses": {
        "200": {
          "description": "Success",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "401": {
          "description": "Unauthorized"
        }
      }
    }
  },
  "/api/integrations/channels/catalog/preview": {
    "get": {
      "tags": [
        "Api"
      ],
      "summary": "Preview api integrations channels catalog preview",
      "description": "Documented from the implemented route. Request/response schema to be enriched.",
      "x-auto-documented": true,
      "responses": {
        "200": {
          "description": "Success",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "401": {
          "description": "Unauthorized"
        }
      }
    }
  },
  "/api/integrations/channels/evaluations": {
    "get": {
      "tags": [
        "Api"
      ],
      "summary": "List evaluations",
      "description": "Documented from the implemented route. Request/response schema to be enriched.",
      "x-auto-documented": true,
      "responses": {
        "200": {
          "description": "Success",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "401": {
          "description": "Unauthorized"
        }
      }
    }
  },
  "/api/integrations/channels/evaluations/{id}": {
    "get": {
      "tags": [
        "Api"
      ],
      "summary": "Get evaluations",
      "description": "Documented from the implemented route. Request/response schema to be enriched.",
      "x-auto-documented": true,
      "parameters": [
        {
          "name": "id",
          "in": "path",
          "required": true,
          "schema": {
            "type": "string"
          }
        }
      ],
      "responses": {
        "200": {
          "description": "Success",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "401": {
          "description": "Unauthorized"
        },
        "404": {
          "description": "Not found"
        }
      }
    }
  },
  "/api/integrations/channels/models": {
    "get": {
      "tags": [
        "Api"
      ],
      "summary": "List models",
      "description": "Documented from the implemented route. Request/response schema to be enriched.",
      "x-auto-documented": true,
      "responses": {
        "200": {
          "description": "Success",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "401": {
          "description": "Unauthorized"
        }
      }
    }
  },
  "/api/integrations/channels/scores": {
    "get": {
      "tags": [
        "Api"
      ],
      "summary": "List scores",
      "description": "Documented from the implemented route. Request/response schema to be enriched.",
      "x-auto-documented": true,
      "responses": {
        "200": {
          "description": "Success",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "401": {
          "description": "Unauthorized"
        }
      }
    }
  },
  "/api/integrations/models": {
    "get": {
      "tags": [
        "Api"
      ],
      "summary": "List models",
      "description": "Documented from the implemented route. Request/response schema to be enriched.",
      "x-auto-documented": true,
      "responses": {
        "200": {
          "description": "Success",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "401": {
          "description": "Unauthorized"
        }
      }
    }
  },
  "/api/integrations/namespace": {
    "get": {
      "tags": [
        "Api"
      ],
      "summary": "Get namespace",
      "description": "Documented from the implemented route. Request/response schema to be enriched.",
      "x-auto-documented": true,
      "responses": {
        "200": {
          "description": "Success",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "401": {
          "description": "Unauthorized"
        }
      }
    }
  },
  "/api/integrations/operations/search": {
    "get": {
      "tags": [
        "Api"
      ],
      "summary": "Get search",
      "description": "Documented from the implemented route. Request/response schema to be enriched.",
      "x-auto-documented": true,
      "responses": {
        "200": {
          "description": "Success",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "401": {
          "description": "Unauthorized"
        }
      }
    }
  },
  "/api/integrations/registry/{key}": {
    "get": {
      "tags": [
        "Api"
      ],
      "summary": "Get registry",
      "description": "Documented from the implemented route. Request/response schema to be enriched.",
      "x-auto-documented": true,
      "parameters": [
        {
          "name": "key",
          "in": "path",
          "required": true,
          "schema": {
            "type": "string"
          }
        }
      ],
      "responses": {
        "200": {
          "description": "Success",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "401": {
          "description": "Unauthorized"
        },
        "404": {
          "description": "Not found"
        }
      }
    }
  },
  "/api/integrations/usage/by-user": {
    "get": {
      "tags": [
        "Api"
      ],
      "summary": "Get by user",
      "description": "Documented from the implemented route. Request/response schema to be enriched.",
      "x-auto-documented": true,
      "responses": {
        "200": {
          "description": "Success",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "401": {
          "description": "Unauthorized"
        }
      }
    }
  },
  "/api/integrations/usage/logs": {
    "get": {
      "tags": [
        "Api"
      ],
      "summary": "List logs",
      "description": "Documented from the implemented route. Request/response schema to be enriched.",
      "x-auto-documented": true,
      "responses": {
        "200": {
          "description": "Success",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "401": {
          "description": "Unauthorized"
        }
      }
    }
  },
  "/api/oauth/callback": {
    "get": {
      "tags": [
        "Api"
      ],
      "summary": "Callback api oauth callback",
      "description": "Documented from the implemented route. Request/response schema to be enriched.",
      "x-auto-documented": true,
      "responses": {
        "200": {
          "description": "Success",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "401": {
          "description": "Unauthorized"
        }
      }
    }
  },
  "/api/oauth/connections": {
    "get": {
      "tags": [
        "Api"
      ],
      "summary": "List connections",
      "description": "Documented from the implemented route. Request/response schema to be enriched.",
      "x-auto-documented": true,
      "responses": {
        "200": {
          "description": "Success",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "401": {
          "description": "Unauthorized"
        }
      }
    }
  },
  "/api/oauth/providers": {
    "get": {
      "tags": [
        "Api"
      ],
      "summary": "List providers",
      "description": "Documented from the implemented route. Request/response schema to be enriched.",
      "x-auto-documented": true,
      "responses": {
        "200": {
          "description": "Success",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "401": {
          "description": "Unauthorized"
        }
      }
    }
  },
  "/api/stats": {
    "get": {
      "tags": [
        "Api"
      ],
      "summary": "List stats",
      "description": "Documented from the implemented route. Request/response schema to be enriched.",
      "x-auto-documented": true,
      "responses": {
        "200": {
          "description": "Success",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "401": {
          "description": "Unauthorized"
        }
      }
    }
  },
  "/api/integrations/channels/benchmarks/run": {
    "post": {
      "tags": [
        "Api"
      ],
      "summary": "Run api integrations channels benchmarks run",
      "description": "Documented from the implemented route. Request/response schema to be enriched.",
      "x-auto-documented": true,
      "requestBody": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "additionalProperties": true
            }
          }
        }
      },
      "responses": {
        "201": {
          "description": "Success",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "400": {
          "description": "Invalid input"
        },
        "401": {
          "description": "Unauthorized"
        }
      }
    }
  },
  "/api/integrations/channels/catalog/sync": {
    "post": {
      "tags": [
        "Api"
      ],
      "summary": "Sync api integrations channels catalog sync",
      "description": "Documented from the implemented route. Request/response schema to be enriched.",
      "x-auto-documented": true,
      "requestBody": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "additionalProperties": true
            }
          }
        }
      },
      "responses": {
        "201": {
          "description": "Success",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "400": {
          "description": "Invalid input"
        },
        "401": {
          "description": "Unauthorized"
        }
      }
    }
  },
  "/api/integrations/channels/recommendations": {
    "post": {
      "tags": [
        "Api"
      ],
      "summary": "Recommendations api integrations channels recommendations",
      "description": "Documented from the implemented route. Request/response schema to be enriched.",
      "x-auto-documented": true,
      "requestBody": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "additionalProperties": true
            }
          }
        }
      },
      "responses": {
        "201": {
          "description": "Success",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "400": {
          "description": "Invalid input"
        },
        "401": {
          "description": "Unauthorized"
        }
      }
    }
  },
  "/api/integrations/channels/scores/aggregate": {
    "post": {
      "tags": [
        "Api"
      ],
      "summary": "Aggregate api integrations channels scores aggregate",
      "description": "Documented from the implemented route. Request/response schema to be enriched.",
      "x-auto-documented": true,
      "requestBody": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "additionalProperties": true
            }
          }
        }
      },
      "responses": {
        "201": {
          "description": "Success",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "400": {
          "description": "Invalid input"
        },
        "401": {
          "description": "Unauthorized"
        }
      }
    }
  },
  "/api/integrations/parse/mcp": {
    "post": {
      "tags": [
        "Api"
      ],
      "summary": "Create mcp",
      "description": "Documented from the implemented route. Request/response schema to be enriched.",
      "x-auto-documented": true,
      "requestBody": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "additionalProperties": true
            }
          }
        }
      },
      "responses": {
        "201": {
          "description": "Success",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "400": {
          "description": "Invalid input"
        },
        "401": {
          "description": "Unauthorized"
        }
      }
    }
  },
  "/api/integrations/parse/openapi": {
    "post": {
      "tags": [
        "Api"
      ],
      "summary": "Create openapi",
      "description": "Documented from the implemented route. Request/response schema to be enriched.",
      "x-auto-documented": true,
      "requestBody": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "additionalProperties": true
            }
          }
        }
      },
      "responses": {
        "201": {
          "description": "Success",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "400": {
          "description": "Invalid input"
        },
        "401": {
          "description": "Unauthorized"
        }
      }
    }
  },
  "/api/integrations/registry/{key}/refresh": {
    "post": {
      "tags": [
        "Api"
      ],
      "summary": "Refresh api integrations registry refresh",
      "description": "Documented from the implemented route. Request/response schema to be enriched.",
      "x-auto-documented": true,
      "parameters": [
        {
          "name": "key",
          "in": "path",
          "required": true,
          "schema": {
            "type": "string"
          }
        }
      ],
      "requestBody": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "additionalProperties": true
            }
          }
        }
      },
      "responses": {
        "201": {
          "description": "Success",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "400": {
          "description": "Invalid input"
        },
        "401": {
          "description": "Unauthorized"
        },
        "404": {
          "description": "Not found"
        }
      }
    }
  },
  "/api/oauth/authorize": {
    "post": {
      "tags": [
        "Api"
      ],
      "summary": "Authorize api oauth authorize",
      "description": "Documented from the implemented route. Request/response schema to be enriched.",
      "x-auto-documented": true,
      "requestBody": {
        "required": true,
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "additionalProperties": true
            }
          }
        }
      },
      "responses": {
        "201": {
          "description": "Success",
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "400": {
          "description": "Invalid input"
        },
        "401": {
          "description": "Unauthorized"
        }
      }
    }
  }
};
  const __paths = apiDocumentation.paths as Record<string, any>;
  for (const [key, ops] of Object.entries(__autoDocumentedPaths)) {
    __paths[key] = { ...(__paths[key] || {}), ...(ops as Record<string, any>) };
  }
}
