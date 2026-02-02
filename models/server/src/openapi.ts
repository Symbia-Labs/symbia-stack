/**
 * OpenAPI Documentation for the Models Service
 *
 * Defines the API spec for local LLM inference endpoints.
 */

import type { OpenAPIObject } from "@symbia/md";

export const apiDocumentation: OpenAPIObject = {
  openapi: "3.1.0",
  info: {
    title: "Symbia Models Service",
    version: "1.0.0",
    description: `Local LLM inference service using node-llama-cpp.

Provides OpenAI-compatible API endpoints for chat completions and model management.
Models are automatically registered with the Catalog service for discovery.

## Features
- OpenAI-compatible /v1/chat/completions endpoint
- Automatic model discovery from /data/models directory
- LRU caching with configurable max loaded models
- Idle timeout for automatic unloading
- Streaming support via Server-Sent Events
- Catalog integration for model registry

## Provider Name
When using through the Integrations service, use provider: "symbia-labs"`,
  },
  servers: [
    {
      url: "http://localhost:5008",
      description: "Local development",
    },
  ],
  paths: {
    "/v1/chat/completions": {
      post: {
        operationId: "createChatCompletion",
        summary: "Create chat completion",
        description: "OpenAI-compatible chat completion endpoint. Supports both streaming and non-streaming responses.",
        tags: ["OpenAI Compatible"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ChatCompletionRequest",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Successful completion",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ChatCompletionResponse",
                },
              },
              "text/event-stream": {
                schema: {
                  type: "string",
                  description: "SSE stream of completion chunks",
                },
              },
            },
          },
          "400": {
            description: "Invalid request",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "404": {
            description: "Model not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/v1/models": {
      get: {
        operationId: "listModels",
        summary: "List available models",
        description: "Returns a list of all available local GGUF models.",
        tags: ["OpenAI Compatible"],
        responses: {
          "200": {
            description: "List of models",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ModelListResponse",
                },
              },
            },
          },
        },
      },
    },
    "/v1/models/{id}": {
      get: {
        operationId: "getModel",
        summary: "Get model details",
        description: "Returns details about a specific model including load status and capabilities.",
        tags: ["OpenAI Compatible"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "string",
            },
            description: "Model ID",
          },
        ],
        responses: {
          "200": {
            description: "Model details",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ModelInfo",
                },
              },
            },
          },
          "404": {
            description: "Model not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/api/models": {
      get: {
        operationId: "listModelsApi",
        summary: "List all models",
        description: "Returns all available models with detailed metadata.",
        tags: ["Model Management"],
        responses: {
          "200": {
            description: "List of models",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ModelListResponse",
                },
              },
            },
          },
        },
      },
    },
    "/api/models/{id}": {
      get: {
        operationId: "getModelApi",
        summary: "Get model details",
        description: "Returns detailed information about a specific model.",
        tags: ["Model Management"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "string",
            },
            description: "Model ID",
          },
        ],
        responses: {
          "200": {
            description: "Model details",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ModelInfo",
                },
              },
            },
          },
          "404": {
            description: "Model not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/api/models/{id}/load": {
      post: {
        operationId: "loadModel",
        summary: "Load model into memory",
        description: "Loads a model into memory for inference. Requires authentication.",
        tags: ["Model Management"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "string",
            },
            description: "Model ID",
          },
        ],
        responses: {
          "200": {
            description: "Model loaded successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    model: { $ref: "#/components/schemas/ModelInfo" },
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "404": {
            description: "Model not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/api/models/{id}/unload": {
      post: {
        operationId: "unloadModel",
        summary: "Unload model from memory",
        description: "Unloads a model from memory to free resources. Requires authentication.",
        tags: ["Model Management"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "string",
            },
            description: "Model ID",
          },
        ],
        responses: {
          "200": {
            description: "Model unloaded successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                  },
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/api/integrations/execute": {
      post: {
        operationId: "execute",
        summary: "Execute Symbia integration",
        description: "Symbia-compatible execute endpoint for use via the Integrations service.",
        tags: ["Symbia Integration"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ExecuteRequest",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Execution result",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ExecuteResponse",
                },
              },
            },
          },
          "400": {
            description: "Invalid request",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
              },
            },
          },
        },
      },
    },
    "/api/stats": {
      get: {
        operationId: "getStats",
        summary: "Get service statistics",
        description: "Returns statistics about loaded models and memory usage.",
        tags: ["Stats"],
        responses: {
          "200": {
            description: "Service statistics",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/StatsResponse",
                },
              },
            },
          },
        },
      },
    },
    "/health/live": {
      get: {
        operationId: "healthLive",
        summary: "Liveness check",
        description: "Returns 200 if the service is alive.",
        tags: ["Health"],
        responses: {
          "200": {
            description: "Service is alive",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/health/ready": {
      get: {
        operationId: "healthReady",
        summary: "Readiness check",
        description: "Returns 200 if the service is ready to handle requests.",
        tags: ["Health"],
        responses: {
          "200": {
            description: "Service is ready",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "JWT token from Identity service",
      },
    },
    schemas: {
      ChatCompletionRequest: {
        type: "object",
        required: ["model", "messages"],
        properties: {
          model: {
            type: "string",
            description: "Model ID to use for completion",
            example: "llama-3-2-3b-q4-k-m",
          },
          messages: {
            type: "array",
            items: {
              $ref: "#/components/schemas/ChatMessage",
            },
            description: "Conversation messages",
          },
          temperature: {
            type: "number",
            minimum: 0,
            maximum: 2,
            default: 0.7,
            description: "Sampling temperature",
          },
          max_tokens: {
            type: "integer",
            minimum: 1,
            default: 2048,
            description: "Maximum tokens to generate",
          },
          stream: {
            type: "boolean",
            default: false,
            description: "Enable streaming response via SSE",
          },
          top_p: {
            type: "number",
            minimum: 0,
            maximum: 1,
            description: "Nucleus sampling probability",
          },
          stop: {
            type: "array",
            items: { type: "string" },
            description: "Stop sequences",
          },
        },
      },
      ChatMessage: {
        type: "object",
        required: ["role", "content"],
        properties: {
          role: {
            type: "string",
            enum: ["system", "user", "assistant"],
            description: "Message role",
          },
          content: {
            type: "string",
            description: "Message content",
          },
        },
      },
      ChatCompletionResponse: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Completion ID",
          },
          object: {
            type: "string",
            example: "chat.completion",
          },
          created: {
            type: "integer",
            description: "Unix timestamp",
          },
          model: {
            type: "string",
            description: "Model used",
          },
          choices: {
            type: "array",
            items: {
              type: "object",
              properties: {
                index: { type: "integer" },
                message: { $ref: "#/components/schemas/ChatMessage" },
                finish_reason: {
                  type: "string",
                  enum: ["stop", "length", "error"],
                },
              },
            },
          },
          usage: {
            type: "object",
            properties: {
              prompt_tokens: { type: "integer" },
              completion_tokens: { type: "integer" },
              total_tokens: { type: "integer" },
            },
          },
        },
      },
      ModelInfo: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Model ID",
          },
          object: {
            type: "string",
            example: "model",
          },
          name: {
            type: "string",
            description: "Display name",
          },
          filename: {
            type: "string",
            description: "GGUF filename",
          },
          filepath: {
            type: "string",
            description: "Full path to model file",
          },
          contextLength: {
            type: "integer",
            description: "Context window size",
          },
          capabilities: {
            type: "array",
            items: { type: "string" },
            description: "Model capabilities (chat, completion, etc.)",
          },
          status: {
            type: "string",
            enum: ["available", "loading", "loaded", "error"],
            description: "Current status",
          },
          loaded: {
            type: "boolean",
            description: "Whether model is loaded in memory",
          },
          memoryUsageMB: {
            type: "integer",
            description: "Estimated memory usage in MB",
          },
          createdAt: {
            type: "string",
            format: "date-time",
            description: "File creation timestamp",
          },
          lastUsed: {
            type: "string",
            format: "date-time",
            description: "Last inference timestamp",
          },
        },
      },
      ModelListResponse: {
        type: "object",
        properties: {
          object: {
            type: "string",
            example: "list",
          },
          data: {
            type: "array",
            items: {
              $ref: "#/components/schemas/ModelInfo",
            },
          },
        },
      },
      ExecuteRequest: {
        type: "object",
        required: ["provider", "operation", "params"],
        properties: {
          provider: {
            type: "string",
            enum: ["symbia-labs", "local"],
            description: "Provider name",
          },
          operation: {
            type: "string",
            enum: ["chat.completions", "completions"],
            description: "Operation to execute",
          },
          params: {
            type: "object",
            description: "Operation parameters",
            properties: {
              model: { type: "string" },
              messages: {
                type: "array",
                items: { $ref: "#/components/schemas/ChatMessage" },
              },
              temperature: { type: "number" },
              maxTokens: { type: "integer" },
            },
          },
        },
      },
      ExecuteResponse: {
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
            enum: ["stop", "length", "error"],
          },
          metadata: {
            type: "object",
            additionalProperties: true,
          },
        },
      },
      StatsResponse: {
        type: "object",
        properties: {
          loadedModels: {
            type: "integer",
            description: "Number of models currently loaded",
          },
          memoryUsageMB: {
            type: "integer",
            description: "Total memory used by loaded models",
          },
          totalRequests: {
            type: "integer",
            description: "Total inference requests processed",
          },
        },
      },
      ErrorResponse: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              message: { type: "string" },
              type: { type: "string" },
              code: { type: "string", nullable: true },
            },
          },
        },
      },
    },
  },
  tags: [
    {
      name: "OpenAI Compatible",
      description: "OpenAI-compatible endpoints for drop-in replacement",
    },
    {
      name: "Model Management",
      description: "Endpoints for managing model lifecycle",
    },
    {
      name: "Symbia Integration",
      description: "Symbia platform integration endpoints",
    },
    {
      name: "Stats",
      description: "Service statistics and metrics",
    },
    {
      name: "Health",
      description: "Health check endpoints",
    },
  ],
};
