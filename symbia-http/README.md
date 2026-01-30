# @symbia/http - HTTP Server Library

HTTP server, WebSocket, and middleware utilities for Symbia microservices. Provides standardized Express configuration, telemetry instrumentation, and Kubernetes-ready health checks.

## Capabilities

| Capability | Description |
|------------|-------------|
| Express Server | Pre-configured Express 5 with security best practices |
| WebSocket Support | Socket.IO integration with CORS handling |
| Telemetry | Request tracing, metrics, and distributed tracing |
| Health Checks | Kubernetes liveness and readiness probes |
| Graceful Shutdown | Connection draining with configurable timeouts |
| Multi-Tenant | Scope header extraction for org/service context |
| CORS | Wildcard patterns, public paths, environment-aware |
| Logging | Request/response logging with sensitive data redaction |

## Quick Start

### Installation

```bash
npm install @symbia/http
```

### Basic Usage

```typescript
import { createSymbiaServer } from "@symbia/http";

const server = createSymbiaServer({
  serviceId: "my-service",
  registerRoutes: (httpServer, app) => {
    app.get("/api/hello", (req, res) => {
      res.json({ message: "Hello, world!" });
    });
  },
});

await server.start();
```

### With Telemetry

```typescript
import { createSymbiaServer } from "@symbia/http";
import { createTelemetryClient } from "@symbia/logging-client";

const telemetry = createTelemetryClient({ serviceId: "my-service" });

const server = createSymbiaServer({
  serviceId: "my-service",
  telemetry: { client: telemetry },
  health: {
    readinessCheck: async () => await db.ping(),
  },
  registerRoutes: (httpServer, app) => {
    app.get("/api/items", handleGetItems);
  },
});

await server.start();
```

## Architecture

### Directory Structure

```
symbia-http/
├── src/
│   ├── index.ts          # Package entry and exports
│   ├── server.ts         # Core server creation
│   ├── types.ts          # TypeScript interfaces
│   ├── cors.ts           # CORS middleware
│   ├── logging.ts        # Request/response logging
│   ├── telemetry.ts      # Telemetry instrumentation
│   └── scope.ts          # Multi-tenant header extraction
├── dist/                 # Compiled JavaScript + types
├── package.json
└── tsconfig.json
```

### Middleware Stack Order

1. **CORS** - Cross-origin request handling
2. **Body Parsing** - JSON and form-encoded bodies
3. **Cookie Parser** - Cookie header parsing
4. **Session** (optional) - Express session with MemoryStore
5. **Health Checks** - `/health`, `/health/live`, `/health/ready`
6. **Telemetry** - Metrics, spans, distributed tracing
7. **Logging** - Request/response logging
8. **Custom Middleware** - User-provided middleware
9. **Routes** - Service-specific route handlers
10. **Error Handler** - Catch-all error handling

## API Reference

### createSymbiaServer(config)

Create and configure an Express server instance.

```typescript
function createSymbiaServer(config: ServerConfig): ServerInstance
```

**ServerConfig Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `serviceId` | `string` | Required | Service identifier |
| `port` | `number` | Auto-resolved | Server port |
| `host` | `string` | `"0.0.0.0"` | Bind address |
| `cors` | `CorsConfig` | `{}` | CORS configuration |
| `socket` | `SocketConfig` | `{enabled: false}` | Socket.IO configuration |
| `session` | `SessionConfig` | `{enabled: false}` | Session configuration |
| `telemetry` | `TelemetryConfig` | `undefined` | Telemetry client |
| `enableLogging` | `boolean` | `true` | Enable request logging |
| `middleware` | `Middleware[]` | `[]` | Custom middleware |
| `registerRoutes` | `Function` | `undefined` | Route registration callback |
| `health` | `HealthConfig` | `{enabled: true}` | Health check config |
| `shutdown` | `ShutdownConfig` | `{}` | Shutdown configuration |
| `trustProxy` | `number \| boolean` | `1` | Trust proxy headers |
| `database` | `DatabaseShutdownHook` | `undefined` | Database for graceful shutdown |
| `dbExportPath` | `string` | `undefined` | Export path for memory DB |
| `setupVite` | `Function` | `undefined` | Vite dev server setup |
| `serveStatic` | `Function` | `undefined` | Static file serving |

