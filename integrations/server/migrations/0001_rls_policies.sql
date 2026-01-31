-- Row-Level Security (RLS) Policies for Integrations Service
-- This migration enables database-level multi-tenant isolation.

-- ============================================================================
-- EXECUTION LOGS (nullable org_id)
-- ============================================================================
ALTER TABLE integration_execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_execution_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY execution_logs_org_isolation ON integration_execution_logs
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id IS NULL
    OR org_id = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- INTEGRATIONS
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
-- PROXY USAGE
-- ============================================================================
ALTER TABLE proxy_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE proxy_usage FORCE ROW LEVEL SECURITY;

CREATE POLICY proxy_usage_org_isolation ON proxy_usage
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- OAUTH STATES (nullable org_id)
-- ============================================================================
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_states FORCE ROW LEVEL SECURITY;

CREATE POLICY oauth_states_org_isolation ON oauth_states
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id IS NULL
    OR org_id = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- OAUTH CONNECTIONS (nullable org_id)
-- ============================================================================
ALTER TABLE oauth_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_connections FORCE ROW LEVEL SECURITY;

CREATE POLICY oauth_connections_org_isolation ON oauth_connections
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id IS NULL
    OR org_id = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- CHANNEL CONNECTIONS (nullable org_id)
-- ============================================================================
ALTER TABLE channel_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_connections FORCE ROW LEVEL SECURITY;

CREATE POLICY channel_connections_org_isolation ON channel_connections
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id IS NULL
    OR org_id = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- OAUTH PROVIDER CONFIGS (global - no org_id)
-- These are system-wide OAuth provider configurations
-- ============================================================================
ALTER TABLE oauth_provider_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_provider_configs FORCE ROW LEVEL SECURITY;

-- Allow all authenticated users to read, only admins to write
CREATE POLICY oauth_provider_configs_read ON oauth_provider_configs
  FOR SELECT
  USING (true);

CREATE POLICY oauth_provider_configs_write ON oauth_provider_configs
  FOR INSERT
  USING (current_setting('symbia.can_bypass_org', true) = 'true')
  WITH CHECK (current_setting('symbia.can_bypass_org', true) = 'true');

CREATE POLICY oauth_provider_configs_update ON oauth_provider_configs
  FOR UPDATE
  USING (current_setting('symbia.can_bypass_org', true) = 'true')
  WITH CHECK (current_setting('symbia.can_bypass_org', true) = 'true');

CREATE POLICY oauth_provider_configs_delete ON oauth_provider_configs
  FOR DELETE
  USING (current_setting('symbia.can_bypass_org', true) = 'true');
