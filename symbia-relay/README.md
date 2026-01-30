# @symbia/relay - Service Communication Library

Client library for connecting to the Symbia Network Service. Provides service-to-service and agent-to-agent event-driven communication with topology management, policy enforcement, and observability.

## Capabilities

| Capability | Description |
|------------|-------------|
| Service Discovery | Register nodes with IDs, types, and capabilities |
| Event Routing | Route typed events through the network |
| Agent Messaging | Direct agent-to-agent communication |
| Request/Response | Async request pattern with timeout handling |
| SDN Observability | Event tracing and flow monitoring |
| Contract Enforcement | Control allowed event types between nodes |
| Auto-Reconnection | Built-in resilience with graceful degradation |

## Quick Start

### Installation

```bash
npm install @symbia/relay
```

### Service Integration

```typescript
import { initServiceRelay, emitEvent, shutdownRelay } from "@symbia/relay";

// Initialize during service startup
await initServiceRelay({
  serviceId: "messaging",
  serviceName: "Messaging Service",
  capabilities: [
    "messaging.conversation.create",
    "messaging.message.send",
  ],
});

// Emit events
await emitEvent("message.sent", {
  conversationId: "conv-123",
  content: "Hello!",
}, "run-456");

// Shutdown gracefully
await shutdownRelay();
```

### Agent Integration

```typescript
import { initAgentRelay, sendAgentMessage, sendAgentRequest } from "@symbia/relay";

// Initialize agent with auth token
const relay = await initAgentRelay({
  agentId: "assistant:onboarding",
  agentName: "Onboarding Assistant",
  authToken: jwtToken,
  capabilities: ["messaging.send"],
});

// Send message to another agent
await sendAgentMessage("assistant:support", {
  content: { text: "User needs help" },
  priority: "high",
}, "run-123");

// Request-response pattern
const result = await sendAgentRequest("assistant:support", {
  content: { query: "Get user status" },
}, "run-123", 30000);

if ("response" in result) {
  console.log("Response:", result.response);
}
```

## Architecture

### Network Topology

```
┌─────────────────────────────────────────────┐
│   Symbia Network Service (Port 5054)        │
│   - Event routing and policy enforcement    │
│   - SDN observability and tracing           │
│   - Topology and contract management        │
└─────────────────────────────────────────────┘
       ↑         ↑         ↑         ↑
   Socket.io  Socket.io  Socket.io  Socket.io
       │         │         │         │
    ┌──┴──┐   ┌──┴──┐   ┌──┴──┐   ┌──┴──┐
    │Relay│   │Relay│   │Relay│   │Relay│
    └──┬──┘   └──┬──┘   └──┬──┘   └──┬──┘
       │         │         │         │
    ┌──┴──┐   ┌──┴──┐   ┌──┴──┐   ┌──┴──┐
    │Msgs │   │ ID  │   │ Log │   │Agent│
    │ Svc │   │ Svc │   │ Svc │   │     │
    └─────┘   └─────┘   └─────┘   └─────┘
```

### Directory Structure

```
symbia-relay/
├── src/
│   ├── index.ts          # Package exports
│   ├── types.ts          # TypeScript interfaces
│   ├── client.ts         # RelayClient class
│   └── integration.ts    # Service/agent helpers
├── dist/                 # Compiled JavaScript + types
├── package.json
└── tsconfig.json
```

## API Reference

### RelayClient Class

Core client for network communication.

```typescript
import { RelayClient, createRelayClient } from "@symbia/relay";

const client = createRelayClient({
  nodeId: "my-service",
  nodeName: "My Service",
  nodeType: "service",
  capabilities: ["capability.one", "capability.two"],
  networkUrl: "http://localhost:5054",
});

await client.connect();
```

