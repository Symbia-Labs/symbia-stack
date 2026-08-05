# Symbia Control Center — Architectural Intent

> The unified observability dashboard for the Symbia platform.

---

## What Control Center Is

Control Center is the **observability and management dashboard** for the Symbia platform. It provides:

1. **Service Monitoring** — Health status, metrics, and logs for all services
2. **Network Topology** — Visual graph of nodes, contracts, and event flow
3. **Log Search** — Full-featured log search with faceted filtering
4. **Assistant Management** — Configuration and monitoring of AI assistants
5. **Integration Management** — Provider configuration and model capabilities

This is not a simple admin panel. It's a real-time observability tool designed for debugging, monitoring, and managing a distributed AI platform.

---

## The Problem We're Solving

Debugging distributed AI systems is hard:

1. **Events span multiple services** — A user message triggers Messaging, routes through Network, invokes an Assistant, calls Integrations for LLM inference. When something fails, you need visibility across all of them.

2. **Real-time matters** — When an agent isn't responding, you can't wait for batch analytics. You need live event streams, log tails, and topology visualization.

3. **Context is scattered** — Logs are in the Logging service, events are in Network, health is per-service. A single dashboard needs to aggregate all of this coherently.

4. **Transport protocols vary** — Some data needs polling (health checks), some needs push (logs via SSE), some needs bidirectional communication (network events via WebSocket). The UI must handle all seamlessly.

5. **Filtering is critical** — With thousands of events per minute, faceted search and smart filtering are essential for finding relevant data.

Control Center addresses all of these as primary concerns.

---

## Core Concepts

### Services

**What they are:** Backend components that Control Center monitors.

**Monitored services:**

| Service | Purpose | Transport |
|---------|---------|-----------|
| Identity | Authentication, users, orgs | REST |
| Messaging | Conversations, messages | REST + WebSocket |
| Network | SDN, event routing, topology | REST + WebSocket |
| Logging | Log ingestion, search, streaming | REST + SSE |
| Assistants | AI agent configuration | REST |
| Integrations | Provider management, models | REST |
| Catalog | Asset and resource registry | REST |
| Runtime | Workflow execution | REST + WebSocket |

**Health monitoring:** Control Center polls each service's health endpoint every 5 seconds.

---

### Transport Protocols

Control Center uses different protocols for different data types:

#### REST (Request/Response)
Used for CRUD operations and queries:
- Create/update/delete resources
- Historical log search
- Configuration changes
- Service stats

#### SSE (Server-Sent Events)
Used for one-way server-to-client push:
- **Log streaming** — Real-time log entries from Logging service
- Single persistent HTTP connection
- Server pushes when new data arrives
- Client can only receive (not send)

```
Client                            Logging Service
    │                                │
    │──── GET /logs/stream ─────────>│  (persistent)
    │<─── event: logs ───────────────│
    │<─── event: logs ───────────────│
    │<─── :heartbeat ────────────────│
```

#### WebSocket (Bidirectional)
Used for real-time bidirectional communication:
- **Network events** — SDN event stream via Socket.IO
- Client can emit events (subscribe, filter)
- Server broadcasts events to rooms
- Full duplex communication

```
Client                            Network Service
    │                                │
    │<═══ WebSocket Upgrade ════════>│
    │──── event:subscribe ──────────>│
    │<─── event:received ────────────│
    │<─── topology:update ───────────│
```

#### HTTP Polling
Used for lightweight periodic checks:
- Health status (every 5 seconds)
- Service stats
- Topology refresh

---

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      Control Center (React)                      │
├──────────────┬──────────────┬─────────────────┬────────────────┤
│   REST API   │     SSE      │    WebSocket    │    Polling     │
│   (fetch)    │ (EventSource)│   (Socket.IO)   │  (setInterval) │
├──────────────┼──────────────┼─────────────────┼────────────────┤
│ • CRUD ops   │ • Log stream │ • Network events│ • Health check │
│ • Search     │ • Real-time  │ • Topology      │ • Stats        │
│ • Config     │   log tail   │ • Event tracing │                │
└──────────────┴──────────────┴─────────────────┴────────────────┘
         │              │               │                │
         ▼              ▼               ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Backend Services                          │
