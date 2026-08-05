# Symbia Control Center

> Unified observability dashboard for the Symbia platform.

Control Center provides real-time monitoring, log search, and network topology visualization for all Symbia services.

---

## Quick Start

### Prerequisites

- Node.js 18+
- Running Symbia services (Identity, Logging, Network, etc.)

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# API URLs
VITE_API_URL=http://localhost:3000
VITE_LOGGING_URL=http://localhost:3004
VITE_NETWORK_URL=http://localhost:3002
```

### Running

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

Open http://localhost:5173 in your browser.

---

## Features

### Service Monitoring
- Health status for all services
- Real-time stats and metrics
- Service-specific observation panels

### Log Search
- Faceted search with field extraction
- Real-time log streaming (SSE)
- Field extraction and filtering
- Expandable log details with metadata

### Network Topology
- Visual graph of nodes and contracts
- Real-time event stream (WebSocket)
- Event tracing and path visualization

### Integration Management
- Provider configuration
- Model capabilities browser
- Credential status

---

## Architecture

Control Center is a React/TypeScript SPA that consumes data from multiple Symbia services using different transport protocols:

| Data Type | Transport | Service |
|-----------|-----------|---------|
| Logs | SSE (Server-Sent Events) | Logging |
| Network Events | WebSocket (Socket.IO) | Network |
| Health Status | HTTP Polling (5s) | All services |
| CRUD Operations | REST API | All services |

See [INTENT.md](./INTENT.md) for architectural decisions and rationale.

---

## Directory Structure

```
src/
├── components/
│   ├── common/           # Shared components
│   │   └── StreamActionBar.tsx
│   ├── charts/           # Visualization components
│   ├── inputs/           # Form inputs
│   └── panels/           # Main UI panels
│       ├── LogSearchPanel.tsx
│       ├── NetworkPanel.tsx
│       ├── ServiceObservationPanel.tsx
│       └── log-search/
│           ├── FieldSidebar.tsx
│           └── LogResultsTable.tsx
├── config/
│   ├── services.ts       # Service configuration
│   └── logFields.ts      # Log field definitions
├── hooks/
│   ├── useServices.ts    # Data fetching hook
│   └── useTimeSeriesData.ts
├── services/
│   ├── platformClient.ts       # REST API client
│   ├── loggingStreamClient.ts  # SSE client
│   └── networkClient.ts        # WebSocket client
└── stores/
    ├── servicesStore.ts  # Zustand store
    └── logSearchStore.ts # Log search state
```

---

## Transport Protocols

### SSE (Server-Sent Events) — Log Streaming

Logs are streamed in real-time from the Logging service:

```typescript
// Client connection
const eventSource = new EventSource('/api/logs/stream');

eventSource.addEventListener('logs', (event) => {
  const logs = JSON.parse(event.data);
  // Handle new logs
});
```

**Server implementation:** The Logging service uses `LogBroadcaster` to push logs to connected clients when they're ingested — no polling required.

### WebSocket (Socket.IO) — Network Events

Network events require bidirectional communication:

```typescript
// Client connection
const socket = io(NETWORK_URL);

socket.emit('subscribe:events', { runId: '*' });
socket.on('event:received', (event) => {
  // Handle SDN event
});
```

**Why WebSocket:** Clients need to subscribe to specific events and emit their own events (not just receive).

### HTTP Polling — Health Checks

Health status is polled every 5 seconds:

```typescript
setInterval(async () => {
  const health = await platformClient.checkHealth(serviceId);
  updateHealth(serviceId, health);
}, 5000);
```

**Why polling:** Health checks are lightweight and don't need real-time push.

---

## Key Components

### useServices Hook

Central hook for all data fetching:

```typescript
const {
  recentLogs,           // SSE-streamed logs
  recentNetworkEvents,  // WebSocket events
  isLoadingLogging,
  refreshNetwork,
} = useServices({
  enableLogging: true,
  enableNetwork: true,
});
```

### StreamActionBar

Consistent live/pause controls across all streams:

```tsx
<StreamActionBar
  isLive={isLive}
  isPaused={isViewingDetails}
  pauseReason="Viewing details"
  onPause={() => setIsLive(false)}
  onResume={() => setIsLive(true)}
  itemCount={logs.length}
  itemLabel="logs"
/>
```

### LogResultsTable

Virtual-scrolled log table with expandable rows:

```tsx
<LogResultsTable
  logs={filteredLogs}
  isLoading={isLoading}
  hasMore={hasMore}
  onLoadMore={loadMore}
/>
```

Uses `@tanstack/react-virtual` for efficient rendering of large log sets.

---

## Log Field System

Logs are structured with known fields for filtering:

```typescript
// src/config/logFields.ts
const COMMON_FIELDS = [
  { key: 'level', label: 'Level', type: 'enum', filterable: true },
  { key: 'source', label: 'Source', type: 'string', filterable: true },
  { key: 'timestamp', label: 'Timestamp', type: 'timestamp' },
  { key: 'message', label: 'Message', type: 'string' },
];

const PAYLOAD_FIELDS = [
  { key: 'metadata.method', label: 'HTTP Method', type: 'enum' },
  { key: 'metadata.status', label: 'Status Code', type: 'number' },
  { key: 'metadata.duration', label: 'Duration (ms)', type: 'number' },
  // ...
];
```

The Field Sidebar automatically extracts these fields from logs for faceted filtering.

---

## State Management

Control Center uses Zustand for state management:

```typescript
// src/stores/servicesStore.ts
interface ServicesStore {
  // Logging (SSE)
  recentLogs: LogEntry[];
  loggingStats: LoggingStats | null;
  addLogs: (logs: LogEntry[]) => void;

  // Network (WebSocket)
  networkTopology: NetworkTopology | null;
  recentNetworkEvents: NetworkEvent[];

  // Services (REST)
  serviceHealths: Map<string, ServiceHealth>;
}
```

---

## Development

### Adding a New Service

1. Add service config to `src/config/services.ts`
2. Add health check to `src/services/platformClient.ts`
3. Add to `useServices` hook if needed

### Adding a New Log Field

1. Add field definition to `src/config/logFields.ts`
2. Field will auto-appear in sidebar if `filterable: true`

### Adding a New Panel

1. Create component in `src/components/panels/`
2. Add route in `src/App.tsx`
3. Add navigation link

---

## Tech Stack

- **React 18** — UI framework
- **TypeScript** — Type safety
- **Vite** — Build tool
- **Tailwind CSS** — Styling
- **Zustand** — State management
- **Socket.IO Client** — WebSocket
- **@tanstack/react-virtual** — Virtual scrolling
- **Recharts** — Charts

---

## Related Documentation

- [INTENT.md](./INTENT.md) — Architectural intent and design decisions
- [Logging Service README](../logging/README.md) — Log ingestion and streaming
- [Network Service README](../network/README.md) — SDN and event routing
