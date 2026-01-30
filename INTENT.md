# Symbia Stack — Architectural Intent

> Infrastructure for LLM-native applications where AI is a first-class citizen.

---

## Vision

Symbia Stack is the operational backbone for applications where AI agents work alongside humans. It provides the primitives needed when AI transitions from a feature to a fundamental building block: identity, orchestration, communication, observation, and coordination.

Traditional backend architectures treat AI as an API call. Symbia treats AI as a principal—an entity with identity, capabilities, state, and the ability to act autonomously within defined boundaries.

---

## The Problem We're Solving

Building production AI applications exposes gaps in conventional infrastructure:

### 1. Identity Crisis
Who is the AI? Current systems have no concept of AI identity. When an agent makes a request, there's no standard way to authenticate it, authorize its actions, or audit what it did. You end up with API keys that grant blanket access and no audit trail.

**Symbia's answer:** Agents are principals with the same identity infrastructure as users. They register, authenticate, receive tokens, and have entitlements. The Entity Directory provides a unified UUID that persists across service boundaries.

### 2. Orchestration Complexity
AI workflows aren't request-response. They're stateful, multi-step, and often involve multiple agents. Building this with traditional tools means custom state machines, database polling, and brittle webhook chains.

**Symbia's answer:** The Assistants service provides graph-based execution with a rule engine. Define workflows as DAGs, trigger actions on events, and let the platform handle state, retries, and handoffs.

### 3. Communication Mismatch
Real-time AI interactions don't fit REST. Streaming responses, typing indicators, multi-agent conversations, and control events (pause, preempt, handoff) require bidirectional communication.

**Symbia's answer:** Messaging provides WebSocket-first communication with REST fallback. Control events are first-class. Agents participate in conversations as peers, not external callers.

### 4. Observability Gaps
When an AI agent does something unexpected, you need to trace exactly what happened: which prompt, which response, which rule fired, which service was called. Traditional APM tools don't capture LLM-specific context.

**Symbia's answer:** Logging captures not just logs but metrics, traces, and objects. AI-powered analysis can summarize patterns and investigate anomalies. Trace IDs and run IDs correlate events across the entire request lifecycle.

### 5. Service Coordination
Microservices communicating via HTTP create invisible dependencies. When service A calls service B, there's no record unless you explicitly log it. Policy enforcement is scattered across codebases.

**Symbia's answer:** The Network service provides a software-defined network where communication requires explicit contracts. Events are routed through a policy engine. The topology is always visible.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Symbia Stack                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Application Layer                                                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Assistants │  │   Runtime   │  │ Integrations│  │   Network   │        │
│  │    :5004    │  │    :5006    │  │    :5007    │  │    :5054    │        │
│  │             │  │             │  │             │  │             │        │
│  │ AI Workflow │  │  Dataflow   │  │ LLM Gateway │  │ Service Mesh│        │
│  │   Engine    │  │  Executor   │  │  & Routing  │  │  & SDN      │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │               │
│  Core Services                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                         │
│  │   Catalog   │  │  Messaging  │  │   Logging   │                         │
│  │    :5003    │  │    :5005    │  │    :5002    │                         │
│  │             │  │             │  │             │                         │
│  │  Resource   │  │  Real-time  │  │ Observability│                        │
│  │  Registry   │  │    Comms    │  │   Platform  │                         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                         │
│         │                │                │                                 │
│  Foundation                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │                         Identity                                 │       │
│  │                          :5001                                   │       │
│  │                                                                  │       │
│  │   Authentication • Authorization • Entity Directory • Vault      │       │
│  └─────────────────────────────────────────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Design Principles

### 1. AI as a Principal

Agents have identity, not just API keys:

