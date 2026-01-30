# @symbia/md - Documentation Generation Library

Documentation generation, OpenAPI tooling, and LLM-ready documentation serving for Symbia services. Converts OpenAPI specs to markdown for both human and LLM consumption.

## Capabilities

| Capability | Description |
|------------|-------------|
| LLM Documentation | Generate llms.txt and llms-full.txt formats |
| OpenAPI Support | Full OpenAPI 3.0.x specification support |
| Build-Time Generation | Static file generation during build |
| Runtime Serving | Express middleware for documentation endpoints |
| Discovery Routes | Standard and .well-known endpoint support |
| Type-Safe | Full TypeScript interfaces for OpenAPI |

## Quick Start

### Installation

```bash
npm install @symbia/md
```

### Build-Time Generation

```typescript
// scripts/build-docs.ts
import { generateDocs } from "@symbia/md";
import { apiSpec } from "../server/src/openapi.js";

await generateDocs({
  spec: apiSpec,
  serviceName: "My Service",
  serviceDescription: "Service description for LLM context.",
  overviewPoints: [
    "Feature one",
    "Feature two",
  ],
  authNotes: [
    "Bearer token authentication",
    "API key authentication",
  ],
});
```

### Runtime Serving

```typescript
// server/src/app.ts
import { registerDocRoutes } from "@symbia/md";
import { apiSpec } from "./openapi.js";

registerDocRoutes(app, {
  spec: apiSpec,
  includeWellKnown: true,
});
```

## Architecture

### Directory Structure

```
symbia-md/
├── src/
│   ├── index.ts          # Package exports
│   ├── types.ts          # TypeScript interfaces
│   ├── generators.ts     # Document generation
│   ├── routes.ts         # Express route handlers
│   └── build.ts          # Build-time utilities
├── dist/                 # Compiled JavaScript + types
├── package.json
└── tsconfig.json
```

### Generated Output

```
docs/
├── openapi.json          # OpenAPI 3.0.x specification
├── llms.txt              # Concise LLM documentation
└── llms-full.txt         # Complete LLM documentation
```

## API Reference

### generateDocs(config)

Generate documentation files at build time.

```typescript
async function generateDocs(config: BuildDocsConfig): Promise<void>
```

**BuildDocsConfig:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `spec` | `OpenAPISpec` | Required | OpenAPI specification object |
| `serviceName` | `string` | Required | Service display name |
| `serviceDescription` | `string` | Required | Brief description |
| `overviewPoints` | `string[]` | `[]` | Feature bullet points |
| `authNotes` | `string[]` | `[]` | Authentication methods |
| `customHeaders` | `HeaderDoc[]` | `[]` | Custom header documentation |
| `rateLimits` | `RateLimit[]` | `[]` | Rate limiting info |
| `additionalSections` | `Section[]` | `[]` | Custom sections |
| `outputDir` | `string` | `"docs"` | Output directory |
| `verbose` | `boolean` | `true` | Log progress |

**Example:**

```typescript
await generateDocs({
  spec: apiDocumentation,
  serviceName: "Identity Service",
  serviceDescription: "Authentication and authorization service.",
  overviewPoints: [
    "User authentication (register, login, password reset)",
    "Organization management with RBAC",
    "API key management",
  ],
  customHeaders: [
    { name: "X-Org-Id", description: "Organization ID for multi-tenant scoping" },
    { name: "X-Service-Id", description: "Service identifier" },
  ],
  authNotes: [
    "Cookie-based session (token cookie)",
    "Bearer token (Authorization header)",
    "API key (X-API-Key header)",
  ],
  rateLimits: [
    { category: "Standard", limit: "100 requests/minute" },
    { category: "Auth", limit: "10 requests/minute" },
  ],
  additionalSections: [
    {
      title: "Service-to-Service Auth",
      content: "Use POST /api/auth/introspect to validate tokens.",
    },
  ],
});
```

### registerDocRoutes(app, config)

Register documentation endpoints with Express.