├────────────┬───────────┬──────────┬────────────┬───────────────┤
│  Identity  │ Messaging │ Network  │  Logging   │ Integrations  │
│            │           │  (SDN)   │            │               │
└────────────┴───────────┴──────────┴────────────┴───────────────┘
```

---

## Design Principles

### 1. Real-Time First

The dashboard prioritizes live data over historical queries:

```typescript
// Log streaming via SSE - no polling
useEffect(() => {
  const eventSource = new EventSource('/api/logs/stream');
  eventSource.addEventListener('logs', (event) => {
    const newLogs = JSON.parse(event.data);
    setRecentLogs(prev => [...newLogs, ...prev].slice(0, 500));
  });
  return () => eventSource.close();
}, []);
```

**Why real-time first:**
- Debugging requires live visibility
- Polling wastes resources when no new data
- SSE/WebSocket provide push-based updates
- Historical search available as fallback

**Trade-off accepted:** More connection management complexity. Worth it for responsive UX.

### 2. Transport Selection by Use Case

Different data types use different transports:

| Data Type | Transport | Reason |
|-----------|-----------|--------|
| Logs | SSE | One-way push, high volume |
| Network events | WebSocket | Bidirectional, need to subscribe |
| Health | Polling | Lightweight, stateless |
| CRUD | REST | Request/response pattern |

**Why multiple transports:**
- SSE is simpler than WebSocket for push-only
- WebSocket needed when client must emit
- Polling acceptable for infrequent, lightweight checks
- REST best for CRUD operations

### 3. Unified State Management

All service data flows through a central Zustand store:

```typescript
interface ServicesStore {
  // Logging (SSE-streamed)
  recentLogs: LogEntry[];
  loggingStats: LoggingStats | null;

  // Network (WebSocket-streamed)
  networkTopology: NetworkTopology | null;
  recentNetworkEvents: NetworkEvent[];

  // Services (REST + Polling)
  serviceHealths: Map<string, ServiceHealth>;

  // Actions
  addLogs: (logs: LogEntry[]) => void;
  setNetworkTopology: (topology: NetworkTopology) => void;
  // ...
}
```

**Why centralized state:**
- Multiple components consume same data
- Avoids duplicate connections
- Single source of truth
- Easy to debug state

### 4. Graceful Degradation

When a connection fails, the UI degrades gracefully:

```typescript
// SSE reconnection
eventSource.onerror = () => {
  eventSource.close();
  setTimeout(() => initSSE(), 5000); // Retry after 5s
};

// WebSocket reconnection (Socket.IO handles automatically)
socket.on('disconnect', () => {
  setConnectionStatus('disconnected');
});
socket.on('connect', () => {
  setConnectionStatus('connected');
  socket.emit('subscribe:events'); // Re-subscribe
});
```

**Why graceful degradation:**
- Network issues are common
- Don't crash the whole UI for one failed connection
- Show connection status to user
- Auto-retry with backoff

---

## UI Architecture

### Panel System

Control Center uses a panel-based layout:

```
┌─────────────────────────────────────────────────────────────────┐
│  Navigation Bar                                                  │
├────────────────┬────────────────────────────────────────────────┤
│                │                                                 │
│   Sidebar      │               Main Panel                        │
│   (Services)   │   (ServiceObservation / LogSearch / Network)   │
│                │                                                 │
│   • Identity   │   ┌─────────────────────────────────────────┐  │
│   • Messaging  │   │  Dashboard / Logs / Metrics / Events     │  │
│   • Network    │   ├─────────────────────────────────────────┤  │
│   • Logging    │   │                                         │  │
│   • ...        │   │  Panel Content                          │  │
│                │   │                                         │  │
└────────────────┴───┴─────────────────────────────────────────┴──┘
```

**Key panels:**

| Panel | Purpose |
|-------|---------|
| ServicesOverview | Service health grid |
| ServiceObservation | Deep dive into single service |
| LogSearchPanel | Full-featured log search |
| NetworkPanel | SDN topology and events |
| IntegrationsPanel | Provider and model management |

### Stream Action Bar

A reusable component for live/pause controls:

```typescript
<StreamActionBar
  isLive={isLive}
  isPaused={expandedLogId !== null}
  pauseReason="Viewing details"
  onPause={() => setIsLive(false)}
  onResume={() => setIsLive(true)}
  onRestart={() => clearAndResume()}
  itemCount={logs.length}
  itemLabel="logs"
/>
```

**Why a dedicated component:**
- Consistent UX across all streams
- Handles live/pause/restart state
- Shows pause reason
- Displays item counts

---

## Integration with Services

### Logging Service (SSE)

Control Center subscribes to the log stream:

```
GET /api/logs/stream
Authorization: Bearer <token>

