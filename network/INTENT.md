# Network Service — Architectural Intent

> The software-defined network for event routing and service mesh.

---

## What Network Is

Network is the **event routing and service mesh hub** for the Symbia platform. It manages:

1. **Nodes** — Services, assistants, sandboxes, and bridges that communicate
2. **Contracts** — Authorization for which nodes can talk to which
3. **Events** — Messages routed through the network with security hashes
4. **Policies** — Rules that filter, transform, or redirect events
5. **Traces** — Records of event paths for debugging and observability

This is not a message queue. It's a software-defined network (SoftSDN) that enforces communication policies, provides observability into event flow, and enables dynamic routing decisions.

---

## The Problem We're Solving

In a microservices architecture with AI agents, communication becomes complex:

1. **Not all services should talk to all services** — A data processor shouldn't send events directly to the billing system. You need explicit authorization for communication paths.

2. **Events need traceability** — When debugging "why didn't the agent respond?", you need to see the event's path through the network, where it was blocked, and why.

3. **Routing needs policies** — Block events from untrusted sources. Route sensitive events to audit. Transform payloads before delivery. These rules shouldn't be scattered across services.

4. **Boundaries matter** — Events within a sandbox are different from events crossing sandboxes, which are different from events going to external systems. Each needs different handling.

5. **Security needs cryptographic commitment** — Events should be tamper-evident. If an event claims to be from "trusted-service," there should be a hash proving it.

6. **Observability needs to be built in** — You can't add network visibility after the fact. The routing layer must capture traces, topology, and flow.

Network addresses all of these as primary concerns.

---

## Core Concepts

### Nodes

**What they are:** Endpoints that send and receive events through the network.

**Types:**

| Type | Description | Example |
|------|-------------|---------|
| `service` | Backend service | API gateway, data processor |
| `assistant` | AI agent | `assistant:support`, `assistant:analyst` |
| `sandbox` | Isolated execution environment | Workflow runtime instance |
| `bridge` | External system connector | Webhook to third-party API |

**Structure:**
```json
{
  "id": "data-processor",
  "name": "Data Processor Service",
  "type": "service",
  "capabilities": ["process.data", "emit.results"],
  "endpoint": "http://localhost:3001/events",
  "registeredAt": "2024-01-15T10:00:00Z",
  "lastHeartbeat": "2024-01-15T10:30:00Z"
}
```

**Why nodes register:**
- Network knows what's available
- Events can be routed by capability
- Stale nodes get cleaned up
- Topology is visible

---

### Contracts

**What they are:** Authorization for communication between two nodes.

**Structure:**
```json
{
  "id": "contract-uuid",
  "from": "data-processor",
  "to": "result-handler",
  "allowedEventTypes": ["data.processed", "task.completed"],
  "boundaries": ["intra", "inter"],
  "expiresAt": "2024-12-31T23:59:59Z"
}
```

**What contracts enforce:**
- Source node must match `from`
- Target node must match `to`
- Event type must be in `allowedEventTypes`
- Boundary must be in `boundaries`
- Contract must not be expired

**Why contracts exist:**
- Explicit authorization (no implicit "anyone can send to anyone")
- Scoped communication (only specific event types allowed)
- Time-limited access (contracts can expire)
- Audit trail (who authorized what)

---

### Events

**What they are:** Messages routed through the network.

**Full structure (SandboxEvent):**
```json
{
  "payload": {
    "type": "data.processed",
    "data": {
      "recordId": "rec-123",
      "result": {"score": 0.95}
    }
  },
  "wrapper": {
    "id": "evt-uuid",
    "runId": "workflow-uuid",
    "timestamp": "2024-01-15T10:30:00Z",
    "source": "data-processor",
    "target": "result-handler",
    "causedBy": "previous-evt-uuid",
    "path": ["data-processor"],
    "boundary": "intra"
  },
  "hash": "sha256:abc123..."
}
```

**Three parts:**
- `payload` — The actual event content (type + data)
- `wrapper` — Routing metadata (source, target, path, timing)
- `hash` — Cryptographic commitment for tamper-evidence

---

### Boundaries

**What they are:** Scopes that define where events can travel.