**ServerInstance Methods:**

| Method | Description |
|--------|-------------|
| `start()` | Start the server |
| `shutdown()` | Gracefully shutdown |
| `isReady()` | Check readiness state |
| `setReady(ready)` | Set readiness state |

**ServerInstance Properties:**

| Property | Description |
|----------|-------------|
| `app` | Express application |
| `httpServer` | HTTP server instance |
| `io` | Socket.IO server (if enabled) |
| `telemetry` | Telemetry client (if configured) |

### Configuration Types

#### CorsConfig

```typescript
interface CorsConfig {
  origins?: string[];       // Allowed origins (supports *.domain.com)
  publicPaths?: string[];   // Paths allowing public CORS
  allowLocalhost?: boolean; // Allow localhost in dev (default: true)
}
```

#### SocketConfig

```typescript
interface SocketConfig {
  enabled: boolean;
  options?: Partial<SocketIOServerOptions>;
  setupHandlers?: (io: SocketIOServer) => void | Promise<void>;
}
```

#### SessionConfig

```typescript
interface SessionConfig {
  secret?: string;  // Signing secret
  enabled?: boolean;
  store?: any;      // Custom session store
}
```

#### TelemetryConfig

```typescript
interface TelemetryConfig {
  client: TelemetryClient;
  excludePaths?: string[];  // Skip telemetry for these paths
}
```

#### HealthConfig

```typescript
interface HealthConfig {
  enabled?: boolean;           // Enable health endpoint (default: true)
  enableLiveness?: boolean;    // Enable /health/live (default: true)
  enableReadiness?: boolean;   // Enable /health/ready (default: true)
  readinessCheck?: () => Promise<boolean> | boolean;
  livenessCheck?: () => Promise<boolean> | boolean;
}
```

#### ShutdownConfig

```typescript
interface ShutdownConfig {
  gracePeriodMs?: number;       // Connection drain timeout (default: 30000)
  preShutdownDelayMs?: number;  // Delay before shutdown (default: 5000)
  hooks?: Array<() => Promise<void> | void>;  // Custom cleanup hooks
}
```

#### DatabaseShutdownHook

```typescript
interface DatabaseShutdownHook {
  isMemory: boolean;
  exportToFile: (filePath: string) => boolean;
  close: () => Promise<void>;
}
```

### CORS Utilities

#### buildCorsOptions(config)

Build Socket.IO-compatible CORS options.

```typescript
import { buildCorsOptions } from "@symbia/http";

const corsOptions = buildCorsOptions({
  origins: ["https://app.example.com", "*.replit.app"],
  allowLocalhost: true,
});

// Use with Socket.IO
const io = new Server(httpServer, { cors: corsOptions });
```

#### createCorsMiddleware(config)

Create Express CORS middleware.

```typescript
import { createCorsMiddleware } from "@symbia/http";

app.use(createCorsMiddleware({
  origins: ["https://app.example.com"],
  publicPaths: ["/docs", "/openapi.json"],
}));
```

#### matchesOrigin(origin, pattern)

Check if origin matches pattern (supports wildcards).

```typescript
import { matchesOrigin } from "@symbia/http";

matchesOrigin("https://app.replit.app", "*.replit.app");  // true
matchesOrigin("https://app.example.com", "*.replit.app"); // false
```

### Logging Utilities

#### log(message, source?)

Log with timestamp formatting.

```typescript
import { log } from "@symbia/http";

log("Server starting", "my-service");
// Output: 10:30:45 AM [my-service] Server starting
```

#### createLoggingMiddleware(options)

Create request/response logging middleware.

```typescript
import { createLoggingMiddleware } from "@symbia/http";

app.use(createLoggingMiddleware({
  verbose: true,           // Include request/response bodies
  telemetry: telemetryClient,
  excludePaths: ["/health"],
}));
```

