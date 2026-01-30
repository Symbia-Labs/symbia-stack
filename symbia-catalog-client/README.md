# @symbia/catalog-client - Catalog Service Client

Type-safe REST API client for the Symbia Catalog Service. Provides simplified access to resources, components, graphs, executors, and assistants.

## Capabilities

| Capability | Description |
|------------|-------------|
| Type-Safe API | Full TypeScript interfaces for all resources |
| Zero Dependencies | Pure fetch-based implementation |
| Authentication | Bearer token and API key support |
| Multi-Tenant | Organization and service isolation |
| Resource Types | Components, graphs, executors, assistants, contexts, integrations |
| Search | Keyword and natural language search |
| Versioning | Version history and artifact management |

## Quick Start

### Installation

```bash
npm install @symbia/catalog-client
```

### Basic Usage

```typescript
import { createCatalogClient } from "@symbia/catalog-client";

const catalog = createCatalogClient({
  endpoint: "http://localhost:5003",
  token: process.env.CATALOG_TOKEN,
});

// Get published assistants
const assistants = await catalog.getPublishedAssistants();

// Search resources
const results = await catalog.search({
  query: "log analysis",
  type: "assistant",
  status: "published",
});

// Get specific resource
const resource = await catalog.getResource("resource-id");
```

### Environment Variables

```bash
CATALOG_ENDPOINT=http://localhost:5003
CATALOG_SERVICE_TOKEN=your-jwt-token
CATALOG_API_KEY=your-api-key
CATALOG_ORG_ID=org-123
SERVICE_ID=my-service
NODE_ENV=development
```

## Architecture

### Directory Structure

```
symbia-catalog-client/
├── src/
│   ├── index.ts          # Main exports
│   ├── client.ts         # CatalogClient class
│   └── types.ts          # TypeScript interfaces
├── dist/                 # Compiled JavaScript + types
├── examples/
│   └── assistant-loader-example.ts
└── package.json
```

### Package Exports

```typescript
// Main entry
import { createCatalogClient, CatalogClient } from "@symbia/catalog-client";

// Direct client access
import { CatalogClient } from "@symbia/catalog-client/client";

// Types only
import type { Resource, AssistantResource } from "@symbia/catalog-client/types";
```

## API Reference

### Configuration

```typescript
interface CatalogClientConfig {
  endpoint?: string;              // Default: http://localhost:5003
  token?: string;                 // JWT Bearer token
  apiKey?: string;                // X-API-Key header
  orgId?: string;                 // Default organization ID
  serviceId?: string;             // Service identifier
  env?: string;                   // Environment (development/production)
  timeout?: number;               // Default: 30000ms
  onError?: (error: Error) => void;  // Error callback
}
```

### createCatalogClient(config?)

Factory function to create a client instance.

```typescript
import { createCatalogClient } from "@symbia/catalog-client";

const catalog = createCatalogClient({
  endpoint: "https://catalog.example.com",
  token: process.env.SERVICE_TOKEN,
  orgId: "org-123",
  onError: (error) => console.warn("Catalog error:", error.message),
});
```

### Request Options

All methods accept optional request options:

```typescript
interface RequestOptions {
  orgId?: string;       // Override default org
  serviceId?: string;   // Override default service
  env?: string;         // Override default env
  signal?: AbortSignal; // For cancellation
}
```

### Bootstrap & Public Endpoints

#### getBootstrap(options?)

Get public bootstrap resources (no auth required).

```typescript
const resources = await catalog.getBootstrap();
```

#### getBootstrapSummary(options?)

Get categorized bootstrap summary.

```typescript
const summary = await catalog.getBootstrapSummary();
// {
//   components: { count: 10, items: [...] },
//   graphs: { count: 5, items: [...] },
//   assistants: { count: 3, items: [...] },
//   ...
// }
```

#### health()

Check service health.

```typescript
const health = await catalog.health();
// { status: "ok", timestamp: "..." }
```

#### getStats(options?)

Get service statistics.

```typescript
const stats = await catalog.getStats();
// { totalResources: 100, byType: {...}, byStatus: {...} }
```

### Generic Resource Operations

#### listResources(params?, options?)

List resources with filters.

```typescript
const resources = await catalog.listResources({
  type: "component",
  status: "published",
  tags: ["core"],
  limit: 50,
  offset: 0,
});
```

#### getResource(id, options?)

Get resource by ID.

```typescript
const resource = await catalog.getResource("resource-id");
// Returns null if not found
```

#### getResourceByKey(key, options?)

Get resource by unique key.

```typescript
const resource = await catalog.getResourceByKey("symbia.core.http-request");
```

#### createResource(params, options?)

Create a new resource.

