import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, isOrgMember } from '../auth.js';
import { ConversationModel } from '../models/conversation.js';
import { ParticipantModel } from '../models/participant.js';
import { MessageModel } from '../models/message.js';
import { emitConversationEvent } from '../socket.js';
import { notifyAssistants } from '../webhooks.js';
import { emitEvent } from '@symbia/relay';

const router = Router();

const allowedPriorities = new Set(['low', 'normal', 'high', 'critical']);

function normalizePriority(priority?: string): 'low' | 'normal' | 'high' | 'critical' | undefined {
  if (!priority) return undefined;
  return allowedPriorities.has(priority) ? (priority as 'low' | 'normal' | 'high' | 'critical') : undefined;
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const orgId =
      (req.query.orgId as string | undefined) ||
      (req.headers['x-org-id'] as string | undefined);
    if (orgId && !isOrgMember(req.user!, orgId)) {
      res.status(403).json({ error: 'Not authorized for this organization' });
      return;
    }
    const conversations = await ConversationModel.listForUser(req.user!.id, orgId);
    res.json(conversations);
  } catch (error) {
    console.error('Error listing conversations:', error);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { type, name, description, metadata, participants } = req.body;
    const orgId =
      (req.body?.orgId as string | undefined) ||
      (req.headers['x-org-id'] as string | undefined);

    if (orgId && !isOrgMember(req.user!, orgId)) {
      res.status(403).json({ error: 'Not authorized for this organization' });
      return;
    }

    if (!type || !['private', 'group'].includes(type)) {
      res.status(400).json({ error: 'Invalid conversation type' });
      return;
    }

    if (type === 'group' && !name) {
      res.status(400).json({ error: 'Group conversations require a name' });
      return;
    }

    const conversation = await ConversationModel.create({
      type,
      name,
      description,
      orgId,
      createdBy: req.user!.id,
      metadata,
    });

    await ParticipantModel.add(conversation.id, req.user!.id, req.user!.type, 'owner');

    if (participants && Array.isArray(participants)) {
      for (const p of participants) {
        if (p.userId && p.userId !== req.user!.id) {
          await ParticipantModel.add(conversation.id, p.userId, p.userType || 'user', 'member');
        }
      }
    }

    const allParticipants = await ParticipantModel.listForConversation(conversation.id);
    res.status(201).json({ ...conversation, participants: allParticipants });
  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;
    
    const isParticipant = await ParticipantModel.isParticipant(id, req.user!.id);
    if (!isParticipant) {
      res.status(403).json({ error: 'Not a participant in this conversation' });
      return;
    }

    const conversation = await ConversationModel.getById(id);
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const participants = await ParticipantModel.listForConversation(id);
    res.json({ ...conversation, participants });
  } catch (error) {
    console.error('Error getting conversation:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;
    const { name, description, metadata } = req.body;

    const role = await ParticipantModel.getRole(id, req.user!.id);
    if (!role || !['owner', 'admin'].includes(role)) {
      res.status(403).json({ error: 'Not authorized to update this conversation' });
      return;
    }

    const conversation = await ConversationModel.update(id, { name, description, metadata });
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    res.json(conversation);
  } catch (error) {
    console.error('Error updating conversation:', error);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;

    const role = await ParticipantModel.getRole(id, req.user!.id);
    if (role !== 'owner') {
      res.status(403).json({ error: 'Only the owner can delete this conversation' });
      return;
    }

    const deleted = await ConversationModel.delete(id);
    if (!deleted) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

router.post('/:id/join', requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;
    
    const conversation = await ConversationModel.getById(id);
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    if (conversation.type === 'private') {
      res.status(400).json({ error: 'Cannot join a private conversation' });
      return;
    }

    if (conversation.org_id && !isOrgMember(req.user!, conversation.org_id)) {
      res.status(403).json({ error: 'Not authorized for this organization' });
      return;
    }

    const participant = await ParticipantModel.add(id, req.user!.id, req.user!.type, 'member');
    res.status(201).json(participant);
  } catch (error) {
    console.error('Error joining conversation:', error);
    res.status(500).json({ error: 'Failed to join conversation' });
  }
});

router.post('/:id/leave', requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;

    const role = await ParticipantModel.getRole(id, req.user!.id);
    if (role === 'owner') {
      res.status(400).json({ error: 'Owner cannot leave the conversation. Transfer ownership or delete it.' });
      return;
    }

    const removed = await ParticipantModel.remove(id, req.user!.id);
    if (!removed) {
      res.status(404).json({ error: 'Not a participant in this conversation' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error leaving conversation:', error);
    res.status(500).json({ error: 'Failed to leave conversation' });
  }
});

router.post('/:id/participants', requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;
    const { userId, userType } = req.body;

    if (!userId) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    const role = await ParticipantModel.getRole(id, req.user!.id);
    if (!role || !['owner', 'admin'].includes(role)) {
      res.status(403).json({ error: 'Not authorized to add participants' });
      return;
    }

    const participant = await ParticipantModel.add(id, userId, userType, 'member');
    res.status(201).json(participant);
  } catch (error) {
    console.error('Error adding participant:', error);
    res.status(500).json({ error: 'Failed to add participant' });
  }
});

