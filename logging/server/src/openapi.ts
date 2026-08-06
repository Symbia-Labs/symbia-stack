import type { OpenAPISpec } from "@symbia/md";

const scopingParameters = [
  { $ref: "#/components/parameters/OrgIdHeader" },
  { $ref: "#/components/parameters/ServiceIdHeader" },
  { $ref: "#/components/parameters/EnvHeader" },
  { $ref: "#/components/parameters/DataClassHeader" },
  { $ref: "#/components/parameters/PolicyRefHeader" },
];

export const openApiSpec: OpenAPISpec = {
  openapi: "3.0.3",
  info: {
    title: "Symbia Logging Service API",
    description:
      "Comprehensive observability platform supporting Logs, Metrics, Traces, and Objects. Requests are scoped by X-Org-Id, X-Service-Id, and X-Env headers.",
    version: "2.0.0",
  },
  servers: [
    {
      url: "/api",
      description: "API Server",
    },
  ],
  tags: [
    { name: "Logs", description: "Log stream and entry management" },
    {
      name: "Metrics",
      description: "Metric definition and data point management",
    },
    { name: "Traces", description: "Distributed tracing and span management" },
    { name: "Objects", description: "Binary object and file management" },
    { name: "Assistant", description: "AI-powered log analysis and insights" },
    { name: "DataSources", description: "Data source configuration" },
    { name: "Integrations", description: "External service integrations" },
    { name: "Stats", description: "Dashboard statistics" },
  ],
  paths: {
    "/logs/streams": {
      parameters: scopingParameters as any,
      get: {
        tags: ["Logs"],
        summary: "List all log streams",
        responses: { "200": { description: "List of log streams" } },
      },
      post: {
        tags: ["Logs"],
        summary: "Create a new log stream",
        responses: { "201": { description: "Log stream created" } },
      },
    },
    "/logs/query": {
      parameters: scopingParameters as any,
      post: {
        tags: ["Logs"],
        summary: "Query log entries",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  streamIds: { type: "array", items: { type: "string" } },
                  startTime: { type: "string", format: "date-time" },
                  endTime: { type: "string", format: "date-time" },
                  level: { type: "string" },
                  search: { type: "string" },
                  limit: { type: "integer" },
                  offset: { type: "integer" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Log query results" } },
      },
    },
    "/logs/ingest": {
      parameters: scopingParameters as any,
      post: {
        tags: ["Logs"],
        summary: "Ingest log entries",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["entries"],
                properties: {
                  entries: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["streamId", "timestamp"],
                      properties: {
                        streamId: { type: "string" },
                        timestamp: { type: "string", format: "date-time" },
                        level: { type: "string" },
                        message: { type: "string" },
                        attributes: { type: "object" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Logs ingested" } },
      },
    },
    "/metrics": {
      parameters: scopingParameters as any,
      get: {
        tags: ["Metrics"],
        summary: "List all metrics",
        responses: { "200": { description: "List of metrics" } },
      },
      post: {
        tags: ["Metrics"],
        summary: "Create a new metric",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "metricType"],
                properties: {
                  name: { type: "string" },
                  metricType: {
                    type: "string",
                    enum: ["counter", "gauge", "histogram", "summary"],
                  },
                  unit: { type: "string" },
                  description: { type: "string" },
                  labels: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Metric created" } },
      },
    },
    "/metrics/query": {
      parameters: scopingParameters as any,
      post: {
        tags: ["Metrics"],
        summary: "Query metric data points",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  metricIds: { type: "array", items: { type: "string" } },
                  startTime: { type: "string", format: "date-time" },
                  endTime: { type: "string", format: "date-time" },
                  labels: { type: "object" },
                  aggregation: { type: "string" },
                  interval: { type: "string" },
                  limit: { type: "integer" },
                  offset: { type: "integer" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Metric query results" } },
      },
    },
    "/metrics/ingest": {
      parameters: scopingParameters as any,
      post: {
        tags: ["Metrics"],
        summary: "Ingest metric data points",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["dataPoints"],
                properties: {
                  dataPoints: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["metricId", "timestamp", "value"],
                      properties: {
                        metricId: { type: "string" },
                        timestamp: { type: "string", format: "date-time" },
                        value: { type: "number" },
                        labels: { type: "object" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Data points ingested" } },
      },
    },
    "/traces": {
      parameters: scopingParameters as any,
      get: {
        tags: ["Traces"],
        summary: "List all traces",
        responses: { "200": { description: "List of traces" } },
      },
    },
    "/traces/{traceId}/spans": {
      parameters: scopingParameters as any,
      get: {
        tags: ["Traces"],
        summary: "Get spans for a specific trace",
        parameters: [
          {
            name: "traceId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { "200": { description: "List of spans for the trace" } },
      },
    },
    "/traces/query": {
      parameters: scopingParameters as any,
      post: {
        tags: ["Traces"],
        summary: "Query traces",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  serviceName: { type: "string" },
                  operationName: { type: "string" },
                  startTime: { type: "string", format: "date-time" },
                  endTime: { type: "string", format: "date-time" },
                  tags: { type: "object" },
                  minDurationMs: { type: "number" },
                  maxDurationMs: { type: "number" },
                  limit: { type: "integer" },
                  offset: { type: "integer" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Trace query results" } },
      },
    },
    "/traces/ingest": {
      parameters: scopingParameters as any,
      post: {
        tags: ["Traces"],
        summary: "Ingest trace spans",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["spans"],
                properties: {
                  spans: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["traceId", "spanId", "name", "startTime"],
                      properties: {
                        traceId: { type: "string" },
                        spanId: { type: "string" },
                        parentSpanId: { type: "string" },
                        name: { type: "string" },
                        serviceName: { type: "string" },
                        kind: { type: "string" },
                        status: { type: "string" },
                        startTime: { type: "string", format: "date-time" },
                        endTime: { type: "string", format: "date-time" },
                        attributes: { type: "object" },
                        events: { type: "array" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Spans ingested" } },
      },
    },
    "/objects/streams": {
      parameters: scopingParameters as any,
      get: {
        tags: ["Objects"],
        summary: "List all object streams",
        responses: { "200": { description: "List of object streams" } },
      },
      post: {
        tags: ["Objects"],
        summary: "Create a new object stream",
        responses: { "201": { description: "Object stream created" } },
      },
    },
    "/objects/query": {
      parameters: scopingParameters as any,
      post: {
        tags: ["Objects"],
        summary: "Query object entries",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  streamIds: { type: "array", items: { type: "string" } },
                  startTime: { type: "string", format: "date-time" },
                  endTime: { type: "string", format: "date-time" },
                  contentType: { type: "string" },
                  minSize: { type: "number" },
                  maxSize: { type: "number" },
                  limit: { type: "integer" },
                  offset: { type: "integer" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Object query results" } },
      },
    },
    "/objects/ingest": {
      parameters: scopingParameters as any,
      post: {
        tags: ["Objects"],
        summary: "Register an object entry",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["streamId"],
                properties: {
                  streamId: { type: "string" },
                  filename: { type: "string" },
                  contentType: { type: "string" },
                  size: { type: "number" },
                  checksum: { type: "string" },
                  storageUrl: { type: "string" },
                  metadata: { type: "object" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Object registered" } },
      },
    },
    "/assistant/config": {
      get: {
        tags: ["Assistant"],
        summary: "Get assistant configuration",
        description: "Returns the current configuration status of the log assistant, including whether LLM is configured and available capabilities.",
        responses: {
          "200": {
            description: "Assistant configuration",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    configured: { type: "boolean", description: "Whether LLM backend is configured" },
                    capabilities: {
                      type: "array",
                      items: { type: "string" },
                      description: "Available assistant capabilities",
                      example: ["summarize", "analyze", "group", "investigate"],
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/assistant/summarize": {
      parameters: scopingParameters as any,
      post: {
        tags: ["Assistant"],
        summary: "Summarize logs with AI",
        description: "Analyzes log entries and generates a natural language summary with actionable insights. Uses LLM when configured, falls back to local analysis otherwise.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  logIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "Specific log IDs to analyze (legacy mode)",
                  },
                  startTime: { type: "string", format: "date-time", description: "Start of time range" },
                  endTime: { type: "string", format: "date-time", description: "End of time range" },
                  streamIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "Filter to specific log streams",
                  },
                  level: { type: "string", description: "Filter by log level (error, warn, info, debug)" },
                  search: { type: "string", description: "Full-text search query" },
                  limit: { type: "integer", default: 200, description: "Maximum logs to analyze (capped at 500)" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Log summary with insights",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    summary: { type: "string", description: "Natural language summary" },
                    insights: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          text: { type: "string", description: "Insight description" },
                          severity: { type: "string", enum: ["critical", "warning", "info"] },
                          category: { type: "string", enum: ["error", "performance", "pattern", "anomaly", "health"] },
                          searchHint: { type: "string", description: "Query to find related logs" },
                          services: { type: "array", items: { type: "string" } },
                          count: { type: "integer" },
                        },
                      },
                    },
                    errorCount: { type: "integer" },
                    warnCount: { type: "integer" },
                    patterns: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/assistant/analyze": {
      parameters: scopingParameters as any,
      post: {
        tags: ["Assistant"],
        summary: "Analyze errors with AI",
        description: "Deep analysis of error logs to identify root causes and suggest remediation actions.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  logIds: { type: "array", items: { type: "string" } },
                  startTime: { type: "string", format: "date-time" },
                  endTime: { type: "string", format: "date-time" },
                  streamIds: { type: "array", items: { type: "string" } },
                  search: { type: "string" },
                  limit: { type: "integer", default: 200 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Error analysis results",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    summary: { type: "string", description: "Error analysis summary" },
                    errorMessages: { type: "array", items: { type: "string" }, description: "Unique error messages found" },
                    possibleCauses: { type: "array", items: { type: "string" }, description: "Identified root causes" },
                    suggestedActions: { type: "array", items: { type: "string" }, description: "Recommended remediation steps" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/assistant/investigate": {
      parameters: scopingParameters as any,
      post: {
        tags: ["Assistant"],
        summary: "Investigate a specific insight",
        description: "Deep-dive investigation into a specific insight from the summary. Returns detailed explanation, related logs, and suggested actions.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["insight"],
                properties: {
                  insight: {
                    type: "object",
                    required: ["text"],
                    properties: {
                      id: { type: "string" },
                      text: { type: "string", description: "Insight text to investigate" },
                      severity: { type: "string", enum: ["critical", "warning", "info"] },
                      category: { type: "string", enum: ["error", "performance", "pattern", "anomaly", "health"] },
                      searchHint: { type: "string" },
                      services: { type: "array", items: { type: "string" } },
                      count: { type: "integer" },
                    },
                  },
                  startTime: { type: "string", format: "date-time" },
                  endTime: { type: "string", format: "date-time" },
                  streamIds: { type: "array", items: { type: "string" } },
                  level: { type: "string" },
                  search: { type: "string" },
                  limit: { type: "integer", default: 200 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Investigation results",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    insight: { type: "string", description: "Original insight text" },
                    explanation: { type: "string", description: "Detailed explanation of what's happening" },
                    relatedLogs: { type: "array", items: { type: "object" }, description: "Related log entries" },
                    suggestedActions: { type: "array", items: { type: "string" }, description: "Specific actions to resolve or investigate further" },
                  },
                },
              },
            },
          },
          "400": { description: "Insight is required" },
        },
      },
    },
    "/assistant/group": {
      parameters: scopingParameters as any,
      post: {
        tags: ["Assistant"],
        summary: "Group related logs by pattern",
        description: "Groups log entries by detected message patterns, normalizing IDs, timestamps, and numbers. Useful for identifying repeated issues.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  logIds: { type: "array", items: { type: "string" } },
                  startTime: { type: "string", format: "date-time" },
                  endTime: { type: "string", format: "date-time" },
                  limit: { type: "integer", default: 500 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Grouped log patterns",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    groups: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          name: { type: "string", description: "Shortened pattern name" },
                          pattern: { type: "string", description: "Normalized message pattern" },
                          count: { type: "integer", description: "Number of logs matching this pattern" },
                          logIds: { type: "array", items: { type: "string" }, description: "IDs of matching logs" },
                        },
                      },
                    },
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
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      apiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key" },
    },
    parameters: {
      OrgIdHeader: {
        name: "X-Org-Id",
        in: "header",
        required: false,
        description: "Organization ID (required for multi-org users).",
        schema: { type: "string" },
      },
      ServiceIdHeader: {
        name: "X-Service-Id",
        in: "header",
        required: false,
        description:
          "Service identifier (defaults to LOGGING_DEFAULT_SERVICE_ID).",
        schema: { type: "string" },
      },
      EnvHeader: {
        name: "X-Env",
        in: "header",
        required: false,
        description: "Environment name (dev|stage|prod).",
        schema: { type: "string" },
      },
      DataClassHeader: {
        name: "X-Data-Class",
        in: "header",
        required: false,
        description: "Data classification (none|pii|phi|secret).",
        schema: {
          type: "string",
          enum: ["none", "pii", "phi", "secret"],
        },
      },
      PolicyRefHeader: {
        name: "X-Policy-Ref",
        in: "header",
        required: false,
        description:
          "Policy reference string (defaults to LOGGING_DEFAULT_POLICY_REF).",
        schema: { type: "string" },
      },
    },
  },
  security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
};


// --- Auto-documented endpoints (added by the API documentation validation sweep) ---
// These routes are implemented but were missing from the spec above. Entries are
// thin-but-accurate (method, path, params, standard responses); field-level request/
// response schemas are marked `x-auto-documented` and can be enriched over time.
{
  const __autoDocumentedPaths: Record<string, any> = {
  "/auth/keys/{id}": {
    "delete": {
      "tags": [
        "Auth"
      ],
      "summary": "Delete keys",
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
  "/data-sources/{id}": {
    "delete": {
      "tags": [
        "Data Sources"
      ],
      "summary": "Delete data sources",
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
    },
    "get": {
      "tags": [
        "Data Sources"
      ],
      "summary": "Get data sources",
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
    },
    "patch": {
      "tags": [
        "Data Sources"
      ],
      "summary": "Update data sources",
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
      "requestBody": {
        "required": false,
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
  "/integrations/{id}": {
    "delete": {
      "tags": [
        "Integrations"
      ],
      "summary": "Delete integrations",
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
    },
    "get": {
      "tags": [
        "Integrations"
      ],
      "summary": "Get integrations",
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
    },
    "patch": {
      "tags": [
        "Integrations"
      ],
      "summary": "Update integrations",
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
      "requestBody": {
        "required": false,
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
  "/logs/streams/{id}": {
    "delete": {
      "tags": [
        "Logs"
      ],
      "summary": "Delete streams",
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
    },
    "get": {
      "tags": [
        "Logs"
      ],
      "summary": "Get streams",
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
    },
    "patch": {
      "tags": [
        "Logs"
      ],
      "summary": "Update streams",
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
      "requestBody": {
        "required": false,
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
  "/metrics/{id}": {
    "delete": {
      "tags": [
        "Metrics"
      ],
      "summary": "Delete metrics",
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
    },
    "get": {
      "tags": [
        "Metrics"
      ],
      "summary": "Get metrics",
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
    },
    "patch": {
      "tags": [
        "Metrics"
      ],
      "summary": "Update metrics",
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
      "requestBody": {
        "required": false,
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
  "/objects/streams/{id}": {
    "delete": {
      "tags": [
        "Objects"
      ],
      "summary": "Delete streams",
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
    },
    "get": {
      "tags": [
        "Objects"
      ],
      "summary": "Get streams",
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
    },
    "patch": {
      "tags": [
        "Objects"
      ],
      "summary": "Update streams",
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
      "requestBody": {
        "required": false,
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
  "/auth/config": {
    "get": {
      "tags": [
        "Auth"
      ],
      "summary": "Get config",
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
  "/auth/keys": {
    "get": {
      "tags": [
        "Auth"
      ],
      "summary": "List keys",
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
    },
    "post": {
      "tags": [
        "Auth"
      ],
      "summary": "Create keys",
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
  "/auth/me": {
    "get": {
      "tags": [
        "Auth"
      ],
      "summary": "Get me",
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
  "/auth/session": {
    "get": {
      "tags": [
        "Auth"
      ],
      "summary": "Get session",
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
  "/bootstrap/service": {
    "get": {
      "tags": [
        "Bootstrap"
      ],
      "summary": "Get service",
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
  "/data-sources": {
    "get": {
      "tags": [
        "Data Sources"
      ],
      "summary": "List data sources",
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
    },
    "post": {
      "tags": [
        "Data Sources"
      ],
      "summary": "Create data sources",
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
  "/integrations": {
    "get": {
      "tags": [
        "Integrations"
      ],
      "summary": "List integrations",
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
    },
    "post": {
      "tags": [
        "Integrations"
      ],
      "summary": "Create integrations",
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
  "/logs/stream": {
    "get": {
      "tags": [
        "Logs"
      ],
      "summary": "Get stream",
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
  "/stats": {
    "get": {
      "tags": [
        "Stats"
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
  "/stats/ingest-rate": {
    "get": {
      "tags": [
        "Stats"
      ],
      "summary": "Get ingest rate",
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
  "/stats/query-latency": {
    "get": {
      "tags": [
        "Stats"
      ],
      "summary": "Get query latency",
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
  "/traces/{id}": {
    "get": {
      "tags": [
        "Traces"
      ],
      "summary": "Get traces",
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
  "/auth/login": {
    "post": {
      "tags": [
        "Auth"
      ],
      "summary": "Login auth login",
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
  "/auth/logout": {
    "post": {
      "tags": [
        "Auth"
      ],
      "summary": "Logout auth logout",
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
  "/data-sources/{id}/sync": {
    "post": {
      "tags": [
        "Data Sources"
      ],
      "summary": "Sync data sources sync",
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
  "/ingest": {
    "post": {
      "tags": [
        "Ingest"
      ],
      "summary": "Create ingest",
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
  "/integrations/{id}/test": {
    "post": {
      "tags": [
        "Integrations"
      ],
      "summary": "Test integrations test",
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
  "/query": {
    "post": {
      "tags": [
        "Query"
      ],
      "summary": "Query query",
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
  const __paths = openApiSpec.paths as Record<string, any>;
  for (const [key, ops] of Object.entries(__autoDocumentedPaths)) {
    __paths[key] = { ...(__paths[key] || {}), ...(ops as Record<string, any>) };
  }
}
