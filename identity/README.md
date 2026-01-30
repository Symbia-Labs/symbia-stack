# Symbia Identity Service

The Identity Service is the central authentication, authorization, and identity management system for the Symbia platform. It provides user and agent authentication, organization management, API key management, and entitlement-based access control.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Authentication](#authentication)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Configuration](#configuration)
- [LLM Integration Guide](#llm-integration-guide)

---

## Overview

### Core Capabilities

| Capability | Description |
|------------|-------------|
| `identity.auth.login` | User and agent authentication |
| `identity.auth.logout` | Session termination |
| `identity.auth.introspect` | Token validation (RFC 7662) |
| `identity.user.create` | User registration |
| `identity.user.read` | User profile access |
| `identity.org.manage` | Organization CRUD operations |
| `identity.apikey.manage` | API key lifecycle management |

### Principal Types

The service supports two types of principals:

1. **Users** - Human actors with email/password credentials
2. **Agents** - AI/bot actors with agentId/credential credentials

Both principal types receive JWT tokens and can be validated via the same introspection endpoint.

### Hierarchy Model

```
Organization
└── Project
    ├── Application (web, mobile, api, cli)
    └── Service (database, api, auth, storage, messaging, analytics)
```

---

## Quick Start

### Environment Variables

```bash
# Required
SESSION_SECRET=<32+ character random string>
DATABASE_URL=postgresql://user:pass@host:5432/dbname
NODE_ENV=development|production

# Optional
IDENTITY_USE_MEMORY_DB=true          # Use in-memory DB for testing
PORT=5001                             # Default port
EMAIL_ENABLED=true                    # Enable password reset emails
```

### Running the Service

```bash
# Development
npm run dev

# Production
npm run build && npm run start

# Seed test data
npm run seed
```

### Default Test Credentials (Memory DB)

```
Email: admin@example.com
Password: password123
```

---

## Architecture

### Directory Structure

```
identity/
├── server/src/
│   ├── index.ts          # Entry point
│   ├── routes.ts         # All API endpoints
│   ├── storage.ts        # Data access layer
│   ├── db.ts             # Database initialization
│   ├── email.ts          # Gmail integration
│   └── seed.ts           # Test data seeding
├── shared/
│   └── schema.ts         # Drizzle ORM schema
├── docs/
│   ├── openapi.json      # OpenAPI specification
│   ├── llms.txt          # Quick LLM reference
│   └── llms-full.txt     # Full LLM documentation
└── Dockerfile            # Production container
```

### Technology Stack

- **Runtime:** Node.js 20
- **Framework:** Express.js 4.21
- **Database:** PostgreSQL with Drizzle ORM
- **Authentication:** JWT (HS256) + bcrypt
- **Validation:** Zod schemas

---

## Authentication

### JWT Token Structure

```typescript
// User Token
{
  sub: string,      // User ID (UUID)
  type: 'user',
  email: string,
  name: string
}

// Agent Token
{
  sub: string,      // Agent ID (UUID)
  type: 'agent',
  agentId: string,  // Format: "service:name"
  name: string,
  orgId?: string    // Optional org scope
}
```

**Token Expiration:** 7 days

### Authentication Methods

| Method | Header/Cookie | Example |
|--------|---------------|---------|
| Bearer Token | `Authorization: Bearer <token>` | `Bearer eyJ...` |
| Cookie | `token=<token>` | Set automatically on login |
| API Key | `X-API-Key: <key>` | 32+ character key |

### Token Introspection (Service-to-Service)

```bash
POST /api/auth/introspect
Content-Type: application/json

{"token": "<jwt_token>"}
```

Response:
```json
{
  "active": true,
  "sub": "user_id",
  "type": "user",
  "email": "user@example.com",
  "organizations": [
    {"id": "org_id", "name": "Company", "role": "admin"}
  ],
  "entitlements": ["cap:registry.write"],
  "roles": ["role:admin"]
}
```

### API Key Verification

```bash
POST /api/auth/verify-api-key
Content-Type: application/json

{"apiKey": "<api_key>"}
```

Response:
```json
{
  "valid": true,
  "keyId": "key_uuid",
  "orgId": "org_uuid",
  "scopes": ["read", "write"],
  "creator": {"id": "user_id", "name": "John"}
}
```

---

## API Reference

### Authentication Endpoints

#### User Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/user/register` | Register new user | No |
| POST | `/api/auth/user/login` | Login user | No |
| POST | `/api/auth/user/refresh` | Refresh user token | Yes |
| POST | `/api/auth/logout` | Logout (clear cookie) | Yes |
| POST | `/api/auth/forgot-password` | Request password reset | No |
| POST | `/api/auth/reset-password` | Reset with token | No |

#### Agent Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/agent/register` | Register new agent | No |
| POST | `/api/auth/agent/login` | Login agent | No |
| POST | `/api/auth/agent/refresh` | Refresh agent token | Yes |
| GET | `/api/auth/agent/me` | Get current agent | Yes |

#### Unified Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/auth/me` | Get current principal | Yes |
| POST | `/api/auth/introspect` | Validate token (RFC 7662) | No |
| POST | `/api/auth/refresh` | Auto-detect and refresh | Yes |
| POST | `/api/auth/verify-api-key` | Verify API key | No |

### User Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/me` | Get current user profile |
| PATCH | `/api/users/me` | Update profile (name, email) |
| POST | `/api/users/me/password` | Change password |

### Organization Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orgs` | List user's organizations |
| POST | `/api/orgs` | Create organization |
| GET | `/api/orgs/:id` | Get organization details |
| POST | `/api/orgs/:id/members/invite` | Invite member |
| PATCH | `/api/orgs/:orgId/members/:memberId` | Update member role |
| DELETE | `/api/orgs/:orgId/members/:memberId` | Remove member |

### Project Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orgs/:orgId/projects` | List projects |
| POST | `/api/orgs/:orgId/projects` | Create project |
| GET | `/api/projects/:projectId` | Get project |
| PATCH | `/api/projects/:projectId` | Update project |
| DELETE | `/api/projects/:projectId` | Delete project |

### Application Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects/:projectId/applications` | List applications |
| POST | `/api/projects/:projectId/applications` | Create application |
| GET | `/api/applications/:appId` | Get application |
| PATCH | `/api/applications/:appId` | Update application |
| DELETE | `/api/applications/:appId` | Delete application |

### Service Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects/:projectId/services` | List services |
| POST | `/api/projects/:projectId/services` | Create service |
| GET | `/api/services/:serviceId` | Get service |
| PATCH | `/api/services/:serviceId` | Update service |
| DELETE | `/api/services/:serviceId` | Delete service |
| POST | `/api/applications/:appId/services/:serviceId` | Link service to app |
| DELETE | `/api/applications/:appId/services/:serviceId` | Unlink service |

### API Key Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/api-keys` | List your API keys |
| POST | `/api/api-keys` | Create API key |
| GET | `/api/api-keys/:id` | Get key details |
| POST | `/api/api-keys/:id/revoke` | Revoke key |
| POST | `/api/api-keys/:id/rotate` | Rotate key |
| DELETE | `/api/api-keys/:id` | Delete key |

### Entitlements

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/scoped-entitlements/:scopeType/:scopeId` | Get entitlements |
| POST | `/api/scoped-entitlements` | Create entitlement |
| PATCH | `/api/scoped-entitlements/:id` | Update entitlement |
| DELETE | `/api/scoped-entitlements/:id` | Delete entitlement |
| GET | `/api/license/:orgId` | Get license status |

### Entity Directory

Entities are canonical identities (users, agents, services) addressable across the platform.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/entities` | List entities (filterable by orgId, type, status) |
| GET | `/api/entities/:id` | Get entity by ID |
| POST | `/api/entities` | Create new entity |
| PATCH | `/api/entities/:id` | Update entity |
| POST | `/api/entities/resolve` | Resolve address to entity UUID(s) |
| POST | `/api/entities/:id/bind` | Bind entity to network node |
| POST | `/api/entities/:id/unbind` | Unbind entity from network node |
| GET | `/api/entities/by-node/:nodeId` | Get entity by bound node ID |
| POST | `/api/entities/sync` | Sync entities from users/agents (admin) |

**Create Entity:**
```json
{
  "slug": "log-analyst",
  "type": "assistant",
  "status": "active",
  "orgId": "org_uuid",
  "instanceId": "default",
  "displayName": "Log Analyst Assistant",
  "metadata": { "version": "1.0" }
}
```

**Resolve Address:**
```bash
POST /api/entities/resolve
{"address": "@assistant:log-analyst"}
# or multi-resolve
{"addresses": ["@assistant:log-analyst", "@user:admin"]}
```

### Credentials Management

Store and retrieve third-party API credentials (encrypted at rest).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/credentials` | List user's credentials (metadata only) |
| POST | `/api/credentials` | Create/store a credential |
| DELETE | `/api/credentials/:id` | Delete a credential |
| GET | `/api/internal/credentials/:userId/:provider` | Internal: fetch credential (service-to-service) |

**Store Credential:**
```json
{
  "provider": "openai",
  "name": "OpenAI API Key",
  "credential": "sk-...",
  "orgId": "org_uuid",
  "isOrgWide": true,
  "metadata": { "model": "gpt-4" }
}
```

**Response:**
```json
{
  "id": "cred_uuid",
  "provider": "openai",
  "name": "OpenAI API Key",
  "credentialPrefix": "sk-...",
  "isOrgWide": true,
  "createdAt": "2024-01-15T10:30:00Z"
}
```

### Admin Endpoints (Super Admin Only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List all users |
| PATCH | `/api/admin/users/:id` | Update user |
| DELETE | `/api/admin/users/:id` | Delete user |
| GET | `/api/admin/orgs` | List all organizations |
| PATCH | `/api/admin/orgs/:id` | Update organization |
| DELETE | `/api/admin/orgs/:id` | Delete organization |
| GET | `/api/admin/plans` | List all plans |
| POST | `/api/admin/plans` | Create plan |
| PATCH | `/api/admin/plans/:id` | Update plan |
| GET | `/api/admin/users/:userId/entitlements` | User entitlements |
| POST | `/api/admin/users/:userId/entitlements` | Grant entitlement |
| DELETE | `/api/admin/users/:userId/entitlements/:key` | Revoke entitlement |
| GET | `/api/admin/users/:userId/roles` | User roles |
| POST | `/api/admin/users/:userId/roles` | Grant role |
| DELETE | `/api/admin/users/:userId/roles/:key` | Revoke role |
| GET | `/api/admin/audit-logs` | Get audit logs |

### Health & Discovery

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Quick health check |
| GET | `/health/ready` | Readiness with DB check |
| GET | `/api/bootstrap/service` | Service discovery |
| GET | `/api/auth/config` | Auth configuration |

### Documentation Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/docs/openapi.json` | OpenAPI specification |
| GET | `/.well-known/openapi.json` | Standard OpenAPI location |
| GET | `/llms.txt` | Quick LLM reference |
| GET | `/llms-full.txt` | Full LLM documentation |
| GET | `/.well-known/jwks.json` | JWKS for token validation |

---

## Database Schema

### Core Tables

#### users
```sql
id: varchar (UUID, PK)
email: text (unique)
passwordHash: text
name: text
isSuperAdmin: boolean (default: false)
createdAt: timestamp
updatedAt: timestamp
```

#### agents
```sql
id: varchar (UUID, PK)
agentId: text (unique, format: "service:name")
credentialHash: text
name: text
orgId: varchar (FK organizations, optional)
capabilities: json (array)
metadata: json
isActive: boolean (default: true)
lastSeenAt: timestamp
createdAt: timestamp
updatedAt: timestamp
```

#### organizations
```sql
id: varchar (UUID, PK)
name: text
slug: text (unique, lowercase alphanumeric)
planId: varchar (FK plans, nullable)
createdAt: timestamp
```

#### memberships
```sql
id: varchar (UUID, PK)
userId: varchar (FK users)
orgId: varchar (FK organizations)
role: text ("admin" | "member" | "viewer")
createdAt: timestamp
```

#### projects
```sql
id: varchar (UUID, PK)
orgId: varchar (FK organizations)
name: text
slug: text
description: text (nullable)
status: text ("active" | "archived" | "suspended")
createdAt: timestamp
```

#### applications
```sql
id: varchar (UUID, PK)
projectId: varchar (FK projects)
orgId: varchar (FK organizations)
name: text
slug: text
environment: text ("development" | "staging" | "production")
appType: text ("web" | "mobile" | "api" | "cli")
repoUrl: text (nullable)
metadataJson: json
createdAt: timestamp
```

#### services
```sql
id: varchar (UUID, PK)
projectId: varchar (FK projects)
orgId: varchar (FK organizations)
name: text
serviceType: text ("database" | "api" | "auth" | "storage" | "messaging" | "analytics")
provider: text (nullable)
endpointUrl: text (nullable)
externalId: text (nullable)
status: text ("active" | "inactive" | "error")
metadataJson: json
createdAt: timestamp
```

#### api_keys
```sql
id: varchar (UUID, PK)
name: text
keyHash: text
keyPrefix: text (first 8 chars)
orgId: varchar (FK organizations, nullable)
createdBy: varchar (FK users)
scopes: json (array)
expiresAt: timestamp (nullable)
lastUsedAt: timestamp (nullable)
revokedAt: timestamp (nullable)
createdAt: timestamp
```

#### scoped_entitlements
```sql
id: varchar (UUID, PK)
orgId: varchar (FK organizations)
scopeType: text ("org" | "project" | "application" | "service")
scopeId: varchar
trancheId: varchar (FK entitlement_tranches, nullable)
featureKey: text
quota: integer (default: 0)
consumed: integer (default: 0)
enabled: boolean (default: true)
expiresAt: timestamp (nullable)
metadataJson: json
createdAt: timestamp
```

#### user_entitlements
```sql
id: varchar (UUID, PK)
userId: varchar (FK users)
entitlementKey: text (e.g., "cap:registry.write")
grantedBy: varchar (FK users, nullable)
expiresAt: timestamp (nullable)
createdAt: timestamp
```

#### user_roles
```sql
id: varchar (UUID, PK)
userId: varchar (FK users)
roleKey: text (e.g., "role:admin")
grantedBy: varchar (FK users, nullable)
expiresAt: timestamp (nullable)
createdAt: timestamp
```

#### plans
```sql
id: varchar (UUID, PK)
name: text (unique)
featuresJson: json
limitsJson: json
priceCents: integer
```

#### audit_logs
```sql
id: varchar (UUID, PK)
userId: varchar (FK users, nullable)
orgId: varchar (FK organizations, nullable)
action: text
resource: text
resourceId: varchar (nullable)
metadataJson: json
createdAt: timestamp
```

---

## Configuration

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SESSION_SECRET` | JWT signing secret (32+ chars) | `your-very-long-secret-key-here-xxxx` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/identity` |
| `NODE_ENV` | Environment mode | `development` or `production` |

### Optional Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `IDENTITY_USE_MEMORY_DB` | Use in-memory PostgreSQL | `false` |
| `PORT` | Service port | `5001` |
| `EMAIL_ENABLED` | Enable password reset emails | auto-detected |
| `IDENTITY_BASE_URL` | Base URL for reset links | `http://localhost:5001` |

---

## LLM Integration Guide

This section provides guidance for LLMs interacting with the Identity Service.

### Common Workflows

#### 1. User Registration and Login

```bash
# Register a new user
POST /api/auth/user/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword123",  # Min 8 characters
  "name": "John Doe"
}

# Response
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "token": "eyJ..."
}
```

```bash
# Login
POST /api/auth/user/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

#### 2. Agent Registration and Login

```bash
# Register an AI agent
POST /api/auth/agent/register
Content-Type: application/json

{
  "agentId": "assistant:onboarding",
  "credential": "very_long_secure_credential_at_least_32_characters_xxxxx",
  "name": "Onboarding Assistant",
  "orgId": "optional_org_uuid",
  "capabilities": ["cap:messaging.send", "cap:org.read"],
  "metadata": {"version": "1.0", "model": "gpt-4"}
}

# Response
{
  "agent": {
    "id": "uuid",
    "agentId": "assistant:onboarding",
    "name": "Onboarding Assistant",
    "capabilities": ["cap:messaging.send", "cap:org.read"]
  },
  "token": "eyJ..."
}
```

```bash
# Agent login
POST /api/auth/agent/login
Content-Type: application/json

{
  "agentId": "assistant:onboarding",
  "credential": "very_long_secure_credential_at_least_32_characters_xxxxx"
}
```

#### 3. Creating Organization Hierarchy

```bash
# Create organization
POST /api/orgs
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Acme Corp",
  "slug": "acme-corp"  # Lowercase alphanumeric with dashes
}

# Create project under org
POST /api/orgs/{orgId}/projects
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Main API",
  "slug": "main-api",
  "description": "Production API service"
}

