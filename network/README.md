# Symbia Network Service

The Network Service is an event routing and service mesh hub for the Symbia ecosystem. It provides event routing between connected nodes, service discovery, policy-based routing control, and SoftSDN observability for understanding network topology and tracing events.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Authentication](#authentication)
- [API Reference](#api-reference)
- [WebSocket Events](#websocket-events)
- [Data Models](#data-models)
- [Event Routing](#event-routing)
- [Policies](#policies)
- [Telemetry](#telemetry)
- [Configuration](#configuration)
- [LLM Integration Guide](#llm-integration-guide)

---

## Overview

### Core Capabilities

| Capability | Description |
|------------|-------------|
| Event Routing | Route events between connected nodes with policy enforcement |
| Service Discovery | Node registration, heartbeat, and contract management |
| Policy Enforcement | Hash-based security with allow/deny/route/transform actions |
| SoftSDN Observability | Read-only API for network topology and event tracing |
| Real-Time Communication | WebSocket support for connected nodes |
| External Integration | Bridge system for connecting external systems |

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Node** | A service, assistant, sandbox, or bridge registered with the network |
| **Contract** | Authorization for communication between two nodes |
| **Event** | Message routed through the network (payload + wrapper + hash) |
| **Policy** | Rule for filtering/transforming events based on conditions |
| **Boundary** | Event scope: `intra` (same sandbox), `inter` (cross-sandbox), `extra` (external) |
| **Trace** | Record of an event's path through the network |

### Node Types

| Type | Description |
|------|-------------|
| `service` | Backend service (API, worker, etc.) |
| `assistant` | AI agent (requires authentication) |
| `sandbox` | Isolated execution environment |
| `bridge` | External system connector |
| `client` | User-proxied client (e.g., Control Center/Mission Control) |

**Note:** `client` nodes represent browser-based applications that connect via user credentials. They require entitlements like `cap:network.events.read` and `cap:network.topology.read` for observability access.

---

## Quick Start

### Environment Variables

```bash
# Optional (all have defaults)
PORT=5054
IDENTITY_SERVICE_URL=http://localhost:5001
NETWORK_HASH_SECRET=your-secret-key
CORS_ORIGINS=http://localhost:3000
```

### Running the Service

```bash
# Development
npm run dev

# Production
npm run build && npm run start
```

### Default Port

The service runs on port **5054** by default.

---

## Architecture

### Directory Structure

```
network/
├── server/src/
│   ├── index.ts              # Entry point
│   ├── config.ts             # Configuration
│   ├── types.ts              # TypeScript types
│   ├── socket.ts             # WebSocket handlers
│   ├── openapi.ts            # OpenAPI specification
│   ├── routes/
│   │   ├── registry.ts       # Node/contract/bridge endpoints
│   │   ├── events.ts         # Event routing endpoints
│   │   ├── policies.ts       # Policy management endpoints
│   │   └── sdn.ts            # SoftSDN observability endpoints
│   └── services/
│       ├── registry.ts       # Node registration logic
│       ├── router.ts         # Event routing logic
│       └── policy.ts         # Policy evaluation logic
├── docs/
│   ├── openapi.json          # OpenAPI specification
│   ├── llms.txt              # Quick LLM reference
│   └── llms-full.txt         # Full LLM documentation
└── Dockerfile                # Production container
```

### Technology Stack

- **Runtime:** Node.js 20
- **Framework:** Express.js 5.x
- **WebSocket:** Socket.IO 4.x
- **Storage:** In-memory (ready for DB backing)
- **Authentication:** JWT via Identity Service

---

## Authentication

### Authentication Methods

| Method | Header | Description |
|--------|--------|-------------|
| Bearer Token | `Authorization: Bearer <jwt>` | JWT from Identity Service |
| API Key | `X-API-Key: <key>` | Service-to-service auth |
| WebSocket Auth | `auth.token` in handshake | Real-time connections |

### WebSocket Agent Authentication

For assistant nodes connecting via WebSocket:
1. Include `token` in socket handshake auth
2. Token validated against Identity Service
3. Agent must have `type: 'agent'` in token
4. Node ID must match agent's `agentId`

```javascript
const socket = io('ws://localhost:5054', {
  auth: { token: 'agent_jwt_token' }
});
```

### Custom Headers

| Header | Description |
|--------|-------------|
| `X-Org-Id` | Organization scope |
| `X-Service-Id` | Caller service ID |

---

## API Reference

### Registry Endpoints - Nodes

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/registry/nodes` | Register node |
| GET | `/api/registry/nodes` | List all nodes |
| GET | `/api/registry/nodes/:id` | Get node |
| DELETE | `/api/registry/nodes/:id` | Unregister node |
| POST | `/api/registry/nodes/:id/heartbeat` | Send heartbeat |
| GET | `/api/registry/nodes/capability/:capability` | Find by capability |
| GET | `/api/registry/nodes/type/:type` | Find by type |

**Register Node:**
```json
{
  "id": "my-service",
  "name": "My Service",
  "type": "service",
  "capabilities": ["process.data", "emit.events"],
  "endpoint": "http://localhost:3000/events",
  "metadata": {}
}
```

### Registry Endpoints - Contracts

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/registry/contracts` | Create contract |
| GET | `/api/registry/contracts` | List contracts |
| DELETE | `/api/registry/contracts/:id` | Delete contract |

**Create Contract:**
```json
{
  "from": "service-a",
  "to": "service-b",
  "allowedEventTypes": ["data.processed", "task.completed"],
  "boundaries": ["intra", "inter"],
  "expiresAt": "2024-12-31T23:59:59Z"
}
```

### Registry Endpoints - Bridges

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/registry/bridges` | Register bridge |
| GET | `/api/registry/bridges` | List bridges |
| GET | `/api/registry/bridges/:id` | Get bridge |
| PATCH | `/api/registry/bridges/:id` | Update bridge |
| DELETE | `/api/registry/bridges/:id` | Delete bridge |

**Register Bridge:**
```json
{
  "id": "external-api",
  "name": "External API Bridge",
  "type": "webhook",
  "endpoint": "https://api.external.com/webhook",
  "active": true,
  "metadata": {"apiVersion": "v2"}
}
```

### Event Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/events` | Send event (returns 202) |
| GET | `/api/events` | Get recent events |
| GET | `/api/events/:id/trace` | Get event trace |
| GET | `/api/events/traces/:runId` | Get traces for run |
| POST | `/api/events/hash` | Compute event hash |
| GET | `/api/events/stats` | Get routing statistics |

**Send Event:**
```json
{
  "payload": {
    "type": "task.completed",
    "data": {"taskId": "123", "result": "success"}
  },
  "source": "worker-service",
  "runId": "run-uuid",
  "target": "orchestrator",
  "boundary": "intra"
}
```

**Query Parameters for GET /api/events:**
- `limit` - Number of events (default: 100)
- `runId` - Filter by run ID

### Policy Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/policies` | Create policy |
| GET | `/api/policies` | List policies |
| GET | `/api/policies/:id` | Get policy |
| PATCH | `/api/policies/:id` | Update policy |
| DELETE | `/api/policies/:id` | Delete policy |
| POST | `/api/policies/test` | Test policy (dry run) |

**Create Policy:**
```json
{
  "name": "Block external events",
  "priority": 50,
  "conditions": [
    {"field": "boundary", "operator": "eq", "value": "extra"}
  ],
  "action": {
    "type": "deny",
    "reason": "External events not allowed"
  },
  "enabled": true
}
```

### SDN Endpoints (Observability)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sdn/topology` | Get full network topology |
| GET | `/api/sdn/summary` | Get network statistics |
| GET | `/api/sdn/trace/:eventId` | Get enriched event trace |
| GET | `/api/sdn/traces/:runId` | Get traces for run |
| GET | `/api/sdn/flow/:runId` | Get event flow as graph |
| GET | `/api/sdn/policies` | Get all policies |
| POST | `/api/sdn/simulate` | Simulate event routing |
| GET | `/api/sdn/graph` | Get network graph |

**Simulate Event:**
```json
{
  "payload": {
    "type": "test.event",
    "data": {}
  },
  "source": "test-service",
  "target": "target-service",
  "boundary": "intra"
}
```

### Health & Discovery

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Simple health check |
| GET | `/api/platform/health` | Platform-wide health (all services) |
| GET | `/api/bootstrap/service` | Service discovery |

**Platform Health Response:**
```json
{
  "platform": "healthy",
  "services": {
    "identity": { "status": "healthy", "latencyMs": 15 },
    "catalog": { "status": "healthy", "latencyMs": 22 },
    "runtime": { "status": "healthy", "latencyMs": 18 },
    "logging": { "status": "healthy", "latencyMs": 25 },
    "messaging": { "status": "healthy", "latencyMs": 20 }
  },
  "checkedAt": "2024-01-15T10:30:00Z"
}
```

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

const socket = io('ws://localhost:5054', {
  auth: { token: 'jwt_token' }  // Optional for agents
});
```

### Client Events (Send to Server)

| Event | Payload | Description |
|-------|---------|-------------|
| `node:register` | `{id, name, type, capabilities, endpoint}` | Register node |
| `node:heartbeat` | `{nodeId}` | Keep node alive |
| `node:unregister` | `{nodeId}` | Unregister node |
| `event:send` | `{payload, source, runId, target?, boundary?}` | Send event |
| `contract:create` | `{from, to, allowedEventTypes, boundaries}` | Create contract |
| `sdn:watch` | `{runId?, source?, eventType?}` | Subscribe to events |
| `sdn:unwatch` | `{subscriptionId}` | Unsubscribe |
| `sdn:topology` | - | Get current topology |

### Server Events (Receive from Server)

| Event | Payload | Description |
|-------|---------|-------------|
| `network:node:joined` | `{nodeId, name, type}` | Node connected |
| `network:node:left` | `{nodeId}` | Node unregistered |
| `network:node:disconnected` | `{nodeId}` | Node socket lost |
| `network:contract:created` | Contract object | New contract |
| `event:received` | SandboxEvent | Event delivered |
| `sdn:event` | `{event, trace}` | SDN watcher event |

### WebSocket Example

```javascript
// Register node
socket.emit('node:register', {
  id: 'my-worker',
  name: 'Worker Service',
  type: 'service',
  capabilities: ['process.tasks'],
  endpoint: 'http://localhost:3001/events'
}, (response) => {
  console.log('Registered:', response);
});

// Send event
socket.emit('event:send', {
  payload: { type: 'task.started', data: { taskId: '123' } },
  source: 'my-worker',
  runId: 'run-uuid',
  boundary: 'intra'
}, (response) => {
  console.log('Event sent:', response.eventId);
});

// Listen for events
socket.on('event:received', (event) => {
  console.log('Received:', event.payload.type);
});

// Watch SDN events
socket.emit('sdn:watch', { runId: 'run-uuid' }, (response) => {
  console.log('Watching:', response.subscriptionId);
});

socket.on('sdn:event', ({ event, trace }) => {
  console.log('SDN event:', event.payload.type, trace.status);
});
```

---

## Data Models

### SandboxEvent (Complete Event)

```typescript
{
  payload: {
    type: string,           // Event type identifier
    data: unknown           // Event data
  },
  wrapper: {
    id: string,             // Unique event ID
    runId: string,          // Workflow/sandbox run ID
    timestamp: string,      // ISO timestamp
    source: string,         // Source node ID
    target?: string,        // Target node (optional)
    causedBy?: string,      // Causing event ID
    path: string[],         // Nodes traversed
    boundary: 'intra' | 'inter' | 'extra'
  },
  hash: string              // SHA-256 security commitment
}
```

### NetworkNode

```typescript
{
  id: string,
  name: string,
  type: 'service' | 'assistant' | 'sandbox' | 'bridge',
  capabilities: string[],
  endpoint: string,
  socketId?: string,
  registeredAt: string,
  lastHeartbeat: string,
  metadata?: Record<string, unknown>
}
```

### NodeContract

```typescript
{
  id: string,
  from: string,             // Source node
  to: string,               // Target node
  allowedEventTypes: string[],
  boundaries: ('intra' | 'inter' | 'extra')[],
  createdAt: string,
  expiresAt?: string
}
```

### EventTrace

```typescript
{
  eventId: string,
  runId: string,
  path: [{
    nodeId: string,
    timestamp: string,
    action: 'received' | 'forwarded' | 'dropped',
    durationMs?: number
  }],
  totalDurationMs: number,
  status: 'delivered' | 'dropped' | 'pending' | 'error',
  error?: string
}
```

### NetworkTopology

```typescript
{
  nodes: NetworkNode[],
  contracts: NodeContract[],
  bridges: NetworkBridge[],
  timestamp: string
}
```

---

## Event Routing

### Routing Flow

1. **Event received** via REST or WebSocket
2. **Hash computed** using HMAC-SHA256 with secret
3. **Source validated** - node must be registered
4. **Targets determined**:
   - Explicit target if provided
   - Otherwise, all nodes with matching contracts
5. **Policies evaluated** (highest priority first):
   - `allow` - route to target
   - `deny` - drop with reason
   - `route` - redirect to different target
   - `transform` - modify event before routing
   - `log` - log and continue
6. **Event delivered**:
   - Via WebSocket if node connected
   - Via HTTP POST to endpoint otherwise
7. **Trace recorded** with path and status
8. **SDN watchers notified**

### Boundary Types

| Boundary | Description |
|----------|-------------|
| `intra` | Within same sandbox/execution context |
| `inter` | Between different sandboxes |
| `extra` | To/from external systems |

### Contract Requirements

Events can only flow between nodes that have a contract:
- Contract must exist from source to target
- Event type must be in `allowedEventTypes`
- Boundary must be in contract's `boundaries`
- Contract must not be expired

---

## Policies

### Policy Structure

```typescript
{
  id: string,
  name: string,
  priority: number,         // Higher = evaluated first
  conditions: [{
    field: 'source' | 'target' | 'eventType' | 'boundary' | 'runId',
    operator: 'eq' | 'neq' | 'contains' | 'startsWith' | 'regex',
    value: string
  }],
  action: {
    type: 'allow' | 'deny' | 'route' | 'transform' | 'log',
    reason?: string,        // For deny
    target?: string,        // For route
    transform?: object      // For transform
  },
  enabled: boolean
}
```

### Default Policies

| Priority | Name | Action |
|----------|------|--------|
| 100 | Allow intra-boundary | Allow all `intra` events |
| 90 | Log inter-boundary | Log `inter` events |
| 90 | Log extra-boundary | Log `extra` events |

### Policy Actions

| Action | Description |
|--------|-------------|
| `allow` | Route event to target |
| `deny` | Drop event with optional reason |
| `route` | Redirect to different target |
| `transform` | Modify event before routing |
| `log` | Log event and continue evaluation |

---

## Telemetry

The Network Service emits comprehensive telemetry via `@symbia/logging-client` for observability through the Control Center.

### Metrics

| Category | Metric | Description |
|----------|--------|-------------|
| **Events** | `network.event.routed` | Events successfully routed |
| | `network.event.dropped` | Events dropped by policy |
| | `network.event.error` | Routing errors |
| | `network.event.latency_ms` | End-to-end routing latency |
| | `network.event.delivery.success` | Successful deliveries |
| | `network.event.delivery.failure` | Failed deliveries |
| **Nodes** | `network.node.registered` | Node registrations |
| | `network.node.unregistered` | Node unregistrations |
| | `network.node.heartbeat` | Heartbeat received |
| | `network.node.stale_cleanup` | Stale nodes removed |
| | `network.node.active_count` | Active node gauge |
| **Contracts** | `network.contract.created` | Contracts created |
| | `network.contract.deleted` | Contracts deleted |
| | `network.contract.expired` | Contracts expired |
| | `network.contract.active_count` | Active contract gauge |
| **Bridges** | `network.bridge.registered` | Bridges registered |
| | `network.bridge.deleted` | Bridges deleted |
| | `network.bridge.active_count` | Active bridge gauge |
| **Policies** | `network.policy.evaluated` | Policy evaluations |
| | `network.policy.denied` | Events denied |
| | `network.policy.allowed` | Events allowed |
| | `network.policy.evaluation_latency_ms` | Evaluation latency |
| **Security** | `network.hash.verified` | Hashes verified |
| | `network.hash.failed` | Hash verification failures |
| | `network.agent.auth.success` | Agent auth successes |
| | `network.agent.auth.failure` | Agent auth failures |
| **WebSocket** | `network.socket.connected` | Socket connections |
| | `network.socket.disconnected` | Socket disconnections |
| | `network.socket.message_received` | Messages received |
| **SDN** | `network.sdn.watch.subscribed` | Watch subscriptions |
| | `network.sdn.watch.unsubscribed` | Watch unsubscriptions |
| | `network.sdn.watch.active_count` | Active watchers gauge |

### Events

Telemetry events capture significant state changes:

| Event | Description |
|-------|-------------|
| `network.service.started` | Service startup |
| `network.service.stopped` | Service shutdown |
| `network.event.routed` | Event successfully routed |
| `network.event.dropped` | Event dropped (includes reason) |
| `network.event.delivery_failed` | Delivery failure |
| `network.node.registered` | Node joined network |
| `network.node.unregistered` | Node left network |
| `network.node.stale_cleanup` | Stale node removed |
| `network.contract.created` | Contract established |
| `network.contract.expired` | Contract expired |
| `network.policy.denied` | Policy blocked event |
| `network.security.hash_failed` | Hash verification failed |
| `network.agent.authenticated` | Agent successfully authenticated |
| `network.topology.changed` | Network topology changed |

### Telemetry Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `TELEMETRY_SERVICE_ID` | `network` | Service identifier in telemetry |

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5054` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `CORS_ORIGINS` | `localhost:3000,localhost:5000` | Allowed origins |
| `IDENTITY_SERVICE_URL` | `http://localhost:5053` | Identity service |
| `NETWORK_HASH_SECRET` | `symbia-network-mvp-secret` | Event hash secret |
| `HEARTBEAT_INTERVAL_MS` | `30000` | Cleanup interval |
| `NODE_TIMEOUT_MS` | `90000` | Node stale timeout |
| `MAX_EVENT_HISTORY_SIZE` | `10000` | Event history buffer |
| `MAX_TRACE_HISTORY_SIZE` | `5000` | Trace history buffer |

### Cleanup Behavior

Every `HEARTBEAT_INTERVAL_MS` (30 seconds):
- Nodes without heartbeat for `NODE_TIMEOUT_MS` (90 seconds) are removed
- Expired contracts are deleted
- Cleanup is logged

---

## LLM Integration Guide

This section provides guidance for LLMs interacting with the Network Service.

### Common Workflows

#### 1. Register a Node and Create Contract

```bash
# Register source node
POST /api/registry/nodes
Content-Type: application/json

{
  "id": "data-processor",
  "name": "Data Processor",
  "type": "service",
  "capabilities": ["process.data", "emit.results"],
  "endpoint": "http://localhost:3001/events"
}

# Register target node
POST /api/registry/nodes
Content-Type: application/json

{
  "id": "result-handler",
  "name": "Result Handler",
  "type": "service",
  "capabilities": ["handle.results"],
  "endpoint": "http://localhost:3002/events"
}

# Create contract between them
POST /api/registry/contracts
Content-Type: application/json

{
  "from": "data-processor",
  "to": "result-handler",
  "allowedEventTypes": ["data.processed", "task.completed"],
  "boundaries": ["intra"]
}
```

#### 2. Send an Event

```bash
POST /api/events
Content-Type: application/json

{
  "payload": {
    "type": "data.processed",
    "data": {
      "recordId": "rec-123",
      "processedAt": "2024-01-15T10:30:00Z",
      "result": {"score": 0.95}
    }
  },
  "source": "data-processor",
  "runId": "workflow-uuid",
  "target": "result-handler",
  "boundary": "intra"
}

# Response (202 Accepted)
{
  "eventId": "evt-uuid",
  "status": "routed",
  "trace": {
    "eventId": "evt-uuid",
    "status": "delivered",
    "path": [...]
  }
}
```

#### 3. Create a Routing Policy

```bash
# Block events from untrusted sources
POST /api/policies
Content-Type: application/json

{
  "name": "Block untrusted sources",
  "priority": 80,
  "conditions": [
    {"field": "source", "operator": "startsWith", "value": "untrusted-"}
  ],
  "action": {
    "type": "deny",
    "reason": "Source not trusted"
  },
  "enabled": true
}

# Route specific events to audit service
POST /api/policies
Content-Type: application/json

{
  "name": "Audit sensitive events",
  "priority": 75,
  "conditions": [
    {"field": "eventType", "operator": "contains", "value": "sensitive"}
  ],
  "action": {
    "type": "route",
    "target": "audit-service"
  },
  "enabled": true
}
```

#### 4. Query Network Topology

```bash
# Get full topology
GET /api/sdn/topology

# Response
{
  "nodes": [
    {"id": "data-processor", "type": "service", ...},
    {"id": "result-handler", "type": "service", ...}
  ],
  "contracts": [
    {"from": "data-processor", "to": "result-handler", ...}
  ],
  "bridges": [],
  "timestamp": "2024-01-15T10:30:00Z"
}

# Get network graph for visualization
GET /api/sdn/graph

# Response
{
  "nodes": ["data-processor", "result-handler"],
  "edges": [
    {"from": "data-processor", "to": "result-handler", "types": ["data.processed"]}
  ]
}
```

#### 5. Trace an Event

```bash
# Get trace for specific event
GET /api/sdn/trace/evt-uuid

# Response
{
  "eventId": "evt-uuid",
  "runId": "workflow-uuid",
  "event": {...},
  "trace": {
    "path": [
      {"nodeId": "data-processor", "action": "forwarded", "timestamp": "..."},
      {"nodeId": "result-handler", "action": "received", "timestamp": "..."}
    ],
    "status": "delivered",
    "totalDurationMs": 15
  },
  "nodes": {
    "data-processor": {"name": "Data Processor", "type": "service"},
    "result-handler": {"name": "Result Handler", "type": "service"}
  }
}

# Get all traces for a workflow run
GET /api/sdn/traces/workflow-uuid
```

#### 6. Simulate Event Routing (Dry Run)

```bash
POST /api/sdn/simulate
Content-Type: application/json

{
  "payload": {
    "type": "test.event",
    "data": {"test": true}
  },
  "source": "test-service",
  "target": "target-service",
  "boundary": "intra"
}

# Response shows what would happen without actually routing
{
  "wouldRoute": true,
  "targets": ["target-service"],
  "appliedPolicies": [
    {"id": "policy-1", "name": "Allow intra", "action": "allow"}
  ],
  "blocked": false
}
```

#### 7. WebSocket Real-Time Integration

```javascript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:5054');

// Register as a node
socket.emit('node:register', {
  id: 'realtime-worker',
  name: 'Realtime Worker',
  type: 'service',
  capabilities: ['process.realtime'],
  endpoint: 'ws://connected'
}, (res) => console.log('Registered:', res));

// Send heartbeats
setInterval(() => {
  socket.emit('node:heartbeat', { nodeId: 'realtime-worker' });
}, 30000);

// Listen for incoming events
socket.on('event:received', (event) => {
  console.log('Received event:', event.payload.type);
  // Process event...
});

// Watch all events in a workflow
socket.emit('sdn:watch', { runId: 'workflow-uuid' }, (res) => {
  console.log('Watching with subscription:', res.subscriptionId);
});

socket.on('sdn:event', ({ event, trace }) => {
  console.log('Observed:', event.payload.type, '->', trace.status);
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

#### Event Response (202)
```json
{
  "eventId": "evt-uuid",
  "status": "routed",
  "trace": {...}
}
```

#### Error Response
```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

### Common HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 202 | Accepted (event queued) |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 500 | Internal Server Error |

### Validation Rules

| Field | Rule |
|-------|------|
| `node.type` | One of: `service`, `assistant`, `sandbox`, `bridge` |
| `boundary` | One of: `intra`, `inter`, `extra` |
| `policy.action.type` | One of: `allow`, `deny`, `route`, `transform`, `log` |
| `condition.operator` | One of: `eq`, `neq`, `contains`, `startsWith`, `regex` |
| `condition.field` | One of: `source`, `target`, `eventType`, `boundary`, `runId` |
| `trace.status` | One of: `delivered`, `dropped`, `pending`, `error` |

### Best Practices for LLMs

1. **Always register nodes** before sending events
2. **Create contracts** for all communication paths
3. **Use meaningful event types** - follow `domain.action` convention
4. **Include runId** for workflow correlation
5. **Send heartbeats** every 30 seconds to prevent stale cleanup
6. **Use SDN endpoints** for observability and debugging
7. **Simulate before deploying** - test policies with `/api/sdn/simulate`
8. **Set appropriate priorities** - higher priority policies evaluated first
9. **Use boundaries correctly** - `intra` for internal, `extra` for external
10. **Monitor traces** - use trace APIs to debug routing issues

### Integration Checklist

- [ ] Register all nodes with the network
- [ ] Create contracts for communication paths
- [ ] Configure routing policies
- [ ] Implement heartbeat mechanism
- [ ] Handle `event:received` for incoming events
- [ ] Use runId for workflow correlation
- [ ] Set up SDN watching for observability
- [ ] Implement error handling for dropped events
- [ ] Test routing with simulation endpoint
- [ ] Monitor traces for debugging

---

## Additional Resources

- **OpenAPI Spec:** `/docs/openapi.json`
- **Quick Reference:** `/docs/llms.txt`
- **Full Documentation:** `/docs/llms-full.txt`
- **Health Check:** `/health`
- **Service Discovery:** `/api/bootstrap/service`

---

## License

MIT License - see [LICENSE](../LICENSE) for details.