**RelayConfig:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `nodeId` | `string` | Required | Unique node identifier |
| `nodeName` | `string` | Required | Human-readable name |
| `nodeType` | `NodeType` | Required | service, assistant, sandbox, bridge |
| `capabilities` | `string[]` | `[]` | Node capabilities |
| `endpoint` | `string` | Auto | HTTP endpoint for events |
| `networkUrl` | `string` | `localhost:5054` | Network service URL |
| `autoReconnect` | `boolean` | `true` | Auto-reconnect on disconnect |
| `heartbeatIntervalMs` | `number` | `30000` | Heartbeat frequency |
| `authToken` | `string` | - | JWT for agent auth |
| `metadata` | `Record<string, unknown>` | `{}` | Custom metadata |

**Methods:**

| Method | Description |
|--------|-------------|
| `connect()` | Connect and register with network |
| `disconnect()` | Gracefully disconnect |
| `send(payload, runId, options?)` | Send event through network |
| `onEvent(type, handler)` | Subscribe to event type |
| `onAnyEvent(handler)` | Subscribe to all events |
| `createContract(toNodeId, types, boundaries)` | Create node contract |
| `watch(filter, handler)` | Subscribe to event traces |
| `unwatch(subscriptionId)` | Unsubscribe from traces |
| `getTopology()` | Get network topology |
| `isReady()` | Check if connected and registered |
| `getNodeId()` | Get this node's ID |

### Service Integration

Global singleton pattern for backend services.

#### initServiceRelay(config)

Initialize global service relay.

```typescript
import { initServiceRelay } from "@symbia/relay";

await initServiceRelay({
  serviceId: "catalog",
  serviceName: "Catalog Service",
  capabilities: ["catalog.resource.create", "catalog.resource.update"],
  eventHandlers: {
    "resource.created": (event) => {
      console.log("Resource created:", event.payload.data);
    },
  },
});
```

**ServiceRelayConfig:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `serviceId` | `string` | Required | Service identifier |
| `serviceName` | `string` | Required | Human-readable name |
| `capabilities` | `string[]` | `[]` | Service capabilities |
| `networkUrl` | `string` | From env | Network service URL |
| `enabled` | `boolean` | `true` | Enable/disable relay |
| `eventHandlers` | `Record<string, Handler>` | `{}` | Event handlers |

#### getRelay()

Get the global relay instance.

```typescript
import { getRelay } from "@symbia/relay";

const relay = getRelay();
if (relay) {
  relay.onEvent("custom.event", handleEvent);
}
```

#### emitEvent(type, data, runId, options?)

Emit an event through the network.

```typescript
import { emitEvent } from "@symbia/relay";

await emitEvent("user.created", {
  userId: "user-123",
  email: "user@example.com",
}, "run-456");

// With options
await emitEvent("user.created", data, runId, {
  target: "identity-service",
  boundary: "inter",
});
```

#### shutdownRelay()

Disconnect and cleanup.

```typescript
import { shutdownRelay } from "@symbia/relay";

process.on("SIGTERM", async () => {
  await shutdownRelay();
  process.exit(0);
});
```

#### createServiceContract(targetId, types, boundaries)

Create service-to-service contract.

```typescript
import { createServiceContract } from "@symbia/relay";

await createServiceContract(
  "messaging-service",
  ["message.sent", "message.received"],
  ["inter"]
);
```

### Agent Integration

Per-instance pattern for AI agents.

#### initAgentRelay(config)

Initialize agent relay (returns instance).

```typescript
import { initAgentRelay } from "@symbia/relay";

const relay = await initAgentRelay({
  agentId: "assistant:support",
  agentName: "Support Assistant",
  authToken: jwtToken,
  capabilities: ["messaging.send", "messaging.receive"],
  eventHandlers: {
    "agent.message": (event) => {
      console.log("Message received:", event.payload.data);
    },
  },
});
```

**AgentRelayConfig:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `agentId` | `string` | Required | Agent identifier |
| `agentName` | `string` | Required | Human-readable name |
| `authToken` | `string` | Required | JWT authentication token |
| `capabilities` | `string[]` | `[]` | Agent capabilities |
| `networkUrl` | `string` | From env | Network service URL |
| `eventHandlers` | `Record<string, Handler>` | `{}` | Event handlers |

