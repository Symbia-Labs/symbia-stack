# @symbia/logging-client - Telemetry Client Library

Logging service client providing logs, metrics, traces, and telemetry for all Symbia microservices. Unified observability with automatic batching, retry logic, and queue management.

## Capabilities

| Capability | Description |
|------------|-------------|
| Multi-Channel | Logs, metrics, distributed traces, object references |
| Batching | Efficient data aggregation before transmission |
| Auto-Retry | Exponential backoff on failures |
| Queue Management | Bounded queues with overflow protection |
| Graceful Degradation | No-op mode when disabled or unavailable |
| HTTP Integration | Middleware for automatic request tracking |

## Quick Start

### Installation

```bash
npm install @symbia/logging-client
```

### Basic Usage

```typescript
import { createTelemetryClient } from "@symbia/logging-client";

const telemetry = createTelemetryClient({
  serviceId: "my-service",
});

// Log messages
telemetry.log("info", "Service started", { version: "1.0.0" });

// Record events
telemetry.event("user.login", "User logged in", { userId: "123" });

// Track metrics
telemetry.metric("request.count", 1, { endpoint: "/api/users" });

// Distributed tracing
telemetry.span({
  traceId: "trace-123",
  spanId: "span-456",
  name: "database.query",
  startTime: new Date().toISOString(),
});

// Graceful shutdown
await telemetry.shutdown();
```

### Environment Variables

```bash
# Endpoint configuration
TELEMETRY_ENDPOINT=http://localhost:5002
LOGGING_ENDPOINT=http://localhost:5002  # Fallback

# Authentication
TELEMETRY_AUTH_MODE=apiKey  # or "bearer" or "none"
TELEMETRY_API_KEY=your-api-key
TELEMETRY_BEARER=your-bearer-token

# Context
TELEMETRY_ORG_ID=org-123
TELEMETRY_ENV=production
TELEMETRY_DATA_CLASS=none
TELEMETRY_POLICY_REF=policy/default

# Performance tuning
TELEMETRY_MAX_BATCH=50
TELEMETRY_FLUSH_MS=1000
TELEMETRY_RETRY=3
TELEMETRY_MAX_QUEUE=1000
```

## Architecture

### Directory Structure

```
symbia-logging-client/
├── src/
│   ├── index.ts          # Main exports
│   ├── client.ts         # Client factory and implementation
│   ├── types.ts          # TypeScript interfaces
│   ├── config.ts         # Configuration handling
│   └── metrics.ts        # Standard metric definitions
├── dist/                 # Compiled JavaScript + types
└── package.json
```

### Data Flow

```
Service Code
    ↓
telemetry.log() / metric() / span() / objectRef()
    ↓
In-Memory Queues (logs, metrics, traces, objects)
    ↓
Periodic Timer or Manual flush()
    ↓
HTTP POST to Logging Service
    ↓
Retry with Exponential Backoff
```

## API Reference

### createTelemetryClient(config)

Create a telemetry client instance.

```typescript
import { createTelemetryClient } from "@symbia/logging-client";

const telemetry = createTelemetryClient({
  serviceId: "my-service",  // Required
  endpoint: "http://localhost:5002",
  orgId: "org-123",
  env: "production",
});
```

**TelemetryConfig:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `serviceId` | `string` | Required | Service identifier |
| `enabled` | `boolean` | Auto | Enable/disable telemetry |
| `endpoint` | `string` | From env | Logging service URL |
| `authMode` | `string` | Auto | "apiKey", "bearer", or "none" |
| `apiKey` | `string` | From env | API key for authentication |
| `bearer` | `string` | From env | Bearer token |
| `orgId` | `string` | From env | Organization identifier |
| `env` | `string` | NODE_ENV | Environment (dev/prod) |
| `dataClass` | `string` | "none" | Data classification |
| `policyRef` | `string` | "policy/default" | Policy reference |
| `maxBatch` | `number` | 50 | Max items per flush |
| `flushMs` | `number` | 1000 | Flush interval (ms) |
| `retry` | `number` | 3 | Retry attempts |
| `maxQueue` | `number` | 1000 | Max queue size |

### TelemetryClient Methods

#### log(level, message, metadata?)

Log a message with level and optional metadata.

```typescript
telemetry.log("info", "Request processed", { requestId: "123" });
telemetry.log("error", "Database connection failed", { error: err.message });
telemetry.log("warn", "Rate limit approaching", { current: 90, max: 100 });
telemetry.log("debug", "Cache hit", { key: "user:123" });
```

