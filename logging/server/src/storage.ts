import {
  type User,
  type InsertUser,
  type ApiKey,
  type InsertApiKey,
  type Metric,
  type InsertMetric,
  type DataPoint,
  type InsertDataPoint,
  type DataSource,
  type InsertDataSource,
  type Integration,
  type InsertIntegration,
  type MetricsQuery,
  type LogStream,
  type InsertLogStream,
  type LogEntry,
  type InsertLogEntry,
  type LogsQuery,
  type Trace,
  type InsertTrace,
  type Span,
  type InsertSpan,
  type TracesQuery,
  type ObjectStream,
  type InsertObjectStream,
  type ObjectEntry,
  type InsertObjectEntry,
  type ObjectsQuery,
} from "@shared/schema";
import { randomUUID, createHash } from "crypto";
import type { AuthContext } from "./auth";

type AccessContext = Pick<
  AuthContext,
  "orgId" | "serviceId" | "env" | "dataClass" | "policyRef" | "actorId" | "isSuperAdmin"
>;

type ObjectEntryInput = Omit<
  InsertObjectEntry,
  "orgId" | "serviceId" | "env" | "dataClass" | "policyRef" | "actorId"
>;

const SEED_ORG_ID = process.env.LOGGING_DEFAULT_ORG_ID || "symbia-dev";
const SEED_SERVICE_ID = process.env.LOGGING_DEFAULT_SERVICE_ID || "logging-service";
const SEED_ENV = process.env.LOGGING_DEFAULT_ENV || "dev";
const SEED_DATA_CLASS = process.env.LOGGING_DEFAULT_DATA_CLASS || "none";
const SEED_POLICY_REF = process.env.LOGGING_DEFAULT_POLICY_REF || "policy/default";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // API Keys
  getApiKeys(): Promise<ApiKey[]>;
  getApiKey(id: string): Promise<ApiKey | undefined>;
  getApiKeyByPrefix(prefix: string): Promise<ApiKey | undefined>;
  createApiKey(key: InsertApiKey): Promise<ApiKey>;
  revokeApiKey(id: string): Promise<ApiKey | undefined>;
  validateApiKey(keyString: string): Promise<ApiKey | undefined>;
  updateApiKeyLastUsed(id: string): Promise<void>;

  // Logs
  getLogStreams(context: AccessContext): Promise<LogStream[]>;
  getLogStream(context: AccessContext, id: string): Promise<LogStream | undefined>;
  createLogStream(context: AccessContext, stream: InsertLogStream): Promise<LogStream>;
  updateLogStream(context: AccessContext, id: string, stream: Partial<InsertLogStream>): Promise<LogStream | undefined>;
  deleteLogStream(context: AccessContext, id: string): Promise<boolean>;
  queryLogEntries(context: AccessContext, query: LogsQuery): Promise<LogEntry[]>;
  insertLogEntry(context: AccessContext, entry: InsertLogEntry): Promise<LogEntry>;
  insertLogEntriesBatch(
    context: AccessContext,
    streamId: string,
    entries: Array<{ timestamp: string; level: string; message: string; metadata?: Record<string, unknown> }>
  ): Promise<number>;
  getTotalLogEntries(context: AccessContext): Promise<number>;

  // Metrics
  getMetrics(context: AccessContext): Promise<Metric[]>;
  getMetric(context: AccessContext, id: string): Promise<Metric | undefined>;
  createMetric(context: AccessContext, metric: InsertMetric): Promise<Metric>;
  updateMetric(context: AccessContext, id: string, metric: Partial<InsertMetric>): Promise<Metric | undefined>;
  deleteMetric(context: AccessContext, id: string): Promise<boolean>;
  getDataPoints(context: AccessContext, metricId: string, limit?: number): Promise<DataPoint[]>;
  queryDataPoints(context: AccessContext, config: MetricsQuery): Promise<DataPoint[]>;
  insertDataPoint(context: AccessContext, dataPoint: InsertDataPoint): Promise<DataPoint>;
  insertDataPointsBatch(
    context: AccessContext,
    metricId: string,
    dataPoints: Array<{ timestamp: string; value: number; labels?: Record<string, string> }>
  ): Promise<number>;
  getTotalDataPoints(context: AccessContext): Promise<number>;

  // Traces
  getTraces(context: AccessContext, query?: TracesQuery): Promise<Trace[]>;
  getTrace(context: AccessContext, id: string): Promise<Trace | undefined>;
  getSpansByTraceId(context: AccessContext, traceId: string): Promise<Span[]>;
  insertTrace(context: AccessContext, trace: InsertTrace): Promise<Trace>;
  insertSpan(context: AccessContext, span: InsertSpan): Promise<Span>;
  insertSpansBatch(context: AccessContext, spans: Array<InsertSpan>): Promise<number>;
  getTotalTraces(context: AccessContext): Promise<number>;
  getTotalSpans(context: AccessContext): Promise<number>;

  // Objects
  getObjectStreams(context: AccessContext): Promise<ObjectStream[]>;
  getObjectStream(context: AccessContext, id: string): Promise<ObjectStream | undefined>;
  createObjectStream(context: AccessContext, stream: InsertObjectStream): Promise<ObjectStream>;
  updateObjectStream(context: AccessContext, id: string, stream: Partial<InsertObjectStream>): Promise<ObjectStream | undefined>;
  deleteObjectStream(context: AccessContext, id: string): Promise<boolean>;
  queryObjectEntries(context: AccessContext, query: ObjectsQuery): Promise<ObjectEntry[]>;
  insertObjectEntry(context: AccessContext, entry: ObjectEntryInput): Promise<ObjectEntry>;
  getTotalObjectEntries(context: AccessContext): Promise<number>;

  // Data Sources
  getDataSources(context: AccessContext): Promise<DataSource[]>;
  getDataSource(context: AccessContext, id: string): Promise<DataSource | undefined>;
  createDataSource(context: AccessContext, source: InsertDataSource): Promise<DataSource>;
  updateDataSource(context: AccessContext, id: string, source: Partial<InsertDataSource>): Promise<DataSource | undefined>;
  deleteDataSource(context: AccessContext, id: string): Promise<boolean>;

  // Integrations
  getIntegrations(context: AccessContext): Promise<Integration[]>;
  getIntegration(context: AccessContext, id: string): Promise<Integration | undefined>;
  createIntegration(context: AccessContext, integration: InsertIntegration): Promise<Integration>;
  updateIntegration(context: AccessContext, id: string, integration: Partial<InsertIntegration>): Promise<Integration | undefined>;
  deleteIntegration(context: AccessContext, id: string): Promise<boolean>;

  // Stats
  getStats(context: AccessContext): Promise<{
    totalLogStreams: number;
    totalLogEntries: number;
    totalMetrics: number;
    totalDataPoints: number;
    totalTraces: number;
    totalSpans: number;
    totalObjectStreams: number;
    totalObjectEntries: number;
    activeDataSources: number;
    connectedIntegrations: number;
    ingestRate: number;
    queryLatency: number;
  }>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private apiKeys: Map<string, ApiKey>;
  private logStreams: Map<string, LogStream>;
  private logEntries: Map<string, LogEntry>;
  private metrics: Map<string, Metric>;
  private dataPoints: Map<string, DataPoint>;
  private traces: Map<string, Trace>;
  private spans: Map<string, Span>;
  private objectStreams: Map<string, ObjectStream>;
  private objectEntries: Map<string, ObjectEntry>;
  private dataSources: Map<string, DataSource>;
  private integrations: Map<string, Integration>;
  private ingestCount: number = 0;
  private lastIngestReset: number = Date.now();

  private hashKey(key: string): string {
    return createHash("sha256").update(key).digest("hex");
  }

  private matchesContext(
    item: { orgId?: string | null; serviceId?: string | null; env?: string | null },
    context: AccessContext,
    orgOnly: boolean = false,
  ): boolean {
    // Super admins can see all data across all orgs
    if (context.isSuperAdmin) {
      return true;
    }
    // For admin console queries, match org only to see all data in the org
    if (orgOnly) {
      return item.orgId === context.orgId;
    }
    return item.orgId === context.orgId && item.serviceId === context.serviceId && item.env === context.env;
  }

  constructor() {
    this.users = new Map();
    this.apiKeys = new Map();
    this.logStreams = new Map();
    this.logEntries = new Map();
    this.metrics = new Map();
    this.dataPoints = new Map();
    this.traces = new Map();
    this.spans = new Map();
    this.objectStreams = new Map();
    this.objectEntries = new Map();
    this.dataSources = new Map();
    this.integrations = new Map();

    // Only seed demo data in development mode
    if (process.env.NODE_ENV !== "production") {
      this.seedDemoData();
    }
  }

  private seedDemoData() {
    const now = new Date();
    const orgId = SEED_ORG_ID;
    const serviceId = SEED_SERVICE_ID;
    const env = SEED_ENV;
    const dataClass = SEED_DATA_CLASS;
    const policyRef = SEED_POLICY_REF;
    const createdBy = "seed";

    // Demo Log Streams
    const demoLogStreams: LogStream[] = [
      {
        id: randomUUID(),
        orgId,
        serviceId,
        env,
        dataClass,
        policyRef,
        createdBy,
        name: "api-server",
        description: "API server application logs",
        source: "symbia-api",
        level: "info",
        tags: ["api", "production"],
        retentionDays: 30,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        orgId,
        serviceId,
        env,
        dataClass,
        policyRef,
        createdBy,
        name: "worker-jobs",
        description: "Background job worker logs",
        source: "symbia-worker",
        level: "debug",
        tags: ["worker", "jobs"],
        retentionDays: 14,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        orgId,
        serviceId,
        env,
        dataClass,
        policyRef,
        createdBy,
        name: "auth-service",
        description: "Authentication service logs",
        source: "symbia-auth",
        level: "warn",
        tags: ["auth", "security"],
        retentionDays: 90,
        createdAt: now,
        updatedAt: now,
      },
    ];

    demoLogStreams.forEach((s) => this.logStreams.set(s.id, s));

    // Demo Log Entries
    const logLevels = ["debug", "info", "warn", "error"];
    const logMessages = [
      "Request processed successfully",
      "Database connection established",
      "Cache miss for key",
      "Authentication token validated",
      "Rate limit threshold reached",
      "Background job completed",
      "Configuration reloaded",
      "Health check passed",
    ];

    demoLogStreams.forEach((stream) => {
      for (let i = 0; i < 50; i++) {
        const entry: LogEntry = {
          id: randomUUID(),
          streamId: stream.id,
          orgId,
          serviceId,
          env,
          dataClass,
          policyRef,
          actorId: createdBy,
          timestamp: new Date(now.getTime() - i * 60 * 1000),
          level: logLevels[Math.floor(Math.random() * logLevels.length)],
          message: logMessages[Math.floor(Math.random() * logMessages.length)],
          metadata: { requestId: randomUUID().slice(0, 8), host: "server-1" },
        };
        this.logEntries.set(entry.id, entry);
      }
    });

    // Demo Metrics
    const demoMetrics: Metric[] = [
      {
        id: randomUUID(),
        orgId,
        serviceId,
        env,
        dataClass,
        policyRef,
        createdBy,
        name: "cpu.usage",
        description: "CPU usage percentage across all cores",
        unit: "%",
        type: "gauge",
        tags: ["system", "performance", "critical"],
        dataSourceId: null,
        retentionDays: 90,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        orgId,
        serviceId,
        env,
        dataClass,
        policyRef,
        createdBy,
        name: "memory.used",
        description: "Memory usage in bytes",
        unit: "bytes",
        type: "gauge",
        tags: ["system", "performance"],
        dataSourceId: null,
        retentionDays: 90,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        orgId,
        serviceId,
        env,
        dataClass,
        policyRef,
        createdBy,
        name: "http.requests.total",
        description: "Total HTTP requests",
        unit: "requests",
        type: "counter",
        tags: ["api", "traffic"],
        dataSourceId: null,
        retentionDays: 30,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        orgId,
        serviceId,
        env,
        dataClass,
        policyRef,
        createdBy,
        name: "response.time.p99",
        description: "99th percentile response time",
        unit: "ms",
        type: "histogram",
        tags: ["api", "latency"],
        dataSourceId: null,
        retentionDays: 60,
        createdAt: now,
        updatedAt: now,
      },
    ];

    demoMetrics.forEach((m) => this.metrics.set(m.id, m));

    // Demo Data Points
    demoMetrics.forEach((metric) => {
      for (let i = 0; i < 24; i++) {
        const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);
        const dp: DataPoint = {
          id: randomUUID(),
          metricId: metric.id,
          orgId,
          serviceId,
          env,
          dataClass,
          policyRef,
          timestamp,
          value: metric.type === "counter"
            ? Math.floor(1000 + Math.random() * 5000)
            : Math.random() * 100,
          labels: { host: "server-1", env: "production" },
        };
        this.dataPoints.set(dp.id, dp);
      }
    });

    // Demo Traces
    const serviceNames = ["api-gateway", "user-service", "order-service", "payment-service"];
    for (let t = 0; t < 10; t++) {
      const traceId = randomUUID();
      const startTime = new Date(now.getTime() - t * 5 * 60 * 1000);
      const durationMs = Math.floor(50 + Math.random() * 500);

      const trace: Trace = {
        id: randomUUID(),
        traceId,
        orgId,
        serviceId,
        env,
        dataClass,
        policyRef,
        actorId: createdBy,
        name: `${serviceNames[0]} request`,
        serviceName: serviceNames[0],
        status: Math.random() > 0.9 ? "error" : "ok",
        startTime,
        endTime: new Date(startTime.getTime() + durationMs),
        durationMs,
        tags: ["http", "grpc"],
        attributes: { "http.method": "GET", "http.status_code": 200 },
        createdAt: now,
      };
      this.traces.set(trace.id, trace);

      // Add spans for each trace
      let parentSpanId: string | null = null;
      for (let s = 0; s < serviceNames.length; s++) {
        const spanId = randomUUID();
        const spanDuration = Math.floor(10 + Math.random() * 100);
        const span: Span = {
          id: randomUUID(),
          traceId,
          orgId,
          serviceId,
          env,
          dataClass,
          policyRef,
          actorId: createdBy,
          parentSpanId,
          spanId,
          name: `${serviceNames[s]}.process`,
          serviceName: serviceNames[s],
          kind: s === 0 ? "server" : "client",
          status: "ok",
          startTime: new Date(startTime.getTime() + s * 20),
          endTime: new Date(startTime.getTime() + s * 20 + spanDuration),
          durationMs: spanDuration,
          attributes: { "component": serviceNames[s] },
          events: null,
        };
        this.spans.set(span.id, span);
        parentSpanId = spanId;
      }
    }

    // Demo Object Streams
    const demoObjectStreams: ObjectStream[] = [
      {
        id: randomUUID(),
        orgId,
        serviceId,
        env,
        dataClass,
        policyRef,
        createdBy,
        name: "model-checkpoints",
        description: "ML model checkpoint files",
        contentType: "application/octet-stream",
        tags: ["ml", "models"],
        retentionDays: 365,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        orgId,
        serviceId,
        env,
        dataClass,
        policyRef,
        createdBy,
        name: "audit-logs",
        description: "Compressed audit log archives",
        contentType: "application/gzip",
        tags: ["audit", "compliance"],
        retentionDays: 2555,
        createdAt: now,
        updatedAt: now,
      },
    ];

    demoObjectStreams.forEach((s) => this.objectStreams.set(s.id, s));

    // Demo Object Entries
    demoObjectStreams.forEach((stream) => {
      for (let i = 0; i < 5; i++) {
        const entry: ObjectEntry = {
          id: randomUUID(),
          streamId: stream.id,
          orgId,
          serviceId,
          env,
          dataClass,
          policyRef,
          actorId: createdBy,
          timestamp: new Date(now.getTime() - i * 24 * 60 * 60 * 1000),
          filename: `${stream.name}-${i}.bin`,
          contentType: stream.contentType,
          size: Math.floor(1000000 + Math.random() * 50000000),
          checksum: randomUUID().replace(/-/g, ""),
          storageUrl: `s3://symbia-storage/${stream.name}/${i}`,
          metadata: { version: `1.${i}` },
          createdAt: now,
        };
        this.objectEntries.set(entry.id, entry);
      }
    });

    // Demo Integrations
    const demoIntegrations: Integration[] = [
      {
        id: randomUUID(),
        orgId,
        serviceId,
        env,
        createdBy,
        name: "Symbia Identity",
        type: "identity",
        endpoint: "https://identity.symbia-labs.com/api",
        status: "connected",
        lastCheckedAt: now,
        config: {},
        createdAt: now,
      },
      {
        id: randomUUID(),
        orgId,
        serviceId,
        env,
        createdBy,
        name: "Symbia Object Service",
        type: "object",
        endpoint: "https://symbia-object-service.replit.app/api",
        status: "connected",
        lastCheckedAt: now,
        config: {},
        createdAt: now,
      },
      {
        id: randomUUID(),
        orgId,
        serviceId,
        env,
        createdBy,
        name: "Symbia Core Runtime",
        type: "core",
        endpoint: "https://core.symbia-labs.com/api/v1",
        status: "disconnected",
        lastCheckedAt: null,
        config: {},
        createdAt: now,
      },
    ];

    demoIntegrations.forEach((i) => this.integrations.set(i.id, i));

    // Demo Data Sources
    const demoDataSources: DataSource[] = [
      {
        id: randomUUID(),
        orgId,
        serviceId,
        env,
        createdBy,
        name: "Production Prometheus",
        type: "prometheus",
        config: { endpoint: "http://prometheus.internal:9090" },
        status: "active",
        lastSyncAt: now,
        createdAt: now,
      },
      {
        id: randomUUID(),
        orgId,
        serviceId,
        env,
        createdBy,
        name: "Fluentd Collector",
        type: "fluentd",
        config: { endpoint: "http://fluentd.internal:24224" },
        status: "active",
        lastSyncAt: now,
        createdAt: now,
      },
      {
        id: randomUUID(),
        orgId,
        serviceId,
        env,
        createdBy,
        name: "Jaeger Tracing",
        type: "jaeger",
        config: { endpoint: "http://jaeger.internal:14268" },
        status: "inactive",
        lastSyncAt: null,
        createdAt: now,
      },
    ];

    demoDataSources.forEach((ds) => this.dataSources.set(ds.id, ds));
  }

  // ============================================================================
  // Users
  // ============================================================================

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // ============================================================================
  // API Keys
  // ============================================================================

  async getApiKeys(): Promise<ApiKey[]> {
    return Array.from(this.apiKeys.values())
      .filter((key) => !key.revokedAt)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async getApiKey(id: string): Promise<ApiKey | undefined> {
    return this.apiKeys.get(id);
  }

  async getApiKeyByPrefix(prefix: string): Promise<ApiKey | undefined> {
    return Array.from(this.apiKeys.values()).find((key) => key.keyPrefix === prefix);
  }

  async createApiKey(input: InsertApiKey): Promise<ApiKey> {
    const id = randomUUID();
    const now = new Date();
    const apiKey: ApiKey = {
      id,
      name: input.name,
      description: input.description ?? null,
      keyPrefix: input.keyPrefix,
      keyHash: input.keyHash,
      orgId: input.orgId ?? null,
      serviceId: input.serviceId ?? null,
      env: input.env ?? null,
      scopes: input.scopes ?? ["read", "write"],
      expiresAt: input.expiresAt ?? null,
      lastUsedAt: null,
      revokedAt: null,
      createdBy: input.createdBy ?? null,
      createdAt: now,
    };
    this.apiKeys.set(id, apiKey);
    return apiKey;
  }

  async revokeApiKey(id: string): Promise<ApiKey | undefined> {
    const key = this.apiKeys.get(id);
    if (!key) return undefined;
    const revoked: ApiKey = { ...key, revokedAt: new Date() };
    this.apiKeys.set(id, revoked);
    return revoked;
  }

  async validateApiKey(keyString: string): Promise<ApiKey | undefined> {
    const parts = keyString.split("_");
    if (parts.length < 2) return undefined;
    const prefix = parts[0] + "_" + parts[1].slice(0, 8);
    const key = await this.getApiKeyByPrefix(prefix);
    if (!key) return undefined;
    if (key.revokedAt) return undefined;
    if (key.expiresAt && key.expiresAt < new Date()) return undefined;
    const hash = this.hashKey(keyString);
    if (hash !== key.keyHash) return undefined;
    return key;
  }

  async updateApiKeyLastUsed(id: string): Promise<void> {
    const key = this.apiKeys.get(id);
    if (key) {
      this.apiKeys.set(id, { ...key, lastUsedAt: new Date() });
    }
  }

  // ============================================================================
  // Logs
  // ============================================================================

  async getLogStreams(context: AccessContext): Promise<LogStream[]> {
    return Array.from(this.logStreams.values())
      .filter((stream) => this.matchesContext(stream, context, true))
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async getLogStream(context: AccessContext, id: string): Promise<LogStream | undefined> {
    const stream = this.logStreams.get(id);
    if (!stream) return undefined;
    return this.matchesContext(stream, context, true) ? stream : undefined;
  }

  async createLogStream(context: AccessContext, stream: InsertLogStream): Promise<LogStream> {
    const id = randomUUID();
    const now = new Date();
    const newStream: LogStream = {
      id,
      orgId: context.orgId,
      serviceId: context.serviceId,
      env: context.env,
      dataClass: context.dataClass,
      policyRef: context.policyRef,
      createdBy: context.actorId || null,
      name: stream.name,
      description: stream.description ?? null,
      source: stream.source ?? null,
      level: stream.level ?? "info",
      tags: stream.tags ?? null,
      retentionDays: stream.retentionDays ?? 30,
      createdAt: now,
      updatedAt: now,
    };
    this.logStreams.set(id, newStream);
    return newStream;
  }

  async updateLogStream(
    context: AccessContext,
    id: string,
    updates: Partial<InsertLogStream>
  ): Promise<LogStream | undefined> {
    const existing = await this.getLogStream(context, id);
    if (!existing) return undefined;

    const updated: LogStream = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    this.logStreams.set(id, updated);
    return updated;
  }

  async deleteLogStream(context: AccessContext, id: string): Promise<boolean> {
    const existing = await this.getLogStream(context, id);
    if (!existing) return false;
    const deleted = this.logStreams.delete(id);
    if (deleted) {
      const entriesToDelete: string[] = [];
      this.logEntries.forEach((entry, entryId) => {
        if (entry.streamId === id) {
          entriesToDelete.push(entryId);
        }
      });
      entriesToDelete.forEach((entryId) => this.logEntries.delete(entryId));
    }
    return deleted;
  }

  async queryLogEntries(context: AccessContext, query: LogsQuery): Promise<LogEntry[]> {
    let entries = Array.from(this.logEntries.values()).filter((entry) =>
      this.matchesContext(entry, context, true)
    );

    if (query.streamIds?.length) {
      entries = entries.filter((e) => query.streamIds!.includes(e.streamId));
    }

    if (query.level) {
      entries = entries.filter((e) => e.level === query.level);
    }

    if (query.search) {
      const searchLower = query.search.toLowerCase();
      entries = entries.filter((e) => e.message.toLowerCase().includes(searchLower));
    }

    if (query.metadata && Object.keys(query.metadata).length > 0) {
      entries = entries.filter((e) => {
        if (!e.metadata) return false;
        return Object.entries(query.metadata!).every(
          ([key, value]) => (e.metadata as Record<string, unknown>)[key] === value
        );
      });
    }

    const startTime = this.parseTime(query.startTime);
    const endTime = this.parseTime(query.endTime);
    if (startTime) {
      entries = entries.filter((e) => new Date(e.timestamp) >= startTime);
    }
    if (endTime) {
      entries = entries.filter((e) => new Date(e.timestamp) <= endTime);
    }

    entries = entries.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const offset = query.offset || 0;
    const limit = query.limit || 1000;
    return entries.slice(offset, offset + limit);
  }

  async insertLogEntry(context: AccessContext, entry: InsertLogEntry): Promise<LogEntry> {
    const id = randomUUID();
    const newEntry: LogEntry = {
      id,
      streamId: entry.streamId,
      orgId: context.orgId,
      serviceId: context.serviceId,
      env: context.env,
      dataClass: context.dataClass,
      policyRef: context.policyRef,
      actorId: context.actorId || null,
      timestamp: entry.timestamp,
      level: entry.level ?? "info",
      message: entry.message,
      metadata: entry.metadata ?? null,
    };
    this.logEntries.set(id, newEntry);
    this.ingestCount++;
    return newEntry;
  }

  async insertLogEntriesBatch(
    context: AccessContext,
    streamId: string,
    entries: Array<{ timestamp: string; level: string; message: string; metadata?: Record<string, unknown> }>
  ): Promise<number> {
    let count = 0;
    for (const e of entries) {
      const id = randomUUID();
      const newEntry: LogEntry = {
        id,
        streamId,
        orgId: context.orgId,
        serviceId: context.serviceId,
        env: context.env,
        dataClass: context.dataClass,
        policyRef: context.policyRef,
        actorId: context.actorId || null,
        timestamp: new Date(e.timestamp),
        level: e.level,
        message: e.message,
        metadata: e.metadata || null,
      };
      this.logEntries.set(id, newEntry);
      count++;
      this.ingestCount++;
    }
    return count;
  }

  async getTotalLogEntries(context: AccessContext): Promise<number> {
    return Array.from(this.logEntries.values()).filter((entry) =>
      this.matchesContext(entry, context, true)
    ).length;
  }

  // ============================================================================
  // Metrics
  // ============================================================================

  async getMetrics(context: AccessContext): Promise<Metric[]> {
    return Array.from(this.metrics.values())
      .filter((metric) => this.matchesContext(metric, context, true))
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async getMetric(context: AccessContext, id: string): Promise<Metric | undefined> {
    const metric = this.metrics.get(id);
    if (!metric) return undefined;
    return this.matchesContext(metric, context, true) ? metric : undefined;
  }

  async createMetric(context: AccessContext, metric: InsertMetric): Promise<Metric> {
    const id = randomUUID();
    const now = new Date();
    const newMetric: Metric = {
      id,
      orgId: context.orgId,
      serviceId: context.serviceId,
      env: context.env,
      dataClass: context.dataClass,
      policyRef: context.policyRef,
      createdBy: context.actorId || null,
      name: metric.name,
      description: metric.description ?? null,
      unit: metric.unit ?? null,
      type: metric.type ?? "gauge",
      tags: metric.tags ?? null,
      dataSourceId: metric.dataSourceId ?? null,
      retentionDays: metric.retentionDays ?? 90,
      createdAt: now,
      updatedAt: now,
    };
    this.metrics.set(id, newMetric);
    return newMetric;
  }

  async updateMetric(
    context: AccessContext,
    id: string,
    updates: Partial<InsertMetric>
  ): Promise<Metric | undefined> {
    const existing = await this.getMetric(context, id);
    if (!existing) return undefined;

    const updated: Metric = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    this.metrics.set(id, updated);
    return updated;
  }

  async deleteMetric(context: AccessContext, id: string): Promise<boolean> {
    const existing = await this.getMetric(context, id);
    if (!existing) return false;
    const deleted = this.metrics.delete(id);
    if (deleted) {
      const dpsToDelete: string[] = [];
      this.dataPoints.forEach((dp, dpId) => {
        if (dp.metricId === id) {
          dpsToDelete.push(dpId);
        }
      });
      dpsToDelete.forEach((dpId) => this.dataPoints.delete(dpId));
    }
    return deleted;
  }

  async getDataPoints(context: AccessContext, metricId: string, limit = 1000): Promise<DataPoint[]> {
    return Array.from(this.dataPoints.values())
      .filter((dp) => dp.metricId === metricId && this.matchesContext(dp, context, true))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  async queryDataPoints(context: AccessContext, config: MetricsQuery): Promise<DataPoint[]> {
    let points = Array.from(this.dataPoints.values()).filter((dp) =>
      this.matchesContext(dp, context, true)
    );

    if (config.metricIds?.length) {
      points = points.filter((dp) => config.metricIds!.includes(dp.metricId));
    }

    const startTime = this.parseTime(config.startTime);
    const endTime = this.parseTime(config.endTime);
    if (startTime) {
      points = points.filter((dp) => new Date(dp.timestamp) >= startTime);
    }
    if (endTime) {
      points = points.filter((dp) => new Date(dp.timestamp) <= endTime);
    }

    if (config.labels && Object.keys(config.labels).length > 0) {
      points = points.filter((dp) => {
        if (!dp.labels) return false;
        return Object.entries(config.labels!).every(
          ([k, v]) => (dp.labels as Record<string, unknown>)[k] === v
        );
      });
    }

    points = points.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const offset = config.offset || 0;
    const limit = config.limit || 1000;
    return points.slice(offset, offset + limit);
  }

  private parseTime(value?: string): Date | null {
    if (!value) return null;
    const match = value.match(/^(\d+)(m|h|d)$/);
    if (match) {
      const amount = parseInt(match[1], 10);
      const unit = match[2];
      const deltaMs =
        unit === "m" ? amount * 60 * 1000 : unit === "h" ? amount * 60 * 60 * 1000 : amount * 24 * 60 * 60 * 1000;
      return new Date(Date.now() - deltaMs);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }

  private coerceDate(value?: string | Date | null): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }

  private getTraceByTraceId(context: AccessContext, traceId: string): Trace | undefined {
    for (const trace of Array.from(this.traces.values())) {
      if (trace.traceId === traceId && this.matchesContext(trace, context, true)) {
        return trace;
      }
    }
    return undefined;
  }

  private upsertTraceFromSpan(context: AccessContext, span: Span): void {
    const spanStart = this.coerceDate(span.startTime) ?? new Date();
    const spanEnd = this.coerceDate(span.endTime ?? null);
    const existing = this.getTraceByTraceId(context, span.traceId);
    if (!existing) {
      const durationMs = span.durationMs ?? (spanEnd ? Math.max(0, spanEnd.getTime() - spanStart.getTime()) : null);
      const trace: Trace = {
        id: randomUUID(),
        traceId: span.traceId,
        orgId: context.orgId,
        serviceId: context.serviceId,
        env: context.env,
        dataClass: context.dataClass,
        policyRef: context.policyRef,
        actorId: context.actorId || null,
        name: span.name,
        serviceName: span.serviceName ?? null,
        status: span.status ?? "unset",
        startTime: spanStart,
        endTime: spanEnd ?? null,
        durationMs: durationMs ?? null,
        tags: null,
        attributes: span.attributes ?? null,
        createdAt: new Date(),
      };
      this.traces.set(trace.id, trace);
      this.ingestCount++;
      return;
    }

    const existingStart = this.coerceDate(existing.startTime) ?? spanStart;
    const existingEnd = this.coerceDate(existing.endTime ?? null);
    const nextStart = spanStart < existingStart ? spanStart : existingStart;
    let nextEnd = existingEnd;
    if (spanEnd && (!existingEnd || spanEnd > existingEnd)) {
      nextEnd = spanEnd;
    }

    let status = existing.status ?? "unset";
    if (span.status === "error") {
      status = "error";
    } else if (status === "unset" && span.status) {
      status = span.status;
    }

    const durationMs = nextEnd
      ? Math.max(0, nextEnd.getTime() - nextStart.getTime())
      : existing.durationMs ?? span.durationMs ?? null;

    const updated: Trace = {
      ...existing,
      name: existing.name || span.name,
      serviceName: existing.serviceName ?? span.serviceName ?? null,
      status,
      startTime: nextStart,
      endTime: nextEnd ?? null,
      durationMs,
      attributes: existing.attributes ?? span.attributes ?? null,
    };
    this.traces.set(existing.id, updated);
  }

  async insertDataPoint(context: AccessContext, dataPoint: InsertDataPoint): Promise<DataPoint> {
    const id = randomUUID();
    const dp: DataPoint = {
      id,
      metricId: dataPoint.metricId,
      orgId: context.orgId,
      serviceId: context.serviceId,
      env: context.env,
      dataClass: context.dataClass,
      policyRef: context.policyRef,
      timestamp: dataPoint.timestamp,
      value: dataPoint.value,
      labels: dataPoint.labels ?? null,
    };
    this.dataPoints.set(id, dp);
    this.ingestCount++;
    return dp;
  }

  async insertDataPointsBatch(
    context: AccessContext,
    metricId: string,
    dataPoints: Array<{ timestamp: string; value: number; labels?: Record<string, string> }>
  ): Promise<number> {
    let count = 0;
    for (const dp of dataPoints) {
      const id = randomUUID();
      const newDp: DataPoint = {
        id,
        metricId,
        orgId: context.orgId,
        serviceId: context.serviceId,
        env: context.env,
        dataClass: context.dataClass,
        policyRef: context.policyRef,
        timestamp: new Date(dp.timestamp),
        value: dp.value,
        labels: dp.labels || null,
      };
      this.dataPoints.set(id, newDp);
      count++;
      this.ingestCount++;
    }
    return count;
  }

  async getTotalDataPoints(context: AccessContext): Promise<number> {
    return Array.from(this.dataPoints.values()).filter((dp) =>
      this.matchesContext(dp, context, true)
    ).length;
  }

  // ============================================================================
  // Traces
  // ============================================================================

  async getTraces(context: AccessContext, query?: TracesQuery): Promise<Trace[]> {
    let traces = Array.from(this.traces.values()).filter((trace) =>
      this.matchesContext(trace, context, true)
    );

    if (query?.traceIds?.length) {
      traces = traces.filter((t) => query.traceIds!.includes(t.traceId));
    }

    if (query?.serviceName) {
      traces = traces.filter((t) => t.serviceName === query.serviceName);
    }

    if (query?.status) {
      traces = traces.filter((t) => t.status === query.status);
    }

    if (query?.minDurationMs) {
      traces = traces.filter((t) => (t.durationMs || 0) >= query.minDurationMs!);
    }

    if (query?.maxDurationMs) {
      traces = traces.filter((t) => (t.durationMs || 0) <= query.maxDurationMs!);
    }

    const startTime = this.parseTime(query?.startTime);
    const endTime = this.parseTime(query?.endTime);
    if (startTime) {
      traces = traces.filter((t) => new Date(t.startTime) >= startTime);
    }
    if (endTime) {
      traces = traces.filter((t) => new Date(t.startTime) <= endTime);
    }

    traces = traces.sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );

    const offset = query?.offset || 0;
    const limit = query?.limit || 100;
    return traces.slice(offset, offset + limit);
  }

  async getTrace(context: AccessContext, id: string): Promise<Trace | undefined> {
    const trace = this.traces.get(id);
    if (!trace) return undefined;
    return this.matchesContext(trace, context, true) ? trace : undefined;
  }

  async getSpansByTraceId(context: AccessContext, traceId: string): Promise<Span[]> {
    return Array.from(this.spans.values())
      .filter((s) => s.traceId === traceId && this.matchesContext(s, context, true))
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  async insertTrace(context: AccessContext, trace: InsertTrace): Promise<Trace> {
    const id = randomUUID();
    const newTrace: Trace = {
      id,
      traceId: trace.traceId,
      orgId: context.orgId,
      serviceId: context.serviceId,
      env: context.env,
      dataClass: context.dataClass,
      policyRef: context.policyRef,
      actorId: context.actorId || null,
      name: trace.name,
      serviceName: trace.serviceName ?? null,
      status: trace.status ?? "unset",
      startTime: trace.startTime,
      endTime: trace.endTime ?? null,
      durationMs: trace.durationMs ?? null,
      tags: trace.tags ?? null,
      attributes: trace.attributes ?? null,
      createdAt: new Date(),
    };
    this.traces.set(id, newTrace);
    this.ingestCount++;
    return newTrace;
  }

  async insertSpan(context: AccessContext, span: InsertSpan): Promise<Span> {
    const id = randomUUID();
    const startTime = this.coerceDate(span.startTime as unknown as string) ?? new Date();
    const endTime = this.coerceDate(span.endTime as unknown as string);
    const durationMs = span.durationMs ?? (endTime ? Math.max(0, endTime.getTime() - startTime.getTime()) : null);
    const newSpan: Span = {
      id,
      traceId: span.traceId,
      orgId: context.orgId,
      serviceId: context.serviceId,
      env: context.env,
      dataClass: context.dataClass,
      policyRef: context.policyRef,
      actorId: context.actorId || null,
      parentSpanId: span.parentSpanId ?? null,
      spanId: span.spanId,
      name: span.name,
      serviceName: span.serviceName ?? null,
      kind: span.kind ?? "internal",
      status: span.status ?? "unset",
      startTime,
      endTime: endTime ?? null,
      durationMs,
      attributes: span.attributes ?? null,
      events: span.events ?? null,
    };
    this.spans.set(id, newSpan);
    this.ingestCount++;
    this.upsertTraceFromSpan(context, newSpan);
    return newSpan;
  }

  async insertSpansBatch(context: AccessContext, spans: Array<InsertSpan>): Promise<number> {
    let count = 0;
    for (const span of spans) {
      const id = randomUUID();
      const startTime = this.coerceDate(span.startTime as unknown as string) ?? new Date();
      const endTime = this.coerceDate(span.endTime as unknown as string);
      const durationMs = span.durationMs ?? (endTime ? Math.max(0, endTime.getTime() - startTime.getTime()) : null);
      const newSpan: Span = {
        id,
        traceId: span.traceId,
        orgId: context.orgId,
        serviceId: context.serviceId,
        env: context.env,
        dataClass: context.dataClass,
        policyRef: context.policyRef,
        actorId: context.actorId || null,
        parentSpanId: span.parentSpanId ?? null,
        spanId: span.spanId,
        name: span.name,
        serviceName: span.serviceName ?? null,
        kind: span.kind ?? "internal",
        status: span.status ?? "unset",
        startTime,
        endTime: endTime ?? null,
        durationMs,
        attributes: span.attributes ?? null,
        events: span.events ?? null,
      };
      this.spans.set(id, newSpan);
      this.upsertTraceFromSpan(context, newSpan);
      count++;
      this.ingestCount++;
    }
    return count;
  }

  async getTotalTraces(context: AccessContext): Promise<number> {
    return Array.from(this.traces.values()).filter((trace) =>
      this.matchesContext(trace, context, true)
    ).length;
  }

  async getTotalSpans(context: AccessContext): Promise<number> {
    return Array.from(this.spans.values()).filter((span) =>
      this.matchesContext(span, context, true)
    ).length;
  }

  // ============================================================================
  // Objects
  // ============================================================================

  async getObjectStreams(context: AccessContext): Promise<ObjectStream[]> {
    return Array.from(this.objectStreams.values())
      .filter((stream) => this.matchesContext(stream, context, true))
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async getObjectStream(context: AccessContext, id: string): Promise<ObjectStream | undefined> {
    const stream = this.objectStreams.get(id);
    if (!stream) return undefined;
    return this.matchesContext(stream, context, true) ? stream : undefined;
  }

  async createObjectStream(context: AccessContext, stream: InsertObjectStream): Promise<ObjectStream> {
    const id = randomUUID();
    const now = new Date();
    const newStream: ObjectStream = {
      id,
      orgId: context.orgId,
      serviceId: context.serviceId,
      env: context.env,
      dataClass: context.dataClass,
      policyRef: context.policyRef,
      createdBy: context.actorId || null,
      name: stream.name,
      description: stream.description ?? null,
      contentType: stream.contentType ?? null,
      tags: stream.tags ?? null,
      retentionDays: stream.retentionDays ?? 90,
      createdAt: now,
      updatedAt: now,
    };
    this.objectStreams.set(id, newStream);
    return newStream;
  }

  async updateObjectStream(
    context: AccessContext,
    id: string,
    updates: Partial<InsertObjectStream>
  ): Promise<ObjectStream | undefined> {
    const existing = await this.getObjectStream(context, id);
    if (!existing) return undefined;

    const updated: ObjectStream = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    this.objectStreams.set(id, updated);
    return updated;
  }

  async deleteObjectStream(context: AccessContext, id: string): Promise<boolean> {
    const existing = await this.getObjectStream(context, id);
    if (!existing) return false;
    const deleted = this.objectStreams.delete(id);
    if (deleted) {
      const entriesToDelete: string[] = [];
      this.objectEntries.forEach((entry, entryId) => {
        if (entry.streamId === id) {
          entriesToDelete.push(entryId);
        }
      });
      entriesToDelete.forEach((entryId) => this.objectEntries.delete(entryId));
    }
    return deleted;
  }

  async queryObjectEntries(context: AccessContext, query: ObjectsQuery): Promise<ObjectEntry[]> {
    let entries = Array.from(this.objectEntries.values()).filter((entry) =>
      this.matchesContext(entry, context, true)
    );

    if (query.streamIds?.length) {
      entries = entries.filter((e) => query.streamIds!.includes(e.streamId));
    }

    if (query.contentType) {
      entries = entries.filter((e) => e.contentType === query.contentType);
    }

    if (query.minSize) {
      entries = entries.filter((e) => (e.size || 0) >= query.minSize!);
    }

    if (query.maxSize) {
      entries = entries.filter((e) => (e.size || 0) <= query.maxSize!);
    }

    const startTime = this.parseTime(query.startTime);
    const endTime = this.parseTime(query.endTime);
    if (startTime) {
      entries = entries.filter((e) => new Date(e.timestamp) >= startTime);
    }
    if (endTime) {
      entries = entries.filter((e) => new Date(e.timestamp) <= endTime);
    }

    entries = entries.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const offset = query.offset || 0;
    const limit = query.limit || 1000;
    return entries.slice(offset, offset + limit);
  }

  async insertObjectEntry(context: AccessContext, entry: ObjectEntryInput): Promise<ObjectEntry> {
    const id = randomUUID();
    const newEntry: ObjectEntry = {
      id,
      streamId: entry.streamId,
      orgId: context.orgId,
      serviceId: context.serviceId,
      env: context.env,
      dataClass: context.dataClass,
      policyRef: context.policyRef,
      actorId: context.actorId || null,
      timestamp: entry.timestamp,
      filename: entry.filename ?? null,
      contentType: entry.contentType ?? null,
      size: entry.size ?? null,
      checksum: entry.checksum ?? null,
      storageUrl: entry.storageUrl ?? null,
      metadata: entry.metadata ?? null,
      createdAt: new Date(),
    };
    this.objectEntries.set(id, newEntry);
    this.ingestCount++;
    return newEntry;
  }

  async getTotalObjectEntries(context: AccessContext): Promise<number> {
    return Array.from(this.objectEntries.values()).filter((entry) =>
      this.matchesContext(entry, context, true)
    ).length;
  }

  // ============================================================================
  // Data Sources
  // ============================================================================

  async getDataSources(context: AccessContext): Promise<DataSource[]> {
    return Array.from(this.dataSources.values())
      .filter((source) => this.matchesContext(source, context, true))
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async getDataSource(context: AccessContext, id: string): Promise<DataSource | undefined> {
    const source = this.dataSources.get(id);
    if (!source) return undefined;
    return this.matchesContext(source, context, true) ? source : undefined;
  }

  async createDataSource(context: AccessContext, source: InsertDataSource): Promise<DataSource> {
    const id = randomUUID();
    const newSource: DataSource = {
      id,
      orgId: context.orgId,
      serviceId: context.serviceId,
      env: context.env,
      createdBy: context.actorId || null,
      name: source.name,
      type: source.type,
      config: source.config ?? null,
      status: source.status ?? "inactive",
      lastSyncAt: null,
      createdAt: new Date(),
    };
    this.dataSources.set(id, newSource);
    return newSource;
  }

  async updateDataSource(
    context: AccessContext,
    id: string,
    updates: Partial<InsertDataSource>
  ): Promise<DataSource | undefined> {
    const existing = await this.getDataSource(context, id);
    if (!existing) return undefined;

    const updated: DataSource = { ...existing, ...updates };
    this.dataSources.set(id, updated);
    return updated;
  }

  async deleteDataSource(context: AccessContext, id: string): Promise<boolean> {
    const existing = await this.getDataSource(context, id);
    if (!existing) return false;
    return this.dataSources.delete(id);
  }

  // ============================================================================
  // Integrations
  // ============================================================================

  async getIntegrations(context: AccessContext): Promise<Integration[]> {
    return Array.from(this.integrations.values())
      .filter((integration) => this.matchesContext(integration, context, true))
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async getIntegration(context: AccessContext, id: string): Promise<Integration | undefined> {
    const integration = this.integrations.get(id);
    if (!integration) return undefined;
    return this.matchesContext(integration, context, true) ? integration : undefined;
  }

  async createIntegration(context: AccessContext, integration: InsertIntegration): Promise<Integration> {
    const id = randomUUID();
    const newIntegration: Integration = {
      id,
      orgId: context.orgId,
      serviceId: context.serviceId,
      env: context.env,
      createdBy: context.actorId || null,
      name: integration.name,
      type: integration.type,
      endpoint: integration.endpoint,
      status: "disconnected",
      lastCheckedAt: null,
      config: integration.config ?? null,
      createdAt: new Date(),
    };
    this.integrations.set(id, newIntegration);
    return newIntegration;
  }

  async updateIntegration(
    context: AccessContext,
    id: string,
    updates: Partial<InsertIntegration>
  ): Promise<Integration | undefined> {
    const existing = await this.getIntegration(context, id);
    if (!existing) return undefined;

    const updated: Integration = { ...existing, ...updates };
    this.integrations.set(id, updated);
    return updated;
  }

  async deleteIntegration(context: AccessContext, id: string): Promise<boolean> {
    const existing = await this.getIntegration(context, id);
    if (!existing) return false;
    return this.integrations.delete(id);
  }

  // ============================================================================
  // Stats
  // ============================================================================

  async getStats(context: AccessContext): Promise<{
    totalLogStreams: number;
    totalLogEntries: number;
    totalMetrics: number;
    totalDataPoints: number;
    totalTraces: number;
    totalSpans: number;
    totalObjectStreams: number;
    totalObjectEntries: number;
    activeDataSources: number;
    connectedIntegrations: number;
    ingestRate: number;
    queryLatency: number;
  }> {
    const elapsed = (Date.now() - this.lastIngestReset) / 1000;
    const ingestRate = elapsed > 0 ? Math.round(this.ingestCount / elapsed) : 0;

    if (elapsed > 60) {
      this.ingestCount = 0;
      this.lastIngestReset = Date.now();
    }

    const logStreams = Array.from(this.logStreams.values()).filter((s) =>
      this.matchesContext(s, context, true)
    );
    const logEntries = Array.from(this.logEntries.values()).filter((e) =>
      this.matchesContext(e, context, true)
    );
    const metrics = Array.from(this.metrics.values()).filter((m) =>
      this.matchesContext(m, context, true)
    );
    const dataPoints = Array.from(this.dataPoints.values()).filter((dp) =>
      this.matchesContext(dp, context, true)
    );
    const traces = Array.from(this.traces.values()).filter((t) =>
      this.matchesContext(t, context, true)
    );
    const spans = Array.from(this.spans.values()).filter((s) =>
      this.matchesContext(s, context, true)
    );
    const objectStreams = Array.from(this.objectStreams.values()).filter((s) =>
      this.matchesContext(s, context, true)
    );
    const objectEntries = Array.from(this.objectEntries.values()).filter((e) =>
      this.matchesContext(e, context, true)
    );
    const dataSources = Array.from(this.dataSources.values()).filter((s) =>
      this.matchesContext(s, context, true)
    );
    const integrations = Array.from(this.integrations.values()).filter((i) =>
      this.matchesContext(i, context, true)
    );

    return {
      totalLogStreams: logStreams.length,
      totalLogEntries: logEntries.length,
      totalMetrics: metrics.length,
      totalDataPoints: dataPoints.length,
      totalTraces: traces.length,
      totalSpans: spans.length,
      totalObjectStreams: objectStreams.length,
      totalObjectEntries: objectEntries.length,
      activeDataSources: dataSources.filter((s) => s.status === "active").length,
      connectedIntegrations: integrations.filter((i) => i.status === "connected").length,
      ingestRate,
      queryLatency: Math.floor(5 + Math.random() * 15),
    };
  }
}

// Use database storage for persistence, fallback to memory for development without DB
import { dbStorage } from "./dbStorage";

export const storage: IStorage = dbStorage;
