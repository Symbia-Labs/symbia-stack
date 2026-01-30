# Catalog Service — Architectural Intent

> The versioned registry for everything that runs in the platform.

---

## What Catalog Is

Catalog is the **central registry for all executable and configurable resources** in the Symbia platform. It answers three fundamental questions:

1. **What exists?** — Components, graphs, executors, assistants, contexts, integrations
2. **What version?** — Immutable snapshots with changelogs and audit trails
3. **Who can use it?** — Granular access control with visibility levels and entitlements

This is not a simple file store. It's a typed, versioned, access-controlled registry designed for systems where AI agents discover and compose capabilities at runtime.

---

## The Problem We're Solving

Building AI-native applications requires more than code — it requires discoverable, composable building blocks:

1. **Components aren't just functions** — They have input/output ports, configuration schemas, and runtime requirements. You can't just import them; you need metadata to compose them correctly.

2. **Workflows are data, not code** — A graph of components with edges between ports is declarative configuration, not imperative logic. It needs to be stored, versioned, and discovered separately from execution.

3. **Execution is separate from definition** — A "JSON Parser" component is a specification. The actual code that implements it is an executor. Separating these allows multiple runtime implementations of the same interface.

4. **AI agents need self-discovery** — When an LLM orchestrates a workflow, it needs to query "what components exist that can parse JSON?" and get structured metadata, not search through source code.

5. **Versioning is mandatory** — Changing a component's interface can break running workflows. Immutable versions with explicit publishing ensure stability.

6. **Access control is complex** — Some resources are public platform primitives. Others are org-private. Some can be read by anyone but only published by specific roles.

Catalog addresses all of these as primary concerns.

---

## The Six Resource Types

Catalog stores six distinct resource types, each with a specific purpose:

### Component

**What it is:** An abstract building block with a defined interface.

**What it contains:**
- Input and output port definitions (name, type, required)
- Configuration schema (what parameters can be set)
- Category for discovery (intelligence, data, integration, etc.)

**What it does NOT contain:** Executable code. Components are specifications, not implementations.

```json
{
  "key": "ai/llm/openai",
  "type": "component",
  "metadata": {
    "category": "intelligence",
    "ports": {
      "inputs": [{"name": "prompt", "type": "string", "required": true}],
      "outputs": [{"name": "response", "type": "string"}]
    },
    "configSchema": {
      "properties": {
        "model": {"type": "string", "default": "gpt-4"},
        "temperature": {"type": "number", "default": 0.7}
      }
    }
  }
}
```

**Why it matters:** Components are the vocabulary for graph composition. An LLM can query "what intelligence components exist?" and get structured metadata to reason about capabilities.

---

### Executor

**What it is:** A runtime implementation of a component.

**What it contains:**
- Reference to the component it implements (`componentKey`)
- Programming language and runtime version
- Entry point (function name)
- Artifact reference (the actual code)
- Determinism flag (can outputs be cached?)

```json
{
  "key": "executors/openai-node",
  "type": "executor",
  "metadata": {
    "componentKey": "ai/llm/openai",
    "componentVersion": "1.0.0",
    "language": "node",
    "runtimeVersion": "20",
    "entrypoint": "handler",
    "artifactRef": "artifact-uuid",
    "determinism": "non-deterministic"
  }
}
```

**Why it matters:** The same component can have multiple executors (Node.js, Python, WebAssembly). The runtime resolves which executor to use based on available infrastructure.

**Resolution pattern:**
```
GET /api/executors/by-component/ai/llm/openai?version=1.0.0
```

---

### Graph

**What it is:** A workflow definition — nodes (component instances) connected by edges (data flow).

**What it contains:**
- List of component instances with IDs and configurations
- Edges connecting output ports to input ports
- Graph-level metadata (entry points, exit conditions)

