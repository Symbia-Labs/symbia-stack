# Symbia

Symbia is a distributed platform for building, orchestrating, and monitoring autonomous AI workflows. It provides the foundational infrastructure for creating intelligent assistants, executing graph-based automation, managing real-time messaging, and observing system behavior across a multi-tenant environment.

## Functions

### Identity & Access Control
The platform provides centralized authentication and authorization through the **Identity Service**:
- **User Authentication** - Email/password login with JWT tokens (7-day expiration)
- **Agent Authentication** - AI actors authenticate with credentials and receive scoped tokens
- **Organization Hierarchy** - Organizations contain projects, applications, and services
- **API Key Management** - Create, rotate, and revoke keys with defined scopes
- **Token Introspection** - RFC 7662-compliant validation for service-to-service auth
- **Entitlement-Based Access** - Fine-grained permissions via capabilities and roles

### AI Assistant Orchestration
The **Assistants Service** provides a graph-based execution engine for AI workflows:
- **Prompt Graphs** - Node-based execution DAGs for multi-step AI reasoning
- **Rule Engine** - Event-triggered, condition-based action execution
- **LLM Integration** - Native support for OpenAI, Anthropic, Azure, and Google providers
- **Conversation State** - Persistent context management across interactions
- **Handoff Workflows** - Seamless transitions between bots and human agents
- **Built-in Assistants** - Pre-configured analysts for logs, metrics, and debugging

### Dataflow Execution
The **Runtime Service** executes graph-based workflows with message-passing semantics:
- **Topological Execution** - Automatic ordering via Kahn's algorithm
- **Component Abstraction** - Reusable building blocks with typed input/output ports
- **Backpressure Management** - Queue-based handling during pauses
- **Real-Time Monitoring** - WebSocket events for live execution tracking
- **Built-in Components** - Core transformations (map, filter, split), I/O, and data processing

### Resource Registry
The **Catalog Service** provides versioned storage for platform resources:
- **Resource Types** - Components, contexts, integrations, graphs, executors, assistants
- **Version Control** - Immutable snapshots with changelogs
- **Artifact Storage** - File attachments with SHA256 checksums
- **Access Policies** - Visibility levels (public, org, private) with granular permissions
- **Bootstrap Resources** - Public resources for client initialization

### Real-Time Messaging
The **Messaging Service** enables bidirectional communication:
- **Dual Protocol** - REST API for CRUD, WebSocket for real-time delivery
- **Conversation Types** - Private (1:1) and group conversations
- **Control Events** - Stream pause/resume, preemption, routing, handoff
- **Participant Roles** - Owner, admin, member with role-based permissions
- **Typing Indicators** - Real-time presence and activity broadcasts

### Event Routing
The **Network Service** provides service mesh capabilities:
- **Event Routing** - Route typed events between connected nodes
- **Contract Enforcement** - Control allowed event types between services
- **Policy Engine** - Hash-based security with allow/deny/route/transform actions
- **SoftSDN Observability** - Read-only API for topology and event tracing
- **Boundary Types** - Intra (same sandbox), inter (cross-sandbox), extra (external)

### Observability
The **Logging Service** provides centralized telemetry:
- **Log Aggregation** - Structured logs with levels, metadata, and retention policies
- **Metrics Collection** - Time-series data with aggregations and label filtering
- **Distributed Tracing** - Trace spans across service boundaries
- **AI-Powered Analysis** - LLM-assisted log summarization and error investigation
- **Multi-Tenant Scoping** - Org/service/environment isolation

### LLM Provider Gateway
The **Integrations Service** provides unified access to AI providers:
- **Multi-Provider Support** - OpenAI, Anthropic, HuggingFace with normalized responses
- **Credential Routing** - Fetches API keys from Identity, never stores them
- **Response Normalization** - Consistent format across providers
- **Usage Tracking** - Token counts and request metadata
- **Operation Types** - Chat completions, embeddings, text generation

## Capabilities

