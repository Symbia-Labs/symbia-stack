# Logging Service — Architectural Intent

> The observability backbone for AI-native applications.

---

## What Logging Is

Logging is the **centralized observability platform** for the Symbia ecosystem. It collects, stores, and analyzes four types of telemetry data:

1. **Logs** — Structured event records with levels and metadata
2. **Metrics** — Time-series numerical data with labels
3. **Traces** — Distributed request flows across services
4. **Objects** — File and blob metadata with storage references

This is not a simple log aggregator. It's a multi-tenant observability system with AI-powered analysis, designed for environments where understanding *what happened* is as important as making it happen.

---

## The Problem We're Solving

Observability in distributed systems is harder than it looks:

1. **Logs are unstructured noise** — Without consistent schemas and metadata, logs become a wall of text. You need structured fields, levels, and context to make them queryable.

2. **Metrics need aggregation** — Raw data points are useless at scale. You need time-bucketed aggregations (avg, sum, max) with label filtering to build dashboards.

3. **Traces span services** — A single user request touches multiple services. Without trace ID propagation, you can't reconstruct the full request path.

4. **Multi-tenancy is mandatory** — In a SaaS platform, every log entry must be scoped to an organization. Cross-tenant data leakage is unacceptable.

5. **AI can help** — When you have 10,000 error logs, a human can't read them all. An LLM can summarize patterns, identify root causes, and suggest actions.

6. **Retention costs money** — Storing everything forever is expensive. Different data types need different retention policies.

Logging addresses all of these as primary concerns.

---

## The Four Pillars

### Logs

**What they are:** Timestamped event records with a level, message, and metadata.

**Structure:**
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "error",
  "message": "Database connection timeout",
  "metadata": {
    "host": "db-primary",
    "duration_ms": 5000,
    "query": "SELECT * FROM users"
  }
}
```

**Log levels:** `debug` < `info` < `warn` < `error` < `fatal`

**Organization:** Logs belong to **streams**. A stream is a logical grouping (e.g., "API Gateway Logs", "Database Errors").

**Why streams matter:**
- Different retention per stream
- Access control per stream
- Query scope (search within a stream, not the entire org)

---

### Metrics

**What they are:** Numerical measurements over time with dimensional labels.

**Structure:**
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "value": 45.2,
  "labels": {
    "endpoint": "/api/users",
    "method": "GET",
    "status": "200"
  }
}
```

**Metric types:**
- `gauge` — Point-in-time value (CPU usage, queue depth)
- `counter` — Monotonically increasing (request count, bytes sent)
- `histogram` — Distribution of values (latency percentiles)
- `summary` — Pre-calculated percentiles

**Aggregations:** `avg`, `sum`, `min`, `max`, `count`, `last`

**Time intervals:** `1m`, `5m`, `15m`, `1h`, `1d`

**Why labels matter:** Labels enable dimensional queries. "Show me p99 latency for `/api/users` endpoint on the `production` environment" requires labels, not separate metrics.

---

### Traces

**What they are:** Request flows across service boundaries, composed of spans.

**Structure:**
```json
{
  "traceId": "abc123def456",
  "spans": [
    {
      "spanId": "span-001",
      "parentSpanId": null,
      "name": "HTTP GET /api/users",
      "serviceName": "api-gateway",
      "kind": "server",
      "status": "ok",
      "startTime": "2024-01-15T10:30:00.000Z",
      "endTime": "2024-01-15T10:30:00.150Z",
      "attributes": {"http.status_code": 200}
    },
    {
      "spanId": "span-002",
      "parentSpanId": "span-001",
      "name": "DB Query users",
      "serviceName": "user-service",
      "kind": "client",
      "status": "ok",
      "startTime": "2024-01-15T10:30:00.050Z",
      "endTime": "2024-01-15T10:30:00.120Z"
    }
  ]
}
```

**Span kinds:**
- `server` — Incoming request handler
- `client` — Outgoing request caller
- `producer` — Message queue sender
- `consumer` — Message queue receiver
- `internal` — In-process operation

**Why traces matter:** When a request fails, traces show you exactly where in the call chain it failed, how long each step took, and what attributes were present.

---

### Objects

**What they are:** Metadata records for files and blobs stored elsewhere.