```
┌──────────────────────────────────────────────────────────────────┐
│                     Identity Service                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│   Users (humans)              Agents (AI)                        │
│   ┌─────────────┐            ┌─────────────┐                     │
│   │ user_abc123 │            │ agent_xyz789│                     │
│   │             │            │             │                     │
│   │ email/pass  │            │ credentials │                     │
│   │ JWT token   │            │ JWT token   │                     │
│   │ entitlements│            │ entitlements│                     │
│   └─────────────┘            └─────────────┘                     │
│          │                          │                             │
│          └──────────┬───────────────┘                             │
│                     ▼                                             │
│            ┌─────────────────┐                                    │
│            │ Entity Directory │                                   │
│            │                  │                                   │
│            │ Unified UUIDs    │                                   │
│            │ Cross-service    │                                   │
│            │ Persistent       │                                   │
│            └─────────────────┘                                    │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

This means:
- Agents authenticate and receive scoped tokens
- Actions are auditable to specific agent identities
- Entitlements control what agents can do
- Entity UUIDs persist even when the agent process restarts

### 2. Graph-Based Execution

Complex AI workflows are expressed as graphs, not code:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Assistants Service                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Prompt Graph (DAG)                   Rule Engine                  │
│   ┌─────────────────────────┐         ┌─────────────────────────┐  │
│   │                         │         │                         │  │
│   │  [Classify] ─► [Route]  │         │  ON message.received    │  │
│   │       │           │     │         │  IF intent = "billing"  │  │
│   │       ▼           ▼     │         │  THEN route.to.billing  │  │
│   │  [Respond]   [Handoff]  │         │                         │  │
│   │                         │         └─────────────────────────┘  │
│   └─────────────────────────┘                                       │
│                                                                      │
│   Actions: llm.invoke, message.send, service.call, webhook.call,    │
│            handoff.create, context.update, parallel, loop,          │
│            condition, code.tool.invoke, workspace.create            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

Benefits:
- Workflows are inspectable and modifiable without code changes
- The rule engine handles event-driven logic declaratively
- Complex branching, loops, and parallel execution are built-in
- State is managed by the platform, not custom code

### 3. Explicit Communication Contracts

Services don't communicate implicitly. Every channel requires authorization:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Network Service                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌─────────────┐                        ┌─────────────┐            │
│   │  Service A  │                        │  Service B  │            │
│   └──────┬──────┘                        └──────┬──────┘            │
│          │                                      │                    │
│          │         ┌───────────────┐           │                    │
│          └────────►│   Contract    │◄──────────┘                    │
│                    │               │                                 │
│                    │ from: A       │                                 │
│                    │ to: B         │                                 │
│                    │ events: [x,y] │                                 │
│                    │ boundaries: * │                                 │
│                    └───────────────┘                                 │
│                           │                                          │
│                           ▼                                          │
│                    ┌───────────────┐                                 │
│                    │ Policy Engine │                                 │
│                    │               │                                 │
│                    │ allow/deny    │                                 │
│                    │ route         │                                 │
│                    │ transform     │                                 │
│                    │ log           │                                 │
│                    └───────────────┘                                 │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

This provides:
- Visible communication topology
- Centralized policy enforcement
- Event tracing across the mesh
- Hash-based integrity verification (HMAC-SHA256)

### 4. Multi-Tenant by Default

Every service is designed for isolation from the start:

```
Request Headers:
  X-Org-Id: org_acme
  X-Service-Id: assistant:support
  X-Env: production
  X-Data-Class: pii

Database Queries:
  SELECT * FROM messages
  WHERE org_id = $org_id      ← Automatic scoping
    AND ...