| Boundary | Meaning | Use Case |
|----------|---------|----------|
| `intra` | Within same sandbox/execution | Steps in a workflow |
| `inter` | Between different sandboxes | Cross-workflow communication |
| `extra` | To/from external systems | Third-party integrations |

**Why boundaries matter:**
- Different security requirements (extra needs more scrutiny)
- Different policies per boundary
- Contracts specify allowed boundaries
- Tracing groups events by scope

---

### Policies

**What they are:** Rules that control event routing.

**Structure:**
```json
{
  "id": "policy-uuid",
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
```

**Actions:**

| Action | Effect |
|--------|--------|
| `allow` | Route event to target |
| `deny` | Drop event with reason |
| `route` | Redirect to different target |
| `transform` | Modify event before routing |
| `log` | Log event and continue evaluation |

**Evaluation order:** Higher priority first. First matching policy wins (except `log` which continues).

---

### Traces

**What they are:** Records of event paths through the network.

**Structure:**
```json
{
  "eventId": "evt-uuid",
  "runId": "workflow-uuid",
  "path": [
    {"nodeId": "data-processor", "action": "forwarded", "timestamp": "...", "durationMs": 5},
    {"nodeId": "result-handler", "action": "received", "timestamp": "...", "durationMs": 10}
  ],
  "totalDurationMs": 15,
  "status": "delivered"
}
```

**Status values:**

| Status | Meaning |
|--------|---------|
| `delivered` | Event reached target |
| `dropped` | Event blocked by policy or missing contract |
| `pending` | Event in transit |
| `error` | Delivery failed |

---

## Design Principles

### 1. Explicit Authorization via Contracts

No implicit "service A can send to service B." Every communication path requires a contract:

```
data-processor ──[contract]──▶ result-handler
      │                              │
      │  allowedEventTypes:          │
      │  - data.processed            │
      │  - task.completed            │
      │                              │
      │  boundaries:                 │
      │  - intra                     │
      └──────────────────────────────┘
```

**Why this matters:**
- Security by default (deny-all without contracts)
- Explicit documentation of communication paths
- Easy to audit who can send what to whom
- Contracts can be revoked or expired

**Trade-off accepted:** More setup required. Worth it for security guarantees.

### 2. Hash-Based Security Commitment

Every event has a cryptographic hash:

```
hash = HMAC-SHA256(secret, JSON.stringify(payload) + wrapper.source + wrapper.timestamp)
```

**What this provides:**
- Tamper-evidence (modified events have wrong hash)
- Source authentication (only nodes with secret can generate valid hashes)
- Replay detection (timestamp in hash)

**What this does NOT provide:**
- Encryption (events are plaintext)
- Non-repudiation (shared secret, not public key)

### 3. Policy-Based Routing Control

Routing decisions are centralized in policies, not scattered across services:

```
Event arrives
    │
    ▼
┌─────────────────────────────────────────┐
│ Policy Evaluation (priority order)       │
├─────────────────────────────────────────┤
│ P100: Allow all intra-boundary          │
│ P90:  Log inter-boundary                │
│ P80:  Block untrusted sources (DENY)    │
│ P75:  Route sensitive to audit          │
│ P50:  Transform PII events              │
└─────────────────────────────────────────┘
    │
    ▼
Route / Drop / Transform
```

**Why centralized policies:**
- Single place to understand routing rules
- Easy to add/remove rules without code changes
- Simulation before deployment
- Audit trail of policy decisions

### 4. SoftSDN Observability

The network is inspectable at runtime:

**Topology:** What nodes exist, what contracts connect them
```
GET /api/sdn/topology
→ {nodes: [...], contracts: [...], bridges: [...]}
```

**Traces:** Where did this event go?
```
GET /api/sdn/trace/{eventId}
→ {path: [...], status: "delivered", durationMs: 15}
```

**Flow:** What events happened in this workflow?
```
GET /api/sdn/flow/{runId}
→ {events: [...], graph: {nodes: [...], edges: [...]}}
```

**Simulation:** What would happen if I sent this event?
```
POST /api/sdn/simulate
→ {wouldRoute: true, targets: [...], appliedPolicies: [...]}
```