**Structure:**
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "filename": "report-2024-01.pdf",
  "contentType": "application/pdf",
  "size": 1048576,
  "checksum": "sha256:abc123...",
  "storageUrl": "s3://bucket/path/report.pdf",
  "metadata": {
    "generated_by": "report-service",
    "report_type": "monthly"
  }
}
```

**What objects are NOT:** The actual file content. Logging stores metadata and a reference to where the file lives.

**Why objects matter:** Audit trails need to track "what files were generated, when, and where they went" without duplicating storage.

---

## Design Principles

### 1. Scope Everything

Every piece of data has a five-level scope:

```
Organization (orgId)
└── Service (serviceId)
    └── Environment (env)
        └── Data Class (dataClass)
            └── Policy Reference (policyRef)
```

**Scope fields are required on every record:**
- `orgId` — Tenant isolation
- `serviceId` — Which service produced this data
- `env` — `dev`, `stage`, `prod`
- `dataClass` — `none`, `pii`, `phi`, `secret`
- `policyRef` — Policy governing this data

**Why this matters:**
- Query isolation (can't accidentally see another org's data)
- Compliance (PII/PHI data flagged for special handling)
- Cost attribution (which service generates the most logs?)
- Policy enforcement (retention, access control)

**Trade-off accepted:** Every record is larger due to scope fields. Worth it for isolation guarantees.

### 2. Streams Organize Logs

Logs don't float freely — they belong to streams:

```
Organization: acme-corp
├── Stream: api-gateway-logs (retention: 30 days)
├── Stream: database-errors (retention: 90 days)
├── Stream: security-audit (retention: 365 days)
└── Stream: debug-traces (retention: 7 days)
```

**Stream properties:**
- Name and description
- Source service
- Default log level
- Tags for categorization
- Retention policy

**Why streams matter:**
- Different retention per use case
- Access control (some streams are sensitive)
- Query scope (search within relevant streams)
- Cost management (debug logs expire quickly)

### 3. AI-Powered Analysis

When you have thousands of logs, an LLM can help:

```
POST /api/assistant/summarize
→ "High error rate detected. 73% of errors are database connection timeouts
   occurring between 10:00-10:30. Affected services: api-gateway, user-service."

POST /api/assistant/analyze
→ "Root cause: Connection pool exhausted. Database max_connections=100,
   but 120 concurrent requests during peak. Suggested: increase pool size
   or implement connection queuing."
```

**AI capabilities:**
- **Summarize** — Condense hundreds of logs into key insights
- **Analyze** — Identify error patterns and root causes
- **Group** — Cluster related logs by pattern
- **Investigate** — Deep dive into specific insights

**Fallback behavior:** If no LLM is configured, returns statistical analysis (counts, patterns) without AI-generated prose.

**Why this matters:** Human operators can't read 10,000 logs. AI can surface what matters.

### 4. Flexible Authentication

Four authentication methods, in priority order:

| Method | Use Case | Header |
|--------|----------|--------|
| Session Cookie | Browser dashboards | `symbia_session` |
| Bearer Token | Service-to-service | `Authorization: Bearer <jwt>` |
| API Key | High-volume ingest | `X-API-Key: slk_xxx` |
| Shared Secret | Internal telemetry | `Authorization: Bearer <secret>` |

**Authentication modes:**
- `required` — Must authenticate (production)
- `optional` — Anonymous allowed with default scope (development)
- `off` — No auth checks (testing)

**Why multiple methods:**
- Dashboards use sessions (cookie-based, browser-friendly)
- Services use JWT (identity-aware, short-lived)
- Ingest pipelines use API keys (long-lived, scoped)
- Internal services use shared secrets (simple, trusted network)

### 5. Retention as First-Class Concern

Different data types have different lifespans:

| Type | Default Retention | Rationale |
|------|-------------------|-----------|
| Debug logs | 7 days | High volume, low value after debugging |
| Info logs | 30 days | Operational insight, moderate value |
| Error logs | 90 days | Incident investigation, high value |
| Audit logs | 365 days | Compliance requirement |
| Metrics | 90 days | Trend analysis needs history |
| Traces | Configurable | Depends on debugging needs |

**Retention is per-stream:** Security audit logs keep for a year. Debug traces expire in a week.

**Why this matters:** Storage costs money. Debug logs from last year have no value.

---

## Data Flow

### Ingest Pipeline

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Service    │     │   Logging    │     │   Database   │
│  (Producer)  │     │   Service    │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       │ POST /api/logs/ingest                   │
       │ X-API-Key: slk_xxx                      │
       │ X-Org-Id: acme-corp                     │
       │─────────────────▶│                      │
       │                  │ Validate auth        │
       │                  │ Validate scope       │
       │                  │ Validate schema      │
       │                  │───────────────────▶ │
       │                  │ Batch insert         │
       │◀─────────────────│                      │
       │ 201 Created      │                      │
```