# Create application under project
POST /api/projects/{projectId}/applications
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Web Dashboard",
  "slug": "web-dashboard",
  "environment": "production",
  "appType": "web",
  "repoUrl": "https://github.com/acme/dashboard"
}

# Create service under project
POST /api/projects/{projectId}/services
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "PostgreSQL Primary",
  "serviceType": "database",
  "provider": "aws",
  "endpointUrl": "postgresql://..."
}

# Link service to application
POST /api/applications/{appId}/services/{serviceId}
Authorization: Bearer <token>
```

#### 4. Token Validation (Service-to-Service)

```bash
# Validate any token (user or agent)
POST /api/auth/introspect
Content-Type: application/json

{
  "token": "eyJ..."
}

# Response includes full principal context
{
  "active": true,
  "sub": "user_or_agent_id",
  "type": "user",  # or "agent"
  "email": "user@example.com",
  "organizations": [
    {
      "id": "org_uuid",
      "name": "Acme Corp",
      "slug": "acme-corp",
      "role": "admin"
    }
  ],
  "entitlements": ["cap:registry.write"],
  "roles": ["role:admin"]
}
```

#### 5. API Key Management

```bash
# Create API key
POST /api/api-keys
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "CI/CD Pipeline",
  "scopes": ["read", "deploy"],
  "expiresAt": "2025-12-31T23:59:59Z"
}