```typescript
function registerDocRoutes(app: Express, config: DocRoutesConfig): void
```

**DocRoutesConfig:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `spec` | `OpenAPISpec` | Required | OpenAPI spec for fallback |
| `docsRoot` | `string` | `"client/public"` | Static files directory |
| `includeWellKnown` | `boolean` | `false` | Enable .well-known routes |
| `wellKnownRoutes` | `Record<string, Handler>` | `{}` | Custom .well-known handlers |

**Registered Routes:**

| Route | Content | Purpose |
|-------|---------|---------|
| `/` | Redirect to `/docs/llms.txt` | Root documentation |
| `/docs/openapi.json` | OpenAPI spec | Machine-readable API |
| `/docs/llms.txt` | Short LLM docs | Quick reference |
| `/docs/llms-full.txt` | Full LLM docs | Complete reference |
| `/api/docs/openapi.json` | Redirect | Alternate endpoint |
| `/api/docs` | Redirect | Generic docs |
| `/openapi.json` | Redirect | Standard path |
| `/llms.txt` | Redirect | Shorthand |
| `/llm.txt` | Redirect | Alternate shorthand |
| `/llms-full.txt` | Redirect | Direct full docs |
| `/.well-known/openapi.json` | Redirect | Discovery (optional) |

### generateLlmsShort(spec, config)

Generate concise LLM documentation.

```typescript
function generateLlmsShort(spec: OpenAPISpec, config: DocGenerationConfig): string
```

**Output Structure:**

```markdown
# Service Title
> Brief description

## Overview
Service description + feature list

## API Base URL
Base URL reference

## Quick Reference
- GET /api/users - List users
- POST /api/users - Create user
- GET /api/users/{id} - Get user

## Authentication
Authentication methods

## Custom Headers
Header documentation

## Rate Limits
Rate limiting info

## Documentation
- OpenAPI: /docs/openapi.json
- Full Reference: /docs/llms-full.txt
```

### generateLlmsFull(spec, config)

Generate complete LLM documentation.

```typescript
function generateLlmsFull(spec: OpenAPISpec, config: DocGenerationConfig): string
```

**Output Structure:**

```markdown
# Service Title - Complete Documentation
> Description

## Overview
Full service description

## Custom Headers
Detailed header documentation

## API Reference
Base URL: https://api.example.com

### Users
User management endpoints

#### GET /api/users
List all users

**Query Parameters:**
- `limit` (number, optional): Maximum results
- `offset` (number, optional): Pagination offset

**Response:** List of user objects

#### POST /api/users
Create a new user

**Request Body:**
```json
{
  "email": "string",
  "name": "string"
}
```

**Response:** Created user object

## Data Models

### User
```typescript
interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}
```

## Rate Limits
Rate limiting information

## Authentication
Detailed auth methods

## [Custom Sections]
User-defined content

## Documentation
Links to other docs
```

## TypeScript Types

### OpenAPISpec

```typescript
interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{
    url: string;
    description?: string;
  }>;
  paths: Record<string, Record<string, PathOperation>>;
  components?: {
    schemas?: Record<string, SchemaObject>;
    securitySchemes?: Record<string, SecurityScheme>;
  };
  tags?: Array<{
    name: string;
    description?: string;
  }>;
  security?: Array<Record<string, string[]>>;
}
```

### PathOperation

```typescript
interface PathOperation {
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses?: Record<string, Response>;
  security?: Array<Record<string, string[]>>;
}
```

### Parameter

```typescript
interface Parameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  description?: string;
  required?: boolean;
  schema?: SchemaObject;
}
```

### SchemaObject

```typescript
interface SchemaObject {
  type?: string;
  properties?: Record<string, SchemaObject>;
  required?: string[];
  description?: string;
  enum?: any[];
  items?: SchemaObject;
  $ref?: string;
}
```

### DocGenerationConfig

