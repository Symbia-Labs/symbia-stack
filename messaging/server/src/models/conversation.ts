import { pool } from '../database.js';

export interface Conversation {
  id: string;
  type: 'private' | 'group';
  name?: string;
  description?: string;
  org_id?: string;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  metadata: Record<string, unknown>;
}

export interface CreateConversationInput {
  type: 'private' | 'group';
  name?: string;
  description?: string;
  orgId?: string;
  createdBy: string;
  metadata?: Record<string, unknown>;
}

export const ConversationModel = {
  async create(input: CreateConversationInput): Promise<Conversation> {
    const result = await pool.query(
      `INSERT INTO conversations (type, name, description, org_id, created_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [input.type, input.name, input.description, input.orgId, input.createdBy, input.metadata || {}]
    );
    return result.rows[0];
  },

  async getById(id: string): Promise<Conversation | null> {
    const result = await pool.query('SELECT * FROM conversations WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async listForUser(userId: string, orgId?: string): Promise<Conversation[]> {
    if (orgId) {
      const result = await pool.query(
        `SELECT c.* FROM conversations c
         JOIN participants p ON c.id = p.conversation_id
         WHERE p.user_id = $1 AND (c.org_id = $2 OR c.org_id IS NULL)
         ORDER BY c.updated_at DESC`,
        [userId, orgId]
      );
      return result.rows;
    }
    const result = await pool.query(
      `SELECT c.* FROM conversations c
       JOIN participants p ON c.id = p.conversation_id
       WHERE p.user_id = $1
       ORDER BY c.updated_at DESC`,
      [userId]
    );
    return result.rows;
  },

  async update(id: string, updates: Partial<Pick<Conversation, 'name' | 'description' | 'metadata'>>): Promise<Conversation | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${idx++}`);
      values.push(updates.description);
    }
    if (updates.metadata !== undefined) {
      fields.push(`metadata = $${idx++}`);
      values.push(updates.metadata);
    }

    if (fields.length === 0) {
      return this.getById(id);
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE conversations SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  },

  async delete(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM conversations WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  },

  /**
   * Find a conversation by channel metadata
   * Used by the channel bridge to find existing conversations for channel chats
   */
  async findByChannelMetadata(
    channelType: string,
    connectionId: string,
    chatId: string
  ): Promise<Conversation | null> {
    const result = await pool.query(
      `SELECT * FROM conversations
       WHERE metadata->'channel'->>'type' = $1
         AND metadata->'channel'->>'connectionId' = $2
         AND metadata->'channel'->>'chatId' = $3
       LIMIT 1`,
      [channelType, connectionId, chatId]
    );
    return result.rows[0] || null;
  },
};