**Why this matters:**
- Debug routing issues without guessing
- Understand network topology visually
- Test policies before enabling them
- Trace requests across the entire system

### 5. Dual Delivery (WebSocket + HTTP)

Events are delivered via the fastest available path:

```
Event received
    │
    ├─── Target has active WebSocket? ───▶ Emit via socket
    │                                         (lowest latency)
    │
    └─── No socket? ───▶ POST to endpoint
                            (reliable delivery)
```

**Why both:**
- WebSocket for real-time nodes (agents, dashboards)
- HTTP for services that don't maintain connections
- Automatic fallback ensures delivery
- Same event format regardless of transport

### 6. Heartbeat-Based Liveness

Nodes must send heartbeats to stay registered:

```
Node registers → lastHeartbeat = now
Every 30 seconds → node sends heartbeat
Every 30 seconds → network checks for stale nodes
Stale (90+ seconds) → node removed from registry
```

**Why heartbeats:**
- Detect crashed nodes
- Clean up stale registrations
- Topology reflects reality
- Contracts to dead nodes become invalid

### 7. Entity-to-Node Binding

Nodes can be bound to Entity UUIDs from the Identity service's Entity Directory:

```
Entity (persistent identity)         Network Node (ephemeral runtime)
────────────────────────────        ──────────────────────────────────
ent_abc123 (log-analyst)     ←────→ assistant:log-analyst:socket-xyz
                                    (bound while connected)
```

**Binding lifecycle:**
1. Node connects and registers with Network
2. Node binds to its Entity UUID via `bindEntityToNode()`
3. Registry tracks bidirectional: `entityId → nodeId` and `nodeId → entityId`
4. Events can target Entity UUIDs (resolved to node IDs for routing)
5. On disconnect, entity unbinds but persists in Identity service

**Why entity binding:**
- UUID-based addressing across services (not node IDs)
- Entity identity persists even when nodes restart
- Enables multi-instance assistants (same entity type, different instances)
- Messages can route to entities without knowing ephemeral node IDs

**Registry functions:**

| Function | Purpose |
|----------|---------|
| `bindEntityToNode(nodeId, entityId)` | Associate entity with connected node |
| `unbindEntityFromNode(nodeId)` | Disassociate on disconnect |
| `getNodeByEntityId(entityId)` | Resolve entity to current node |
| `findNodesByEntityType(type)` | Find nodes by entity type prefix |
| `getEntityIdForNode(nodeId)` | Get entity bound to a node |

### 8. Justification Event Routing

The Network routes assistant justification events for turn-taking coordination:

| Event Type | Purpose |
|------------|---------|
| `assistant.intent.claim` | Assistant declares intent to respond |
| `assistant.intent.defer` | Assistant defers to another |
| `assistant.action.observe` | Assistant observes silently |
| `assistant.action.respond` | Assistant confirms response with justification |

These events include `sourceEntityId` and appear in the Control Center's Network panel Events tab for full observability of assistant behavior.

---

## Data Flow

### Event Routing

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Source  │     │   Network    │     │   Policy     │     │   Target     │
│   Node   │     │   Service    │     │   Engine     │     │    Node      │
└──────────┘     └──────────────┘     └──────────────┘     └──────────────┘
     │                  │                    │                    │
     │ POST /api/events │                    │                    │
     │─────────────────▶│                    │                    │
     │                  │ Compute hash       │                    │
     │                  │ Validate source    │                    │
     │                  │ Check contract     │                    │
     │                  │                    │                    │
     │                  │ Evaluate policies  │                    │
     │                  │───────────────────▶│                    │
     │                  │◀───────────────────│                    │
     │                  │ Action: allow      │                    │
     │                  │                    │                    │
     │                  │ Deliver event ─────────────────────────▶│
     │                  │                    │                    │
     │                  │ Record trace       │                    │
     │                  │ Notify SDN watchers│                    │
     │◀─────────────────│                    │                    │
     │ 202 Accepted     │                    │                    │
