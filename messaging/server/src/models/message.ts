import { pool } from '../database.js';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: 'user' | 'agent' | 'service' | 'bot';
  content: string;
  content_type: string;
  reply_to?: string;
  org_id?: string;
  run_id?: string;
  trace_id?: string;
  sequence?: number;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  interruptible?: boolean;
  preempted_by?: string;
  created_at: Date;
  updated_at?: Date;
  deleted_at?: Date;
  metadata: Record<string, unknown>;
}

export interface CreateMessageInput {
  id?: string;
  conversationId: string;
  senderId: string;
  senderType?: 'user' | 'agent' | 'service' | 'bot';
  content: string;
  contentType?: string;
  replyTo?: string;
  metadata?: Record<string, unknown>;
  orgId?: string;
  runId?: string;
  traceId?: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  interruptible?: boolean;
  preemptedBy?: string;
}

export const MessageModel = {
  async create(input: CreateMessageInput): Promise<Message> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const conversation = await client.query(
        'SELECT org_id FROM conversations WHERE id = $1 FOR UPDATE',
        [input.conversationId]
      );
      const orgId = input.orgId ?? conversation.rows[0]?.org_id ?? null;

      const seqResult = await client.query(
        'SELECT COALESCE(MAX(sequence), 0) + 1 AS seq FROM messages WHERE conversation_id = $1',
        [input.conversationId]
      );
      const sequence = Number(seqResult.rows[0]?.seq || 1);

      const priority = input.priority || 'normal';
      const interruptible = input.interruptible ?? true;
      const senderType = input.senderType || 'user';

      const messageId = input.id || crypto.randomUUID();

      // Use ON CONFLICT DO UPDATE to properly handle idempotency
      // This ensures we always return the message (new or existing)
      const insertResult = await client.query(
        `INSERT INTO messages (
          id,
          conversation_id,
          sender_id,
          sender_type,
          content,
          content_type,
          reply_to,
          org_id,
          run_id,
          trace_id,
          sequence,
          priority,
          interruptible,
          preempted_by,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (id) DO UPDATE SET
          updated_at = NOW()
        RETURNING *`,
        [
          messageId,
          input.conversationId,
          input.senderId,
          senderType,
          input.content,
          input.contentType || 'text',
          input.replyTo || null,
          orgId,
          input.runId || null,
          input.traceId || null,
          sequence,
          priority,
          interruptible,
          input.preemptedBy || null,
          input.metadata || {},
        ]
      );

      const message = insertResult.rows[0];

      await client.query(
        'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
        [input.conversationId]
      );

      await client.query('COMMIT');
      if (!message) {
        throw new Error('Failed to create message');
      }
      return message;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async getById(id: string): Promise<Message | null> {
    const result = await pool.query(
      'SELECT * FROM messages WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    return result.rows[0] || null;
  },

  async listForConversation(conversationId: string, options: { limit?: number; before?: Date; after?: Date } = {}): Promise<Message[]> {
    const limit = options.limit || 50;

    if (options.before) {
      const result = await pool.query(
        `SELECT * FROM messages 
         WHERE conversation_id = $1 AND deleted_at IS NULL AND created_at < $2
         ORDER BY created_at DESC LIMIT $3`,
        [conversationId, options.before, limit]
      );
      return result.rows;
    }

    if (options.after) {
      const result = await pool.query(
        `SELECT * FROM messages 
         WHERE conversation_id = $1 AND deleted_at IS NULL AND created_at > $2
         ORDER BY created_at ASC LIMIT $3`,
        [conversationId, options.after, limit]
      );
      return result.rows;
    }

    const result = await pool.query(
      `SELECT * FROM messages
       WHERE conversation_id = $1 AND deleted_at IS NULL
       ORDER BY sequence ASC NULLS LAST, created_at ASC LIMIT $2`,
      [conversationId, limit]
    );
    return result.rows;
  },

  async update(id: string, content: string): Promise<Message | null> {
    const result = await pool.query(
      `UPDATE messages SET content = $1, updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [content, id]
    );
    return result.rows[0] || null;
  },

  async delete(id: string): Promise<boolean> {
    const result = await pool.query(
      'UPDATE messages SET deleted_at = NOW() WHERE id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  },
};