### Query Pipeline

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Dashboard   │     │   Logging    │     │   Database   │
│   (Client)   │     │   Service    │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │
       │ POST /api/logs/query                    │
       │ Authorization: Bearer <jwt>             │
       │─────────────────▶│                      │
       │                  │ Validate auth        │
       │                  │ Get user orgs        │
       │                  │ Apply scope filter   │
       │                  │───────────────────▶ │
       │                  │◀───────────────────│
       │                  │ Filter by level,    │
       │                  │ time, search        │
       │◀─────────────────│                      │
       │ {entries, total} │                      │
```

### AI Analysis Pipeline

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Operator   │     │   Logging    │     │   Database   │     │     LLM      │
│              │     │   Service    │     │              │     │   (OpenAI)   │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │                    │
       │ POST /api/assistant/analyze             │                    │
       │─────────────────▶│                      │                    │
       │                  │ Query error logs     │                    │
       │                  │───────────────────▶ │                    │
       │                  │◀───────────────────│                    │
       │                  │                      │                    │
       │                  │ Build prompt with logs                   │
       │                  │─────────────────────────────────────────▶│
       │                  │◀─────────────────────────────────────────│
       │                  │ Parse LLM response   │                    │
       │◀─────────────────│                      │                    │
       │ {summary,        │                      │                    │
       │  causes,         │                      │                    │
       │  actions}        │                      │                    │
```

---

## Schema Design Decisions

### Why Separate Tables for Each Data Type

Logs, metrics, traces, and objects have different schemas and query patterns:

```sql
log_entries (timestamp, level, message, metadata)
data_points (timestamp, value, labels)
spans (traceId, spanId, parentSpanId, startTime, endTime, attributes)
object_entries (filename, contentType, size, storageUrl)
```

**Why not a unified "events" table:**
- Different columns needed (logs have `level`, metrics have `value`)
- Different query patterns (logs search text, metrics aggregate numbers)
- Different indexes (logs need full-text, metrics need time-series)
- Different retention (logs expire faster than metrics)

### Why Streams Are Separate from Entries

Streams are metadata; entries are data:

```sql
log_streams (id, name, retentionDays, tags, ...)
log_entries (id, streamId, timestamp, level, message, ...)
```

**Why:**
- Stream metadata changes rarely
- Stream settings apply to all entries
- Deleting a stream can cascade to entries
- Stream-level access control

### Why JSONB for Metadata/Labels/Attributes

Telemetry data has variable structure:

```sql
metadata: JSONB  -- {"host": "db-1", "query": "SELECT..."}
labels: JSONB    -- {"endpoint": "/api/users", "method": "GET"}
attributes: JSONB -- {"http.status_code": 200, "db.system": "postgresql"}
```

**Why:**
- Schema varies by use case
- No migrations for new fields
- PostgreSQL JSONB supports indexing
- Query flexibility (`metadata->>'host' = 'db-1'`)

### Why Scope Fields Are Denormalized

Every record has `orgId`, `serviceId`, `env`, `dataClass`, `policyRef`:

```sql
log_entries (
  ...,
  orgId TEXT NOT NULL,
  serviceId TEXT NOT NULL,
  env TEXT NOT NULL,
  dataClass TEXT NOT NULL,
  policyRef TEXT NOT NULL
)
```

**Why not a foreign key to a "scopes" table:**
- Every query filters by scope
- Denormalization avoids joins
- Immutable once written (no FK cascade issues)
- Partitioning by org/env is possible

**Trade-off accepted:** Storage overhead for repeated values. Worth it for query performance.

---

## Multi-Tenancy Deep Dive

### Scope Resolution

When a request arrives, scope is determined by:

1. **Headers provided:** `X-Org-Id`, `X-Service-Id`, `X-Env`, etc.
2. **Auth context:** JWT claims, API key scope, session data
3. **Defaults:** Environment variables for missing values