#### event(eventType, message, metadata?, level?)

Record a named event.

```typescript
telemetry.event("user.login", "User logged in", { userId: "123" });
telemetry.event("order.created", "New order", { orderId: "456", total: 99.99 });
telemetry.event("service.error", "External API failed", { api: "payment" }, "error");
```

#### metric(name, value, labels?)

Record a metric value.

```typescript
telemetry.metric("request.count", 1);
telemetry.metric("request.latency_ms", 45.2, { endpoint: "/api/users" });
telemetry.metric("queue.size", 150, { queue: "notifications" });
telemetry.metric("cache.hit_rate", 0.85);
```

#### span(spanData)

Record a distributed trace span.

```typescript
telemetry.span({
  traceId: "trace-abc123",
  spanId: "span-def456",
  parentSpanId: "span-parent",  // Optional
  name: "database.query",
  serviceName: "my-service",
  kind: "client",  // "server", "client", "internal"
  status: "ok",    // "ok", "error"
  startTime: startTime.toISOString(),
  endTime: endTime.toISOString(),
  attributes: {
    "db.system": "postgresql",
    "db.statement": "SELECT * FROM users",
  },
  events: [
    { name: "query.start", timestamp: startTime.toISOString() },
  ],
});
```

#### objectRef(entry)

Track a binary object reference.

```typescript
telemetry.objectRef({
  storageUrl: "s3://bucket/path/to/file.pdf",
  size: 1024000,
  checksum: "sha256:abc123...",
  contentType: "application/pdf",
  metadata: { uploadedBy: "user-123" },
});
```

#### flush()

Manually flush all queued data.

```typescript
await telemetry.flush();
```

#### shutdown()

Flush and stop the client.

```typescript
// Call on process shutdown
process.on("SIGTERM", async () => {
  await telemetry.shutdown();
  process.exit(0);
});
```

## TypeScript Types

### Entry Types

```typescript
interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  metadata?: Record<string, unknown>;
}

interface MetricEntry {
  name: string;
  timestamp: string;
  value: number;
  labels?: Record<string, unknown>;
}

interface SpanEntry {
  traceId: string;
  spanId: string;
  parentSpanId?: string | null;
  name: string;
  serviceName?: string;
  kind?: string;
  status?: string;
  startTime: string;
  endTime?: string;
  attributes?: Record<string, unknown>;
  events?: Array<Record<string, unknown>>;
}

interface ObjectRefEntry {
  storageUrl: string;
  size?: number;
  checksum?: string;
  contentType?: string;
  metadata?: Record<string, unknown>;
}
```

### Client Interface

```typescript
interface TelemetryClient {
  log(level: string, message: string, metadata?: Record<string, unknown>): void;
  event(eventType: string, message: string, metadata?: Record<string, unknown>, level?: string): void;
  metric(name: string, value: number, labels?: Record<string, unknown>): void;
  span(spanData: SpanEntry): void;
  objectRef(entry: ObjectRefEntry): void;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}
```

## Standard Metrics

Pre-registered metrics for consistency:

| Metric | Type | Description |
|--------|------|-------------|
| `service.request.count` | counter | Total HTTP requests |
| `service.error.count` | counter | Total HTTP errors |
| `service.request.latency_ms` | histogram | Request latency (ms) |
| `service.dependency.latency_ms` | histogram | Dependency latency (ms) |

## HTTP Middleware Integration

The client integrates with `@symbia/http` for automatic request tracking:

```typescript
import { createSymbiaServer } from "@symbia/http";
import { createTelemetryClient } from "@symbia/logging-client";

const telemetry = createTelemetryClient({ serviceId: "my-service" });

const server = createSymbiaServer({
  serviceId: "my-service",
  telemetry: {
    client: telemetry,
    excludePaths: ["/health", "/health/live", "/health/ready"],
  },
});
```

**Automatic Tracking:**
- Request/response metrics
- Distributed trace spans
- Error events for 5xx responses
- Trace ID propagation via `x-trace-id` header

## Queue Management

### Overflow Protection

When queues exceed `maxQueue`, oldest entries are dropped:

```typescript
const telemetry = createTelemetryClient({
  serviceId: "my-service",
  maxQueue: 1000,  // Drop oldest when exceeded
});
```

### Flush Control

```typescript
const telemetry = createTelemetryClient({
  serviceId: "my-service",
  flushMs: 1000,   // Flush every second
  maxBatch: 50,    // Max 50 items per batch
});
```