### Multi-Tenant Architecture
Every service in the platform is designed for multi-tenancy:
- Organization-scoped data isolation
- Header-based context propagation (`X-Org-Id`, `X-Service-Id`, `X-Env`)
- Cross-org access for super admins
- Configurable data classification (`none`, `pii`, `phi`, `secret`)

### Service Mesh Communication
Services communicate through the relay system:
- Socket.IO-based event routing
- Automatic service discovery and registration
- Contract-based authorization between nodes
- Request/response patterns with timeout handling
- Graceful degradation when network is unavailable

### Dual-Mode Database
All database-backed services support:
- **Production Mode** - PostgreSQL via Drizzle ORM with connection pooling
- **Development Mode** - In-memory pg-mem for rapid iteration and testing
- Automatic mode detection based on environment variables
- Database export for debugging and migration

### Real-Time Operations
WebSocket support across services enables:
- Live execution monitoring
- Typing indicators and presence
- Event streaming and tracing
- Control event propagation

### AI Integration
Native LLM provider support includes:
- OpenAI (GPT-4, GPT-4o, GPT-3.5-turbo)
- Anthropic (Claude 3 Opus, Sonnet, Haiku)
- Azure OpenAI
- Google Vertex AI (Gemini)

### Security Patterns
Security is built into the platform:
- JWT authentication with configurable secrets
- API key management with scopes and expiration
- Rate limiting on sensitive endpoints
- CORS configuration with wildcard patterns
- Request logging with sensitive data redaction

## Opportunities

### Extensibility Points

**Custom Components**
Register new runtime components with typed ports:
```typescript
{
  id: "my.custom.processor",
  ports: {
    inputs: [{ name: "in", schema: { type: "object" } }],
    outputs: [{ name: "out", schema: { type: "object" } }]
  },
  execution: {
    type: "javascript",
    source: "return { process: async (ctx, port, value) => { ctx.emit('out', result); } }"
  }
}
```

**Custom Assistants**
Build domain-specific AI assistants via Catalog configuration:
```json
{
  "key": "my-assistant",
  "type": "assistant",
  "metadata": {
    "principalId": "assistant:my-assistant",
    "capabilities": ["data.query", "messaging.send"],
    "modelConfig": { "provider": "openai", "model": "gpt-4o" }
  }
}
```

**Custom Rule Actions**
Extend the rule engine with new action types:
- `llm.invoke` - LLM calls with context injection
- `service.call` - Cross-service API calls
- `webhook.call` - External HTTP webhooks
- `parallel` - Concurrent action execution
- `loop` - Collection iteration

**External Integrations**
Bridge external systems through the Network Service:
- Register bridge nodes for external APIs
- Define contracts for allowed event types
- Apply policies for filtering and transformation

### Deployment Patterns

**Standalone Development**
Each service runs independently with in-memory databases:
```bash
IDENTITY_USE_MEMORY_DB=true npm run dev
```

**Containerized Production**
Services include Dockerfiles for container orchestration:
- Kubernetes-ready health checks (`/health/live`, `/health/ready`)
- Graceful shutdown with connection draining
- Environment-based configuration

**Service Composition**
Mix and match services based on requirements:
- Identity + Messaging for chat applications
- Identity + Catalog + Runtime for workflow automation
- Full stack for complete AI assistant platforms

### Integration Scenarios

**Chat Applications**
- Use Messaging Service for real-time communication
- Connect Assistants Service for AI responses
- Implement handoff workflows for human escalation

**Workflow Automation**
- Define graphs in Catalog Service
- Execute via Runtime Service
- Monitor through Logging Service

**Multi-Agent Systems**
- Register agents via Identity Service
- Route messages through Network Service
- Coordinate via Assistants rule engine

**Observability Platforms**
- Ingest logs, metrics, traces to Logging Service
- Use AI analysis for error investigation
- Query across services with multi-tenant scoping

## Architecture

### Services

| Service | Port | Description |
|---------|------|-------------|
| [Identity](identity/) | 5001 | Authentication, authorization, organization management |
| [Logging](logging/) | 5002 | Logs, metrics, traces, AI analysis |
| [Catalog](catalog/) | 5003 | Resource registry with versioning |
| [Assistants](assistants/) | 5004 | AI assistant orchestration engine |
| [Messaging](messaging/) | 5005 | Real-time messaging bus |
| [Runtime](runtime/) | 5006 | Graph execution engine |
| [Integrations](integrations/) | 5007 | LLM provider gateway and credential routing |
| [Network](network/) | 5054 | Event routing and service mesh |

