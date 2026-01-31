-- Row-Level Security (RLS) Policies for Logging Service
-- This migration enables database-level multi-tenant isolation.
--
-- All tables with org_id are protected by RLS policies that:
-- 1. Filter data by org_id from session context
-- 2. Allow bypass for super admins and users with global-read capabilities
--
-- Usage: Before each request, set session context:
--   SELECT set_config('symbia.org_id', '<org_id>', true);
--   SELECT set_config('symbia.can_bypass_org', 'true/false', true);

-- ============================================================================
-- LOG STREAMS
-- ============================================================================
ALTER TABLE log_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_streams FORCE ROW LEVEL SECURITY;

CREATE POLICY log_streams_org_isolation ON log_streams
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- LOG ENTRIES
-- ============================================================================
ALTER TABLE log_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY log_entries_org_isolation ON log_entries
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- METRICS
-- ============================================================================
ALTER TABLE metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics FORCE ROW LEVEL SECURITY;

CREATE POLICY metrics_org_isolation ON metrics
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- DATA POINTS
-- ============================================================================
ALTER TABLE data_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_points FORCE ROW LEVEL SECURITY;

CREATE POLICY data_points_org_isolation ON data_points
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- TRACES
-- ============================================================================
ALTER TABLE traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE traces FORCE ROW LEVEL SECURITY;

CREATE POLICY traces_org_isolation ON traces
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- SPANS
-- ============================================================================
ALTER TABLE spans ENABLE ROW LEVEL SECURITY;
ALTER TABLE spans FORCE ROW LEVEL SECURITY;

CREATE POLICY spans_org_isolation ON spans
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- OBJECT STREAMS
-- ============================================================================
ALTER TABLE object_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_streams FORCE ROW LEVEL SECURITY;

CREATE POLICY object_streams_org_isolation ON object_streams
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- OBJECT ENTRIES
-- ============================================================================
ALTER TABLE object_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY object_entries_org_isolation ON object_entries
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- DATA SOURCES
-- ============================================================================
ALTER TABLE data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_sources FORCE ROW LEVEL SECURITY;

CREATE POLICY data_sources_org_isolation ON data_sources
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- INTEGRATIONS (logging service's integrations table)
-- ============================================================================
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations FORCE ROW LEVEL SECURITY;

CREATE POLICY integrations_org_isolation ON integrations
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- API KEYS (nullable org_id)
-- ============================================================================
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;

CREATE POLICY api_keys_org_isolation ON api_keys
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id IS NULL
    OR org_id = current_setting('symbia.org_id', true)
  );