#### getAgentRelay(agentId)

Get specific agent's relay.

```typescript
import { getAgentRelay } from "@symbia/relay";

const relay = getAgentRelay("assistant:support");
```

#### sendAgentMessage(targetId, message, runId, fromAgentId?)

Send direct message to another agent.

```typescript
import { sendAgentMessage } from "@symbia/relay";

await sendAgentMessage("assistant:onboarding", {
  content: { text: "Please help this user" },
  contentType: "application/json",
  priority: "high",
  metadata: { userId: "user-123" },
}, "run-456");
```

**AgentMessagePayload:**

| Field | Type | Description |
|-------|------|-------------|
| `content` | `unknown` | Message content |
| `contentType` | `string` | MIME type |
| `correlationId` | `string` | For request/response |
| `priority` | `string` | low, normal, high, critical |
| `ttlMs` | `number` | Time-to-live in ms |
| `metadata` | `Record<string, unknown>` | Custom metadata |

#### sendAgentRequest(targetId, request, runId, timeoutMs?, fromAgentId?)

Send request and await response.

```typescript
import { sendAgentRequest } from "@symbia/relay";

const result = await sendAgentRequest(
  "assistant:support",
  { content: { query: "Get user status" } },
  "run-456",
  30000  // 30s timeout
);

if ("response" in result) {
  console.log("Response:", result.response);
} else if ("error" in result) {
  console.error("Error:", result.error);
} else if ("timeout" in result) {
  console.error("Request timed out");
}
```

#### disconnectAgentRelay(agentId)

Disconnect specific agent.

```typescript
import { disconnectAgentRelay } from "@symbia/relay";

await disconnectAgentRelay("assistant:support");
```

#### disconnectAllAgentRelays()

Disconnect all agents.

```typescript
import { disconnectAllAgentRelays } from "@symbia/relay";

await disconnectAllAgentRelays();
```

## TypeScript Types

### Event Types

```typescript
interface EventPayload {
  type: string;      // Event type (e.g., "message.sent")
  data: unknown;     // Arbitrary event data
}

interface EventWrapper {
  id: string;        // Unique event ID
  runId: string;     // Workflow/run context
  timestamp: string; // ISO timestamp
  source: string;    // Source node ID
  target?: string;   // Target node (optional)
  causedBy?: string; // Causality link
  path: string[];    // Nodes traversed
  boundary: "intra" | "inter" | "extra";
}

interface SandboxEvent {
  payload: EventPayload;
  wrapper: EventWrapper;
  hash: string;      // Content hash
}
```

### Network Types

```typescript
interface NetworkNode {
  id: string;
  name: string;
  type: "service" | "assistant" | "sandbox" | "bridge";
  capabilities: string[];
  endpoint: string;
  socketId?: string;
  registeredAt: string;
  lastHeartbeat: string;
  metadata?: Record<string, unknown>;
}

interface NodeContract {
  id: string;
  from: string;                  // Source node
  to: string;                    // Target node
  allowedEventTypes: string[];   // Whitelisted types
  boundaries: ("intra" | "inter" | "extra")[];
  createdAt: string;
  expiresAt?: string;
}

interface NetworkTopology {
  nodes: NetworkNode[];
  contracts: NodeContract[];
  bridges: NetworkBridge[];
  timestamp: string;
}
```

### SDN Tracing Types

```typescript
interface EventTrace {
  eventId: string;
  runId: string;
  path: TraceHop[];
  totalDurationMs: number;
  status: "delivered" | "dropped" | "pending" | "error";
  error?: string;
}

interface TraceHop {
  node: string;
  timestamp: string;
  durationMs: number;
  policyId?: string;
  action: "forward" | "deliver" | "drop" | "transform";
}

interface WatchFilter {
  runId?: string;
  eventType?: string;
  sourceNode?: string;
  targetNode?: string;
}
```

