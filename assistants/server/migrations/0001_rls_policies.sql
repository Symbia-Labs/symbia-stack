-- Row-Level Security (RLS) Policies for Assistants Service
-- This migration enables database-level multi-tenant isolation.
--
-- All tables have org_id for tenant isolation.
-- The orgs table itself uses id as the org identifier.

-- ============================================================================
-- ORGS (special case - org_id IS the id)
-- ============================================================================
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE orgs FORCE ROW LEVEL SECURITY;

CREATE POLICY orgs_isolation ON orgs
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR id::text = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- USERS
-- ============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

CREATE POLICY users_org_isolation ON users
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id::text = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- AUDIT_LOGS
-- ============================================================================
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_org_isolation ON audit_logs
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id::text = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- CONTEXT_SOURCES
-- ============================================================================
ALTER TABLE context_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_sources FORCE ROW LEVEL SECURITY;

CREATE POLICY context_sources_org_isolation ON context_sources
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id::text = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- CONVERSATIONS
-- ============================================================================
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;

CREATE POLICY conversations_org_isolation ON conversations
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id::text = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- HANDOFF_REQUESTS
-- ============================================================================
ALTER TABLE handoff_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE handoff_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY handoff_requests_org_isolation ON handoff_requests
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id::text = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- INFERRED_CONTEXTS
-- ============================================================================
ALTER TABLE inferred_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inferred_contexts FORCE ROW LEVEL SECURITY;

CREATE POLICY inferred_contexts_org_isolation ON inferred_contexts
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id::text = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- LLM_PROVIDERS
-- ============================================================================
ALTER TABLE llm_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_providers FORCE ROW LEVEL SECURITY;

CREATE POLICY llm_providers_org_isolation ON llm_providers
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id::text = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- MESSAGES
-- ============================================================================
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;

CREATE POLICY messages_org_isolation ON messages
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id::text = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- PROMPT_SEQUENCES
-- ============================================================================
ALTER TABLE prompt_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_sequences FORCE ROW LEVEL SECURITY;

CREATE POLICY prompt_sequences_org_isolation ON prompt_sequences
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id::text = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- PROMPT_SEQUENCE_STEPS
-- ============================================================================
ALTER TABLE prompt_sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_sequence_steps FORCE ROW LEVEL SECURITY;

CREATE POLICY prompt_sequence_steps_org_isolation ON prompt_sequence_steps
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id::text = current_setting('symbia.org_id', true)
  );