router.delete('/:id/participants/:userId', requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;
    const userId = req.params.userId as string;

    const role = await ParticipantModel.getRole(id, req.user!.id);
    if (!role || !['owner', 'admin'].includes(role)) {
      res.status(403).json({ error: 'Not authorized to remove participants' });
      return;
    }

    const targetRole = await ParticipantModel.getRole(id, userId);
    if (targetRole === 'owner') {
      res.status(400).json({ error: 'Cannot remove the owner' });
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

router.get('/:id/messages', requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;
    const { limit, before, after } = req.query;

    const isParticipant = await ParticipantModel.isParticipant(id, req.user!.id);
    if (!isParticipant) {
      res.status(403).json({ error: 'Not a participant in this conversation' });
      return;
    }

    const messages = await MessageModel.listForConversation(id, {
      limit: limit ? parseInt(limit as string, 10) : undefined,
      before: before ? new Date(before as string) : undefined,
      after: after ? new Date(after as string) : undefined,
    });

    await ParticipantModel.updateLastRead(id, req.user!.id);
    res.json(messages);
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

router.post('/:id/messages', requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;
    const { content, contentType, replyTo, metadata, id: messageId, runId, traceId, priority, interruptible, preemptedBy } = req.body;

    if (!content) {
      res.status(400).json({ error: 'Message content is required' });
      return;
    }

    if (contentType === 'event') {
      res.status(400).json({ error: 'Use /control for stream events' });
      return;
    }

    let isParticipant = await ParticipantModel.isParticipant(id, req.user!.id);

    // Auto-add agents as participants when they try to send a message
    // This allows assistants to respond to conversations they're invited to via webhook
    if (!isParticipant && req.user!.type === 'agent') {
      try {
        await ParticipantModel.add(id, req.user!.id, 'agent', 'member');
        console.log(`[Messages] Auto-added agent ${req.user!.id} to conversation ${id}`);
        isParticipant = true;
      } catch (addError) {
        console.error(`[Messages] Failed to auto-add agent ${req.user!.id}:`, addError);
      }
    }

    if (!isParticipant) {
      res.status(403).json({ error: 'Not a participant in this conversation' });
      return;
    }

    const message = await MessageModel.create({
      conversationId: id,
      senderId: req.user!.id,
      senderType: req.user!.type,
      id: messageId,
      content,
      contentType,
      replyTo,
      metadata,
      runId,
      traceId,
      priority: normalizePriority(priority),
      interruptible,
      preemptedBy,
    });

    console.log('[REST Message] Broadcasting message:new to room conversation:' + id, {
      messageId: message.id,
      senderId: message.sender_id,
      senderType: message.sender_type,
    });
    emitConversationEvent(id, 'message:new', message);

    // Notify assistant participants via webhook (don't block response)
    if (req.user!.type !== 'agent') {
      const authToken = req.headers.authorization;
      notifyAssistants(id, message, req.user!.id, authToken as string | undefined).catch((err) => {
        console.error('[Webhook] Failed to notify assistants:', err);
      });
    } else {
      // For agent messages, check if this is a channel-linked conversation
      // If so, emit message.new SDN event for the bridge to route back to the channel
      const conversation = await ConversationModel.getById(id);
      const channelMetadata = conversation?.metadata?.channel as { type?: string; connectionId?: string; chatId?: string } | undefined;
      if (channelMetadata?.connectionId) {
        const runId = uuidv4();
        console.log(`[SDN] Agent message to channel-linked conversation ${id}, emitting message.new`);
        emitEvent('message.new', {
          conversationId: id,
          message: {
            id: message.id,
            sender_id: message.sender_id,
            sender_type: message.sender_type,
            content: message.content,
            content_type: message.content_type,
            metadata: message.metadata,
            created_at: message.created_at,
          },
          channel: channelMetadata,
        }, runId, { boundary: 'intra' }).catch((err) => {
          console.error('[SDN] Failed to emit message.new:', err);
        });
      }
    }

    res.status(201).json(message);
  } catch (error) {
    console.error('Error creating message:', error);
    res.status(500).json({ error: 'Failed to create message' });
  }
});

router.post('/:id/control', requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;
    const { event, target, reason, metadata, runId, traceId, preemptedBy } = req.body;

    if (!event || typeof event !== 'string') {
      res.status(400).json({ error: 'Control event is required' });
      return;
    }

    const isParticipant = await ParticipantModel.isParticipant(id, req.user!.id);
    if (!isParticipant) {
      res.status(403).json({ error: 'Not a participant in this conversation' });
      return;
    }

    const requiresRoute = event === 'stream.handoff' || event === 'stream.route';
    const entitlement = requiresRoute ? 'cap:messaging.route' : 'cap:messaging.interrupt';
    const hasEntitlement = req.user!.isSuperAdmin || req.user!.entitlements.includes(entitlement);
    if (!hasEntitlement) {
      res.status(403).json({ error: 'Not authorized to send control events' });
      return;
    }

    const payload = {
      event,
      conversationId: id,
      target,
      reason,
      preemptedBy,
      runId,
      traceId,
      effectiveAt: new Date().toISOString(),
    };

    const controlMessage = await MessageModel.create({
      conversationId: id,
      senderId: req.user!.id,
      senderType: req.user!.type,
      content: event,
      contentType: 'event',
      metadata: { ...metadata, control: payload },
      runId,
      traceId,
      priority: 'high',
      interruptible: false,
      preemptedBy,
    });

    emitConversationEvent(id, event, payload);
    res.status(201).json(controlMessage);
  } catch (error) {
    console.error('Error sending control event:', error);
    res.status(500).json({ error: 'Failed to send control event' });
  }
});

export default router;
