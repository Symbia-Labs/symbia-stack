# Symbia Catalog Service

The Catalog Service is the central registry for all platform resources including components, contexts, integrations, graphs, executors, and assistants. It provides versioned storage, artifact management, access control, and bootstrap capabilities for the Symbia platform.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Authentication](#authentication)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Resource Types](#resource-types)
- [Access Control](#access-control)
- [Configuration](#configuration)
- [LLM Integration Guide](#llm-integration-guide)

---

## Overview

### Core Capabilities

| Capability | Description |
|------------|-------------|
| `catalog.resource.create` | Create new registry resources |
| `catalog.resource.read` | Read resource details and metadata |
| `catalog.resource.update` | Update existing resources |
| `catalog.resource.delete` | Delete resources |
| `catalog.search` | Search across all resources |
| `catalog.bootstrap` | Access bootstrap/initialization resources |

### Resource Types

| Type | Description |
|------|-------------|
| `component` | Reusable building blocks with defined interfaces |
| `context` | Configuration and environment definitions |
| `integration` | External service connectors |
| `graph` | Workflow/pipeline definitions with nodes and edges |
| `executor` | Runtime implementations of components |
| `assistant` | AI agent configurations |

### Hierarchy Model

```
Resource
├── Versions (immutable snapshots)
├── Artifacts (file attachments)
├── Signatures (cryptographic proofs)
└── Certifications (formal approvals)
```

---

## Quick Start

### Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:pass@host:5432/catalog

# Optional
CATALOG_USE_MEMORY_DB=true              # Use in-memory DB for testing
IDENTITY_SERVICE_URL=http://localhost:5001
CORS_ALLOWED_ORIGINS=http://localhost:3000
PORT=5003
```

### Running the Service

```bash
# Development with in-memory DB
npm run dev

# Production
npm run build && npm run start

# Seed test data
npm run seed
```

### Default Test Data (Memory DB)

When running with `CATALOG_USE_MEMORY_DB=true`, the service auto-seeds:
- 4 components (Identity, HTTP Request, JSON Parse, Template)
- 2 graphs (Hello World, Authentication Flow)
- 3 assistants (Log Analyst, Metrics Analyst, Trace Analyst)

---

## Architecture

### Directory Structure

```
catalog/
├── server/src/
│   ├── index.ts              # Entry point
│   ├── routes.ts             # All API endpoints (1425+ lines)
│   ├── auth.ts               # Authentication middleware
│   ├── identity.ts           # Identity service integration
│   ├── entitlements.ts       # Access control logic
│   ├── storage.ts            # Data access layer
│   ├── artifact-storage.ts   # File storage handling
│   ├── bootstrap-summary.ts  # Bootstrap aggregation
│   └── rate-limit.ts         # Rate limiting
├── shared/
│   └── schema.ts             # Drizzle ORM schema
├── docs/
│   ├── openapi.json          # OpenAPI specification
│   ├── llms.txt              # Quick LLM reference
│   └── llms-full.txt         # Full LLM documentation
└── artifacts/                # Stored artifact files
```

### Technology Stack

- **Runtime:** Node.js 20
- **Framework:** Express.js 4.21
- **Database:** PostgreSQL with Drizzle ORM
- **Authentication:** JWT + API Keys via Identity Service
- **Validation:** Zod schemas
- **File Storage:** Local filesystem (S3 ready)

---

## Authentication

### Authentication Methods

| Method | Header | Format |
|--------|--------|--------|
| Bearer Token | `Authorization` | `Bearer <jwt_token>` |
| API Key | `X-API-Key` | `sos_<32-hex-chars>` |
| Session Cookie | `symbia_session` | Set by identity service |

### Token Verification

Tokens are verified against the Identity Service:

```bash
# Token introspection
POST ${IDENTITY_SERVICE_URL}/api/auth/introspect
Content-Type: application/json

{"token": "<jwt_token>"}
```

### API Key Authentication

API keys grant super-admin access and are managed through the catalog service:

```bash
# Create API key (super admin only)
POST /api/api-keys
Authorization: Bearer <admin_token>
Content-Type: application/json

{"name": "CI/CD Pipeline"}

# Response
{
  "id": "uuid",
  "name": "CI/CD Pipeline",
  "key": "sos_xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "keyPrefix": "sos_xxxx"
}
```

---

## API Reference

### Public Endpoints (No Auth Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/bootstrap` | Get public bootstrap resources |
| GET | `/api/bootstrap/summary` | Get aggregated bootstrap metadata |
| GET | `/api/bootstrap/service` | Service discovery info |
| GET | `/api/auth/config` | Get identity service URL |
| GET | `/docs/openapi.json` | OpenAPI specification |
| GET | `/docs/llms.txt` | Quick LLM documentation |
| GET | `/docs/llms-full.txt` | Full LLM documentation |

### Resource Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/resources` | List all resources |
| POST | `/api/resources` | Create resource |
| GET | `/api/resources/:id` | Get resource by ID |
| PATCH | `/api/resources/:id` | Update resource |
| DELETE | `/api/resources/:id` | Delete resource |
| POST | `/api/resources/bulk` | Bulk operations |

**Query Parameters for GET /api/resources:**
- `type` - Filter by resource type
- `status` - Filter by status (draft, published, deprecated)

**Bulk Operations:**
```json
{
  "operation": "publish" | "delete" | "updateStatus" | "addTags" | "removeTags",
  "ids": ["uuid1", "uuid2"],
  "status": "published",  // for updateStatus
  "tags": ["tag1"]        // for addTags/removeTags
}
```

### Publishing & Versions

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/resources/:id/publish` | Publish and create version |
| GET | `/api/resources/:id/versions` | Get resource versions |
| GET | `/api/versions` | Get all versions |

### Artifacts

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/resources/:id/artifacts` | Upload artifact |
| GET | `/api/resources/:id/artifacts` | List resource artifacts |
| GET | `/api/artifacts/:id/download` | Download artifact |
| DELETE | `/api/artifacts/:id` | Delete artifact |

**Artifact Upload:**
```json
{
  "name": "bundle.zip",
  "type": "application/zip",
  "content": "<base64_encoded_content>"
}
```

> **Note:** The parameter is `type` (not `mimeType`) in the request body. The service stores it as `mimeType` internally.

**Allowed MIME Types:**
- `application/json`, `text/yaml`, `application/x-yaml`
- `application/zip`, `application/gzip`, `application/x-tar`
- `text/plain`, `text/javascript`, `application/javascript`
- `image/png`, `image/jpeg`, `image/gif`, `image/svg+xml`

**Max Size:** 50MB (configurable via `ARTIFACT_MAX_SIZE_MB`)

### Signatures & Certifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/resources/:id/signatures` | Get resource signatures |
| GET | `/api/resources/:id/certifications` | Get resource certifications |

### Type-Specific Convenience Endpoints

Type-specific endpoints provide cleaner APIs for common resource types. For resources without convenience endpoints (`integration`, `assistant`, `component`), use the generic `/api/resources` endpoints with `type` filter.

#### Graphs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/graphs` | List graphs |
| POST | `/api/graphs` | Create graph |
| GET | `/api/graphs/:id` | Get graph |
| PATCH | `/api/graphs/:id` | Update graph |
| DELETE | `/api/graphs/:id` | Delete graph |

#### Contexts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/contexts` | List contexts |
| POST | `/api/contexts` | Create context |
| GET | `/api/contexts/:id` | Get context |
| PATCH | `/api/contexts/:id` | Update context |
| DELETE | `/api/contexts/:id` | Delete context |

#### Executors
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/executors` | List executors |
| POST | `/api/executors` | Create executor |
| GET | `/api/executors/:id` | Get executor |
| PATCH | `/api/executors/:id` | Update executor |
| DELETE | `/api/executors/:id` | Delete executor |
| GET | `/api/executors/by-component/:key` | Resolve by component key |

### Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/search` | Keyword search |
| POST | `/api/nl/search` | Natural language search |

**Search Request:**
```json
{
  "query": "authentication",
  "type": "component",      // optional
  "status": "published"     // optional
}
```

### User & Stats

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/me` | Get current user & orgs |
| GET | `/api/stats` | Get dashboard statistics |
| GET | `/api/rate-limits` | Get rate limit config |

### API Key Management (Super Admin)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-keys` | List API keys |
| POST | `/api/api-keys` | Create API key |
| DELETE | `/api/api-keys/:id` | Delete API key |

---

## Database Schema

### Core Tables

#### resources
```sql
id: UUID (PK)
key: VARCHAR(255) UNIQUE        -- e.g., "ai/llm/gpt4"
name: TEXT
description: TEXT
type: VARCHAR(50)               -- component, context, graph, executor, assistant
status: VARCHAR(50)             -- draft, published, deprecated
isBootstrap: BOOLEAN            -- marked for initialization
tags: TEXT[]                    -- categorization tags
orgId: VARCHAR(255)             -- organization scoping
accessPolicy: JSONB             -- visibility and permissions
metadata: JSONB                 -- type-specific data
currentVersion: INTEGER
createdAt: TIMESTAMP
updatedAt: TIMESTAMP
```

#### resource_versions
```sql
id: UUID (PK)
resourceId: UUID (FK resources)
version: INTEGER
content: JSONB                  -- full resource snapshot
changelog: TEXT
publishedAt: TIMESTAMP
createdAt: TIMESTAMP
createdBy: VARCHAR(255)
```

#### artifacts
```sql
id: UUID (PK)
resourceId: UUID (FK resources)
versionId: UUID (FK versions, optional)
name: TEXT
mimeType: VARCHAR(255)
size: INTEGER
checksum: VARCHAR(255)          -- SHA256 hash
storageUrl: TEXT
createdAt: TIMESTAMP
```

#### signatures
```sql
id: UUID (PK)
resourceId: UUID (FK resources)
versionId: UUID (FK versions, optional)
signerId: VARCHAR(255)
signerName: TEXT
algorithm: VARCHAR(50)          -- e.g., RSA-2048
signature: TEXT                 -- base64 encoded
signedAt: TIMESTAMP
```

#### certifications
```sql
id: UUID (PK)
resourceId: UUID (FK resources)
versionId: UUID (FK versions, optional)
certifierId: VARCHAR(255)
certifierName: TEXT
certificationType: VARCHAR(100)
notes: TEXT
certifiedAt: TIMESTAMP
expiresAt: TIMESTAMP
```

#### entitlements
```sql
id: UUID (PK)
resourceId: UUID (FK resources)
principalId: VARCHAR(255)
principalType: VARCHAR(50)      -- user, service, role
permission: VARCHAR(50)         -- read, write, publish, delete
grantedAt: TIMESTAMP
grantedBy: VARCHAR(255)
```

#### api_keys
```sql
id: UUID (PK)
name: TEXT
keyHash: VARCHAR(64) UNIQUE     -- SHA256 hash
keyPrefix: VARCHAR(8)           -- first 8 chars
createdBy: VARCHAR(255)
createdByName: TEXT
lastUsedAt: TIMESTAMP
expiresAt: TIMESTAMP
isActive: BOOLEAN
createdAt: TIMESTAMP
```

---

## Resource Types

### Component

Reusable building blocks with defined input/output interfaces.

```json
{
  "key": "ai/llm/openai",
  "name": "OpenAI LLM",
  "type": "component",
  "metadata": {
    "category": "intelligence",
    "ports": {
      "inputs": [
        {"name": "prompt", "type": "string", "required": true}
      ],
      "outputs": [
        {"name": "response", "type": "string"}
      ]
    },
    "configSchema": {
      "type": "object",
      "properties": {
        "model": {"type": "string", "default": "gpt-4"}
      }
    }
  }
}
```

### Context

Configuration and environment definitions.

```json
{
  "key": "env/production",
  "name": "Production Environment",
  "type": "context",
  "metadata": {
    "category": "workspace",
    "variables": {
      "API_URL": "https://api.example.com",
      "LOG_LEVEL": "info"
    }
  }
}
```

### Graph

Workflow/pipeline definitions with nodes and edges.

```json
{
  "key": "workflows/auth-flow",
  "name": "Authentication Flow",
  "type": "graph",
  "metadata": {
    "graphId": "auth-flow-v1",
    "components": [
      {
        "id": "validate",
        "componentKey": "auth/validate-token",
        "config": {}
      },
      {
        "id": "authorize",
        "componentKey": "auth/check-permissions",
        "config": {}
      }
    ],
    "edges": [
      {
        "from": {"nodeId": "validate", "port": "valid"},
        "to": {"nodeId": "authorize", "port": "input"}
      }
    ]
  }
}
```

### Executor

Runtime implementation of a component.

```json
{
  "key": "executors/openai-node",
  "name": "OpenAI Node Executor",
  "type": "executor",
  "metadata": {
    "componentKey": "ai/llm/openai",
    "componentVersion": "1.0.0",
    "language": "node",
    "runtimeVersion": "20",
    "entrypoint": "handler",
    "artifactRef": "artifact-uuid",
    "determinism": "non-deterministic",
    "configSchema": {},
    "ports": {
      "inputs": [{"name": "prompt", "type": "string"}],
      "outputs": [{"name": "response", "type": "string"}]
    }
  }
}
```

### Assistant

AI agent configuration.

```json
{
  "key": "assistants/log-analyst",
  "name": "Log Analyst",
  "type": "assistant",
  "metadata": {
    "principalId": "assistant:log-analyst",
    "principalType": "assistant",
    "capabilities": ["log.read", "metrics.read"],
    "webhooks": {
      "message": "https://hooks.example.com/message",
      "control": "https://hooks.example.com/control"
    },
    "modelConfig": {
      "provider": "openai",
      "model": "gpt-4"
    }
  }
}
```

---

## Access Control

### Visibility Levels

| Level | Description |
|-------|-------------|
| `public` | Accessible to anyone |
| `org` | Accessible to organization members |
| `private` | Accessible only to explicitly granted principals |

### Access Policy Structure

```json
{
  "visibility": "org",
  "actions": {
    "read": {"anyOf": ["public", "org:acme-corp"]},
    "write": {"anyOf": ["role:admin", "cap:registry.write"]},
    "publish": {"anyOf": ["role:publisher", "cap:registry.publish"]},
    "sign": {"anyOf": ["cap:registry.sign"]},
    "certify": {"anyOf": ["cap:registry.certify"]},
    "delete": {"anyOf": ["role:admin"]}
  }
}
```

### User Entitlements

Entitlements are derived from the Identity Service:

| Entitlement | Source |
|-------------|--------|
| `public` | Always present |
| `authenticated` | Any logged-in user |
| `role:admin` | User has `isSuperAdmin: true` |
| `role:publisher` | User has role `role:publisher` |
| `cap:registry.write` | User has entitlement `cap:registry.write` |
| `org:<orgId>` | User is member of organization |
| `role:admin:<orgId>` | User is admin of organization |

### Access Evaluation

1. **Super admins** bypass all checks
2. Check **visibility** level (public allows read to anyone)
3. Match user **entitlements** against `accessPolicy.actions[action].anyOf[]`
4. Grant access if any entitlement matches

---

## Configuration

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |

### Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CATALOG_USE_MEMORY_DB` | `false` | Use in-memory PostgreSQL |
| `IDENTITY_SERVICE_URL` | `https://identity.example.com` | Identity service endpoint |
| `CORS_ALLOWED_ORIGINS` | `` | Comma-separated allowed origins |
| `PORT` | `5003` | Server port |
| `ARTIFACT_MAX_SIZE_MB` | `50` | Max artifact upload size |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms) |
| `RATE_LIMIT_WRITE_MAX` | `30` | Write operations limit |
| `RATE_LIMIT_SEARCH_MAX` | `60` | Search operations limit |
| `RATE_LIMIT_UPLOAD_MAX` | `10` | Upload operations limit |

### Rate Limiting

| Operation | Default Limit | Header |
|-----------|---------------|--------|
| Write | 30/minute | `X-RateLimit-Limit` |
| Search | 60/minute | `X-RateLimit-Remaining` |
| Upload | 10/minute | `X-RateLimit-Reset` |

When exceeded, returns `429 Too Many Requests` with `Retry-After` header.

---

## LLM Integration Guide

This section provides guidance for LLMs interacting with the Catalog Service.

### Common Workflows

#### 1. List and Search Resources

```bash
# List all resources
GET /api/resources
Authorization: Bearer <token>

# Filter by type
GET /api/resources?type=component&status=published

# Search by keyword
POST /api/search
Authorization: Bearer <token>
Content-Type: application/json

{
  "query": "authentication",
  "type": "component",
  "status": "published"
}
```

#### 2. Create a Resource

```bash
POST /api/resources
Authorization: Bearer <token>
Content-Type: application/json

{
  "key": "integrations/stripe",
  "name": "Stripe Integration",
  "description": "Payment processing integration",
  "type": "integration",
  "status": "draft",
  "tags": ["payments", "billing"],
  "orgId": "org-uuid",
  "accessPolicy": {
    "visibility": "org",
    "actions": {
      "read": {"anyOf": ["org:org-uuid"]},
      "write": {"anyOf": ["role:admin:org-uuid"]}
    }
  },
  "metadata": {
    "provider": "stripe",
    "version": "2023-10-16"
  }
}
```

#### 3. Publish a Resource

```bash
# Publishing creates an immutable version
POST /api/resources/{id}/publish
Authorization: Bearer <token>
Content-Type: application/json

{
  "changelog": "Initial release with basic payment processing"
}

# Response includes new version
{
  "resource": {..., "status": "published", "currentVersion": 1},
  "version": {
    "id": "version-uuid",
    "version": 1,
    "publishedAt": "2024-01-15T10:30:00Z"
  }
}
```

#### 4. Upload an Artifact

```bash
POST /api/resources/{id}/artifacts
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "handler.js",
  "type": "application/javascript",
  "content": "ZXhwb3J0IGZ1bmN0aW9uIGhhbmRsZXIoKSB7Li4ufQ=="  # base64
}

# Response
{
  "id": "artifact-uuid",
  "name": "handler.js",
  "mimeType": "application/javascript",
  "size": 1234,
  "checksum": "sha256:abc123...",
  "storageUrl": "artifacts/resource-id/handler-abc123.js"
}
```

#### 5. Create a Graph

```bash
POST /api/graphs
Authorization: Bearer <token>
Content-Type: application/json

{
  "key": "workflows/data-pipeline",
  "name": "Data Processing Pipeline",
  "description": "ETL pipeline for customer data",
  "status": "draft",
  "metadata": {
    "graphId": "data-pipeline-v1",
    "components": [
      {
        "id": "extract",
        "componentKey": "data/extract-csv",
        "config": {"delimiter": ","}
      },
      {
        "id": "transform",
        "componentKey": "data/transform-json",
        "config": {}
      },
      {
        "id": "load",
        "componentKey": "data/load-postgres",
        "config": {"table": "customers"}
      }
    ],
    "edges": [
      {"from": {"nodeId": "extract", "port": "output"}, "to": {"nodeId": "transform", "port": "input"}},
      {"from": {"nodeId": "transform", "port": "output"}, "to": {"nodeId": "load", "port": "input"}}
    ]
  }
}
```

#### 6. Create an Executor

```bash
POST /api/executors
Authorization: Bearer <token>
Content-Type: application/json

{
  "key": "executors/csv-extract-node",
  "name": "CSV Extract Node Executor",
  "type": "executor",
  "metadata": {
    "componentKey": "data/extract-csv",
    "componentVersion": "1.0.0",
    "language": "node",
    "runtimeVersion": "20",
    "entrypoint": "extract",
    "determinism": "deterministic",
    "ports": {
      "inputs": [{"name": "path", "type": "string", "required": true}],
      "outputs": [{"name": "records", "type": "array"}]
    }
  }
}

# Then upload the code artifact
POST /api/resources/{executor-id}/artifacts
{
  "name": "handler.js",
  "type": "application/javascript",
  "content": "<base64_code>"
}

# Update executor with artifact reference
PATCH /api/executors/{executor-id}
{
  "metadata": {
    "artifactRef": "<artifact-id>"
  }
}
```

#### 7. Get Bootstrap Resources

```bash
# Get all bootstrap resources (no auth required)
GET /api/bootstrap

# Response
{
  "resources": [
    {
      "id": "uuid",
      "key": "core/identity",
      "name": "Identity Component",
      "type": "component",
      "status": "published",
      "isBootstrap": true,
      "metadata": {...}
    }
  ]
}

# Get aggregated summary
GET /api/bootstrap/summary

# Response
{
  "components": {
    "build": {"count": 5, "items": [...]},
    "integrate": {"count": 3, "items": [...]},
    "intelligence": {"count": 2, "items": [...]}
  },
  "contexts": {
    "architecture": {"count": 2, "items": [...]},
    "identity": {"count": 1, "items": [...]}
  }
}
```

#### 8. Resolve Executor by Component

```bash
# Find executor for a component
GET /api/executors/by-component/ai/llm/openai?version=1.0.0
Authorization: Bearer <token>

# Response
{
  "id": "executor-uuid",
  "key": "executors/openai-node",
  "metadata": {
    "componentKey": "ai/llm/openai",
    "componentVersion": "1.0.0",
    "language": "node",
    "entrypoint": "handler"
  }
}
```

### Request/Response Patterns

#### Standard Success Response
```json
{
  "id": "uuid",
  "key": "...",
  "name": "...",
  ...
}
```

#### List Response
```json
{
  "resources": [...],
  "total": 42
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
| 401 | Unauthorized (no/invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 409 | Conflict (duplicate key) |
| 429 | Rate Limited |
| 500 | Internal Server Error |

### Validation Rules

| Field | Rule |
|-------|------|
| `key` | Unique, alphanumeric with `/`, `-`, `_` |
| `type` | One of: `component`, `context`, `integration`, `graph`, `executor`, `assistant` |
| `status` | One of: `draft`, `published`, `deprecated` |
| `visibility` | One of: `public`, `org`, `private` |

### Best Practices for LLMs

1. **Always check permissions** before attempting write operations
2. **Use type-specific endpoints** (e.g., `/api/graphs`) for cleaner code
3. **Include changelog** when publishing for audit trail
4. **Use bootstrap endpoints** for initialization data (no auth required)
5. **Check rate limits** via `/api/rate-limits` before bulk operations
6. **Use search** for finding resources by keyword
7. **Reference components by key** in executors and graphs
8. **Validate artifact content** before uploading (size, MIME type)
9. **Use org scoping** (`orgId`) for multi-tenant resources
10. **Set appropriate visibility** in accessPolicy

### Integration Checklist

- [ ] Authenticate via Identity Service token
- [ ] Handle 401/403 by refreshing token or checking permissions
- [ ] Implement exponential backoff for rate limits
- [ ] Use bootstrap endpoints for public resources
- [ ] Validate resource keys are unique before creating
- [ ] Include meaningful changelogs when publishing
- [ ] Upload artifacts before referencing them in executors
- [ ] Check executor exists before using in graphs

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