# Response (full key only shown once!)
{
  "id": "uuid",
  "name": "CI/CD Pipeline",
  "key": "sk_test_example_key_replace_with_real",
  "keyPrefix": "sk_test_",
  "scopes": ["read", "deploy"]
}

# Verify API key (service-to-service)
POST /api/auth/verify-api-key
Content-Type: application/json

{
  "apiKey": "sk_test_example_key_replace_with_real"
}
```

#### 6. Managing Entitlements

```bash
# Get entitlements for an org
GET /api/scoped-entitlements/org/{orgId}
Authorization: Bearer <token>

# Create feature quota
POST /api/scoped-entitlements
Authorization: Bearer <token>
Content-Type: application/json

{
  "scopeType": "org",
  "scopeId": "org_uuid",
  "featureKey": "api_calls",
  "quota": 10000,
  "enabled": true,
  "expiresAt": "2025-12-31T23:59:59Z"
}

# Check license status
GET /api/license/{orgId}
Authorization: Bearer <token>
```

### Request/Response Patterns

#### Standard Success Response
```json
{
  "data": {...},
  "message": "Operation successful"
}
```

#### Standard Error Response
```json
{
  "message": "Error description",
  "code": "ERROR_CODE"
}
```

#### Common HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation failed) |
| 401 | Unauthorized (no/invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 409 | Conflict (duplicate resource) |
| 429 | Rate Limited |
| 500 | Internal Server Error |

### Validation Rules

| Field | Rule |
|-------|------|
| `email` | Valid email format |
| `password` | Minimum 8 characters |
| `credential` (agent) | Minimum 32 characters |
| `slug` | Lowercase alphanumeric with dashes |
| `agentId` | Format: `service:name` |
| `role` | One of: `admin`, `member`, `viewer` |
| `environment` | One of: `development`, `staging`, `production` |
| `appType` | One of: `web`, `mobile`, `api`, `cli` |
| `serviceType` | One of: `database`, `api`, `auth`, `storage`, `messaging`, `analytics` |
| `scopeType` | One of: `org`, `project`, `application`, `service` |

### Rate Limits

| Endpoint Category | Limit |
|-------------------|-------|
| Auth endpoints | 10 requests/minute/IP |
| Admin endpoints | 30 requests/minute/IP |
| General API | No explicit limit |

### Best Practices for LLMs

1. **Always validate tokens** before making requests on behalf of users
2. **Use token introspection** (`/api/auth/introspect`) to get complete principal context
3. **Check entitlements** before allowing feature access
4. **Handle 401/403 errors** by prompting for re-authentication
5. **Store tokens securely** - never log full tokens or API keys
6. **Use agent authentication** for AI/bot actors, not user auth
7. **Prefer API keys** for programmatic access with defined scopes
8. **Check organization membership** before accessing org resources

### Integration Checklist

- [ ] Implement token storage (secure, HttpOnly cookies preferred)
- [ ] Handle token refresh before expiration (7 days)
- [ ] Implement proper error handling for auth failures
- [ ] Use introspection for service-to-service auth
- [ ] Validate API keys for external integrations
- [ ] Check entitlements for feature gating
- [ ] Log audit-relevant actions
- [ ] Handle rate limiting with exponential backoff

---

## Additional Resources

- **OpenAPI Spec:** `/docs/openapi.json`
- **Quick Reference:** `/llms.txt`
- **Full Documentation:** `/llms-full.txt`
- **Health Check:** `/health`
- **Service Discovery:** `/api/bootstrap/service`

---

## License

MIT License - see [LICENSE](../LICENSE) for details.
