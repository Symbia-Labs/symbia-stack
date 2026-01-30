# Symbia Platform — Architectural Intent

> A technical manifesto for engineers, architects, and leadership.

---

## What Symbia Is

Symbia is an **LLM-native orchestration platform** — a microservices backend designed from the ground up to manage AI assistants, conversational workflows, and multi-tenant SaaS operations. It serves as the infrastructure layer between LLM providers and end users, handling the complexity that emerges when AI becomes a first-class citizen in your product.

This is not a chatbot framework. It's the operational backbone for products where AI agents need authentication, authorization, audit trails, workflow orchestration, and enterprise-grade reliability.

---

## The Problem We're Solving

Building AI-powered products exposes a gap in traditional backend architectures:

1. **Authentication isn't enough** — You need to know not just *who* is making a request, but *which AI agent* is acting on their behalf, with what permissions, in what context.

2. **Request/response doesn't fit** — LLM interactions are streams, not transactions. They can be paused, resumed, interrupted, or handed off mid-conversation.

3. **Observability is different** — You're not just logging errors. You're tracking token usage, latency distributions, conversation flows, and agent decision trees.

4. **Multi-tenancy is mandatory** — Every SaaS AI product needs tenant isolation from day one. Retrofitting it is expensive and error-prone.

5. **Workflows are graphs, not scripts** — AI operations involve branching logic, parallel execution, human-in-the-loop steps, and conditional routing that linear code can't express cleanly.

Symbia addresses all of these as first-class concerns.

---

## Architecture at a Glance

### Service Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                         Server (5000)                           │
│                    API Gateway / Static Serving                 │
└─────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Identity      │     │ Catalog         │     │ Logging         │
│ (5001)        │     │ (5003)          │     │ (5002)          │
│               │     │                 │     │                 │
│ Auth/JWT      │     │ Resource        │     │ Telemetry       │
│ Users/Orgs    │     │ Registry        │     │ Metrics/Traces  │
│ RBAC          │     │ Versioning      │     │ AI Analysis     │
└───────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        └───────────────────────┼───────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Assistants    │     │ Messaging       │     │ Runtime         │
│ (5004)        │     │ (5005)          │     │ (5006)          │
│               │     │                 │     │                 │
│ Rule Engine   │     │ Conversations   │     │ Graph Executor  │
│ LLM Routing   │     │ WebSocket       │     │ Step Sequencing │
│ Workflows     │     │ Stream Control  │     │ State Machine   │
└───────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        └───────────────────────┼───────────────────────┘
                                │
                    ┌─────────────────────┐
                    │ Integrations (5007) │
                    │                     │
                    │ LLM Gateway         │
                    │ Credential Routing  │
                    │ Provider Adapters   │
                    └─────────────────────┘
                                │
                                ▼
                    ┌─────────────────────┐
                    │ Network (5054)      │
                    │                     │
                    │ SDN / Service Mesh  │
                    │ Policy Enforcement  │
                    │ Event Routing       │
                    └─────────────────────┘