### Agent Types

```typescript
type AgentEventType =
  | "agent.message"   // Direct message
  | "agent.request"   // Request expecting response
  | "agent.response"  // Response to request
  | "agent.error"     // Error response
  | "agent.ack"       // Acknowledgment
  | "agent.ping"      // Health check
  | "agent.pong";     // Health check response
```

### Justification Types

```typescript
interface AssistantJustification {
  reason: string;
  triggerRule?: string;
  conditions?: Array<{
    field: string;
    operator: string;
    value: string;
    matched: boolean;
  }>;
  confidence: number;
  alternatives?: string[];
}

interface AssistantClaim {
  claimedAt: string;
  expiresAt: string;
  priority: number;
}
```

## Event Boundaries

| Boundary | Description | Use Case |
|----------|-------------|----------|
| `intra` | Within single service | Internal events |
| `inter` | Between services/agents | Cross-service communication |
| `extra` | External integrations | Webhooks, external APIs |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NETWORK_RELAY_ENABLED` | Enable/disable relay | `true` |
| `NETWORK_ENDPOINT` | Network service URL | `http://localhost:5054` |
| `NETWORK_SERVICE_URL` | Alternate URL variable | - |
| `PORT` | Service port for endpoint | - |
| `HOST` | Service host for endpoint | - |

## Socket.IO Protocol

### Node Lifecycle Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `node:register` | Client → Server | Register node |
| `node:unregister` | Client → Server | Unregister node |
| `node:heartbeat` | Client → Server | Keep-alive ping |

### Event Communication

| Event | Direction | Description |
|-------|-----------|-------------|
| `event:send` | Client → Server | Send event |
| `event:received` | Server → Client | Receive event |

### Contracts

| Event | Direction | Description |
|-------|-----------|-------------|
| `contract:create` | Client → Server | Create contract |

### SDN Observability

| Event | Direction | Description |
|-------|-----------|-------------|
| `sdn:watch` | Client → Server | Subscribe to traces |
| `sdn:unwatch` | Client → Server | Unsubscribe |
| `sdn:event` | Server → Client | Trace data |
| `sdn:topology` | Client ↔ Server | Query topology |

### Network Announcements

| Event | Direction | Description |
|-------|-----------|-------------|
| `network:node:joined` | Server → Client | Node joined |
| `network:node:left` | Server → Client | Node left |

## Error Handling

### Graceful Degradation

If the Network Service is unavailable:
- `initServiceRelay()` returns `null`
- `emitEvent()` silently returns `null`
- Services continue operating without network

### Auto-Reconnection

- Up to 10 reconnection attempts
- Exponential backoff (1s to 5s)
- Automatic re-registration on reconnect

### Request Timeout

```typescript
const result = await sendAgentRequest(target, request, runId, 30000);

if ("timeout" in result) {
  console.error("Request timed out after 30s");
}
```

## Services Using This Package

| Service | Node Type | Capabilities |
|---------|-----------|--------------|
| Identity | service | auth.*, user.* |
| Catalog | service | catalog.*, resource.* |
| Logging | service | log.*, metric.* |
| Messaging | service | messaging.*, conversation.* |
| Assistants | service | assistant.*, graph.* |
| Network | service | network.*, routing.* |
| Runtime | service | runtime.*, execution.* |
| Agents | assistant | varies by agent |

## LLM Integration Guide

### Service Event Patterns

```typescript
// Initialize relay
await initServiceRelay({
  serviceId: "my-service",
  serviceName: "My Service",
  capabilities: ["my.capability"],
});

// Subscribe to events
const relay = getRelay();
relay?.onEvent("user.action", async (event) => {
  const { userId, action } = event.payload.data;
  // Process event
});

// Emit events
await emitEvent("action.completed", { result: "success" }, runId);
```

### Agent Communication Patterns

