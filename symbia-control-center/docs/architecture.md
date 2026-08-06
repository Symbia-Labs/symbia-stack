# Control Center Architecture

This document describes the technical architecture of the Symbia Control Center.

---

## Overview

Control Center is a React SPA that provides real-time observability for the Symbia platform. It consumes data from multiple backend services using a mix of transport protocols optimized for each data type.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Control Center (Browser)                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                      React Components                          │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │  │
│  │  │ LogSearch   │  │ Network     │  │ ServiceObservation  │   │  │
│  │  │ Panel       │  │ Panel       │  │ Panel               │   │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘   │  │
│  └─────────┼────────────────┼────────────────────┼──────────────┘  │
│            │                │                    │                  │
│  ┌─────────▼────────────────▼────────────────────▼──────────────┐  │
│  │                    useServices Hook                           │  │
│  │  (Manages connections, subscriptions, and data fetching)      │  │
│  └─────────┬────────────────┬────────────────────┬──────────────┘  │
│            │                │                    │                  │
│  ┌─────────▼────────┐ ┌─────▼─────┐ ┌────────────▼──────────────┐  │
│  │  SSE Client      │ │ Socket.IO │ │ REST/Fetch Clients        │  │
│  │  (EventSource)   │ │ Client    │ │ (platformClient, etc.)    │  │
│  └─────────┬────────┘ └─────┬─────┘ └────────────┬──────────────┘  │
│            │                │                    │                  │
└────────────┼────────────────┼────────────────────┼──────────────────┘
             │                │                    │
             ▼                ▼                    ▼
┌────────────────────────────────────────────────────────────────────┐
│                         Backend Services                            │
├───────────────┬─────────────────┬───────────────────────────────────┤
│               │                 │                                   │
│   Logging     │    Network      │   Identity / Messaging / etc.    │
│   Service     │    Service      │                                   │
│               │                 │                                   │
│  ┌─────────┐  │  ┌───────────┐  │  ┌─────────────────────────────┐ │
│  │   SSE   │  │  │ WebSocket │  │  │       REST API              │ │
│  │Broadcast│  │  │  Server   │  │  │                             │ │
│  └─────────┘  │  └───────────┘  │  └─────────────────────────────┘ │
│               │                 │                                   │
└───────────────┴─────────────────┴───────────────────────────────────┘
```

---

## Transport Layer

### SSE (Server-Sent Events) for Logs

**Why SSE:**
- One-way server-to-client push
- Simpler than WebSocket for push-only use cases
- Native browser support via EventSource
- Automatic reconnection handling

**Implementation:**

```
Browser                               Logging Service
   │                                        │
   │──── GET /api/logs/stream ─────────────>│
   │     Accept: text/event-stream          │
   │                                        │
   │<─── HTTP 200 ─────────────────────────│
   │     Content-Type: text/event-stream    │
   │     Connection: keep-alive             │
   │                                        │
   │<─── event: logs ──────────────────────│
   │     data: [{"id":"...","level":"info"}]│
   │                                        │
   │<─── :heartbeat ───────────────────────│  (every 30s)
   │                                        │
   │<─── event: logs ──────────────────────│
   │     data: [{"id":"...","level":"error"}]
   │                                        │
   (connection stays open)
```

**Client code:**

```typescript
// src/services/loggingStreamClient.ts
class LoggingStreamClient {
  private eventSource: EventSource | null = null;

  connect(onLogs: (logs: LogEntry[]) => void) {
    this.eventSource = new EventSource(`${LOGGING_URL}/api/logs/stream`);

    this.eventSource.addEventListener('logs', (event) => {
      const logs = JSON.parse(event.data);
      onLogs(logs);
    });

    this.eventSource.onerror = () => {
      // Reconnect after delay
      this.eventSource?.close();
      setTimeout(() => this.connect(onLogs), 5000);
    };
  }

  disconnect() {
    this.eventSource?.close();
  }
}
```

**Server code (LogBroadcaster):**

```typescript
// logging/server/src/log-broadcaster.ts
class LogBroadcaster {
  private clients = new Map<string, SSEClient>();