```typescript
const resource = await catalog.createResource({
  key: "my-component",
  name: "My Component",
  type: "component",
  description: "A custom component",
  metadata: {
    ports: {
      inputs: [{ id: "input", type: "string" }],
      outputs: [{ id: "output", type: "string" }],
    },
  },
});
```

#### updateResource(id, params, options?)

Update an existing resource.

```typescript
const updated = await catalog.updateResource("resource-id", {
  name: "Updated Name",
  description: "Updated description",
});
```

#### deleteResource(id, options?)

Delete a resource.

```typescript
await catalog.deleteResource("resource-id");
```

#### publishResource(id, changelog?, options?)

Publish a resource version.

```typescript
const published = await catalog.publishResource("resource-id", "Initial release");
```

#### bulkOperation(params, options?)

Perform bulk operations.

```typescript
await catalog.bulkOperation({
  action: "publish",
  ids: ["resource-1", "resource-2", "resource-3"],
});
```

### Version & Artifact Management

#### getVersions(resourceId, options?)

Get version history.

```typescript
const versions = await catalog.getVersions("resource-id");
// [{ version: 2, changelog: "...", publishedAt: "..." }, ...]
```

#### getArtifacts(resourceId, options?)

List resource artifacts.

```typescript
const artifacts = await catalog.getArtifacts("resource-id");
// [{ id: "...", filename: "...", contentType: "...", size: 1234 }, ...]
```

#### downloadArtifact(artifactId, options?)

Download artifact content.

```typescript
const blob = await catalog.downloadArtifact("artifact-id");
```

#### getSignatures(resourceId, options?)

Get resource signatures.

```typescript
const signatures = await catalog.getSignatures("resource-id");
```

#### getCertifications(resourceId, options?)

Get resource certifications.

```typescript
const certifications = await catalog.getCertifications("resource-id");
```

### Search

#### search(params, options?)

Keyword search.

```typescript
const results = await catalog.search({
  query: "http request",
  type: "component",
  status: "published",
  limit: 20,
});
```

#### nlSearch(params, options?)

Natural language search.

```typescript
const results = await catalog.nlSearch({
  query: "find components that make API calls",
  limit: 10,
});
```

### Type-Specific Methods

Each resource type has dedicated methods:

#### Components

```typescript
const components = await catalog.listComponents({ status: "published" });
const component = await catalog.getComponent("component-id");
const created = await catalog.createComponent({ key: "...", name: "..." });
const updated = await catalog.updateComponent("id", { name: "..." });
await catalog.deleteComponent("id");
const published = await catalog.getPublishedComponents();
```

#### Graphs

```typescript
const graphs = await catalog.listGraphs({ tags: ["production"] });
const graph = await catalog.getGraph("graph-id");
const created = await catalog.createGraph({ key: "...", name: "..." });
const updated = await catalog.updateGraph("id", { name: "..." });
await catalog.deleteGraph("id");
```

#### Executors

```typescript
const executors = await catalog.listExecutors();
const executor = await catalog.getExecutor("executor-id");
const byComponent = await catalog.getExecutorByComponentKey("component-key");
const created = await catalog.createExecutor({ key: "...", name: "..." });
const updated = await catalog.updateExecutor("id", { ... });
await catalog.deleteExecutor("id");
```

#### Assistants

```typescript
const assistants = await catalog.listAssistants();
const assistant = await catalog.getAssistant("assistant-id");
const published = await catalog.getPublishedAssistants();
const created = await catalog.createAssistant({ key: "...", name: "..." });
const updated = await catalog.updateAssistant("id", { ... });
await catalog.deleteAssistant("id");
```

#### Contexts

```typescript
const contexts = await catalog.listContexts();
const context = await catalog.getContext("context-id");
const created = await catalog.createContext({ key: "...", name: "..." });
const updated = await catalog.updateContext("id", { ... });
await catalog.deleteContext("id");
```

## TypeScript Types

### Resource Types

```typescript
type ResourceType = "component" | "context" | "integration" | "graph" | "executor" | "assistant";
type ResourceStatus = "draft" | "published" | "deprecated";
type VisibilityLevel = "public" | "org" | "private";
```

### Base Resource

```typescript
interface Resource {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  type: ResourceType;
  status: ResourceStatus;
  isBootstrap: boolean;
  tags?: string[] | null;
  orgId?: string | null;
  accessPolicy?: AccessPolicy | null;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}
```

### Access Policy

```typescript
interface AccessPolicy {
  visibility: VisibilityLevel;
  actions: {
    read?: { anyOf: string[] };
    write?: { anyOf: string[] };
    publish?: { anyOf: string[] };
    sign?: { anyOf: string[] };
    certify?: { anyOf: string[] };
    delete?: { anyOf: string[] };
  };
}
```

### Component Resource