```

### Node Registration

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐
│   Node   │     │   Network    │     │   Registry   │
│          │     │   Service    │     │              │
└──────────┘     └──────────────┘     └──────────────┘
     │                  │                    │
     │ Register node    │                    │
     │─────────────────▶│                    │
     │                  │ Store node         │
     │                  │───────────────────▶│
     │                  │◀───────────────────│
     │                  │                    │
     │                  │ Broadcast          │
     │                  │ node:joined        │
     │                  │─────────────────── │ (to all connected)
     │◀─────────────────│                    │
     │ {id, registered} │                    │
     │                  │                    │
     │ Heartbeat (30s)  │                    │
     │─────────────────▶│                    │
     │                  │ Update timestamp   │
     │                  │───────────────────▶│
```

### SDN Observation

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐
│ Observer │     │   Network    │     │   Events     │
│ (Debug)  │     │   Service    │     │              │
└──────────┘     └──────────────┘     └──────────────┘
     │                  │                    │
     │ sdn:watch        │                    │
     │ {runId: "xyz"}   │                    │
     │─────────────────▶│                    │
     │                  │ Subscribe to       │
     │                  │ runId events       │
     │◀─────────────────│                    │
     │ {subscriptionId} │                    │
     │                  │                    │
     │                  │                    │ (event routed)
     │                  │◀───────────────────│
     │◀─────────────────│                    │
     │ sdn:event        │                    │
     │ {event, trace}   │                    │
     │                  │                    │
     │ sdn:unwatch      │                    │
     │─────────────────▶│                    │
```

---

## Schema Design Decisions

### Why In-Memory Storage (Currently)

Network state is stored in memory, not a database:

```typescript
const nodes: Map<string, NetworkNode> = new Map();
const contracts: Map<string, NodeContract> = new Map();
const events: SandboxEvent[] = [];  // Ring buffer
const traces: Map<string, EventTrace> = new Map();
```

**Why:**
- Low latency for routing decisions
- No database dependency for core routing
- Simplifies deployment
- Network state is reconstructable (nodes re-register on restart)

**Trade-off accepted:** State lost on restart. Acceptable because:
- Nodes re-register automatically
- Contracts can be recreated
- Events have limited retention anyway
- Traces are for debugging, not permanent storage

**Future:** Database backing for persistence across restarts.

### Why Ring Buffers for History

Events and traces use fixed-size buffers:

```
MAX_EVENT_HISTORY_SIZE = 10000
MAX_TRACE_HISTORY_SIZE = 5000
```

**Why:**
- Bounded memory usage
- Old events automatically evicted
- Recent events always available
- No cleanup jobs needed

### Why HMAC-SHA256 for Hashing

Event hashes use HMAC with a shared secret:

```
hash = HMAC-SHA256(NETWORK_HASH_SECRET, payload + source + timestamp)
```

**Why HMAC over plain SHA256:**
- Requires secret to generate valid hash
- Nodes can't forge events from other nodes
- Shared secret is simpler than PKI

**Why not asymmetric signatures:**
- Complexity (key management, rotation)
- Performance (HMAC is faster)
- Sufficient for internal network (not end-user facing)

---

## Policy Deep Dive

### Condition Fields

| Field | Description | Example |
|-------|-------------|---------|
| `source` | Source node ID | `"data-processor"` |
| `target` | Target node ID | `"result-handler"` |
| `eventType` | Event type from payload | `"data.processed"` |
| `boundary` | Event boundary | `"intra"` |
| `runId` | Workflow run ID | `"workflow-uuid"` |

### Operators

| Operator | Meaning | Example |
|----------|---------|---------|
| `eq` | Equals | `source eq "data-processor"` |
| `neq` | Not equals | `boundary neq "extra"` |
| `contains` | String contains | `eventType contains "error"` |
| `startsWith` | String prefix | `source startsWith "untrusted-"` |
| `regex` | Regex match | `eventType regex "^audit\\..*"` |

### Default Policies

| Priority | Name | Conditions | Action |
|----------|------|------------|--------|
| 100 | Allow intra-boundary | `boundary eq "intra"` | `allow` |
| 90 | Log inter-boundary | `boundary eq "inter"` | `log` |
| 90 | Log extra-boundary | `boundary eq "extra"` | `log` |

### Policy Examples

**Block external events:**
```json
{
  "name": "Block external",
  "priority": 95,
  "conditions": [{"field": "boundary", "operator": "eq", "value": "extra"}],
  "action": {"type": "deny", "reason": "External events not allowed"}
}
```

**Route audit events:**
```json
{
  "name": "Audit sensitive",
  "priority": 85,
  "conditions": [{"field": "eventType", "operator": "contains", "value": "sensitive"}],
  "action": {"type": "route", "target": "audit-service"}
}
```

**Log all errors:**
```json
{
  "name": "Log errors",
  "priority": 80,
  "conditions": [{"field": "eventType", "operator": "contains", "value": "error"}],
  "action": {"type": "log"}
}
```

---

## Integration Patterns

### For Services

```typescript
import { createNetworkClient } from "@symbia/relay";