## Retry Logic

Automatic retry with exponential backoff:

```typescript
const telemetry = createTelemetryClient({
  serviceId: "my-service",
  retry: 3,  // Up to 3 retry attempts
});

// Retry delays: 1s, 2s, 3s (capped at 5s)
```

## Graceful Degradation

The client returns a no-op implementation when:
- `enabled: false` is set
- No endpoint is configured
- Endpoint is empty string

```typescript
// No-op client (all methods do nothing)
const telemetry = createTelemetryClient({
  serviceId: "my-service",
  enabled: false,
});

// These calls are silently ignored
telemetry.log("info", "This won't be sent");
telemetry.metric("count", 1);
```

## Logging Service Endpoints

The client communicates with these endpoints:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/logs/streams` | Create log stream |
| `POST /api/logs/ingest` | Send log entries |
| `POST /api/metrics` | Register metric |
| `POST /api/metrics/ingest` | Send metric data |
| `POST /api/traces/ingest` | Send trace spans |
| `POST /api/objects/streams` | Create object stream |
| `POST /api/objects/ingest` | Send object references |

## Request Headers

All requests include:

```
Content-Type: application/json
X-Org-Id: {orgId}
X-Service-Id: {serviceId}
X-Env: {env}
X-Data-Class: {dataClass}
X-Policy-Ref: {policyRef}
X-API-Key: {apiKey}          // If authMode === "apiKey"
Authorization: Bearer {token} // If authMode === "bearer"
```

## Services Using This Package

| Service | Use Case |
|---------|----------|
| Identity | Request logging, auth metrics |
| Catalog | Resource access tracking |
| Logging | Self-telemetry |
| Messaging | Message flow tracing |
| Assistants | LLM request metrics |
| Network | Event routing traces |
| Runtime | Execution metrics |
| Server | API request tracking |
| symbia-http | Middleware integration |

## LLM Integration Guide

### Standard Service Setup

```typescript
import { createTelemetryClient } from "@symbia/logging-client";
import { createSymbiaServer } from "@symbia/http";

const telemetry = createTelemetryClient({
  serviceId: "my-service",
});

const server = createSymbiaServer({
  serviceId: "my-service",
  telemetry: { client: telemetry },
  registerRoutes: (httpServer, app) => {
    app.get("/api/process", async (req, res) => {
      const start = Date.now();

      try {
        const result = await processRequest(req.body);

        telemetry.metric("process.success", 1);
        telemetry.metric("process.duration_ms", Date.now() - start);

        res.json(result);
      } catch (error) {
        telemetry.event("process.error", error.message, {
          requestId: req.headers["x-request-id"],
        }, "error");

        res.status(500).json({ error: "Processing failed" });
      }
    });
  },
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  await telemetry.shutdown();
  await server.shutdown();
});
```

### Distributed Tracing

```typescript
app.get("/api/data", async (req, res) => {
  const traceId = req.headers["x-trace-id"] || crypto.randomUUID();
  const spanId = crypto.randomUUID();

  telemetry.span({
    traceId,
    spanId,
    name: "api.getData",
    kind: "server",
    startTime: new Date().toISOString(),
  });

  // Make downstream call with trace propagation
  const response = await fetch("http://other-service/api", {
    headers: { "x-trace-id": traceId },
  });

  telemetry.span({
    traceId,
    spanId,
    name: "api.getData",
    kind: "server",
    status: "ok",
    startTime: startTime,
    endTime: new Date().toISOString(),
  });
});
```

### Custom Metrics

```typescript
// Business metrics
telemetry.metric("orders.created", 1, { region: "us-west" });
telemetry.metric("revenue.usd", 99.99, { product: "premium" });

// Performance metrics
telemetry.metric("cache.hit_rate", 0.85);
telemetry.metric("queue.depth", 42, { queue: "notifications" });

// Resource metrics
telemetry.metric("connections.active", 15, { pool: "postgres" });
```

## Integration Checklist

- [ ] Install `@symbia/logging-client`
- [ ] Set `TELEMETRY_ENDPOINT` environment variable
- [ ] Configure authentication (API key or bearer token)
- [ ] Create client with `serviceId`
- [ ] Integrate with `@symbia/http` for automatic tracking
- [ ] Add custom metrics for business logic
- [ ] Implement distributed tracing with trace ID propagation
- [ ] Call `shutdown()` on process termination
- [ ] Handle graceful degradation (no-op when disabled)
