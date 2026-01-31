export const MEMORY_SCHEMA_SQL = `
CREATE TABLE "resources" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" varchar(255) NOT NULL UNIQUE,
  "name" text NOT NULL,
  "description" text,
  "type" varchar(50) NOT NULL,
  "status" varchar(50) NOT NULL DEFAULT 'draft',
  "is_bootstrap" boolean NOT NULL DEFAULT false,
  "tags" text[],
  "org_id" varchar(255),
  "access_policy" jsonb,
  "metadata" jsonb,
  "current_version" integer DEFAULT 1,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "resource_versions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "resource_id" varchar NOT NULL REFERENCES "resources"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "content" jsonb,
  "changelog" text,
  "published_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "created_by" varchar(255)
);

CREATE TABLE "artifacts" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "resource_id" varchar NOT NULL REFERENCES "resources"("id") ON DELETE CASCADE,
  "version_id" varchar REFERENCES "resource_versions"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "mime_type" varchar(255),
  "size" integer,
  "checksum" varchar(255),
  "storage_url" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "signatures" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "resource_id" varchar NOT NULL REFERENCES "resources"("id") ON DELETE CASCADE,
  "version_id" varchar REFERENCES "resource_versions"("id") ON DELETE CASCADE,
  "signer_id" varchar(255) NOT NULL,
  "signer_name" text,
  "algorithm" varchar(50),
  "signature" text NOT NULL,
  "signed_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "certifications" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "resource_id" varchar NOT NULL REFERENCES "resources"("id") ON DELETE CASCADE,
  "version_id" varchar REFERENCES "resource_versions"("id") ON DELETE CASCADE,
  "certifier_id" varchar(255) NOT NULL,
  "certifier_name" text,
  "certification_type" varchar(100),
  "notes" text,
  "certified_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp
);

CREATE TABLE "entitlements" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "resource_id" varchar NOT NULL REFERENCES "resources"("id") ON DELETE CASCADE,
  "principal_id" varchar(255) NOT NULL,
  "principal_type" varchar(50) NOT NULL,
  "permission" varchar(50) NOT NULL,
  "granted_at" timestamp DEFAULT now() NOT NULL,
  "granted_by" varchar(255)
);

CREATE TABLE "api_keys" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "key_hash" varchar(64) NOT NULL UNIQUE,
  "key_prefix" varchar(8) NOT NULL,
  "created_by" varchar(255) NOT NULL,
  "created_by_name" text,
  "last_used_at" timestamp,
  "expires_at" timestamp,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "system_settings" (
  "key" varchar(255) PRIMARY KEY,
  "value" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for resources table
CREATE INDEX idx_resources_type ON "resources"("type");
CREATE INDEX idx_resources_org_id ON "resources"("org_id");
CREATE INDEX idx_resources_type_org ON "resources"("type", "org_id");
CREATE INDEX idx_resources_status ON "resources"("status");
CREATE INDEX idx_resources_bootstrap ON "resources"("is_bootstrap");
CREATE INDEX idx_resources_updated ON "resources"("updated_at");

-- Indexes for child tables
CREATE INDEX idx_resource_versions_resource_version ON "resource_versions"("resource_id", "version");
CREATE INDEX idx_artifacts_resource_id ON "artifacts"("resource_id");
CREATE INDEX idx_signatures_resource_id ON "signatures"("resource_id");
CREATE INDEX idx_certifications_resource_id ON "certifications"("resource_id");
CREATE INDEX idx_entitlements_resource_id ON "entitlements"("resource_id");
CREATE INDEX idx_entitlements_principal ON "entitlements"("principal_id");

-- Indexes for api_keys table
CREATE INDEX idx_api_keys_active ON "api_keys"("is_active");
CREATE INDEX idx_api_keys_created_by ON "api_keys"("created_by");
`;