const network = createNetworkClient({
  endpoint: process.env.NETWORK_URL,
  nodeId: "my-service",
  capabilities: ["process.data", "emit.results"]
});

// Register on startup
await network.register();

// Send heartbeats
network.startHeartbeat(30000);

// Send event
await network.sendEvent({
  type: "data.processed",
  data: { recordId: "123", result: "success" }
}, {
  target: "result-handler",
  runId: workflowId,
  boundary: "intra"
});

// Receive events (if WebSocket connected)
network.onEvent((event) => {
  console.log("Received:", event.payload.type);
  handleEvent(event);
});
```

### For AI Agents

```typescript
const network = createNetworkClient({
  endpoint: process.env.NETWORK_URL,
  nodeId: "assistant:analyst",
  token: agentJwt,  // Agent JWT for authentication
  capabilities: ["analyze.data", "generate.report"]
});

await network.register();

// Watch for events targeting this agent
network.onEvent(async (event) => {
  if (event.payload.type === "analysis.requested") {
    const result = await performAnalysis(event.payload.data);

    await network.sendEvent({
      type: "analysis.completed",
      data: result
    }, {
      target: event.wrapper.source,  // Reply to sender
      runId: event.wrapper.runId,
      causedBy: event.wrapper.id
    });
  }
});
```

### For Observability Dashboards

```typescript
const socket = io(process.env.NETWORK_URL);

// Watch all events in a workflow
socket.emit("sdn:watch", { runId: workflowId }, (response) => {
  subscriptionId = response.subscriptionId;
});

socket.on("sdn:event", ({ event, trace }) => {
  // Update visualization
  addEventToTimeline(event);
  updateTopologyHighlight(trace.path);

  if (trace.status === "dropped") {
    showDroppedWarning(event, trace.error);
  }
});

// Get current topology for visualization
const topology = await fetch(`${NETWORK_URL}/api/sdn/topology`).then(r => r.json());
renderNetworkGraph(topology.nodes, topology.contracts);
```

### For Testing with Simulation

```typescript
// Test policy before enabling
const simulation = await network.simulate({
  payload: { type: "sensitive.data", data: {} },
  source: "test-service",
  target: "production-db",
  boundary: "inter"
});

if (simulation.blocked) {
  console.log("Event would be blocked by:", simulation.appliedPolicies);
} else {
  console.log("Event would reach:", simulation.targets);
}
```

### For User-Proxied Clients (Control Plane UIs)

Control plane UIs like Mission Control act as **user-proxied clients**, not registered nodes. They observe and control the network on behalf of the authenticated user, inheriting the user's permissions.

```typescript
import { io } from "socket.io-client";

// Connect with user's JWT (not a service token)
const socket = io(process.env.NETWORK_URL, {
  auth: { token: userSessionJwt }
});

// User-proxied clients don't register as nodes
// They use SDN observability features directly

// Watch events (scoped by user's permissions)
socket.emit("sdn:watch", { runId: workflowId }, (response) => {
  if (response.error) {
    // User may not have permission to watch this runId
    showPermissionError(response.error);
    return;
  }
  subscriptionId = response.subscriptionId;
});

// Get topology (filtered by user's access)
socket.emit("sdn:topology", (topology) => {
  renderNetworkGraph(topology.nodes, topology.contracts);
});