**Logging Output:**

```
→ POST /api/users {"email":"user@example.com","password":"[REDACTED]"}
← POST /api/users 201 in 45ms
```

### Telemetry Utilities

#### createTelemetryMiddleware(client, excludePaths?)

Create telemetry instrumentation middleware.

```typescript
import { createTelemetryMiddleware } from "@symbia/http";

app.use(createTelemetryMiddleware(telemetryClient, ["/health"]));
```

**Instrumentation:**

| Metric | Description |
|--------|-------------|
| `service.request.count` | Request counter |
| `service.request.latency_ms` | Request duration |
| `service.error.count` | Error counter (5xx only) |

**Distributed Tracing:**
- Reads `x-trace-id` header for trace correlation
- Generates trace ID if not present
- Sets `x-trace-id` response header

### Scope Utilities

#### getScopeHeaders(req)

Extract multi-tenant context from request headers.

```typescript
import { getScopeHeaders } from "@symbia/http";

app.use((req, res, next) => {
  const scope = getScopeHeaders(req);
  // { orgId, serviceId, env, dataClass, policyRef }
  req.scope = scope;
  next();
});
```

**Extracted Headers:**

| Header | Property |
|--------|----------|
| `x-org-id` | `orgId` |
| `x-service-id` | `serviceId` |
| `x-env` / `x-environment` | `env` |
| `x-data-class` | `dataClass` |
| `x-policy-ref` | `policyRef` |

#### buildScopeLabels(scope)

Convert scope to telemetry labels.

```typescript
import { buildScopeLabels, getScopeHeaders } from "@symbia/http";

const scope = getScopeHeaders(req);
const labels = buildScopeLabels(scope);
// { orgId: "org-123", serviceId: "my-service", env: "production" }
```

## Health Checks

### Endpoints

| Endpoint | Purpose | Response |
|----------|---------|----------|
| `GET /health` | Basic health | `200` if ready, `503` if degraded |
| `GET /health/live` | Kubernetes liveness | `200` if process alive |
| `GET /health/ready` | Kubernetes readiness | `200` if ready for traffic |

### Response Format

```json
{
  "status": "ok",
  "timestamp": "2026-01-22T10:30:00.000Z",
  "checks": {
    "database": { "status": "ok", "latency_ms": 5 },
    "redis": { "status": "ok", "latency_ms": 2 }
  }
}
```

### Custom Checks

```typescript
const server = createSymbiaServer({
  serviceId: "my-service",
  health: {
    readinessCheck: async () => {
      const dbOk = await db.ping();
      const cacheOk = await redis.ping();
      return dbOk && cacheOk;
    },
    livenessCheck: () => true,
  },
});
```

## Graceful Shutdown

### Default Behavior

1. Mark server not ready (stops K8s traffic)
2. Wait for pre-shutdown delay (5s default)
3. Run custom shutdown hooks
4. Export in-memory database (if configured)
5. Flush telemetry
6. Close database connection
7. Close Socket.IO
8. Close HTTP server with grace period (30s default)
9. Force-close remaining connections

### Configuration

```typescript
const server = createSymbiaServer({
  serviceId: "my-service",
  shutdown: {
    gracePeriodMs: 60000,        // 60s connection drain
    preShutdownDelayMs: 10000,   // 10s before shutdown
    hooks: [
      async () => await cache.flush(),
      async () => await queue.drain(),
    ],
  },
  database: {
    isMemory: true,
    exportToFile: (path) => db.export(path),
    close: async () => await db.close(),
  },
  dbExportPath: "./backup/db-export.json",
});
```

### Signal Handling

Automatically handles `SIGINT` and `SIGTERM` for graceful shutdown.

## WebSocket Support

### Enable Socket.IO

