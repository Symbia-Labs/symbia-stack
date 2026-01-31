-- Row-Level Security (RLS) Policies for Assistants Service
-- This migration enables database-level multi-tenant isolation.

-- ============================================================================
-- ORG MEMBERSHIPS
-- ============================================================================
ALTER TABLE org_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_memberships FORCE ROW LEVEL SECURITY;

CREATE POLICY org_memberships_org_isolation ON org_memberships
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)::uuid
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
    OR org_id = current_setting('symbia.org_id', true)::uuid
  );

-- ============================================================================
-- CONVERSATION PARTICIPANTS
-- ============================================================================
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants FORCE ROW LEVEL SECURITY;

CREATE POLICY conversation_participants_org_isolation ON conversation_participants
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)::uuid
  );

-- ============================================================================
-- CONVERSATION EVENTS
-- ============================================================================
ALTER TABLE conversation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_events FORCE ROW LEVEL SECURITY;

CREATE POLICY conversation_events_org_isolation ON conversation_events
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)::uuid
  );

-- ============================================================================
-- CONTEXT SNAPSHOTS
-- ============================================================================
ALTER TABLE context_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_snapshots FORCE ROW LEVEL SECURITY;

CREATE POLICY context_snapshots_org_isolation ON context_snapshots
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)::uuid
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
    OR org_id = current_setting('symbia.org_id', true)::uuid
  );

-- ============================================================================
-- PROMPT SEQUENCES
-- ============================================================================
ALTER TABLE prompt_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_sequences FORCE ROW LEVEL SECURITY;

CREATE POLICY prompt_sequences_org_isolation ON prompt_sequences
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)::uuid
  );

-- ============================================================================
-- PROMPT SEQUENCE STEPS
-- ============================================================================
ALTER TABLE prompt_sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_sequence_steps FORCE ROW LEVEL SECURITY;

CREATE POLICY prompt_sequence_steps_org_isolation ON prompt_sequence_steps
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)::uuid
  );

-- ============================================================================
-- LLM PROVIDERS
-- ============================================================================
ALTER TABLE llm_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_providers FORCE ROW LEVEL SECURITY;

CREATE POLICY llm_providers_org_isolation ON llm_providers
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)::uuid
  );

-- ============================================================================
-- PROVIDER USAGE LOGS
-- ============================================================================
ALTER TABLE provider_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_usage_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY provider_usage_logs_org_isolation ON provider_usage_logs
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)::uuid
  );

-- ============================================================================
-- HANDOFF REQUESTS
-- ============================================================================
ALTER TABLE handoff_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE handoff_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY handoff_requests_org_isolation ON handoff_requests
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)::uuid
  );

-- ============================================================================
-- CONTEXT SOURCES
-- ============================================================================
ALTER TABLE context_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_sources FORCE ROW LEVEL SECURITY;

CREATE POLICY context_sources_org_isolation ON context_sources
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)::uuid
  );

-- ============================================================================
-- INFERRED CONTEXTS
-- ============================================================================
ALTER TABLE inferred_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inferred_contexts FORCE ROW LEVEL SECURITY;

CREATE POLICY inferred_contexts_org_isolation ON inferred_contexts
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)::uuid
  );

-- ============================================================================
-- CATALOG BINDINGS
-- ============================================================================
ALTER TABLE catalog_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_bindings FORCE ROW LEVEL SECURITY;

CREATE POLICY catalog_bindings_org_isolation ON catalog_bindings
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)::uuid
  );

-- ============================================================================
-- MESSAGING CHANNELS
-- ============================================================================
ALTER TABLE messaging_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_channels FORCE ROW LEVEL SECURITY;

CREATE POLICY messaging_channels_org_isolation ON messaging_channels
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)::uuid
  );

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;

CREATE POLICY notifications_org_isolation ON notifications
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)::uuid
  );

-- ============================================================================
-- AUDIT LOGS
-- ============================================================================
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_org_isolation ON audit_logs
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)::uuid
  );

-- ============================================================================
-- PROMPT GRAPHS
-- ============================================================================
ALTER TABLE prompt_graphs ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_graphs FORCE ROW LEVEL SECURITY;

CREATE POLICY prompt_graphs_org_isolation ON prompt_graphs
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)::uuid
  );

-- ============================================================================
-- GRAPH RUNS
-- ============================================================================
ALTER TABLE graph_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY graph_runs_org_isolation ON graph_runs
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)::uuid
  );

-- ============================================================================
-- BOT PRINCIPALS (agent principals)
-- ============================================================================
ALTER TABLE bot_principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_principals FORCE ROW LEVEL SECURITY;

CREATE POLICY bot_principals_org_isolation ON bot_principals
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)::uuid
  );

-- ============================================================================
-- ORGS (users can only see orgs they belong to)
-- ============================================================================
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE orgs FORCE ROW LEVEL SECURITY;

CREATE POLICY orgs_access ON orgs
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR id = current_setting('symbia.org_id', true)::uuid
  );