**Resolution rules:**
- JWT auth: Use headers, fall back to user's first organization
- API key: Use key's configured scope
- Session: Validate user is member of requested org
- Super admin: Can access any scope

### Data Isolation

All queries are automatically filtered:

```typescript
// Non-super-admin query
SELECT * FROM log_entries
WHERE orgId = $userOrgId
  AND streamId = $requestedStream
  AND timestamp BETWEEN $start AND $end

// Super admin query (can specify any org)
SELECT * FROM log_entries
WHERE orgId = $requestedOrgId  -- can be any org
  AND ...
```

**Guarantees:**
- Regular users only see their organization's data
- API keys only see their scoped data
- Super admins can query across organizations
- No accidental cross-tenant leakage

### Data Classification

The `dataClass` field flags sensitive data:

| Class | Meaning | Handling |
|-------|---------|----------|
| `none` | No sensitive data | Standard retention |
| `pii` | Personally identifiable | Mask in logs, limit access |
| `phi` | Protected health info | HIPAA compliance, audit access |
| `secret` | Credentials, keys | Never display, alert on exposure |

**Why this matters:** Compliance requirements differ by data type. PII has GDPR implications. PHI has HIPAA requirements.

---

## Integration Patterns

### For Application Services

```typescript
import { createTelemetryClient } from "@symbia/logging-client";

const telemetry = createTelemetryClient({
  endpoint: process.env.LOGGING_URL,
  apiKey: process.env.LOGGING_API_KEY,
  defaultScope: {
    orgId: "acme-corp",
    serviceId: "api-gateway",
    env: "production"
  }
});

// Log an event
telemetry.log({
  level: "info",
  message: "Request processed",
  metadata: { path: "/api/users", duration_ms: 45 }
});

// Record a metric
telemetry.metric("request_duration_ms", 45, {
  endpoint: "/api/users",
  method: "GET"
});

// Start a span
const span = telemetry.startSpan("HTTP GET /api/users", {
  kind: "server",
  attributes: { "http.method": "GET" }
});
// ... do work ...
span.end({ status: "ok" });
```

### For Dashboards

```typescript
// Query recent errors
const errors = await logging.queryLogs({
  streamIds: ["api-gateway-logs"],
  level: "error",
  startTime: new Date(Date.now() - 3600000), // last hour
  endTime: new Date(),
  limit: 100
});

// Get latency metrics
const latency = await logging.queryMetrics({
  metricIds: ["request_duration_ms"],
  aggregation: "avg",
  interval: "5m",
  startTime: new Date(Date.now() - 86400000), // last 24h
  endTime: new Date()
});

// Analyze errors with AI
const analysis = await logging.analyzeErrors({
  streamIds: ["api-gateway-logs", "database-logs"],
  startTime: new Date(Date.now() - 3600000),
  endTime: new Date()
});
console.log(analysis.summary);
console.log(analysis.suggestedActions);
```

### For CI/CD Pipelines

```typescript
// Create API key for ingest
const key = await logging.createApiKey({
  name: "CI Pipeline",
  scopes: ["ingest"],
  expiresAt: new Date(Date.now() + 365 * 24 * 3600000) // 1 year
});

// Use in pipeline
LOGGING_API_KEY=slk_xxx npm run deploy

// Ingest deployment event
await logging.ingestLogs({
  streamId: "deployments",
  entries: [{
    timestamp: new Date(),
    level: "info",
    message: `Deployed version ${version} to ${env}`,
    metadata: { version, env, commit, actor }
  }]
});
```

---

## Operational Considerations

### Performance Characteristics

| Operation | Typical Latency | Notes |
|-----------|-----------------|-------|
| Single log ingest | 5-20ms | Batching recommended |
| Batch ingest (100 entries) | 50-200ms | Optimal for high volume |
| Log query (1 hour) | 20-100ms | Depends on filters |
| Metric query with aggregation | 50-200ms | Depends on time range |
| Trace query | 20-100ms | By trace ID is fast |
| AI analysis | 2-10s | LLM latency dominates |

### Scaling Considerations

- **Horizontal:** Stateless — add instances behind load balancer
- **Database:** Read replicas for query-heavy dashboards
- **Partitioning:** By time and org for large datasets
- **Caching:** Aggregated metrics can be cached

### Monitoring Points

