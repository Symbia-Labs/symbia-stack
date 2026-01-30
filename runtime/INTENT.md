# Runtime Service - Architectural Intent

## What This Service Is

The Runtime Service is the **dataflow execution engine** for Symbia. It takes graph definitions—directed acyclic networks of connected components—and brings them to life. Messages flow from input nodes through transformation chains to output nodes, with the runtime handling all the complexity of instantiation, routing, lifecycle management, and real-time observability.

Think of it as a **programmable data pipeline executor**: you define what components exist, how they're wired together, and what transformations each performs. Runtime handles the when, where, and how of actually running it.

## The Problem It Solves

Building data pipelines and workflow systems from scratch means solving the same problems repeatedly:
- How do I wire components together without tight coupling?
- How do I handle backpressure when downstream is slower than upstream?
- How do I pause/resume/inspect a running pipeline?
- How do I know what's happening inside my workflow right now?
- How do I test individual components in isolation?

Runtime provides a standardized execution model where:
1. Components are black boxes with typed input/output ports
2. Graphs declaratively describe the wiring
3. The executor handles message routing, ordering, and lifecycle
4. WebSocket events stream real-time execution state

## Core Concepts

### Graphs

A **graph** is a declarative specification of a dataflow network:

```
┌─────────────────────────────────────────────────────────────┐
│                     GraphDefinition                          │
├─────────────────────────────────────────────────────────────┤
│  symbia: "1.0"        ← Spec version                        │
│  name: "ETL Pipeline" ← Human-readable name                 │
│  version: "1.0.0"     ← Graph version                       │
│                                                              │
│  nodes: [                                                    │
│    ┌────────────────────────────────────────────────────┐   │
│    │ id: "extract"                                      │   │
│    │ component: "symbia.io.http-request"                │   │
│    │ config: { url: "https://api.example.com/data" }    │   │
│    └────────────────────────────────────────────────────┘   │
│    ┌────────────────────────────────────────────────────┐   │
│    │ id: "transform"                                    │   │
│    │ component: "symbia.core.map"                       │   │
│    │ config: { expression: "value.data.items" }         │   │
│    └────────────────────────────────────────────────────┘   │
│    ┌────────────────────────────────────────────────────┐   │
│    │ id: "load"                                         │   │
│    │ component: "symbia.core.logger"                    │   │
│    └────────────────────────────────────────────────────┘   │
│  ]                                                           │
│                                                              │
│  edges: [                                                    │
│    { source: extract:out → target: transform:in }           │
│    { source: transform:out → target: load:in }              │
│  ]                                                           │
└─────────────────────────────────────────────────────────────┘
```

**Topology Analysis**: When a graph is loaded, Runtime performs topological sorting using Kahn's algorithm to:
- Detect cycles (reject cyclic graphs)
- Determine execution order (distance from inputs)
- Identify input nodes (no incoming edges)
- Identify output nodes (no outgoing edges)

### Components

A **component** is a reusable processing unit with typed ports:

```
┌───────────────────────────────────────────────────────────┐
│                   ComponentDefinition                      │
├───────────────────────────────────────────────────────────┤
│  id: "symbia.core.filter"    ← Namespaced identifier      │
│  name: "Filter"              ← Display name               │
│  version: "1.0.0"            ← Semver                     │
│  category: "core"            ← core | io | data           │
│                                                            │
│  ports: {                                                  │
│    inputs: [                                               │
│      ┌──────────────────────────────────────────────────┐ │
│      │ name: "in"                                       │ │
│      │ schema: { type: "any" }                          │ │
│      └──────────────────────────────────────────────────┘ │
│    ]                                                       │
│    outputs: [                                              │
│      ┌──────────────────────────────────────────────────┐ │
│      │ name: "out" (matched predicate)                  │ │
│      │ name: "rejected" (failed predicate)              │ │
│      │ name: "error" (predicate threw)                  │ │
│      └──────────────────────────────────────────────────┘ │
│    ]                                                       │
│  }                                                         │
│                                                            │
│  config: {                                                 │
│    predicate: { type: "string" }  ← JavaScript expression │
│  }                                                         │
│                                                            │
│  execution: {                                              │
│    type: "javascript" | "typescript" | "wasm"             │
│    entrypoint: "handler"                                  │
│    source: "return { process: async (ctx, port, value)...}│
│  }                                                         │
└───────────────────────────────────────────────────────────┘
```