// Admin operations require appropriate entitlements
socket.emit("policy:create", newPolicy, (response) => {
  if (response.error === "insufficient_permissions") {
    showReadOnlyWarning();
  }
});
```

**Key differences from service nodes:**
- No node registration or heartbeats
- User's JWT determines access level
- Read-only users see topology but can't modify
- Admin users can manage policies, contracts, nodes
- Permissions validated via Identity Service introspection

**Required user entitlements (defined in Identity Service):**

| Entitlement | Grants |
|-------------|--------|
| `cap:network.topology.read` | View nodes, contracts, bridges |
| `cap:network.events.read` | Watch event stream (sdn:watch) |
| `cap:network.traces.read` | View event traces |
| `cap:network.policies.read` | View routing policies |
| `cap:network.policies.write` | Create/modify/delete policies |
| `cap:network.contracts.write` | Create/modify contracts |
| `cap:network.nodes.admin` | Force disconnect nodes |

---

## Operational Considerations

### Performance Characteristics

| Operation | Typical Latency | Notes |
|-----------|-----------------|-------|
| Event routing | 5-20ms | Hash + policy eval + delivery |
| Node registration | 5-10ms | In-memory write |
| Heartbeat | <5ms | Timestamp update |
| Topology query | 10-30ms | Serialize in-memory state |
| Trace lookup | <5ms | Map lookup |

### Scaling Considerations

- **Horizontal:** Currently single-instance. Future: shared state via Redis
- **Events:** Ring buffer limits memory usage
- **WebSockets:** Socket.IO can cluster with Redis adapter
- **Policies:** Evaluated in-memory, very fast

### Monitoring Points

The Network Service emits comprehensive telemetry via `@symbia/logging-client`:

**Core Metrics:**
- `network.event.routed` — Events routed per second
- `network.event.dropped` — Events dropped per second (by policy)
- `network.event.latency_ms` — End-to-end routing latency
- `network.node.active_count` — Active nodes gauge
- `network.contract.active_count` — Active contracts gauge
- `network.policy.evaluation_latency_ms` — Policy evaluation time
- `network.socket.connected` / `.disconnected` — WebSocket connections

**Lifecycle Events:**
- `network.node.registered` / `network.node.unregistered` — Node lifecycle
- `network.node.stale_cleanup` — Heartbeat failures and cleanup
- `network.contract.created` / `.expired` — Contract lifecycle
- `network.policy.denied` — Policy denials with reason
- `network.security.hash_failed` — Hash verification failures
- `network.agent.authenticated` — Agent authentication events

All telemetry includes standard dimensions: nodeId, nodeType, eventType, boundary, policyId, etc.

### Cleanup Behavior

Every 30 seconds:
1. Find nodes with `lastHeartbeat` > 90 seconds ago
2. Remove stale nodes
3. Broadcast `node:left` for each
4. Log cleanup activity

---

## What Network Does Not Do

### No Message Persistence

Events are in a ring buffer. Old events are evicted. No durable storage.

**Rationale:** Network is for routing, not storage. If you need event persistence, send to Logging service.

### No Guaranteed Delivery

If HTTP delivery fails and no WebSocket is connected, the event is dropped.

**Rationale:** Simplicity. Retry logic belongs in the sender. Network provides best-effort delivery with tracing.

### No Encryption

Events are plaintext. Security comes from hashing and contracts, not encryption.

**Rationale:** Internal network. TLS on transport. Encryption adds complexity for minimal benefit.

### No Complex Transformations

Transform policies can modify events, but not run arbitrary code.

**Rationale:** Security. Transformations are data mappings, not code execution.

---

## Network Federation

### Vision

Multiple Network Service instances can interconnect to form a federated mesh. Each network maintains its own registry of nodes, but networks can discover and inspect each other's registries through a **Master Directory**.

```
                    ┌─────────────────────┐
                    │   Master Directory  │
                    │                     │
                    │  • Network registry │
                    │  • Trust root       │
                    │  • Discovery        │
                    └─────────────────────┘
                         ▲    ▲    ▲
                         │    │    │
           ┌─────────────┘    │    └─────────────┐
           │                  │                  │
           ▼                  ▼                  ▼
    ┌────────────┐     ┌────────────┐     ┌────────────┐
    │ Network A  │     │ Network B  │     │ Network C  │
    │ (symbia)   │     │ (customer) │     │ (partner)  │
    │            │◄───►│            │◄───►│            │
    │ • services │     │ • services │     │ • services │
    │ • agents   │     │ • agents   │     │ • agents   │
    │ • bridges  │     │ • bridges  │     │ • bridges  │
    └────────────┘     └────────────┘     └────────────┘
