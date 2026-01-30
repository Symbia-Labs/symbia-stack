export const MEMORY_SCHEMA_SQL = `
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