### Component Handler Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                    ComponentHandler                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  initialize(ctx)?  ← Called once when instance created      │
│       │                                                      │
│       ▼                                                      │
│  ┌─────────┐                                                │
│  │  ready  │ ← Waiting for messages                         │
│  └────┬────┘                                                │
│       │ message arrives                                      │
│       ▼                                                      │
│  process(ctx, port, value) ← Called for each input          │
│       │                                                      │
│       │ ctx.emit('output', result)                          │
│       │                                                      │
│       ▼                                                      │
│  ┌─────────┐                                                │
│  │  ready  │ ← Back to waiting                              │
│  └────┬────┘                                                │
│       │ execution stops                                      │
│       ▼                                                      │
│  cleanup(ctx)?  ← Called when instance destroyed            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Execution Context

Every component handler receives an `ExecutionContext`:

```typescript
{
  executionId: string,    // Which execution we're in
  nodeId: string,         // Which node instance
  instanceId: string,     // Unique instance ID
  config: {},             // Node configuration from graph

  // Port operations
  emit(port, value),      // Send to output port
  emitBatch(port, []),    // Send multiple values

  // Instance state (survives across invocations)
  getState<T>(key),       // Retrieve stored value
  setState<T>(key, val),  // Store value

  // Logging
  log(level, message, meta?)
}
```

### Executions

An **execution** is a running instance of a graph:

```
┌───────────────────────────────────────────────────────────┐
│                    GraphExecution                          │
├───────────────────────────────────────────────────────────┤
│  id: "exec-uuid"                                          │
│  graphId: "graph-uuid"                                    │
│                                                            │
│  state: pending → initializing → running → completed      │
│                                    ↓          ↓           │
│                                  paused     failed        │
│                                    ↓          ↓           │
│                                 running   cancelled       │
│                                                            │
│  instances: Map<nodeId, ComponentInstance>                │
│                                                            │
│  metrics: {                                                │
│    messagesProcessed: 1547                                │
│    messagesEmitted: 1543                                  │
│    componentInvocations: 1547                             │
│    avgLatencyMs: 2.3                                      │
│    maxLatencyMs: 47                                       │
│    errorCount: 4                                          │
│    backpressureEvents: 0                                  │
│  }                                                         │
│                                                            │
│  error?: { message, nodeId?, stack? }                     │
│  startedAt, completedAt, createdAt                        │
└───────────────────────────────────────────────────────────┘
```

### Message Routing

Messages flow through the graph via port connections:

```
┌─────────────────────────────────────────────────────────────┐
│                     Message Flow                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  inject(nodeId, port, value)                                │
│       │                                                      │
│       ▼                                                      │
│  ┌──────────┐   PortMessage    ┌──────────┐                │
│  │  Node A  │ ──────────────► │  Node B  │                │
│  │  :out    │                  │  :in     │                │
│  └──────────┘                  └──────────┘                │
│                                     │                        │
│       {                             │ process()              │
│         id: "msg-uuid"              │                        │
│         executionId: "exec-uuid"    ▼                        │
│         sourceNodeId: "A"      ┌──────────┐                │
│         sourcePort: "out"      │  Node C  │                │
│         targetNodeId: "B"      │  :in     │                │
│         targetPort: "in"       └──────────┘                │
│         value: {...}                                        │
│         timestamp: 1705312200                               │
│         sequence: 42                                        │
│       }                                                      │
│                                                              │
│  Fan-out: One source port can connect to multiple targets   │
│  Fan-in:  Multiple source ports can connect to one target   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Backpressure Management

When execution is paused, messages queue instead of processing:

```
┌─────────────────────────────────────────────────────────────┐
│                    Backpressure                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  State: RUNNING                State: PAUSED                │
│  ┌───────┐                     ┌───────┐                    │
│  │ input │──► process ──►      │ input │──► queue           │
│  └───────┘                     └───────┘      │              │
│                                               ▼              │
│                                        ┌─────────────┐      │
│                                        │ msg1, msg2, │      │
│                                        │ msg3, ...   │      │
│                                        └─────────────┘      │
│                                               │              │
│  State: RESUMED                               │              │
│  ┌───────┐                                    │              │
│  │ queue │──► drain ──► process               │              │
│  └───────┘      ◄─────────────────────────────┘              │
│                                                              │
│  maxBackpressureQueue: 10,000 (configurable)                │
│  backpressureEvents tracked in metrics                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Built-in Components