```typescript
// Initialize agent
const relay = await initAgentRelay({
  agentId: "assistant:helper",
  agentName: "Helper Assistant",
  authToken: token,
});

// Listen for messages
relay.onEvent("agent.message", async (event) => {
  const { content } = event.payload.data;
  // Process message
});

// Request-response
const result = await sendAgentRequest(
  "assistant:processor",
  { content: { task: "analyze" } },
  runId
);
```

### Observability

```typescript
// Watch event flow
relay.watch({ runId: "run-123" }, (trace) => {
  console.log(`Event ${trace.eventId}: ${trace.status}`);
  trace.path.forEach((hop) => {
    console.log(`  ${hop.node}: ${hop.action} (${hop.durationMs}ms)`);
  });
});

// Get network topology
const topology = await relay.getTopology();
console.log(`Nodes: ${topology.nodes.length}`);
console.log(`Contracts: ${topology.contracts.length}`);
```

## Assistant Justification Protocol

The justification protocol enables coordinated turn-taking between assistants, preventing "nosy" behavior where multiple assistants respond to the same message.

### Justification Events

| Event Type | Purpose |
|------------|---------|
| `assistant.intent.claim` | Declare intent to respond with confidence score |
| `assistant.intent.defer` | Defer to another assistant |
| `assistant.action.observe` | Silently observe without responding |
| `assistant.action.respond` | Confirm response with justification |

### Turn-Taking Flow

```
1. message.new arrives via SDN
2. All assistants evaluate rules
3. Matching assistants emit assistant.intent.claim
4. 500ms claim window for counter-claims
5. Highest priority wins, others defer
6. Winner emits assistant.action.respond
```

### Justification Types

```typescript
interface AssistantJustification {
  reason: string;              // Human-readable explanation
  triggerRule?: string;        // Rule ID that matched
  conditions?: Array<{         // Matched conditions
    field: string;
    operator: string;
    value: string;
    matched: boolean;
  }>;
  confidence: number;          // 0-1 score
  alternatives?: string[];     // Other assistants considered
}

interface AssistantClaim {
  claimedAt: string;           // ISO timestamp
  expiresAt: string;           // Claim timeout
  priority: number;            // From rule priority
}
```

### Justification Functions

#### emitClaim(assistantKey, entityId, conversationId, justification, runId, claimWindowMs?)

Emit a claim to respond to a message.

```typescript
import { emitClaim } from "@symbia/relay";

const result = await emitClaim(
  "log-analyst",
  "ent_assistant_123",
  "conv_456",
  {
    reason: "Message contains 'logs' - matches my domain",
    triggerRule: "log-keyword-rule",
    confidence: 0.95,
  },
  "run_789",
  500  // 500ms claim window
);

if (result) {
  console.log("Claim submitted:", result.claim);
}
```

#### waitForClaimWindow(conversationId, assistantKey, priority, windowMs?)

Wait for claim window and check if this assistant won.

```typescript
import { waitForClaimWindow } from "@symbia/relay";

const { shouldProceed, winningAssistant } = await waitForClaimWindow(
  "conv_456",
  "log-analyst",
  150,  // this assistant's priority
  500   // window duration
);

if (shouldProceed) {
  // This assistant won the claim
  await sendResponse();
} else {
  console.log(`Deferred to ${winningAssistant}`);
}
```

#### emitDefer(assistantKey, entityId, conversationId, deferToKey, deferToEntityId?, reason?, runId?)

Emit a defer event when passing to another assistant.

```typescript
import { emitDefer } from "@symbia/relay";

await emitDefer(
  "debug-assistant",
  "ent_assistant_111",
  "conv_456",
  "log-analyst",           // defer to
  "ent_assistant_123",     // defer to entity
  "Higher priority claim", // reason
  "run_789"
);
```

#### emitObserve(assistantKey, entityId, conversationId, reason?, runId?)

Emit an observe event when watching silently.

