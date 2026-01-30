import { pool } from '../database.js';

export interface Participant {
  id: string;
  conversation_id: string;
  user_id: string;
  user_type: 'user' | 'agent';
  role: 'owner' | 'admin' | 'member';
  entity_id?: string;  // Entity UUID from Identity service (ent_xxx format)
  joined_at: Date;
  last_read_at?: Date;
}

export const ParticipantModel = {
  /**
   * Add a participant to a conversation.
   * Supports both legacy user_id and new entity_id addressing.
   *
   * @param conversationId - The conversation UUID
   * @param userId - Legacy user identifier (e.g., "assistant:log-analyst")
   * @param userType - 'user' or 'agent' (auto-detected if not provided)
   * @param role - Participant role in the conversation
   * @param entityId - Optional Entity UUID from Identity service (ent_xxx format)
   */
  async add(
    conversationId: string,
    userId: string,
    userType?: 'user' | 'agent',
    role: 'owner' | 'admin' | 'member' = 'member',
    entityId?: string
  ): Promise<Participant> {
    // Auto-detect agent type from userId pattern
    const resolvedUserType = userType ?? (
      userId.startsWith('assistant:') || userId.startsWith('agent:') ? 'agent' : 'user'
    );

    const result = await pool.query(
      `INSERT INTO participants (conversation_id, user_id, user_type, role, entity_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (conversation_id, user_id) DO UPDATE SET
         role = EXCLUDED.role,
         entity_id = COALESCE(EXCLUDED.entity_id, participants.entity_id)
       RETURNING *`,
      [conversationId, userId, resolvedUserType, role, entityId]
    );
    return result.rows[0];
  },

  async remove(conversationId: string, userId: string): Promise<boolean> {
    const result = await pool.query(
      'DELETE FROM participants WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  },

  async listForConversation(conversationId: string): Promise<Participant[]> {
    const result = await pool.query(
      'SELECT * FROM participants WHERE conversation_id = $1',
      [conversationId]
    );
    return result.rows;
  },

  async isParticipant(conversationId: string, userId: string): Promise<boolean> {
    const result = await pool.query(
      'SELECT 1 FROM participants WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, userId]
    );
    return result.rows.length > 0;
  },

  async getRole(conversationId: string, userId: string): Promise<string | null> {
    const result = await pool.query(
      'SELECT role FROM participants WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, userId]
    );
    return result.rows[0]?.role || null;
  },

  async updateLastRead(conversationId: string, userId: string): Promise<void> {
    await pool.query(
      'UPDATE participants SET last_read_at = NOW() WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, userId]
    );
  },

  async getConversationsForUser(userId: string): Promise<string[]> {
    const result = await pool.query(
      'SELECT conversation_id FROM participants WHERE user_id = $1',
      [userId]
    );
    return result.rows.map((r: { conversation_id: string }) => r.conversation_id);
  },

  async getAssistantParticipants(conversationId: string): Promise<Participant[]> {
    const result = await pool.query(
      `SELECT * FROM participants
       WHERE conversation_id = $1
       AND user_type = 'agent'
       AND user_id LIKE 'assistant:%'`,
      [conversationId]
    );
    return result.rows;
  },

  isAssistantUserId(userId: string): boolean {
    return userId.startsWith('assistant:');
  },

  getAssistantKey(userId: string): string | null {
    if (!userId.startsWith('assistant:')) return null;
    return userId.replace('assistant:', '');
  },

  // ===========================================================================
  // Entity-based methods (for UUID-to-UUID messaging)
  // ===========================================================================

  /**
   * Get participant by entity ID.
   * Used for entity-based message routing.
   */
  async getByEntityId(conversationId: string, entityId: string): Promise<Participant | null> {
    const result = await pool.query(
      'SELECT * FROM participants WHERE conversation_id = $1 AND entity_id = $2',
      [conversationId, entityId]
    );
    return result.rows[0] || null;
  },

  /**
   * Check if an entity is a participant in a conversation.
   */
  async isEntityParticipant(conversationId: string, entityId: string): Promise<boolean> {
    const result = await pool.query(
      'SELECT 1 FROM participants WHERE conversation_id = $1 AND entity_id = $2',
      [conversationId, entityId]
    );
    return result.rows.length > 0;
  },

  /**
   * Get all conversations for an entity.
   * Used for routing messages to the right conversations.
   */
  async getConversationsForEntity(entityId: string): Promise<string[]> {
    const result = await pool.query(
      'SELECT conversation_id FROM participants WHERE entity_id = $1',
      [entityId]
    );
    return result.rows.map((r: { conversation_id: string }) => r.conversation_id);
  },

  /**
   * Get all entity IDs participating in a conversation.
   * Used for broadcasting messages via SDN.
   */
  async getEntityIdsForConversation(conversationId: string): Promise<string[]> {
    const result = await pool.query(
      'SELECT entity_id FROM participants WHERE conversation_id = $1 AND entity_id IS NOT NULL',
      [conversationId]
    );
    return result.rows.map((r: { entity_id: string }) => r.entity_id);
  },

  /**
   * Update a participant's entity ID.
   * Used when migrating from legacy user_id to entity-based addressing.
   */
  async setEntityId(conversationId: string, userId: string, entityId: string): Promise<boolean> {
    const result = await pool.query(
      'UPDATE participants SET entity_id = $1 WHERE conversation_id = $2 AND user_id = $3',
      [entityId, conversationId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  },

  /**
   * Bulk update entity IDs for all participants with a given user_id.
   * Used for migrating existing conversations to entity-based addressing.
   */
  async migrateUserIdToEntityId(userId: string, entityId: string): Promise<number> {
    const result = await pool.query(
      'UPDATE participants SET entity_id = $1 WHERE user_id = $2 AND entity_id IS NULL',
      [entityId, userId]
    );
    return result.rowCount ?? 0;
  },
};