```

Not an afterthought—multi-tenancy is built into:
- Database query patterns (Drizzle ORM filters)
- Authorization checks (entitlements per org)
- Logging and metrics (org-scoped streams)
- Resource quotas and rate limiting

### 5. Dual-Mode Database

Development and production use the same code with different backends:

```
Production:                    Development:
┌─────────────────┐           ┌─────────────────┐
│   PostgreSQL    │           │     pg-mem      │
│                 │           │   (in-memory)   │
│   Persistent    │           │   Ephemeral     │
│   Migrations    │           │   Instant reset │
│   Connection    │           │   No setup      │
│   pooling       │           │                 │
└─────────────────┘           └─────────────────┘
```

Switch with a single environment variable. Same schemas, same queries, different runtime.

### 6. Stream-Aware Communication

Messages aren't just sent—they're streams that can be controlled:

```typescript
// Control events for AI conversations
await client.sendControl(conversationId, { event: "pause" });   // Pause stream
await client.sendControl(conversationId, { event: "resume" });  // Resume stream
await client.sendControl(conversationId, { event: "preempt" }); // Interrupt
await client.sendControl(conversationId, { event: "handoff" }); // Transfer
await client.sendControl(conversationId, { event: "cancel" });  // Abort
```

LLM responses can take seconds. Users need control. Human-in-the-loop workflows need pause/resume.

---

## Service Responsibilities

### Identity (Port 5001) — The Foundation

Everything authenticates against Identity. It answers:
- **Who is this?** (authentication via JWT, API keys, sessions)
- **What can they do?** (authorization via entitlements)
- **What are their credentials?** (AES-256-GCM encrypted vault)
- **How do I refer to them across services?** (Entity Directory)

Key capabilities:
- Dual principal model (Users + Agents)
- Organization → Project → Application → Service hierarchy
- Entitlement-based permissions (`cap:messaging.send`, `role:org:admin`)
- Token introspection (RFC 7662) for service-to-service auth
- API key lifecycle with scopes and expiration

### Logging (Port 5002) — The Observer

Centralized observability platform:
- **Logs**: Structured with levels, metadata, retention policies
- **Metrics**: Time-series with aggregations (avg, sum, min, max, count)
- **Traces**: Distributed spans across service boundaries
- **Objects**: Metadata tracking for files and blobs
- **AI Analysis**: LLM-powered summarization and investigation

Key capabilities:
- Multi-level scoping: Org → Service → Environment → Data Class
- Real-time streaming via Server-Sent Events
- Configurable retention per data type
- Integration with assistants for automated investigation

### Catalog (Port 5003) — The Registry

Versioned storage for all platform resources:
- **Components**: Reusable building blocks with typed ports
- **Graphs**: Workflow definitions (both prompt and dataflow)
- **Executors**: Custom execution logic
- **Assistants**: AI agent configurations
- **Contexts**: Shared state and configuration
- **Integrations**: Third-party connection definitions

Key capabilities:
- Publish-to-freeze versioning (immutable once published)
- Artifact storage up to 50MB with SHA256 checksums
- Visibility levels: public, org, private
- Cryptographic signatures for trust verification
- Bootstrap resources for platform initialization

### Assistants (Port 5004) — The Orchestrator

Graph-based AI workflow execution:
- **Prompt Graphs**: DAG-based multi-step AI reasoning
- **Rule Engine**: Event-triggered, condition-based actions
- **Turn-Taking**: Multi-agent coordination protocol
- **Code Tools**: File, bash, search in sandboxed workspaces

Key capabilities:
- Actions: `llm.invoke`, `message.send`, `service.call`, `webhook.call`, `handoff.create`, `context.update`, `parallel`, `loop`, `condition`, `code.tool.invoke`
- Conversation states: idle, ai_active, waiting_for_user, handoff_pending, agent_active, resolved, archived
- Justification events for multi-agent turn-taking
- Workspace isolation for code execution

### Messaging (Port 5005) — The Bus

Real-time communication for humans and AI:
- **Conversations**: Private (1:1) and group types
- **Messages**: Threading, soft-delete, priority levels
- **Control Events**: Pause, resume, preempt, route, handoff, cancel
- **Presence**: Typing indicators and activity tracking

Key capabilities:
- Dual protocol: REST API + WebSocket (Socket.IO)
- Participant roles: owner, admin, member
- Message priority: low, normal, high, critical
- Integration with SDN for event routing
- Webhook fallback for assistant notification

### Runtime (Port 5006) — The Executor

Dataflow execution for component graphs:
- **Components**: Typed input/output ports with schema validation
- **Execution**: Topological ordering via Kahn's algorithm
- **Monitoring**: Real-time state via WebSocket
- **Built-ins**: Passthrough, filter, map, merge, split, accumulator, delay

Key capabilities:
- Expression syntax for filter/map/split (JavaScript)
- Backpressure management via queuing during pause
- Execution states: pending, initializing, running, paused, completed, failed, cancelled
- Metrics collection per execution
- Code tool components for file/bash/search operations

### Integrations (Port 5007) — The Gateway

Unified access to LLM providers:
- **Providers**: OpenAI, Anthropic, HuggingFace
- **Operations**: Chat completions, embeddings, text generation
- **Credentials**: Fetched from Identity, never stored locally
- **Normalization**: Consistent response schema across providers

Key capabilities:
- Provider-specific adapters with common interface
- Usage tracking: token counts, latency, success/failure
- Model configuration from Catalog resources
- Execution logging for audit and billing

### Network (Port 5054) — The Mesh

Software-defined networking for service coordination:
- **Nodes**: service, assistant, sandbox, bridge, client types
- **Contracts**: Explicit authorization for communication
- **Policies**: allow, deny, route, transform, log actions
- **Observability**: Topology, traces, flow visualization

Key capabilities:
- Hash-based event integrity (HMAC-SHA256)
- Entity-to-node binding (persistent UUIDs to ephemeral nodes)
- Heartbeat-based liveness detection
- Boundary types: intra (same sandbox), inter (cross-sandbox), extra (external)
- Real-time SDN observability endpoints

---

## Key Innovations

### Entity Directory

A unified identity system spanning all services:

```
Entity UUID: ent_abc123def456

Bound to:
  - User record in Identity
  - Node ID in Network
  - Participant ID in Messaging
  - Actor ID in Assistants
  - Credential owner in vault
```

The same UUID refers to the same entity everywhere. No more mapping tables between services.

### Turn-Taking Protocol

Multi-agent coordination without chaos:

```
Event: user.message.received