Runtime ships with foundational components:

| Category | Component | Purpose |
|----------|-----------|---------|
| **Core** | `symbia.core.passthrough` | Forward unchanged |
| | `symbia.core.logger` | Log and forward |
| | `symbia.core.delay` | Delay by N ms |
| | `symbia.core.filter` | Predicate-based routing |
| | `symbia.core.map` | Transform values |
| | `symbia.core.merge` | Combine multiple inputs |
| | `symbia.core.split` | Conditional branching |
| | `symbia.core.accumulator` | Batch into arrays |
| **I/O** | `symbia.io.http-request` | Make HTTP requests |
| **Data** | `symbia.data.json-transform` | Extract via path |

### Expression Syntax

Components like `filter`, `map`, and `split` use JavaScript expressions:

```javascript
// Filter: keep values > 10
predicate: "value > 10"

// Map: extract nested field
expression: "value.data.items"

// Map: transform
expression: "value * 2"

// Split: route based on condition
condition: "value.status === 'active'"
```

## Design Principles

### 1. Dataflow Over Control Flow

**Decision**: Messages push through the graph; components react to inputs.

**Why**: Dataflow semantics make parallelism natural—independent branches execute concurrently. It also simplifies debugging because you can trace any value back through the edges.

**Trade-off**: Less intuitive for developers used to imperative programming. Cannot easily express "do X, then conditionally do Y based on global state."

### 2. Stateless Components, Stateful Instances

**Decision**: Component definitions are pure specifications. State lives in instances and is scoped to that instance.

**Why**: The same component definition can run in multiple graph nodes simultaneously. Instance state (via `getState`/`setState`) allows stateful operations like accumulation without global mutable state.

**Trade-off**: No built-in way to share state between nodes. Cross-node coordination requires external services.

### 3. In-Memory Execution

**Decision**: Runtime stores graphs, executions, and instances in memory. No database.

**Why**: Maximum performance for short-to-medium lived executions. Sub-millisecond message routing. Perfect for streaming and real-time workloads.

**Trade-off**: Executions don't survive restarts. Long-running workflows need checkpointing (future feature). Not suitable for workflows that run for days.

### 4. Push-Based with Backpressure

**Decision**: Components push outputs downstream. Paused executions queue instead of dropping.

**Why**: Push semantics are simpler to reason about. Backpressure prevents data loss during pauses or slow consumers.

**Trade-off**: Memory grows if producers outpace consumers. Queue limits can cause dropped messages under extreme load.

### 5. WebSocket-First Observability

**Decision**: All execution events stream over WebSocket in real-time.

**Why**: Enables live debugging, visualization, and monitoring. Essential for long-running workflows where you need to see what's happening now, not in logs later.

**Trade-off**: Requires persistent connections. More complex client implementation than pure REST polling.

## Execution Flow

