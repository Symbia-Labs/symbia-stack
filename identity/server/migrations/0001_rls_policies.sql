-- Row-Level Security (RLS) Policies for Identity Service
-- This migration enables database-level multi-tenant isolation.
--
-- Special considerations for Identity:
-- - users table is global (no org_id) - protected by user_id check
-- - organizations table is self-referencing - admins can manage their own org
-- - memberships link users to orgs - protected by org_id

-- ============================================================================
-- MEMBERSHIPS
-- ============================================================================
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;

CREATE POLICY memberships_org_isolation ON memberships
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- ENTITLEMENTS
-- ============================================================================
ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlements FORCE ROW LEVEL SECURITY;

CREATE POLICY entitlements_org_isolation ON entitlements
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- PROJECTS
-- ============================================================================
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;

CREATE POLICY projects_org_isolation ON projects
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- APPLICATIONS
-- ============================================================================
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications FORCE ROW LEVEL SECURITY;

CREATE POLICY applications_org_isolation ON applications
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- SERVICES
-- ============================================================================
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE services FORCE ROW LEVEL SECURITY;

CREATE POLICY services_org_isolation ON services
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- SCOPED ENTITLEMENTS
-- ============================================================================
ALTER TABLE scoped_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoped_entitlements FORCE ROW LEVEL SECURITY;

CREATE POLICY scoped_entitlements_org_isolation ON scoped_entitlements
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

-- ============================================================================
-- AGENTS (nullable org_id)
-- ============================================================================
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents FORCE ROW LEVEL SECURITY;

CREATE POLICY agents_org_isolation ON agents
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id IS NULL
    OR org_id = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- ENTITIES (nullable org_id)
-- ============================================================================
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities FORCE ROW LEVEL SECURITY;

CREATE POLICY entities_org_isolation ON entities
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id IS NULL
    OR org_id = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- ENTITY ALIASES (nullable org_id)
-- ============================================================================
ALTER TABLE entity_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_aliases FORCE ROW LEVEL SECURITY;

CREATE POLICY entity_aliases_org_isolation ON entity_aliases
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id IS NULL
    OR org_id = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- USER CREDENTIALS (nullable org_id)
-- ============================================================================
ALTER TABLE user_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credentials FORCE ROW LEVEL SECURITY;

CREATE POLICY user_credentials_org_isolation ON user_credentials
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id IS NULL
    OR org_id = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- AUDIT LOGS (nullable org_id)
-- ============================================================================
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_org_isolation ON audit_logs
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id IS NULL
    OR org_id = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- ORGANIZATIONS (special handling - users can see orgs they're members of)
-- ============================================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;

CREATE POLICY organizations_access ON organizations
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR id = current_setting('symbia.org_id', true)
  );