Agent A: assistant.intent.claim    ← "I'll handle this"
Agent B: assistant.intent.defer    ← "A is handling it"
Agent A: assistant.action.respond  ← "Here's my response"
```

Agents declare intent before acting. Others observe and defer. No race conditions.

### Entitlements Model

Capabilities, not just roles:

```
Entitlements:
  - cap:messaging.send           ← Can send messages
  - cap:messaging.send:priority  ← Can send priority messages
  - cap:catalog.publish          ← Can publish resources
  - role:org:admin               ← Inherits admin capabilities
```

Fine-grained control over what principals can do, with inheritance for common patterns.

### Contract-Based Communication

No implicit service-to-service calls:

```json
{
  "from": "assistants",
  "to": "messaging",
  "allowedEventTypes": ["message.send", "control.emit"],
  "boundaries": ["intra", "inter"],
  "expiresAt": "2026-12-31T23:59:59Z"
}
```

Every communication path is explicit, auditable, and policy-controlled.

---

## Shared Infrastructure

Eleven `@symbia/*` packages provide standardized building blocks:

| Package | Purpose |
|---------|---------|
| `@symbia/http` | Express server with WebSocket, health checks, graceful shutdown |
| `@symbia/db` | Database abstraction with dual-mode PostgreSQL/in-memory |
| `@symbia/relay` | Network client for SDN integration |
| `@symbia/logging-client` | Telemetry SDK for logs, metrics, traces |
| `@symbia/messaging-client` | Messaging service client |
| `@symbia/catalog-client` | Catalog service client |
| `@symbia/seed` | Deterministic test data generation |
| `@symbia/sys` | System utilities and service registry |
| `@symbia/id` | Identity utilities |
| `@symbia/md` | LLM-ready documentation generation |
| `@symbia/cli` | Unified command-line interface |

---

## Operational Model

### Health Checks

Every service exposes three endpoints:

| Endpoint | Purpose | Returns 200 When |
|----------|---------|------------------|
| `/health` | General status | Service is operational |
| `/health/live` | Kubernetes liveness | Process is running |
| `/health/ready` | Kubernetes readiness | Ready to accept traffic |

### Graceful Shutdown

On SIGTERM/SIGINT:
1. Mark service as not ready (stops new traffic)
2. Wait for pre-shutdown delay (5s default)
3. Run shutdown hooks (cache flush, queue drain)
4. Export in-memory database state (if applicable)
5. Flush telemetry buffers
6. Close database connections
7. Close WebSocket connections
8. Close HTTP server with grace period (30s default)

### Distributed Tracing

Every request receives a trace ID:
1. Check for `x-trace-id` header from upstream
2. Generate UUID if not present
3. Attach to all downstream requests
4. Include in all log entries
5. Return in response header

---

## What We Don't Do

### No Built-in ML/Training
Symbia orchestrates AI, it doesn't train models. Use external providers via Integrations.

### No Guaranteed Exactly-Once Delivery
Network provides best-effort delivery. Implement idempotency in consumers for exactly-once semantics.

### No Global Transactions
Each service owns its database. Cross-service consistency uses eventual consistency patterns.

### No Complex Event Processing
Network routes events, it doesn't aggregate or window them. Use dedicated CEP tools if needed.

---

## Deployment Patterns

### Development
```bash
# All services on localhost, in-memory databases
cd identity && SESSION_SECRET=dev npm run dev
cd catalog && npm run dev
# ...
```

### Docker Compose
```bash
docker-compose up -d    # Start all services with PostgreSQL
docker-compose logs -f  # View logs
docker-compose down     # Stop
```

### Production (Kubernetes)
- Horizontal scaling with stateless services
- PostgreSQL with replication
- Redis adapter for Socket.IO clustering
- Secrets management (Vault, AWS Secrets Manager)
- Health check probes configured

---

## Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Runtime | Node.js 20+ | Async I/O, TypeScript support |
| Framework | Express 4/5 | Mature, well-understood |
| Real-time | Socket.IO 4.x | WebSocket with fallbacks |
| Database | PostgreSQL 15+ | ACID, JSON support |
| ORM | Drizzle | Type-safe, lightweight |
| Testing | pg-mem | In-memory PostgreSQL |
| Validation | Zod | Schema validation with type inference |
| Build | esbuild, tsx | Fast TypeScript compilation |

---

## Summary

Symbia Stack provides infrastructure for LLM-native applications:

| Traditional | Symbia |
|-------------|--------|
| API keys for everything | Agents with identity and entitlements |
| Custom state machines | Graph-based workflows |
| HTTP-only communication | WebSocket-first with control events |
| Scattered logging | Unified observability with AI analysis |
| Implicit service calls | Explicit contracts with policy enforcement |

It's not a framework—it's infrastructure. Build your AI applications on primitives that understand what AI applications need.

---

*This document reflects the Symbia Stack architectural intent as of January 2026.*
