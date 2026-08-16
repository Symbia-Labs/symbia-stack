var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../../logging/server/src/auth.ts
import {
  createAuthMiddleware,
  createAuthClient,
  hashApiKey,
  generateApiKey as generateApiKeyBase
} from "@symbia/auth";
import { timingSafeEqual } from "crypto";

// ../../logging/server/src/config.ts
import dotenv from "dotenv";
import { resolveServicePort, resolveServiceUrl, ServiceId } from "@symbia/sys";
dotenv.config();
var config = {
  port: resolveServicePort(ServiceId.LOGGING),
  databaseUrl: process.env.DATABASE_URL || "",
  identityServiceUrl: resolveServiceUrl(ServiceId.IDENTITY),
  serviceId: process.env.SERVICE_ID || ServiceId.LOGGING,
  serviceName: process.env.SERVICE_NAME || "Symbia Logging",
  // Auth mode: 'required' | 'optional' | 'off'
  authMode: process.env.LOGGING_AUTH_MODE || (process.env.NODE_ENV === "production" ? "required" : "optional"),
  // Rate limiting (disabled by default)
  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED === "true",
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100", 10),
  // Default scope values for telemetry
  defaults: {
    orgId: process.env.LOGGING_DEFAULT_ORG_ID || "symbia-dev",
    serviceId: process.env.LOGGING_DEFAULT_SERVICE_ID || "logging-service",
    env: process.env.LOGGING_DEFAULT_ENV || (process.env.NODE_ENV === "production" ? "prod" : "dev"),
    dataClass: process.env.LOGGING_DEFAULT_DATA_CLASS || "none",
    policyRef: process.env.LOGGING_DEFAULT_POLICY_REF || "policy/default"
  }
};

// ../../logging/server/src/auth.ts
import { runWithRLSContext } from "@symbia/db";

// ../../logging/server/src/storage.ts
import { canBypassOrgFilterForService as canBypassOrgFilterForService2 } from "@symbia/sys";