←── event: logs
←── data: [{"id": "...", "level": "info", "message": "..."}]

←── :heartbeat (every 30s)
```

**Server-side (LogBroadcaster):**
- Maintains SSE connections per client
- Filters logs by org, streams, level
- Broadcasts on ingest (no polling)
- Sends heartbeats to keep connections alive

### Network Service (WebSocket)

Control Center connects via Socket.IO:

```typescript
socket.emit('subscribe:events', { runId: '*' });
socket.on('event:received', (event: SandboxEvent) => {
  addNetworkEvent(event);
});
socket.on('topology:update', (topology: NetworkTopology) => {
  setTopology(topology);
});
```

**Why WebSocket for Network:**
- Need to subscribe to specific events
- Topology updates are pushed
- Event tracing requires bidirectional

### Other Services (REST + Polling)

```typescript
// Health polling (every 5s)
useEffect(() => {
  const interval = setInterval(async () => {
    const health = await platformClient.checkHealth(serviceId);
    setHealth(health);
  }, 5000);
  return () => clearInterval(interval);
}, [serviceId]);
```

**Why polling for health:**
- Health checks are lightweight
- No need for persistent connection
- 5s interval is acceptable latency

---

## Log Search Architecture

### Envelope and Payload Model

Logs follow a structured model:

```typescript
interface LogEntry {
  // Envelope (routing metadata)
  id: string;
  streamId: string;
  orgId: string;
  timestamp: string;

  // Common fields
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  source: string;

  // Tracing
  traceId?: string;
  spanId?: string;

  // Payload (business data)
  tags?: Record<string, string>;
  metadata?: Record<string, unknown>;
}
```

**Field categories:**

| Category | Fields | Purpose |
|----------|--------|---------|
| Common | level, timestamp, message, source | Core log data |
| Envelope | id, streamId, orgId | Routing metadata |
| Trace | traceId, spanId | Distributed tracing |
| Payload | tags, metadata | Business context |

### Faceted Search

The Field Sidebar extracts unique values for filtering:

```typescript
// Extract field values from logs
function extractFields(logs: LogEntry[]): ExtractedField[] {
  const fields = new Map<string, Map<string, number>>();

  for (const log of logs) {
    // Extract level, source, and metadata fields
    addFieldValue(fields, 'level', log.level);
    addFieldValue(fields, 'source', log.source);
    // ... extract from metadata
  }

  return formatAsFields(fields);
}
```

**Click-to-filter:** Clicking a field value adds it to active filters.

---

## What Control Center Does NOT Do

1. **Not a data store** — Control Center doesn't persist data. It consumes from services.

2. **Not an API gateway** — Requests go directly to services, not through Control Center.

3. **Not an alerting system** — No built-in alerts. Use external monitoring for that.

4. **Not for end users** — This is an operator/developer tool, not customer-facing.

---

## Future Directions

### Planned
- [ ] Saved searches with localStorage persistence
- [ ] Export logs to JSON/CSV
- [ ] Log volume histogram with click-to-zoom
- [ ] Trace waterfall visualization

### Considered
- [ ] Custom dashboards with configurable panels
- [ ] Alert rule configuration
- [ ] Multi-org view for platform admins

### Intentionally Deferred
- [ ] Mobile-responsive design (desktop-first for operators)
- [ ] Offline support (real-time tool needs connectivity)

---

## Quick Reference

### Transport Protocols

| Protocol | Use Case | Connection | Direction |
|----------|----------|------------|-----------|
| REST | CRUD, queries | Per-request | Request/Response |
| SSE | Log streaming | Persistent | Server → Client |
| WebSocket | Network events | Persistent | Bidirectional |
| Polling | Health checks | Per-request | Request/Response |

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| useServices | hooks/useServices.ts | Data fetching hook |
| servicesStore | stores/servicesStore.ts | Zustand state |
| StreamActionBar | common/StreamActionBar.tsx | Live/pause controls |
| LogSearchPanel | panels/LogSearchPanel.tsx | Log search UI |
| NetworkPanel | panels/NetworkPanel.tsx | SDN topology |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| VITE_API_URL | Yes | Base URL for API requests |
| VITE_LOGGING_URL | Yes | Logging service URL |
| VITE_NETWORK_URL | Yes | Network service URL |