  // Called when logs are ingested
  broadcast(entries: LogEntry[]) {
    for (const client of this.clients.values()) {
      const matching = entries.filter(e => e.orgId === client.orgId);
      if (matching.length > 0) {
        client.res.write(`event: logs\ndata: ${JSON.stringify(matching)}\n\n`);
      }
    }
  }

  // Keep connections alive
  sendHeartbeats() {
    for (const client of this.clients.values()) {
      client.res.write(`:heartbeat\n\n`);
    }
  }
}
```

---

### WebSocket (Socket.IO) for Network Events

**Why WebSocket:**
- Bidirectional communication needed
- Client must subscribe to specific events
- Client can emit events (not just receive)
- Lower latency than HTTP for real-time updates

**Implementation:**

```
Browser                               Network Service
   │                                        │
   │<═══ WebSocket Upgrade ════════════════>│
   │                                        │
   │──── event:subscribe ─────────────────>│
   │     {runId: '*'}                       │
   │                                        │
   │<─── event:received ───────────────────│
   │     {payload, wrapper, hash}           │
   │                                        │
   │<─── topology:update ──────────────────│
   │     {nodes: [...], contracts: [...]}   │
   │                                        │
   │──── watch:start ─────────────────────>│
   │     {runId: 'run_123'}                 │
   │                                        │
   (bidirectional, both can send anytime)
```

**Client code:**

```typescript
// src/services/networkClient.ts
class NetworkClient {
  private socket: Socket | null = null;

  connect() {
    this.socket = io(NETWORK_URL);

    this.socket.on('connect', () => {
      this.socket?.emit('subscribe:events', { runId: '*' });
    });

    this.socket.on('event:received', (event: SandboxEvent) => {
      useServicesStore.getState().addNetworkEvent(event);
    });

    this.socket.on('topology:update', (topology: NetworkTopology) => {
      useServicesStore.getState().setNetworkTopology(topology);
    });
  }