```typescript
interface ComponentResource extends Resource {
  type: "component";
  metadata: {
    ports: {
      inputs: ComponentPort[];
      outputs: ComponentPort[];
    };
  };
}

interface ComponentPort {
  id: string;
  type: string;
  description?: string;
  color?: string;
  required?: boolean;
  default?: unknown;
}
```

### Graph Resource

```typescript
interface GraphResource extends Resource {
  type: "graph";
  metadata: {
    graphPayload: GraphPayload;
  };
}

interface GraphPayload {
  components: Record<string, { type: string; config?: unknown }>;
  edges: Array<{
    from: { component: string; port: string };
    to: { component: string; port: string };
  }>;
}
```

### Executor Resource

```typescript
interface ExecutorResource extends Resource {
  type: "executor";
  metadata: ExecutorMetadata;
}

interface ExecutorMetadata {
  componentKey: string;
  runtime: string;
  language: string;
  entrypoint: string;
  isDeterministic: boolean;
  supportsStreaming: boolean;
  timeout?: number;
}
```

### Assistant Resource

```typescript
interface AssistantResource extends Resource {
  type: "assistant";
  metadata: {
    config: AssistantConfig;
  };
}

interface AssistantConfig {
  principalId: string;
  capabilities: string[];
  ruleSets?: string[];
  webhooks?: unknown;
  endpoints?: unknown;
  model?: string;
  temperature?: number;
  systemPrompt?: string;
}
```

### API Parameters

```typescript
interface ListResourcesParams {
  type?: ResourceType;
  status?: ResourceStatus;
  tags?: string[];
  isBootstrap?: boolean;
  limit?: number;
  offset?: number;
}

interface CreateResourceParams {
  key: string;
  name: string;
  type: ResourceType;
  description?: string;
  tags?: string[];
  metadata?: unknown;
  accessPolicy?: AccessPolicy;
}

interface UpdateResourceParams {
  name?: string;
  description?: string;
  tags?: string[];
  metadata?: unknown;
  accessPolicy?: AccessPolicy;
}

interface SearchParams {
  query: string;
  type?: ResourceType;
  status?: ResourceStatus;
  tags?: string[];
  limit?: number;
}
```

## Constants

```typescript
import {
  resourceTypes,      // ["component", "context", "integration", "graph", "executor", "assistant"]
  resourceStatuses,   // ["draft", "published", "deprecated"]
  visibilityLevels,   // ["public", "org", "private"]
  accessPolicyActions // ["read", "write", "publish", "sign", "certify", "delete"]
} from "@symbia/catalog-client";
```

## Error Handling

```typescript
const catalog = createCatalogClient({
  onError: (error) => {
    console.error("Catalog error:", error.message);
    // Log to monitoring service
  },
});

try {
  const resource = await catalog.getResource("id");
  if (!resource) {
    console.log("Resource not found");
  }
} catch (error) {
  console.error("Request failed:", error);
}
```

## Services Using This Package

| Service | Use Case |
|---------|----------|
| Assistants | Load assistant configurations |
| Runtime | Load executor/component definitions |
| Network | Resolve component capabilities |
| Server | Bootstrap system resources |

## LLM Integration Guide

### Load Published Assistants

```typescript
const catalog = createCatalogClient({ token: process.env.TOKEN });

const assistants = await catalog.getPublishedAssistants();
for (const assistant of assistants) {
  const config = assistant.metadata.config as AssistantConfig;
  console.log(`${assistant.name}: ${config.capabilities.join(", ")}`);
}
```

### Resolve Component Executor

```typescript
// Find executor for a component
const executor = await catalog.getExecutorByComponentKey("symbia.core.http-request");
if (executor) {
  console.log(`Runtime: ${executor.metadata.runtime}`);
  console.log(`Entrypoint: ${executor.metadata.entrypoint}`);
}
```

### Get Bootstrap Summary

```typescript
const summary = await catalog.getBootstrapSummary();

console.log(`Components: ${summary.components.count}`);
console.log(`Graphs: ${summary.graphs.count}`);
console.log(`Assistants: ${summary.assistants.count}`);
```

### Search and Filter

```typescript
// Search by keyword
const results = await catalog.search({
  query: "authentication",
  type: "component",
  status: "published",
});

// List with filters
const graphs = await catalog.listGraphs({
  tags: ["production", "v2"],
  status: "published",
  limit: 10,
});
```

## Integration Checklist

- [ ] Install `@symbia/catalog-client`
- [ ] Configure endpoint (env var or explicit)
- [ ] Set authentication (token or API key)
- [ ] Set organization ID for multi-tenant access
- [ ] Use type-specific methods for better typing
- [ ] Handle null returns for missing resources
- [ ] Configure error callback for monitoring
- [ ] Use AbortSignal for request cancellation if needed
