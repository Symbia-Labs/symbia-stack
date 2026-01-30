export const openApiSpec: any = {
  "openapi": "3.1.0",
  "info": {
    "title": "Symbia Runtime API",
    "version": "1.0.0",
    "description": "Graph execution engine for Symbia Script workflows.\n\nThe Runtime service executes dataflow graphs defined in Symbia Script format, managing component lifecycle, message routing, and execution state."
  },
  "servers": [
    {
      "url": "/api",
      "description": "Runtime API"
    }
  ],
  "tags": [
    { "name": "health" },
    { "name": "bootstrap" },
    { "name": "graphs" },
    { "name": "executions" },
    { "name": "components" }
  ],
  "security": [
    { "bearerAuth": [] },
    { "apiKeyAuth": [] }
  ],
  "paths": {
    "/health": {
      "get": {
        "tags": ["health"],
        "summary": "Health check",
        "security": [],
        "responses": {
          "200": {
            "description": "Service health",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/Health" }
              }
            }
          }
        }
      }
    },
    "/bootstrap/service": {
      "get": {
        "tags": ["bootstrap"],
        "summary": "Service bootstrap",
        "security": [],
        "responses": {
          "200": {
            "description": "Service metadata",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/Bootstrap" }
              }
            }
          }
        }
      }
    },
    "/graphs": {
      "get": {
        "tags": ["graphs"],
        "summary": "List loaded graphs",
        "responses": {
          "200": {
            "description": "Graph list",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/GraphList" }
              }
            }
          }
        }
      },
      "post": {
        "tags": ["graphs"],
        "summary": "Load a graph definition",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": { "$ref": "#/components/schemas/GraphDefinition" }
            },
            "application/x-yaml": {
              "schema": { "type": "string" }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Graph loaded",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/LoadedGraph" }
              }
            }
          },
          "400": {
            "description": "Invalid graph definition"
          }
        }
      }
    },
    "/graphs/{id}": {
      "get": {
        "tags": ["graphs"],
        "summary": "Get graph details",
        "parameters": [
          { "$ref": "#/components/parameters/GraphId" }
        ],
        "responses": {
          "200": {
            "description": "Graph details",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/GraphDetail" }
              }
            }
          },
          "404": { "$ref": "#/components/responses/NotFound" }
        }
      },
      "delete": {
        "tags": ["graphs"],
        "summary": "Unload a graph",
        "parameters": [
          { "$ref": "#/components/parameters/GraphId" }
        ],
        "responses": {
          "204": { "description": "Graph unloaded" },
          "404": { "$ref": "#/components/responses/NotFound" }
        }
      }
    },
    "/graphs/{id}/execute": {
      "post": {
        "tags": ["graphs"],
        "summary": "Start graph execution",
        "parameters": [
          { "$ref": "#/components/parameters/GraphId" }
        ],
        "responses": {
          "201": {
            "description": "Execution started",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ExecutionStarted" }
              }
            }
          },
          "400": { "description": "Failed to start execution" },
          "404": { "$ref": "#/components/responses/NotFound" }
        }
      }
    },
    "/executions": {
      "get": {
        "tags": ["executions"],
        "summary": "List all executions",
        "responses": {
          "200": {
            "description": "Execution list",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ExecutionList" }
              }
            }
          }
        }
      }
    },
    "/executions/{id}": {
      "get": {
        "tags": ["executions"],
        "summary": "Get execution status",
        "parameters": [
          { "$ref": "#/components/parameters/ExecutionId" }
        ],
        "responses": {
          "200": {
            "description": "Execution status",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ExecutionDetail" }
              }
            }
          },
          "404": { "$ref": "#/components/responses/NotFound" }
        }
      }
    },
    "/executions/{id}/metrics": {
      "get": {
        "tags": ["executions"],
        "summary": "Get execution metrics",
        "parameters": [
          { "$ref": "#/components/parameters/ExecutionId" }
        ],
        "responses": {
          "200": {
            "description": "Execution metrics",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ExecutionMetrics" }
              }
            }
          },
          "404": { "$ref": "#/components/responses/NotFound" }
        }
      }
    },
    "/executions/{id}/inject": {
      "post": {
        "tags": ["executions"],
        "summary": "Inject message into execution",
        "parameters": [
          { "$ref": "#/components/parameters/ExecutionId" }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": { "$ref": "#/components/schemas/InjectRequest" }
            }
          }
        },
        "responses": {
          "200": { "description": "Message injected" },
          "400": { "description": "Invalid request" },
          "404": { "$ref": "#/components/responses/NotFound" }
        }
      }
    },
    "/executions/{id}/pause": {
      "post": {
        "tags": ["executions"],
        "summary": "Pause execution",
        "parameters": [
          { "$ref": "#/components/parameters/ExecutionId" }
        ],
        "responses": {
          "200": { "description": "Execution paused" },
          "400": { "description": "Cannot pause" },
          "404": { "$ref": "#/components/responses/NotFound" }
        }
      }
    },
    "/executions/{id}/resume": {
      "post": {
        "tags": ["executions"],
        "summary": "Resume execution",
        "parameters": [
          { "$ref": "#/components/parameters/ExecutionId" }
        ],
        "responses": {
          "200": { "description": "Execution resumed" },
          "400": { "description": "Cannot resume" },
          "404": { "$ref": "#/components/responses/NotFound" }
        }
      }
    },
    "/executions/{id}/stop": {
      "post": {
        "tags": ["executions"],
        "summary": "Stop execution",
        "parameters": [
          { "$ref": "#/components/parameters/ExecutionId" }
        ],
        "responses": {
          "200": { "description": "Execution stopped" },
          "404": { "$ref": "#/components/responses/NotFound" }
        }
      }
    },
    "/components": {
      "get": {
        "tags": ["components"],
        "summary": "List available components",
        "responses": {
          "200": {
            "description": "Component list",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ComponentList" }
              }
            }
          }
        }
      },
      "post": {
        "tags": ["components"],
        "summary": "Register custom component",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": { "$ref": "#/components/schemas/ComponentDefinition" }
            }
          }
        },
        "responses": {
          "201": { "description": "Component registered" },
          "400": { "description": "Invalid component definition" }
        }
      }
    },
    "/components/{id}": {
      "get": {
        "tags": ["components"],
        "summary": "Get component definition",
        "parameters": [
          { "$ref": "#/components/parameters/ComponentId" }
        ],
        "responses": {
          "200": {
            "description": "Component definition",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/ComponentDefinition" }
              }
            }
          },
          "404": { "$ref": "#/components/responses/NotFound" }
        }
      }
    }
  },
  "components": {
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT"
      },
      "apiKeyAuth": {
        "type": "apiKey",
        "in": "header",
        "name": "X-API-Key"
      }
    },
    "parameters": {
      "GraphId": {
        "name": "id",
        "in": "path",
        "required": true,
        "schema": { "type": "string", "format": "uuid" }
      },
      "ExecutionId": {
        "name": "id",
        "in": "path",
        "required": true,
        "schema": { "type": "string", "format": "uuid" }
      },
      "ComponentId": {
        "name": "id",
        "in": "path",
        "required": true,
        "schema": { "type": "string" }
      }
    },
    "responses": {
      "NotFound": {
        "description": "Not found",
        "content": {
          "application/json": {
            "schema": { "$ref": "#/components/schemas/Error" }
          }
        }
      }
    },
    "schemas": {
      "Health": {
        "type": "object",
        "properties": {
          "status": { "type": "string" },
          "service": { "type": "string" }
        },
        "required": ["status", "service"]
      },
      "Bootstrap": {
        "type": "object",
        "properties": {
          "service": { "type": "string" },
          "version": { "type": "string" },
          "description": { "type": "string" },
          "endpoints": { "type": "object" },
          "websocketEvents": { "type": "object" }
        },
        "required": ["service", "version"]
      },
      "GraphDefinition": {
        "type": "object",
        "properties": {
          "symbia": { "type": "string" },
          "name": { "type": "string" },
          "version": { "type": "string" },
          "description": { "type": "string" },
          "nodes": { "type": "array", "items": { "$ref": "#/components/schemas/GraphNode" } },
          "edges": { "type": "array", "items": { "$ref": "#/components/schemas/GraphEdge" } }
        },
        "required": ["symbia", "name", "version", "nodes", "edges"]
      },
      "GraphNode": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "component": { "type": "string" },
          "version": { "type": "string" },
          "config": { "type": "object" }
        },
        "required": ["id", "component"]
      },
      "GraphEdge": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "source": {
            "type": "object",
            "properties": {
              "node": { "type": "string" },
              "port": { "type": "string" }
            },
            "required": ["node", "port"]
          },
          "target": {
            "type": "object",
            "properties": {
              "node": { "type": "string" },
              "port": { "type": "string" }
            },
            "required": ["node", "port"]
          }
        },
        "required": ["source", "target"]
      },
      "GraphList": {
        "type": "object",
        "properties": {
          "loadedGraphs": { "type": "integer" },
          "activeExecutions": { "type": "integer" },
          "graphs": { "type": "array", "items": { "type": "object" } }
        }
      },
      "LoadedGraph": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "format": "uuid" },
          "name": { "type": "string" },
          "version": { "type": "string" },
          "nodeCount": { "type": "integer" },
          "edgeCount": { "type": "integer" },
          "topology": { "type": "object" },
          "loadedAt": { "type": "string", "format": "date-time" }
        }
      },
      "GraphDetail": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "name": { "type": "string" },
          "version": { "type": "string" },
          "description": { "type": "string" },
          "nodes": { "type": "array" },
          "edges": { "type": "array" },
          "topology": { "type": "object" },
          "loadedAt": { "type": "string", "format": "date-time" }
        }
      },
      "ExecutionStarted": {
        "type": "object",
        "properties": {
          "executionId": { "type": "string", "format": "uuid" },
          "graphId": { "type": "string", "format": "uuid" },
          "state": { "type": "string" },
          "startedAt": { "type": "string", "format": "date-time" }
        }
      },
      "ExecutionList": {
        "type": "object",
        "properties": {
          "executions": { "type": "array" },
          "total": { "type": "integer" }
        }
      },
      "ExecutionDetail": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "graphId": { "type": "string" },
          "state": { "type": "string" },
          "instances": { "type": "array" },
          "metrics": { "$ref": "#/components/schemas/ExecutionMetrics" },
          "error": { "type": "object" },
          "startedAt": { "type": "string", "format": "date-time" },
          "completedAt": { "type": "string", "format": "date-time" }
        }
      },
      "ExecutionMetrics": {
        "type": "object",
        "properties": {
          "messagesProcessed": { "type": "integer" },
          "messagesEmitted": { "type": "integer" },
          "componentInvocations": { "type": "integer" },
          "avgLatencyMs": { "type": "number" },
          "maxLatencyMs": { "type": "number" },
          "errorCount": { "type": "integer" },
          "backpressureEvents": { "type": "integer" }
        }
      },
      "InjectRequest": {
        "type": "object",
        "properties": {
          "nodeId": { "type": "string" },
          "port": { "type": "string" },
          "value": {}
        },
        "required": ["nodeId", "port", "value"]
      },
      "ComponentList": {
        "type": "object",
        "properties": {
          "components": { "type": "array" },
          "stats": { "type": "object" }
        }
      },
      "ComponentDefinition": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "name": { "type": "string" },
          "version": { "type": "string" },
          "description": { "type": "string" },
          "category": { "type": "string" },
          "ports": { "type": "object" },
          "config": { "type": "object" },
          "execution": { "type": "object" }
        },
        "required": ["id", "name", "version", "ports", "execution"]
      },
      "Error": {
        "type": "object",
        "properties": {
          "error": { "type": "string" }
        },
        "required": ["error"]
      }
    }
  }
};