- Ingest rate (entries/second)
- Query latency (p50, p95, p99)
- Storage growth rate
- API key usage
- LLM token consumption
- Error rates by endpoint

### Retention Management

Retention is enforced by background jobs (not yet implemented in code):

```
Daily: Delete log_entries WHERE timestamp < NOW() - stream.retentionDays
Daily: Delete data_points WHERE timestamp < NOW() - metric.retentionDays
```

**Current state:** Retention fields exist in schema but cleanup jobs are manual.

---

## What Logging Does Not Do

### No Log Storage (Just Metadata for Objects)

Object entries store metadata and a reference (`storageUrl`), not the actual file. Files live in S3 or equivalent.

**Rationale:** Blob storage is a different problem. Logging tracks what exists, not stores it.

### ~~No Real-Time Streaming~~ → SSE Streaming Added

~~Queries return batches, not streams. No WebSocket push for new logs.~~

**Update (January 2026):** The service now provides Server-Sent Events (SSE) for real-time log streaming via `GET /api/logs/stream`. This is event-driven (logs pushed as they're ingested), not polling.

```typescript
// Client connects to SSE endpoint
const source = new EventSource('/api/logs/stream?level=error&streamIds=api,db');
source.onmessage = (event) => {
  const log = JSON.parse(event.data);
  console.log('New log:', log);
};
```

**Why SSE (not WebSocket):** SSE is simpler for uni-directional server-to-client streaming. WebSocket would be needed for bidirectional communication, which isn't required for log tailing.

**Note:** The SSE endpoint filters by org (from auth context), optional `streamIds`, and optional `level`.

### No Alerting

Logging stores and queries data. It doesn't evaluate alert rules or send notifications.

**Rationale:** Alerting is a separate service concern. Logging provides the data; alerting consumes it.

### No Log Parsing

Logs are stored as-is. No automatic parsing of unstructured text into structured fields.

**Rationale:** Parsing is best done at ingest time by the producer who knows the format.

---

## Future Directions

### Planned

1. **Retention jobs** — Automated cleanup based on stream settings
2. **Log sampling** — Store 1% of debug logs at high volume
3. **Metric rollups** — Pre-aggregate old data to reduce storage
4. **Trace search** — Full-text search across span attributes

### Considered

1. ~~**Live tail** — WebSocket streaming of new logs~~ → **Implemented as SSE** (`GET /api/logs/stream`)
2. **Alert rules** — Define thresholds, trigger notifications
3. **Log parsing** — Grok patterns for common formats
4. **Anomaly detection** — ML-based outlier identification

### Intentionally Deferred

1. **Long-term storage** — Archive to cold storage (S3 Glacier)
2. **Cross-org analytics** — Platform-wide metrics (privacy concerns)
3. **Custom dashboards** — Build in Grafana, not in Logging service

---

## Quick Reference

### Log Levels

| Level | Meaning | Use Case |
|-------|---------|----------|
| `debug` | Detailed debugging | Development only |
| `info` | Normal operations | Request processed, job started |
| `warn` | Potential issues | Slow query, retry attempted |
| `error` | Failures | Request failed, exception caught |
| `fatal` | System failure | Service crashing, data corruption |

### Metric Types

| Type | Meaning | Example |
|------|---------|---------|
| `gauge` | Point-in-time value | CPU usage: 45% |
| `counter` | Cumulative total | Requests served: 10,000 |
| `histogram` | Distribution | Latency p50=10ms, p99=100ms |
| `summary` | Pre-calculated stats | Same as histogram, server-side |

### Span Kinds

| Kind | Meaning |
|------|---------|
| `server` | Handling incoming request |
| `client` | Making outgoing request |
| `producer` | Sending to queue |
| `consumer` | Receiving from queue |
| `internal` | In-process operation |

### Data Classes

| Class | Meaning | Example |
|-------|---------|---------|
| `none` | No sensitive data | Request count, latency |
| `pii` | Personal data | Email, name, IP address |
| `phi` | Health data | Medical records, diagnoses |
| `secret` | Credentials | API keys, passwords |

### Aggregations

| Aggregation | Meaning |
|-------------|---------|
| `avg` | Average of values |
| `sum` | Total of values |
| `min` | Minimum value |
| `max` | Maximum value |
| `count` | Number of data points |
| `last` | Most recent value |

---

*This document reflects the Logging service architectural intent as of January 2026.*
