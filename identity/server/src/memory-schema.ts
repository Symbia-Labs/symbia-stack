export const MEMORY_SCHEMA_SQL = `
CREATE TABLE "users" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "name" text NOT NULL,
  "is_super_admin" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "plans" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL UNIQUE,
  "features_json" json DEFAULT '[]'::json,
  "limits_json" json DEFAULT '{}'::json,
  "price_cents" integer DEFAULT 0 NOT NULL
);

CREATE TABLE "organizations" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "plan_id" varchar REFERENCES "plans"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "memberships" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "org_id" varchar NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "role" text NOT NULL DEFAULT 'member',
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "entitlements" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" varchar NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "feature_key" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "expires_at" timestamp
);

CREATE TABLE "sessions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "password_reset_tokens" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token" text NOT NULL UNIQUE,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "projects" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" varchar NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "applications" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" varchar NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "org_id" varchar NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "environment" text NOT NULL DEFAULT 'development',
  "app_type" text NOT NULL DEFAULT 'web',
  "repo_url" text,
  "metadata_json" json DEFAULT '{}'::json,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "services" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" varchar NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "org_id" varchar NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "service_type" text NOT NULL,
  "provider" text,
  "endpoint_url" text,
  "external_id" text,
  "status" text NOT NULL DEFAULT 'active',
  "metadata_json" json DEFAULT '{}'::json,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "application_services" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "application_id" varchar NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
  "service_id" varchar NOT NULL REFERENCES "services"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "entitlement_tranches" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "plan_id" varchar REFERENCES "plans"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "tranche_key" text NOT NULL,
  "description" text,
  "default_quota" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "scoped_entitlements" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" varchar NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "scope_type" text NOT NULL,
  "scope_id" varchar NOT NULL,
  "tranche_id" varchar REFERENCES "entitlement_tranches"("id"),
  "feature_key" text NOT NULL,
  "quota" integer DEFAULT 0,
  "consumed" integer DEFAULT 0,
  "enabled" boolean NOT NULL DEFAULT true,
  "expires_at" timestamp,
  "metadata_json" json DEFAULT '{}'::json,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "user_entitlements" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "entitlement_key" text NOT NULL,
  "granted_by" varchar REFERENCES "users"("id"),
  "expires_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "user_roles" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role_key" text NOT NULL,
  "granted_by" varchar REFERENCES "users"("id"),
  "expires_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "api_keys" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "key_hash" text NOT NULL,
  "key_prefix" text NOT NULL,
  "org_id" varchar REFERENCES "organizations"("id") ON DELETE CASCADE,
  "created_by" varchar NOT NULL REFERENCES "users"("id"),
  "scopes" json DEFAULT '[]'::json,
  "expires_at" timestamp,
  "last_used_at" timestamp,
  "revoked_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "audit_logs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar REFERENCES "users"("id"),
  "org_id" varchar REFERENCES "organizations"("id"),
  "action" text NOT NULL,
  "resource" text NOT NULL,
  "resource_id" varchar,
  "metadata_json" json DEFAULT '{}'::json,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "agents" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" text NOT NULL UNIQUE,
  "credential_hash" text NOT NULL,
  "name" text NOT NULL,
  "org_id" varchar REFERENCES "organizations"("id") ON DELETE CASCADE,
  "capabilities" json DEFAULT '[]'::json,
  "metadata" json DEFAULT '{}'::json,
  "is_active" boolean NOT NULL DEFAULT true,
  "last_seen_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "user_credentials" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "org_id" varchar REFERENCES "organizations"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "name" text NOT NULL,
  "credential_encrypted" text NOT NULL,
  "credential_prefix" text,
  "is_org_wide" boolean NOT NULL DEFAULT false,
  "metadata" json DEFAULT '{}'::json,
  "last_used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for users table
CREATE UNIQUE INDEX idx_users_email ON "users"("email");

-- Indexes for memberships table
CREATE INDEX idx_memberships_user_id ON "memberships"("user_id");
CREATE INDEX idx_memberships_org_id ON "memberships"("org_id");
CREATE UNIQUE INDEX idx_memberships_org_user ON "memberships"("org_id", "user_id");

-- Indexes for sessions table
CREATE INDEX idx_sessions_user_id ON "sessions"("user_id");
CREATE INDEX idx_sessions_expires ON "sessions"("expires_at");

-- Indexes for projects table
CREATE INDEX idx_projects_org_id ON "projects"("org_id");
CREATE UNIQUE INDEX idx_projects_org_slug ON "projects"("org_id", "slug");

-- Indexes for applications table
CREATE INDEX idx_applications_org_id ON "applications"("org_id");
CREATE INDEX idx_applications_project_id ON "applications"("project_id");

-- Indexes for services table
CREATE INDEX idx_services_org_id ON "services"("org_id");
CREATE INDEX idx_services_project_id ON "services"("project_id");

-- Indexes for api_keys table
CREATE INDEX idx_api_keys_org_id ON "api_keys"("org_id");
CREATE INDEX idx_api_keys_created_by ON "api_keys"("created_by");

-- Indexes for audit_logs table
CREATE INDEX idx_audit_logs_org_created ON "audit_logs"("org_id", "created_at");
CREATE INDEX idx_audit_logs_user_created ON "audit_logs"("user_id", "created_at");
CREATE INDEX idx_audit_logs_resource ON "audit_logs"("resource", "resource_id");

-- Indexes for agents table
CREATE UNIQUE INDEX idx_agents_agent_id ON "agents"("agent_id");
CREATE INDEX idx_agents_org_id ON "agents"("org_id");

-- Indexes for user_credentials table
CREATE INDEX idx_user_credentials_user_id ON "user_credentials"("user_id");
CREATE INDEX idx_user_credentials_org_id ON "user_credentials"("org_id");
CREATE INDEX idx_user_credentials_provider ON "user_credentials"("provider");
CREATE INDEX idx_user_credentials_user_provider ON "user_credentials"("user_id", "provider");
`;