```typescript
const server = createSymbiaServer({
  serviceId: "my-service",
  socket: {
    enabled: true,
    options: {
      pingInterval: 10000,
      pingTimeout: 5000,
    },
    setupHandlers: (io) => {
      io.on("connection", (socket) => {
        console.log("Client connected:", socket.id);

        socket.on("message", (data) => {
          io.emit("broadcast", data);
        });

        socket.on("disconnect", () => {
          console.log("Client disconnected:", socket.id);
        });
      });
    },
  },
});
```

### CORS for WebSocket

```typescript
const server = createSymbiaServer({
  serviceId: "my-service",
  cors: {
    origins: ["https://app.example.com"],
    allowLocalhost: true,
  },
  socket: {
    enabled: true,
  },
});
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | Auto-resolved |
| `HOST` | Bind address | `0.0.0.0` |
| `NODE_ENV` | Environment mode | - |
| `CORS_ALLOWED_ORIGINS` | Comma-separated origins | - |
| `CORS_ORIGINS` | Alias for above | - |
| `SESSION_SECRET` | Session signing secret | `{serviceId}-dev-secret` |
| `DB_EXPORT_PATH` | Memory DB export path | - |
| `LOG_VERBOSE` | Enable verbose logging | `false` |

## Services Using This Package

All Symbia microservices use this package:

| Service | Port | Features Used |
|---------|------|---------------|
| Identity | 5001 | Server, CORS, Health |
| Logging | 5002 | Server, Telemetry, Health |
| Catalog | 5003 | Server, CORS, Health |
| Assistants | 5004 | Server, Socket.IO, Health |
| Messaging | 5005 | Server, Socket.IO, Health |
| Network | 5054 | Server, CORS, Health |
| Server | 5000 | Server, CORS, Health |
| Runtime | 5006 | Server, Socket.IO, Health |

## LLM Integration Guide

### Standard Service Setup

```typescript
import { createSymbiaServer } from "@symbia/http";
import { createTelemetryClient } from "@symbia/logging-client";
import { initializeDatabase } from "@symbia/db";
import * as schema from "./schema";

// Initialize dependencies
const telemetry = createTelemetryClient({ serviceId: "my-service" });
const { db, close, isMemory, exportToFile } = initializeDatabase({
  serviceId: "my-service",
  memorySchema: SCHEMA_SQL,
}, schema);

// Create server
const server = createSymbiaServer({
  serviceId: "my-service",
  telemetry: { client: telemetry },
  database: { isMemory, exportToFile, close },
  health: {
    readinessCheck: async () => {
      try {
        await db.execute(sql`SELECT 1`);
        return true;
      } catch {
        return false;
      }
    },
  },
  registerRoutes: (httpServer, app) => {
    app.use("/api", apiRoutes);
  },
});

await server.start();
```

### Accessing Multi-Tenant Context

```typescript
app.get("/api/resources", (req, res) => {
  const scope = getScopeHeaders(req);

  if (!scope.orgId) {
    return res.status(400).json({ error: "Organization required" });
  }

  const resources = await db.query.resources.findMany({
    where: eq(resources.orgId, scope.orgId),
  });

  res.json(resources);
});
```

### Custom Middleware

```typescript
const server = createSymbiaServer({
  serviceId: "my-service",
  middleware: [
    // Rate limiting
    rateLimit({ windowMs: 60000, max: 100 }),
    // Authentication
    async (req, res, next) => {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.status(401).json({ error: "Unauthorized" });
      req.user = await verifyToken(token);
      next();
    },
  ],
});
```

### Integration Checklist

- [ ] Import `createSymbiaServer` from `@symbia/http`
- [ ] Configure `serviceId` for logging and telemetry
- [ ] Set up telemetry client from `@symbia/logging-client`
- [ ] Configure health checks with database/cache probes
- [ ] Set up graceful shutdown with database hook
- [ ] Configure CORS for client origins
- [ ] Add custom middleware for auth/rate-limiting
- [ ] Register routes via `registerRoutes` callback
- [ ] Enable Socket.IO if real-time features needed
- [ ] Test health endpoints: `/health`, `/health/live`, `/health/ready`