```typescript
import { emitObserve } from "@symbia/relay";

await emitObserve(
  "coordinator",
  "ent_assistant_222",
  "conv_456",
  "Specialist already claimed, monitoring only",
  "run_789"
);
```

#### emitRespond(assistantKey, entityId, conversationId, messageId, justification, runId?)

Emit a respond event with full justification.

```typescript
import { emitRespond } from "@symbia/relay";

await emitRespond(
  "log-analyst",
  "ent_assistant_123",
  "conv_456",
  "msg_new_response",
  {
    reason: "Responding to log query",
    triggerRule: "log-keyword-rule",
    conditions: [
      { field: "message.content", operator: "contains", value: "logs", matched: true }
    ],
    confidence: 0.95,
  },
  "run_789"
);
```

#### registerExternalClaim(conversationId, assistantKey, priority, claimedAt, expiresAt)

Register an external claim (from another assistant via SDN).

```typescript
import { registerExternalClaim } from "@symbia/relay";

// Called when receiving assistant.intent.claim events
registerExternalClaim(
  "conv_456",            // conversationId
  "log-analyst",         // assistantKey
  150,                   // priority
  new Date().toISOString(), // claimedAt (ISO timestamp)
  new Date(Date.now() + 500).toISOString() // expiresAt (claim timeout)
);
```

### Full Turn-Taking Example

```typescript
import {
  emitClaim,
  waitForClaimWindow,
  emitDefer,
  emitRespond,
} from "@symbia/relay";

async function handleMessage(message, assistantKey, entityId, priority, runId) {
  // Step 1: Emit claim with justification
  const justification = {
    reason: "Message matches my keyword rules",
    triggerRule: "keyword-rule-123",
    confidence: 0.85,
  };

  const claimResult = await emitClaim(
    assistantKey,
    entityId,
    message.conversationId,
    justification,
    runId,
    500
  );

  if (!claimResult) {
    console.log("Failed to emit claim");
    return;
  }

  // Step 2: Wait for claim window
  const { shouldProceed, winningAssistant } = await waitForClaimWindow(
    message.conversationId,
    assistantKey,
    priority,
    500
  );

  // Step 3: Defer if outprioritized
  if (!shouldProceed && winningAssistant !== assistantKey) {
    await emitDefer(
      assistantKey,
      entityId,
      message.conversationId,
      winningAssistant,
      undefined,
      "Higher priority claim exists",
      runId
    );
    return;
  }

  // Step 4: Generate and send response
  const response = await generateResponse(message);

  // Step 5: Emit respond event with justification
  await emitRespond(
    assistantKey,
    entityId,
    message.conversationId,
    response.id,
    justification,
    runId
  );
}
```

## Integration Checklist

- [ ] Install `@symbia/relay`
- [ ] Configure `NETWORK_ENDPOINT` environment variable
- [ ] Call `initServiceRelay()` during service startup
- [ ] Define capabilities for service registration
- [ ] Set up event handlers for incoming events
- [ ] Use `emitEvent()` for outgoing events
- [ ] Create contracts for service-to-service communication
- [ ] Call `shutdownRelay()` on service shutdown
- [ ] Handle graceful degradation (relay may be null)
- [ ] Use `sendAgentRequest()` for request/response patterns
- [ ] Implement turn-taking with `emitClaim()` and `waitForClaimWindow()` for assistants
- [ ] Emit `emitDefer()` when deferring to higher-priority assistants
- [ ] Use `emitRespond()` to justify responses in the SDN event stream
- [ ] Add `observabilityMiddleware()` for HTTP request/response tracking
- [ ] Use ephemeral observability events for real-time monitoring

## Express Middleware

The relay provides Express middleware for automatic HTTP observability.

### observabilityMiddleware(options?)

Automatically emits HTTP request/response events through the relay for real-time observability.

