# Symbia Assistants Service

The Assistants Service is a graph-based execution engine for building AI-powered assistants and automation workflows. It provides rule-based orchestration, LLM integration, conversation state management, and webhook-based event handling for the Symbia platform.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Authentication](#authentication)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Rule Engine](#rule-engine)
- [Action Handlers](#action-handlers)
- [LLM Integration](#llm-integration)
- [Built-in Assistants](#built-in-assistants)
- [Configuration](#configuration)
- [LLM Integration Guide](#llm-integration-guide)

---

## Overview

### Core Capabilities

| Capability | Description |
|------------|-------------|
| `assistants.graph.execute` | Execute prompt graphs |
| `assistants.run.create` | Create graph runs |
| `assistants.run.status` | Query run status |
| `assistants.actor.register` | Register agent principals |
| `assistants.webhook.receive` | Handle message webhooks |

### Key Features

- **Prompt Graphs:** Node-based execution DAGs for multi-step AI workflows
- **Rule Engine:** Event-triggered, condition-based action execution
- **LLM Integration:** OpenAI, Anthropic with context injection
- **Conversation State:** Persistent state and context management
- **Handoff Workflows:** Bot-to-human agent transitions
- **Multi-Tenant:** Organization-scoped isolation
- **Webhook Integration:** Real-time message routing via Messaging Service

### Hub-and-Spoke Architecture

```
                    ┌─────────────┐
                    │  Messaging  │  (Hub)
                    │   Service   │
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   Assistants  │  │   Identity    │  │   Catalog     │
│   (Spokes)    │  │   Service     │  │   Service     │
└───────────────┘  └───────────────┘  └───────────────┘
```

---

## Quick Start

### Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:pass@host:5432/assistants

# Optional
ASSISTANTS_USE_MEMORY_DB=true         # Use in-memory DB for testing
CATALOG_ENDPOINT=http://localhost:5003/api
IDENTITY_ENDPOINT=http://localhost:5001
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
PORT=5004
```

### Running the Service

```bash
# Development with hot reload
npm run dev

# Production
npm run build && npm run start

# Run migrations
npm run migrate

# Seed database
npm run seed
```

### Default Port

The service runs on port **5004** by default.

---

## Architecture

### Directory Structure

```
assistants/
├── server/src/
│   ├── index.ts                    # Entry point
│   ├── lib/
│   │   ├── db.ts                   # Database initialization
│   │   └── memory-schema.ts        # In-memory DB schema
│   ├── models/
│   │   └── schema.ts               # All database tables
│   ├── routes/
│   │   ├── graphs.ts               # Prompt graph endpoints
│   │   ├── runs.ts                 # Run history endpoints
│   │   ├── actors.ts               # Agent principal endpoints
│   │   ├── webhooks.ts             # Message webhook handler
│   │   ├── rules.ts                # Rule set management
│   │   └── settings.ts             # LLM settings
│   ├── engine/
│   │   ├── types.ts                # Core types
│   │   ├── run-coordinator.ts      # Run orchestration
│   │   ├── rule-executor.ts        # Rule evaluation
│   │   ├── condition-evaluator.ts  # Condition logic
│   │   └── actions/                # Action handlers
│   └── services/
│       └── assistant-loader.ts     # Catalog-based loading
├── docs/
│   ├── BUILDING-ASSISTANTS.md      # Development guide
│   ├── openapi.json                # OpenAPI specification
│   ├── llms.txt                    # Quick LLM reference
│   └── llms-full.txt               # Full LLM documentation
└── dist/                           # Compiled output
```

### Technology Stack

- **Runtime:** Node.js 20
- **Framework:** Express.js 4.x
- **Database:** PostgreSQL with Drizzle ORM (or pg-mem for testing)
- **Language:** TypeScript 5.x
- **LLM Providers:** OpenAI, Anthropic, Azure, Google

---

## Authentication

### Authentication Methods

| Method | Header | Description |
|--------|--------|-------------|
| Bearer Token | `Authorization: Bearer <jwt>` | JWT from Identity Service |
| Session Cookie | `token` or `symbia_session` | Proxied to Identity |
| API Key | `X-API-Key: <key>` | Service-to-service |

### Required Headers

| Header | Required | Description |
|--------|----------|-------------|
| `X-Org-Id` | Yes | Organization ID for multi-tenancy |
| `Authorization` | Yes | Bearer token or session |

### Multi-Tenancy

- Every query filtered by `orgId`
- Org membership determines access level
- Roles: `owner`, `admin`, `member`, `viewer`

---

## API Reference

### Graph Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/graphs` | List prompt graphs |
| POST | `/api/graphs` | Create graph |
| GET | `/api/graphs/:id` | Get graph |
| PUT | `/api/graphs/:id` | Update graph |
| DELETE | `/api/graphs/:id` | Delete graph |
| POST | `/api/graphs/:id/publish` | Publish graph |
| GET | `/api/graphs/:id/runs` | Get graph runs |

**Create Graph:**
```json
{
  "orgId": "org-uuid",
  "name": "Customer Support Flow",
  "description": "Handles customer inquiries",
  "graphJson": {
    "components": [
      {"id": "start", "type": "trigger", "config": {}},
      {"id": "llm", "type": "llm-invoke", "config": {"model": "gpt-4o-mini"}},
      {"id": "respond", "type": "message-send", "config": {}}
    ],
    "edges": [
      {"from": "start", "to": "llm"},
      {"from": "llm", "to": "respond"}
    ]
  },
  "triggerConditions": {"event": "message.received"},
  "logLevel": "info"
}
```

### Run Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/runs` | List runs |
| GET | `/api/runs/:id` | Get run details |
| GET | `/api/runs/:id/logs` | Get run logs |

**Query Parameters:**
- `conversationId` - Filter by conversation
- `graphId` - Filter by graph
- `status` - Filter by status

### Agent Principals

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/actors` | List agents |
| POST | `/api/actors` | Create agent |
| GET | `/api/actors/:id` | Get agent |
| PUT | `/api/actors/:id` | Update agent |
| DELETE | `/api/actors/:id` | Delete agent |

**Create Agent:**
```json
{
  "orgId": "org-uuid",
  "principalId": "assistant:my-bot",
  "name": "My Bot",
  "description": "Customer support bot",
  "defaultGraphId": "graph-uuid",
  "capabilities": ["cap:messaging.send", "cap:data.query"],
  "webhooks": {
    "message": "/api/webhook/message",
    "control": "/api/webhook/control"
  },
  "assistantConfig": {
    "modelConfig": {
      "provider": "openai",
      "model": "gpt-4o-mini"
    }
  }
}
```

### Rule Sets

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/rules` | List all rule sets |
| GET | `/api/rules/:orgId` | Get org rule set |
| POST | `/api/rules` | Create rule set |
| PUT | `/api/rules/:orgId` | Update rule set |
| POST | `/api/rules/:orgId/rules` | Add rule |

### LLM Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings/llm` | Get LLM settings |
| PUT | `/api/settings/llm` | Update LLM settings |

**LLM Settings:**
```json
{
  "provider": "openai",
  "model": "gpt-4o-mini",
  "temperature": 0.7,
  "maxTokens": 1024,
  "apiKey": "sk-..."
}
```

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhook/message` | Handle message from Messaging |
| POST | `/api/webhook/control` | Handle control event |

**Message Envelope:**
```json
{
  "id": "msg-uuid",
  "conversationId": "conv-uuid",
  "orgId": "org-uuid",
  "from": {"principalId": "user-123", "principalType": "user"},
  "to": {"principalId": "assistant:my-bot", "principalType": "assistant"},
  "content": "Hello, I need help",
  "contentType": "text",
  "metadata": {},
  "runId": "run-uuid",
  "traceId": "trace-id",
  "sequence": 1,
  "priority": "normal",
  "interruptible": true,
  "createdAt": "2024-01-15T10:30:00Z"
}
```

**Control Event:**
```json
{
  "event": "stream.pause",
  "conversationId": "conv-uuid",
  "target": {"principalId": "assistant:my-bot", "principalType": "assistant"},
  "reason": "User requested pause",
  "effectiveAt": "2024-01-15T10:30:00Z"
}
```

### Assistants

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/assistants` | List loaded assistants |
| GET | `/api/assistants/:key` | Get assistant info |
| GET | `/api/assistants/:key/health` | Health check |
| GET | `/api/assistants/:key/query` | Direct query |
| GET | `/api/assistants/:key/summary` | Activity summary |

### Health & Discovery

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/bootstrap/service` | Service discovery |
| GET | `/api/status` | Database status |

### Documentation

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/docs/openapi.json` | OpenAPI specification |
| GET | `/docs/llms.txt` | Quick LLM reference |
| GET | `/docs/llms-full.txt` | Full LLM documentation |

---

## Database Schema

### Core Tables

#### promptGraphs
```sql
id: UUID (PK)
orgId: UUID (FK orgs)
name: VARCHAR
description: TEXT
version: INT
graphJson: JSONB                -- { components: [], edges: [] }
isPublished: BOOLEAN
triggerConditions: JSONB
logLevel: VARCHAR               -- debug|info|warn|error
createdBy: UUID (FK users)
publishedAt: TIMESTAMP
createdAt: TIMESTAMP
updatedAt: TIMESTAMP
```

#### graphRuns
```sql
id: UUID (PK)
graphId: UUID (FK promptGraphs)
conversationId: UUID (FK conversations)
orgId: UUID (FK orgs)
traceId: VARCHAR
state: JSONB                    -- { currentNode, inputs, outputs, queued }
status: VARCHAR                 -- running|paused|waiting|completed|failed|cancelled
priority: VARCHAR               -- low|normal|high|critical
metadata: JSONB
startedAt: TIMESTAMP
completedAt: TIMESTAMP
updatedAt: TIMESTAMP
```

#### runLogs
```sql
id: UUID (PK)
runId: UUID (FK graphRuns)
level: VARCHAR                  -- debug|info|warn|error
nodeId: VARCHAR
message: TEXT
data: JSONB
createdAt: TIMESTAMP
```

#### agentPrincipals
```sql
id: UUID (PK)
principalId: VARCHAR            -- e.g., "assistant:my-bot"
orgId: UUID (FK orgs)
principalType: VARCHAR          -- user|agent|service|assistant
name: VARCHAR
description: TEXT
defaultGraphId: UUID (FK promptGraphs)
capabilities: JSONB
webhooks: JSONB                 -- { message?: string, control?: string }
assistantConfig: JSONB
isActive: BOOLEAN
metadata: JSONB
```

#### conversations
```sql
id: UUID (PK)
orgId: UUID (FK orgs)
title: VARCHAR
status: VARCHAR                 -- active|waiting|handoff|resolved|archived
channel: VARCHAR                -- web|slack|etc.
metadata: JSONB
resolvedAt: TIMESTAMP
```

#### messages
```sql
id: UUID (PK)
conversationId: UUID (FK conversations)
participantId: UUID (FK conversationParticipants)
role: VARCHAR                   -- user|assistant|system|agent
content: TEXT
metadata: JSONB
tokenCount: INT
modelUsed: VARCHAR
latencyMs: INT
```

#### handoffRequests
```sql
id: UUID (PK)
conversationId: UUID (FK conversations)
requestedBy: UUID
assignedTo: UUID
status: VARCHAR                 -- pending|assigned|in_progress|resolved|cancelled
reason: TEXT
contextSnapshotId: UUID
assignedAt: TIMESTAMP
```

#### llmProviders
```sql
id: UUID (PK)
orgId: UUID (FK orgs)
name: VARCHAR
providerType: VARCHAR           -- openai|anthropic|azure|google|custom
apiKeyEncrypted: TEXT
defaultModel: VARCHAR
models: JSONB
isActive: BOOLEAN
rateLimits: JSONB
```

---

## Rule Engine

### Rule Structure

```typescript
interface Rule {
  id: string;
  name: string;
  priority: number;           // Higher = executed first
  enabled: boolean;
  trigger: TriggerType;       // message.received, handoff.requested, etc.
  conditions: ConditionGroup;
  actions: ActionConfig[];
  metadata?: Record<string, unknown>;
}
```

### Triggers

| Trigger | Description |
|---------|-------------|
| `message.received` | New message from user |
| `conversation.created` | New conversation started |
| `handoff.requested` | Handoff to human requested |
| `context.updated` | Context changed |
| `timer.fired` | Scheduled trigger |

### Condition Groups

```typescript
interface ConditionGroup {
  logic: 'and' | 'or';
  conditions: (Condition | ConditionGroup)[];
}

interface Condition {
  field: string;              // Path: "message.content", "user.email"
  operator: ConditionOperator;
  value: unknown;
}
```

### Condition Operators

| Operator | Description |
|----------|-------------|
| `eq`, `neq` | Equals, not equals |
| `gt`, `gte`, `lt`, `lte` | Numeric comparison |
| `contains`, `not_contains` | String contains |
| `starts_with`, `ends_with` | String prefix/suffix |
| `matches` | Regex match |
| `in`, `not_in` | Array membership |
| `exists`, `not_exists` | Field existence |

### Execution Flow

1. **Filter Rules** - Match trigger type
2. **Sort by Priority** - Higher first
3. **Evaluate Conditions** - Check condition groups
4. **Execute Actions** - Run sequentially
5. **Update State** - Save state transitions

---

## Action Handlers

### llm.invoke

Invoke LLM with context injection.

```typescript
{
  type: "llm.invoke",
  params: {
    provider: "openai",
    model: "gpt-4o-mini",
    systemPrompt: "You are a helpful assistant.",
    promptTemplate: "User asked: {{message.content}}\n\nContext: {{context.data}}",
    temperature: 0.7,
    maxTokens: 1024,
    contextFields: ["message", "user", "context"]
  }
}
```

### message.send

Send message response.

```typescript
{
  type: "message.send",
  params: {
    contentTemplate: "Here's what I found: {{llmResponse}}",
    role: "assistant",
    metadata: {}
  }
}
```

### handoff.create

Create handoff to human agent.

```typescript
{
  type: "handoff.create",
  params: {
    reason: "Customer requested human support",
    priority: "high",
    metadata: {}
  }
}
```

### service.call

Call external service (logging, catalog, identity).

```typescript
{
  type: "service.call",
  params: {
    service: "logging",
    method: "POST",
    path: "/api/logs/query",
    body: {
      "level": "error",
      "limit": 10
    },
    resultKey: "logsResult"
  }
}
```

### webhook.call

Call arbitrary HTTP webhook.

```typescript
{
  type: "webhook.call",
  params: {
    url: "https://api.example.com/notify",
    method: "POST",
    body: {"event": "{{trigger.event}}"},
    headers: {"X-Custom": "value"}
  }
}
```

### parallel

Execute actions concurrently.

```typescript
{
  type: "parallel",
  params: {
    actions: [
      {"type": "service.call", ...},
      {"type": "service.call", ...}
    ],
    strategy: "all",          // all|any|settle
    timeout: 5000
  }
}
```

### loop

Iterate over collection.

```typescript
{
  type: "loop",
  params: {
    collection: "{{logsResult.entries}}",
    itemKey: "logEntry",
    actions: [
      {"type": "message.send", "params": {"contentTemplate": "Log: {{logEntry.message}}"}}
    ]
  }
}
```

### condition

Conditional branching.

```typescript
{
  type: "condition",
  params: {
    condition: {"field": "logsResult.total", "operator": "gt", "value": 0},
    ifTrue: [{"type": "message.send", ...}],
    ifFalse: [{"type": "message.send", ...}]
  }
}
```

### wait

Delay execution.

```typescript
{
  type: "wait",
  params: {
    duration: 1000            // milliseconds
  }
}
```

### state.transition

Change conversation state.

```typescript
{
  type: "state.transition",
  params: {
    newState: "waiting_for_user"
  }
}
```

### context.update

Update conversation context.

```typescript
{
  type: "context.update",
  params: {
    updates: {
      "lastQuery": "{{message.content}}",
      "queryCount": "{{context.queryCount + 1}}"
    }
  }
}
```

### notify

Send notifications via various channels.

```typescript
{
  type: "notify",
  params: {
    channel: "webhook",           // email|sms|webhook|slack|push
    webhookUrl: "https://...",    // Required for webhook channel
    contentTemplate: "Alert: {{message.content}}",
    subject: "Notification Subject",
    metadata: {}
  }
}
```

### integration.invoke

Call any registered integration operation by namespace path.

```typescript
{
  type: "integration.invoke",
  params: {
    operation: "openai.chat.completions.create",
    body: {
      model: "gpt-4o-mini",
      messages: [{"role": "user", "content": "{{message.content}}"}]
    },
    bodyTemplate: '{"model": "gpt-4o-mini", "messages": {{context.messages}}}',
    timeout: 30000,
    resultKey: "llmResult"
  }
}
```

### assistant.route

Silently route a message to another assistant for processing.

```typescript
{
  type: "assistant.route",
  params: {
    targetAssistant: "log-analyst",    // Target assistant key
    reason: "User asked about logs",    // For observability
    fromContext: false,                 // If true, read target from context
    contextKey: "routeTarget"           // Context key for dynamic routing
  }
}
```

### embedding.route

Fast semantic routing using embeddings (hybrid routing: embedding first, LLM fallback).

```typescript
{
  type: "embedding.route",
  params: {
    provider: "openai",
    model: "text-embedding-3-small",
    dimensions: 512,                    // Optional dimension reduction
    similarityThreshold: 0.7,           // Minimum to consider a match
    confidenceThreshold: 0.85,          // Above this, skip LLM fallback
    excludeAssistants: ["coordinator"], // Don't route to these
    cacheEmbeddings: true,              // Cache assistant embeddings
    resultKey: "embeddingRouteDecision"
  }
}
```

### code.tool.invoke

Execute code tools (file operations, bash, search) within a workspace.

```typescript
{
  type: "code.tool.invoke",
  params: {
    tool: "file-read",     // file-read|file-write|file-edit|glob|grep|ls|bash
    workspaceId: "...",    // Optional, uses conversation workspace if not set
    params: {
      path: "src/index.ts",
      offset: 1,
      limit: 100
    }
  }
}
```

**Available tools:**
- `file-read`: Read file contents with optional line offset/limit
- `file-write`: Write content to a file (requires write permission)
- `file-edit`: Apply text replacements to a file
- `glob`: Find files matching a pattern
- `grep`: Search file contents with regex
- `ls`: List directory contents
- `bash`: Execute shell commands (requires execute permission)

### workspace.create

Create an isolated workspace for code tools.

```typescript
{
  type: "workspace.create",
  params: {
    rootPath: "/tmp/workspace",  // Optional, auto-generated if not set
    permissions: {
      read: true,
      write: true,
      execute: false,
      paths: ["**/*"],
      blockedPaths: ["**/.env*", "**/secrets/**"]
    }
  }
}
```

### workspace.destroy

Destroy a workspace and clean up files.

```typescript
{
  type: "workspace.destroy",
  params: {
    workspaceId: "..."  // Optional, uses conversation workspace if not set
  }
}
```

---

## LLM Integration

### Supported Providers

| Provider | Models |
|----------|--------|
| OpenAI | gpt-4, gpt-4o, gpt-4o-mini, gpt-3.5-turbo |
| Anthropic | claude-3-opus, claude-3-sonnet, claude-3-haiku |
| Azure OpenAI | Configured models |
| Google Vertex | gemini-pro |

### Template Variables

| Variable | Description |
|----------|-------------|
| `{{message.content}}` | User message text |
| `{{message.metadata}}` | Message metadata |
| `{{user.displayName}}` | User's name |
| `{{user.email}}` | User's email |
| `{{conversationState}}` | Current state |
| `{{context.*}}` | Custom context fields |
| `{{llmResponse}}` | Previous LLM output |

### Token Tracking

All LLM calls are logged to `providerUsageLogs`:
- Prompt tokens
- Completion tokens
- Total tokens
- Latency (ms)
- Success/error status

---

## Built-in Assistants

### log-analyst

Analyzes logs from Logging Service.

**Triggers:** `message.received`
**Capabilities:** Query logs, analyze errors, generate summaries

### catalog-search

Searches Catalog Service resources.

**Triggers:** `message.received`
**Capabilities:** Search components, contexts, find resources

### run-debugger

Debugs graph run executions.

**Triggers:** `message.received`
**Capabilities:** Show run status, logs, errors

### usage-reporter

Reports LLM usage and costs.

**Triggers:** `message.received`
**Capabilities:** Token usage, cost analysis per org

### onboarding

Guides new users.

**Triggers:** `message.received`, `conversation.created`
**Capabilities:** Explain features, answer questions

### cli-assistant

Helps with CLI and service discovery.

**Triggers:** `message.received`
**Capabilities:** CLI docs, service endpoints

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5004` | Server port |
| `NODE_ENV` | `development` | Environment mode |
| `DATABASE_URL` | - | PostgreSQL connection |
| `ASSISTANTS_USE_MEMORY_DB` | `false` | Use in-memory DB |
| `CATALOG_ENDPOINT` | `http://localhost:5003/api` | Catalog service |
| `IDENTITY_ENDPOINT` | `https://identity.example.com` | Identity service |
| `LOGGING_ENDPOINT` | `http://localhost:5002/api` | Logging service |
| `OPENAI_API_KEY` | - | OpenAI API key |
| `ANTHROPIC_API_KEY` | - | Anthropic API key |
| `LOG_LEVEL` | `warn` | Logging level |

### Catalog Configuration

Assistants can be configured via Catalog resources:

```json
{
  "key": "my-assistant",
  "name": "My Assistant",
  "type": "assistant",
  "status": "published",
  "metadata": {
    "assistantConfig": {
      "principalId": "assistant:my-assistant",
      "principalType": "assistant",
      "capabilities": ["data.query"],
      "webhooks": {
        "message": "/api/assistants/my-assistant/message"
      },
      "modelConfig": {
        "provider": "openai",
        "model": "gpt-4o-mini",
        "temperature": 0.7
      }
    }
  }
}
```

---

## LLM Integration Guide

This section provides guidance for LLMs interacting with the Assistants Service.

### Common Workflows

#### 1. Create a Prompt Graph

```bash
POST /api/graphs
X-Org-Id: org-uuid
Authorization: Bearer <token>
Content-Type: application/json

{
  "orgId": "org-uuid",
  "name": "Error Analysis Flow",
  "description": "Analyzes error logs and provides recommendations",
  "graphJson": {
    "components": [
      {
        "id": "trigger",
        "type": "message-trigger",
        "config": {"event": "message.received"}
      },
      {
        "id": "query-logs",
        "type": "service-call",
        "config": {
          "service": "logging",
          "path": "/api/logs/query",
          "body": {"level": "error", "limit": 10}
        }
      },
      {
        "id": "analyze",
        "type": "llm-invoke",
        "config": {
          "model": "gpt-4o-mini",
          "promptTemplate": "Analyze these errors: {{query-logs.result}}"
        }
      },
      {
        "id": "respond",
        "type": "message-send",
        "config": {"contentTemplate": "{{analyze.response}}"}
      }
    ],
    "edges": [
      {"from": "trigger", "to": "query-logs"},
      {"from": "query-logs", "to": "analyze"},
      {"from": "analyze", "to": "respond"}
    ]
  },
  "triggerConditions": {
    "event": "message.received",
    "conditions": {"field": "message.content", "operator": "contains", "value": "error"}
  },
  "logLevel": "info"
}
```

#### 2. Register an Agent Principal

```bash
POST /api/actors
X-Org-Id: org-uuid
Authorization: Bearer <token>
Content-Type: application/json

{
  "orgId": "org-uuid",
  "principalId": "assistant:error-analyst",
  "name": "Error Analyst",
  "description": "Analyzes application errors",
  "defaultGraphId": "graph-uuid",
  "capabilities": [
    "cap:messaging.send",
    "cap:logging.read"
  ],
  "webhooks": {
    "message": "/api/webhook/message",
    "control": "/api/webhook/control"
  },
  "assistantConfig": {
    "modelConfig": {
      "provider": "openai",
      "model": "gpt-4o-mini",
      "temperature": 0.3
    }
  }
}
```

#### 3. Create a Rule Set

```bash
POST /api/rules
X-Org-Id: org-uuid
Authorization: Bearer <token>
Content-Type: application/json

{
  "orgId": "org-uuid",
  "name": "Error Handling Rules",
  "description": "Rules for handling error-related queries",
  "rules": [
    {
      "id": "error-greeting",
      "name": "Greet on error query",
      "priority": 100,
      "enabled": true,
      "trigger": "message.received",
      "conditions": {
        "logic": "and",
        "conditions": [
          {"field": "message.content", "operator": "contains", "value": "error"}
        ]
      },
      "actions": [
        {
          "type": "service.call",
          "params": {
            "service": "logging",
            "method": "POST",
            "path": "/api/logs/query",
            "body": {"level": "error", "limit": 20},
            "resultKey": "logs"
          }
        },
        {
          "type": "llm.invoke",
          "params": {
            "promptTemplate": "Analyze: {{logs.entries}}",
            "model": "gpt-4o-mini"
          }
        },
        {
          "type": "message.send",
          "params": {
            "contentTemplate": "{{llmResponse}}"
          }
        }
      ]
    }
  ],
  "isActive": true
}
```

#### 4. Send Message via Webhook

```bash
POST /api/webhook/message
Content-Type: application/json

{
  "id": "msg-123",
  "conversationId": "conv-456",
  "orgId": "org-uuid",
  "from": {
    "principalId": "user-789",
    "principalType": "user"
  },
  "to": {
    "principalId": "assistant:error-analyst",
    "principalType": "assistant"
  },
  "content": "What errors occurred in the last hour?",
  "contentType": "text",
  "sequence": 1,
  "priority": "normal",
  "interruptible": true,
  "createdAt": "2024-01-15T10:30:00Z"
}

# Response
{
  "status": "processed",
  "runId": "run-uuid",
  "response": {
    "content": "I found 5 errors in the last hour...",
    "role": "assistant"
  }
}
```

#### 5. Send Control Event

```bash
POST /api/webhook/control
Content-Type: application/json

{
  "event": "stream.pause",
  "conversationId": "conv-456",
  "target": {
    "principalId": "assistant:error-analyst",
    "principalType": "assistant"
  },
  "reason": "User requested pause",
  "effectiveAt": "2024-01-15T10:35:00Z"
}

# Response
{
  "status": "acknowledged",
  "event": "stream.pause"
}
```

#### 6. Query Run Logs

```bash
GET /api/runs/run-uuid/logs?level=info
X-Org-Id: org-uuid
Authorization: Bearer <token>

# Response
{
  "logs": [
    {
      "id": "log-1",
      "level": "info",
      "nodeId": "query-logs",
      "message": "Queried logging service",
      "data": {"entriesFound": 5},
      "createdAt": "2024-01-15T10:30:01Z"
    },
    {
      "id": "log-2",
      "level": "info",
      "nodeId": "analyze",
      "message": "LLM invocation completed",
      "data": {"tokens": 450, "latencyMs": 1200},
      "createdAt": "2024-01-15T10:30:02Z"
    }
  ]
}
```

#### 7. Configure LLM Settings

```bash
PUT /api/settings/llm
X-Org-Id: org-uuid
Authorization: Bearer <token>
Content-Type: application/json

{
  "provider": "anthropic",
  "model": "claude-3-sonnet",
  "temperature": 0.5,
  "maxTokens": 2048,
  "apiKey": "sk-ant-..."
}

# Response (key not exposed)
{
  "provider": "anthropic",
  "model": "claude-3-sonnet",
  "temperature": 0.5,
  "maxTokens": 2048,
  "apiKeySet": true
}
```

### Request/Response Patterns

#### Success Response
```json
{
  "id": "resource-uuid",
  ...
}
```

#### List Response
```json
{
  "items": [...],
  "total": 42
}
```

#### Error Response
```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

### Common HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 500 | Internal Server Error |

### Conversation States

| State | Description |
|-------|-------------|
| `idle` | Waiting for user |
| `ai_active` | Processing message |
| `waiting_for_user` | Expecting response |
| `handoff_pending` | Awaiting human agent |
| `agent_active` | Human agent handling |
| `resolved` | Complete |
| `archived` | Historical |

### Control Events

| Event | Description |
|-------|-------------|
| `stream.pause` | Pause graph execution |
| `stream.resume` | Resume execution |
| `stream.preempt` | Cancel current LLM call |
| `stream.handoff` | Transition to human |
| `stream.cancel` | Abort graph run |
| `stream.priority` | Change priority |

### Best Practices for LLMs

1. **Use templates** - Leverage `{{variable}}` syntax for dynamic content
2. **Set appropriate log levels** - Use `debug` for development, `warn` for production
3. **Handle handoffs** - Always provide graceful handoff to human agents
4. **Track tokens** - Monitor LLM usage for cost control
5. **Use conditions** - Add guards to prevent unnecessary LLM calls
6. **Chain actions** - Use `resultKey` to pass data between actions
7. **Handle errors** - Include error handling rules
8. **Test with in-memory DB** - Use `ASSISTANTS_USE_MEMORY_DB=true` for testing
9. **Use control events** - Implement pause/resume for long operations
10. **Publish graphs** - Only published graphs are available for execution

### Integration Checklist

- [ ] Create agent principal with webhooks
- [ ] Configure LLM settings for org
- [ ] Create and publish prompt graph
- [ ] Set up rule set for message handling
- [ ] Test webhook integration
- [ ] Monitor run logs for errors
- [ ] Implement handoff workflows
- [ ] Track token usage
- [ ] Handle control events (pause/resume)
- [ ] Set up conversation state transitions

---

## Additional Resources

- **Building Guide:** `/docs/BUILDING-ASSISTANTS.md`
- **OpenAPI Spec:** `/docs/openapi.json`
- **Quick Reference:** `/docs/llms.txt`
- **Full Documentation:** `/docs/llms-full.txt`
- **Health Check:** `/health`
- **Service Discovery:** `/api/bootstrap/service`

---

## License

MIT License - see [LICENSE](../LICENSE) for details.
