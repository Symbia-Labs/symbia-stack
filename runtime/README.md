# Symbia Runtime Service

The Runtime Service is a graph-based execution engine for running dataflow workflows. It provides component instantiation, message routing between connected nodes, execution lifecycle management, and real-time monitoring via WebSocket for the Symbia platform.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Authentication](#authentication)
- [API Reference](#api-reference)
- [WebSocket Events](#websocket-events)
- [Data Models](#data-models)
- [Graph Execution](#graph-execution)
- [Components](#components)
- [Built-in Components](#built-in-components)
- [Configuration](#configuration)
- [LLM Integration Guide](#llm-integration-guide)

---

## Overview

### Core Capabilities

| Capability | Description |
|------------|-------------|
| `runtime.graph.load` | Load and validate graph definitions |
| `runtime.graph.execute` | Execute loaded graphs |
| `runtime.execution.manage` | Pause, resume, stop executions |
| `runtime.component.register` | Register custom components |

### Key Features

- **Dataflow Execution:** Message-based execution between connected nodes
- **Topological Ordering:** Automatic execution order via Kahn's algorithm
- **Component Abstraction:** Reusable components with typed ports
- **Real-Time Monitoring:** WebSocket events for live execution tracking
- **Backpressure Management:** Queue-based message handling during pauses
- **Built-in Components:** Core transformations, I/O, and data processing
- **Catalog Integration:** Load components from Catalog Service

### Execution Model

```
┌─────────────────────────────────────────────────────────┐
│                    Graph Execution                       │
├─────────────────────────────────────────────────────────┤
│  ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│  │  Input   │───▶│  Filter  │───▶│   Map    │───▶ Out  │
│  │   Node   │    │   Node   │    │   Node   │          │
│  └──────────┘    └──────────┘    └──────────┘          │
│       ▲                                                  │
│       │ inject                                           │
│  ─────┴─────────────────────────────────────────────────│
│                   Message Flow                           │
└─────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Environment Variables

```bash
# Optional (all have defaults)
PORT=5006
IDENTITY_SERVICE_URL=https://identity.example.com
CATALOG_ENDPOINT=http://localhost:5003/api
MAX_CONCURRENT_EXECUTIONS=100
DEFAULT_EXECUTION_TIMEOUT=300000
```

### Running the Service

```bash
# Development with hot reload
npm run dev

# Production
npm run build && npm run start
```

### Default Port

The service runs on port **5006** by default (resolved from ServiceId.RUNTIME).

---

## Architecture

### Directory Structure

```
runtime/
├── server/src/
│   ├── index.ts                # Entry point
│   ├── config.ts               # Configuration
│   ├── auth.ts                 # Authentication middleware
│   ├── socket.ts               # WebSocket handlers
│   ├── catalog-client.ts       # Catalog integration
│   ├── openapi.ts              # OpenAPI specification
│   ├── executor/
│   │   └── graph-executor.ts   # Core execution engine
│   ├── compiler/
│   │   └── routine-compiler.ts # Routine to graph compiler
│   ├── runtime/
│   │   ├── component-runtime.ts # Component management
│   │   ├── builtin-components.ts # Built-in components
│   │   └── code-tool-handlers.ts # Code tool components
│   ├── workspace/
│   │   ├── workspace-manager.ts # Workspace lifecycle
│   │   ├── path-validator.ts   # Path security validation
│   │   └── types.ts            # Workspace types
│   ├── routes/
│   │   ├── graphs.ts           # Graph CRUD endpoints
│   │   ├── executions.ts       # Execution management
│   │   ├── components.ts       # Component catalog
│   │   └── routines.ts         # Routine compilation
│   └── types/
│       ├── graph.ts            # Graph types
│       ├── execution.ts        # Execution types
│       ├── routine.ts          # Routine types
│       └── code-tools.ts       # Code tool types
├── docs/
│   ├── openapi.json            # OpenAPI specification
│   ├── llms.txt                # Quick LLM reference
│   └── llms-full.txt           # Full LLM documentation
└── dist/                       # Compiled output
```

### Technology Stack

- **Runtime:** Node.js 20
- **Framework:** Express.js 5.x
- **WebSocket:** Socket.IO 4.x
- **Language:** TypeScript 5.x
- **Storage:** In-memory (no database)
- **Execution:** JavaScript/TypeScript via `new Function()`

---

## Authentication

### Authentication Methods

| Method | Header | Description |
|--------|--------|-------------|
| Bearer Token | `Authorization: Bearer <jwt>` | JWT from Identity Service |
| API Key | `X-API-Key: <key>` | Service-to-service |
| Session Cookie | `token` or `symbia_session` | Browser session |

### User/Agent Object

```typescript
{
  id: string,
  email?: string,
  name?: string,
  type: 'user' | 'agent',
  agentId?: string,
  orgId?: string,
  organizations: [{id, name, slug, role}],
  entitlements: string[],
  roles: string[],
  isSuperAdmin: boolean
}
```

---

## API Reference

### Graph Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/graphs` | Load graph definition |
| GET | `/api/graphs` | List loaded graphs |
| GET | `/api/graphs/:id` | Get graph details |
| DELETE | `/api/graphs/:id` | Unload graph |
| POST | `/api/graphs/:id/execute` | Start execution |

**Load Graph (POST /api/graphs):**
```json
{
  "symbia": "1.0",
  "name": "My Workflow",
  "version": "1.0.0",
  "nodes": [
    {"id": "input", "component": "symbia.core.passthrough"},
    {"id": "transform", "component": "symbia.core.map", "config": {"transform": "value * 2"}},
    {"id": "output", "component": "symbia.core.logger"}
  ],
  "edges": [
    {"id": "e1", "source": {"node": "input", "port": "out"}, "target": {"node": "transform", "port": "in"}},
    {"id": "e2", "source": {"node": "transform", "port": "out"}, "target": {"node": "output", "port": "in"}}
  ]
}
```

**Response:**
```json
{
  "id": "graph-uuid",
  "name": "My Workflow",
  "version": "1.0.0",
  "nodeCount": 3,
  "edgeCount": 2,
  "topology": {
    "sorted": ["input", "transform", "output"],
    "levels": {"input": 0, "transform": 1, "output": 2},
    "inputNodes": ["input"],
    "outputNodes": ["output"]
  },
  "loadedAt": "2024-01-15T10:30:00Z"
}
```

### Execution Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/executions` | List executions |
| GET | `/api/executions/:id` | Get execution status |
| GET | `/api/executions/:id/metrics` | Get execution metrics |
| POST | `/api/executions/:id/inject` | Inject message |
| POST | `/api/executions/:id/pause` | Pause execution |
| POST | `/api/executions/:id/resume` | Resume execution |
| POST | `/api/executions/:id/stop` | Stop execution |

**Inject Message:**
```json
{
  "nodeId": "input",
  "port": "in",
  "value": {"data": "hello world"}
}
```

### Component Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/components` | List all components |
| GET | `/api/components/:id` | Get component definition |
| POST | `/api/components` | Register custom component |

### Routine Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/routines/validate` | Validate routine definition without compiling |
| POST | `/api/routines` | Compile and load routines |
| POST | `/api/routines/preview` | Preview compiled output without loading |

**Compile Routines (POST /api/routines):**
```json
{
  "assistantId": "assistant:my-assistant",
  "alias": "myassistant",
  "routines": [
    {
      "id": "main",
      "name": "Main Handler",
      "trigger": { "type": "message.new" },
      "steps": [
        { "id": "respond", "action": "llm.generate", "params": { "model": "gpt-4o" } }
      ]
    }
  ]
}
```

**Response:**
```json
{
  "assistantId": "assistant:my-assistant",
  "compiledAt": "2024-01-15T10:30:00Z",
  "compilerVersion": "1.0.0",
  "routineCount": 1,
  "totalNodeCount": 3,
  "graphs": [{ "id": "graph-uuid", "name": "main", "isMain": true }],
  "warnings": []
}
```

### Workspace Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/workspaces` | Create isolated workspace |
| GET | `/api/workspaces/:id` | Get workspace details |
| DELETE | `/api/workspaces/:id` | Destroy workspace |
| POST | `/api/workspaces/:id/extend` | Extend workspace TTL |

**Create Workspace (POST /api/workspaces):**
```json
{
  "orgId": "org:default",
  "userId": "user:123",
  "conversationId": "conv:456",
  "permissions": { "read": true, "write": true, "execute": false },
  "ttlHours": 24,
  "initialFiles": [
    { "path": "src/index.ts", "content": "console.log('hello');" }
  ]
}
```

**Response:**
```json
{
  "id": "workspace-uuid",
  "rootPath": "/tmp/symbia/workspaces/workspace-uuid",
  "permissions": { "read": true, "write": true, "execute": false },
  "expiresAt": "2024-01-16T10:30:00Z"
}
```

### Health & Stats

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/bootstrap/service` | Service discovery |
| GET | `/api/stats` | Runtime statistics |

### Documentation

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/docs/openapi.json` | OpenAPI specification |
| GET | `/docs/llms.txt` | Quick LLM reference |
| GET | `/docs/llms-full.txt` | Full LLM documentation |

---

## WebSocket Events

### Connection

```javascript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:5006');
```

### Client Events (Send to Server)

| Event | Payload | Description |
|-------|---------|-------------|
| `execution:subscribe` | `{executionId}` | Subscribe to execution events |
| `execution:unsubscribe` | `{executionId}` | Unsubscribe from execution |
| `execution:start` | `{graphId}` | Start graph execution |
| `execution:pause` | `{executionId}` | Pause execution |
| `execution:resume` | `{executionId}` | Resume execution |
| `execution:stop` | `{executionId}` | Stop execution |
| `execution:inject` | `{executionId, nodeId, port, value}` | Inject message |

### Server Events (Receive from Server)

| Event | Payload | Description |
|-------|---------|-------------|
| `execution:started` | `{executionId, graphId, state, startedAt}` | Execution began |
| `execution:paused` | `{executionId, state}` | Execution paused |
| `execution:resumed` | `{executionId, state}` | Execution resumed |
| `execution:completed` | `{executionId, state, metrics, completedAt}` | Execution finished |
| `execution:failed` | `{executionId, state, error}` | Execution error |
| `execution:state` | `{executionId, graphId, state, metrics}` | State update |
| `port:emit` | `{executionId, sourceNode, sourcePort, targetNode, targetPort, value, timestamp, sequence}` | Message emitted |
| `component:invoked` | `{executionId, nodeId, port, timestamp}` | Component executed |
| `metrics:update` | `{executionId, metrics}` | Metrics changed |
| `error` | `{message}` | Error occurred |

### WebSocket Example

```javascript
const socket = io('ws://localhost:5006');

// Subscribe to execution
socket.emit('execution:subscribe', { executionId: 'exec-uuid' }, (response) => {
  console.log('Subscribed:', response);
});

// Listen for events
socket.on('execution:state', (data) => {
  console.log('State:', data.state);
});

socket.on('port:emit', (data) => {
  console.log('Message:', data.sourceNode, '->', data.targetNode, data.value);
});

socket.on('execution:completed', (data) => {
  console.log('Completed with metrics:', data.metrics);
});

// Start execution
socket.emit('execution:start', { graphId: 'graph-uuid' }, (response) => {
  console.log('Started:', response.executionId);
});

// Inject message
socket.emit('execution:inject', {
  executionId: 'exec-uuid',
  nodeId: 'input',
  port: 'in',
  value: { data: 'hello' }
});
```

---

## Data Models

### GraphDefinition

```typescript
{
  symbia: string,              // Version: "1.0"
  name: string,
  version: string,
  description?: string,
  author?: string,
  license?: string,
  nodes: [{
    id: string,
    component: string,         // Component ID
    version?: string,
    config?: Record<string, unknown>,
    position?: {x: number, y: number}
  }],
  edges: [{
    id: string,
    source: {node: string, port: string},
    target: {node: string, port: string}
  }],
  bindings?: Record<string, Record<string, NetworkBinding>>,
  metadata?: Record<string, unknown>
}
```

### LoadedGraph

```typescript
{
  id: string,
  definition: GraphDefinition,
  componentDefinitions: Map<nodeId, ComponentDefinition>,
  topology: {
    sorted: string[],          // Topologically sorted node IDs
    levels: Map<nodeId, number>,
    inputNodes: string[],
    outputNodes: string[]
  },
  loadedAt: Date
}
```

### GraphExecution

```typescript
{
  id: string,
  graphId: string,
  state: 'pending' | 'initializing' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled',
  instances: Map<nodeId, ComponentInstance>,
  metrics: ExecutionMetrics,
  error?: {message: string, nodeId?: string, stack?: string},
  startedAt?: Date,
  completedAt?: Date,
  createdAt: Date
}
```

### ExecutionMetrics

```typescript
{
  messagesProcessed: number,
  messagesEmitted: number,
  componentInvocations: number,
  totalLatencyMs: number,
  avgLatencyMs: number,
  maxLatencyMs: number,
  errorCount: number,
  backpressureEvents: number,
  startTime: number,
  lastActivityTime: number
}
```

### ComponentDefinition

```typescript
{
  id: string,                  // e.g., "symbia.core.map"
  name: string,
  version: string,
  description?: string,
  category?: string,           // core, io, data
  ports: {
    inputs: [{name: string, schema: PortSchema}],
    outputs: [{name: string, schema: PortSchema}]
  },
  config?: Record<string, PortSchema>,
  execution: {
    type: 'javascript' | 'typescript' | 'wasm',
    entrypoint: string,
    source?: string,           // Inline code
    sourceUrl?: string         // Remote source
  }
}
```

### PortMessage

```typescript
{
  id: string,
  executionId: string,
  sourceNodeId: string,
  sourcePort: string,
  targetNodeId: string,
  targetPort: string,
  value: unknown,
  timestamp: number,
  sequence: number
}
```

---

## Graph Execution

### Execution Flow

1. **Load Phase:**
   - Validate graph structure
   - Resolve component definitions for each node
   - Build topological sort (Kahn's algorithm)
   - Identify input/output nodes
   - Store in memory

2. **Start Phase:**
   - Check concurrent execution limit
   - Create component instances for each node
   - Call `initialize()` on each instance
   - Set state to "running"

3. **Processing Phase:**
   - Messages injected or emitted from components
   - Route messages to connected target nodes
   - Execute component handlers
   - Track metrics

4. **Control Phase:**
   - Pause: Queue messages instead of processing
   - Resume: Drain queued messages
   - Stop: Cancel and cleanup

### Topological Ordering

Uses Kahn's algorithm to determine execution order:
- Detects cycles (throws error if found)
- Assigns levels to each node (distance from inputs)
- Identifies input nodes (no incoming edges)
- Identifies output nodes (no outgoing edges)

### Backpressure

- Messages queued when execution paused
- Queue limit: `maxBackpressureQueue` (default: 10,000)
- Backpressure events tracked in metrics
- Queue drained on resume

---

## Components

### Component Handler Interface

```typescript
{
  initialize?: (ctx: ExecutionContext) => Promise<void>,
  process: (ctx: ExecutionContext, port: string, value: unknown) => Promise<void>,
  cleanup?: (ctx: ExecutionContext) => Promise<void>
}
```

### Execution Context

```typescript
{
  executionId: string,
  nodeId: string,
  instanceId: string,
  config: Record<string, unknown>,
  emit: (port: string, value: unknown) => void,
  emitBatch: (port: string, values: unknown[]) => void,
  getState: <T>(key: string) => Promise<T | undefined>,
  setState: <T>(key: string, value: T) => Promise<void>,
  log: (level: string, message: string, meta?: object) => void
}
```

### Register Custom Component

```bash
POST /api/components
Content-Type: application/json

{
  "id": "my.custom.doubler",
  "name": "Doubler",
  "version": "1.0.0",
  "description": "Doubles numeric values",
  "category": "math",
  "ports": {
    "inputs": [{"name": "in", "schema": {"type": "number"}}],
    "outputs": [{"name": "out", "schema": {"type": "number"}}]
  },
  "execution": {
    "type": "javascript",
    "entrypoint": "handler",
    "source": "return { process: async (ctx, port, value) => { ctx.emit('out', value * 2); } }"
  }
}
```

---

## Built-in Components

### Core Components

| Component | Description | Config |
|-----------|-------------|--------|
| `symbia.core.passthrough` | Forwards input unchanged | - |
| `symbia.core.logger` | Logs and forwards | `level`, `prefix` |
| `symbia.core.delay` | Delays by milliseconds | `delayMs` |
| `symbia.core.filter` | Filters by predicate | `predicate` (expression) |
| `symbia.core.map` | Transforms values | `transform` (expression) |
| `symbia.core.merge` | Combines multiple inputs | - |
| `symbia.core.split` | Routes based on condition | `condition` (expression) |
| `symbia.core.accumulator` | Batches values | `batchSize` |

### I/O Components

| Component | Description | Config |
|-----------|-------------|--------|
| `symbia.io.http-request` | Makes HTTP requests | `method`, `url`, `headers`, `body` |

### Data Components

| Component | Description | Config |
|-----------|-------------|--------|
| `symbia.data.json-transform` | Extracts via path | `path` (dot notation) |

### Code Tool Components

Components for workspace-based file and code operations (requires workspace context):

| Component | Description | Input |
|-----------|-------------|-------|
| `symbia.code.file-read` | Read file contents | `{ path, offset?, limit?, encoding? }` |
| `symbia.code.file-write` | Write file contents | `{ path, content, encoding?, createDirectories? }` |
| `symbia.code.file-edit` | Edit file with replacements | `{ path, edits: [{ oldText, newText }], dryRun? }` |
| `symbia.code.glob` | Find files by pattern | `{ pattern, cwd?, ignore?, maxResults? }` |
| `symbia.code.grep` | Search file contents | `{ pattern, path?, glob?, type?, ignoreCase?, contextLines? }` |
| `symbia.code.ls` | List directory contents | `{ path, recursive?, includeHidden?, maxDepth? }` |
| `symbia.code.bash` | Execute shell commands | `{ command, cwd?, timeout?, environment? }` |

**Code Tool Output:**

All code tools emit to `result` port on success or `error` port on failure:

```typescript
// Success
{
  success: true,
  data: { /* tool-specific result */ },
  executionTimeMs: 42
}

// Error
{
  success: false,
  error: "Error message",
  executionTimeMs: 5
}
```

**Example: File Read**
```json
{
  "path": "src/index.ts",
  "offset": 1,
  "limit": 100
}
// Result:
{
  "path": "src/index.ts",
  "content": "import ...",
  "lines": 100,
  "totalLines": 250,
  "truncated": true
}
```

**Example: Grep Search**
```json
{
  "pattern": "function\\s+\\w+",
  "path": "src",
  "type": "ts",
  "contextLines": 2
}
// Result:
{
  "pattern": "function\\s+\\w+",
  "matches": [
    {
      "file": "src/index.ts",
      "line": 42,
      "column": 1,
      "content": "function processData() {",
      "context": { "before": ["", "// Process data"], "after": ["  const x = 1;", "  return x;"] }
    }
  ],
  "filesSearched": 15,
  "truncated": false
}
```

**Workspace Permissions:**

Code tools respect workspace permissions:
- `read`: Required for file-read, glob, grep, ls
- `write`: Required for file-write, file-edit
- `execute`: Required for bash

### Expression Syntax

Components using expressions (`filter`, `map`, `split`) support JavaScript expressions:

```javascript
// Filter: keep values > 10
"value > 10"

// Map: double the value
"value * 2"

// Map: extract field
"value.data.name"

// Split condition: route high values to true port
"value > 100"
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | Auto | Server port (from ServiceId) |
| `NODE_ENV` | `development` | Environment mode |
| `IDENTITY_SERVICE_URL` | `https://identity.example.com` | Identity service |
| `CATALOG_ENDPOINT` | `http://localhost:5003/api` | Catalog service |
| `MAX_CONCURRENT_EXECUTIONS` | `100` | Max parallel executions |
| `DEFAULT_EXECUTION_TIMEOUT` | `300000` | Timeout in ms (5 min) |
| `MAX_BACKPRESSURE_QUEUE` | `10000` | Max queued messages |
| `ISOLATE_POOL_SIZE` | `10` | V8 isolate pool (future) |
| `ENABLE_METRICS` | `true` | Enable metrics collection |

---

## LLM Integration Guide

This section provides guidance for LLMs interacting with the Runtime Service.

### Common Workflows

#### 1. Load and Execute a Graph

```bash
# Load graph
POST /api/graphs
Content-Type: application/json

{
  "symbia": "1.0",
  "name": "Data Pipeline",
  "version": "1.0.0",
  "nodes": [
    {"id": "input", "component": "symbia.core.passthrough"},
    {"id": "filter", "component": "symbia.core.filter", "config": {"predicate": "value > 0"}},
    {"id": "double", "component": "symbia.core.map", "config": {"transform": "value * 2"}},
    {"id": "log", "component": "symbia.core.logger", "config": {"prefix": "Result:"}}
  ],
  "edges": [
    {"id": "e1", "source": {"node": "input", "port": "out"}, "target": {"node": "filter", "port": "in"}},
    {"id": "e2", "source": {"node": "filter", "port": "out"}, "target": {"node": "double", "port": "in"}},
    {"id": "e3", "source": {"node": "double", "port": "out"}, "target": {"node": "log", "port": "in"}}
  ]
}

# Response
{
  "id": "graph-uuid",
  "name": "Data Pipeline",
  "nodeCount": 4,
  "topology": {
    "sorted": ["input", "filter", "double", "log"],
    "inputNodes": ["input"],
    "outputNodes": ["log"]
  }
}

# Start execution
POST /api/graphs/graph-uuid/execute

# Response
{
  "executionId": "exec-uuid",
  "graphId": "graph-uuid",
  "state": "running",
  "startedAt": "2024-01-15T10:30:00Z"
}

# Inject data
POST /api/executions/exec-uuid/inject
Content-Type: application/json

{
  "nodeId": "input",
  "port": "in",
  "value": 42
}

# Check status
GET /api/executions/exec-uuid

# Response
{
  "id": "exec-uuid",
  "state": "running",
  "metrics": {
    "messagesProcessed": 4,
    "messagesEmitted": 3,
    "avgLatencyMs": 2.5
  }
}
```

#### 2. Pause and Resume Execution

```bash
# Pause
POST /api/executions/exec-uuid/pause

# Response
{
  "executionId": "exec-uuid",
  "state": "paused"
}

# Inject while paused (will be queued)
POST /api/executions/exec-uuid/inject
{
  "nodeId": "input",
  "port": "in",
  "value": 100
}

# Resume (drains queue)
POST /api/executions/exec-uuid/resume

# Response
{
  "executionId": "exec-uuid",
  "state": "running"
}
```

#### 3. Register Custom Component

```bash
POST /api/components
Content-Type: application/json

{
  "id": "custom.math.square",
  "name": "Square",
  "version": "1.0.0",
  "description": "Squares numeric values",
  "category": "math",
  "ports": {
    "inputs": [{"name": "in", "schema": {"type": "number"}}],
    "outputs": [{"name": "out", "schema": {"type": "number"}}]
  },
  "execution": {
    "type": "javascript",
    "entrypoint": "handler",
    "source": "return { process: async (ctx, port, value) => { ctx.emit('out', value * value); } }"
  }
}

# Use in graph
{
  "nodes": [
    {"id": "square", "component": "custom.math.square"}
  ]
}
```

#### 4. Build HTTP Request Pipeline

```bash
POST /api/graphs
Content-Type: application/json

{
  "symbia": "1.0",
  "name": "API Fetcher",
  "version": "1.0.0",
  "nodes": [
    {"id": "trigger", "component": "symbia.core.passthrough"},
    {"id": "fetch", "component": "symbia.io.http-request", "config": {
      "method": "GET",
      "url": "https://api.example.com/data"
    }},
    {"id": "extract", "component": "symbia.data.json-transform", "config": {
      "path": "data.items"
    }},
    {"id": "log", "component": "symbia.core.logger"}
  ],
  "edges": [
    {"id": "e1", "source": {"node": "trigger", "port": "out"}, "target": {"node": "fetch", "port": "in"}},
    {"id": "e2", "source": {"node": "fetch", "port": "out"}, "target": {"node": "extract", "port": "in"}},
    {"id": "e3", "source": {"node": "extract", "port": "out"}, "target": {"node": "log", "port": "in"}}
  ]
}
```

#### 5. Use Split for Conditional Routing

```bash
{
  "nodes": [
    {"id": "input", "component": "symbia.core.passthrough"},
    {"id": "check", "component": "symbia.core.split", "config": {
      "condition": "value > 100"
    }},
    {"id": "high", "component": "symbia.core.logger", "config": {"prefix": "HIGH:"}},
    {"id": "low", "component": "symbia.core.logger", "config": {"prefix": "LOW:"}}
  ],
  "edges": [
    {"id": "e1", "source": {"node": "input", "port": "out"}, "target": {"node": "check", "port": "in"}},
    {"id": "e2", "source": {"node": "check", "port": "true"}, "target": {"node": "high", "port": "in"}},
    {"id": "e3", "source": {"node": "check", "port": "false"}, "target": {"node": "low", "port": "in"}}
  ]
}
```

#### 6. WebSocket Real-Time Monitoring

```javascript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:5006');

// Start and monitor execution
socket.emit('execution:start', { graphId: 'graph-uuid' }, (response) => {
  const { executionId } = response;

  // Subscribe to events
  socket.emit('execution:subscribe', { executionId });
});

// Track all messages
socket.on('port:emit', (data) => {
  console.log(`${data.sourceNode}:${data.sourcePort} -> ${data.targetNode}:${data.targetPort}`);
  console.log('Value:', data.value);
});

// Track metrics
socket.on('metrics:update', (data) => {
  console.log('Messages processed:', data.metrics.messagesProcessed);
  console.log('Avg latency:', data.metrics.avgLatencyMs, 'ms');
});

// Handle completion
socket.on('execution:completed', (data) => {
  console.log('Execution completed');
  console.log('Total messages:', data.metrics.messagesProcessed);
  socket.emit('execution:unsubscribe', { executionId: data.executionId });
});

// Inject data
socket.emit('execution:inject', {
  executionId: 'exec-uuid',
  nodeId: 'input',
  port: 'in',
  value: [1, 2, 3, 4, 5]
});
```

### Request/Response Patterns

#### Success Response
```json
{
  "id": "resource-uuid",
  ...
}
```

#### List Response
```json
[
  {...},
  {...}
]
```

#### Error Response
```json
{
  "error": "Error message"
}
```

### Common HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (invalid graph, etc.) |
| 401 | Unauthorized |
| 404 | Not Found |
| 409 | Conflict (execution limit, invalid state) |
| 500 | Internal Server Error |

### Execution States

| State | Description |
|-------|-------------|
| `pending` | Created, not started |
| `initializing` | Creating component instances |
| `running` | Actively processing messages |
| `paused` | Paused, queueing messages |
| `completed` | Finished successfully |
| `failed` | Error occurred |
| `cancelled` | Stopped by user |

### Best Practices for LLMs

1. **Validate graphs before loading** - Check node IDs and edge references
2. **Use topological info** - `inputNodes` shows where to inject data
3. **Monitor via WebSocket** - More efficient than polling
4. **Handle backpressure** - Don't flood with messages
5. **Use built-in components** - Tested and optimized
6. **Set appropriate timeouts** - Long-running graphs need longer timeouts
7. **Check execution state** - Pause before injecting large batches
8. **Clean up** - Unload graphs when done
9. **Use expressions carefully** - Test filter/map expressions
10. **Track metrics** - Monitor latency and error counts

### Integration Checklist

- [ ] Load graph definition with valid structure
- [ ] Verify topology (no cycles, valid references)
- [ ] Start execution
- [ ] Subscribe to WebSocket events for monitoring
- [ ] Inject initial data to input nodes
- [ ] Handle port:emit events for output
- [ ] Monitor metrics for performance
- [ ] Implement pause/resume for long operations
- [ ] Stop execution when complete
- [ ] Unload graph to free memory

---

## Additional Resources

- **OpenAPI Spec:** `/docs/openapi.json`
- **Quick Reference:** `/docs/llms.txt`
- **Full Documentation:** `/docs/llms-full.txt`
- **Health Check:** `/api/health`
- **Service Discovery:** `/api/bootstrap/service`
- **Runtime Stats:** `/api/stats`

---

## License

MIT License - see [LICENSE](../LICENSE) for details.