```typescript
import { observabilityMiddleware } from "@symbia/relay";

app.use(observabilityMiddleware({
  excludePaths: ['/health', '/health/live', '/health/ready'],
  excludePatterns: [/^\/metrics/],
  includeHeaders: true,
  excludeHeaders: ['authorization', 'cookie'],
  slowRequestThresholdMs: 1000,
  traceIdHeader: 'x-trace-id',
}));
```

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| `excludePaths` | `string[]` | Paths to exclude from observability |
| `excludePatterns` | `RegExp[]` | Regex patterns to exclude |
| `includeHeaders` | `boolean` | Include request headers (filtered) |
| `excludeHeaders` | `string[]` | Headers to exclude from logging |
| `slowRequestThresholdMs` | `number` | Slow request warning threshold (ms) |
| `traceIdHeader` | `string` | Custom trace ID header name |

### timingMiddleware(options?)

Simplified middleware for timing only (minimal overhead).

```typescript
import { timingMiddleware } from "@symbia/relay";

// For high-traffic endpoints
app.use('/api/metrics', timingMiddleware({ slowThresholdMs: 500 }));
```

## Ephemeral Observability Events

The relay provides functions for emitting ephemeral observability events that flow through the SDN for real-time monitoring without persistent storage.

### HTTP Events

```typescript
import { emitHttpRequest, emitHttpResponse } from "@symbia/relay";

// Emit HTTP request event
emitHttpRequest({
  requestId: "req-123",
  method: "POST",
  url: "/api/messages",
  headers: { "content-type": "application/json" },
  bodySize: 256,
  timestamp: Date.now(),
});

// Emit HTTP response event
emitHttpResponse({
  requestId: "req-123",
  statusCode: 200,
  headers: { "content-type": "application/json" },
  bodySize: 128,
  durationMs: 42,
  timestamp: Date.now(),
});
```

### Database Events

```typescript
import { emitDbQuery, emitDbSlowQuery } from "@symbia/relay";

// Normal query
emitDbQuery({
  queryId: "q-123",
  database: "postgres",
  operation: "SELECT",
  table: "users",
  durationMs: 15,
  rowCount: 10,
  timestamp: Date.now(),
});

// Slow query warning
emitDbSlowQuery({
  queryId: "q-456",
  database: "postgres",
  operation: "SELECT",
  table: "logs",
  durationMs: 2500,
  rowCount: 100000,
  query: "SELECT * FROM logs WHERE...",
  timestamp: Date.now(),
});
```

### Cache Events

```typescript
import { emitCacheHit, emitCacheMiss } from "@symbia/relay";

// Cache hit
emitCacheHit({
  cacheKey: "user:123",
  cacheName: "redis",
  ttlMs: 3600000,
  timestamp: Date.now(),
});

// Cache miss
emitCacheMiss({
  cacheKey: "user:456",
  cacheName: "redis",
  timestamp: Date.now(),
});
```

### Error Events

```typescript
import { emitObservabilityError } from "@symbia/relay";

emitObservabilityError({
  errorType: "DatabaseConnectionError",
  message: "Connection refused",
  stack: error.stack,
  context: { database: "postgres", host: "localhost" },
  timestamp: Date.now(),
});
```

### Process Metrics

```typescript
import {
  emitProcessMetrics,
  emitCurrentProcessMetrics,
  startProcessMetricsInterval,
} from "@symbia/relay";

// Emit current process metrics (memory, CPU, etc.)
emitCurrentProcessMetrics();

// Start automatic metrics emission every 30 seconds
startProcessMetricsInterval(30000);

// Or emit custom metrics
emitProcessMetrics({
  memoryUsedMb: 256,
  memoryTotalMb: 512,
  cpuPercent: 25.5,
  eventLoopDelayMs: 2.5,
  activeHandles: 42,
  activeRequests: 5,
  timestamp: Date.now(),
});
```

### Type Exports

```typescript
import type {
  ObservabilityEventType,
  HttpRequestEvent,
  HttpResponseEvent,
  DbQueryEvent,
  ProcessMetricsEvent,
  ObservabilityErrorEvent,
} from "@symbia/relay";
```