```
┌─────────────────────────────────────────────────────────────┐
│                   Execution Lifecycle                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. LOAD                                                     │
│     ┌─────────────────────────────────────────────────┐     │
│     │ POST /api/graphs { definition }                 │     │
│     │   → Validate structure                          │     │
│     │   → Build topology (Kahn's algorithm)           │     │
│     │   → Resolve component definitions               │     │
│     │   → Store in memory                             │     │
│     │   ← { id, topology, nodeCount, edgeCount }      │     │
│     └─────────────────────────────────────────────────┘     │
│                           │                                  │
│                           ▼                                  │
│  2. START                                                    │
│     ┌─────────────────────────────────────────────────┐     │
│     │ POST /api/graphs/:id/execute                    │     │
│     │   → Check concurrent execution limit            │     │
│     │   → Create component instances                  │     │
│     │   → Call initialize() on each                   │     │
│     │   → Set state to RUNNING                        │     │
│     │   → Emit execution:started event                │     │
│     │   ← { executionId, state }                      │     │
│     └─────────────────────────────────────────────────┘     │
│                           │                                  │
│                           ▼                                  │
│  3. INJECT                                                   │
│     ┌─────────────────────────────────────────────────┐     │
│     │ POST /api/executions/:id/inject                 │     │
│     │ { nodeId, port, value }                         │     │
│     │   → Route message to target node                │     │
│     │   → Execute component handler                   │     │
│     │   → Handlers emit to output ports               │     │
│     │   → Route outputs to connected nodes            │     │
│     │   → Repeat until no more messages               │     │
│     │   → Emit port:emit events for each hop          │     │
│     └─────────────────────────────────────────────────┘     │
│                           │                                  │
│                           ▼                                  │
│  4. CONTROL                                                  │
│     ┌─────────────────────────────────────────────────┐     │
│     │ POST /api/executions/:id/pause                  │     │
│     │   → Set state to PAUSED                         │     │
│     │   → Queue incoming messages                     │     │
│     │                                                 │     │
│     │ POST /api/executions/:id/resume                 │     │
│     │   → Set state to RUNNING                        │     │
│     │   → Drain queued messages                       │     │
│     │                                                 │     │
│     │ POST /api/executions/:id/stop                   │     │
│     │   → Call cleanup() on instances                 │     │
│     │   → Set state to CANCELLED                      │     │
│     │   → Clear queues                                │     │
│     └─────────────────────────────────────────────────┘     │
│                           │                                  │
│                           ▼                                  │
│  5. COMPLETE                                                 │
│     ┌─────────────────────────────────────────────────┐     │
│     │ Execution naturally completes when:             │     │
│     │   - No more messages in flight                  │     │
│     │   - All output nodes have emitted               │     │
│     │                                                 │     │
│     │ Or fails when:                                  │     │
│     │   - Component throws unhandled error            │     │
│     │   - Timeout exceeded                            │     │
│     └─────────────────────────────────────────────────┘     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## WebSocket Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `execution:subscribe` | `{executionId}` | Start receiving events |
| `execution:unsubscribe` | `{executionId}` | Stop receiving events |
| `execution:start` | `{graphId}` | Start new execution |
| `execution:pause` | `{executionId}` | Pause execution |
| `execution:resume` | `{executionId}` | Resume execution |
| `execution:stop` | `{executionId}` | Stop execution |
| `execution:inject` | `{executionId, nodeId, port, value}` | Inject message |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `execution:started` | `{executionId, graphId, state}` | Execution began |
| `execution:paused` | `{executionId, state}` | Execution paused |
| `execution:resumed` | `{executionId, state}` | Execution resumed |
| `execution:completed` | `{executionId, metrics}` | Execution finished |
| `execution:failed` | `{executionId, error}` | Execution errored |
| `port:emit` | `{sourceNode, sourcePort, targetNode, targetPort, value, sequence}` | Message emitted |
| `component:invoked` | `{executionId, nodeId, port}` | Handler called |
| `metrics:update` | `{executionId, metrics}` | Stats changed |

## Integration with Other Services

### Catalog Service

Runtime loads component definitions from Catalog:

```
┌──────────────┐                    ┌──────────────┐
│   Runtime    │ ──── GET ────────► │   Catalog    │
│              │  /api/components   │              │
│              │ ◄── definitions ── │              │
└──────────────┘                    └──────────────┘

