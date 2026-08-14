# Symbia Stack

An LLM-native orchestration platform for building, deploying, and operating autonomous AI workflows. Symbia provides the foundational infrastructure for creating intelligent assistants, executing graph-based automation, managing real-time messaging, and observing system behavior across a multi-tenant environment.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Symbia Stack                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Assistants │  │   Runtime   │  │ Integrations│  │   Network   │        │
│  │    :5004    │  │    :5006    │  │    :5007    │  │    :5009    │        │
│  │             │  │             │  │             │  │             │        │
│  │ AI Workflow │  │  Dataflow   │  │ LLM Gateway │  │ Service Mesh│        │
│  │   Engine    │  │  Executor   │  │  & Routing  │  │  & Events   │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │               │
│  ┌──────┴────────────────┴────────────────┴────────────────┴──────┐        │
│  │                                                                 │        │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │        │
│  │  │   Catalog   │  │  Messaging  │  │   Logging   │             │        │
│  │  │    :5003    │  │    :5005    │  │    :5002    │             │        │
│  │  │             │  │             │  │             │             │        │
│  │  │  Resource   │  │  Real-time  │  │ Observability│            │        │
│  │  │  Registry   │  │    Comms    │  │   Platform  │             │        │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │        │
│  │         │                │                │                     │        │
│  │  ┌──────┴────────────────┴────────────────┴──────┐             │        │
│  │  │                                                │             │        │
│  │  │  ┌─────────────────────────────────────────┐  │             │        │
│  │  │  │              Identity                    │  │             │        │
│  │  │  │               :5001                      │  │             │        │
│  │  │  │                                          │  │             │        │
│  │  │  │   Authentication • Authorization • IAM   │  │             │        │
│  │  │  └─────────────────────────────────────────┘  │             │        │
│  │  │                                                │             │        │
│  │  └────────────────────────────────────────────────┘             │        │
│  │                                                                 │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| [Identity](identity/) | 5001 | Authentication, authorization, credential management, Entity Directory |
| [Logging](logging/) | 5002 | Centralized logs, metrics, traces, and AI-powered analysis |
| [Catalog](catalog/) | 5003 | Versioned registry for components, graphs, assistants, integrations |
| [Assistants](assistants/) | 5004 | Graph-based AI workflow execution with rule engine |
| [Messaging](messaging/) | 5005 | Real-time communication bus with WebSocket support |
| [Runtime](runtime/) | 5006 | Dataflow execution engine for component graphs |
| [Integrations](integrations/) | 5007 | LLM provider gateway (OpenAI, Anthropic, HuggingFace, symbia-labs) |
| [Models](models/) | 5008 | Local LLM inference with node-llama-cpp (GGUF models) |
| [Network](network/) | 5009 | Software-defined network for event routing and service mesh |
| [Directory](directory/) | 5010 | Federation control plane: peer directory, foreign-node table, admission. Distinct from Identity's Entity Directory |

And the two front ends:

| Service | Port | Description |
|---------|------|-------------|
| [API / admin](service-admin/) | 9000 | The front door. **The only port published to your host by default.** |
| [Control center](symbia-control-center/) | 8000 | Operator console. Internal by default; see the dev overlay below. |