  disconnect() {
    this.socket?.disconnect();
  }
}
```

---

### HTTP Polling for Health Checks

**Why Polling:**
- Health checks are lightweight (< 1KB)
- Don't need real-time push (5s is acceptable)
- No persistent connection overhead
- Works through proxies/load balancers

**Implementation:**

```typescript
// src/hooks/useServices.ts
useEffect(() => {
  const checkHealth = async () => {
    const health = await platformClient.checkHealth(serviceId);
    setHealth(health);
  };

  checkHealth(); // Initial
  const interval = setInterval(checkHealth, 5000);

  return () => clearInterval(interval);
}, [serviceId]);
```

---

### REST for CRUD Operations

**Why REST:**
- Request/response pattern fits CRUD
- Stateless, easy to retry
- Browser fetch API support
- Standard HTTP caching

**Implementation:**

```typescript
// src/services/platformClient.ts
class PlatformClient {
  async getLogs(query: LogsQuery): Promise<LogEntry[]> {
    const params = new URLSearchParams(query);
    const response = await fetch(`${API_URL}/logs?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.json();
  }

  async checkHealth(serviceId: string): Promise<ServiceHealth> {
    const response = await fetch(`${getServiceUrl(serviceId)}/health`);
    return response.json();
  }
}
```

---

## State Management

### Zustand Store

All service data flows through a central store:

```typescript
// src/stores/servicesStore.ts
interface ServicesStore {
  // Logging (SSE-streamed)
  recentLogs: LogEntry[];
  loggingStats: LoggingStats | null;
  isLoadingLogging: boolean;

  // Network (WebSocket-streamed)
  networkTopology: NetworkTopology | null;
  recentNetworkEvents: Array<{ event: SandboxEvent; trace: EventTrace }>;
  networkConnectionStatus: 'connected' | 'connecting' | 'disconnected';

  // Services (REST + Polling)
  serviceHealths: Map<string, ServiceHealth>;

  // Actions
  addLogs: (logs: LogEntry[]) => void;
  setNetworkTopology: (topology: NetworkTopology) => void;
  addNetworkEvent: (event: SandboxEvent) => void;
  setServiceHealth: (serviceId: string, health: ServiceHealth) => void;
}
```

### useServices Hook

Central hook that manages all connections:

```typescript
// src/hooks/useServices.ts
function useServices(options: UseServicesOptions) {
  const store = useServicesStore();

  // SSE for logs
  useEffect(() => {
    if (options.enableLogging) {
      loggingStreamClient.connect((logs) => {
        store.addLogs(logs);
      });
      return () => loggingStreamClient.disconnect();
    }
  }, [options.enableLogging]);

  // WebSocket for network
  useEffect(() => {
    if (options.enableNetwork) {
      networkClient.connect();
      return () => networkClient.disconnect();
    }
  }, [options.enableNetwork]);

  // Polling for health
  useEffect(() => {
    const interval = setInterval(fetchHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  return store;
}
```

---

## Component Architecture

### Panel Hierarchy

```
App
├── Navigation
│   └── ServiceSelector
└── MainPanel
    ├── ServicesOverviewPanel
    │   └── ServiceCard (per service)
    ├── ServiceObservationPanel
    │   ├── DashboardTab
    │   ├── LogsTab
    │   │   └── LogRow
    │   ├── MetricsTab
    │   │   └── Charts
    │   └── EventsTab
    │       └── EventCard
    ├── LogSearchPanel
    │   ├── SearchBar
    │   ├── TimeRangeSelector
    │   ├── FieldSidebar
    │   │   └── FieldSection
    │   └── LogResultsTable
    │       └── LogRow
    └── NetworkPanel
        ├── TopologyGraph
        ├── NodesTab
        ├── ContractsTab
        └── EventsTab
```

### Shared Components

**StreamActionBar:** Live/pause controls for any stream

```tsx
<StreamActionBar
  isLive={isLive}
  isPaused={expandedLogId !== null}
  pauseReason="Viewing details"
  onPause={() => setIsLive(false)}
  onResume={() => setIsLive(true)}
  onRestart={() => clearState()}
  itemCount={items.length}
  itemLabel="logs"
/>
```

**PayloadInspector:** Full-screen JSON viewer for any payload

```tsx
<PayloadInspector
  payload={selectedLog}
  title="Log Entry Details"
  onClose={() => setSelectedLog(null)}
/>
```

---

## Virtual Scrolling

For large data sets, we use `@tanstack/react-virtual`:

```typescript
// src/components/panels/log-search/LogResultsTable.tsx
const rowVirtualizer = useVirtualizer({
  count: logs.length,
  getScrollElement: () => parentRef.current,
  estimateSize: (index) => {
    const log = logs[index];
    const isExpanded = expandedLogId === log.id;
    if (!isExpanded) return 44;
    // Dynamic height for expanded rows
    const metadataLines = log.metadata
      ? JSON.stringify(log.metadata, null, 2).split('\n').length
      : 0;
    return 120 + Math.min(metadataLines * 16, 400);
  },
  overscan: 10,
});
```

---

## Error Handling

### Connection Failures

```typescript
// SSE reconnection
eventSource.onerror = () => {
  setConnectionStatus('disconnected');
  eventSource.close();
  setTimeout(() => reconnect(), 5000);
};

// WebSocket reconnection (Socket.IO handles automatically)
socket.on('disconnect', () => {
  setConnectionStatus('disconnected');
});
socket.on('connect', () => {
  setConnectionStatus('connected');
  resubscribe();
});
```

### API Errors

```typescript
try {
  const health = await platformClient.checkHealth(serviceId);
  setHealth(health);
} catch (error) {
  setHealth({ status: 'error', error: error.message });
}
```

---

## Performance Considerations

1. **Virtual scrolling** for large log sets (1000+ rows)
2. **Debounced search** for field filtering
3. **Memoized computations** for field extraction
4. **Connection pooling** (single SSE/WebSocket per service)
5. **Heartbeats** to detect stale connections early