// ../../logging/shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  apiKeys: () => apiKeys,
  dataPoints: () => dataPoints,
  dataSources: () => dataSources,
  ingestBatchSchema: () => ingestBatchSchema,
  insertApiKeySchema: () => insertApiKeySchema,
  insertDataPointSchema: () => insertDataPointSchema,
  insertDataSourceSchema: () => insertDataSourceSchema,
  insertIntegrationSchema: () => insertIntegrationSchema,
  insertLogEntrySchema: () => insertLogEntrySchema,
  insertLogStreamSchema: () => insertLogStreamSchema,
  insertMetricSchema: () => insertMetricSchema,
  insertObjectEntrySchema: () => insertObjectEntrySchema,
  insertObjectStreamSchema: () => insertObjectStreamSchema,
  insertSpanSchema: () => insertSpanSchema,
  insertTraceSchema: () => insertTraceSchema,
  insertUserSchema: () => insertUserSchema,
  integrations: () => integrations,
  logEntries: () => logEntries,
  logStreams: () => logStreams,
  logsIngestSchema: () => logsIngestSchema,
  logsQuerySchema: () => logsQuerySchema,
  metrics: () => metrics,
  metricsQuerySchema: () => metricsQuerySchema,
  objectEntries: () => objectEntries,
  objectStreams: () => objectStreams,
  objectsIngestSchema: () => objectsIngestSchema,
  objectsQuerySchema: () => objectsQuerySchema,
  queryConfigSchema: () => queryConfigSchema,
  spans: () => spans,
  traces: () => traces,
  tracesIngestSchema: () => tracesIngestSchema,
  tracesQuerySchema: () => tracesQuerySchema,
  users: () => users
});
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, real, integer, jsonb, bigint, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull()
});
var insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true
});
var apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  keyPrefix: text("key_prefix").notNull(),
  keyHash: text("key_hash").notNull(),
  orgId: text("org_id"),
  serviceId: text("service_id"),
  env: text("env"),
  scopes: text("scopes").array().default(sql`ARRAY['read', 'write']::text[]`),
  expiresAt: timestamp("expires_at"),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true
});
var logStreams = pgTable("log_streams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: text("org_id").notNull(),
  serviceId: text("service_id").notNull(),
  env: text("env").notNull(),
  dataClass: text("data_class").notNull(),
  policyRef: text("policy_ref").notNull(),
  createdBy: text("created_by"),
  name: text("name").notNull(),
  description: text("description"),
  source: text("source"),
  level: text("level").default("info"),
  tags: text("tags").array(),
  retentionDays: integer("retention_days").default(30),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertLogStreamSchema = createInsertSchema(logStreams).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var logEntries = pgTable("log_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  streamId: varchar("stream_id").notNull(),
  orgId: text("org_id").notNull(),
  serviceId: text("service_id").notNull(),
  env: text("env").notNull(),
  dataClass: text("data_class").notNull(),
  policyRef: text("policy_ref").notNull(),
  actorId: text("actor_id"),
  timestamp: timestamp("timestamp").notNull(),
  level: text("level").notNull().default("info"),
  message: text("message").notNull(),
  metadata: jsonb("metadata")
}, (table) => ({
  orgTimestampIdx: index("idx_log_entries_org_ts").on(table.orgId, table.timestamp),
  streamTimestampIdx: index("idx_log_entries_stream_ts").on(table.streamId, table.timestamp),
  levelIdx: index("idx_log_entries_level").on(table.level)
}));
var insertLogEntrySchema = createInsertSchema(logEntries).omit({
  id: true
});
var metrics = pgTable("metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: text("org_id").notNull(),
  serviceId: text("service_id").notNull(),
  env: text("env").notNull(),
  dataClass: text("data_class").notNull(),
  policyRef: text("policy_ref").notNull(),
  createdBy: text("created_by"),
  name: text("name").notNull(),
  description: text("description"),
  unit: text("unit"),
  type: text("type").notNull().default("gauge"),
  tags: text("tags").array(),
  dataSourceId: varchar("data_source_id"),
  retentionDays: integer("retention_days").default(90),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertMetricSchema = createInsertSchema(metrics).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var dataPoints = pgTable("data_points", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  metricId: varchar("metric_id").notNull(),
  orgId: text("org_id").notNull(),
  serviceId: text("service_id").notNull(),
  env: text("env").notNull(),
  dataClass: text("data_class").notNull(),
  policyRef: text("policy_ref").notNull(),
  timestamp: timestamp("timestamp").notNull(),
  value: real("value").notNull(),
  labels: jsonb("labels")
}, (table) => ({
  metricTimestampIdx: index("idx_data_points_metric_ts").on(table.metricId, table.timestamp),
  orgTimestampIdx: index("idx_data_points_org_ts").on(table.orgId, table.timestamp)
}));
var insertDataPointSchema = createInsertSchema(dataPoints).omit({
  id: true
});
var traces = pgTable("traces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  traceId: varchar("trace_id").notNull(),
  orgId: text("org_id").notNull(),
  serviceId: text("service_id").notNull(),
  env: text("env").notNull(),
  dataClass: text("data_class").notNull(),
  policyRef: text("policy_ref").notNull(),
  actorId: text("actor_id"),
  name: text("name").notNull(),
  serviceName: text("service_name"),
  status: text("status").default("unset"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  durationMs: integer("duration_ms"),
  tags: text("tags").array(),
  attributes: jsonb("attributes"),
  createdAt: timestamp("created_at").defaultNow()
}, (table) => ({
  traceIdIdx: index("idx_traces_trace_id").on(table.traceId),
  orgStartTimeIdx: index("idx_traces_org_start").on(table.orgId, table.startTime),
  serviceNameIdx: index("idx_traces_service_name").on(table.serviceName)
}));
var insertTraceSchema = createInsertSchema(traces).omit({
  id: true,
  createdAt: true
});
var spans = pgTable("spans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  traceId: varchar("trace_id").notNull(),
  orgId: text("org_id").notNull(),
  serviceId: text("service_id").notNull(),
  env: text("env").notNull(),
  dataClass: text("data_class").notNull(),
  policyRef: text("policy_ref").notNull(),
  actorId: text("actor_id"),
  parentSpanId: varchar("parent_span_id"),
  spanId: varchar("span_id").notNull(),
  name: text("name").notNull(),
  serviceName: text("service_name"),
  kind: text("kind").default("internal"),
  status: text("status").default("unset"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  durationMs: integer("duration_ms"),
  attributes: jsonb("attributes"),
  events: jsonb("events")
}, (table) => ({
  traceIdIdx: index("idx_spans_trace_id").on(table.traceId),
  spanIdIdx: index("idx_spans_span_id").on(table.spanId),
  parentSpanIdx: index("idx_spans_parent").on(table.parentSpanId)
}));
var insertSpanSchema = createInsertSchema(spans).omit({
  id: true
});
var objectStreams = pgTable("object_streams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: text("org_id").notNull(),
  serviceId: text("service_id").notNull(),
  env: text("env").notNull(),
  dataClass: text("data_class").notNull(),
  policyRef: text("policy_ref").notNull(),
  createdBy: text("created_by"),
  name: text("name").notNull(),
  description: text("description"),
  contentType: text("content_type"),
  tags: text("tags").array(),
  retentionDays: integer("retention_days").default(90),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertObjectStreamSchema = createInsertSchema(objectStreams).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
var objectEntries = pgTable("object_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  streamId: varchar("stream_id").notNull(),
  orgId: text("org_id").notNull(),
  serviceId: text("service_id").notNull(),
  env: text("env").notNull(),
  dataClass: text("data_class").notNull(),
  policyRef: text("policy_ref").notNull(),
  actorId: text("actor_id"),
  timestamp: timestamp("timestamp").notNull(),
  filename: text("filename"),
  contentType: text("content_type"),
  size: bigint("size", { mode: "number" }),
  checksum: text("checksum"),
  storageUrl: text("storage_url"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertObjectEntrySchema = createInsertSchema(objectEntries).omit({
  id: true,
  createdAt: true
});
var dataSources = pgTable("data_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: text("org_id").notNull(),
  serviceId: text("service_id").notNull(),
  env: text("env").notNull(),
  createdBy: text("created_by"),
  name: text("name").notNull(),
  type: text("type").notNull(),
  config: jsonb("config"),
  status: text("status").default("inactive"),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertDataSourceSchema = createInsertSchema(dataSources).omit({
  id: true,
  createdAt: true,
  lastSyncAt: true
});
var integrations = pgTable("integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: text("org_id").notNull(),
  serviceId: text("service_id").notNull(),
  env: text("env").notNull(),
  createdBy: text("created_by"),
  name: text("name").notNull(),
  type: text("type").notNull(),
  endpoint: text("endpoint").notNull(),
  status: text("status").default("disconnected"),
  lastCheckedAt: timestamp("last_checked_at"),
  config: jsonb("config"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertIntegrationSchema = createInsertSchema(integrations).omit({
  id: true,
  createdAt: true,
  lastCheckedAt: true
});
var logsQuerySchema = z.object({
  streamIds: z.array(z.string()).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  level: z.enum(["debug", "info", "warn", "error", "fatal"]).optional(),
  search: z.string().optional(),
  metadata: z.record(z.string()).optional(),
  limit: z.number().optional(),
  offset: z.number().optional()
});
var metricsQuerySchema = z.object({
  metricIds: z.array(z.string()).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  aggregation: z.enum(["avg", "sum", "min", "max", "count", "last"]).optional(),
  interval: z.string().optional(),
  labels: z.record(z.string()).optional(),
  limit: z.number().optional(),
  offset: z.number().optional()
});
var tracesQuerySchema = z.object({
  traceIds: z.array(z.string()).optional(),
  serviceName: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  status: z.enum(["unset", "ok", "error"]).optional(),
  minDurationMs: z.number().optional(),
  maxDurationMs: z.number().optional(),
  limit: z.number().optional(),
  offset: z.number().optional()
});
var objectsQuerySchema = z.object({
  streamIds: z.array(z.string()).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  contentType: z.string().optional(),
  minSize: z.number().optional(),
  maxSize: z.number().optional(),
  limit: z.number().optional(),
  offset: z.number().optional()
});
var queryConfigSchema = metricsQuerySchema;
var ingestBatchSchema = z.object({
  metricId: z.string(),
  dataPoints: z.array(z.object({
    timestamp: z.string(),
    value: z.number(),
    labels: z.record(z.string()).optional()
  }))
});
var logsIngestSchema = z.object({
  streamId: z.string(),
  entries: z.array(z.object({
    timestamp: z.string(),
    level: z.string(),
    message: z.string(),
    metadata: z.record(z.unknown()).optional()
  }))
});
var tracesIngestSchema = z.object({
  spans: z.array(z.object({
    traceId: z.string(),
    spanId: z.string(),
    parentSpanId: z.string().optional(),
    name: z.string(),
    serviceName: z.string().optional(),
    kind: z.string().optional(),
    status: z.string().optional(),
    startTime: z.string(),
    endTime: z.string().optional(),
    attributes: z.record(z.unknown()).optional(),
    events: z.array(z.object({
      name: z.string(),
      timestamp: z.string(),
      attributes: z.record(z.unknown()).optional()
    })).optional()
  }))
});
var objectsIngestSchema = z.object({
  streamId: z.string(),
  filename: z.string().optional(),
  contentType: z.string().optional(),
  size: z.number().optional(),
  checksum: z.string().optional(),
  storageUrl: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});

// ../../logging/server/src/db.ts
import { initializeDatabase, setSessionContext, clearSessionContext, withRLSContext, splitSqlStatements } from "@symbia/db";

// ../../logging/server/src/memory-schema.ts
var MEMORY_SCHEMA_SQL = `
CREATE TABLE "users" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "username" text NOT NULL UNIQUE,
  "password" text NOT NULL
);

CREATE TABLE "api_keys" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "key_prefix" text NOT NULL,
  "key_hash" text NOT NULL,
  "org_id" text,
  "service_id" text,
  "env" text,
  "scopes" text[],
  "expires_at" timestamp,
  "last_used_at" timestamp,
  "revoked_at" timestamp,
  "created_by" varchar,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE "log_streams" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" text NOT NULL,
  "service_id" text NOT NULL,
  "env" text NOT NULL,
  "data_class" text NOT NULL,
  "policy_ref" text NOT NULL,
  "created_by" text,
  "name" text NOT NULL,
  "description" text,
  "source" text,
  "level" text DEFAULT 'info',
  "tags" text[],
  "retention_days" integer DEFAULT 30,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE "log_entries" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "stream_id" varchar NOT NULL,
  "org_id" text NOT NULL,
  "service_id" text NOT NULL,
  "env" text NOT NULL,
  "data_class" text NOT NULL,
  "policy_ref" text NOT NULL,
  "actor_id" text,
  "timestamp" timestamp NOT NULL,
  "level" text NOT NULL DEFAULT 'info',
  "message" text NOT NULL,
  "metadata" jsonb
);

CREATE TABLE "metrics" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" text NOT NULL,
  "service_id" text NOT NULL,
  "env" text NOT NULL,
  "data_class" text NOT NULL,
  "policy_ref" text NOT NULL,
  "created_by" text,
  "name" text NOT NULL,
  "description" text,
  "unit" text,
  "type" text NOT NULL DEFAULT 'gauge',
  "tags" text[],
  "data_source_id" varchar,
  "retention_days" integer DEFAULT 90,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE "data_points" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "metric_id" varchar NOT NULL,
  "org_id" text NOT NULL,
  "service_id" text NOT NULL,
  "env" text NOT NULL,
  "data_class" text NOT NULL,
  "policy_ref" text NOT NULL,
  "timestamp" timestamp NOT NULL,
  "value" real NOT NULL,
  "labels" jsonb
);

CREATE TABLE "traces" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "trace_id" varchar NOT NULL,
  "org_id" text NOT NULL,
  "service_id" text NOT NULL,
  "env" text NOT NULL,
  "data_class" text NOT NULL,
  "policy_ref" text NOT NULL,
  "actor_id" text,
  "name" text NOT NULL,
  "service_name" text,
  "status" text DEFAULT 'unset',
  "start_time" timestamp NOT NULL,
  "end_time" timestamp,
  "duration_ms" integer,
  "tags" text[],
  "attributes" jsonb,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE "spans" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "trace_id" varchar NOT NULL,
  "org_id" text NOT NULL,
  "service_id" text NOT NULL,
  "env" text NOT NULL,
  "data_class" text NOT NULL,
  "policy_ref" text NOT NULL,
  "actor_id" text,
  "parent_span_id" varchar,
  "span_id" varchar NOT NULL,
  "name" text NOT NULL,
  "service_name" text,
  "kind" text DEFAULT 'internal',
  "status" text DEFAULT 'unset',
  "start_time" timestamp NOT NULL,
  "end_time" timestamp,
  "duration_ms" integer,
  "attributes" jsonb,
  "events" jsonb
);

CREATE TABLE "object_streams" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" text NOT NULL,
  "service_id" text NOT NULL,
  "env" text NOT NULL,
  "data_class" text NOT NULL,
  "policy_ref" text NOT NULL,
  "created_by" text,
  "name" text NOT NULL,
  "description" text,
  "content_type" text,
  "tags" text[],
  "retention_days" integer DEFAULT 90,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE "object_entries" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "stream_id" varchar NOT NULL,
  "org_id" text NOT NULL,
  "service_id" text NOT NULL,
  "env" text NOT NULL,
  "data_class" text NOT NULL,
  "policy_ref" text NOT NULL,
  "actor_id" text,
  "timestamp" timestamp NOT NULL,
  "filename" text,
  "content_type" text,
  "size" bigint,
  "checksum" text,
  "storage_url" text,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE "data_sources" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" text NOT NULL,
  "service_id" text NOT NULL,
  "env" text NOT NULL,
  "created_by" text,
  "name" text NOT NULL,
  "type" text NOT NULL,
  "config" jsonb,
  "status" text DEFAULT 'inactive',
  "last_sync_at" timestamp,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE "integrations" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" text NOT NULL,
  "service_id" text NOT NULL,
  "env" text NOT NULL,
  "created_by" text,
  "name" text NOT NULL,
  "type" text NOT NULL,
  "endpoint" text NOT NULL,
  "status" text DEFAULT 'disconnected',
  "last_checked_at" timestamp,
  "config" jsonb,
  "created_at" timestamp DEFAULT now()
);

-- Indexes for log_entries (time-series critical)
CREATE INDEX idx_log_entries_org_ts ON "log_entries"("org_id", "timestamp");
CREATE INDEX idx_log_entries_stream_ts ON "log_entries"("stream_id", "timestamp");
CREATE INDEX idx_log_entries_level ON "log_entries"("level");

-- Indexes for data_points (metrics time-series)
CREATE INDEX idx_data_points_metric_ts ON "data_points"("metric_id", "timestamp");
CREATE INDEX idx_data_points_org_ts ON "data_points"("org_id", "timestamp");

-- Indexes for traces
CREATE INDEX idx_traces_trace_id ON "traces"("trace_id");
CREATE INDEX idx_traces_org_start ON "traces"("org_id", "start_time");
CREATE INDEX idx_traces_service_name ON "traces"("service_name");

-- Indexes for spans
CREATE INDEX idx_spans_trace_id ON "spans"("trace_id");
CREATE INDEX idx_spans_span_id ON "spans"("span_id");
CREATE INDEX idx_spans_parent ON "spans"("parent_span_id");
`;

// ../../logging/server/src/db.ts
var database = initializeDatabase({
  serviceId: "logging-service",
  memorySchema: MEMORY_SCHEMA_SQL,
  memoryDbEnvVar: "LOGGING_USE_MEMORY_DB"
}, schema_exports);
var { db, pool, isMemory, exportToFile, close } = database;
function toIdempotentSchemaSql(sql3) {
  return sql3.replace(/\bCREATE TABLE\s+"/g, 'CREATE TABLE IF NOT EXISTS "').replace(/\bCREATE UNIQUE INDEX\s+/g, "CREATE UNIQUE INDEX IF NOT EXISTS ").replace(/\bCREATE INDEX\s+/g, "CREATE INDEX IF NOT EXISTS ");
}
async function ensureLoggingSchema() {
  if (isMemory) return;
  const client = await pool.connect();
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    const { rows } = await client.query(
      "select to_regclass('public.log_streams') as regclass"
    );
    const schemaSql = toIdempotentSchemaSql(MEMORY_SCHEMA_SQL);
    const statements = splitSqlStatements(schemaSql);
    if (!rows?.[0]?.regclass) {
      console.log("[logging-service] Initializing PostgreSQL schema (tables missing)...");
    }
    for (const statement of statements) {
      await client.query(statement);
    }
  } finally {
    client.release();
  }
}

// ../../logging/server/src/dbStorage.ts
import { eq, and, gte, lte, desc, inArray, like, sql as sql2, count } from "drizzle-orm";
import { createHash } from "crypto";
import { canBypassOrgFilterForService } from "@symbia/sys";
function canReadAllOrgs(context) {
  const authContext = {
    authType: "jwt",
    actorId: context.actorId,
    orgId: context.orgId,
    serviceId: context.serviceId,
    env: context.env,
    entitlements: context.entitlements || [],
    roles: context.roles || [],
    isSuperAdmin: context.isSuperAdmin
  };
  return canBypassOrgFilterForService(authContext, "telemetry");
}
var DatabaseStorage = class {
  ingestCount = 0;
  lastIngestReset = Date.now();
  hashKey(key) {
    return createHash("sha256").update(key).digest("hex");
  }
  parseTime(value) {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  async getUser(id) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || void 0;
  }
  async getUserByUsername(username) {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || void 0;
  }
  async createUser(insertUser) {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }
  async getApiKeys() {
    return db.select().from(apiKeys).where(sql2`${apiKeys.revokedAt} IS NULL`).orderBy(desc(apiKeys.createdAt));
  }
  async getApiKey(id) {
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
    return key || void 0;
  }
  async getApiKeyByPrefix(prefix) {
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.keyPrefix, prefix));
    return key || void 0;
  }
  async createApiKey(input) {
    const [key] = await db.insert(apiKeys).values(input).returning();
    return key;
  }
  async revokeApiKey(id) {
    const [key] = await db.update(apiKeys).set({ revokedAt: /* @__PURE__ */ new Date() }).where(eq(apiKeys.id, id)).returning();
    return key || void 0;
  }
  async validateApiKey(keyString) {
    const parts = keyString.split("_");
    if (parts.length < 2) return void 0;
    const prefix = parts[0] + "_" + parts[1].slice(0, 8);
    const key = await this.getApiKeyByPrefix(prefix);
    if (!key) return void 0;
    if (key.revokedAt) return void 0;
    if (key.expiresAt && key.expiresAt < /* @__PURE__ */ new Date()) return void 0;
    const hash = this.hashKey(keyString);
    if (hash !== key.keyHash) return void 0;
    return key;
  }
  async updateApiKeyLastUsed(id) {
    await db.update(apiKeys).set({ lastUsedAt: /* @__PURE__ */ new Date() }).where(eq(apiKeys.id, id));
  }
  async getLogStreams(context) {
    if (canReadAllOrgs(context)) {
      return db.select().from(logStreams).orderBy(desc(logStreams.createdAt));
    }
    return db.select().from(logStreams).where(eq(logStreams.orgId, context.orgId)).orderBy(desc(logStreams.createdAt));
  }
  async getLogStream(context, id) {
    if (canReadAllOrgs(context)) {
      const [stream2] = await db.select().from(logStreams).where(eq(logStreams.id, id));
      return stream2 || void 0;
    }
    const [stream] = await db.select().from(logStreams).where(and(eq(logStreams.id, id), eq(logStreams.orgId, context.orgId)));
    return stream || void 0;
  }
  async createLogStream(context, stream) {
    const [created] = await db.insert(logStreams).values({
      ...stream,
      orgId: context.orgId,
      serviceId: context.serviceId,
      env: context.env,
      dataClass: context.dataClass,
      policyRef: context.policyRef,
      createdBy: context.actorId
    }).returning();
    return created;
  }
  async updateLogStream(context, id, updates) {
    const [updated] = await db.update(logStreams).set({ ...updates, updatedAt: /* @__PURE__ */ new Date() }).where(and(eq(logStreams.id, id), eq(logStreams.orgId, context.orgId))).returning();
    return updated || void 0;
  }
  async deleteLogStream(context, id) {
    const result = await db.delete(logStreams).where(and(eq(logStreams.id, id), eq(logStreams.orgId, context.orgId)));
    return (result.rowCount ?? 0) > 0;
  }
  async queryLogEntries(context, query) {
    const conditions = [];
    if (!canReadAllOrgs(context)) {
      conditions.push(eq(logEntries.orgId, context.orgId));
    }
    if (query.streamIds?.length) {
      conditions.push(inArray(logEntries.streamId, query.streamIds));
    }
    if (query.level) {
      conditions.push(eq(logEntries.level, query.level));
    }
    if (query.search) {
      conditions.push(like(logEntries.message, `%${query.search}%`));
    }
    const startTime = this.parseTime(query.startTime);
    const endTime = this.parseTime(query.endTime);
    if (startTime) conditions.push(gte(logEntries.timestamp, startTime));
    if (endTime) conditions.push(lte(logEntries.timestamp, endTime));
    const whereClause = conditions.length > 0 ? and(...conditions) : void 0;
    return db.select().from(logEntries).where(whereClause).orderBy(desc(logEntries.timestamp)).limit(query.limit || 1e3).offset(query.offset || 0);
  }
  async insertLogEntry(context, entry) {
    const [created] = await db.insert(logEntries).values({
      ...entry,
      orgId: context.orgId,
      serviceId: context.serviceId,
      env: context.env,
      dataClass: context.dataClass,
      policyRef: context.policyRef,
      actorId: context.actorId
    }).returning();
    this.ingestCount++;
    return created;
  }
  async insertLogEntriesBatch(context, streamId, entries) {
    if (entries.length === 0) return 0;
    const values = entries.map((e) => ({
      streamId,
      orgId: context.orgId,
      serviceId: context.serviceId,
      env: context.env,
      dataClass: context.dataClass,
      policyRef: context.policyRef,
      actorId: context.actorId,
      timestamp: new Date(e.timestamp),
      level: e.level,
      message: e.message,
      metadata: e.metadata ?? null
    }));
    await db.insert(logEntries).values(values);
    this.ingestCount += entries.length;
    return entries.length;
  }
  async getTotalLogEntries(context) {
    if (canReadAllOrgs(context)) {
      const [result2] = await db.select({ count: count() }).from(logEntries);
      return result2?.count ?? 0;
    }
    const [result] = await db.select({ count: count() }).from(logEntries).where(eq(logEntries.orgId, context.orgId));
    return result?.count ?? 0;
  }
  async getMetrics(context) {
    if (canReadAllOrgs(context)) {
      return db.select().from(metrics).orderBy(desc(metrics.createdAt));
    }
    return db.select().from(metrics).where(eq(metrics.orgId, context.orgId)).orderBy(desc(metrics.createdAt));
  }
  async getMetric(context, id) {
    const [metric] = await db.select().from(metrics).where(and(eq(metrics.id, id), eq(metrics.orgId, context.orgId)));
    return metric || void 0;
  }
  async createMetric(context, metric) {
    const [created] = await db.insert(metrics).values({
      ...metric,
      orgId: context.orgId,
      serviceId: context.serviceId,
      env: context.env,
      dataClass: context.dataClass,
      policyRef: context.policyRef,
      createdBy: context.actorId
    }).returning();
    return created;
  }
  async updateMetric(context, id, updates) {
    const [updated] = await db.update(metrics).set({ ...updates, updatedAt: /* @__PURE__ */ new Date() }).where(and(eq(metrics.id, id), eq(metrics.orgId, context.orgId))).returning();
    return updated || void 0;
  }
  async deleteMetric(context, id) {
    const result = await db.delete(metrics).where(and(eq(metrics.id, id), eq(metrics.orgId, context.orgId)));
    return (result.rowCount ?? 0) > 0;
  }
  async getDataPoints(context, metricId, limit) {
    return db.select().from(dataPoints).where(and(eq(dataPoints.metricId, metricId), eq(dataPoints.orgId, context.orgId))).orderBy(desc(dataPoints.timestamp)).limit(limit || 100);
  }
  async queryDataPoints(context, query) {
    const conditions = [eq(dataPoints.orgId, context.orgId)];
    if (query.metricIds?.length) {
      conditions.push(inArray(dataPoints.metricId, query.metricIds));
    }
    const startTime = this.parseTime(query.startTime);
    const endTime = this.parseTime(query.endTime);
    if (startTime) conditions.push(gte(dataPoints.timestamp, startTime));
    if (endTime) conditions.push(lte(dataPoints.timestamp, endTime));
    return db.select().from(dataPoints).where(and(...conditions)).orderBy(desc(dataPoints.timestamp)).limit(query.limit || 1e3).offset(query.offset || 0);
  }
  async insertDataPoint(context, dataPoint) {
    const [created] = await db.insert(dataPoints).values({
      ...dataPoint,
      orgId: context.orgId,
      serviceId: context.serviceId,
      env: context.env,
      dataClass: context.dataClass,
      policyRef: context.policyRef
    }).returning();
    this.ingestCount++;
    return created;
  }
  async insertDataPointsBatch(context, metricId, points) {
    if (points.length === 0) return 0;
    const values = points.map((p) => ({
      metricId,
      orgId: context.orgId,
      serviceId: context.serviceId,
      env: context.env,
      dataClass: context.dataClass,
      policyRef: context.policyRef,
      timestamp: new Date(p.timestamp),
      value: p.value,
      labels: p.labels ?? null
    }));
    await db.insert(dataPoints).values(values);
    this.ingestCount += points.length;
    return points.length;
  }
  async getTotalDataPoints(context) {
    const [result] = await db.select({ count: count() }).from(dataPoints).where(eq(dataPoints.orgId, context.orgId));
    return result?.count ?? 0;
  }
  async getTraces(context, query) {
    const conditions = [];
    if (!canReadAllOrgs(context)) {
      conditions.push(eq(traces.orgId, context.orgId));
    }
    if (query?.traceIds?.length) {
      conditions.push(inArray(traces.traceId, query.traceIds));
    }
    if (query?.serviceName) {
      conditions.push(eq(traces.serviceName, query.serviceName));
    }
    if (query?.status) {
      conditions.push(eq(traces.status, query.status));
    }
    const startTime = this.parseTime(query?.startTime);
    const endTime = this.parseTime(query?.endTime);
    if (startTime) conditions.push(gte(traces.startTime, startTime));
    if (endTime) conditions.push(lte(traces.startTime, endTime));
    if (query?.minDurationMs) {
      conditions.push(gte(traces.durationMs, query.minDurationMs));
    }
    if (query?.maxDurationMs) {
      conditions.push(lte(traces.durationMs, query.maxDurationMs));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : void 0;
    return db.select().from(traces).where(whereClause).orderBy(desc(traces.startTime)).limit(query?.limit || 100).offset(query?.offset || 0);
  }
  async getTrace(context, id) {
    const [trace] = await db.select().from(traces).where(and(eq(traces.id, id), eq(traces.orgId, context.orgId)));
    return trace || void 0;
  }
  async getSpansByTraceId(context, traceId) {
    return db.select().from(spans).where(and(eq(spans.traceId, traceId), eq(spans.orgId, context.orgId))).orderBy(spans.startTime);
  }
  async insertTrace(context, trace) {
    const [created] = await db.insert(traces).values({
      ...trace,
      orgId: context.orgId,
      serviceId: context.serviceId,
      env: context.env,
      dataClass: context.dataClass,
      policyRef: context.policyRef,
      actorId: context.actorId
    }).returning();
    return created;
  }
  async insertSpan(context, span) {
    const startTime = new Date(span.startTime);
    const endTime = span.endTime ? new Date(span.endTime) : null;
    const durationMs = span.durationMs ?? (endTime ? Math.max(0, endTime.getTime() - startTime.getTime()) : null);
    const [created] = await db.insert(spans).values({
      ...span,
      orgId: context.orgId,
      serviceId: context.serviceId,
      env: context.env,
      dataClass: context.dataClass,
      policyRef: context.policyRef,
      actorId: context.actorId,
      startTime,
      endTime,
      durationMs
    }).returning();
    this.ingestCount++;
    return created;
  }
  async insertSpansBatch(context, spanList) {
    if (spanList.length === 0) return 0;
    const values = spanList.map((span) => {
      const startTime = new Date(span.startTime);
      const endTime = span.endTime ? new Date(span.endTime) : null;
      const durationMs = span.durationMs ?? (endTime ? Math.max(0, endTime.getTime() - startTime.getTime()) : null);
      return {
        ...span,
        orgId: context.orgId,
        serviceId: context.serviceId,
        env: context.env,
        dataClass: context.dataClass,
        policyRef: context.policyRef,
        actorId: context.actorId,
        startTime,
        endTime,
        durationMs
      };
    });
    await db.insert(spans).values(values);
    this.ingestCount += spanList.length;
    return spanList.length;
  }
  async getTotalTraces(context) {
    const [result] = await db.select({ count: count() }).from(traces).where(eq(traces.orgId, context.orgId));
    return result?.count ?? 0;
  }
  async getTotalSpans(context) {
    const [result] = await db.select({ count: count() }).from(spans).where(eq(spans.orgId, context.orgId));
    return result?.count ?? 0;
  }
  async getObjectStreams(context) {
    return db.select().from(objectStreams).where(eq(objectStreams.orgId, context.orgId)).orderBy(desc(objectStreams.createdAt));
  }
  async getObjectStream(context, id) {
    const [stream] = await db.select().from(objectStreams).where(and(eq(objectStreams.id, id), eq(objectStreams.orgId, context.orgId)));
    return stream || void 0;
  }
  async createObjectStream(context, stream) {
    const [created] = await db.insert(objectStreams).values({
      ...stream,
      orgId: context.orgId,
      serviceId: context.serviceId,
      env: context.env,
      dataClass: context.dataClass,
      policyRef: context.policyRef,
      createdBy: context.actorId
    }).returning();
    return created;
  }
  async updateObjectStream(context, id, updates) {
    const [updated] = await db.update(objectStreams).set({ ...updates, updatedAt: /* @__PURE__ */ new Date() }).where(and(eq(objectStreams.id, id), eq(objectStreams.orgId, context.orgId))).returning();
    return updated || void 0;
  }
  async deleteObjectStream(context, id) {
    const result = await db.delete(objectStreams).where(and(eq(objectStreams.id, id), eq(objectStreams.orgId, context.orgId)));
    return (result.rowCount ?? 0) > 0;
  }
  async queryObjectEntries(context, query) {
    const conditions = [eq(objectEntries.orgId, context.orgId)];
    if (query.streamIds?.length) {
      conditions.push(inArray(objectEntries.streamId, query.streamIds));
    }
    if (query.contentType) {
      conditions.push(eq(objectEntries.contentType, query.contentType));
    }
    const startTime = this.parseTime(query.startTime);
    const endTime = this.parseTime(query.endTime);
    if (startTime) conditions.push(gte(objectEntries.timestamp, startTime));
    if (endTime) conditions.push(lte(objectEntries.timestamp, endTime));
    if (query.minSize) {
      conditions.push(gte(objectEntries.size, query.minSize));
    }
    if (query.maxSize) {
      conditions.push(lte(objectEntries.size, query.maxSize));
    }
    return db.select().from(objectEntries).where(and(...conditions)).orderBy(desc(objectEntries.timestamp)).limit(query.limit || 1e3).offset(query.offset || 0);
  }
  async insertObjectEntry(context, entry) {
    const [created] = await db.insert(objectEntries).values({
      ...entry,
      orgId: context.orgId,
      serviceId: context.serviceId,
      env: context.env,
      dataClass: context.dataClass,
      policyRef: context.policyRef,
      actorId: context.actorId
    }).returning();
    this.ingestCount++;
    return created;
  }
  async getTotalObjectEntries(context) {
    const [result] = await db.select({ count: count() }).from(objectEntries).where(eq(objectEntries.orgId, context.orgId));
    return result?.count ?? 0;
  }
  async getDataSources(context) {
    return db.select().from(dataSources).where(eq(dataSources.orgId, context.orgId)).orderBy(desc(dataSources.createdAt));
  }
  async getDataSource(context, id) {
    const [source] = await db.select().from(dataSources).where(and(eq(dataSources.id, id), eq(dataSources.orgId, context.orgId)));
    return source || void 0;
  }
  async createDataSource(context, source) {
    const [created] = await db.insert(dataSources).values({
      ...source,
      orgId: context.orgId,
      serviceId: context.serviceId,
      env: context.env,
      createdBy: context.actorId
    }).returning();
    return created;
  }
  async updateDataSource(context, id, updates) {
    const [updated] = await db.update(dataSources).set(updates).where(and(eq(dataSources.id, id), eq(dataSources.orgId, context.orgId))).returning();
    return updated || void 0;
  }
  async deleteDataSource(context, id) {
    const result = await db.delete(dataSources).where(and(eq(dataSources.id, id), eq(dataSources.orgId, context.orgId)));
    return (result.rowCount ?? 0) > 0;
  }
  async getIntegrations(context) {
    return db.select().from(integrations).where(eq(integrations.orgId, context.orgId)).orderBy(desc(integrations.createdAt));
  }
  async getIntegration(context, id) {
    const [integration] = await db.select().from(integrations).where(and(eq(integrations.id, id), eq(integrations.orgId, context.orgId)));
    return integration || void 0;
  }
  async createIntegration(context, integration) {
    const [created] = await db.insert(integrations).values({
      ...integration,
      orgId: context.orgId,
      serviceId: context.serviceId,
      env: context.env,
      createdBy: context.actorId
    }).returning();
    return created;
  }
  async updateIntegration(context, id, updates) {
    const [updated] = await db.update(integrations).set(updates).where(and(eq(integrations.id, id), eq(integrations.orgId, context.orgId))).returning();
    return updated || void 0;
  }
  async deleteIntegration(context, id) {
    const result = await db.delete(integrations).where(and(eq(integrations.id, id), eq(integrations.orgId, context.orgId)));
    return (result.rowCount ?? 0) > 0;
  }
  async getStats(context) {
    const elapsed = (Date.now() - this.lastIngestReset) / 1e3;
    const ingestRate = elapsed > 0 ? Math.round(this.ingestCount / elapsed) : 0;
    if (elapsed > 60) {
      this.ingestCount = 0;
      this.lastIngestReset = Date.now();
    }
    const isSuperAdmin = canReadAllOrgs(context);
    const [logStreamCount] = isSuperAdmin ? await db.select({ count: count() }).from(logStreams) : await db.select({ count: count() }).from(logStreams).where(eq(logStreams.orgId, context.orgId));
    const [logEntryCount] = isSuperAdmin ? await db.select({ count: count() }).from(logEntries) : await db.select({ count: count() }).from(logEntries).where(eq(logEntries.orgId, context.orgId));
    const [metricCount] = isSuperAdmin ? await db.select({ count: count() }).from(metrics) : await db.select({ count: count() }).from(metrics).where(eq(metrics.orgId, context.orgId));
    const [dataPointCount] = isSuperAdmin ? await db.select({ count: count() }).from(dataPoints) : await db.select({ count: count() }).from(dataPoints).where(eq(dataPoints.orgId, context.orgId));
    const [traceCount] = isSuperAdmin ? await db.select({ count: count() }).from(traces) : await db.select({ count: count() }).from(traces).where(eq(traces.orgId, context.orgId));
    const [spanCount] = isSuperAdmin ? await db.select({ count: count() }).from(spans) : await db.select({ count: count() }).from(spans).where(eq(spans.orgId, context.orgId));
    const [objectStreamCount] = isSuperAdmin ? await db.select({ count: count() }).from(objectStreams) : await db.select({ count: count() }).from(objectStreams).where(eq(objectStreams.orgId, context.orgId));
    const [objectEntryCount] = isSuperAdmin ? await db.select({ count: count() }).from(objectEntries) : await db.select({ count: count() }).from(objectEntries).where(eq(objectEntries.orgId, context.orgId));
    const [activeDataSourceCount] = isSuperAdmin ? await db.select({ count: count() }).from(dataSources).where(eq(dataSources.status, "active")) : await db.select({ count: count() }).from(dataSources).where(and(eq(dataSources.orgId, context.orgId), eq(dataSources.status, "active")));
    const [connectedIntegrationCount] = isSuperAdmin ? await db.select({ count: count() }).from(integrations).where(eq(integrations.status, "connected")) : await db.select({ count: count() }).from(integrations).where(and(eq(integrations.orgId, context.orgId), eq(integrations.status, "connected")));
    return {
      totalLogStreams: logStreamCount?.count ?? 0,
      totalLogEntries: logEntryCount?.count ?? 0,
      totalMetrics: metricCount?.count ?? 0,
      totalDataPoints: dataPointCount?.count ?? 0,
      totalTraces: traceCount?.count ?? 0,
      totalSpans: spanCount?.count ?? 0,
      totalObjectStreams: objectStreamCount?.count ?? 0,
      totalObjectEntries: objectEntryCount?.count ?? 0,
      activeDataSources: activeDataSourceCount?.count ?? 0,
      connectedIntegrations: connectedIntegrationCount?.count ?? 0,
      ingestRate,
      queryLatency: Math.floor(5 + Math.random() * 15)
    };
  }
};
var dbStorage = new DatabaseStorage();

// ../../logging/server/src/storage.ts
var SEED_ORG_ID = process.env.LOGGING_DEFAULT_ORG_ID || "symbia-dev";
var SEED_SERVICE_ID = process.env.LOGGING_DEFAULT_SERVICE_ID || "logging-service";
var SEED_ENV = process.env.LOGGING_DEFAULT_ENV || "dev";
var SEED_DATA_CLASS = process.env.LOGGING_DEFAULT_DATA_CLASS || "none";
var SEED_POLICY_REF = process.env.LOGGING_DEFAULT_POLICY_REF || "policy/default";
var storage = dbStorage;

// ../../logging/server/src/auth.ts
function generateApiKey() {
  return generateApiKeyBase("slk");
}
var authClient = createAuthClient({
  identityServiceUrl: config.identityServiceUrl
});
var auth = createAuthMiddleware({
  identityServiceUrl: config.identityServiceUrl,
  adminEntitlements: ["logging:admin", "cap:logging.admin"],
  enableImpersonation: false,
  logger: (level, message) => console.log(`[Logging Auth] ${message}`)
});
var { requireAuth, optionalAuth, requireAdmin, requireSuperAdmin } = auth;
var introspectToken = authClient.introspectToken;
var verifyApiKey = authClient.verifyApiKey;
var systemBootstrapConfig = null;
var bootstrapFetchPromise = null;
async function fetchSystemBootstrap() {
  if (bootstrapFetchPromise) return bootstrapFetchPromise;
  bootstrapFetchPromise = (async () => {
    try {
      const response = await fetch(authClient.buildIdentityUrl("/bootstrap/internal"), {
        method: "GET",
        headers: { "Accept": "application/json" }
      });
      if (response.ok) {
        systemBootstrapConfig = await response.json();
        console.log("[logging] Fetched system bootstrap config from Identity");
        return systemBootstrapConfig;
      }
    } catch (error) {
      console.warn("[logging] Failed to fetch system bootstrap config:", error);
    }
    return null;
  })();
  const result = await bootstrapFetchPromise;
  bootstrapFetchPromise = null;
  return result;
}
async function initSystemBootstrap() {
  await fetchSystemBootstrap();
}
async function validateSystemSecret(secret) {
  if (systemBootstrapConfig) {
    try {
      const secretBuffer = Buffer.from(secret);
      const cachedBuffer = Buffer.from(systemBootstrapConfig.secret);
      if (secretBuffer.length === cachedBuffer.length && timingSafeEqual(secretBuffer, cachedBuffer)) {
        return systemBootstrapConfig;
      }
    } catch {
    }
  }
  const freshConfig = await fetchSystemBootstrap();
  if (freshConfig) {
    try {
      const secretBuffer = Buffer.from(secret);
      const freshBuffer = Buffer.from(freshConfig.secret);
      if (secretBuffer.length === freshBuffer.length && timingSafeEqual(secretBuffer, freshBuffer)) {
        return freshConfig;
      }
    } catch {
    }
  }
  return null;
}
var PUBLIC_API_PATHS = /* @__PURE__ */ new Set([
  "/api/openapi.json",
  "/api/docs/openapi.json",
  "/api/auth/config",
  "/api/auth/login",
  "/api/auth/session"
]);
var INGEST_PATHS = /* @__PURE__ */ new Set([
  "/api/logs/ingest",
  "/api/metrics/ingest",
  "/api/traces/ingest",
  "/api/objects/ingest",
  "/api/ingest",
  "/api/logs/streams",
  "/api/metrics",
  "/api/objects/streams"
]);
var TELEMETRY_READ_PATHS = /* @__PURE__ */ new Set([
  "/api/metrics",
  "/api/metrics/query",
  "/api/logs",
  "/api/logs/query",
  "/api/logs/streams",
  "/api/traces",
  "/api/traces/query",
  "/api/query"
]);
function isTelemetryRead(method, path) {
  if (!TELEMETRY_READ_PATHS.has(path)) return false;
  if (method === "GET") return true;
  return method === "POST" && path.endsWith("/query");
}
function getHeader(req, name) {
  const value = req.get(name);
  return value?.trim() || void 0;
}
function normalizeDataClass(value) {
  const valid = /* @__PURE__ */ new Set(["none", "pii", "phi", "secret"]);
  return value && valid.has(value.toLowerCase()) ? value.toLowerCase() : config.defaults.dataClass;
}
function buildContextFromDefaults() {
  return {
    authType: "anonymous",
    orgId: config.defaults.orgId,
    serviceId: config.defaults.serviceId,
    env: config.defaults.env,
    dataClass: config.defaults.dataClass,
    policyRef: config.defaults.policyRef,
    actorId: "anonymous",
    entitlements: [],
    roles: [],
    isSuperAdmin: false
  };
}
async function authMiddleware(req, res, next) {
  if (!req.path.startsWith("/api")) {
    next();
    return;
  }
  if (req.method === "OPTIONS" || PUBLIC_API_PATHS.has(req.path)) {
    next();
    return;
  }
  if (req.path.startsWith("/docs")) {
    next();
    return;
  }
  const bearer = getHeader(req, "authorization");
  const apiKey = getHeader(req, "x-api-key");
  const requestedOrgId = getHeader(req, "x-org-id");
  const requestedServiceId = getHeader(req, "x-service-id");
  const requestedEnv = getHeader(req, "x-env") || getHeader(req, "x-environment");
  const requestedDataClass = getHeader(req, "x-data-class");
  const requestedPolicyRef = getHeader(req, "x-policy-ref");
  if (req.session?.userId) {
    const identityUser = req.session.identityUser;
    const userOrgs = identityUser?.organizations || [];
    const isSuperAdmin = identityUser?.isSuperAdmin || false;
    let sessionOrgId = requestedOrgId || userOrgs[0]?.id || config.defaults.orgId;
    if (!isSuperAdmin && requestedOrgId && !userOrgs.some((org) => org.id === requestedOrgId)) {
      res.status(403).json({ error: "Access denied to requested organization" });
      return;
    }
    req.authContext = {
      authType: "session",
      orgId: sessionOrgId,
      serviceId: requestedServiceId || config.defaults.serviceId,
      env: requestedEnv || config.defaults.env,
      dataClass: normalizeDataClass(requestedDataClass),
      policyRef: requestedPolicyRef || config.defaults.policyRef,
      actorId: req.session.userId,
      entitlements: identityUser?.entitlements || [],
      roles: identityUser?.roles || [],
      isSuperAdmin
    };
    next();
    return;
  }
  if (bearer?.toLowerCase().startsWith("bearer ")) {
    const token = bearer.slice(7).trim();
    const wantsIngest = INGEST_PATHS.has(req.path);
    const wantsRead = isTelemetryRead(req.method, req.path);
    if (wantsIngest || wantsRead) {
      const systemConfig = await validateSystemSecret(token);
      if (systemConfig) {
        req.authContext = {
          authType: "apiKey",
          orgId: requestedOrgId || systemConfig.orgId,
          serviceId: requestedServiceId || systemConfig.serviceId,
          env: requestedEnv || config.defaults.env,
          dataClass: normalizeDataClass(requestedDataClass),
          policyRef: requestedPolicyRef || config.defaults.policyRef,
          actorId: `system:${requestedServiceId || "unknown"}`,
          // Ingest is granted only on ingest paths. A read-path request gets
          // read and nothing else, so widening the read surface cannot widen
          // what the credential may write.
          entitlements: wantsIngest ? ["telemetry:ingest", "telemetry:read"] : ["telemetry:read"],
          roles: [],
          isSuperAdmin: false
        };
        next();
        return;
      }
    }
    const user = await authClient.introspectToken(token);
    if (!user) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    const orgId = requestedOrgId || user.orgId || user.organizations[0]?.id || config.defaults.orgId;
    req.authContext = {
      authType: "jwt",
      orgId,
      serviceId: requestedServiceId || config.defaults.serviceId,
      env: requestedEnv || config.defaults.env,
      dataClass: normalizeDataClass(requestedDataClass),
      policyRef: requestedPolicyRef || config.defaults.policyRef,
      actorId: user.id,
      entitlements: user.entitlements,
      roles: user.roles,
      isSuperAdmin: user.isSuperAdmin
    };
    req.user = user;
    next();
    return;
  }
  if (apiKey) {
    const user = await authClient.verifyApiKey(apiKey);
    if (user) {
      req.authContext = {
        authType: "apiKey",
        orgId: user.orgId || requestedOrgId || config.defaults.orgId,
        serviceId: requestedServiceId || config.defaults.serviceId,
        env: requestedEnv || config.defaults.env,
        dataClass: normalizeDataClass(requestedDataClass),
        policyRef: requestedPolicyRef || config.defaults.policyRef,
        actorId: user.id,
        entitlements: user.entitlements,
        roles: user.roles,
        isSuperAdmin: user.isSuperAdmin
      };
      req.user = user;
      next();
      return;
    }
    const storedKey = await storage.validateApiKey(apiKey);
    if (storedKey) {
      await storage.updateApiKeyLastUsed(storedKey.id);
      req.authContext = {
        authType: "apiKey",
        orgId: storedKey.orgId || config.defaults.orgId,
        serviceId: storedKey.serviceId || config.defaults.serviceId,
        env: storedKey.env || config.defaults.env,
        dataClass: normalizeDataClass(requestedDataClass),
        policyRef: requestedPolicyRef || config.defaults.policyRef,
        actorId: `apikey:${storedKey.id}`,
        entitlements: storedKey.scopes || [],
        roles: [],
        isSuperAdmin: false
      };
      next();
      return;
    }
    res.status(401).json({ error: "Invalid API key" });
    return;
  }
  if (config.authMode === "off" || config.authMode === "optional") {
    req.authContext = buildContextFromDefaults();
    next();
    return;
  }
  res.status(401).json({ error: "Authentication required" });
}
function requireAuthContext(req) {
  if (!req.authContext) {
    const error = new Error("Auth context unavailable");
    error.status = 401;
    throw error;
  }
  return req.authContext;
}
async function rlsMiddleware(req, res, next) {
  if (!req.authContext) {
    next();
    return;
  }
  try {
    runWithRLSContext(
      {
        orgId: req.authContext.orgId,
        userId: req.authContext.actorId,
        isSuperAdmin: req.authContext.isSuperAdmin,
        capabilities: req.authContext.entitlements,
        serviceId: "logging"
      },
      () => next()
    );
  } catch (error) {
    console.error("[logging-service] Failed to establish RLS context:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to establish request security context" });
    }
  }
}

// ../../logging/server/src/routes.ts
import { createTelemetryClient as createTelemetryClient2 } from "@symbia/logging-client";

// ../../logging/server/src/doc-routes.ts
import { registerDocRoutes } from "@symbia/md";

// ../../logging/server/src/openapi.ts
var scopingParameters = [
  { $ref: "#/components/parameters/OrgIdHeader" },
  { $ref: "#/components/parameters/ServiceIdHeader" },
  { $ref: "#/components/parameters/EnvHeader" },
  { $ref: "#/components/parameters/DataClassHeader" },
  { $ref: "#/components/parameters/PolicyRefHeader" }
];
var openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Symbia Logging Service API",
    description: "Comprehensive observability platform supporting Logs, Metrics, Traces, and Objects. Requests are scoped by X-Org-Id, X-Service-Id, and X-Env headers.",
    version: "2.0.0"
  },
  servers: [
    {
      url: "/api",
      description: "API Server"
    }
  ],
  tags: [
    { name: "Logs", description: "Log stream and entry management" },
    {
      name: "Metrics",
      description: "Metric definition and data point management"
    },
    { name: "Traces", description: "Distributed tracing and span management" },
    { name: "Objects", description: "Binary object and file management" },
    { name: "Assistant", description: "AI-powered log analysis and insights" },
    { name: "DataSources", description: "Data source configuration" },
    { name: "Integrations", description: "External service integrations" },
    { name: "Stats", description: "Dashboard statistics" }
  ],
  paths: {
    "/logs/streams": {
      parameters: scopingParameters,
      get: {
        tags: ["Logs"],
        summary: "List all log streams",
        responses: { "200": { description: "List of log streams" } }
      },
      post: {
        tags: ["Logs"],
        summary: "Create a new log stream",
        responses: { "201": { description: "Log stream created" } }
      }
    },
    "/logs/query": {
      parameters: scopingParameters,
      post: {
        tags: ["Logs"],
        summary: "Query log entries",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  streamIds: { type: "array", items: { type: "string" } },
                  startTime: { type: "string", format: "date-time" },
                  endTime: { type: "string", format: "date-time" },
                  level: { type: "string" },
                  search: { type: "string" },
                  limit: { type: "integer" },
                  offset: { type: "integer" }
                }
              }
            }
          }
        },
        responses: { "200": { description: "Log query results" } }
      }
    },
    "/logs/ingest": {
      parameters: scopingParameters,
      post: {
        tags: ["Logs"],
        summary: "Ingest log entries",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["entries"],
                properties: {
                  entries: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["streamId", "timestamp"],
                      properties: {
                        streamId: { type: "string" },
                        timestamp: { type: "string", format: "date-time" },
                        level: { type: "string" },
                        message: { type: "string" },
                        attributes: { type: "object" }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        responses: { "200": { description: "Logs ingested" } }
      }
    },
    "/metrics": {
      parameters: scopingParameters,
      get: {
        tags: ["Metrics"],
        summary: "List all metrics",
        responses: { "200": { description: "List of metrics" } }
      },
      post: {
        tags: ["Metrics"],
        summary: "Create a new metric",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "metricType"],
                properties: {
                  name: { type: "string" },
                  metricType: {
                    type: "string",
                    enum: ["counter", "gauge", "histogram", "summary"]
                  },
                  unit: { type: "string" },
                  description: { type: "string" },
                  labels: {
                    type: "array",
                    items: { type: "string" }
                  }
                }
              }
            }
          }
        },
        responses: { "201": { description: "Metric created" } }
      }
    },
    "/metrics/query": {
      parameters: scopingParameters,
      post: {
        tags: ["Metrics"],
        summary: "Query metric data points",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  metricIds: { type: "array", items: { type: "string" } },
                  startTime: { type: "string", format: "date-time" },
                  endTime: { type: "string", format: "date-time" },
                  labels: { type: "object" },
                  aggregation: { type: "string" },
                  interval: { type: "string" },
                  limit: { type: "integer" },
                  offset: { type: "integer" }
                }
              }
            }
          }
        },
        responses: { "200": { description: "Metric query results" } }
      }
    },
    "/metrics/ingest": {
      parameters: scopingParameters,
      post: {
        tags: ["Metrics"],
        summary: "Ingest metric data points",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["dataPoints"],
                properties: {
                  dataPoints: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["metricId", "timestamp", "value"],
                      properties: {
                        metricId: { type: "string" },
                        timestamp: { type: "string", format: "date-time" },
                        value: { type: "number" },
                        labels: { type: "object" }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        responses: { "200": { description: "Data points ingested" } }
      }
    },
    "/traces": {
      parameters: scopingParameters,
      get: {
        tags: ["Traces"],
        summary: "List all traces",
        responses: { "200": { description: "List of traces" } }
      }
    },
    "/traces/{traceId}/spans": {
      parameters: scopingParameters,
      get: {
        tags: ["Traces"],
        summary: "Get spans for a specific trace",
        parameters: [
          {
            name: "traceId",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: { "200": { description: "List of spans for the trace" } }
      }
    },
    "/traces/query": {
      parameters: scopingParameters,
      post: {
        tags: ["Traces"],
        summary: "Query traces",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  serviceName: { type: "string" },
                  operationName: { type: "string" },
                  startTime: { type: "string", format: "date-time" },
                  endTime: { type: "string", format: "date-time" },
                  tags: { type: "object" },
                  minDurationMs: { type: "number" },
                  maxDurationMs: { type: "number" },
                  limit: { type: "integer" },
                  offset: { type: "integer" }
                }
              }
            }
          }
        },
        responses: { "200": { description: "Trace query results" } }
      }
    },
    "/traces/ingest": {
      parameters: scopingParameters,
      post: {
        tags: ["Traces"],
        summary: "Ingest trace spans",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["spans"],
                properties: {
                  spans: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["traceId", "spanId", "name", "startTime"],
                      properties: {
                        traceId: { type: "string" },
                        spanId: { type: "string" },
                        parentSpanId: { type: "string" },
                        name: { type: "string" },
                        serviceName: { type: "string" },
                        kind: { type: "string" },
                        status: { type: "string" },
                        startTime: { type: "string", format: "date-time" },
                        endTime: { type: "string", format: "date-time" },
                        attributes: { type: "object" },
                        events: { type: "array" }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        responses: { "200": { description: "Spans ingested" } }
      }
    },
    "/objects/streams": {
      parameters: scopingParameters,
      get: {
        tags: ["Objects"],
        summary: "List all object streams",
        responses: { "200": { description: "List of object streams" } }
      },
      post: {
        tags: ["Objects"],
        summary: "Create a new object stream",
        responses: { "201": { description: "Object stream created" } }
      }
    },
    "/objects/query": {
      parameters: scopingParameters,
      post: {
        tags: ["Objects"],
        summary: "Query object entries",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  streamIds: { type: "array", items: { type: "string" } },
                  startTime: { type: "string", format: "date-time" },
                  endTime: { type: "string", format: "date-time" },
                  contentType: { type: "string" },
                  minSize: { type: "number" },
                  maxSize: { type: "number" },
                  limit: { type: "integer" },
                  offset: { type: "integer" }
                }
              }
            }
          }
        },
        responses: { "200": { description: "Object query results" } }
      }
    },
    "/objects/ingest": {
      parameters: scopingParameters,
      post: {
        tags: ["Objects"],
        summary: "Register an object entry",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["streamId"],
                properties: {
                  streamId: { type: "string" },
                  filename: { type: "string" },
                  contentType: { type: "string" },
                  size: { type: "number" },
                  checksum: { type: "string" },
                  storageUrl: { type: "string" },
                  metadata: { type: "object" }
                }
              }
            }
          }
        },
        responses: { "200": { description: "Object registered" } }
      }
    },
    "/assistant/config": {
      get: {
        tags: ["Assistant"],
        summary: "Get assistant configuration",
        description: "Returns the current configuration status of the log assistant, including whether LLM is configured and available capabilities.",
        responses: {
          "200": {
            description: "Assistant configuration",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    configured: { type: "boolean", description: "Whether LLM backend is configured" },
                    capabilities: {
                      type: "array",
                      items: { type: "string" },
                      description: "Available assistant capabilities",
                      example: ["summarize", "analyze", "group", "investigate"]
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/assistant/summarize": {
      parameters: scopingParameters,
      post: {
        tags: ["Assistant"],
        summary: "Summarize logs with AI",
        description: "Analyzes log entries and generates a natural language summary with actionable insights. Uses LLM when configured, falls back to local analysis otherwise.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  logIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "Specific log IDs to analyze (legacy mode)"
                  },
                  startTime: { type: "string", format: "date-time", description: "Start of time range" },
                  endTime: { type: "string", format: "date-time", description: "End of time range" },
                  streamIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "Filter to specific log streams"
                  },
                  level: { type: "string", description: "Filter by log level (error, warn, info, debug)" },
                  search: { type: "string", description: "Full-text search query" },
                  limit: { type: "integer", default: 200, description: "Maximum logs to analyze (capped at 500)" }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Log summary with insights",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    summary: { type: "string", description: "Natural language summary" },
                    insights: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          text: { type: "string", description: "Insight description" },
                          severity: { type: "string", enum: ["critical", "warning", "info"] },
                          category: { type: "string", enum: ["error", "performance", "pattern", "anomaly", "health"] },
                          searchHint: { type: "string", description: "Query to find related logs" },
                          services: { type: "array", items: { type: "string" } },
                          count: { type: "integer" }
                        }
                      }
                    },
                    errorCount: { type: "integer" },
                    warnCount: { type: "integer" },
                    patterns: { type: "array", items: { type: "string" } }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/assistant/analyze": {
      parameters: scopingParameters,
      post: {
        tags: ["Assistant"],
        summary: "Analyze errors with AI",
        description: "Deep analysis of error logs to identify root causes and suggest remediation actions.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  logIds: { type: "array", items: { type: "string" } },
                  startTime: { type: "string", format: "date-time" },
                  endTime: { type: "string", format: "date-time" },
                  streamIds: { type: "array", items: { type: "string" } },
                  search: { type: "string" },
                  limit: { type: "integer", default: 200 }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Error analysis results",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    summary: { type: "string", description: "Error analysis summary" },
                    errorMessages: { type: "array", items: { type: "string" }, description: "Unique error messages found" },
                    possibleCauses: { type: "array", items: { type: "string" }, description: "Identified root causes" },
                    suggestedActions: { type: "array", items: { type: "string" }, description: "Recommended remediation steps" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/assistant/investigate": {
      parameters: scopingParameters,
      post: {
        tags: ["Assistant"],
        summary: "Investigate a specific insight",
        description: "Deep-dive investigation into a specific insight from the summary. Returns detailed explanation, related logs, and suggested actions.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["insight"],
                properties: {
                  insight: {
                    type: "object",
                    required: ["text"],
                    properties: {
                      id: { type: "string" },
                      text: { type: "string", description: "Insight text to investigate" },
                      severity: { type: "string", enum: ["critical", "warning", "info"] },
                      category: { type: "string", enum: ["error", "performance", "pattern", "anomaly", "health"] },
                      searchHint: { type: "string" },
                      services: { type: "array", items: { type: "string" } },
                      count: { type: "integer" }
                    }
                  },
                  startTime: { type: "string", format: "date-time" },
                  endTime: { type: "string", format: "date-time" },
                  streamIds: { type: "array", items: { type: "string" } },
                  level: { type: "string" },
                  search: { type: "string" },
                  limit: { type: "integer", default: 200 }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Investigation results",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    insight: { type: "string", description: "Original insight text" },
                    explanation: { type: "string", description: "Detailed explanation of what's happening" },
                    relatedLogs: { type: "array", items: { type: "object" }, description: "Related log entries" },
                    suggestedActions: { type: "array", items: { type: "string" }, description: "Specific actions to resolve or investigate further" }
                  }
                }
              }
            }
          },
          "400": { description: "Insight is required" }
        }
      }
    },
    "/assistant/group": {
      parameters: scopingParameters,
      post: {
        tags: ["Assistant"],
        summary: "Group related logs by pattern",
        description: "Groups log entries by detected message patterns, normalizing IDs, timestamps, and numbers. Useful for identifying repeated issues.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  logIds: { type: "array", items: { type: "string" } },
                  startTime: { type: "string", format: "date-time" },
                  endTime: { type: "string", format: "date-time" },
                  limit: { type: "integer", default: 500 }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Grouped log patterns",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    groups: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          name: { type: "string", description: "Shortened pattern name" },
                          pattern: { type: "string", description: "Normalized message pattern" },
                          count: { type: "integer", description: "Number of logs matching this pattern" },
                          logIds: { type: "array", items: { type: "string" }, description: "IDs of matching logs" }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      apiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key" }
    },
    parameters: {
      OrgIdHeader: {
        name: "X-Org-Id",
        in: "header",
        required: false,
        description: "Organization ID (required for multi-org users).",
        schema: { type: "string" }
      },
      ServiceIdHeader: {
        name: "X-Service-Id",
        in: "header",
        required: false,
        description: "Service identifier (defaults to LOGGING_DEFAULT_SERVICE_ID).",
        schema: { type: "string" }
      },
      EnvHeader: {
        name: "X-Env",
        in: "header",
        required: false,
        description: "Environment name (dev|stage|prod).",
        schema: { type: "string" }
      },
      DataClassHeader: {
        name: "X-Data-Class",
        in: "header",
        required: false,
        description: "Data classification (none|pii|phi|secret).",
        schema: {
          type: "string",
          enum: ["none", "pii", "phi", "secret"]
        }
      },
      PolicyRefHeader: {
        name: "X-Policy-Ref",
        in: "header",
        required: false,
        description: "Policy reference string (defaults to LOGGING_DEFAULT_POLICY_REF).",
        schema: { type: "string" }
      }
    }
  },
  security: [{ bearerAuth: [] }, { apiKeyAuth: [] }]
};
{
  const __autoDocumentedPaths = {
    "/auth/keys/{id}": {
      "delete": {
        "tags": [
          "Auth"
        ],
        "summary": "Delete keys",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "204": {
            "description": "Deleted"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/data-sources/{id}": {
      "delete": {
        "tags": [
          "Data Sources"
        ],
        "summary": "Delete data sources",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "204": {
            "description": "Deleted"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      },
      "get": {
        "tags": [
          "Data Sources"
        ],
        "summary": "Get data sources",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      },
      "patch": {
        "tags": [
          "Data Sources"
        ],
        "summary": "Update data sources",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/integrations/{id}": {
      "delete": {
        "tags": [
          "Integrations"
        ],
        "summary": "Delete integrations",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "204": {
            "description": "Deleted"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      },
      "get": {
        "tags": [
          "Integrations"
        ],
        "summary": "Get integrations",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      },
      "patch": {
        "tags": [
          "Integrations"
        ],
        "summary": "Update integrations",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/logs/streams/{id}": {
      "delete": {
        "tags": [
          "Logs"
        ],
        "summary": "Delete streams",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "204": {
            "description": "Deleted"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      },
      "get": {
        "tags": [
          "Logs"
        ],
        "summary": "Get streams",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      },
      "patch": {
        "tags": [
          "Logs"
        ],
        "summary": "Update streams",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/metrics/{id}": {
      "delete": {
        "tags": [
          "Metrics"
        ],
        "summary": "Delete metrics",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "204": {
            "description": "Deleted"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      },
      "get": {
        "tags": [
          "Metrics"
        ],
        "summary": "Get metrics",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      },
      "patch": {
        "tags": [
          "Metrics"
        ],
        "summary": "Update metrics",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/objects/streams/{id}": {
      "delete": {
        "tags": [
          "Objects"
        ],
        "summary": "Delete streams",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "204": {
            "description": "Deleted"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      },
      "get": {
        "tags": [
          "Objects"
        ],
        "summary": "Get streams",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      },
      "patch": {
        "tags": [
          "Objects"
        ],
        "summary": "Update streams",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/auth/config": {
      "get": {
        "tags": [
          "Auth"
        ],
        "summary": "Get config",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/keys": {
      "get": {
        "tags": [
          "Auth"
        ],
        "summary": "List keys",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      },
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "Create keys",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/me": {
      "get": {
        "tags": [
          "Auth"
        ],
        "summary": "Get me",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/session": {
      "get": {
        "tags": [
          "Auth"
        ],
        "summary": "Get session",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/bootstrap/service": {
      "get": {
        "tags": [
          "Bootstrap"
        ],
        "summary": "Get service",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/data-sources": {
      "get": {
        "tags": [
          "Data Sources"
        ],
        "summary": "List data sources",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      },
      "post": {
        "tags": [
          "Data Sources"
        ],
        "summary": "Create data sources",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/integrations": {
      "get": {
        "tags": [
          "Integrations"
        ],
        "summary": "List integrations",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      },
      "post": {
        "tags": [
          "Integrations"
        ],
        "summary": "Create integrations",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/logs/stream": {
      "get": {
        "tags": [
          "Logs"
        ],
        "summary": "Get stream",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/stats": {
      "get": {
        "tags": [
          "Stats"
        ],
        "summary": "List stats",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/stats/ingest-rate": {
      "get": {
        "tags": [
          "Stats"
        ],
        "summary": "Get ingest rate",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/stats/query-latency": {
      "get": {
        "tags": [
          "Stats"
        ],
        "summary": "Get query latency",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/traces/{id}": {
      "get": {
        "tags": [
          "Traces"
        ],
        "summary": "Get traces",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/auth/login": {
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "Login auth login",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/auth/logout": {
      "post": {
        "tags": [
          "Auth"
        ],
        "summary": "Logout auth logout",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/data-sources/{id}/sync": {
      "post": {
        "tags": [
          "Data Sources"
        ],
        "summary": "Sync data sources sync",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/ingest": {
      "post": {
        "tags": [
          "Ingest"
        ],
        "summary": "Create ingest",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/integrations/{id}/test": {
      "post": {
        "tags": [
          "Integrations"
        ],
        "summary": "Test integrations test",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Not found"
          }
        }
      }
    },
    "/query": {
      "post": {
        "tags": [
          "Query"
        ],
        "summary": "Query query",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "additionalProperties": true
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "400": {
            "description": "Invalid input"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    }
  };
  const __paths = openApiSpec.paths;
  for (const [key, ops] of Object.entries(__autoDocumentedPaths)) {
    __paths[key] = { ...__paths[key] || {}, ...ops };
  }
}

// ../../logging/server/src/doc-routes.ts
function setupDocRoutes(app) {
  registerDocRoutes(app, {
    spec: openApiSpec,
    docsRoot: "docs",
    includeWellKnown: false
  });
  app.get("/docs", (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Symbia Logging Service - API Documentation</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 2rem;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      padding: 3rem;
    }
    h1 { color: #667eea; margin-bottom: 0.5rem; font-size: 2.5rem; }
    .tagline { color: #888; margin-bottom: 2rem; font-size: 1.1rem; }
    h2 { color: #764ba2; margin-top: 2rem; margin-bottom: 1rem; border-bottom: 2px solid #f0f0f0; padding-bottom: 0.5rem; }
    ul { list-style: none; }
    li { margin: 1rem 0; }
    a {
      color: #667eea;
      text-decoration: none;
      font-weight: 600;
      transition: all 0.3s ease;
      padding: 0.5rem 0;
      display: inline-block;
    }
    a:hover { color: #764ba2; transform: translateX(5px); }
    .desc { color: #888; font-size: 0.9rem; margin-left: 0.5rem; font-weight: normal; }
    .feature-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin: 1.5rem 0;
    }
    .feature {
      background: #f8f9fa;
      padding: 1rem;
      border-radius: 8px;
      text-align: center;
    }
    .feature h3 { color: #667eea; font-size: 1rem; margin-bottom: 0.5rem; }
    .feature p { color: #666; font-size: 0.85rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>\u{1F4CA} Symbia Logging Service</h1>
    <p class="tagline">Comprehensive observability platform for logs, metrics, traces, and objects</p>

    <div class="feature-grid">
      <div class="feature">
        <h3>\u{1F4DD} Logs</h3>
        <p>Structured log management</p>
      </div>
      <div class="feature">
        <h3>\u{1F4C8} Metrics</h3>
        <p>Time-series data points</p>
      </div>
      <div class="feature">
        <h3>\u{1F50D} Traces</h3>
        <p>Distributed tracing</p>
      </div>
      <div class="feature">
        <h3>\u{1F4E6} Objects</h3>
        <p>Binary object storage</p>
      </div>
    </div>

    <h2>\u{1F4DA} API Documentation</h2>
    <ul>
      <li><a href="/docs/llms.txt">llms.txt</a> <span class="desc">- Quick reference for LLMs</span></li>
      <li><a href="/docs/llms-full.txt">llms-full.txt</a> <span class="desc">- Complete API documentation</span></li>
      <li><a href="/docs/openapi.json">openapi.json</a> <span class="desc">- OpenAPI 3.0 specification</span></li>
    </ul>

    <h2>\u{1F510} Authentication</h2>
    <ul>
      <li><strong>Bearer Token:</strong> <code>Authorization: Bearer &lt;token&gt;</code></li>
      <li><strong>API Key:</strong> <code>X-API-Key: &lt;key&gt;</code></li>
    </ul>

    <h2>\u{1F4CD} Required Headers</h2>
    <ul>
      <li><code>X-Org-Id</code> - Organization identifier</li>
      <li><code>X-Service-Id</code> - Service identifier</li>
      <li><code>X-Env</code> - Environment (dev|stage|prod)</li>
      <li><code>X-Data-Class</code> - Data classification</li>
      <li><code>X-Policy-Ref</code> - Policy reference</li>
    </ul>
  </div>
</body>
</html>
    `);
  });
}

// ../../logging/server/src/log-assistant.ts
import { createTelemetryClient } from "@symbia/logging-client";

// ../../logging/server/src/integrations-client.ts
import { resolveServiceUrl as resolveServiceUrl2, ServiceId as ServiceId2 } from "@symbia/sys";
var INTEGRATIONS_SERVICE_URL = resolveServiceUrl2(ServiceId2.INTEGRATIONS);
async function parseJsonResponse(response) {
  return response.json();
}
async function executeChat(authToken, provider, messages, options) {
  const url = `${INTEGRATIONS_SERVICE_URL}/api/integrations/execute`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
    "X-Service-Id": "logging"
  };
  if (options?.orgId) {
    headers["X-Org-Id"] = options.orgId;
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        provider,
        operation: "chat.completions",
        params: {
          messages,
          model: options?.model,
          temperature: options?.temperature,
          maxTokens: options?.maxTokens
        }
      })
    });
    const result = await parseJsonResponse(response);
    if (!response.ok && !result.requestId) {
      return {
        success: false,
        error: result.error || result.message || `HTTP ${response.status}`,
        requestId: result.requestId || "unknown",
        durationMs: 0
      };
    }
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to reach Integrations service: ${errorMessage}`,
      requestId: "network_error",
      durationMs: 0
    };
  }
}
async function getIntegrationsStatus() {
  try {
    const response = await fetch(`${INTEGRATIONS_SERVICE_URL}/api/integrations/status`, {
      method: "GET",
      headers: {
        "X-Service-Id": "logging"
      }
    });
    if (!response.ok) {
      return { available: false, providers: [] };
    }
    const data = await parseJsonResponse(response);
    return {
      available: true,
      providers: data.providers || []
    };
  } catch {
    return { available: false, providers: [] };
  }
}

// ../../logging/server/src/log-assistant.ts
var telemetry = null;
try {
  telemetry = createTelemetryClient({
    serviceId: "log-assistant",
    endpoint: process.env.TELEMETRY_ENDPOINT
  });
} catch {
}
var VERBOSE_TELEMETRY = process.env.LOG_ASSISTANT_VERBOSE === "true" || process.env.NODE_ENV === "development";
function logVerbose(category, message, data) {
  if (VERBOSE_TELEMETRY) {
    const timestamp2 = (/* @__PURE__ */ new Date()).toISOString();
    console.log(`[${timestamp2}] [LogAssistant:${category}] ${message}`, data ? JSON.stringify(data) : "");
    telemetry?.event(`assistant.${category.toLowerCase()}`, message, data || {}, "debug");
  }
}
var DEFAULT_CONFIG = {
  provider: "openai",
  model: "gpt-4o-mini",
  temperature: 0.3,
  maxTokens: 2e3
};
var LogAssistantService = class {
  config;
  integrationsAvailable = null;
  constructor() {
    this.config = {
      provider: process.env.LLM_PROVIDER || DEFAULT_CONFIG.provider,
      model: process.env.LLM_MODEL || DEFAULT_CONFIG.model,
      temperature: parseFloat(process.env.LLM_TEMPERATURE || "") || DEFAULT_CONFIG.temperature,
      maxTokens: parseInt(process.env.LLM_MAX_TOKENS || "") || DEFAULT_CONFIG.maxTokens
    };
    if (process.env.NODE_ENV === "development") {
      console.log(`[LogAssistant] Initialized (provider: ${this.config.provider}, model: ${this.config.model})`);
      console.log(`[LogAssistant] LLM calls will be routed through Integrations service`);
    }
  }
  /**
   * Check if the Integrations service is available (cached for performance)
   */
  async isConfigured() {
    if (this.integrationsAvailable !== null) {
      return this.integrationsAvailable;
    }
    try {
      const status = await getIntegrationsStatus();
      this.integrationsAvailable = status.available && status.providers.some((p) => p.configured);
      if (process.env.NODE_ENV === "development") {
        console.log(`[LogAssistant] Integrations service: ${this.integrationsAvailable ? "available" : "unavailable"}`);
      }
      return this.integrationsAvailable;
    } catch {
      this.integrationsAvailable = false;
      return false;
    }
  }
  /**
   * Reset the cached availability check (useful after configuration changes)
   */
  resetAvailabilityCache() {
    this.integrationsAvailable = null;
  }
  async summarizeLogs(entries, authToken) {
    const startTime = Date.now();
    const requestId = `summarize-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    logVerbose("SUMMARIZE", `Starting summarization`, {
      requestId,
      entryCount: entries.length,
      hasAuthToken: !!authToken,
      levels: {
        error: entries.filter((e) => e.level === "error" || e.level === "fatal").length,
        warn: entries.filter((e) => e.level === "warn").length,
        info: entries.filter((e) => e.level === "info").length
      }
    });
    const localSummary = this.generateLocalSummary(entries);
    logVerbose("SUMMARIZE", `Local analysis complete`, {
      requestId,
      localErrorCount: localSummary.errorCount,
      localWarnCount: localSummary.warnCount,
      localInsightCount: localSummary.insights.length,
      localPatternCount: localSummary.patterns?.length || 0
    });
    if (!authToken) {
      logVerbose("SUMMARIZE", `Returning local-only summary (no auth token)`, {
        requestId,
        durationMs: Date.now() - startTime
      });
      telemetry?.metric("assistant.summarize.duration", Date.now() - startTime, { mode: "local" });
      return localSummary;
    }
    try {
      const prompt = this.buildSummarizePrompt(entries);
      logVerbose("SUMMARIZE", `Built LLM prompt`, {
        requestId,
        promptLength: prompt.length,
        promptPreview: prompt.substring(0, 200) + "..."
      });
      const response = await this.callLLM(prompt, "summarize", authToken);
      const llmSummary = this.parseSummaryResponse(response);
      logVerbose("SUMMARIZE", `LLM response parsed`, {
        requestId,
        hasSummary: !!llmSummary.summary,
        llmInsightCount: llmSummary.insights?.length || 0,
        llmPatternCount: llmSummary.patterns?.length || 0
      });
      const insights = llmSummary.insights && llmSummary.insights.length > 0 ? llmSummary.insights : localSummary.insights;
      const result = {
        ...localSummary,
        summary: llmSummary.summary || localSummary.summary,
        insights: insights.slice(0, 5),
        patterns: llmSummary.patterns || localSummary.patterns
      };
      logVerbose("SUMMARIZE", `Summarization complete`, {
        requestId,
        durationMs: Date.now() - startTime,
        finalInsightCount: result.insights.length,
        usedLLMInsights: llmSummary.insights && llmSummary.insights.length > 0
      });
      telemetry?.metric("assistant.summarize.duration", Date.now() - startTime, { mode: "llm" });
      telemetry?.metric("assistant.summarize.insights", result.insights.length, {});
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logVerbose("SUMMARIZE", `LLM summarization failed, using local analysis`, {
        requestId,
        error: errorMessage,
        durationMs: Date.now() - startTime
      });
      telemetry?.event("assistant.summarize.fallback", "LLM failed, using local", { requestId, error: errorMessage }, "warn");
      telemetry?.metric("assistant.summarize.duration", Date.now() - startTime, { mode: "fallback" });
      return localSummary;
    }
  }
  async analyzeErrors(entries, authToken) {
    const startTime = Date.now();
    const requestId = `analyze-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const errorEntries = entries.filter(
      (e) => e.level === "error" || e.level === "fatal"
    );
    logVerbose("ANALYZE", `Starting error analysis`, {
      requestId,
      totalEntries: entries.length,
      errorCount: errorEntries.length,
      hasAuthToken: !!authToken
    });
    if (errorEntries.length === 0) {
      logVerbose("ANALYZE", `No errors to analyze`, { requestId, durationMs: Date.now() - startTime });
      telemetry?.metric("assistant.analyze.duration", Date.now() - startTime, { result: "no_errors" });
      return {
        summary: "No errors found in the provided logs.",
        errorMessages: [],
        possibleCauses: [],
        suggestedActions: []
      };
    }
    const errorMessages = Array.from(new Set(errorEntries.map((e) => e.message))).slice(0, 10);
    const errorsByService = /* @__PURE__ */ new Map();
    errorEntries.forEach((e) => {
      const svc = e.serviceId || "unknown";
      errorsByService.set(svc, (errorsByService.get(svc) || 0) + 1);
    });
    logVerbose("ANALYZE", `Error distribution by service`, {
      requestId,
      uniqueMessages: errorMessages.length,
      serviceBreakdown: Object.fromEntries(errorsByService)
    });
    if (!authToken) {
      logVerbose("ANALYZE", `Returning local-only analysis (no auth token)`, {
        requestId,
        durationMs: Date.now() - startTime
      });
      telemetry?.metric("assistant.analyze.duration", Date.now() - startTime, { mode: "local" });
      return {
        summary: `Found ${errorEntries.length} error(s) in the logs.`,
        errorMessages,
        possibleCauses: ["Unable to determine causes without AI analysis."],
        suggestedActions: ["Review error messages manually.", "Check system logs for more context."]
      };
    }
    try {
      const prompt = this.buildErrorAnalysisPrompt(errorEntries);
      logVerbose("ANALYZE", `Built error analysis prompt`, {
        requestId,
        promptLength: prompt.length
      });
      const response = await this.callLLM(prompt, "analyzeErrors", authToken);
      const result = this.parseErrorAnalysisResponse(response, errorMessages);
      logVerbose("ANALYZE", `Error analysis complete`, {
        requestId,
        durationMs: Date.now() - startTime,
        possibleCausesCount: result.possibleCauses.length,
        suggestedActionsCount: result.suggestedActions.length
      });
      telemetry?.metric("assistant.analyze.duration", Date.now() - startTime, { mode: "llm" });
      telemetry?.metric("assistant.analyze.errors", errorEntries.length, {});
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logVerbose("ANALYZE", `LLM error analysis failed`, {
        requestId,
        error: errorMessage,
        durationMs: Date.now() - startTime
      });
      telemetry?.event("assistant.analyze.fallback", "LLM failed, using local", { requestId, error: errorMessage }, "warn");
      telemetry?.metric("assistant.analyze.duration", Date.now() - startTime, { mode: "fallback" });
      return {
        summary: `Found ${errorEntries.length} error(s) in the logs.`,
        errorMessages,
        possibleCauses: ["LLM analysis unavailable."],
        suggestedActions: ["Review error messages manually."]
      };
    }
  }
  /**
   * Investigate a specific insight - provides deeper analysis and relevant log excerpts
   */
  async investigate(insight, entries, allEntries, authToken) {
    const startTime = Date.now();
    const requestId = `investigate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    logVerbose("INVESTIGATE", `Starting investigation`, {
      requestId,
      insightId: insight.id,
      insightText: insight.text,
      insightSeverity: insight.severity,
      insightCategory: insight.category,
      insightServices: insight.services,
      searchHint: insight.searchHint,
      entriesCount: entries.length,
      allEntriesCount: allEntries.length,
      hasAuthToken: !!authToken
    });
    let relatedLogs = [];
    let matchStrategy = "unknown";
    if (insight.searchHint) {
      matchStrategy = "searchHint";
      const hint = insight.searchHint.toLowerCase();
      relatedLogs = allEntries.filter(
        (e) => e.message.toLowerCase().includes(hint) || e.serviceId && insight.services?.includes(e.serviceId)
      );
      logVerbose("INVESTIGATE", `Matched by searchHint`, {
        requestId,
        hint,
        matchCount: relatedLogs.length
      });
    } else if (insight.services && insight.services.length > 0) {
      matchStrategy = "services";
      relatedLogs = allEntries.filter((e) => insight.services.includes(e.serviceId || ""));
      logVerbose("INVESTIGATE", `Matched by services`, {
        requestId,
        services: insight.services,
        matchCount: relatedLogs.length
      });
    } else {
      matchStrategy = "category";
      if (insight.category === "error") {
        relatedLogs = allEntries.filter((e) => e.level === "error" || e.level === "fatal");
      } else {
        relatedLogs = entries.slice(0, 20);
      }
      logVerbose("INVESTIGATE", `Matched by category fallback`, {
        requestId,
        category: insight.category,
        matchCount: relatedLogs.length
      });
    }
    const originalCount = relatedLogs.length;
    relatedLogs = relatedLogs.slice(0, 15);
    logVerbose("INVESTIGATE", `Related logs selected`, {
      requestId,
      matchStrategy,
      originalMatchCount: originalCount,
      selectedCount: relatedLogs.length,
      truncated: originalCount > 15
    });
    if (!authToken) {
      logVerbose("INVESTIGATE", `Returning local-only result (no auth token)`, {
        requestId,
        durationMs: Date.now() - startTime
      });
      telemetry?.metric("assistant.investigate.duration", Date.now() - startTime, { mode: "local" });
      return {
        insight: insight.text,
        explanation: `Found ${relatedLogs.length} related log entries.`,
        relatedLogs,
        suggestedActions: ["Review the log entries for more details."]
      };
    }
    try {
      const prompt = this.buildInvestigatePrompt(insight, relatedLogs);
      logVerbose("INVESTIGATE", `Built investigation prompt`, {
        requestId,
        promptLength: prompt.length
      });
      const response = await this.callLLM(prompt, "investigate", authToken);
      const result = this.parseInvestigateResponse(response, insight, relatedLogs);
      logVerbose("INVESTIGATE", `Investigation complete`, {
        requestId,
        durationMs: Date.now() - startTime,
        hasExplanation: !!result.explanation,
        suggestedActionsCount: result.suggestedActions?.length || 0,
        relatedLogsReturned: result.relatedLogs.length
      });
      telemetry?.metric("assistant.investigate.duration", Date.now() - startTime, { mode: "llm" });
      telemetry?.event("assistant.investigate.complete", "Investigation completed", {
        requestId,
        insightId: insight.id,
        insightCategory: insight.category,
        matchStrategy,
        relatedLogCount: relatedLogs.length
      }, "info");
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logVerbose("INVESTIGATE", `LLM investigation failed`, {
        requestId,
        error: errorMessage,
        durationMs: Date.now() - startTime
      });
      telemetry?.event("assistant.investigate.fallback", "LLM failed, using local", { requestId, error: errorMessage }, "warn");
      telemetry?.metric("assistant.investigate.duration", Date.now() - startTime, { mode: "fallback" });
      return {
        insight: insight.text,
        explanation: `Found ${relatedLogs.length} related log entries. LLM analysis unavailable.`,
        relatedLogs,
        suggestedActions: ["Review the log entries manually."]
      };
    }
  }
  buildInvestigatePrompt(insight, logs) {
    const formattedLogs = this.formatLogsForLLM(logs, 15);
    return `Investigate this observation from log analysis:

INSIGHT: "${insight.text}"
Category: ${insight.category}
Severity: ${insight.severity}
${insight.services ? `Services: ${insight.services.join(", ")}` : ""}

RELATED LOGS:
${formattedLogs}

Provide a deeper explanation of what's happening and why. Be specific.

Respond with JSON:
{
  "explanation": "2-4 sentences explaining what's happening, the likely cause, and impact",
  "suggestedActions": ["specific action 1", "specific action 2"]
}

Focus on:
- Root cause if identifiable
- Impact on the system
- Specific next steps to resolve or investigate further`;
  }
  parseInvestigateResponse(response, insight, relatedLogs) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          insight: insight.text,
          explanation: parsed.explanation || "Analysis complete.",
          relatedLogs,
          suggestedActions: parsed.suggestedActions || []
        };
      }
    } catch {
    }
    return {
      insight: insight.text,
      explanation: "Unable to parse LLM response.",
      relatedLogs,
      suggestedActions: ["Review the log entries manually."]
    };
  }
  async groupRelatedLogs(entries) {
    const startTime = Date.now();
    const requestId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    logVerbose("GROUP", `Starting log grouping`, {
      requestId,
      entryCount: entries.length
    });
    const groups = /* @__PURE__ */ new Map();
    entries.forEach((entry) => {
      const pattern = entry.message.replace(/[0-9a-f]{8,}/gi, "[ID]").replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, "[TIMESTAMP]").replace(/\d+\.\d+\.\d+\.\d+/g, "[IP]").replace(/\d+/g, "[N]").substring(0, 100);
      const existing = groups.get(pattern);
      if (existing) {
        existing.count++;
        existing.logIds.push(entry.id);
      } else {
        groups.set(pattern, {
          id: `group-${groups.size + 1}`,
          name: pattern.substring(0, 50),
          pattern,
          count: 1,
          logIds: [entry.id]
        });
      }
    });
    const result = Array.from(groups.values()).filter((g) => g.count > 1).sort((a, b) => b.count - a.count).slice(0, 20);
    logVerbose("GROUP", `Log grouping complete`, {
      requestId,
      durationMs: Date.now() - startTime,
      totalPatterns: groups.size,
      groupsWithMultiple: result.length,
      topGroupCount: result[0]?.count || 0,
      topGroupPattern: result[0]?.pattern.substring(0, 50) || "none"
    });
    telemetry?.metric("assistant.group.duration", Date.now() - startTime, {});
    telemetry?.metric("assistant.group.patterns", result.length, {});
    return result;
  }
  generateLocalSummary(entries) {
    if (entries.length === 0) {
      return {
        summary: "No logs to analyze in the current time range.",
        insights: [],
        errorCount: 0,
        warnCount: 0
      };
    }
    const errorCount = entries.filter((l) => l.level === "error" || l.level === "fatal").length;
    const warnCount = entries.filter((l) => l.level === "warn").length;
    const insights = [];
    if (errorCount > 0) {
      const errorsByService = /* @__PURE__ */ new Map();
      entries.filter((l) => l.level === "error" || l.level === "fatal").forEach((e) => {
        const svc = e.serviceId || "unknown";
        if (!errorsByService.has(svc)) errorsByService.set(svc, []);
        errorsByService.get(svc).push(e);
      });
      Array.from(errorsByService.entries()).forEach(([service, errors]) => {
        const patterns = /* @__PURE__ */ new Map();
        errors.forEach((e) => {
          const normalized = e.message.replace(/[0-9a-f]{8,}/gi, "*").replace(/\d+/g, "#").substring(0, 60);
          const existing = patterns.get(normalized);
          if (existing) {
            existing.count++;
          } else {
            patterns.set(normalized, { count: 1, sample: e.message.substring(0, 80) });
          }
        });
        const topPattern = Array.from(patterns.entries()).sort((a, b) => b[1].count - a[1].count)[0];
        if (topPattern) {
          insights.push({
            id: `error-${service}-${insights.length}`,
            text: `${service}: ${topPattern[1].sample}${topPattern[1].count > 1 ? ` (${topPattern[1].count}x)` : ""}`,
            severity: "critical",
            category: "error",
            searchHint: topPattern[1].sample.split(" ").slice(0, 3).join(" "),
            services: [service],
            count: topPattern[1].count
          });
        }
      });
    }
    const messagePatterns = /* @__PURE__ */ new Map();
    entries.forEach((log) => {
      const simplified = log.message.replace(/[0-9a-f]{8,}/gi, "[ID]").replace(/\d{4}-\d{2}-\d{2}/g, "[DATE]").replace(/\d+\.\d+\.\d+\.\d+/g, "[IP]").replace(/\d+/g, "[N]").substring(0, 50);
      const existing = messagePatterns.get(simplified);
      if (existing) {
        existing.count++;
        if (log.serviceId) existing.services.add(log.serviceId);
      } else {
        messagePatterns.set(simplified, {
          count: 1,
          sample: log.message.substring(0, 60),
          services: new Set(log.serviceId ? [log.serviceId] : [])
        });
      }
    });
    const repeatedPatterns = Array.from(messagePatterns.entries()).filter(([, data]) => data.count > 5).sort((a, b) => b[1].count - a[1].count).slice(0, 3);
    repeatedPatterns.forEach(([, data]) => {
      if (insights.length < 5) {
        insights.push({
          id: `pattern-${insights.length}`,
          text: `${data.count}x: "${data.sample}"`,
          severity: data.count > 20 ? "warning" : "info",
          category: "pattern",
          searchHint: data.sample.split(" ").slice(0, 2).join(" "),
          services: Array.from(data.services),
          count: data.count
        });
      }
    });
    let summary = `Analyzed ${entries.length} log entries. `;
    if (errorCount === 0 && warnCount === 0) {
      summary += "All systems appear healthy with no errors or warnings.";
    } else if (errorCount > 0) {
      summary += `Found ${errorCount} error${errorCount > 1 ? "s" : ""} that may need attention.`;
    } else if (warnCount > 0) {
      summary += `Found ${warnCount} warning${warnCount > 1 ? "s" : ""} to review.`;
    }
    return {
      summary,
      insights: insights.slice(0, 5),
      errorCount,
      warnCount,
      patterns: repeatedPatterns.map(([pattern]) => pattern)
    };
  }
  /**
   * Format logs compactly for LLM context.
   * Uses a condensed format to maximize information per token:
   * - Relative timestamps (seconds from first entry)
   * - Single-char level codes: E=error, W=warn, I=info, D=debug
   * - Grouped by service when available
   * - Deduplicated similar messages with counts
   */
  formatLogsForLLM(entries, maxEntries = 50) {
    if (entries.length === 0) return "(no logs)";
    const sample = entries.slice(0, maxEntries);
    const baseTime = new Date(sample[0].timestamp).getTime();
    const levelCode = {
      error: "E",
      fatal: "E",
      warn: "W",
      info: "I",
      debug: "D",
      trace: "D"
    };
    const byService = /* @__PURE__ */ new Map();
    sample.forEach((entry) => {
      const meta = entry.metadata;
      const svc = entry.serviceId || meta?.serviceId || "unknown";
      if (!byService.has(svc)) byService.set(svc, []);
      byService.get(svc).push(entry);
    });
    const lines = [];
    Array.from(byService.entries()).forEach(([service, logs]) => {
      const msgCounts = /* @__PURE__ */ new Map();
      logs.forEach((log) => {
        const normalized = log.message.replace(/[0-9a-f]{8,}/gi, "*").replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, "*").replace(/\d+\.\d+\.\d+\.\d+/g, "*").replace(/\d+/g, "#").substring(0, 100);
        const existing = msgCounts.get(normalized);
        if (existing) {
          existing.count++;
        } else {
          msgCounts.set(normalized, { count: 1, first: log });
        }
      });
      if (byService.size > 1) {
        lines.push(`[${service}]`);
      }
      Array.from(msgCounts.values()).forEach(({ count: count2, first }) => {
        const relTime = ((new Date(first.timestamp).getTime() - baseTime) / 1e3).toFixed(1);
        const lvl = levelCode[first.level] || "?";
        const msg = first.message.substring(0, 120);
        const countSuffix = count2 > 1 ? ` (x${count2})` : "";
        lines.push(`+${relTime}s ${lvl} ${msg}${countSuffix}`);
      });
    });
    return lines.join("\n");
  }
  /**
   * Build context summary for the LLM (stats that don't need to be in logs)
   */
  buildLogContext(entries) {
    const levels = { error: 0, warn: 0, info: 0, debug: 0 };
    const services = /* @__PURE__ */ new Set();
    entries.forEach((e) => {
      if (e.level in levels) levels[e.level]++;
      if (e.serviceId) services.add(e.serviceId);
    });
    const timeRange = entries.length > 1 ? `${new Date(entries[0].timestamp).toISOString()} to ${new Date(entries[entries.length - 1].timestamp).toISOString()}` : "single point";
    return `Count: ${entries.length} | Errors: ${levels.error} | Warns: ${levels.warn} | Services: ${Array.from(services).join(", ") || "unknown"} | Range: ${timeRange}`;
  }
  buildSummarizePrompt(entries) {
    const context = this.buildLogContext(entries);
    const formattedLogs = this.formatLogsForLLM(entries, 75);
    return `Analyze these application logs and surface specific, actionable insights.

CONTEXT: ${context}

LOGS (format: +seconds level message):
${formattedLogs}

Generate insights that are SPECIFIC and CLICKABLE - each should make someone want to investigate further.

BAD insights (too generic):
- "2 errors detected"
- "High warning volume"
- "Multiple services logging"

GOOD insights (specific, intriguing):
- "auth-service: Token validation failing repeatedly for session xyz"
- "catalog-service response time spiked 3x starting at 14:22"
- "47 retry attempts from messaging-service to identity-service"
- "Unusual 401 responses on /api/users endpoint (normally 0, now 12)"

Respond with JSON:
{
  "summary": "1-2 sentence executive summary",
  "insights": [
    {
      "text": "Specific, actionable observation that invites investigation",
      "severity": "critical|warning|info",
      "category": "error|performance|pattern|anomaly|health",
      "searchHint": "search term to find related logs",
      "services": ["service-name"],
      "count": 5
    }
  ]
}

Rules:
- Include service names when relevant
- Include counts when meaningful
- Include timestamps or time references when notable
- Make each insight sound like something worth clicking
- Prioritize unusual or unexpected findings over routine observations
- Maximum 5 insights, fewer if logs are unremarkable`;
  }
  buildErrorAnalysisPrompt(entries) {
    const errorDetails = entries.slice(0, 25).map((e) => {
      const relMeta = {};
      const meta = e.metadata;
      if (meta) {
        const keep = ["status", "statusCode", "error", "code", "path", "method", "stack", "cause"];
        keep.forEach((k) => {
          if (k in meta) relMeta[k] = meta[k];
        });
      }
      return {
        t: new Date(e.timestamp).toISOString().slice(11, 23),
        // HH:mm:ss.SSS
        svc: e.serviceId || meta?.serviceId,
        msg: e.message.substring(0, 200),
        ...Object.keys(relMeta).length > 0 ? { meta: relMeta } : {}
      };
    });
    const errorGroups = /* @__PURE__ */ new Map();
    entries.forEach((e) => {
      const pattern = e.message.replace(/[0-9a-f]{8,}/gi, "*").replace(/\d+/g, "#").substring(0, 60);
      errorGroups.set(pattern, (errorGroups.get(pattern) || 0) + 1);
    });
    const topErrors = Array.from(errorGroups.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([pattern, count2]) => `${count2}x: ${pattern}`).join("\n");
    return `Diagnose these errors.

ERROR SUMMARY (${entries.length} total):
${topErrors}

RECENT ERRORS:
${JSON.stringify(errorDetails)}

Respond with JSON:
{"summary":"1-2 sentences","possibleCauses":["cause1","cause2"],"suggestedActions":["action1","action2"]}

Be specific and actionable.`;
  }
  /**
   * Call LLM through the Integrations service
   * @param prompt - The prompt to send to the LLM
   * @param operation - Operation name for logging
   * @param authToken - User's auth token for Integrations service
   */
  async callLLM(prompt, operation, authToken) {
    const startTime = Date.now();
    const requestId = `llm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const requestLog = {
      requestId,
      operation,
      provider: this.config.provider,
      model: this.config.model,
      promptLength: prompt.length,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens
    };
    console.log(`[LLM] Request ${requestId}:`, JSON.stringify(requestLog));
    telemetry?.event("llm.request", `LLM ${operation} request via Integrations`, requestLog, "debug");
    try {
      const messages = [
        {
          role: "system",
          content: "You are a log analysis assistant. Analyze logs and provide structured insights. Always respond with valid JSON."
        },
        { role: "user", content: prompt }
      ];
      const result = await executeChat(
        authToken,
        this.config.provider,
        messages,
        {
          model: this.config.model,
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens
        }
      );
      const latencyMs = Date.now() - startTime;
      if (!result.success) {
        throw new Error(result.error || "Integrations service request failed");
      }
      const responseContent = result.data && "content" in result.data ? result.data.content : "";
      const usage = result.data?.usage;
      const responseLog = {
        provider: this.config.provider,
        model: result.data?.model || this.config.model,
        promptTokens: usage?.promptTokens,
        completionTokens: usage?.completionTokens,
        totalTokens: usage?.totalTokens,
        latencyMs,
        success: true
      };
      console.log(`[LLM] Response ${requestId}:`, JSON.stringify({
        ...responseLog,
        responseLength: responseContent.length,
        responsePreview: responseContent.substring(0, 200),
        integrationsRequestId: result.requestId
      }));
      telemetry?.event("llm.response", `LLM ${operation} completed via Integrations`, {
        requestId,
        integrationsRequestId: result.requestId,
        ...responseLog,
        responseLength: responseContent.length
      }, "info");
      telemetry?.metric("llm.latency", latencyMs, { provider: this.config.provider, model: this.config.model, operation });
      if (usage?.totalTokens) {
        telemetry?.metric("llm.tokens", usage.totalTokens, { provider: this.config.provider, model: this.config.model, operation });
      }
      return responseContent;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorLog = {
        provider: this.config.provider,
        model: this.config.model,
        latencyMs,
        success: false,
        error: errorMessage
      };
      console.error(`[LLM] Error ${requestId}:`, JSON.stringify(errorLog));
      telemetry?.event("llm.error", `LLM ${operation} failed`, { requestId, ...errorLog }, "error");
      throw error;
    }
  }
  parseSummaryResponse(response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.insights && Array.isArray(parsed.insights)) {
          parsed.insights = parsed.insights.map((insight, idx) => {
            if (typeof insight === "string") {
              return {
                id: `llm-${idx}`,
                text: insight,
                severity: "info",
                category: "health"
              };
            }
            return {
              id: insight.id || `llm-${idx}`,
              text: insight.text,
              severity: insight.severity || "info",
              category: insight.category || "health",
              searchHint: insight.searchHint,
              services: insight.services,
              count: insight.count
            };
          });
        }
        return parsed;
      }
      return {};
    } catch {
      return {};
    }
  }
  parseErrorAnalysisResponse(response, fallbackMessages) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || "Error analysis completed.",
          errorMessages: fallbackMessages,
          possibleCauses: parsed.possibleCauses || [],
          suggestedActions: parsed.suggestedActions || []
        };
      }
    } catch {
    }
    return {
      summary: "Error analysis parsing failed.",
      errorMessages: fallbackMessages,
      possibleCauses: [],
      suggestedActions: ["Review error messages manually."]
    };
  }
};
var logAssistant = new LogAssistantService();

// ../../logging/server/src/log-broadcaster.ts
import { EventEmitter } from "events";
var LogBroadcaster = class extends EventEmitter {
  clients = /* @__PURE__ */ new Map();
  clientIdCounter = 0;
  /**
   * Register an SSE client to receive log broadcasts
   */
  registerClient(res, orgId, filters = {}) {
    const clientId = `sse_client_${++this.clientIdCounter}`;
    const client = {
      id: clientId,
      res,
      orgId,
      filters
    };
    this.clients.set(clientId, client);
    console.log(`[LogBroadcaster] Client ${clientId} registered (org: ${orgId}, total: ${this.clients.size})`);
    return clientId;
  }
  /**
   * Unregister an SSE client
   */
  unregisterClient(clientId) {
    const removed = this.clients.delete(clientId);
    if (removed) {
      console.log(`[LogBroadcaster] Client ${clientId} unregistered (total: ${this.clients.size})`);
    }
    return removed;
  }
  /**
   * Broadcast new log entries to all matching clients
   * Called when logs are ingested
   */
  broadcast(entries) {
    if (entries.length === 0 || this.clients.size === 0) return;
    let broadcastCount = 0;
    for (const client of Array.from(this.clients.values())) {
      const matchingEntries = entries.filter((entry) => {
        if (entry.orgId !== client.orgId) return false;
        if (client.filters.streamIds?.length) {
          if (!client.filters.streamIds.includes(entry.streamId)) return false;
        }
        if (client.filters.level) {
          const levelOrder = ["debug", "info", "warn", "error"];
          const entryLevel = levelOrder.indexOf(entry.level);
          const filterLevel = levelOrder.indexOf(client.filters.level);
          if (entryLevel < filterLevel) return false;
        }
        return true;
      });
      if (matchingEntries.length > 0) {
        try {
          client.res.write(`event: logs
data: ${JSON.stringify(matchingEntries)}

`);
          broadcastCount++;
        } catch (error) {
          console.error(`[LogBroadcaster] Error writing to client ${client.id}:`, error);
          this.unregisterClient(client.id);
        }
      }
    }
    if (broadcastCount > 0) {
      console.log(`[LogBroadcaster] Broadcast ${entries.length} entries to ${broadcastCount} clients`);
    }
  }
  /**
   * Get current client count (for monitoring)
   */
  getClientCount() {
    return this.clients.size;
  }
  /**
   * Send heartbeat to all clients (call periodically to keep connections alive)
   */
  sendHeartbeats() {
    for (const client of Array.from(this.clients.values())) {
      try {
        client.res.write(`:heartbeat

`);
      } catch (error) {
        this.unregisterClient(client.id);
      }
    }
  }
};
var logBroadcaster = new LogBroadcaster();
setInterval(() => {
  logBroadcaster.sendHeartbeats();
}, 3e4);

// ../../logging/server/src/routes.ts
import { resolveServiceUrl as resolveServiceUrl3, ServiceId as ServiceId3 } from "@symbia/sys";
import { z as z2 } from "zod";
async function parseJsonResponse2(response) {
  return response.json();
}
var AUTH_MODE = process.env.LOGGING_AUTH_MODE || (process.env.NODE_ENV === "production" ? "required" : "optional");
function applyScopedDefaults(payload, context) {
  const orgId = context.isSuperAdmin && payload.orgId ? payload.orgId : context.orgId;
  const serviceId = context.isSuperAdmin && payload.serviceId ? payload.serviceId : context.serviceId;
  const env = context.isSuperAdmin && payload.env ? payload.env : context.env;
  return {
    ...payload,
    orgId,
    serviceId,
    env,
    dataClass: context.dataClass,
    policyRef: context.policyRef,
    createdBy: context.actorId,
    actorId: context.actorId
  };
}
async function registerRoutes(httpServer, app) {
  const telemetry2 = createTelemetryClient2({
    serviceId: process.env.TELEMETRY_SERVICE_ID || "symbia-logging-service"
  });
  const loginSchema = z2.object({
    username: z2.string().min(1),
    password: z2.string().min(1)
  });
  const identityBase = resolveServiceUrl3(ServiceId3.IDENTITY);
  function getBearerToken(req) {
    const authHeader = req.headers.authorization || "";
    if (authHeader.toLowerCase().startsWith("bearer ")) {
      return authHeader.slice("bearer ".length).trim();
    }
    return null;
  }
  async function resolveAuthMe(req) {
    const token = getBearerToken(req) || req.session?.identityToken || null;
    if (token) {
      const introspection = await introspectToken(token);
      if (introspection) {
        const organizations = introspection.organizations || [];
        return {
          user: {
            id: introspection.id || req.session?.userId || "unknown",
            email: introspection.email || req.session?.username || "",
            name: introspection.name || req.session?.identityUser?.name || "",
            isSuperAdmin: introspection.isSuperAdmin || false,
            entitlements: introspection.entitlements || [],
            roles: introspection.roles || [],
            organizations
          },
          organizations
        };
      }
    }
    if (req.session?.identityUser) {
      const user = req.session.identityUser;
      return {
        user,
        organizations: user.organizations || []
      };
    }
    if (req.authContext?.authType === "apiKey") {
      return {
        user: {
          id: req.authContext.actorId,
          email: "api-key@system",
          name: "API Key",
          isSuperAdmin: false,
          entitlements: req.authContext.entitlements || [],
          roles: req.authContext.roles || [],
          organizations: []
        },
        organizations: []
      };
    }
    return null;
  }
  app.get("/api/bootstrap/service", (_req, res) => {
    res.json({
      service: "logging",
      version: "1.0.0",
      description: "Comprehensive observability platform for logs, metrics, traces, and objects",
      docsUrls: {
        openapi: "/docs/openapi.json",
        llms: "/docs/llms.txt",
        llmsFull: "/docs/llms-full.txt"
      },
      endpoints: {
        auth: "/api/auth",
        logs: "/api/logs",
        metrics: "/api/metrics",
        traces: "/api/traces",
        objects: "/api/objects",
        dataSources: "/api/data-sources",
        integrations: "/api/integrations",
        assistant: "/api/assistant",
        apiKeys: "/api/auth/keys"
      },
      authentication: [
        "Bearer token (JWT)",
        "API key (X-API-Key header)",
        "Session cookie"
      ],
      requiredHeaders: [
        "X-Org-Id",
        "X-Service-Id",
        "X-Env",
        "X-Data-Class",
        "X-Policy-Ref"
      ]
    });
  });
  app.get("/api/auth/config", (_req, res) => {
    res.json({
      identityServiceUrl: identityBase,
      loginUrl: `${identityBase}/login`,
      logoutUrl: `${identityBase}/api/auth/logout`
    });
  });
  app.get("/api/auth/me", async (req, res) => {
    const auth2 = await resolveAuthMe(req);
    if (!auth2) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    res.json(auth2);
  });
  app.post("/api/auth/login", async (req, res) => {
    try {
      const body = loginSchema.parse(req.body);
      try {
        const identityResponse = await fetch(`${identityBase}/api/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({ email: body.username, password: body.password })
        });
        const data = await parseJsonResponse2(identityResponse);
        if (identityResponse.ok) {
          const setCookie = identityResponse.headers.get("set-cookie");
          let token = data.token;
          if (!token && setCookie) {
            const tokenMatch = setCookie.match(/token=([^;]+)/);
            if (tokenMatch) token = tokenMatch[1];
          }
          await new Promise((resolve, reject) => {
            req.session.regenerate((err) => {
              if (err) reject(err);
              else resolve();
            });
          });
          req.session.userId = data.user?.id || data.id;
          req.session.username = data.user?.email || data.email || body.username;
          req.session.identityToken = token;
          req.session.identityUser = data.user || data;
          await new Promise((resolve, reject) => {
            req.session.save((err) => {
              if (err) reject(err);
              else resolve();
            });
          });
          telemetry2.event("auth.login.success", `User ${body.username} logged in`, {
            userId: data.user?.id || data.id,
            email: body.username
          });
          return res.json({
            success: true,
            user: {
              id: data.user?.id || data.id,
              username: data.user?.email || data.email || body.username,
              name: data.user?.name || data.name,
              role: "admin"
            }
          });
        } else {
          telemetry2.event("auth.login.failed", `Login failed for ${body.username}`, {
            email: body.username,
            status: identityResponse.status
          }, "warn");
          return res.status(identityResponse.status).json({
            error: data.error || data.message || "Invalid credentials"
          });
        }
      } catch (identityError) {
        console.log("Identity service unavailable:", identityError);
        telemetry2.event("auth.login.error", "Identity service unavailable", {}, "error");
        return res.status(503).json({ error: "Identity service unavailable. Please try again later." });
      }
    } catch (error) {
      res.status(400).json({ error: "Invalid request" });
    }
  });
  app.post("/api/auth/logout", (req, res) => {
    const userId = req.session?.userId;
    const username = req.session?.username;
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      telemetry2.event("auth.logout", `User ${username || "unknown"} logged out`, {
        userId: userId || "unknown"
      });
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });
  app.get("/api/auth/session", (req, res) => {
    if (req.session?.userId) {
      const identityUser = req.session.identityUser;
      res.json({
        authenticated: true,
        user: {
          id: req.session.userId,
          username: req.session.username,
          name: identityUser?.name,
          role: "admin"
        }
      });
    } else if (AUTH_MODE === "optional" || AUTH_MODE === "off") {
      res.json({
        authenticated: true,
        user: {
          id: "anonymous",
          username: "anonymous",
          name: "Anonymous User",
          role: "admin"
        }
      });
    } else {
      res.json({ authenticated: false });
    }
  });
  const createApiKeySchema = z2.object({
    name: z2.string().min(1),
    description: z2.string().optional(),
    orgId: z2.string().optional(),
    serviceId: z2.string().optional(),
    env: z2.string().optional(),
    scopes: z2.array(z2.string()).optional(),
    expiresAt: z2.string().datetime().optional()
  });
  app.get("/api/auth/keys", async (req, res) => {
    try {
      requireAuthContext(req);
      const keys = await storage.getApiKeys();
      res.json(
        keys.map((k) => ({
          id: k.id,
          name: k.name,
          description: k.description,
          prefix: k.keyPrefix,
          orgId: k.orgId,
          serviceId: k.serviceId,
          env: k.env,
          scopes: k.scopes,
          lastUsedAt: k.lastUsedAt,
          expiresAt: k.expiresAt,
          createdAt: k.createdAt,
          revoked: !!k.revokedAt
        }))
      );
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || "Failed to list API keys" });
    }
  });
  app.post("/api/auth/keys", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const body = createApiKeySchema.parse(req.body);
      const { key, prefix, hash } = generateApiKey();
      const apiKey = await storage.createApiKey({
        name: body.name,
        description: body.description,
        keyPrefix: prefix,
        keyHash: hash,
        orgId: body.orgId || context.orgId,
        serviceId: body.serviceId || context.serviceId,
        env: body.env || context.env,
        scopes: body.scopes || ["ingest"],
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : void 0,
        createdBy: context.actorId
      });
      res.json({
        id: apiKey.id,
        name: apiKey.name,
        prefix: apiKey.keyPrefix,
        key,
        scopes: apiKey.scopes,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt
      });
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message || "Failed to create API key" });
    }
  });
  app.delete("/api/auth/keys/:id", async (req, res) => {
    try {
      requireAuthContext(req);
      const id = req.params.id;
      await storage.revokeApiKey(id);
      res.json({ success: true });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || "Failed to revoke API key" });
    }
  });
  app.get("/api/stats", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const stats = await storage.getStats(context);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });
  app.get("/api/stats/ingest-rate", async (req, res) => {
    try {
      const now = /* @__PURE__ */ new Date();
      const data = [];
      for (let i = 23; i >= 0; i--) {
        const time = new Date(now.getTime() - i * 60 * 60 * 1e3);
        data.push({
          time: time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          value: Math.floor(100 + Math.random() * 400)
        });
      }
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch ingest rate" });
    }
  });
  app.get("/api/stats/query-latency", async (req, res) => {
    try {
      const now = /* @__PURE__ */ new Date();
      const data = [];
      for (let i = 23; i >= 0; i--) {
        const time = new Date(now.getTime() - i * 60 * 60 * 1e3);
        data.push({
          time: time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          value: Math.floor(5 + Math.random() * 25)
        });
      }
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch query latency" });
    }
  });
  app.get("/api/logs/streams", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const streams = await storage.getLogStreams(context);
      res.json(streams);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch log streams" });
    }
  });
  app.get("/api/logs/streams/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const stream = await storage.getLogStream(context, req.params.id);
      if (!stream) {
        return res.status(404).json({ error: "Log stream not found" });
      }
      res.json(stream);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch log stream" });
    }
  });
  app.post("/api/logs/streams", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const payload = applyScopedDefaults(req.body, context);
      const parsed = insertLogStreamSchema.parse(payload);
      const stream = await storage.createLogStream(context, parsed);
      res.status(201).json(stream);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create log stream" });
    }
  });
  app.patch("/api/logs/streams/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const payload = applyScopedDefaults(req.body, context);
      const parsed = insertLogStreamSchema.partial().parse(payload);
      const stream = await storage.updateLogStream(context, req.params.id, parsed);
      if (!stream) {
        return res.status(404).json({ error: "Log stream not found" });
      }
      res.json(stream);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update log stream" });
    }
  });
  app.delete("/api/logs/streams/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const deleted = await storage.deleteLogStream(context, req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Log stream not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete log stream" });
    }
  });
  app.post("/api/logs/query", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const query = logsQuerySchema.parse(req.body);
      const data = await storage.queryLogEntries(context, query);
      res.json({ data, rowCount: data.length });
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to query logs" });
    }
  });
  app.post("/api/logs/ingest", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const batch = logsIngestSchema.parse(req.body);
      const stream = await storage.getLogStream(context, batch.streamId);
      if (!stream) {
        return res.status(404).json({ error: "Log stream not found" });
      }
      const count2 = await storage.insertLogEntriesBatch(context, batch.streamId, batch.entries);
      if (count2 > 0) {
        const broadcastEntries = batch.entries.map((e, i) => ({
          id: `${batch.streamId}-${Date.now()}-${i}`,
          // Temporary ID for broadcast
          streamId: batch.streamId,
          orgId: context.orgId,
          serviceId: context.serviceId,
          env: context.env,
          timestamp: e.timestamp,
          level: e.level,
          message: e.message,
          source: stream.name,
          metadata: e.metadata
        }));
        logBroadcaster.broadcast(broadcastEntries);
      }
      res.json({ success: true, count: count2 });
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to ingest logs" });
    }
  });
  app.get("/api/logs/stream", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const streamIds = req.query.streamIds ? req.query.streamIds.split(",") : void 0;
      const level = req.query.level;
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
      const clientId = logBroadcaster.registerClient(res, context.orgId, {
        streamIds,
        level
      });
      res.write(`event: connected
data: ${JSON.stringify({
        message: "Connected to log stream",
        clientId,
        activeClients: logBroadcaster.getClientCount()
      })}

`);
      req.on("close", () => {
        logBroadcaster.unregisterClient(clientId);
      });
    } catch (error) {
      if (!res.headersSent) {
        res.status(error.status || 500).json({ error: error.message || "Failed to start log stream" });
      }
    }
  });
  app.get("/api/metrics", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const metrics2 = await storage.getMetrics(context);
      res.json(metrics2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch metrics" });
    }
  });
  app.get("/api/metrics/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const metric = await storage.getMetric(context, req.params.id);
      if (!metric) {
        return res.status(404).json({ error: "Metric not found" });
      }
      res.json(metric);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch metric" });
    }
  });
  app.post("/api/metrics", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const payload = applyScopedDefaults(req.body, context);
      const parsed = insertMetricSchema.parse(payload);
      const metric = await storage.createMetric(context, parsed);
      res.status(201).json(metric);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create metric" });
    }
  });
  app.patch("/api/metrics/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const payload = applyScopedDefaults(req.body, context);
      const parsed = insertMetricSchema.partial().parse(payload);
      const metric = await storage.updateMetric(context, req.params.id, parsed);
      if (!metric) {
        return res.status(404).json({ error: "Metric not found" });
      }
      res.json(metric);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update metric" });
    }
  });
  app.delete("/api/metrics/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const deleted = await storage.deleteMetric(context, req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Metric not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete metric" });
    }
  });
  app.post("/api/metrics/query", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const config2 = metricsQuerySchema.parse(req.body);
      const data = await storage.queryDataPoints(context, config2);
      res.json({ data, rowCount: data.length });
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to execute query" });
    }
  });
  app.post("/api/metrics/ingest", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const batch = ingestBatchSchema.parse(req.body);
      const metric = await storage.getMetric(context, batch.metricId);
      if (!metric) {
        return res.status(404).json({ error: "Metric not found" });
      }
      const count2 = await storage.insertDataPointsBatch(context, batch.metricId, batch.dataPoints);
      res.json({ success: true, count: count2 });
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to ingest data" });
    }
  });
  app.post("/api/query", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const config2 = metricsQuerySchema.parse(req.body);
      const data = await storage.queryDataPoints(context, config2);
      res.json({ data, rowCount: data.length });
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to execute query" });
    }
  });
  app.post("/api/ingest", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const batch = ingestBatchSchema.parse(req.body);
      const metric = await storage.getMetric(context, batch.metricId);
      if (!metric) {
        return res.status(404).json({ error: "Metric not found" });
      }
      const count2 = await storage.insertDataPointsBatch(context, batch.metricId, batch.dataPoints);
      res.json({ success: true, count: count2 });
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to ingest data" });
    }
  });
  app.get("/api/traces", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const traces2 = await storage.getTraces(context);
      res.json(traces2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch traces" });
    }
  });
  app.get("/api/traces/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const trace = await storage.getTrace(context, req.params.id);
      if (!trace) {
        return res.status(404).json({ error: "Trace not found" });
      }
      res.json(trace);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch trace" });
    }
  });
  app.get("/api/traces/:traceId/spans", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const spans2 = await storage.getSpansByTraceId(context, req.params.traceId);
      res.json(spans2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch spans" });
    }
  });
  app.post("/api/traces/query", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const query = tracesQuerySchema.parse(req.body);
      const data = await storage.getTraces(context, query);
      res.json({ data, rowCount: data.length });
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to query traces" });
    }
  });
  app.post("/api/traces/ingest", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const batch = tracesIngestSchema.parse(req.body);
      const count2 = await storage.insertSpansBatch(context, batch.spans);
      res.json({ success: true, count: count2 });
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to ingest traces" });
    }
  });
  app.get("/api/objects/streams", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const streams = await storage.getObjectStreams(context);
      res.json(streams);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch object streams" });
    }
  });
  app.get("/api/objects/streams/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const stream = await storage.getObjectStream(context, req.params.id);
      if (!stream) {
        return res.status(404).json({ error: "Object stream not found" });
      }
      res.json(stream);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch object stream" });
    }
  });
  app.post("/api/objects/streams", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const payload = applyScopedDefaults(req.body, context);
      const parsed = insertObjectStreamSchema.parse(payload);
      const stream = await storage.createObjectStream(context, parsed);
      res.status(201).json(stream);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create object stream" });
    }
  });
  app.patch("/api/objects/streams/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const payload = applyScopedDefaults(req.body, context);
      const parsed = insertObjectStreamSchema.partial().parse(payload);
      const stream = await storage.updateObjectStream(context, req.params.id, parsed);
      if (!stream) {
        return res.status(404).json({ error: "Object stream not found" });
      }
      res.json(stream);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update object stream" });
    }
  });
  app.delete("/api/objects/streams/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const deleted = await storage.deleteObjectStream(context, req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Object stream not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete object stream" });
    }
  });
  app.post("/api/objects/query", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const query = objectsQuerySchema.parse(req.body);
      const data = await storage.queryObjectEntries(context, query);
      res.json({ data, rowCount: data.length });
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to query objects" });
    }
  });
  app.post("/api/objects/ingest", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const entry = objectsIngestSchema.parse(req.body);
      const stream = await storage.getObjectStream(context, entry.streamId);
      if (!stream) {
        return res.status(404).json({ error: "Object stream not found" });
      }
      const result = await storage.insertObjectEntry(context, {
        streamId: entry.streamId,
        timestamp: /* @__PURE__ */ new Date(),
        filename: entry.filename,
        contentType: entry.contentType,
        size: entry.size,
        checksum: entry.checksum,
        storageUrl: entry.storageUrl,
        metadata: entry.metadata
      });
      res.json({ success: true, entry: result });
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to ingest object" });
    }
  });
  app.get("/api/data-sources", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const sources = await storage.getDataSources(context);
      res.json(sources);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch data sources" });
    }
  });
  app.get("/api/data-sources/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const source = await storage.getDataSource(context, req.params.id);
      if (!source) {
        return res.status(404).json({ error: "Data source not found" });
      }
      res.json(source);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch data source" });
    }
  });
  app.post("/api/data-sources", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const payload = applyScopedDefaults(req.body, context);
      const parsed = insertDataSourceSchema.parse(payload);
      const source = await storage.createDataSource(context, parsed);
      res.status(201).json(source);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create data source" });
    }
  });
  app.patch("/api/data-sources/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const payload = applyScopedDefaults(req.body, context);
      const parsed = insertDataSourceSchema.partial().parse(payload);
      const source = await storage.updateDataSource(context, req.params.id, parsed);
      if (!source) {
        return res.status(404).json({ error: "Data source not found" });
      }
      res.json(source);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update data source" });
    }
  });
  app.delete("/api/data-sources/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const deleted = await storage.deleteDataSource(context, req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Data source not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete data source" });
    }
  });
  app.post("/api/data-sources/:id/sync", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const source = await storage.getDataSource(context, req.params.id);
      if (!source) {
        return res.status(404).json({ error: "Data source not found" });
      }
      const updated = await storage.updateDataSource(context, req.params.id, {
        status: "active"
      });
      res.json({ success: true, source: updated });
    } catch (error) {
      res.status(500).json({ error: "Failed to sync data source" });
    }
  });
  app.get("/api/integrations", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const integrations2 = await storage.getIntegrations(context);
      res.json(integrations2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch integrations" });
    }
  });
  app.get("/api/integrations/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const integration = await storage.getIntegration(context, req.params.id);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }
      res.json(integration);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch integration" });
    }
  });
  app.post("/api/integrations", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const payload = applyScopedDefaults(req.body, context);
      const parsed = insertIntegrationSchema.parse(payload);
      const integration = await storage.createIntegration(context, parsed);
      res.status(201).json(integration);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create integration" });
    }
  });
  app.patch("/api/integrations/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const payload = applyScopedDefaults(req.body, context);
      const parsed = insertIntegrationSchema.partial().parse(payload);
      const integration = await storage.updateIntegration(context, req.params.id, parsed);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }
      res.json(integration);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update integration" });
    }
  });
  app.delete("/api/integrations/:id", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const deleted = await storage.deleteIntegration(context, req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Integration not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete integration" });
    }
  });
  app.post("/api/integrations/:id/test", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const integration = await storage.getIntegration(context, req.params.id);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }
      let success = false;
      let message = "";
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5e3);
        const response = await fetch(integration.endpoint, {
          method: "GET",
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (response.ok || response.status === 401 || response.status === 403) {
          success = true;
          message = `Endpoint reachable (HTTP ${response.status})`;
        } else {
          message = `Endpoint returned HTTP ${response.status}`;
        }
      } catch (fetchError) {
        if (fetchError.name === "AbortError") {
          message = "Connection timed out";
        } else {
          message = `Connection failed: ${fetchError.message}`;
        }
      }
      await storage.updateIntegration(context, req.params.id, {
        status: success ? "connected" : "error"
      });
      const updated = await storage.getIntegration(context, req.params.id);
      if (updated) {
        updated.lastCheckedAt = /* @__PURE__ */ new Date();
      }
      res.json({ success, message, integration: updated });
    } catch (error) {
      res.status(500).json({ error: "Failed to test integration" });
    }
  });
  app.get("/api/assistant/config", async (req, res) => {
    try {
      const configured = await logAssistant.isConfigured();
      res.json({
        configured,
        capabilities: ["summarize", "analyze", "group", "investigate"]
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get assistant config" });
    }
  });
  app.post("/api/assistant/summarize", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const authToken = getBearerToken(req) || req.session?.identityToken || void 0;
      const {
        logIds,
        startTime,
        endTime,
        streamIds,
        level,
        search,
        limit = 200
      } = req.body;
      let entries;
      if (logIds && Array.isArray(logIds) && logIds.length > 0) {
        const allLogs = await storage.queryLogEntries(context, { limit: 1e3 });
        entries = allLogs.filter((log) => logIds.includes(log.id));
      } else {
        entries = await storage.queryLogEntries(context, {
          startTime,
          endTime,
          streamIds,
          level: level !== "all" ? level : void 0,
          search,
          limit: Math.min(limit, 500)
          // Cap at 500 for performance
        });
      }
      const summary = await logAssistant.summarizeLogs(entries, authToken);
      res.json(summary);
    } catch (error) {
      console.error("Assistant summarize error:", error);
      res.status(500).json({ error: "Failed to summarize logs" });
    }
  });
  app.post("/api/assistant/analyze", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const authToken = getBearerToken(req) || req.session?.identityToken || void 0;
      const {
        logIds,
        startTime,
        endTime,
        streamIds,
        search,
        limit = 200
      } = req.body;
      let entries;
      if (logIds && Array.isArray(logIds) && logIds.length > 0) {
        const allLogs = await storage.queryLogEntries(context, { limit: 1e3 });
        entries = allLogs.filter((log) => logIds.includes(log.id));
      } else {
        entries = await storage.queryLogEntries(context, {
          startTime,
          endTime,
          streamIds,
          level: "error",
          // Always filter to errors for analysis
          search,
          limit: Math.min(limit, 300)
        });
      }
      const analysis = await logAssistant.analyzeErrors(entries, authToken);
      res.json(analysis);
    } catch (error) {
      console.error("Assistant analyze error:", error);
      res.status(500).json({ error: "Failed to analyze logs" });
    }
  });
  app.post("/api/assistant/group", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const { logIds, startTime, endTime, limit = 500 } = req.body;
      let entries;
      if (logIds && Array.isArray(logIds) && logIds.length > 0) {
        const allLogs = await storage.queryLogEntries(context, { limit: 1e3 });
        entries = allLogs.filter((log) => logIds.includes(log.id));
      } else {
        entries = await storage.queryLogEntries(context, {
          startTime,
          endTime,
          limit
        });
      }
      const groups = await logAssistant.groupRelatedLogs(entries);
      res.json({ groups });
    } catch (error) {
      console.error("Assistant group error:", error);
      res.status(500).json({ error: "Failed to group logs" });
    }
  });
  app.post("/api/assistant/investigate", async (req, res) => {
    try {
      const context = requireAuthContext(req);
      const authToken = getBearerToken(req) || req.session?.identityToken || void 0;
      const {
        insight,
        startTime,
        endTime,
        streamIds,
        level,
        search,
        limit = 200
      } = req.body;
      if (!insight || !insight.text) {
        return res.status(400).json({ error: "Insight is required" });
      }
      const entries = await storage.queryLogEntries(context, {
        startTime,
        endTime,
        streamIds,
        level: level !== "all" ? level : void 0,
        search,
        limit: Math.min(limit, 300)
      });
      const allEntries = await storage.queryLogEntries(context, {
        startTime,
        endTime,
        limit: 500
      });
      const result = await logAssistant.investigate(insight, entries, allEntries, authToken);
      res.json(result);
    } catch (error) {
      console.error("Assistant investigate error:", error);
      res.status(500).json({ error: "Failed to investigate insight" });
    }
  });
  setupDocRoutes(app);
  return httpServer;
}

// ../../logging/server/src/service.ts
async function bootstrap() {
  await ensureLoggingSchema();
  await initSystemBootstrap();
}
var middleware = [authMiddleware, rlsMiddleware];
export {
  bootstrap,
  middleware,
  registerRoutes
};
