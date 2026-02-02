-- Row-Level Security (RLS) Policies for Messaging Service
-- This migration enables database-level multi-tenant isolation.
--
-- All tables use org_id for tenant isolation.
-- Participants table controls access via user_id membership.

-- ============================================================================
-- CONVERSATIONS
-- ============================================================================
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;

CREATE POLICY conversations_org_isolation ON conversations
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR org_id = current_setting('symbia.org_id', true)
  );

-- ============================================================================
-- PARTICIPANTS
-- ============================================================================
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants FORCE ROW LEVEL SECURITY;

-- Participants can only see entries for conversations they belong to
-- Join through conversations table for org isolation
CREATE POLICY participants_access ON participants
  FOR ALL
  USING (
    current_setting('symbia.can_bypass_org', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = participants.conversation_id
      AND c.org_id = current_setting('symbia.org_id', true)
    )
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
    OR org_id = current_setting('symbia.org_id', true)
  );