### Shared Libraries

| Package | Description |
|---------|-------------|
| [@symbia/http](symbia-http/) | Express server, WebSocket, middleware, health checks |
| [@symbia/db](symbia-db/) | Database initialization, Drizzle ORM, index patterns |
| [@symbia/relay](symbia-relay/) | Network client for service-to-service communication |
| [@symbia/logging-client](symbia-logging-client/) | Telemetry client for logs, metrics, traces |
| [@symbia/messaging-client](symbia-messaging-client/) | Messaging service client |
| [@symbia/catalog-client](symbia-catalog-client/) | Catalog service client |
| [@symbia/seed](symbia-seed/) | Test data seeding utilities |
| [@symbia/sys](symbia-sys/) | System utilities and service registry |
| [@symbia/md](symbia-md/) | Documentation generation |
| [@symbia/cli](symbia-cli/) | Command-line interface tools |

### Technology Stack

- **Runtime:** Node.js 20
- **Language:** TypeScript 5.x
- **Framework:** Express.js 4/5
- **Database:** PostgreSQL with Drizzle ORM
- **WebSocket:** Socket.IO 4.x
- **Build:** esbuild, tsx
- **Validation:** Zod schemas

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+ (or use in-memory mode for development)

### Start All Services

Use Docker Compose to launch all services:

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

### Service Dependencies

Services should be started in this order due to dependencies:

```
┌─────────────────────────────────────────────────────────┐
│  1. Network (5054) - Service mesh, no dependencies      │
│  2. Identity (5001) - Auth, no service dependencies     │
│  3. Logging (5002) - Telemetry, no service dependencies │
├─────────────────────────────────────────────────────────┤
│  4. Catalog (5003) - Depends on: Identity               │
│  5. Messaging (5005) - Depends on: Identity             │
│  6. Integrations (5007) - Depends on: Identity, Catalog │
├─────────────────────────────────────────────────────────┤
│  7. Runtime (5006) - Depends on: Catalog                │
│  8. Assistants (5004) - Depends on: Catalog, Identity,  │
│                         Integrations (optional)         │
└─────────────────────────────────────────────────────────┘
```

### Development Mode

Each service can run independently with in-memory databases:

```bash
# Run any service in development
cd identity && SESSION_SECRET=dev-secret npm run dev
cd catalog && CATALOG_USE_MEMORY_DB=true npm run dev
cd messaging && npm run dev
```

### Production Mode

Configure PostgreSQL and run built services:

```bash
# Build and start a service
cd identity && npm run build
DATABASE_URL=postgresql://... npm run start
```

### Environment Variables

Service endpoints are resolved via `@symbia/sys` with environment variable overrides:

| Variable | Description | Default |
|----------|-------------|---------|
| `{SERVICE}_SERVICE_URL` | Service endpoint override | `localhost:{port}` |
| `DATABASE_URL` | PostgreSQL connection string | In-memory pg-mem |
| `{SERVICE}_USE_MEMORY_DB` | Enable in-memory database | `false` |
| `SESSION_SECRET` | JWT signing secret (required for Identity) | - |
| `OPENAI_API_KEY` | OpenAI API key for LLM features | - |
| `ANTHROPIC_API_KEY` | Anthropic API key for LLM features | - |

Each service has a `.env.example` file with all available configuration options.

## Documentation

Each service provides multiple documentation formats:

| Endpoint | Description |
|----------|-------------|
| `/docs/openapi.json` | OpenAPI 3.x specification |
| `/docs/llms.txt` | Quick reference for LLM context |
| `/docs/llms-full.txt` | Comprehensive LLM documentation |
| `/health` | Service health status |
| `/api/bootstrap/service` | Service discovery metadata |

## License

MIT License - see [LICENSE](LICENSE) for details.