```

### Network as a Node Type

Networks register with peer networks using a `network` node type:

```json
{
  "id": "network:symbia-prod",
  "name": "Symbia Production Network",
  "type": "network",
  "capabilities": ["registry.inspect", "events.route"],
  "endpoint": "https://network.example.com",
  "metadata": {
    "orgId": "symbia",
    "region": "us-east-1",
    "publicKey": "..."
  }
}
```

### Master Directory Role

The Master Directory (not yet built) serves as:

1. **Network Registry** — Networks register their existence and endpoint
2. **Trust Root** — Establishes trust between networks
3. **Discovery** — Networks query directory to find peers
4. **Capability Advertisement** — Networks declare what they expose

### Federation Capabilities

| Capability | Description | Status |
|------------|-------------|--------|
| Registry inspection | Query peer network's topology | Planned |
| Cross-network routing | Route events to nodes on peer networks | Future |
| Federated contracts | Contracts spanning multiple networks | Future |
| Unified observability | Watch events across networks | Future |

### User Permissions in Federation

When networks federate, user permissions become multi-dimensional:

```
User entitlement: cap:network.topology.read:symbia-prod
                  ────────────────────────  ───────────
                           │                     │
                    Resource type           Network scope
```

**Permission model:**
- `cap:network.topology.read` — All networks user has access to
- `cap:network.topology.read:prod` — Specific network only
- Organization membership may grant implicit network access

### Current State

Federation is **not yet implemented**. Current scope:
- Single network instance per deployment
- User auth scoped to that network's Identity Service
- No cross-network communication

Federation will be built incrementally:
1. Master Directory service (trust and discovery)
2. Network-to-network registration
3. Registry inspection protocol
4. Cross-network event routing

---

## Future Directions

### Planned

1. **Database persistence** — Survive restarts without re-registration
2. **Clustering** — Multiple Network instances with shared state
3. **Delivery guarantees** — At-least-once with acknowledgments
4. **Rate limiting** — Per-node event rate limits
5. **Network-specific entitlements** — Define `cap:network.*` permissions in Identity Service
6. **Master Directory** — Central registry for network federation
7. **Network-to-network peering** — Registry inspection across networks

### Implemented

1. **Comprehensive telemetry** — Metrics and events via @symbia/logging-client (see Monitoring Points)
2. **User-proxied client auth** — WebSocket and REST API authentication with permission checks for control plane UIs

### Considered

1. **Event schemas** — Validate event payloads against schemas
2. **Circuit breakers** — Automatic disable of failing routes
3. **Dead letter queue** — Capture undeliverable events

### Intentionally Deferred

1. **Cross-network event routing** — Events routing across federated networks (requires Master Directory first)
2. **Event replay** — Replay historical events
3. **Complex event processing** — Aggregations, windows, joins

---

## Quick Reference

### Node Types

| Type | Description |
|------|-------------|
| `service` | Backend service |
| `assistant` | AI agent |
| `sandbox` | Execution environment |
| `bridge` | External connector |
| `network` | Peer network (federation) |

### Boundary Types

| Boundary | Scope |
|----------|-------|
| `intra` | Same sandbox |
| `inter` | Cross-sandbox |
| `extra` | External systems |

### Policy Actions

| Action | Effect |
|--------|--------|
| `allow` | Route event |
| `deny` | Drop event |
| `route` | Redirect target |
| `transform` | Modify event |
| `log` | Log and continue |

### Condition Operators

| Operator | Meaning |
|----------|---------|
| `eq` | Equals |
| `neq` | Not equals |
| `contains` | String contains |
| `startsWith` | String prefix |
| `regex` | Regex match |

### Trace Statuses

| Status | Meaning |
|--------|---------|
| `delivered` | Reached target |
| `dropped` | Blocked/no contract |
| `pending` | In transit |
| `error` | Delivery failed |

---

*This document reflects the Network service architectural intent as of January 2026.*
