export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Symbia Object Service API",
    description: "Registry service for managing resources, versions, and artifacts with CRUD operations, versioning, search capabilities, and a public bootstrap endpoint for system initialization. Uses allowlist-based access control with entitlements.\n\n**Scope Headers (optional)**: X-Org-Id, X-Service-Id, X-Env, X-Data-Class, X-Policy-Ref.\n\n**CORS**: All API endpoints support CORS with methods GET, POST, PUT, PATCH, DELETE, OPTIONS and headers Content-Type, Authorization, X-API-Key, X-Org-Id, X-Service-Id, X-Env, X-Data-Class, X-Policy-Ref. Credentialed requests (cookies) only allowed from origins in CORS_ALLOWED_ORIGINS. Disallowed origins receive 403 on preflight. Identity Service origin is always allowed.\n\n**Resource Types**: context, integration, graph, assistant. All types support identical CRUD operations and versioning workflows.\n\n**Authentication**: Bearer token (JWT), API key (X-API-Key header), or session cookie (symbia_session).",
    version: "1.0.0",
    contact: {
      name: "Symbia Object Service"
    }
  },
  servers: [
    {
      url: "/api",
      description: "API Server"
    }
  ],
  tags: [
    { name: "Resources", description: "Resource management operations" },
    { name: "Versions", description: "Version management operations" },
    { name: "Search", description: "Search operations" },
    { name: "Bootstrap", description: "System initialization (public)" },
    { name: "Stats", description: "Dashboard statistics" },
    { name: "Authentication", description: "Authentication endpoints" },
    { name: "Graphs", description: "Convenience endpoints for graph resources with org scoping" },
    { name: "Contexts", description: "Context resource management" },
    { name: "Artifacts", description: "Artifact upload and download" },
    { name: "RateLimits", description: "Rate limit information" }
  ],
  security: [
    { bearerAuth: [] },
    { apiKeyAuth: [] },
    { cookieAuth: [] }
  ],
  paths: {
    "/resources": {
      get: {
        tags: ["Resources"],
        summary: "List all resources",
        description: "Retrieve a list of all resources with optional filtering",
        parameters: [
          {
            name: "type",
            in: "query",
            description: "Filter by resource type",
            schema: {
              type: "string",
              enum: ["context", "integration", "graph", "assistant"]
            }
          },
          {
            name: "status",
            in: "query",
            description: "Filter by resource status",
            schema: {
              type: "string",
              enum: ["draft", "published", "deprecated"]
            }
          }
        ],
        responses: {
          "200": {
            description: "List of resources",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Resource" }
                }
              }
            }
          },
          "500": {
            description: "Server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      },
      post: {
        tags: ["Resources"],
        summary: "Create a new resource",
        description: "Create a new resource in draft status",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateResource" }
            }
          }
        },
        responses: {
          "201": {
            description: "Resource created successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Resource" }
              }
            }
          },
          "400": {
            description: "Validation error or duplicate key",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          "500": {
            description: "Server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/resources/{id}": {
      get: {
        tags: ["Resources"],
        summary: "Get a resource by ID",
        description: "Retrieve a single resource by its unique identifier",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Resource ID",
            schema: { type: "string" }
          }
        ],
        responses: {
          "200": {
            description: "Resource details",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Resource" }
              }
            }
          },
          "404": {
            description: "Resource not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          "500": {
            description: "Server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      },
      patch: {
        tags: ["Resources"],
        summary: "Update a resource",
        description: "Update an existing resource's properties",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Resource ID",
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateResource" }
            }
          }
        },
        responses: {
          "200": {
            description: "Resource updated successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Resource" }
              }
            }
          },
          "400": {
            description: "Validation error or duplicate key",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          "404": {
            description: "Resource not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          "500": {
            description: "Server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      },
      delete: {
        tags: ["Resources"],
        summary: "Delete a resource",
        description: "Permanently delete a resource and all its versions",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Resource ID",
            schema: { type: "string" }
          }
        ],
        responses: {
          "204": {
            description: "Resource deleted successfully"
          },
          "404": {
            description: "Resource not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          "500": {
            description: "Server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/resources/{id}/publish": {
      post: {
        tags: ["Resources", "Versions"],
        summary: "Publish a resource",
        description: "Create a new version and publish the resource. Changes status to 'published' and increments version number.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Resource ID",
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  changelog: {
                    type: "string",
                    description: "Description of changes in this version"
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Resource published successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    resource: { $ref: "#/components/schemas/Resource" },
                    version: { $ref: "#/components/schemas/ResourceVersion" }
                  }
                }
              }
            }
          },
          "404": {
            description: "Resource not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          "500": {
            description: "Server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/resources/bulk": {
      post: {
        tags: ["Resources"],
        summary: "Perform bulk operations on resources",
        description: "Execute bulk actions on multiple resources at once. Supports publish, delete, status update, and tag management. Returns per-item results with success/failure status. Failed items remain selected for retry.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["ids", "action"],
                properties: {
                  ids: {
                    type: "array",
                    items: { type: "string" },
                    minItems: 1,
                    maxItems: 100,
                    description: "Array of resource IDs to operate on (max 100)"
                  },
                  action: {
                    type: "string",
                    enum: ["publish", "delete", "updateStatus", "addTags", "removeTags"],
                    description: "The bulk action to perform"
                  },
                  payload: {
                    type: "object",
                    properties: {
                      status: {
                        type: "string",
                        enum: ["draft", "published", "deprecated"],
                        description: "New status for updateStatus action"
                      },
                      tags: {
                        type: "array",
                        items: { type: "string" },
                        description: "Tags to add or remove"
                      }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Bulk operation completed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    summary: {
                      type: "object",
                      properties: {
                        total: { type: "integer", description: "Total items processed" },
                        succeeded: { type: "integer", description: "Number of successful operations" },
                        failed: { type: "integer", description: "Number of failed operations" }
                      }
                    },
                    results: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", description: "Resource ID" },
                          status: { type: "string", enum: ["success", "failed"] },
                          error: { type: "string", description: "Error message if failed" }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          "500": {
            description: "Server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/resources/{id}/versions": {
      get: {
        tags: ["Versions"],
        summary: "Get resource versions",
        description: "Retrieve all versions of a specific resource",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Resource ID",
            schema: { type: "string" }
          }
        ],
        responses: {
          "200": {
            description: "List of versions",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/ResourceVersion" }
                }
              }
            }
          },
          "404": {
            description: "Resource not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          "500": {
            description: "Server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/search": {
      post: {
        tags: ["Search"],
        summary: "Search resources",
        description: "Search resources using keyword or natural language queries",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["query"],
                properties: {
                  query: {
                    type: "string",
                    description: "Search query string"
                  },
                  mode: {
                    type: "string",
                    enum: ["keyword", "natural"],
                    default: "keyword",
                    description: "Search mode"
                  },
                  type: {
                    type: "string",
                    enum: ["context", "integration", "graph", "assistant"],
                    description: "Filter by resource type"
                  },
                  status: {
                    type: "string",
                    enum: ["draft", "published", "deprecated"],
                    description: "Filter by resource status"
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Search results",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Resource" }
                }
              }
            }
          },
          "400": {
            description: "Invalid search query",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          "500": {
            description: "Server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/bootstrap": {
      get: {
        tags: ["Bootstrap"],
        summary: "Get bootstrap resources",
        description: "Public endpoint that returns all published resources with public read access, marked for system initialization (isBootstrap: true). No authentication required.",
        security: [],
        responses: {
          "200": {
            description: "List of bootstrap resources",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Resource" }
                }
              }
            }
          },
          "500": {
            description: "Server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/bootstrap/summary": {
      get: {
        tags: ["Bootstrap"],
        summary: "Get bootstrap summary",
        description: "Public endpoint that returns aggregated counts for bootstrap resources (components + contexts) grouped by category and intention group. No authentication required.",
        security: [],
        responses: {
          "200": {
            description: "Bootstrap summary payload",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/BootstrapSummary" }
              }
            }
          },
          "500": {
            description: "Server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/stats": {
      get: {
        tags: ["Stats"],
        summary: "Get dashboard statistics",
        description: "Retrieve aggregate statistics about resources, versions, and bootstrap entries",
        responses: {
          "200": {
            description: "Dashboard statistics",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Stats" }
              }
            }
          },
          "500": {
            description: "Server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/graphs": {
      get: {
        tags: ["Graphs"],
        summary: "List graph resources",
        description: "List all graph resources with optional org filtering. Rate limited.",
        parameters: [
          {
            name: "orgId",
            in: "query",
            description: "Filter by organization ID",
            schema: { type: "string" }
          }
        ],
        responses: {
          "200": {
            description: "List of graph resources",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Resource" } }
              }
            }
          }
        }
      },
      post: {
        tags: ["Graphs"],
        summary: "Create a graph resource",
        description: "Create a new graph with org scoping and payload validation. Rate limited (30 writes/min).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateGraph" }
            }
          }
        },
        responses: {
          "201": { description: "Graph created successfully", content: { "application/json": { schema: { $ref: "#/components/schemas/Resource" } } } },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "403": { description: "Permission denied", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "429": { description: "Rate limit exceeded" }
        }
      }
    },
    "/graphs/{id}": {
      get: {
        tags: ["Graphs"],
        summary: "Get graph by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Graph resource", content: { "application/json": { schema: { $ref: "#/components/schemas/Resource" } } } },
          "404": { description: "Graph not found" }
        }
      },
      patch: {
        tags: ["Graphs"],
        summary: "Update a graph",
        description: "Update graph name, description, tags, or payload. Rate limited.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateGraph" } } }
        },
        responses: {
          "200": { description: "Graph updated", content: { "application/json": { schema: { $ref: "#/components/schemas/Resource" } } } },
          "404": { description: "Graph not found" },
          "429": { description: "Rate limit exceeded" }
        }
      },
      delete: {
        tags: ["Graphs"],
        summary: "Delete a graph",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Graph deleted" },
          "404": { description: "Graph not found" },
          "429": { description: "Rate limit exceeded" }
        }
      }
    },
    "/contexts": {
      get: {
        tags: ["Contexts"],
        summary: "List context resources",
        description: "List all context resources with optional org filtering.",
        parameters: [{ name: "orgId", in: "query", schema: { type: "string" } }],
        responses: {
          "200": { description: "List of contexts", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Resource" } } } } }
        }
      },
      post: {
        tags: ["Contexts"],
        summary: "Create a context",
        description: "Create a new context resource. Rate limited.",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateContext" } } } },
        responses: {
          "201": { description: "Context created", content: { "application/json": { schema: { $ref: "#/components/schemas/Resource" } } } },
          "400": { description: "Validation error" },
          "429": { description: "Rate limit exceeded" }
        }
      }
    },
    "/contexts/{id}": {
      get: {
        tags: ["Contexts"],
        summary: "Get context by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Context resource", content: { "application/json": { schema: { $ref: "#/components/schemas/Resource" } } } },
          "404": { description: "Context not found" }
        }
      },
      patch: {
        tags: ["Contexts"],
        summary: "Update a context",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateContext" } } } },
        responses: {
          "200": { description: "Context updated" },
          "404": { description: "Context not found" },
          "429": { description: "Rate limit exceeded" }
        }
      },
      delete: {
        tags: ["Contexts"],
        summary: "Delete a context",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Context deleted" },
          "404": { description: "Context not found" },
          "429": { description: "Rate limit exceeded" }
        }
      }
    },
    "/resources/{id}/artifacts": {
      post: {
        tags: ["Artifacts"],
        summary: "Upload artifact",
        description: "Upload an artifact to a resource. Max 50MB, restricted MIME types. Rate limited (10 uploads/min).",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Resource ID" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "type", "content"],
                properties: {
                  name: { type: "string", description: "Artifact filename" },
                  type: { type: "string", description: "MIME type" },
                  content: { type: "string", description: "Base64-encoded file content" }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Artifact uploaded", content: { "application/json": { schema: { $ref: "#/components/schemas/Artifact" } } } },
          "400": { description: "Invalid file size or type" },
          "429": { description: "Rate limit exceeded" }
        }
      }
    },
    "/artifacts/{id}/download": {
      get: {
        tags: ["Artifacts"],
        summary: "Download artifact",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Artifact file content" },
          "404": { description: "Artifact not found" }
        }
      }
    },
    "/artifacts/{id}": {
      delete: {
        tags: ["Artifacts"],
        summary: "Delete artifact",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Artifact deleted" },
          "404": { description: "Artifact not found" },
          "429": { description: "Rate limit exceeded" }
        }
      }
    },
    "/rate-limits": {
      get: {
        tags: ["RateLimits"],
        summary: "Get current rate limits",
        description: "Returns the configured rate limit values for write, search, and upload operations.",
        responses: {
          "200": {
            description: "Rate limit configuration",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    windowMs: { type: "integer", description: "Rate limit window in milliseconds" },
                    limits: {
                      type: "object",
                      properties: {
                        write: { type: "integer", description: "Max write requests per window" },
                        search: { type: "integer", description: "Max search requests per window" },
                        upload: { type: "integer", description: "Max upload requests per window" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  components: {
    schemas: {
      Resource: {
        type: "object",
        properties: {
          id: { type: "string", description: "Unique identifier" },
          key: { type: "string", description: "Unique key for the resource" },
          name: { type: "string", description: "Display name" },
          description: { type: "string", nullable: true, description: "Resource description" },
          type: {
            type: "string",
            enum: ["context", "integration", "graph", "assistant"],
            description: "Resource type. Use 'graph' for workflow/pipeline definitions."
          },
          status: {
            type: "string",
            enum: ["draft", "published", "deprecated"],
            description: "Current status"
          },
          currentVersion: { type: "integer", description: "Current version number" },
          tags: { type: "array", items: { type: "string" }, nullable: true, description: "Tags for categorization" },
          isBootstrap: { type: "boolean", description: "Whether this resource is used for system initialization" },
          orgId: { type: "string", nullable: true, description: "Organization identifier" },
          accessPolicy: { $ref: "#/components/schemas/AccessPolicy", description: "Access control policy for the resource" },
          metadata: { type: "object", nullable: true, description: "Additional metadata" },
          createdAt: { type: "string", format: "date-time", description: "Creation timestamp" },
          updatedAt: { type: "string", format: "date-time", description: "Last update timestamp" }
        }
      },
      CreateResource: {
        type: "object",
        required: ["key", "name", "type"],
        properties: {
          key: { type: "string", minLength: 1, maxLength: 255, description: "Unique key for the resource" },
          name: { type: "string", minLength: 1, maxLength: 255, description: "Display name" },
          description: { type: "string", nullable: true, description: "Resource description" },
          type: {
            type: "string",
            enum: ["context", "integration", "graph", "assistant"],
            description: "Resource type. Use 'graph' for workflow/pipeline definitions."
          },
          tags: { type: "array", items: { type: "string" }, nullable: true, description: "Tags for categorization" },
          isBootstrap: { type: "boolean", default: false, description: "Whether this resource is used for system initialization" },
          orgId: { type: "string", nullable: true, description: "Organization identifier" },
          accessPolicy: { $ref: "#/components/schemas/AccessPolicy", description: "Access control policy. Defaults to private visibility if not specified." },
          metadata: { type: "object", nullable: true, description: "Additional metadata" }
        }
      },
      UpdateResource: {
        type: "object",
        properties: {
          key: { type: "string", minLength: 1, maxLength: 255, description: "Unique key for the resource" },
          name: { type: "string", minLength: 1, maxLength: 255, description: "Display name" },
          description: { type: "string", nullable: true, description: "Resource description" },
          type: {
            type: "string",
            enum: ["context", "integration", "graph", "assistant"],
            description: "Resource type. Use 'graph' for workflow/pipeline definitions."
          },
          status: {
            type: "string",
            enum: ["draft", "published", "deprecated"],
            description: "Current status"
          },
          tags: { type: "array", items: { type: "string" }, nullable: true, description: "Tags for categorization" },
          isBootstrap: { type: "boolean", description: "Whether this resource is used for system initialization" },
          orgId: { type: "string", nullable: true, description: "Organization identifier" },
          accessPolicy: { $ref: "#/components/schemas/AccessPolicy", description: "Access control policy" },
          metadata: { type: "object", nullable: true, description: "Additional metadata" }
        }
      },
      ResourceVersion: {
        type: "object",
        properties: {
          id: { type: "string", description: "Unique identifier" },
          resourceId: { type: "string", description: "Parent resource ID" },
          version: { type: "integer", description: "Version number" },
          changelog: { type: "string", nullable: true, description: "Description of changes" },
          publishedAt: { type: "string", format: "date-time", description: "Publication timestamp" },
          publishedBy: { type: "string", nullable: true, description: "Publisher identifier" }
        }
      },
      BootstrapSummaryCategory: {
        type: "object",
        properties: {
          id: { type: "string", description: "Category identifier" },
          label: { type: "string", description: "Display label" },
          count: { type: "integer", description: "Number of resources in this category" }
        }
      },
      BootstrapSummaryGroup: {
        type: "object",
        properties: {
          id: { type: "string", description: "Group identifier (from group:* tags)" },
          label: { type: "string", description: "Display label" },
          count: { type: "integer", description: "Number of component resources in this group" },
          categories: {
            type: "array",
            items: { $ref: "#/components/schemas/BootstrapSummaryCategory" }
          }
        }
      },
      BootstrapSummary: {
        type: "object",
        properties: {
          generatedAt: { type: "string", format: "date-time", description: "Summary generation timestamp" },
          components: {
            type: "object",
            properties: {
              total: { type: "integer", description: "Total component resources" },
              groups: {
                type: "array",
                items: { $ref: "#/components/schemas/BootstrapSummaryGroup" }
              }
            }
          },
          contexts: {
            type: "object",
            properties: {
              total: { type: "integer", description: "Total context resources" },
              categories: {
                type: "array",
                items: { $ref: "#/components/schemas/BootstrapSummaryCategory" }
              }
            }
          }
        }
      },
      Stats: {
        type: "object",
        properties: {
          totalResources: { type: "integer", description: "Total number of resources" },
          publishedVersions: { type: "integer", description: "Total number of published versions" },
          bootstrapEntries: { type: "integer", description: "Number of bootstrap resources" }
        }
      },
      Error: {
        type: "object",
        properties: {
          error: { type: "string", description: "Error message" },
          details: { type: "array", items: { type: "object" }, description: "Validation error details" }
        }
      },
      AccessPolicy: {
        type: "object",
        description: "Access control policy defining visibility and per-action entitlement requirements",
        properties: {
          visibility: {
            type: "string",
            enum: ["public", "org", "private"],
            description: "Visibility level: public (anyone can read), org (org members only), private (admins only)"
          },
          actions: {
            type: "object",
            description: "Per-action entitlement requirements",
            properties: {
              read: { $ref: "#/components/schemas/ActionPolicy" },
              write: { $ref: "#/components/schemas/ActionPolicy" },
              publish: { $ref: "#/components/schemas/ActionPolicy" },
              sign: { $ref: "#/components/schemas/ActionPolicy" },
              certify: { $ref: "#/components/schemas/ActionPolicy" },
              delete: { $ref: "#/components/schemas/ActionPolicy" }
            }
          }
        }
      },
      ActionPolicy: {
        type: "object",
        description: "Entitlement requirements for a specific action",
        properties: {
          anyOf: {
            type: "array",
            items: { type: "string" },
            description: "List of entitlement keys. User must have at least one to perform the action. Keys: public, authenticated, role:admin, role:publisher, cap:registry.write/publish/sign/certify, org:<orgId>, role:admin:<orgId>"
          }
        }
      },
      CreateGraph: {
        type: "object",
        required: ["key", "name", "orgId"],
        properties: {
          key: { type: "string", minLength: 1, maxLength: 255, description: "Unique key" },
          name: { type: "string", minLength: 1, maxLength: 255, description: "Display name" },
          description: { type: "string", nullable: true },
          orgId: { type: "string", description: "Required organization ID for graph scoping" },
          tags: { type: "array", items: { type: "string" }, nullable: true },
          metadata: { type: "object", nullable: true, description: "Graph metadata" }
        }
      },
      UpdateGraph: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 255 },
          description: { type: "string", nullable: true },
          tags: { type: "array", items: { type: "string" }, nullable: true },
          metadata: { type: "object", nullable: true, description: "Graph metadata" }
        }
      },
      CreateContext: {
        type: "object",
        required: ["key", "name"],
        properties: {
          key: { type: "string", minLength: 1, maxLength: 255, description: "Unique key" },
          name: { type: "string", minLength: 1, maxLength: 255, description: "Display name" },
          description: { type: "string", nullable: true },
          orgId: { type: "string", nullable: true },
          tags: { type: "array", items: { type: "string" }, nullable: true },
          metadata: { type: "object", nullable: true }
        }
      },
      UpdateContext: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 255 },
          description: { type: "string", nullable: true },
          tags: { type: "array", items: { type: "string" }, nullable: true },
          metadata: { type: "object", nullable: true }
        }
      },
      Artifact: {
        type: "object",
        properties: {
          id: { type: "string" },
          resourceId: { type: "string" },
          versionId: { type: "string", nullable: true },
          name: { type: "string" },
          mimeType: { type: "string", nullable: true },
          size: { type: "integer", nullable: true },
          checksum: { type: "string", nullable: true },
          storageUrl: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" }
        }
      }
    },
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT token from Symbia Identity Service. Obtain by authenticating at the Identity Service login endpoint."
      },
      apiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
        description: "API key for programmatic access. Generate via the dashboard API Keys section."
      },
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "symbia_session",
        description: "Symbia Identity session cookie. Set automatically after login via the Identity Service."
      }
    },
    parameters: {
      OrgIdHeader: {
        name: "X-Org-Id",
        in: "header",
        required: false,
        description: "Optional organization scope override.",
        schema: { type: "string" }
      },
      ServiceIdHeader: {
        name: "X-Service-Id",
        in: "header",
        required: false,
        description: "Optional service scope identifier.",
        schema: { type: "string" }
      },
      EnvHeader: {
        name: "X-Env",
        in: "header",
        required: false,
        description: "Optional environment scope (dev|stage|prod).",
        schema: { type: "string" }
      },
      DataClassHeader: {
        name: "X-Data-Class",
        in: "header",
        required: false,
        description: "Optional data classification (none|pii|phi|secret).",
        schema: { type: "string", enum: ["none", "pii", "phi", "secret"] }
      },
      PolicyRefHeader: {
        name: "X-Policy-Ref",
        in: "header",
        required: false,
        description: "Optional policy reference for auditing.",
        schema: { type: "string" }
      }
    }
  }
};

const scopeParameters = [
  { $ref: "#/components/parameters/OrgIdHeader" },
  { $ref: "#/components/parameters/ServiceIdHeader" },
  { $ref: "#/components/parameters/EnvHeader" },
  { $ref: "#/components/parameters/DataClassHeader" },
  { $ref: "#/components/parameters/PolicyRefHeader" }
];

const scopeRefs = new Set(scopeParameters.map((param) => (param as any).$ref));

if (openApiSpec.paths) {
  Object.values(openApiSpec.paths).forEach((pathItem: any) => {
    const existing = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
    const merged = [...scopeParameters, ...existing.filter((param: any) => !scopeRefs.has(param?.$ref))];
    pathItem.parameters = merged;
  });
}