```

### Shared Infrastructure

Eleven `@symbia/*` packages provide standardized building blocks:

| Package | Purpose |
|---------|---------|
| `@symbia/db` | Database abstraction with dual-mode PostgreSQL/in-memory |
| `@symbia/http` | Express server framework with health checks, graceful shutdown |
| `@symbia/logging-client` | Telemetry SDK for logs, metrics, distributed traces |
| `@symbia/messaging-client` | REST + WebSocket client for Messaging service |
| `@symbia/catalog-client` | Client for resource registry operations |
| `@symbia/relay` | Network layer client for SDN integration |
| `@symbia/sys` | System utilities and service registry |
| `@symbia/seed` | Deterministic test data seeding |
| `@symbia/md` | LLM-ready documentation generation |
| `@symbia/cli` | Unified command-line interface |

---

## Design Principles

### 1. Multi-Tenant by Default

Every request carries organizational context via `X-Org-Id` headers. Data isolation happens at the query layer through Drizzle ORM filters, not through separate databases or schemas.

**Why this approach:**
- Single cluster deployment reduces operational complexity
- Shared infrastructure amortizes costs across tenants
- Query-level isolation is auditable and testable
- Migration to physical isolation remains possible if needed

**Trade-off accepted:** Query-level isolation requires discipline. Every data access must include tenant filters. The `@symbia/db` package enforces this through schema conventions and query builders.

### 2. Dual-Mode Database

Production runs PostgreSQL. Development and testing use `pg-mem` — a pure JavaScript PostgreSQL implementation that runs in-memory.

```typescript
// Same code works in both environments
const result = await db.query.users.findMany({
  where: eq(users.orgId, orgId),
});
```

**Why this approach:**
- Zero Docker dependency for local development
- Sub-second test suite startup
- Identical query behavior (pg-mem implements PostgreSQL semantics)
- Database state exports to JSON on shutdown for debugging

**Trade-off accepted:** Some PostgreSQL features (certain extensions, specific performance characteristics) aren't available in pg-mem. We test against real PostgreSQL in CI.

### 3. LLM-Native Documentation

Every service exposes machine-readable documentation at `/docs/llms.txt`:

```
# Identity Service API
> Authentication and authorization for Symbia platform.

## Quick Reference
- POST /api/auth/login - Authenticate user
- POST /api/auth/register - Create account
- GET /api/users/me - Get current user
...
```

**Why this approach:**
- AI agents can self-discover API capabilities
- Reduces prompt engineering for integrations
- Documentation stays synchronized with implementation
- Enables automated API exploration and testing

**Implementation:** The `@symbia/md` package generates docs from OpenAPI specs at build time. Routes serve static files with dynamic fallback.

### 4. Stream-Aware Messaging

Messages aren't just sent — they're streams that can be controlled:

```typescript
// Pause an AI response mid-stream
await client.sendControl(conversationId, {
  event: "pause",
  target: agentId,
});

// Resume when ready
await client.sendControl(conversationId, {
  event: "resume",
  target: agentId,
});

// Interrupt with higher priority
await client.sendControl(conversationId, {
  event: "preempt",
  reason: "User asked new question",
});
```

**Why this approach:**
- LLM responses can take seconds — users need control
- Human-in-the-loop workflows require pause/resume
- Agent handoffs need clean interruption semantics
- Priority handling prevents queue starvation

**Trade-off accepted:** Stream control adds complexity to the messaging protocol. Clients must handle control events correctly.

### 5. Graph-Based Workflow Execution

Complex AI operations are defined as directed graphs, not imperative code:

```typescript
const workflow = {
  nodes: [
    { id: "classify", type: "llm", prompt: "..." },
    { id: "route", type: "condition", rules: [...] },
    { id: "respond", type: "llm", prompt: "..." },
    { id: "escalate", type: "human", assignTo: "..." },
  ],
  edges: [
    { from: "classify", to: "route" },
    { from: "route", to: "respond", condition: "simple" },
    { from: "route", to: "escalate", condition: "complex" },
  ],
};
```

**Why this approach:**
- Visual representation of complex logic
- Easy to modify without code changes
- Supports parallel execution naturally
- Enables workflow versioning and A/B testing
- Human-in-the-loop is a node type, not an exception

**Trade-off accepted:** Graph execution requires a runtime engine (the Runtime service). Simple linear operations have more overhead than direct code.

### 6. Software-Defined Networking

The Network service implements a custom SDN layer for service mesh operations:

- **Event Routing:** Messages flow through policy-controlled paths
- **Access Control:** Network-level enforcement of authorization decisions
- **Topology Management:** Dynamic service discovery and connection management
- **Connection Lifecycle:** Graceful handling of service restarts and failures

**Why this approach:**
- Centralized policy enforcement reduces per-service security code
- Network-level observability captures all inter-service communication
- Routing rules can change without service redeployment
- Enables advanced patterns like canary deployments and traffic mirroring

**Trade-off accepted:** Adds a network hop. Latency-critical paths may need direct service-to-service communication.

---

## Service Deep Dive

### Identity (Port 5001)

**Mission:** Be the single source of truth for "who is making this request and what can they do?"

**Key Capabilities:**
- User registration, authentication, password management
- Organization creation and membership
- JWT token issuance with configurable claims
- API key management for service accounts
- Role-based access control (RBAC)
- Entitlement system for fine-grained permissions

**Design Decisions:**
- Tokens are short-lived (15 min default) with refresh token rotation
- Passwords use bcrypt with configurable cost factor
- Sessions support both stateless JWT and stateful cookie modes
- Super-admin role exists for platform-level operations

### Catalog (Port 5003)

**Mission:** Registry for all versionable resources — components, graphs, assistants, and their metadata.

**Key Capabilities:**
- Resource registration with semantic versioning
- Access control policies per resource
- Tagging and categorization
- Publish/draft lifecycle
- Bootstrap resources for system initialization

**Design Decisions:**
- Resources are immutable once published — new versions create new records
- Access policies are JSON documents supporting complex rules
- Bootstrap flag identifies system-critical resources
- Soft delete preserves audit history

### Assistants (Port 5004)

**Mission:** Orchestrate AI agent behavior through rules, routing, and workflow management.

**Key Capabilities:**
- Rule engine for conditional logic
- LLM provider abstraction
- Prompt template management
- Agent capability declarations
- Workflow graph definitions

**Design Decisions:**
- Rules evaluate in priority order with short-circuit semantics
- LLM calls go through a provider abstraction for multi-vendor support
- Prompts support variable interpolation and conditional sections
- Agents declare capabilities that inform routing decisions

### Messaging (Port 5005)

**Mission:** Handle all conversational state and real-time communication.

**Key Capabilities:**
- Conversation lifecycle (create, archive, delete)
- Message persistence with threading
- WebSocket connections via Socket.IO
- Typing indicators and presence
- Stream control events (pause, resume, preempt)
- Message priority levels

**Design Decisions:**
- Conversations are the unit of context for AI interactions
- Messages include sender type (user vs agent) for routing decisions
- Control events are first-class message types
- WebSocket rooms map to conversation IDs

### Runtime (Port 5006)

**Mission:** Execute workflow graphs with reliability and observability.

**Key Capabilities:**
- Graph traversal with parallel execution support
- Step state management
- Error handling and retry logic
- Execution logging and tracing
- Human-in-the-loop step handling

**Design Decisions:**
- Execution state persists to database for crash recovery
- Each step emits events for real-time monitoring
- Timeouts are configurable per step type
- Failed steps can be retried or skipped manually

### Logging (Port 5002)

**Mission:** Centralized observability for the entire platform.

**Key Capabilities:**
- Log aggregation with structured metadata
- Metrics collection (counters, gauges, histograms)
- Distributed trace assembly
- AI-powered log analysis
- Alert rule evaluation

**Design Decisions:**
- Logs are append-only with time-based partitioning
- Traces use W3C Trace Context format
- Metrics support custom labels for multi-dimensional analysis
- AI analysis runs asynchronously to avoid blocking

### Network (Port 5054)

**Mission:** Software-defined networking for service mesh operations.

**Key Capabilities:**
- Event routing between services
- Policy-based access control
- Service discovery and health tracking
- Connection lifecycle management
- Traffic shaping and routing rules

**Design Decisions:**
- Policies are evaluated at connection time and cached
- Health checks use the same endpoints as Kubernetes probes
- Routing rules support weighted distribution for canary deployments
- All events are logged for network-level observability

### Integrations (Port 5007)

**Mission:** Unified gateway for third-party LLM providers with credential management.

**Key Capabilities:**
- Multi-provider support (OpenAI, Anthropic, HuggingFace)
- Credential routing from Identity service
- Response normalization across providers
- Usage tracking with token counts
- Operation types: chat completions, embeddings, text generation

**Design Decisions:**
- Credentials are fetched on-demand, never stored locally
- All responses normalize to a common schema regardless of provider
- Provider configurations load from Catalog resources
- Usage metrics are logged for billing and monitoring

### Server (Port 5000)

**Mission:** API gateway, build management, and static file serving.

**Key Capabilities:**
- Request routing to backend services
- Static file serving for web clients
- Build process management
- Development server with hot reload
- Unified entry point for the platform

**Design Decisions:**
- Gateway routing uses path-based rules
- Static files are served from a configurable directory
- Development mode integrates Vite for hot module replacement
- Health endpoint aggregates status from all services

---

## Operational Model

### Health Checks

Every service exposes three endpoints:

| Endpoint | Purpose | Returns 200 When |
|----------|---------|------------------|
| `/health` | General status | Service is operational |
| `/health/live` | Kubernetes liveness | Process is running |
| `/health/ready` | Kubernetes readiness | Ready to accept traffic |

Readiness checks verify database connectivity and critical dependencies. Liveness checks verify the process hasn't deadlocked.

### Graceful Shutdown

On SIGTERM/SIGINT:

1. Mark service as not ready (stops new traffic via K8s)
2. Wait for pre-shutdown delay (default: 5s) — allows in-flight requests to complete
3. Run custom shutdown hooks (cache flush, queue drain)
4. Export in-memory database state (if applicable)
5. Flush telemetry buffers
6. Close database connections
7. Close WebSocket connections
8. Close HTTP server with grace period (default: 30s)
9. Force-terminate remaining connections

### Distributed Tracing

Every request receives a trace ID:

1. Check for `x-trace-id` header from upstream
2. Generate UUID if not present
3. Attach to all downstream requests
4. Include in all log entries
5. Return in response header

This enables request correlation across the entire service topology.

### Deterministic Seeding

The `@symbia/seed` package provides:

- Stable UUIDs that are identical across environments
- Test users with known credentials (`password123`)
- Sample organizations with different plan tiers
- Catalog resources for testing workflows
- Idempotent operations (safe to re-run)

**Warning:** Seed data is for development only. Production environments must never use seed credentials.

---

## Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Runtime | Node.js 20+ | Async I/O fits our workload; TypeScript for type safety |
| Framework | Express 5 | Mature, well-understood, extensive middleware ecosystem |
| Real-time | Socket.IO | WebSocket abstraction with fallbacks and room support |
| Database | PostgreSQL | ACID compliance, JSON support, mature tooling |
| ORM | Drizzle | Type-safe queries, good migration story, lightweight |
| Testing | pg-mem | In-memory PostgreSQL for fast test execution |
| Build | Vite | Fast HMR for client, esbuild for server |
| CLI | Commander.js | Standard Node.js CLI framework |

---

## What Makes Symbia Different

### 1. AI-First Architecture

Traditional backends treat AI as an integration. Symbia treats AI agents as first-class principals with:

- Their own authentication tokens
- Declared capabilities
- Audit trails
- Rate limits
- Access policies

### 2. Stream Control Semantics

Most messaging systems are fire-and-forget. Symbia provides:

- Pause/resume for long-running responses
- Preemption for priority handling
- Handoff for agent-to-agent transfers
- Cancel for cleanup

### 3. Self-Documenting Services

Every service generates LLM-consumable documentation automatically. AI agents can discover capabilities without human intervention.

### 4. Development Velocity

In-memory database mode eliminates infrastructure setup. New developers can run the entire platform with:

```bash
npm install
npm run dev
```

No Docker. No database provisioning. No environment variables (sensible defaults exist).

---

## Scale Considerations

### Horizontal Scaling

Services are stateless by design:

- All state lives in PostgreSQL
- No in-process caches that can't be rebuilt
- WebSocket connections use Redis adapter for multi-node
- Service mesh handles routing to healthy instances

### Vertical Scaling

Before adding nodes, consider:

- Database connection pooling (PgBouncer)
- Read replicas for query-heavy workloads
- Caching layer for repeated lookups
- Async processing for heavy operations

### Current Limitations

- Single PostgreSQL database (sharding not implemented)
- No built-in rate limiting (implement at gateway)
- WebSocket scaling requires Redis adapter configuration
- Graph execution is single-threaded per workflow

---

## Future Directions

### Considered but Not Yet Implemented

1. **Event Sourcing** — Full audit trail with replay capability
2. **CQRS** — Separate read/write models for high-scale scenarios
3. **Database Sharding** — Tenant-based data distribution
4. **Edge Deployment** — Run services closer to users
5. **Plugin Architecture** — Third-party service extensions

### Intentionally Avoided

1. **Microservice per Entity** — Too fine-grained; network overhead dominates
2. **GraphQL** — REST is sufficient; GraphQL adds complexity without clear benefit
3. **Kubernetes Operators** — Standard deployments are simpler to reason about
4. **Custom Protocol Buffers** — JSON is debuggable; performance isn't the bottleneck

---

## Getting Started

### For Developers

```bash
# Clone and install
git clone <repo>
cd symbia
npm install

# Start all services (in-memory mode)
npm run dev

# Run tests
npm test

# Seed development data
npm run seed
```

### For Operators

```bash
# Build for production
npm run build

# Configure environment
export DATABASE_URL=postgres://...
export JWT_SECRET=...

# Start services
npm start
```

### For Integrators

1. Fetch `/docs/llms.txt` from any service
2. Authenticate via Identity service
3. Use returned JWT for subsequent requests
4. Include `X-Org-Id` header for multi-tenant operations

---

## Questions This Document Should Answer

| Question | Section |
|----------|---------|
| What does Symbia do? | What Symbia Is |
| Why was it built this way? | The Problem We're Solving |
| How do the services fit together? | Architecture at a Glance |
| What trade-offs were made? | Design Principles |
| What does each service do? | Service Deep Dive |
| How do I run it? | Getting Started |
| How does it scale? | Scale Considerations |
| What's next? | Future Directions |

---

*This document reflects the architectural intent as of January 2026. Implementation details may evolve, but these principles should remain stable.*