```json
{
  "key": "workflows/auth-flow",
  "type": "graph",
  "metadata": {
    "graphId": "auth-flow-v1",
    "components": [
      {"id": "validate", "componentKey": "auth/validate-token", "config": {}},
      {"id": "authorize", "componentKey": "auth/check-permissions", "config": {}}
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

**Why it matters:** Graphs are the unit of workflow composition. They can be versioned, tested, and deployed independently of the components they use.

---

### Assistant

**What it is:** An AI agent configuration — identity, capabilities, and integration points.

**What it contains:**
- Principal identifier (for authentication)
- Declared capabilities (what actions the agent can perform)
- Webhook endpoints (where to send messages and control events)
- Model configuration (which LLM, what parameters)

```json
{
  "key": "assistants/log-analyst",
  "type": "assistant",
  "metadata": {
    "principalId": "assistant:log-analyst",
    "principalType": "assistant",
    "capabilities": ["log.read", "metrics.read", "log.analyze"],
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

**Why it matters:** Assistants are discoverable agents. The platform can query "what assistants can analyze logs?" and route requests accordingly.

---

### Context

**What it is:** A configuration bundle — environment variables, feature flags, connection strings.

**What it contains:**
- Key-value variables
- Environment designation (development, staging, production)
- Inheritance chain (contexts can extend other contexts)

```json
{
  "key": "env/production",
  "type": "context",
  "metadata": {
    "category": "workspace",
    "variables": {
      "API_URL": "https://api.example.com",
      "LOG_LEVEL": "info",
      "FEATURE_NEW_UI": "true"
    },
    "extends": "env/base"
  }
}
```

**Why it matters:** Contexts separate configuration from code. A graph can reference a context, and changing the context changes behavior without modifying the graph.

---

### Integration

**What it is:** An external service connector configuration.

**What it contains:**
- Service provider (Stripe, Twilio, AWS, etc.)
- API version
- Authentication configuration (references to secrets)
- Endpoint mappings

```json
{
  "key": "integrations/stripe",
  "type": "integration",
  "metadata": {
    "provider": "stripe",
    "version": "2023-10-16",
    "authType": "api_key",
    "secretRef": "vault://stripe/api-key",
    "endpoints": {
      "charges": "https://api.stripe.com/v1/charges",
      "customers": "https://api.stripe.com/v1/customers"
    }
  }
}
```

**Why it matters:** Integrations centralize external service configuration. Components can reference integrations by key rather than embedding credentials.

---

## Design Principles

### 1. Immutable Versions

Once a resource is published, that version is frozen forever:

```
Draft → Publish → Version 1 (immutable)
  ↓
Edit → Publish → Version 2 (immutable)
  ↓
Edit → Publish → Version 3 (immutable)
```

**Why this matters:**
- Running workflows reference specific versions
- Rolling back means deploying an older version, not undoing changes
- Audit trail shows exactly what was deployed when
- No "works on my machine" — version 1 is version 1 everywhere

**Trade-off accepted:** Storage grows with each version. Mitigated by storing only metadata diffs in the future.

### 2. Keys as Stable Identifiers

Every resource has a human-readable key:

```
ai/llm/openai          — Component
executors/openai-node  — Executor
workflows/auth-flow    — Graph
assistants/log-analyst — Assistant
```

**Why this matters:**
- Keys are meaningful (not UUIDs)
- Keys are stable (don't change between environments)
- Keys enable references between resources
- Keys support hierarchy (ai/llm/* = all LLM components)

**Key format:** Alphanumeric with `/`, `-`, `_`. Must be unique within the catalog.

### 3. Separation of Specification and Implementation

Components define *what*, executors define *how*:

```
Component: ai/llm/openai
  ├── Executor: executors/openai-node (Node.js 20)
  ├── Executor: executors/openai-python (Python 3.11)
  └── Executor: executors/openai-wasm (WebAssembly)
```

**Why this matters:**
- Same interface, multiple implementations
- Runtime chooses executor based on available infrastructure
- Interface changes are versioned separately from implementation fixes
- Testing can use mock executors

**Trade-off accepted:** Two resources to manage instead of one. Worth it for flexibility.

### 4. Bootstrap Resources

Some resources are marked as `isBootstrap: true`:

```json
{
  "key": "core/identity",
  "isBootstrap": true,
  ...
}
```

**What bootstrap means:**
- Available without authentication (`GET /api/bootstrap`)
- Loaded during platform initialization
- Represents core platform capabilities
- Cannot be deleted by non-admins

**Why this matters:** Platform needs to bootstrap itself. Core components must be available before authentication is configured.

### 5. Artifacts as Separate Entities

Code and binary files are stored as artifacts, not embedded in resources:

```
Resource: executors/openai-node
  └── Artifact: handler.js (1.2KB, sha256:abc123...)
```

**Artifact properties:**
- Name, MIME type, size, checksum
- Storage URL (local filesystem or S3)
- Optional version association
- Allowed types: JSON, YAML, JavaScript, images, archives

**Why this matters:**
- Resources stay small and queryable
- Artifacts can be large (up to 50MB)
- Checksums ensure integrity
- Storage can be swapped (local → S3) without changing resources

### 6. Access Control at Resource Level

Each resource has an access policy:

```json
{
  "accessPolicy": {
    "visibility": "org",
    "actions": {
      "read": {"anyOf": ["public", "org:acme-corp"]},
      "write": {"anyOf": ["role:admin", "cap:registry.write"]},
      "publish": {"anyOf": ["role:publisher"]},
      "delete": {"anyOf": ["role:admin"]}
    }
  }
}
```

**Visibility levels:**
- `public` — Anyone can read
- `org` — Organization members can read
- `private` — Only explicitly granted principals

**Action types:**
- `read` — View resource and metadata
- `write` — Create and update drafts
- `publish` — Create immutable versions
- `sign` — Add cryptographic signatures
- `certify` — Add formal certifications
- `delete` — Remove resource

**Evaluation logic:**
1. Super admins bypass all checks
2. Check visibility for read access
3. Match user entitlements against `actions[action].anyOf[]`
4. Grant if any entitlement matches

---

## Data Flow

### Resource Lifecycle

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Create    │────▶│    Draft    │────▶│   Publish   │
│  (draft)    │     │  (mutable)  │     │ (immutable) │
└─────────────┘     └─────────────┘     └─────────────┘
                          │                    │
                          ▼                    ▼
                    ┌─────────────┐     ┌─────────────┐
                    │    Edit     │     │  Version N  │
                    │             │     │  (frozen)   │
                    └─────────────┘     └─────────────┘
```

### Executor Resolution

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐
│ Runtime  │     │   Catalog    │     │   Database   │
│ Service  │     │   Service    │     │              │
└──────────┘     └──────────────┘     └──────────────┘
     │                  │                    │
     │ Need executor for                     │
     │ component "ai/llm/openai"             │
     │─────────────────▶│                    │
     │                  │ Query by           │
     │                  │ componentKey       │
     │                  │───────────────────▶│
     │                  │◀───────────────────│
     │                  │ Filter by language │
     │                  │ and version        │
     │◀─────────────────│                    │
     │ Executor with    │                    │
     │ artifact URL     │                    │
     │                  │                    │
     │ Download artifact                     │
     │─────────────────▶│                    │
     │◀─────────────────│                    │
     │ Execute code     │                    │
```

### Graph Composition

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Assistants  │     │   Catalog    │     │   Runtime    │
│   Service    │     │   Service    │     │   Service    │
└──────────────┘     └──────────────┘     └──────────────┘
     │                      │                    │
     │ User triggers        │                    │
     │ workflow             │                    │
     │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ▶                    │
     │                      │                    │
     │ Fetch graph          │                    │
     │ "workflows/auth"     │                    │
     │─────────────────────▶│                    │
     │◀─────────────────────│                    │
     │ Graph with nodes     │                    │
     │ and edges            │                    │
     │                      │                    │
     │ For each node:       │                    │
     │ Resolve executor     │                    │
     │─────────────────────▶│                    │
     │◀─────────────────────│                    │
     │                      │                    │
     │ Execute graph        │                    │
     │─────────────────────────────────────────▶│
     │                      │                    │
```

---

## Schema Design Decisions

### Why Separate Tables for Versions

Versions are in a separate table, not a versions array:

```sql
resources (id, key, name, currentVersion, ...)
resource_versions (id, resourceId, version, content, publishedAt, ...)
```

**Why:**
- Versions can be large (full resource snapshot)
- Querying "latest version" is fast (resources.currentVersion)
- Querying "all versions" is separate operation
- Storage scales independently

### Why JSONB for Metadata

Type-specific data lives in a JSONB column:

```sql
metadata: JSONB  -- ports, configSchema, graphId, etc.
```

**Why:**
- Each resource type has different metadata shape
- No schema migrations for new metadata fields
- PostgreSQL JSONB supports indexing and querying
- Type safety via Zod validation at application layer

### Why Checksums for Artifacts

Every artifact has a SHA256 checksum:

```sql
checksum: VARCHAR(255)  -- "sha256:abc123..."
```

**Why:**
- Integrity verification on download
- Deduplication (same content = same checksum)
- Audit trail for changes
- Cache invalidation keys

### Why Soft Delete for API Keys

API keys have `isActive` and `expiresAt` rather than deletion:

```sql
isActive: BOOLEAN
expiresAt: TIMESTAMP
```

**Why:**
- Audit trail preservation
- "Disable" vs "delete" distinction
- Recovery possible if disabled by mistake
- Historical queries ("what keys existed last month?")

---

## Access Control Deep Dive

### Entitlement Sources

User entitlements come from Identity Service introspection:

| Entitlement | Source |
|-------------|--------|
| `public` | Always granted |
| `authenticated` | Any valid token |
| `role:admin` | User has `isSuperAdmin: true` |
| `role:publisher` | User has role `role:publisher` |
| `cap:registry.write` | User has entitlement `cap:registry.write` |
| `org:<slug>` | User is member of organization |
| `role:admin:<slug>` | User is admin of organization |

### Policy Evaluation Example

Resource policy:
```json
{
  "visibility": "org",
  "actions": {
    "read": {"anyOf": ["org:acme-corp", "cap:registry.read"]},
    "write": {"anyOf": ["role:admin:acme-corp", "cap:registry.write"]},
    "publish": {"anyOf": ["role:publisher"]}
  }
}
```

User entitlements:
```json
["authenticated", "org:acme-corp", "cap:registry.write"]
```

Evaluation:
- **read:** ✓ User has `org:acme-corp`
- **write:** ✓ User has `cap:registry.write`
- **publish:** ✗ User lacks `role:publisher`

### Super Admin Bypass

Users with `isSuperAdmin: true` bypass all access checks. This is intentional for:
- Platform operators
- Emergency access
- Bootstrap operations

---

## Integration Patterns

### For Runtime Service

```typescript
// Resolve executor for a component
const executor = await catalog.getExecutorByComponent(
  "ai/llm/openai",
  { version: "1.0.0", language: "node" }
);

// Download artifact
const code = await catalog.downloadArtifact(executor.metadata.artifactRef);

// Execute
const handler = await import(code);
const result = await handler[executor.metadata.entrypoint](input);
```

### For Assistants Service

```typescript
// Find assistants with specific capabilities
const analysts = await catalog.search({
  type: "assistant",
  query: "log.analyze",
  status: "published"
});

// Get full assistant config
const assistant = await catalog.getResource(analysts[0].id);

// Route message to webhook
await fetch(assistant.metadata.webhooks.message, {
  method: "POST",
  body: JSON.stringify(message)
});
```

### For AI Agents

```typescript
// Discover available components
const components = await catalog.listResources({
  type: "component",
  status: "published"
});

// Build capability index
const capabilities = components.map(c => ({
  key: c.key,
  category: c.metadata.category,
  inputs: c.metadata.ports.inputs,
  outputs: c.metadata.ports.outputs
}));

// Use in LLM prompt
const prompt = `Available components:\n${JSON.stringify(capabilities, null, 2)}`;
```

### For CI/CD Pipelines

```typescript
// Authenticate with API key
const catalog = createCatalogClient({
  endpoint: process.env.CATALOG_URL,
  apiKey: process.env.CATALOG_API_KEY
});

// Create or update resource
const resource = await catalog.upsertResource({
  key: "components/my-component",
  name: "My Component",
  type: "component",
  metadata: { ... }
});

// Upload artifact
await catalog.uploadArtifact(resource.id, {
  name: "handler.js",
  mimeType: "application/javascript",
  content: fs.readFileSync("dist/handler.js")
});

// Publish
await catalog.publishResource(resource.id, {
  changelog: `Build ${process.env.BUILD_NUMBER}`
});
```

---

## Operational Considerations

### Rate Limiting

| Operation | Default Limit | Purpose |
|-----------|---------------|---------|
| Write | 30/minute | Prevent spam creation |
| Search | 60/minute | Protect query performance |
| Upload | 10/minute | Limit storage abuse |

Rate limit headers:
- `X-RateLimit-Limit`: Maximum requests
- `X-RateLimit-Remaining`: Requests left
- `X-RateLimit-Reset`: Reset timestamp

### Performance Characteristics

| Operation | Typical Latency | Notes |
|-----------|-----------------|-------|
| Get resource | 5-20ms | Index lookup |
| List resources | 20-100ms | Depends on filters |
| Search | 50-200ms | Full-text search |
| Publish | 100-300ms | Creates version snapshot |
| Upload artifact | 100ms-5s | Depends on size |

### Scaling Considerations

- **Horizontal:** Stateless — add instances behind load balancer
- **Database:** Read replicas for search-heavy workloads
- **Artifacts:** S3-compatible storage for large files
- **Caching:** Resource metadata can be cached (TTL: 60s)

### Monitoring Points

- Resource creation/publish rates
- Search query latency
- Artifact upload sizes
- Access denied events
- Rate limit hits

---

## What Catalog Does Not Do

### No Code Execution

Catalog stores executors but doesn't run them. Execution happens in the Runtime service.

**Rationale:** Separation of concerns. Catalog is a registry, not a runtime.

### No Secret Storage

Integration resources reference secrets by URL (`vault://...`), not store them.

**Rationale:** Secrets management is a specialized concern. Use a dedicated secrets manager.

### No Real-Time Updates

Changes to resources don't push to consumers. Consumers poll or use specific versions.

**Rationale:** Simplicity. Real-time sync adds complexity without clear benefit for this use case.

### No Dependency Resolution

Graphs reference components by key, but Catalog doesn't verify components exist.

**Rationale:** Loose coupling. Validation happens at execution time, not registration time.

---

## Future Directions

### Planned

1. **Dependency graphs** — Track which resources reference which
2. **Deprecation workflow** — Notify consumers before removing resources
3. **Schema validation** — Validate metadata against JSON Schema
4. **Artifact deduplication** — Same checksum = same storage

### Considered

1. **GraphQL API** — Alternative query interface
2. **Webhooks on publish** — Notify external systems
3. **Resource templates** — Scaffolding for common patterns

### Intentionally Deferred

1. **Git integration** — Store in Git, sync to Catalog
2. **Visual graph editor** — Build graphs in UI
3. **Marketplace** — Cross-org resource sharing

---

## Quick Reference

### Resource Types

| Type | Purpose | Key Example |
|------|---------|-------------|
| `component` | Interface specification | `ai/llm/openai` |
| `executor` | Runtime implementation | `executors/openai-node` |
| `graph` | Workflow definition | `workflows/auth-flow` |
| `assistant` | AI agent config | `assistants/log-analyst` |
| `context` | Configuration bundle | `env/production` |
| `integration` | External service config | `integrations/stripe` |

### Status Values

| Status | Meaning |
|--------|---------|
| `draft` | Work in progress, mutable |
| `published` | Released, immutable version exists |
| `deprecated` | Scheduled for removal |

### Visibility Levels

| Level | Who Can Read |
|-------|--------------|
| `public` | Anyone |
| `org` | Organization members |
| `private` | Explicitly granted principals |

### Common Entitlements

| Entitlement | Grants |
|-------------|--------|
| `cap:registry.read` | Read any resource |
| `cap:registry.write` | Create and update resources |
| `cap:registry.publish` | Publish versions |
| `cap:registry.sign` | Add signatures |
| `cap:registry.certify` | Add certifications |

---

*This document reflects the Catalog service architectural intent as of January 2026.*
