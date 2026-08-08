-- SYMBIA_MARKER_D6_CREDS_SCHEMA_20260805
--
-- Schema drift repair. identity/shared/schema.ts (the schema of record) has
-- declared six OAuth columns on user_credentials since the OAuth work landed.
-- The CREATE TABLE in identity/server/src/memory-schema.ts, which is what
-- actually built the table, stops at created_at and never got them.
--
-- Consequence measured 5 Aug 2026: every GET /api/credentials returned
-- 500 `column "credential_type" does not exist`. The control center swallowed
-- that error and rendered "Not configured" on every LLM provider card — a
-- confident claim about the user's account produced by a query that never ran.
-- It is also why D6 (configure a provider through the UI) was impossible:
-- day-one onboarding was blocked by a missing column.
--
-- Columns and defaults are copied from schema.ts:615-620 verbatim so the
-- table matches the schema of record rather than matching what the failing
-- query happened to need.

ALTER TABLE "user_credentials"
  ADD COLUMN IF NOT EXISTS "credential_type" text DEFAULT 'api_key',
  ADD COLUMN IF NOT EXISTS "refresh_token_encrypted" text,
  ADD COLUMN IF NOT EXISTS "expires_at" timestamp,
  ADD COLUMN IF NOT EXISTS "oauth_user_id" varchar(255),
  ADD COLUMN IF NOT EXISTS "oauth_user_email" text,
  ADD COLUMN IF NOT EXISTS "oauth_user_name" text;
