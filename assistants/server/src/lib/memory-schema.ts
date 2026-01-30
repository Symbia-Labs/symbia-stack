export const MEMORY_SCHEMA_SQL = `
CREATE TYPE "membership_role" AS ENUM ('owner', 'admin', 'member', 'viewer');
CREATE TYPE "conversation_status" AS ENUM ('active', 'waiting', 'handoff', 'resolved', 'archived');
CREATE TYPE "provider_type" AS ENUM ('openai', 'anthropic', 'azure', 'google', 'custom');
CREATE TYPE "graph_run_status" AS ENUM ('running', 'paused', 'waiting', 'completed', 'failed', 'cancelled');
CREATE TYPE "graph_run_priority" AS ENUM ('low', 'normal', 'high', 'critical');
CREATE TYPE "run_log_level" AS ENUM ('debug', 'info', 'warn', 'error');
CREATE TYPE "principal_type" AS ENUM ('user', 'agent', 'service', 'assistant');

CREATE TABLE "orgs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "slug" varchar(100) NOT NULL UNIQUE,
  "settings" jsonb DEFAULT '{}'::jsonb,
  "entitlements" jsonb DEFAULT '[]'::jsonb,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "external_id" varchar(255) UNIQUE,
  "email" varchar(255) NOT NULL UNIQUE,
  "display_name" varchar(255),
  "avatar_url" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "last_seen_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "org_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" "membership_role" DEFAULT 'member' NOT NULL,
  "permissions" jsonb DEFAULT '[]'::jsonb,
  "invited_by" uuid REFERENCES "users"("id"),
  "invited_at" timestamp,
  "accepted_at" timestamp,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  UNIQUE ("org_id", "user_id")
);

CREATE TABLE "conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "title" varchar(500),
  "status" "conversation_status" DEFAULT 'active',
  "channel" varchar(50) DEFAULT 'web',
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "current_sequence_id" uuid,
  "current_step_id" uuid,
  "resolved_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "llm_providers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "provider_type" "provider_type" NOT NULL,
  "api_key_encrypted" text,
  "base_url" text,
  "default_model" varchar(100),
  "models" jsonb DEFAULT '[]'::jsonb,
  "routing_weight" integer DEFAULT 100,
  "fallback_order" integer DEFAULT 0,
  "is_active" boolean DEFAULT true,
  "rate_limits" jsonb DEFAULT '{}'::jsonb,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "prompt_graphs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "description" text,
  "version" integer DEFAULT 1 NOT NULL,
  "graph_json" jsonb NOT NULL,
  "is_published" boolean DEFAULT false,
  "trigger_conditions" jsonb DEFAULT '{}'::jsonb,
  "log_level" varchar(20) DEFAULT 'warn',
  "created_by" uuid REFERENCES "users"("id"),
  "published_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "compiled_graphs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "graph_id" uuid NOT NULL REFERENCES "prompt_graphs"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "bytecode" text NOT NULL,
  "checksum" varchar(64),
  "compiled_at" timestamp DEFAULT now() NOT NULL,
  UNIQUE ("graph_id", "version")
);

CREATE TABLE "graph_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "graph_id" uuid REFERENCES "prompt_graphs"("id") ON DELETE SET NULL,
  "compiled_graph_id" uuid REFERENCES "compiled_graphs"("id"),
  "conversation_id" uuid REFERENCES "conversations"("id") ON DELETE CASCADE,
  "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "trace_id" varchar(64),
  "state" jsonb DEFAULT '{}'::jsonb,
  "status" "graph_run_status" DEFAULT 'running',
  "priority" "graph_run_priority" DEFAULT 'normal',
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "run_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "graph_runs"("id") ON DELETE CASCADE,
  "level" "run_log_level" DEFAULT 'info',
  "node_id" varchar(100),
  "message" text NOT NULL,
  "data" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "bot_principals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "principal_id" varchar(255) NOT NULL UNIQUE,
  "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "principal_type" "principal_type" DEFAULT 'agent',
  "name" varchar(255) NOT NULL,
  "description" text,
  "default_graph_id" uuid REFERENCES "prompt_graphs"("id"),
  "capabilities" jsonb DEFAULT '[]'::jsonb,
  "webhooks" jsonb DEFAULT '{}'::jsonb,
  "assistant_config" jsonb DEFAULT '{}'::jsonb,
  "is_active" boolean DEFAULT true,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
`;
