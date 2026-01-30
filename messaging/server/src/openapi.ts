export const openApiSpec: any = {
  "openapi": "3.1.0",
  "info": {
    "title": "Symbia Messaging API",
    "version": "1.0.0",
    "description": "Real-time messaging bus for users, agents, and services.\n\nScope headers (optional): X-Org-Id, X-Service-Id, X-Env, X-Environment, X-Data-Class, X-Policy-Ref.\n\nWebSocket events:\nClient: join:conversation, leave:conversation, message:send, message:edit, message:delete, control:send, typing:start, typing:stop, presence:update.\nServer: message:new, message:updated, message:deleted, typing:started, typing:stopped, presence:changed, stream.pause, stream.resume, stream.preempt, stream.route, stream.handoff, stream.cancel, stream.priority."
  },
  "servers": [
    {
      "url": "/api",
      "description": "Messaging API"
    }
  ],
  "tags": [
    {
      "name": "health"
    },
    {
      "name": "bootstrap"
    },
    {
      "name": "auth"
    },
    {
      "name": "conversations"
    },
    {
      "name": "messages"
    },
    {
      "name": "control"
    },
    {
      "name": "participants"
    },
    {
      "name": "admin"
    }
  ],
  "security": [
    {
      "bearerAuth": []
    },
    {
      "apiKeyAuth": []
    },
    {
      "cookieAuthToken": []
    },
    {
      "cookieAuthSession": []
    }
  ],
  "paths": {
    "/health": {
      "get": {
        "tags": [
          "health"
        ],
        "summary": "Health check",
        "security": [],
        "responses": {
          "200": {
            "description": "Service health",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Health"
                }
              }
            }
          }
        }
      }
    },
    "/bootstrap": {
      "get": {
        "tags": [
          "bootstrap"
        ],
        "summary": "Service bootstrap",
        "security": [],
        "responses": {
          "200": {
            "description": "Service metadata",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Bootstrap"
                }
              }
            }
          }
        }
      }
    },
    "/auth/login": {
      "post": {
        "tags": [
          "auth"
        ],
        "summary": "Login (proxy to Identity)",
        "security": [],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/AuthLoginRequest"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Login response",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/AuthLoginResponse"
                }
              }
            }
          }
        }
      }
    },
    "/auth/logout": {
      "post": {
        "tags": [
          "auth"
        ],
        "summary": "Logout (proxy to Identity)",
        "responses": {
          "200": {
            "description": "Logged out"
          }
        }
      }
    },
    "/auth/session": {
      "get": {
        "tags": [
          "auth"
        ],
        "summary": "Get session",
        "security": [],
        "responses": {
          "200": {
            "description": "Session status",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/AuthSession"
                }
              }
            }
          }
        }
      }
    },
    "/conversations": {
      "get": {
        "tags": [
          "conversations"
        ],
        "summary": "List conversations",
        "parameters": [
          {
            "name": "orgId",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "required": false
          }
        ],
        "responses": {
          "200": {
            "description": "Conversation list",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/Conversation"
                  }
                }
              }
            }
          }
        }
      },
      "post": {
        "tags": [
          "conversations"
        ],
        "summary": "Create a conversation",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/CreateConversationRequest"
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Conversation created",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ConversationWithParticipants"
                }
              }
            }
          }
        }
      }
    },
    "/conversations/{id}": {
      "get": {
        "tags": [
          "conversations"
        ],
        "summary": "Get conversation",
        "parameters": [
          {
            "$ref": "#/components/parameters/ConversationId"
          }
        ],
        "responses": {
          "200": {
            "description": "Conversation with participants",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ConversationWithParticipants"
                }
              }
            }
          },
          "404": {
            "$ref": "#/components/responses/NotFound"
          }
        }
      },
      "patch": {
        "tags": [
          "conversations"
        ],
        "summary": "Update conversation",
        "parameters": [
          {
            "$ref": "#/components/parameters/ConversationId"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/UpdateConversationRequest"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Conversation updated",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Conversation"
                }
              }
            }
          },
          "404": {
            "$ref": "#/components/responses/NotFound"
          }
        }
      },
      "delete": {
        "tags": [
          "conversations"
        ],
        "summary": "Delete conversation",
        "parameters": [
          {
            "$ref": "#/components/parameters/ConversationId"
          }
        ],
        "responses": {
          "204": {
            "description": "Deleted"
          },
          "404": {
            "$ref": "#/components/responses/NotFound"
          }
        }
      }
    },
    "/conversations/{id}/join": {
      "post": {
        "tags": [
          "participants"
        ],
        "summary": "Join conversation",
        "parameters": [
          {
            "$ref": "#/components/parameters/ConversationId"
          }
        ],
        "responses": {
          "201": {
            "description": "Joined",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Participant"
                }
              }
            }
          }
        }
      }
    },
    "/conversations/{id}/leave": {
      "post": {
        "tags": [
          "participants"
        ],
        "summary": "Leave conversation",
        "parameters": [
          {
            "$ref": "#/components/parameters/ConversationId"
          }
        ],
        "responses": {
          "204": {
            "description": "Left"
          }
        }
      }
    },
    "/conversations/{id}/participants": {
      "post": {
        "tags": [
          "participants"
        ],
        "summary": "Add participant",
        "parameters": [
          {
            "$ref": "#/components/parameters/ConversationId"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/AddParticipantRequest"
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Participant added",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Participant"
                }
              }
            }
          }
        }
      }
    },
    "/conversations/{id}/participants/{userId}": {
      "delete": {
        "tags": [
          "participants"
        ],
        "summary": "Remove participant",
        "parameters": [
          {
            "$ref": "#/components/parameters/ConversationId"
          },
          {
            "$ref": "#/components/parameters/UserId"
          }
        ],
        "responses": {
          "204": {
            "description": "Removed"
          },
          "404": {
            "$ref": "#/components/responses/NotFound"
          }
        }
      }
    },
    "/conversations/{id}/messages": {
      "get": {
        "tags": [
          "messages"
        ],
        "summary": "List messages",
        "parameters": [
          {
            "$ref": "#/components/parameters/ConversationId"
          },
          {
            "name": "limit",
            "in": "query",
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 200
            },
            "required": false
          },
          {
            "name": "before",
            "in": "query",
            "schema": {
              "type": "string",
              "format": "date-time"
            },
            "required": false
          },
          {
            "name": "after",
            "in": "query",
            "schema": {
              "type": "string",
              "format": "date-time"
            },
            "required": false
          }
        ],
        "responses": {
          "200": {
            "description": "Message list",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/Message"
                  }
                }
              }
            }
          }
        }
      },
      "post": {
        "tags": [
          "messages"
        ],
        "summary": "Send message",
        "parameters": [
          {
            "$ref": "#/components/parameters/ConversationId"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/CreateMessageRequest"
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Message created",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Message"
                }
              }
            }
          }
        }
      }
    },
    "/conversations/{id}/control": {
      "post": {
        "tags": [
          "control"
        ],
        "summary": "Send control event",
        "parameters": [
          {
            "$ref": "#/components/parameters/ConversationId"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/CreateControlRequest"
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Control message created",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Message"
                }
              }
            }
          }
        }
      }
    },
    "/admin/conversations": {
      "get": {
        "tags": [
          "admin"
        ],
        "summary": "List conversations (admin)",
        "parameters": [
          {
            "name": "orgId",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "required": false
          },
          {
            "name": "type",
            "in": "query",
            "schema": {
              "type": "string",
              "enum": [
                "private",
                "group"
              ]
            },
            "required": false
          },
          {
            "name": "limit",
            "in": "query",
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 200
            },
            "required": false
          },
          {
            "name": "offset",
            "in": "query",
            "schema": {
              "type": "integer",
              "minimum": 0
            },
            "required": false
          }
        ],
        "responses": {
          "200": {
            "description": "Paginated conversations",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/AdminConversationList"
                }
              }
            }
          }
        }
      }
    },
    "/admin/conversations/{id}": {
      "get": {
        "tags": [
          "admin"
        ],
        "summary": "Get conversation (admin)",
        "parameters": [
          {
            "$ref": "#/components/parameters/ConversationId"
          }
        ],
        "responses": {
          "200": {
            "description": "Conversation with participants and recent messages",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/AdminConversationDetail"
                }
              }
            }
          },
          "404": {
            "$ref": "#/components/responses/NotFound"
          }
        }
      },
      "delete": {
        "tags": [
          "admin"
        ],
        "summary": "Delete conversation (admin)",
        "parameters": [
          {
            "$ref": "#/components/parameters/ConversationId"
          }
        ],
        "responses": {
          "204": {
            "description": "Deleted"
          },
          "404": {
            "$ref": "#/components/responses/NotFound"
          }
        }
      }
    },
    "/admin/users/{userId}/conversations": {
      "get": {
        "tags": [
          "admin"
        ],
        "summary": "List user conversations (admin)",
        "parameters": [
          {
            "$ref": "#/components/parameters/UserId"
          }
        ],
        "responses": {
          "200": {
            "description": "Conversation list",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {
                    "$ref": "#/components/schemas/Conversation"
                  }
                }
              }
            }
          }
        }
      }
    },
    "/admin/conversations/{id}/participants": {
      "post": {
        "tags": [
          "admin"
        ],
        "summary": "Add participant (admin)",
        "parameters": [
          {
            "$ref": "#/components/parameters/ConversationId"
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/AdminAddParticipantRequest"
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Participant added",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Participant"
                }
              }
            }
          }
        }
      }
    },
    "/admin/conversations/{id}/participants/{userId}": {
      "delete": {
        "tags": [
          "admin"
        ],
        "summary": "Remove participant (admin)",
        "parameters": [
          {
            "$ref": "#/components/parameters/ConversationId"
          },
          {
            "$ref": "#/components/parameters/UserId"
          }
        ],
        "responses": {
          "204": {
            "description": "Removed"
          },
          "404": {
            "$ref": "#/components/responses/NotFound"
          }
        }
      }
    },
    "/admin/stats": {
      "get": {
        "tags": [
          "admin"
        ],
        "summary": "Service stats (admin)",
        "parameters": [
          {
            "name": "orgId",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "required": false
          }
        ],
        "responses": {
          "200": {
            "description": "Statistics",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/AdminStats"
                }
              }
            }
          }
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
      },
      "cookieAuthToken": {
        "type": "apiKey",
        "in": "cookie",
        "name": "token"
      },
      "cookieAuthSession": {
        "type": "apiKey",
        "in": "cookie",
        "name": "symbia_session"
      }
    },
    "parameters": {
      "ConversationId": {
        "name": "id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string",
          "format": "uuid"
        }
      },
      "UserId": {
        "name": "userId",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        }
      }
    },
    "responses": {
      "NotFound": {
        "description": "Not found",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      }
    },
    "schemas": {
      "Health": {
        "type": "object",
        "properties": {
          "status": {
            "type": "string"
          },
          "service": {
            "type": "string"
          }
        },
        "required": [
          "status",
          "service"
        ]
      },
      "Bootstrap": {
        "type": "object",
        "properties": {
          "service": {
            "type": "string"
          },
          "version": {
            "type": "string"
          },
          "description": {
            "type": "string"
          },
          "docsUrls": {
            "type": "object"
          },
          "endpoints": {
            "type": "object"
          },
          "authentication": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "websocketEvents": {
            "type": "object"
          }
        },
        "required": [
          "service",
          "version"
        ]
      },
      "Conversation": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "type": {
            "type": "string",
            "enum": [
              "private",
              "group"
            ]
          },
          "name": {
            "type": "string",
            "nullable": true
          },
          "description": {
            "type": "string",
            "nullable": true
          },
          "org_id": {
            "type": "string",
            "nullable": true
          },
          "created_by": {
            "type": "string"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "updated_at": {
            "type": "string",
            "format": "date-time"
          },
          "metadata": {
            "type": "object"
          }
        },
        "required": [
          "id",
          "type",
          "created_by",
          "created_at",
          "updated_at"
        ]
      },
      "Participant": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "conversation_id": {
            "type": "string",
            "format": "uuid"
          },
          "user_id": {
            "type": "string"
          },
          "user_type": {
            "type": "string",
            "enum": [
              "user",
              "agent"
            ]
          },
          "role": {
            "type": "string",
            "enum": [
              "owner",
              "admin",
              "member"
            ]
          },
          "joined_at": {
            "type": "string",
            "format": "date-time"
          },
          "last_read_at": {
            "type": "string",
            "format": "date-time",
            "nullable": true
          }
        },
        "required": [
          "id",
          "conversation_id",
          "user_id",
          "user_type",
          "role",
          "joined_at"
        ]
      },
      "Message": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "conversation_id": {
            "type": "string",
            "format": "uuid"
          },
          "sender_id": {
            "type": "string"
          },
          "sender_type": {
            "type": "string",
            "enum": [
              "user",
              "agent",
              "service",
              "bot"
            ]
          },
          "content": {
            "type": "string"
          },
          "content_type": {
            "type": "string"
          },
          "reply_to": {
            "type": "string",
            "format": "uuid",
            "nullable": true
          },
          "org_id": {
            "type": "string",
            "nullable": true
          },
          "run_id": {
            "type": "string",
            "format": "uuid",
            "nullable": true
          },
          "trace_id": {
            "type": "string",
            "nullable": true
          },
          "sequence": {
            "type": "integer",
            "nullable": true
          },
          "priority": {
            "type": "string",
            "enum": [
              "low",
              "normal",
              "high",
              "critical"
            ],
            "nullable": true
          },
          "interruptible": {
            "type": "boolean",
            "nullable": true
          },
          "preempted_by": {
            "type": "string",
            "format": "uuid",
            "nullable": true
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          },
          "updated_at": {
            "type": "string",
            "format": "date-time",
            "nullable": true
          },
          "deleted_at": {
            "type": "string",
            "format": "date-time",
            "nullable": true
          },
          "metadata": {
            "type": "object"
          }
        },
        "required": [
          "id",
          "conversation_id",
          "sender_id",
          "sender_type",
          "content",
          "content_type",
          "created_at"
        ]
      },
      "ConversationWithParticipants": {
        "type": "object",
        "allOf": [
          {
            "$ref": "#/components/schemas/Conversation"
          },
          {
            "type": "object",
            "properties": {
              "participants": {
                "type": "array",
                "items": {
                  "$ref": "#/components/schemas/Participant"
                }
              }
            }
          }
        ]
      },
      "CreateConversationRequest": {
        "type": "object",
        "properties": {
          "type": {
            "type": "string",
            "enum": [
              "private",
              "group"
            ]
          },
          "name": {
            "type": "string"
          },
          "description": {
            "type": "string"
          },
          "orgId": {
            "type": "string"
          },
          "metadata": {
            "type": "object"
          },
          "participants": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "userId": {
                  "type": "string"
                },
                "userType": {
                  "type": "string",
                  "enum": [
                    "user",
                    "agent"
                  ]
                }
              },
              "required": [
                "userId"
              ]
            }
          }
        },
        "required": [
          "type"
        ]
      },
      "UpdateConversationRequest": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string"
          },
          "description": {
            "type": "string"
          },
          "metadata": {
            "type": "object"
          }
        }
      },
      "AddParticipantRequest": {
        "type": "object",
        "properties": {
          "userId": {
            "type": "string"
          },
          "userType": {
            "type": "string",
            "enum": [
              "user",
              "agent"
            ]
          }
        },
        "required": [
          "userId"
        ]
      },
      "AdminAddParticipantRequest": {
        "type": "object",
        "properties": {
          "userId": {
            "type": "string"
          },
          "userType": {
            "type": "string",
            "enum": [
              "user",
              "agent"
            ]
          },
          "role": {
            "type": "string",
            "enum": [
              "owner",
              "admin",
              "member"
            ]
          }
        },
        "required": [
          "userId",
          "role"
        ]
      },
      "CreateMessageRequest": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "content": {
            "type": "string"
          },
          "contentType": {
            "type": "string"
          },
          "replyTo": {
            "type": "string",
            "format": "uuid"
          },
          "metadata": {
            "type": "object"
          },
          "runId": {
            "type": "string",
            "format": "uuid"
          },
          "traceId": {
            "type": "string"
          },
          "priority": {
            "type": "string",
            "enum": [
              "low",
              "normal",
              "high",
              "critical"
            ]
          },
          "interruptible": {
            "type": "boolean"
          },
          "preemptedBy": {
            "type": "string",
            "format": "uuid"
          }
        },
        "required": [
          "content"
        ]
      },
      "CreateControlRequest": {
        "type": "object",
        "properties": {
          "event": {
            "type": "string",
            "enum": [
              "stream.pause",
              "stream.resume",
              "stream.preempt",
              "stream.route",
              "stream.handoff",
              "stream.cancel",
              "stream.priority"
            ]
          },
          "target": {
            "type": "object",
            "properties": {
              "principalId": {
                "type": "string"
              },
              "principalType": {
                "type": "string",
                "enum": [
                  "user",
                  "agent",
                  "service",
                  "bot"
                ]
              }
            }
          },
          "reason": {
            "type": "string"
          },
          "preemptedBy": {
            "type": "string",
            "format": "uuid"
          },
          "runId": {
            "type": "string",
            "format": "uuid"
          },
          "traceId": {
            "type": "string"
          },
          "metadata": {
            "type": "object"
          }
        },
        "required": [
          "event"
        ]
      },
      "AuthLoginRequest": {
        "type": "object",
        "properties": {
          "email": {
            "type": "string"
          },
          "password": {
            "type": "string"
          }
        },
        "required": [
          "email",
          "password"
        ]
      },
      "AuthLoginResponse": {
        "type": "object",
        "properties": {
          "token": {
            "type": "string"
          },
          "user": {
            "type": "object"
          }
        }
      },
      "AuthSession": {
        "type": "object",
        "properties": {
          "authenticated": {
            "type": "boolean"
          },
          "user": {
            "type": "object",
            "nullable": true
          }
        },
        "required": [
          "authenticated"
        ]
      },
      "AdminConversationList": {
        "type": "object",
        "properties": {
          "items": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Conversation"
            }
          },
          "limit": {
            "type": "integer"
          },
          "offset": {
            "type": "integer"
          },
          "total": {
            "type": "integer"
          }
        },
        "required": [
          "items"
        ]
      },
      "AdminConversationDetail": {
        "type": "object",
        "properties": {
          "conversation": {
            "$ref": "#/components/schemas/Conversation"
          },
          "participants": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Participant"
            }
          },
          "recentMessages": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Message"
            }
          }
        },
        "required": [
          "conversation",
          "participants"
        ]
      },
      "AdminStats": {
        "type": "object",
        "properties": {
          "totalConversations": {
            "type": "integer"
          },
          "totalMessages": {
            "type": "integer"
          },
          "uniqueParticipants": {
            "type": "integer"
          },
          "activeConversations24h": {
            "type": "integer"
          }
        },
        "required": [
          "totalConversations",
          "totalMessages",
          "uniqueParticipants",
          "activeConversations24h"
        ]
      },
      "Error": {
        "type": "object",
        "properties": {
          "error": {
            "type": "string"
          }
        },
        "required": [
          "error"
        ]
      }
    }
  }
};