Component resolution:
1. Check built-in components first
2. Check locally registered components
3. Fetch from Catalog if not found
```

### Identity Service

Authentication for API and WebSocket:

```
┌──────────────┐                    ┌──────────────┐
│   Runtime    │ ──── Validate ───► │   Identity   │
│              │  JWT/API Key       │              │
│              │ ◄── User/Agent ─── │              │
└──────────────┘                    └──────────────┘
```

### Messaging Service (Future)

Graph nodes can bind to Network events:

```yaml
# In graph definition
bindings:
  extract:
    input:
      network: "events.orders"
      component: "symbia.network.subscriber"
      protocol: "ws"
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 5006 | Server port |
| `MAX_CONCURRENT_EXECUTIONS` | 100 | Parallel execution limit |
| `DEFAULT_EXECUTION_TIMEOUT` | 300000 | 5 minute timeout |
| `MAX_BACKPRESSURE_QUEUE` | 10000 | Queue size before dropping |
| `ISOLATE_POOL_SIZE` | 10 | V8 isolate pool (future) |
| `ENABLE_METRICS` | true | Collect execution metrics |

## What This Service Does NOT Do

1. **Persistent storage** — Graphs and executions are in-memory only
2. **Workflow orchestration** — No timers, schedules, or long-running sagas
3. **Multi-machine distribution** — Single-node execution only
4. **Component sandboxing** — Currently uses `new Function()`, not isolated VMs
5. **Version migrations** — No automatic upgrade of running graphs
6. **Transaction guarantees** — No exactly-once delivery semantics
7. **State checkpointing** — No durability across restarts

## Future Directions

### Near-Term
- **V8 Isolates**: True sandboxing for untrusted component code
- **WASM Components**: Execute components compiled to WebAssembly
- **Streaming I/O**: Components that handle continuous data streams
- **Graph Composition**: Nest graphs as components in other graphs

### Medium-Term
- **Checkpointing**: Durable execution state for long-running workflows
- **Distributed Execution**: Fan out across multiple Runtime instances
- **Network Bindings**: First-class integration with Network Service events
- **Visual Editor**: Graph builder UI backed by Runtime API

### Long-Term
- **Hot Reload**: Update component code without stopping executions
- **Adaptive Scaling**: Auto-scale instances based on message throughput
- **Time Travel Debugging**: Replay executions from any point

## Quick Reference

### Create and Execute a Graph

```bash
# 1. Load graph
POST /api/graphs
{
  "symbia": "1.0",
  "name": "Simple Pipeline",
  "version": "1.0.0",
  "nodes": [
    {"id": "input", "component": "symbia.core.passthrough"},
    {"id": "double", "component": "symbia.core.map", "config": {"expression": "value * 2"}},
    {"id": "output", "component": "symbia.core.logger"}
  ],
  "edges": [
    {"id": "e1", "source": {"node": "input", "port": "out"}, "target": {"node": "double", "port": "in"}},
    {"id": "e2", "source": {"node": "double", "port": "out"}, "target": {"node": "output", "port": "in"}}
  ]
}
# → { "id": "graph-uuid", "topology": {...} }

# 2. Start execution
POST /api/graphs/graph-uuid/execute
# → { "executionId": "exec-uuid", "state": "running" }

# 3. Inject data
POST /api/executions/exec-uuid/inject
{ "nodeId": "input", "port": "in", "value": 21 }
# → 42 logged at output

# 4. Check metrics
GET /api/executions/exec-uuid/metrics
# → { "messagesProcessed": 3, "avgLatencyMs": 1.2, ... }
```

### Register Custom Component

```bash
POST /api/components
{
  "id": "custom.math.square",
  "name": "Square",
  "version": "1.0.0",
  "ports": {
    "inputs": [{"name": "in", "schema": {"type": "number"}}],
    "outputs": [{"name": "out", "schema": {"type": "number"}}]
  },
  "execution": {
    "type": "javascript",
    "entrypoint": "handler",
    "source": "return { process: async (ctx, port, value) => ctx.emit('out', value * value) }"
  }
}
```

### WebSocket Monitoring

```javascript
const socket = io('ws://localhost:5006');

socket.emit('execution:subscribe', { executionId: 'exec-uuid' });

socket.on('port:emit', (msg) => {
  console.log(`${msg.sourceNode}:${msg.sourcePort} → ${msg.targetNode}:${msg.targetPort}`);
  console.log('Value:', msg.value);
});

socket.on('execution:completed', (data) => {
  console.log('Done! Messages processed:', data.metrics.messagesProcessed);
});
```

---

*Runtime transforms graph specifications into living data pipelines. It handles the mechanics of execution so you can focus on the logic of transformation.*
