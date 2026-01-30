import { Router } from 'express';
import { requireAdmin, isOrgAdmin } from '../auth.js';
import { ConversationModel } from '../models/conversation.js';
import { ParticipantModel } from '../models/participant.js';
import { MessageModel } from '../models/message.js';
import { pool } from '../database.js';

const router = Router();

router.get('/conversations', requireAdmin, async (req, res) => {
  try {
    const { orgId, type, limit = '50', offset = '0' } = req.query;
    
    if (orgId && !req.user!.isSuperAdmin && !isOrgAdmin(req.user!, orgId as string)) {
      res.status(403).json({ error: 'Not authorized for this organization' });
      return;
    }

    let query = 'SELECT * FROM conversations WHERE 1=1';
    let countQuery = 'SELECT COUNT(*) FROM conversations WHERE 1=1';
    const params: unknown[] = [];
    const countParams: unknown[] = [];
    let paramIdx = 1;
    let countParamIdx = 1;

    if (orgId) {
      query += ` AND org_id = $${paramIdx++}`;
      countQuery += ` AND org_id = $${countParamIdx++}`;
      params.push(orgId);
      countParams.push(orgId);
    }
    if (type) {
      query += ` AND type = $${paramIdx++}`;
      countQuery += ` AND type = $${countParamIdx++}`;
      params.push(type);
      countParams.push(type);
    }

    query += ` ORDER BY updated_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

    const result = await pool.query(query, params);
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      conversations: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });
  } catch (error) {
    console.error('Error listing all conversations:', error);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

router.get('/conversations/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id as string;
    const conversation = await ConversationModel.getById(id);
    
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    if (conversation.org_id && !req.user!.isSuperAdmin && !isOrgAdmin(req.user!, conversation.org_id)) {
      res.status(403).json({ error: 'Not authorized for this organization' });
      return;
    }

    const participants = await ParticipantModel.listForConversation(id);
    const messages = await MessageModel.listForConversation(id, { limit: 100 });

    res.json({
      ...conversation,
      participants,
      recentMessages: messages,
    });
  } catch (error) {
    console.error('Error getting conversation:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

router.delete('/conversations/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id as string;
    const conversation = await ConversationModel.getById(id);
    
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    if (conversation.org_id && !req.user!.isSuperAdmin && !isOrgAdmin(req.user!, conversation.org_id)) {
      res.status(403).json({ error: 'Not authorized for this organization' });
      return;
    }

    await ConversationModel.delete(id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

router.get('/users/:userId/conversations', requireAdmin, async (req, res) => {
  try {
    const userId = req.params.userId as string;
    const conversations = await ConversationModel.listForUser(userId);
    res.json(conversations);
  } catch (error) {
    console.error('Error listing user conversations:', error);
    res.status(500).json({ error: 'Failed to list user conversations' });
  }
});

router.post('/conversations/:id/participants', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id as string;
    const { userId, userType, role } = req.body;

    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    const conversation = await ConversationModel.getById(id);
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    if (conversation.org_id && !req.user!.isSuperAdmin && !isOrgAdmin(req.user!, conversation.org_id)) {
      res.status(403).json({ error: 'Not authorized for this organization' });
      return;
    }

    const participant = await ParticipantModel.add(id, userId, userType || 'user', role || 'member');
    res.status(201).json(participant);
  } catch (error) {
    console.error('Error adding participant:', error);
    res.status(500).json({ error: 'Failed to add participant' });
  }
});

router.delete('/conversations/:id/participants/:userId', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id as string;
    const userId = req.params.userId as string;

    const conversation = await ConversationModel.getById(id);
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    if (conversation.org_id && !req.user!.isSuperAdmin && !isOrgAdmin(req.user!, conversation.org_id)) {
      res.status(403).json({ error: 'Not authorized for this organization' });
      return;
    }

    const removed = await ParticipantModel.remove(id, userId);
    if (!removed) {
      res.status(404).json({ error: 'Participant not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error removing participant:', error);
    res.status(500).json({ error: 'Failed to remove participant' });
  }
});

router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const { orgId, type } = req.query;

    if (orgId && !req.user!.isSuperAdmin && !isOrgAdmin(req.user!, orgId as string)) {
      res.status(403).json({ error: 'Not authorized for this organization' });
      return;
    }

    let convWhereClause = 'WHERE 1=1';
    const convParams: unknown[] = [];
    let paramIdx = 1;

    if (orgId) {
      convWhereClause += ` AND org_id = $${paramIdx++}`;
      convParams.push(orgId);
    }
    if (type) {
      convWhereClause += ` AND type = $${paramIdx++}`;
      convParams.push(type);
    }

    const conversationsResult = await pool.query(
      `SELECT COUNT(*) FROM conversations ${convWhereClause}`,
      convParams
    );

    const messagesResult = await pool.query(
      `SELECT COUNT(*) FROM messages m 
       JOIN conversations c ON m.conversation_id = c.id 
       ${convWhereClause.replace('WHERE', 'WHERE')}`.replace('org_id', 'c.org_id').replace('type', 'c.type'),
      convParams
    );

    const participantsResult = await pool.query(
      `SELECT COUNT(DISTINCT p.user_id) FROM participants p
       JOIN conversations c ON p.conversation_id = c.id
       ${convWhereClause.replace('WHERE', 'WHERE')}`.replace('org_id', 'c.org_id').replace('type', 'c.type'),
      convParams
    );

    const activeConvWhereClause = convWhereClause + ` AND updated_at > NOW() - INTERVAL '24 hours'`;
    const activeResult = await pool.query(
      `SELECT COUNT(*) FROM conversations ${activeConvWhereClause}`,
      convParams
    );

    res.json({
      totalConversations: parseInt(conversationsResult.rows[0].count, 10),
      totalMessages: parseInt(messagesResult.rows[0].count, 10),
      uniqueParticipants: parseInt(participantsResult.rows[0].count, 10),
      activeConversations24h: parseInt(activeResult.rows[0].count, 10),
      filters: { orgId: orgId || null, type: type || null },
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

export default router;
