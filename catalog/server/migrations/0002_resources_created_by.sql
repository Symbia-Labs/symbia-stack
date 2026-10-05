-- resources.created_by — the column the persistent path never got.
--
-- Added to catalog/shared/schema.ts and memory-schema.ts on 16 Aug to close D1:
-- sealing could not tell a client's work from a service's, because `isBootstrap`
-- answers "did this come from a bootstrap file" and sealing was reading it as
-- "did this session make it". Recording the authoring principal separated them,
-- and a seal that had carried 18 artifacts carried 1.
--
-- WHY THIS FILE EXISTS A DAY LATE. In imagine mode the store is pg-mem, built
-- at boot from memory-schema.ts, so the new column simply existed and every
-- test passed. Postgres has a schema that only migrations change, and none was
-- written. The two packagings diverged silently for a day and surfaced as
--
--   Error fetching resources: error: column "created_by" does not exist
--
-- with the service healthy, the container up, and the MCP server reporting 390
-- operations. Nothing was broken until something read a resource.
--
-- The rule this earns: a schema change that lands in memory-schema.ts is not
-- finished until it lands in a migration. pg-mem rebuilding from source is
-- exactly what makes the omission invisible.
--
-- `resource_versions` already had the column; nothing had ever written it for a
-- resource. Idempotent, because db-bootstrap re-runs on every compose up.

ALTER TABLE resources
  ADD COLUMN IF NOT EXISTS created_by TEXT;

COMMENT ON COLUMN resources.created_by IS
  'Authenticated principal that authored this resource. Taken from the request principal and never from a request body, for the same reason isBootstrap is not accepted from a client. Null for rows written before 16 Aug 2026 and for seed data.';

CREATE INDEX IF NOT EXISTS idx_resources_created_by
  ON resources (created_by)
  WHERE created_by IS NOT NULL;
