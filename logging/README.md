# Symbia Logging Service

The Logging Service is a comprehensive observability platform providing centralized collection, storage, and analysis of logs, metrics, traces, and objects. It features multi-tenant scoping, flexible authentication, and AI-powered log analysis.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Authentication](#authentication)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Multi-Tenancy & Scoping](#multi-tenancy--scoping)
- [Log Assistant (AI Analysis)](#log-assistant-ai-analysis)
- [Configuration](#configuration)
- [LLM Integration Guide](#llm-integration-guide)

---

## Overview

### Core Capabilities

| Capability | Description |
|------------|-------------|
| `logging.log.ingest` | Ingest log entries into streams |
| `logging.log.query` | Query and search log entries |
| `logging.metric.ingest` | Ingest metric data points |
| `logging.metric.query` | Query metrics with aggregations |
| `logging.trace.ingest` | Ingest distributed trace spans |
| `logging.trace.query` | Query traces and spans |
| `logging.stream.manage` | Create/update/delete streams |

### Data Types

| Type | Description | Retention |
|------|-------------|-----------|
| **Logs** | Structured log entries with levels and metadata | 30 days default |
| **Metrics** | Time-series data points with labels | 90 days default |
| **Traces** | Distributed traces with spans | Configurable |
| **Objects** | File/blob metadata with storage references | 90 days default |

### Scoping Hierarchy

```
Organization (orgId)
└── Service (serviceId)
    └── Environment (env: dev|stage|prod)
        └── Data Class (none|pii|phi|secret)
            └── Policy Reference
```

---

## Quick Start

### Environment Variables

```bash
# Required for production
DATABASE_URL=postgresql://user:pass@host:5432/logging

# Optional
LOGGING_USE_MEMORY_DB=true              # Use in-memory DB for testing
LOGGING_AUTH_MODE=optional              # required|optional|off
IDENTITY_SERVICE_URL=http://localhost:5001
SESSION_SECRET=your-session-secret
PORT=5002
```

### Running the Service

```bash
# Development with in-memory DB
npm run dev

# Production
npm run build && npm run start

# With Docker
docker build -t logging-service .
docker run -p 5002:5002 -e DATABASE_URL=... logging-service
```

### Default Development Mode

When running without `DATABASE_URL` or with `LOGGING_USE_MEMORY_DB=true`:
- Uses in-memory PostgreSQL (pg-mem)
- Seeded with demo log streams, metrics, and traces
- Anonymous access allowed with default scoping

---

## Architecture

### Directory Structure

```
logging/
├── server/src/
│   ├── index.ts              # Entry point
│   ├── routes.ts             # All API endpoints (1,200+ lines)
│   ├── auth.ts               # Authentication middleware
│   ├── storage.ts            # Storage interface
│   ├── dbStorage.ts          # PostgreSQL implementation
│   ├── log-assistant.ts      # AI-powered analysis
│   └── openapi.ts            # OpenAPI specification
├── shared/
│   └── schema.ts             # Drizzle ORM schema + Zod validation
├── docs/
│   ├── openapi.json          # OpenAPI specification
│   ├── llms.txt              # Quick LLM reference
│   └── llms-full.txt         # Full LLM documentation
└── Dockerfile                # Production container
```

### Technology Stack

- **Runtime:** Node.js 20
- **Framework:** Express.js 4.21
- **Database:** PostgreSQL with Drizzle ORM (or pg-mem for testing)
- **Authentication:** JWT + API Keys + Sessions via Identity Service
- **Validation:** Zod schemas
- **AI Analysis:** OpenAI/Anthropic LLM integration

---

## Authentication

### Authentication Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `required` | Must provide valid auth | Production |
| `optional` | Anonymous access allowed | Development |
| `off` | Bypass all auth | Testing |

Set via `LOGGING_AUTH_MODE` environment variable.

### Authentication Methods (Priority Order)

#### 1. Session Cookie (Browser Clients)
```bash
# Login via Identity Service
POST /api/auth/login
Content-Type: application/json

{"username": "user@example.com", "password": "password"}

# Cookie set automatically, use for subsequent requests
```

#### 2. Bearer Token (JWT)
```bash
Authorization: Bearer <jwt_token>
```
Token is introspected against Identity Service at `/api/auth/introspect`.

#### 3. API Key (System-to-System)
```bash
X-API-Key: slk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
- Format: `slk_` prefix + 32 hex characters
- Supports expiration and revocation
- Scopes control access (default: `["ingest"]`)

#### 4. Shared Secret (Telemetry Ingest)
```bash
Authorization: Bearer <AUTH_SHARED_SECRET>
```
Only valid for ingest endpoints (`/api/logs/ingest`, `/api/metrics/ingest`, etc.)

### Auth Context

All authenticated requests populate `req.authContext`:

```typescript
{
  authType: "jwt" | "apiKey" | "session" | "anonymous",
  orgId: string,
  serviceId: string,
  env: string,
  dataClass: string,
  policyRef: string,
  actorId: string,
  entitlements: string[],
  roles: string[],
  isSuperAdmin: boolean
}
```

---

## API Reference

### Service Discovery & Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/bootstrap/service` | Service metadata |
| GET | `/api/auth/config` | Identity service URLs |

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login via Identity Service |
| POST | `/api/auth/logout` | Destroy session |
| GET | `/api/auth/session` | Check auth status |
| GET | `/api/auth/me` | Get current user info |
| GET | `/api/auth/keys` | List API keys |
| POST | `/api/auth/keys` | Create API key |
| DELETE | `/api/auth/keys/:id` | Revoke API key |

### Log Streams

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/logs/streams` | List log streams |
| GET | `/api/logs/streams/:id` | Get log stream |
| POST | `/api/logs/streams` | Create log stream |
| PATCH | `/api/logs/streams/:id` | Update log stream |
| DELETE | `/api/logs/streams/:id` | Delete log stream |

### Log Entries

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/logs/query` | Query log entries |
| POST | `/api/logs/ingest` | Ingest log entries |

**Query Parameters:**
```json
{
  "streamIds": ["stream-uuid"],
  "startTime": "2024-01-01T00:00:00Z",
  "endTime": "2024-01-02T00:00:00Z",
  "level": "error",
  "search": "connection failed",
  "metadata": {"service": "api"},
  "limit": 100,
  "offset": 0
}
```

**Ingest Payload:**
```json
{
  "streamId": "stream-uuid",
  "entries": [
    {
      "timestamp": "2024-01-01T12:00:00Z",
      "level": "error",
      "message": "Connection timeout",
      "metadata": {"host": "db-1", "duration_ms": 5000}
    }
  ]
}
```

### Metrics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/metrics` | List metrics |
| GET | `/api/metrics/:id` | Get metric |
| POST | `/api/metrics` | Create metric |
| PATCH | `/api/metrics/:id` | Update metric |
| DELETE | `/api/metrics/:id` | Delete metric |
| POST | `/api/metrics/query` | Query data points |
| POST | `/api/metrics/ingest` | Ingest data points |

**Query Parameters:**
```json
{
  "metricIds": ["metric-uuid"],
  "startTime": "2024-01-01T00:00:00Z",
  "endTime": "2024-01-02T00:00:00Z",
  "aggregation": "avg",
  "interval": "5m",
  "labels": {"host": "server-1"},
  "limit": 1000
}
```

**Aggregation Options:** `avg`, `sum`, `min`, `max`, `count`, `last`

**Ingest Payload:**
```json
{
  "metricId": "metric-uuid",
  "dataPoints": [
    {
      "timestamp": "2024-01-01T12:00:00Z",
      "value": 42.5,
      "labels": {"host": "server-1", "region": "us-east"}
    }
  ]
}
```

### Traces

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/traces` | List traces |
| GET | `/api/traces/:id` | Get trace |
| GET | `/api/traces/:traceId/spans` | Get spans for trace |
| POST | `/api/traces/query` | Query traces |
| POST | `/api/traces/ingest` | Ingest spans |

**Query Parameters:**
```json
{
  "traceIds": ["trace-id"],
  "serviceName": "api-gateway",
  "startTime": "2024-01-01T00:00:00Z",
  "endTime": "2024-01-02T00:00:00Z",
  "status": "error",
  "minDurationMs": 1000,
  "maxDurationMs": 5000,
  "limit": 100
}
```

**Ingest Payload:**
```json
{
  "spans": [
    {
      "traceId": "abc123",
      "spanId": "span-1",
      "parentSpanId": null,
      "name": "HTTP GET /api/users",
      "serviceName": "api-gateway",
      "kind": "server",
      "status": "ok",
      "startTime": "2024-01-01T12:00:00Z",
      "endTime": "2024-01-01T12:00:00.150Z",
      "attributes": {"http.method": "GET", "http.status_code": 200},
      "events": [{"name": "cache_hit", "timestamp": "..."}]
    }
  ]
}
```

### Objects

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/objects/streams` | List object streams |
| GET | `/api/objects/streams/:id` | Get object stream |
| POST | `/api/objects/streams` | Create object stream |
| PATCH | `/api/objects/streams/:id` | Update object stream |
| DELETE | `/api/objects/streams/:id` | Delete object stream |
| POST | `/api/objects/query` | Query object entries |
| POST | `/api/objects/ingest` | Register object entry |

### Data Sources & Integrations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/data-sources` | List data sources |
| POST | `/api/data-sources` | Create data source |
| POST | `/api/data-sources/:id/sync` | Trigger sync |
| GET | `/api/integrations` | List integrations |
| POST | `/api/integrations` | Create integration |
| POST | `/api/integrations/:id/test` | Test connectivity |

### Log Assistant (AI Analysis)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/assistant/config` | Check LLM configuration |
| POST | `/api/assistant/summarize` | Summarize logs |
| POST | `/api/assistant/analyze` | Analyze error patterns |
| POST | `/api/assistant/group` | Group related logs |
| POST | `/api/assistant/investigate` | Investigate specific insight |

### Statistics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stats` | Dashboard statistics |
| GET | `/api/stats/ingest-rate` | 24h ingest rate chart |
| GET | `/api/stats/query-latency` | 24h query latency chart |

### Documentation

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/docs/openapi.json` | OpenAPI specification |
| GET | `/docs/llms.txt` | Quick LLM reference |
| GET | `/docs/llms-full.txt` | Full LLM documentation |
| GET | `/docs` | HTML documentation |

---

## Database Schema

### Core Tables

#### log_streams
```sql
id: UUID (PK)
orgId: TEXT NOT NULL
serviceId: TEXT NOT NULL
env: TEXT NOT NULL
dataClass: TEXT NOT NULL          -- none|pii|phi|secret
policyRef: TEXT NOT NULL
createdBy: TEXT
name: TEXT NOT NULL
description: TEXT
source: TEXT                      -- origin service
level: TEXT DEFAULT 'info'
tags: TEXT[]
retentionDays: INTEGER DEFAULT 30
createdAt: TIMESTAMP
updatedAt: TIMESTAMP
```

#### log_entries
```sql
id: UUID (PK)
streamId: UUID (FK log_streams)
orgId: TEXT NOT NULL
serviceId: TEXT NOT NULL
env: TEXT NOT NULL
dataClass: TEXT NOT NULL
policyRef: TEXT NOT NULL
actorId: TEXT
timestamp: TIMESTAMP NOT NULL
level: TEXT NOT NULL              -- debug|info|warn|error|fatal
message: TEXT NOT NULL
metadata: JSONB
```

#### metrics
```sql
id: UUID (PK)
orgId: TEXT NOT NULL
serviceId: TEXT NOT NULL
env: TEXT NOT NULL
dataClass: TEXT NOT NULL
policyRef: TEXT NOT NULL
createdBy: TEXT
name: TEXT NOT NULL
description: TEXT
unit: TEXT                        -- ms, bytes, %, etc.
type: TEXT DEFAULT 'gauge'        -- gauge|counter|histogram|summary
tags: TEXT[]
dataSourceId: UUID
retentionDays: INTEGER DEFAULT 90
createdAt: TIMESTAMP
updatedAt: TIMESTAMP
```

#### data_points
```sql
id: UUID (PK)
metricId: UUID (FK metrics)
orgId: TEXT NOT NULL
serviceId: TEXT NOT NULL
env: TEXT NOT NULL
dataClass: TEXT NOT NULL
policyRef: TEXT NOT NULL
timestamp: TIMESTAMP NOT NULL
value: REAL NOT NULL
labels: JSONB
```

#### traces
```sql
id: UUID (PK)
traceId: VARCHAR NOT NULL
orgId: TEXT NOT NULL
serviceId: TEXT NOT NULL
env: TEXT NOT NULL
dataClass: TEXT NOT NULL
policyRef: TEXT NOT NULL
actorId: TEXT
name: TEXT NOT NULL
serviceName: TEXT
status: TEXT DEFAULT 'unset'      -- unset|ok|error
startTime: TIMESTAMP NOT NULL
endTime: TIMESTAMP
durationMs: INTEGER
tags: TEXT[]
attributes: JSONB
createdAt: TIMESTAMP
```

#### spans
```sql
id: UUID (PK)
traceId: VARCHAR NOT NULL
orgId: TEXT NOT NULL
serviceId: TEXT NOT NULL
env: TEXT NOT NULL
dataClass: TEXT NOT NULL
policyRef: TEXT NOT NULL
actorId: TEXT
parentSpanId: VARCHAR
spanId: VARCHAR NOT NULL
name: TEXT NOT NULL
serviceName: TEXT
kind: TEXT DEFAULT 'internal'     -- server|client|producer|consumer|internal
status: TEXT DEFAULT 'unset'
startTime: TIMESTAMP NOT NULL
endTime: TIMESTAMP
durationMs: INTEGER
attributes: JSONB
events: JSONB
```

#### object_streams
```sql
id: UUID (PK)
orgId: TEXT NOT NULL
serviceId: TEXT NOT NULL
env: TEXT NOT NULL
dataClass: TEXT NOT NULL
policyRef: TEXT NOT NULL
createdBy: TEXT
name: TEXT NOT NULL
description: TEXT
contentType: TEXT
tags: TEXT[]
retentionDays: INTEGER DEFAULT 90
createdAt: TIMESTAMP
updatedAt: TIMESTAMP
```

#### object_entries
```sql
id: UUID (PK)
streamId: UUID (FK object_streams)
orgId: TEXT NOT NULL
serviceId: TEXT NOT NULL
env: TEXT NOT NULL
dataClass: TEXT NOT NULL
policyRef: TEXT NOT NULL
actorId: TEXT
timestamp: TIMESTAMP NOT NULL
filename: TEXT
contentType: TEXT
size: BIGINT
checksum: TEXT
storageUrl: TEXT
metadata: JSONB
createdAt: TIMESTAMP
```

#### api_keys
```sql
id: UUID (PK)
name: TEXT NOT NULL
description: TEXT
keyPrefix: TEXT NOT NULL          -- slk_ + 8 chars
keyHash: TEXT NOT NULL UNIQUE     -- SHA256
orgId: TEXT
serviceId: TEXT
env: TEXT
scopes: TEXT[] DEFAULT ['read', 'write']
expiresAt: TIMESTAMP
lastUsedAt: TIMESTAMP
revokedAt: TIMESTAMP
createdBy: VARCHAR
createdAt: TIMESTAMP
```

#### data_sources
```sql
id: UUID (PK)
orgId: TEXT NOT NULL
serviceId: TEXT NOT NULL
env: TEXT NOT NULL
createdBy: TEXT
name: TEXT NOT NULL
type: TEXT NOT NULL               -- prometheus, fluentd, datadog, etc.
config: JSONB
status: TEXT DEFAULT 'inactive'   -- inactive|active|error
lastSyncAt: TIMESTAMP
createdAt: TIMESTAMP
```

#### integrations
```sql
id: UUID (PK)
orgId: TEXT NOT NULL
serviceId: TEXT NOT NULL
env: TEXT NOT NULL
createdBy: TEXT
name: TEXT NOT NULL
type: TEXT NOT NULL
endpoint: TEXT NOT NULL
status: TEXT DEFAULT 'disconnected'
lastCheckedAt: TIMESTAMP
config: JSONB
createdAt: TIMESTAMP
```

---

## Multi-Tenancy & Scoping

### Required Headers

| Header | Required | Description |
|--------|----------|-------------|
| `X-Org-Id` | Yes | Organization identifier |
| `X-Service-Id` | No | Service identifier |
| `X-Env` | No | Environment (dev/stage/prod) |
| `X-Data-Class` | No | Data classification |
| `X-Policy-Ref` | No | Policy reference |

### Default Values

```bash
LOGGING_DEFAULT_ORG_ID=symbia-dev
LOGGING_DEFAULT_SERVICE_ID=logging-service
LOGGING_DEFAULT_ENV=dev
LOGGING_DEFAULT_DATA_CLASS=none
LOGGING_DEFAULT_POLICY_REF=policy/default
```

### Scope Resolution

1. **JWT Auth:** Use requested headers, fall back to user's first org
2. **API Key:** Use key's scoped environment
3. **Session:** Use requested headers, validate org membership
4. **Super Admin:** Can override scopes to access any org/service

### Data Isolation

All queries are automatically filtered by scope:
- Non-super-admin users only see data in their organizations
- Super admins can query across organizations
- All data includes scope fields for audit

---

## Log Assistant (AI Analysis)

### Configuration

```bash
# OpenAI (preferred)
OPENAI_API_KEY=sk-...

# Or Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Model settings
LLM_MODEL=gpt-4o-mini           # default
LLM_TEMPERATURE=0.3             # default
LLM_MAX_TOKENS=2000             # default
LOG_ASSISTANT_VERBOSE=true      # debug logging
```

### Capabilities

#### Summarize Logs
```bash
POST /api/assistant/summarize
{
  "startTime": "2024-01-01T00:00:00Z",
  "endTime": "2024-01-01T01:00:00Z",
  "streamIds": ["stream-uuid"],
  "level": "error",
  "limit": 100
}

# Response
{
  "summary": "High error rate detected...",
  "insights": [
    {"text": "Database connection failures spiked", "severity": "high"}
  ],
  "errorCount": 42,
  "warnCount": 15,
  "patterns": ["Connection timeout", "Auth failure"]
}
```

#### Analyze Errors
```bash
POST /api/assistant/analyze
{
  "startTime": "...",
  "endTime": "...",
  "streamIds": ["..."]
}

# Response
{
  "summary": "Root cause analysis...",
  "errorMessages": ["Connection timeout", "Auth denied"],
  "possibleCauses": ["Database overload", "Invalid credentials"],
  "suggestedActions": ["Scale database", "Check auth config"]
}
```

#### Group Related Logs
```bash
POST /api/assistant/group
{
  "startTime": "...",
  "endTime": "..."
}

# Response
{
  "groups": [
    {
      "id": "group-1",
      "name": "Database Errors",
      "pattern": "connection.*timeout",
      "count": 25,
      "logIds": ["log-1", "log-2", ...]
    }
  ]
}
```

#### Investigate Insight
```bash
POST /api/assistant/investigate
{
  "insight": {"text": "Database connection failures"},
  "timeframe": {"start": "...", "end": "..."},
  "streamIds": ["..."]
}

# Response
{
  "explanation": "The database connection failures...",
  "relatedLogs": [...],
  "suggestedActions": ["Check connection pool", "Review DB metrics"]
}
```

### Fallback Behavior

If no LLM is configured:
- Provides local statistical analysis
- Returns basic counts and patterns
- No AI-generated insights

---

## Configuration

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection (production) |

### Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5002` | Server port |
| `NODE_ENV` | `development` | Environment mode |
| `LOGGING_USE_MEMORY_DB` | `false` | Force in-memory DB |
| `LOGGING_AUTH_MODE` | `optional` | Auth mode (required/optional/off) |
| `SESSION_SECRET` | - | Session encryption key |
| `AUTH_SHARED_SECRET` | - | Shared secret for telemetry |
| `IDENTITY_SERVICE_URL` | `https://identity.example.com` | Identity service |
| `OPENAI_API_KEY` | - | OpenAI API key for assistant |
| `ANTHROPIC_API_KEY` | - | Anthropic API key for assistant |
| `LLM_MODEL` | `gpt-4o-mini` | LLM model to use |
| `LLM_TEMPERATURE` | `0.3` | LLM temperature |
| `LLM_MAX_TOKENS` | `2000` | Max tokens per request |

### Scoping Defaults

| Variable | Default | Description |
|----------|---------|-------------|
| `LOGGING_DEFAULT_ORG_ID` | `symbia-dev` | Default organization |
| `LOGGING_DEFAULT_SERVICE_ID` | `logging-service` | Default service |
| `LOGGING_DEFAULT_ENV` | `dev` | Default environment |
| `LOGGING_DEFAULT_DATA_CLASS` | `none` | Default data class |
| `LOGGING_DEFAULT_POLICY_REF` | `policy/default` | Default policy |

---

## LLM Integration Guide

This section provides guidance for LLMs interacting with the Logging Service.

### Common Workflows

#### 1. Create a Log Stream and Ingest Logs

```bash
# Create log stream
POST /api/logs/streams
X-Org-Id: my-org
X-Service-Id: api-service
X-Env: production
Content-Type: application/json

{
  "name": "API Request Logs",
  "description": "HTTP request logs from API gateway",
  "source": "api-gateway",
  "level": "info",
  "tags": ["http", "gateway"],
  "retentionDays": 30
}

# Response
{
  "id": "stream-uuid",
  "name": "API Request Logs",
  "orgId": "my-org",
  "serviceId": "api-service",
  "env": "production",
  ...
}

# Ingest logs
POST /api/logs/ingest
X-API-Key: slk_xxxxx
Content-Type: application/json

{
  "streamId": "stream-uuid",
  "entries": [
    {
      "timestamp": "2024-01-15T10:30:00Z",
      "level": "info",
      "message": "GET /api/users 200 OK",
      "metadata": {
        "method": "GET",
        "path": "/api/users",
        "status": 200,
        "duration_ms": 45,
        "user_id": "user-123"
      }
    },
    {
      "timestamp": "2024-01-15T10:30:01Z",
      "level": "error",
      "message": "POST /api/orders 500 Internal Server Error",
      "metadata": {
        "method": "POST",
        "path": "/api/orders",
        "status": 500,
        "error": "Database connection failed"
      }
    }
  ]
}
```

#### 2. Query Logs with Filters

```bash
POST /api/logs/query
Authorization: Bearer <token>
Content-Type: application/json

{
  "streamIds": ["stream-uuid"],
  "startTime": "2024-01-15T00:00:00Z",
  "endTime": "2024-01-15T23:59:59Z",
  "level": "error",
  "search": "connection failed",
  "limit": 50
}

# Response
{
  "entries": [
    {
      "id": "entry-uuid",
      "timestamp": "2024-01-15T10:30:01Z",
      "level": "error",
      "message": "POST /api/orders 500 Internal Server Error",
      "metadata": {...}
    }
  ],
  "total": 42
}
```

#### 3. Create and Ingest Metrics

```bash
# Create metric
POST /api/metrics
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "http_request_duration_ms",
  "description": "HTTP request duration in milliseconds",
  "unit": "ms",
  "type": "histogram",
  "tags": ["http", "latency"]
}

# Ingest data points
POST /api/metrics/ingest
X-API-Key: slk_xxxxx
Content-Type: application/json

{
  "metricId": "metric-uuid",
  "dataPoints": [
    {
      "timestamp": "2024-01-15T10:30:00Z",
      "value": 45.2,
      "labels": {"endpoint": "/api/users", "method": "GET"}
    },
    {
      "timestamp": "2024-01-15T10:30:05Z",
      "value": 123.5,
      "labels": {"endpoint": "/api/orders", "method": "POST"}
    }
  ]
}
```

#### 4. Query Metrics with Aggregation

```bash
POST /api/metrics/query
Authorization: Bearer <token>
Content-Type: application/json

{
  "metricIds": ["metric-uuid"],
  "startTime": "2024-01-15T00:00:00Z",
  "endTime": "2024-01-15T23:59:59Z",
  "aggregation": "avg",
  "interval": "5m",
  "labels": {"endpoint": "/api/users"}
}

# Response
{
  "dataPoints": [
    {"timestamp": "2024-01-15T10:30:00Z", "value": 42.3},
    {"timestamp": "2024-01-15T10:35:00Z", "value": 38.7}
  ]
}
```

#### 5. Ingest Distributed Traces

```bash
POST /api/traces/ingest
X-API-Key: slk_xxxxx
Content-Type: application/json

{
  "spans": [
    {
      "traceId": "abc123def456",
      "spanId": "span-001",
      "parentSpanId": null,
      "name": "HTTP GET /api/users",
      "serviceName": "api-gateway",
      "kind": "server",
      "status": "ok",
      "startTime": "2024-01-15T10:30:00.000Z",
      "endTime": "2024-01-15T10:30:00.150Z",
      "attributes": {
        "http.method": "GET",
        "http.url": "/api/users",
        "http.status_code": 200
      }
    },
    {
      "traceId": "abc123def456",
      "spanId": "span-002",
      "parentSpanId": "span-001",
      "name": "DB Query users",
      "serviceName": "user-service",
      "kind": "client",
      "status": "ok",
      "startTime": "2024-01-15T10:30:00.050Z",
      "endTime": "2024-01-15T10:30:00.120Z",
      "attributes": {
        "db.system": "postgresql",
        "db.statement": "SELECT * FROM users"
      }
    }
  ]
}
```

#### 6. Use AI Log Analysis

```bash
# Summarize recent errors
POST /api/assistant/summarize
Authorization: Bearer <token>
Content-Type: application/json

{
  "startTime": "2024-01-15T00:00:00Z",
  "endTime": "2024-01-15T12:00:00Z",
  "level": "error",
  "limit": 200
}

# Analyze error patterns
POST /api/assistant/analyze
Authorization: Bearer <token>
Content-Type: application/json

{
  "startTime": "2024-01-15T00:00:00Z",
  "endTime": "2024-01-15T12:00:00Z",
  "streamIds": ["api-stream", "db-stream"]
}

# Response
{
  "summary": "Analysis of 150 error logs reveals...",
  "errorMessages": [
    "Connection pool exhausted",
    "Query timeout exceeded"
  ],
  "possibleCauses": [
    "Database connection pool too small",
    "Slow queries blocking connections"
  ],
  "suggestedActions": [
    "Increase connection pool size",
    "Add query timeout limits",
    "Review slow query logs"
  ]
}
```

#### 7. Create an API Key

```bash
POST /api/auth/keys
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "name": "Telemetry Ingester",
  "description": "API key for telemetry pipeline",
  "scopes": ["ingest"],
  "expiresAt": "2025-01-01T00:00:00Z"
}

# Response
{
  "id": "key-uuid",
  "name": "Telemetry Ingester",
  "key": "slk_xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "keyPrefix": "slk_xxxx",
  "scopes": ["ingest"],
  "expiresAt": "2025-01-01T00:00:00Z"
}
```

### Request/Response Patterns

#### Standard Success Response
```json
{
  "id": "uuid",
  "name": "...",
  ...
}
```

#### List Response
```json
{
  "entries": [...],
  "total": 100
}
```

#### Error Response
```json
{
  "message": "Error description",
  "code": "ERROR_CODE"
}
```

### Common HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation failed) |
| 401 | Unauthorized (no/invalid auth) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 500 | Internal Server Error |

### Validation Rules

| Field | Rule |
|-------|------|
| `level` | One of: `debug`, `info`, `warn`, `error`, `fatal` |
| `type` (metric) | One of: `gauge`, `counter`, `histogram`, `summary` |
| `kind` (span) | One of: `server`, `client`, `producer`, `consumer`, `internal` |
| `status` (trace/span) | One of: `unset`, `ok`, `error` |
| `dataClass` | One of: `none`, `pii`, `phi`, `secret` |
| `env` | Typically: `dev`, `stage`, `prod` |
| `aggregation` | One of: `avg`, `sum`, `min`, `max`, `count`, `last` |

### Best Practices for LLMs

1. **Always include scope headers** (`X-Org-Id`, `X-Service-Id`, `X-Env`)
2. **Use API keys for ingest** - more efficient than JWT for high-volume
3. **Batch ingest operations** - send multiple entries in one request
4. **Use appropriate log levels** - debug < info < warn < error < fatal
5. **Include structured metadata** - enables better querying
6. **Use trace IDs** - correlate logs across services
7. **Set retention appropriately** - balance cost vs. audit needs
8. **Use AI assistant** for error analysis when investigating issues
9. **Query with time bounds** - always specify `startTime`/`endTime`
10. **Use aggregations** for metrics dashboards

### Integration Checklist

- [ ] Configure authentication (API key or JWT)
- [ ] Set up scope headers for multi-tenancy
- [ ] Create log streams before ingesting
- [ ] Create metrics before ingesting data points
- [ ] Use consistent trace IDs across services
- [ ] Handle 401/403 errors with token refresh
- [ ] Implement retry logic for ingest failures
- [ ] Configure appropriate retention periods
- [ ] Set up AI assistant for error analysis

---

## Additional Resources

- **OpenAPI Spec:** `/docs/openapi.json`
- **Quick Reference:** `/docs/llms.txt`
- **Full Documentation:** `/docs/llms-full.txt`
- **Health Check:** `/health`
- **Service Discovery:** `/api/bootstrap/service`

---

## License

MIT License - see [LICENSE](../LICENSE) for details.
