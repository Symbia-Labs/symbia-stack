import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, real, integer, jsonb, bigint, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ============================================================================
// API KEYS - For external system authentication
// ============================================================================

export const apiKeys = pgTable("api_keys", {
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
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true,
});

export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeys.$inferSelect;

// ============================================================================
// LOGS - Optimized for timeseries human-readable text
// ============================================================================

export const logStreams = pgTable("log_streams", {
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
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertLogStreamSchema = createInsertSchema(logStreams).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLogStream = z.infer<typeof insertLogStreamSchema>;
export type LogStream = typeof logStreams.$inferSelect;

export const logEntries = pgTable("log_entries", {
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
  metadata: jsonb("metadata"),
}, (table) => ({
  orgTimestampIdx: index("idx_log_entries_org_ts").on(table.orgId, table.timestamp),
  streamTimestampIdx: index("idx_log_entries_stream_ts").on(table.streamId, table.timestamp),
  levelIdx: index("idx_log_entries_level").on(table.level),
}));

export const insertLogEntrySchema = createInsertSchema(logEntries).omit({
  id: true,
});

export type InsertLogEntry = z.infer<typeof insertLogEntrySchema>;
export type LogEntry = typeof logEntries.$inferSelect;

// ============================================================================
// METRICS - Optimized for timeseries numeric data
// ============================================================================

export const metrics = pgTable("metrics", {
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
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMetricSchema = createInsertSchema(metrics).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMetric = z.infer<typeof insertMetricSchema>;
export type Metric = typeof metrics.$inferSelect;

export const dataPoints = pgTable("data_points", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  metricId: varchar("metric_id").notNull(),
  orgId: text("org_id").notNull(),
  serviceId: text("service_id").notNull(),
  env: text("env").notNull(),
  dataClass: text("data_class").notNull(),
  policyRef: text("policy_ref").notNull(),
  timestamp: timestamp("timestamp").notNull(),
  value: real("value").notNull(),
  labels: jsonb("labels"),
}, (table) => ({
  metricTimestampIdx: index("idx_data_points_metric_ts").on(table.metricId, table.timestamp),
  orgTimestampIdx: index("idx_data_points_org_ts").on(table.orgId, table.timestamp),
}));

export const insertDataPointSchema = createInsertSchema(dataPoints).omit({
  id: true,
});

export type InsertDataPoint = z.infer<typeof insertDataPointSchema>;
export type DataPoint = typeof dataPoints.$inferSelect;

// ============================================================================
// TRACES - Optimized for timeseries mixed modal time-bounded objects
// ============================================================================

export const traces = pgTable("traces", {
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
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  traceIdIdx: index("idx_traces_trace_id").on(table.traceId),
  orgStartTimeIdx: index("idx_traces_org_start").on(table.orgId, table.startTime),
  serviceNameIdx: index("idx_traces_service_name").on(table.serviceName),
}));

export const insertTraceSchema = createInsertSchema(traces).omit({
  id: true,
  createdAt: true,
});

export type InsertTrace = z.infer<typeof insertTraceSchema>;
export type Trace = typeof traces.$inferSelect;

export const spans = pgTable("spans", {
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
  events: jsonb("events"),
}, (table) => ({
  traceIdIdx: index("idx_spans_trace_id").on(table.traceId),
  spanIdIdx: index("idx_spans_span_id").on(table.spanId),
  parentSpanIdx: index("idx_spans_parent").on(table.parentSpanId),
}));

export const insertSpanSchema = createInsertSchema(spans).omit({
  id: true,
});

export type InsertSpan = z.infer<typeof insertSpanSchema>;
export type Span = typeof spans.$inferSelect;

// ============================================================================
// OBJECTS - Optimized for timeseries blobs, files, binary
// ============================================================================

export const objectStreams = pgTable("object_streams", {
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
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertObjectStreamSchema = createInsertSchema(objectStreams).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertObjectStream = z.infer<typeof insertObjectStreamSchema>;
export type ObjectStream = typeof objectStreams.$inferSelect;

export const objectEntries = pgTable("object_entries", {
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
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertObjectEntrySchema = createInsertSchema(objectEntries).omit({
  id: true,
  createdAt: true,
});

export type InsertObjectEntry = z.infer<typeof insertObjectEntrySchema>;
export type ObjectEntry = typeof objectEntries.$inferSelect;

// ============================================================================
// DATA SOURCES & INTEGRATIONS
// ============================================================================

export const dataSources = pgTable("data_sources", {
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
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDataSourceSchema = createInsertSchema(dataSources).omit({
  id: true,
  createdAt: true,
  lastSyncAt: true,
});

export type InsertDataSource = z.infer<typeof insertDataSourceSchema>;
export type DataSource = typeof dataSources.$inferSelect;

export const integrations = pgTable("integrations", {
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
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertIntegrationSchema = createInsertSchema(integrations).omit({
  id: true,
  createdAt: true,
  lastCheckedAt: true,
});

export type InsertIntegration = z.infer<typeof insertIntegrationSchema>;
export type Integration = typeof integrations.$inferSelect;

// ============================================================================
// QUERY SCHEMAS
// ============================================================================

export const logsQuerySchema = z.object({
  streamIds: z.array(z.string()).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  level: z.enum(["debug", "info", "warn", "error", "fatal"]).optional(),
  search: z.string().optional(),
  metadata: z.record(z.string()).optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});

export type LogsQuery = z.infer<typeof logsQuerySchema>;

export const metricsQuerySchema = z.object({
  metricIds: z.array(z.string()).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  aggregation: z.enum(["avg", "sum", "min", "max", "count", "last"]).optional(),
  interval: z.string().optional(),
  labels: z.record(z.string()).optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});

export type MetricsQuery = z.infer<typeof metricsQuerySchema>;

export const tracesQuerySchema = z.object({
  traceIds: z.array(z.string()).optional(),
  serviceName: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  status: z.enum(["unset", "ok", "error"]).optional(),
  minDurationMs: z.number().optional(),
  maxDurationMs: z.number().optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});

export type TracesQuery = z.infer<typeof tracesQuerySchema>;

export const objectsQuerySchema = z.object({
  streamIds: z.array(z.string()).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  contentType: z.string().optional(),
  minSize: z.number().optional(),
  maxSize: z.number().optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});

export type ObjectsQuery = z.infer<typeof objectsQuerySchema>;

// Legacy support for existing code
export const queryConfigSchema = metricsQuerySchema;
export type QueryConfig = MetricsQuery;

export const ingestBatchSchema = z.object({
  metricId: z.string(),
  dataPoints: z.array(z.object({
    timestamp: z.string(),
    value: z.number(),
    labels: z.record(z.string()).optional(),
  })),
});

export type IngestBatch = z.infer<typeof ingestBatchSchema>;

export const logsIngestSchema = z.object({
  streamId: z.string(),
  entries: z.array(z.object({
    timestamp: z.string(),
    level: z.string(),
    message: z.string(),
    metadata: z.record(z.unknown()).optional(),
  })),
});

export type LogsIngest = z.infer<typeof logsIngestSchema>;

export const tracesIngestSchema = z.object({
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
      attributes: z.record(z.unknown()).optional(),
    })).optional(),
  })),
});

export type TracesIngest = z.infer<typeof tracesIngestSchema>;

export const objectsIngestSchema = z.object({
  streamId: z.string(),
  filename: z.string().optional(),
  contentType: z.string().optional(),
  size: z.number().optional(),
  checksum: z.string().optional(),
  storageUrl: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type ObjectsIngest = z.infer<typeof objectsIngestSchema>;
