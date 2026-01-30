export const openApiSpec: any = {
  openapi: "3.0.3",
  info: {
    title: "Symbia Assistants Backend API",
    version: "1.0.0",
    description: "Backend APIs for prompt graphs, actor principals, run orchestration, rules engine, and LLM settings.",
  },
  servers: [
    {
      url: "/api",
      description: "API base",
    },
  ],
  tags: [
    { name: "health", description: "Service health and status" },
    { name: "graphs", description: "Prompt graph management" },
    { name: "runs", description: "Graph run history and logs" },
    { name: "actors", description: "Actor principal management" },
    { name: "webhooks", description: "Messaging webhooks" },
    { name: "rules", description: "Rules engine management (requires auth)" },
    { name: "settings", description: "LLM settings management (requires auth)" },
    { name: "assistants-admin", description: "Custom assistant management (requires auth)" },
  ],
  security: [
    { bearerAuth: [] },
    { apiKeyAuth: [] },
    { cookieAuth: [] },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT token from Identity Service",
      },
      apiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
        description: "API key from Identity Service",
      },
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "token",
        description: "Session cookie from Identity Service",
      },
    },
    parameters: {
      OrgId: {
        name: "orgId",
        in: "query",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["health"],
        summary: "Health check",
        responses: {
          "200": { description: "Service is healthy" },
        },
      },
    },
    "/v1/status": {
      get: {
        tags: ["health"],
        summary: "Database connectivity status",
        responses: {
          "200": { description: "Database connected" },
          "500": { description: "Database connection failed" },
        },
      },
    },
    "/v1/graphs": {
      get: {
        tags: ["graphs"],
        summary: "List graphs",
        parameters: [{ $ref: "#/components/parameters/OrgId" }],
        responses: {
          "200": { description: "List of graphs" },
          "400": { description: "orgId required" },
        },
      },
      post: {
        tags: ["graphs"],
        summary: "Create graph",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["orgId", "name", "graphJson"],
                properties: {
                  orgId: { type: "string", format: "uuid" },
                  name: { type: "string" },
                  description: { type: "string" },
                  graphJson: { type: "object" },
                  triggerConditions: { type: "object" },
                  logLevel: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Graph created" },
          "400": { description: "Validation failed" },
        },
      },
    },
    "/v1/graphs/{id}": {
      get: {
        tags: ["graphs"],
        summary: "Get graph",
        parameters: [
          { $ref: "#/components/parameters/OrgId" },
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "Graph" },
          "404": { description: "Graph not found" },
        },
      },
      put: {
        tags: ["graphs"],
        summary: "Update graph",
        parameters: [
          { $ref: "#/components/parameters/OrgId" },
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  graphJson: { type: "object" },
                  triggerConditions: { type: "object" },
                  logLevel: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Graph updated" },
          "404": { description: "Graph not found" },
        },
      },
      delete: {
        tags: ["graphs"],
        summary: "Delete graph",
        parameters: [
          { $ref: "#/components/parameters/OrgId" },
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "Graph deleted" },
          "404": { description: "Graph not found" },
        },
      },
    },
    "/v1/graphs/{id}/publish": {
      post: {
        tags: ["graphs"],
        summary: "Publish graph",
        parameters: [
          { $ref: "#/components/parameters/OrgId" },
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "Graph published" },
          "404": { description: "Graph not found" },
        },
      },
    },
    "/v1/graphs/{id}/runs": {
      get: {
        tags: ["runs"],
        summary: "List runs for graph",
        parameters: [
          { $ref: "#/components/parameters/OrgId" },
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "List of runs" },
          "404": { description: "Graph not found" },
        },
      },
    },
    "/v1/runs": {
      get: {
        tags: ["runs"],
        summary: "List runs",
        parameters: [
          { $ref: "#/components/parameters/OrgId" },
          { name: "conversationId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          { name: "graphId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
          {
            name: "status",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["running", "paused", "waiting", "completed", "failed", "cancelled"],
            },
          },
        ],
        responses: {
          "200": { description: "List of runs" },
          "400": { description: "orgId required" },
        },
      },
    },
    "/v1/runs/{id}": {
      get: {
        tags: ["runs"],
        summary: "Get run",
        parameters: [
          { $ref: "#/components/parameters/OrgId" },
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "Run details" },
          "404": { description: "Run not found" },
        },
      },
    },
    "/v1/runs/{id}/logs": {
      get: {
        tags: ["runs"],
        summary: "Get run logs",
        parameters: [
          { $ref: "#/components/parameters/OrgId" },
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "level", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Run logs" },
          "404": { description: "Run not found" },
        },
      },
    },
    "/v1/actors": {
      get: {
        tags: ["actors"],
        summary: "List actor principals",
        parameters: [{ $ref: "#/components/parameters/OrgId" }],
        responses: {
          "200": { description: "List of actors" },
          "400": { description: "orgId required" },
        },
      },
      post: {
        tags: ["actors"],
        summary: "Create actor principal",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["orgId", "principalId", "name"],
                properties: {
                  orgId: { type: "string", format: "uuid" },
                  principalId: { type: "string" },
                  name: { type: "string" },
                  defaultGraphId: { type: "string", format: "uuid" },
                  capabilities: { type: "array", items: { type: "string" } },
                  webhooks: { type: "object" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Actor created" },
          "400": { description: "Validation failed" },
        },
      },
    },
    "/v1/actors/{id}": {
      get: {
        tags: ["actors"],
        summary: "Get actor principal",
        parameters: [
          { $ref: "#/components/parameters/OrgId" },
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "Actor" },
          "404": { description: "Actor not found" },
        },
      },
      put: {
        tags: ["actors"],
        summary: "Update actor principal",
        parameters: [
          { $ref: "#/components/parameters/OrgId" },
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  defaultGraphId: { type: "string", format: "uuid" },
                  capabilities: { type: "array", items: { type: "string" } },
                  webhooks: { type: "object" },
                  isActive: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Actor updated" },
          "404": { description: "Actor not found" },
        },
      },
      delete: {
        tags: ["actors"],
        summary: "Delete actor principal",
        parameters: [
          { $ref: "#/components/parameters/OrgId" },
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": { description: "Actor deleted" },
          "404": { description: "Actor not found" },
        },
      },
    },
    "/webhook/message": {
      post: {
        tags: ["webhooks"],
        summary: "Handle incoming message",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["conversationId", "orgId", "to"],
                properties: {
                  id: { type: "string", format: "uuid" },
                  conversationId: { type: "string", format: "uuid" },
                  orgId: { type: "string", format: "uuid" },
                  from: {
                    type: "object",
                    properties: {
                      principalId: { type: "string" },
                      principalType: { type: "string" },
                    },
                  },
                  to: {
                    type: "object",
                    required: ["principalId"],
                    properties: {
                      principalId: { type: "string" },
                      principalType: { type: "string" },
                    },
                  },
                  content: { type: "string" },
                  contentType: { type: "string" },
                  metadata: { type: "object" },
                  runId: { type: "string", format: "uuid" },
                  traceId: { type: "string" },
                  sequence: { type: "integer" },
                  priority: { type: "string", enum: ["low", "normal", "high", "critical"] },
                  interruptible: { type: "boolean" },
                  preemptedBy: { type: "string" },
                  createdAt: { type: "string", format: "date-time" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Message accepted" },
          "400": { description: "Invalid message envelope" },
          "404": { description: "Actor not found" },
        },
      },
    },
    "/webhook/control": {
      post: {
        tags: ["webhooks"],
        summary: "Handle control event",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["event", "conversationId", "orgId"],
                properties: {
                  event: { type: "string" },
                  conversationId: { type: "string", format: "uuid" },
                  orgId: { type: "string", format: "uuid" },
                  target: {
                    type: "object",
                    properties: {
                      principalId: { type: "string" },
                      principalType: { type: "string" },
                    },
                  },
                  reason: { type: "string" },
                  preemptedBy: { type: "string" },
                  effectiveAt: { type: "string", format: "date-time" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Control event accepted" },
          "400": { description: "Invalid control event" },
        },
      },
    },
    "/rules": {
      get: {
        tags: ["rules"],
        summary: "List all rule sets",
        responses: {
          "200": { description: "List of rule sets" },
          "401": { description: "Authentication required" },
        },
      },
      post: {
        tags: ["rules"],
        summary: "Create rule set",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["orgId", "name"],
                properties: {
                  orgId: { type: "string" },
                  name: { type: "string" },
                  description: { type: "string" },
                  rules: { type: "array", items: { type: "object" } },
                  isActive: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Rule set created" },
          "400": { description: "Validation failed" },
          "401": { description: "Authentication required" },
        },
      },
    },
    "/rules/{orgId}": {
      get: {
        tags: ["rules"],
        summary: "Get rule set for org",
        parameters: [{ name: "orgId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Rule set" },
          "401": { description: "Authentication required" },
          "404": { description: "Rule set not found" },
        },
      },
      put: {
        tags: ["rules"],
        summary: "Update rule set",
        parameters: [{ name: "orgId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Rule set updated" },
          "401": { description: "Authentication required" },
          "404": { description: "Rule set not found" },
        },
      },
    },
    "/rules/{orgId}/rules": {
      post: {
        tags: ["rules"],
        summary: "Add rule to set",
        parameters: [{ name: "orgId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "201": { description: "Rule added" },
          "401": { description: "Authentication required" },
          "404": { description: "Rule set not found" },
        },
      },
    },
    "/rules/execute": {
      post: {
        tags: ["rules"],
        summary: "Execute rules for event",
        responses: {
          "200": { description: "Execution result" },
          "401": { description: "Authentication required" },
        },
      },
    },
    "/settings/llm": {
      get: {
        tags: ["settings"],
        summary: "Get LLM settings",
        responses: {
          "200": { description: "LLM settings (API key masked)" },
          "401": { description: "Authentication required" },
        },
      },
      put: {
        tags: ["settings"],
        summary: "Update LLM settings",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  provider: { type: "string", enum: ["openai", "anthropic", "custom"] },
                  model: { type: "string" },
                  temperature: { type: "number" },
                  maxTokens: { type: "integer" },
                  apiKey: { type: "string", description: "Will be stored securely, never returned" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Settings updated" },
          "401": { description: "Authentication required" },
        },
      },
    },
    "/assistants-admin": {
      get: {
        tags: ["assistants-admin"],
        summary: "List custom assistants",
        responses: {
          "200": { description: "List of custom assistants" },
          "401": { description: "Authentication required" },
        },
      },
      post: {
        tags: ["assistants-admin"],
        summary: "Create custom assistant",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["key", "name"],
                properties: {
                  key: { type: "string", pattern: "^[a-z0-9-]+$" },
                  name: { type: "string" },
                  description: { type: "string" },
                  capabilities: { type: "array", items: { type: "string" } },
                  status: { type: "string", enum: ["active", "inactive", "draft"] },
                  systemPrompt: { type: "string" },
                  model: { type: "string" },
                  temperature: { type: "number" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Assistant created" },
          "400": { description: "Validation failed" },
          "401": { description: "Authentication required" },
          "409": { description: "Assistant with key already exists" },
        },
      },
    },
    "/assistants-admin/{key}": {
      get: {
        tags: ["assistants-admin"],
        summary: "Get custom assistant",
        parameters: [{ name: "key", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Assistant details" },
          "401": { description: "Authentication required" },
          "404": { description: "Assistant not found" },
        },
      },
      put: {
        tags: ["assistants-admin"],
        summary: "Update custom assistant",
        parameters: [{ name: "key", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Assistant updated" },
          "401": { description: "Authentication required" },
          "404": { description: "Assistant not found" },
        },
      },
      delete: {
        tags: ["assistants-admin"],
        summary: "Delete custom assistant",
        parameters: [{ name: "key", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Assistant deleted" },
          "401": { description: "Authentication required" },
          "404": { description: "Assistant not found" },
        },
      },
    },
  },
};