The ten services above listen on their own ports and reach each other over the
Compose network by name. They are **not** published to your host unless you ask
for them — see [What a plain Compose run publishes](#what-a-plain-compose-run-publishes).

## Shared Libraries

| Package | Description |
|---------|-------------|
| [@symbia/http](symbia-http/) | Express server framework with WebSocket, middleware, health checks |
| [@symbia/db](symbia-db/) | Database abstraction with Drizzle ORM and pg-mem support |
| [@symbia/relay](symbia-relay/) | Service mesh client for inter-service communication |
| [@symbia/logging-client](symbia-logging-client/) | Telemetry SDK for logs, metrics, and traces |
| [@symbia/messaging-client](symbia-messaging-client/) | Messaging service client |
| [@symbia/catalog-client](symbia-catalog-client/) | Catalog service client |
| [@symbia/seed](symbia-seed/) | Deterministic test data generation |
| [@symbia/sys](symbia-sys/) | System utilities and service registry |
| [@symbia/id](symbia-id/) | Identity utilities |
| [@symbia/md](symbia-md/) | Documentation generation |

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 20+ and PostgreSQL 15+ — only for the no-Docker path below

### From nothing to a running stack

```bash
git clone https://github.com/Symbia-Labs/symbia-stack.git
cd symbia-stack
./start.sh
```

First run builds images, bootstraps the database, and prompts you to create a
super-admin account. There are no default credentials. Later runs skip all of
that and restart fast.

Then open **<http://localhost:9000>** — the API and admin front end.

`start.sh` is the *developer* path, so it also gives you the operator console on
**<http://localhost:8000>**, Postgres on 5432, and each service on 5001–5010.

### What a plain Compose run publishes

```bash
docker-compose up -d
```

**One port: 9000.** Nothing else reaches your host, because nothing else needs
to — the services address each other over the Compose network by name. That is
the default surface, and it is what someone who clones this repo gets unless
they ask for more.

To ask for more, add the developer overlay — this is exactly what `start.sh`
does for you via `COMPOSE_FILE`:

```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

The overlay is deliberately **not** named `docker-compose.override.yml`, which
Compose would load automatically for everyone — that would make the default
above a claim rather than a fact. `npm run check:ports` asserts it stays true.

### Using the Startup Script (Recommended)

The `start.sh` script handles first-run initialization and subsequent restarts automatically.

```bash
# First run - will prompt for super admin credentials
./start.sh

# Subsequent runs - fast restart (no prompts)
./start.sh

# Start fresh with empty database (removes all existing data)
./start.sh --new

# Force rebuild all images
./start.sh --rebuild

# Combined: fresh start with rebuilt images
./start.sh --new --rebuild

# Skip admin creation prompt
./start.sh --skip-admin
```

#### First Run Setup

On first run, you will be prompted to create the super admin account:

```
╔════════════════════════════════════════════════════════════╗
║              SUPER ADMIN SETUP REQUIRED                     ║
╚════════════════════════════════════════════════════════════╝

  Enter admin name (display name): _
  Enter admin email: _
  Enter admin password: _
  Confirm password: _
  Enter organization name: _
```

**Security Note**: There are no default usernames or passwords. All credentials must be entered manually during first-run setup. The first user is automatically granted **super admin** privileges with visibility into all organizations.

#### What the Script Does

| Phase | First Run | Subsequent Runs | `--new` Flag |
|-------|-----------|-----------------|--------------|
| Stop services | No | No | Yes |
| Remove database volume | No | No | Yes (with confirmation) |
| Build base image | Yes (if missing) | Skip | Skip (unless `--rebuild`) |
| Build service images | Yes (if missing) | Skip | Skip (unless `--rebuild`) |
| Database bootstrap | Yes | Skip | Yes |
| Super admin setup | **Interactive prompt** | Skip (users exist) | **Interactive prompt** |
| Start services | Yes | Yes | Yes |

### Using Docker Compose Directly

For manual control:

```bash
# Start all services — publishes 9000 only
docker-compose up -d

# Start all services and publish the dev ports too (5432, 5001-5010, 8000)
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Full reset (removes data)
docker-compose down -v
```

Note that `docker-compose down` must see the same file set that brought the
stack up, so pass both `-f` flags if you started with both.

### Manual Development Setup

Services should be started in dependency order:

```bash
# Tier 1: No dependencies
cd identity && npm install && SESSION_SECRET=dev-secret npm run dev
cd network && npm install && npm run dev
cd logging && npm install && npm run dev

# Tier 2: Depends on Identity
cd catalog && npm install && npm run dev
cd messaging && npm install && npm run dev
cd integrations && npm install && npm run dev

# Tier 3: Depends on multiple services
cd runtime && npm install && npm run dev
cd assistants && npm install && npm run dev
```

### Service Dependencies

```
Tier 1 (Foundational):
  ├── Identity (5001)     ← No dependencies
  ├── Network (5009)      ← No dependencies
  └── Logging (5002)      ← No dependencies

Tier 2 (Core Services):
  ├── Catalog (5003)      ← Identity
  ├── Messaging (5005)    ← Identity, Network
  ├── Integrations (5007) ← Identity
  └── Directory (5010)    ← Identity

Tier 3 (Application Layer):
  ├── Runtime (5006)      ← Identity, Catalog
  ├── Assistants (5004)   ← Identity, Catalog, Messaging, Integrations
  └── Models (5008)       ← Identity, Catalog, Network
```

## Core Capabilities

### Identity & Access Management
- **Dual Principal Model**: Users (humans) and Agents (AI) as first-class identities
- **Entity Directory**: Unified UUID-based identity across all services
- **JWT Authentication**: 7-day tokens with refresh support
- **API Key Management**: Scoped keys with expiration and rotation
- **Entitlements**: Fine-grained capability-based permissions (`cap:*`, `role:*`)
- **Credential Vault**: AES-256-GCM encrypted storage for secrets

### AI Workflow Orchestration
- **Prompt Graphs**: DAG-based execution with message-passing semantics
- **Rule Engine**: Event-triggered, condition-based action execution
- **Turn-Taking Protocol**: Claim/defer/observe/respond for multi-agent coordination
- **Handoff Workflows**: Seamless transitions between AI and human agents
- **Code Tools**: File operations, bash execution, search within sandboxed workspaces

### Dataflow Execution
- **Component Abstraction**: Typed input/output ports with schema validation
- **Topological Ordering**: Automatic execution order via Kahn's algorithm
- **Built-in Components**: Passthrough, filter, map, merge, split, accumulator, delay
- **Real-time Monitoring**: WebSocket events for execution state tracking
- **Backpressure Management**: Queue-based handling during pauses

### Real-time Communication
- **Dual Protocol**: REST API + WebSocket (Socket.IO)
- **Conversation Types**: Private (1:1) and group conversations
- **Control Events**: Pause, resume, preempt, route, handoff, cancel
- **Typing Indicators**: Real-time presence and activity broadcasts
- **Message Threading**: Nested conversations with soft-delete support

### Service Mesh & Event Routing
- **Contract-Based Authorization**: Explicit permissions for service communication
- **Policy Engine**: Allow, deny, route, transform, log actions
- **Hash-Based Security**: HMAC-SHA256 for event integrity
- **SDN Observability**: Real-time topology, traces, and flow visualization
- **Entity Binding**: Persistent identities mapped to ephemeral nodes

### Observability
- **Log Aggregation**: Structured logs with levels, metadata, retention
- **Metrics Collection**: Time-series data with aggregations
- **Distributed Tracing**: Spans across service boundaries
- **AI-Powered Analysis**: LLM-assisted log summarization and investigation
- **Object Tracking**: Metadata for files and blobs

### LLM Integration
- **Multi-Provider Support**: OpenAI, Anthropic, HuggingFace, symbia-labs (local)
- **Local Inference**: Run GGUF models locally via Models service (node-llama-cpp)
- **Credential Routing**: Fetches keys from Identity, never stores locally
- **Response Normalization**: Consistent schema across providers
- **Usage Tracking**: Token counts, latency, success/failure metrics

## Configuration

### Environment Variables

Each service reads configuration from environment variables. See `.env.example` in each service directory.

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `{SERVICE}_USE_MEMORY_DB` | Use in-memory database (development) |
| `SESSION_SECRET` | JWT signing secret (Identity) |
| `OPENAI_API_KEY` | OpenAI API key (Integrations) |
| `ANTHROPIC_API_KEY` | Anthropic API key (Integrations) |
| `{SERVICE}_SERVICE_URL` | Override service endpoint |

### Health Checks

All services expose health endpoints:

| Endpoint | Purpose |
|----------|---------|
| `/health` | General service health |
| `/health/live` | Kubernetes liveness probe |
| `/health/ready` | Kubernetes readiness probe |

### Documentation Endpoints

Each service provides auto-generated documentation:

| Endpoint | Format |
|----------|--------|
| `/docs/openapi.json` | OpenAPI 3.x specification |
| `/docs/llms.txt` | Quick reference for LLM context |
| `/docs/llms-full.txt` | Comprehensive LLM documentation |

## Multi-Tenancy

All services support multi-tenant operation:

- **Organization Scoping**: Data isolated by `org_id`
- **Header Propagation**: `X-Org-Id`, `X-Service-Id`, `X-Env` for context
- **Data Classification**: `none`, `pii`, `phi`, `secret` levels
- **Cross-Org Access**: Super admin capabilities for platform operations

## Security

- **Authentication**: JWT tokens, API keys, session cookies
- **Authorization**: Entitlement-based with role inheritance
- **Encryption**: AES-256-GCM for credentials at rest
- **Password Hashing**: bcrypt with configurable rounds
- **Event Integrity**: HMAC-SHA256 signatures on network events
- **Audit Logging**: All significant actions tracked

## Development

### Database Modes

Services support dual database modes:
- **PostgreSQL**: Production mode with full persistence
- **pg-mem**: In-memory mode for rapid development and testing

```bash
# Production
DATABASE_URL=postgresql://user:pass@localhost/symbia npm start

# Development (in-memory)
IDENTITY_USE_MEMORY_DB=true npm run dev
```

### Building

```bash
# Build a service
cd identity && npm run build

# Run production build
npm start
```

### Testing

```bash
# Run with in-memory database
cd identity && SESSION_SECRET=test npm run dev
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.