```typescript
interface DocGenerationConfig {
  serviceName: string;
  serviceDescription: string;
  overviewPoints?: string[];
  authNotes?: string[];
  customHeaders?: Array<{
    name: string;
    description: string;
  }>;
  rateLimits?: Array<{
    category: string;
    limit: string;
  }>;
  additionalSections?: Array<{
    title: string;
    content: string;
  }>;
}
```

## Services Using This Package

All Symbia microservices use this package:

| Service | Documentation Path |
|---------|-------------------|
| Identity | `/docs/llms.txt` |
| Catalog | `/docs/llms.txt` |
| Logging | `/docs/llms.txt` |
| Messaging | `/docs/llms.txt` |
| Assistants | `/docs/llms.txt` |
| Network | `/docs/llms.txt` |
| Server | `/docs/llms.txt` |
| Runtime | `/docs/llms.txt` |

## Integration Pattern

### 1. Define OpenAPI Spec

```typescript
// server/src/openapi.ts
import type { OpenAPISpec } from "@symbia/md";

export const apiDocumentation: OpenAPISpec = {
  openapi: "3.0.3",
  info: {
    title: "My Service API",
    version: "1.0.0",
    description: "Service description",
  },
  servers: [
    { url: "http://localhost:5001", description: "Development" },
  ],
  paths: {
    "/api/items": {
      get: {
        summary: "List items",
        tags: ["Items"],
        responses: {
          "200": { description: "List of items" },
        },
      },
    },
  },
  components: {
    schemas: {
      Item: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
        },
      },
    },
  },
};
```

### 2. Build Script

```typescript
// scripts/build-docs.ts
import { generateDocs } from "@symbia/md";
import { apiDocumentation } from "../server/src/openapi.js";

await generateDocs({
  spec: apiDocumentation,
  serviceName: "My Service",
  serviceDescription: "Description for LLMs.",
  overviewPoints: ["Feature 1", "Feature 2"],
});

console.log("Documentation generated!");
```

### 3. Register Routes

```typescript
// server/src/app.ts
import express from "express";
import { registerDocRoutes } from "@symbia/md";
import { apiDocumentation } from "./openapi.js";

const app = express();

registerDocRoutes(app, {
  spec: apiDocumentation,
  includeWellKnown: true,
});

// ... other routes
```

### 4. Package.json Script

```json
{
  "scripts": {
    "build:docs": "tsx scripts/build-docs.ts",
    "build": "npm run build:docs && tsc"
  }
}
```

## LLM Integration Guide

### Fetching Documentation

```bash
# Get concise documentation
curl https://api.example.com/docs/llms.txt

# Get complete documentation
curl https://api.example.com/docs/llms-full.txt

# Get OpenAPI spec
curl https://api.example.com/docs/openapi.json
```

### Documentation Format

The `llms.txt` format is optimized for LLM consumption:

- **Plain text** - No complex formatting
- **Structured sections** - Clear hierarchy
- **Endpoint listing** - METHOD /path format
- **Type information** - TypeScript-style schemas
- **Authentication details** - How to authenticate
- **Rate limits** - Usage constraints

### Best Practices for LLMs

1. **Start with llms.txt** - Quick overview of capabilities
2. **Use llms-full.txt** - When detailed parameter info needed
3. **Reference openapi.json** - For programmatic API access
4. **Check authentication** - Review auth section before requests
5. **Note rate limits** - Respect documented limits

### Example LLM Workflow

```
1. Fetch /docs/llms.txt
2. Parse available endpoints
3. Identify required endpoint
4. Fetch /docs/llms-full.txt for details
5. Extract parameters and request format
6. Make authenticated API request
```

## Integration Checklist

- [ ] Define OpenAPI spec in `server/src/openapi.ts`
- [ ] Create build script using `generateDocs()`
- [ ] Add `build:docs` script to package.json
- [ ] Register routes with `registerDocRoutes()`
- [ ] Enable `.well-known` routes if needed
- [ ] Document custom headers in config
- [ ] Document authentication methods
- [ ] Add service-specific sections
- [ ] Test all documentation endpoints
- [ ] Verify LLM-friendly output format
