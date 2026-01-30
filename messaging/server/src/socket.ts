import { Server, Socket } from 'socket.io';
import { config } from './config.js';
import { introspectToken, verifyApiKey, verifySessionCookie } from './auth.js';
import { ParticipantModel } from './models/participant.js';
import { MessageModel } from './models/message.js';
import { notifyAssistants } from './webhooks.js';

// =============================================================================
// Participant Cache
// Reduces database queries for frequent participant checks
// =============================================================================
interface ParticipantCacheEntry {
  conversationIds: Set<string>;
  timestamp: number;
}

const participantCache = new Map<string, ParticipantCacheEntry>();
const PARTICIPANT_CACHE_TTL_MS = 60000; // 1 minute cache TTL

function getCachedParticipantStatus(userId: string, conversationId: string): boolean | null {
  const entry = participantCache.get(userId);
  if (!entry) return null;

  // Check if cache is stale
  if (Date.now() - entry.timestamp > PARTICIPANT_CACHE_TTL_MS) {
    participantCache.delete(userId);
    return null;
  }

  return entry.conversationIds.has(conversationId);
}

function setCachedParticipantStatus(userId: string, conversationId: string, isParticipant: boolean): void {
  let entry = participantCache.get(userId);
  if (!entry) {
    entry = { conversationIds: new Set(), timestamp: Date.now() };
    participantCache.set(userId, entry);
  }

  if (isParticipant) {
    entry.conversationIds.add(conversationId);
  } else {
    entry.conversationIds.delete(conversationId);
  }
  entry.timestamp = Date.now();
}

function invalidateParticipantCache(userId: string): void {
  participantCache.delete(userId);
}

function addToParticipantCache(userId: string, conversationIds: string[]): void {
  participantCache.set(userId, {
    conversationIds: new Set(conversationIds),
    timestamp: Date.now(),
  });
}

/**
 * Check if user is participant with caching
 */
async function isParticipantCached(conversationId: string, userId: string): Promise<boolean> {
  // Check cache first
  const cached = getCachedParticipantStatus(userId, conversationId);
  if (cached !== null) {
    return cached;
  }

  // Cache miss - query database
  const isParticipant = await ParticipantModel.isParticipant(conversationId, userId);
  setCachedParticipantStatus(userId, conversationId, isParticipant);
  return isParticipant;
}

interface SocketAuthUser {
  id: string;
  type: 'user' | 'agent';
  /** Agent identifier (e.g., "agent:onboarding") - only set for agents */
  agentId?: string;
  orgId?: string;
  entitlements: string[];
  isSuperAdmin: boolean;
  /** Auth token for forwarding to webhooks */
  token?: string;
}

interface AuthenticatedSocket extends Socket {
  user?: SocketAuthUser;
}

let socketServer: Server | null = null;

export function emitConversationEvent(conversationId: string, event: string, payload: unknown): void {
  if (!socketServer) return;
  socketServer.to(`conversation:${conversationId}`).emit(event, payload);
}

const allowedPriorities = new Set(['low', 'normal', 'high', 'critical']);

function normalizePriority(priority?: string): 'low' | 'normal' | 'high' | 'critical' | undefined {
  if (!priority) return undefined;
  return allowedPriorities.has(priority) ? (priority as 'low' | 'normal' | 'high' | 'critical') : undefined;
}

function hasEntitlement(user: SocketAuthUser, entitlement: string): boolean {
  if (user.isSuperAdmin) return true;
  return user.entitlements.includes(entitlement);
}

function getCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [key, value] = part.trim().split('=');
    if (key === name && value) {
      return value;
    }
  }
  return null;
}

async function authenticateSocket(socket: AuthenticatedSocket): Promise<SocketAuthUser | null> {
  const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
  const apiKey = socket.handshake.auth.apiKey || socket.handshake.headers['x-api-key'];

  if (token) {
    const user = await introspectToken(token);
    if (user) {
      return {
        id: user.id,
        type: user.type,
        agentId: user.agentId,
        orgId: user.orgId,
        entitlements: user.entitlements || [],
        isSuperAdmin: user.isSuperAdmin || false,
        token, // Store token for forwarding to webhooks
      };
    }
  }

  if (apiKey) {
    const user = await verifyApiKey(apiKey as string);
    if (user) {
      return {
        id: user.id,
        type: user.type,
        agentId: user.agentId,
        orgId: user.orgId,
        entitlements: user.entitlements || [],
        isSuperAdmin: user.isSuperAdmin || false,
        // API key auth doesn't have a token to forward
      };
    }
  }

  const cookieHeader = socket.handshake.headers.cookie as string | undefined;
  const tokenCookie = getCookieValue(cookieHeader, 'token');
  const sessionCookie = tokenCookie ? { name: 'token', value: tokenCookie } : null;
  const symbiaCookie = getCookieValue(cookieHeader, 'symbia_session');
  const fallbackCookie = symbiaCookie ? { name: 'symbia_session', value: symbiaCookie } : null;

  if (sessionCookie || fallbackCookie) {
    const cookie = sessionCookie || fallbackCookie!;
    const user = await verifySessionCookie(cookie);
    if (user) {
      return {
        id: user.id,
        type: user.type,
        agentId: user.agentId,
        orgId: user.orgId,
        entitlements: user.entitlements || [],
        isSuperAdmin: user.isSuperAdmin || false,
        token: cookie.value, // Use session cookie value as token for forwarding
      };
    }
  }

  return null;
}

export function setupSocketHandlers(io: Server): void {
  socketServer = io;
  io.use(async (socket: AuthenticatedSocket, next) => {
    const user = await authenticateSocket(socket);
    if (!user) {
      next(new Error('Authentication required'));
      return;
    }
    socket.user = user;
    next();
  });

  io.on('connection', async (socket: AuthenticatedSocket) => {
    const user = socket.user!;
    console.log(`${user.type === 'agent' ? 'Agent' : 'User'} connected: ${user.agentId || user.id}`);

    // Load and cache user's conversations
    const conversationIds = await ParticipantModel.getConversationsForUser(user.id);
    addToParticipantCache(user.id, conversationIds);

    for (const convId of conversationIds) {
      socket.join(`conversation:${convId}`);
      // Notify other participants that this user/agent is now online
      socket.to(`conversation:${convId}`).emit('participant:online', {
        conversationId: convId,
        userId: user.id,
        userType: user.type,
        agentId: user.agentId,
      });
    }

    socket.on('join:conversation', async (conversationId: string, callback?: (result: { success: boolean; error?: string }) => void) => {
      try {
        // Use cached participant check
        const isParticipant = await isParticipantCached(conversationId, user.id);
        if (!isParticipant) {
          callback?.({ success: false, error: 'Not a participant' });
          return;
        }
        socket.join(`conversation:${conversationId}`);
        callback?.({ success: true });
      } catch (error) {
        console.error('Error joining conversation room:', error);
        callback?.({ success: false, error: 'Failed to join' });
      }
    });

    socket.on('leave:conversation', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on('message:send', async (data: {
      conversationId: string;
      id?: string;
      content: string;
      contentType?: string;
      replyTo?: string;
      metadata?: Record<string, unknown>;
      runId?: string;
      traceId?: string;
      priority?: 'low' | 'normal' | 'high' | 'critical';
      interruptible?: boolean;
      preemptedBy?: string;
    }, callback?: (result: { success: boolean; message?: unknown; error?: string }) => void) => {
      try {
        // Use cached participant check
        const isParticipant = await isParticipantCached(data.conversationId, user.id);
        if (!isParticipant) {
          callback?.({ success: false, error: 'Not a participant' });
          return;
        }

        const message = await MessageModel.create({
          conversationId: data.conversationId,
          senderId: user.id,
          senderType: user.type,
          id: data.id,
          content: data.content,
          contentType: data.contentType,
          replyTo: data.replyTo,
          metadata: data.metadata,
          runId: data.runId,
          traceId: data.traceId,
          priority: normalizePriority(data.priority),
          interruptible: data.interruptible,
          preemptedBy: data.preemptedBy,
        });

        console.log('[Socket Message] Broadcasting message:new to room conversation:' + data.conversationId, {
          messageId: message.id,
          senderId: message.sender_id,
          senderType: message.sender_type,
        });
        // Send message directly (not wrapped) - frontend expects Message object
        io.to(`conversation:${data.conversationId}`).emit('message:new', message);
        callback?.({ success: true, message });

        // Notify assistant participants via webhook (don't block socket response)
        if (user.type !== 'agent') {
          // Format auth token for webhook header (needs Bearer prefix)
          const authToken = user.token ? `Bearer ${user.token}` : undefined;
          notifyAssistants(data.conversationId, message, user.id, authToken).catch((err) => {
            console.error('[Socket Webhook] Failed to notify assistants:', err);
          });
        }
      } catch (error) {
        console.error('Error sending message:', error);
        callback?.({ success: false, error: 'Failed to send message' });
      }
    });

    socket.on('control:send', async (data: {
      conversationId: string;
      event: string;
      target?: { principalId: string; principalType: string };
      reason?: string;
      preemptedBy?: string;
      runId?: string;
      traceId?: string;
      metadata?: Record<string, unknown>;
    }, callback?: (result: { success: boolean; control?: unknown; error?: string }) => void) => {
      try {
        // Use cached participant check
        const isParticipant = await isParticipantCached(data.conversationId, user.id);
        if (!isParticipant) {
          callback?.({ success: false, error: 'Not a participant' });
          return;
        }

        const requiresRoute = data.event === 'stream.handoff' || data.event === 'stream.route';
        const entitlement = requiresRoute ? 'cap:messaging.route' : 'cap:messaging.interrupt';
        if (!hasEntitlement(user, entitlement)) {
          callback?.({ success: false, error: 'Not authorized to send control events' });
          return;
        }

        const payload = {
          event: data.event,
          conversationId: data.conversationId,
          target: data.target,
          reason: data.reason,
          preemptedBy: data.preemptedBy,
          runId: data.runId,
          traceId: data.traceId,
          effectiveAt: new Date().toISOString(),
        };

        const controlMessage = await MessageModel.create({
          conversationId: data.conversationId,
          senderId: user.id,
          senderType: user.type,
          content: data.event,
          contentType: 'event',
          metadata: { ...data.metadata, control: payload },
          runId: data.runId,
          traceId: data.traceId,
          priority: 'high',
          interruptible: false,
          preemptedBy: data.preemptedBy,
        });

        io.to(`conversation:${data.conversationId}`).emit(data.event, payload);
        callback?.({ success: true, control: controlMessage });
      } catch (error) {
        console.error('Error sending control event:', error);
        callback?.({ success: false, error: 'Failed to send control event' });
      }
    });

    socket.on('message:edit', async (data: { messageId: string; content: string }, callback?: (result: { success: boolean; message?: unknown; error?: string }) => void) => {
      try {
        const originalMessage = await MessageModel.getById(data.messageId);
        if (!originalMessage) {
          callback?.({ success: false, error: 'Message not found' });
          return;
        }

        if (originalMessage.sender_id !== user.id) {
          callback?.({ success: false, error: 'Not authorized to edit this message' });
          return;
        }

        const message = await MessageModel.update(data.messageId, data.content);
        if (message) {
          io.to(`conversation:${originalMessage.conversation_id}`).emit('message:updated', message);
        }
        callback?.({ success: true, message });
      } catch (error) {
        console.error('Error editing message:', error);
        callback?.({ success: false, error: 'Failed to edit message' });
      }
    });

    socket.on('message:delete', async (messageId: string, callback?: (result: { success: boolean; error?: string }) => void) => {
      try {
        const message = await MessageModel.getById(messageId);
        if (!message) {
          callback?.({ success: false, error: 'Message not found' });
          return;
        }

        if (message.sender_id !== user.id) {
          callback?.({ success: false, error: 'Not authorized to delete this message' });
          return;
        }

        await MessageModel.delete(messageId);
        io.to(`conversation:${message.conversation_id}`).emit('message:deleted', { id: messageId, conversationId: message.conversation_id });
        callback?.({ success: true });
      } catch (error) {
        console.error('Error deleting message:', error);
        callback?.({ success: false, error: 'Failed to delete message' });
      }
    });

    socket.on('typing:start', async (conversationId: string) => {
      // Use cached participant check for typing events (high frequency)
      const isParticipant = await isParticipantCached(conversationId, user.id);
      if (isParticipant) {
        socket.to(`conversation:${conversationId}`).emit('typing:started', {
          conversationId,
          userId: user.id,
          userType: user.type,
        });
      }
    });

    socket.on('typing:stop', async (conversationId: string) => {
      // Use cached participant check for typing events (high frequency)
      const isParticipant = await isParticipantCached(conversationId, user.id);
      if (isParticipant) {
        socket.to(`conversation:${conversationId}`).emit('typing:stopped', {
          conversationId,
          userId: user.id,
          userType: user.type,
        });
      }
    });

    socket.on('presence:update', (status: 'online' | 'away' | 'busy' | 'offline') => {
      socket.broadcast.emit('presence:changed', {
        userId: user.id,
        userType: user.type,
        agentId: user.agentId,
        status,
      });
    });

    // ========================================================================
    // Agent-Specific Events
    // ========================================================================

    /**
     * Allow agents to watch a conversation without being a participant.
     * Requires the 'cap:messaging.observe' entitlement.
     * Watchers receive events but cannot send messages.
     */
    socket.on('watch:conversation', async (conversationId: string, callback?: (result: { success: boolean; error?: string }) => void) => {
      try {
        // Only agents with observe capability can watch
        if (user.type !== 'agent' || !hasEntitlement(user, 'cap:messaging.observe')) {
          callback?.({ success: false, error: 'Observe capability required' });
          return;
        }
        socket.join(`conversation:${conversationId}`);
        console.log(`Agent ${user.agentId || user.id} started watching conversation ${conversationId}`);
        callback?.({ success: true });
      } catch (error) {
        console.error('Error watching conversation:', error);
        callback?.({ success: false, error: 'Failed to watch conversation' });
      }
    });

    /**
     * Stop watching a conversation
     */
    socket.on('unwatch:conversation', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
      console.log(`Agent ${user.agentId || user.id} stopped watching conversation ${conversationId}`);
    });

    /**
     * Emit presence when joining a conversation room.
     * This allows other participants to see who is actively connected.
     */
    socket.on('announce:presence', async (conversationId: string) => {
      // Use cached participant check
      const isParticipant = await isParticipantCached(conversationId, user.id);
      if (isParticipant) {
        io.to(`conversation:${conversationId}`).emit('participant:online', {
          conversationId,
          userId: user.id,
          userType: user.type,
          agentId: user.agentId,
        });
      }
    });

    socket.on('disconnect', async () => {
      console.log(`${user.type === 'agent' ? 'Agent' : 'User'} disconnected: ${user.agentId || user.id}`);

      // Use cached conversation list if available, otherwise fetch
      const cached = participantCache.get(user.id);
      const conversationIds = cached
        ? Array.from(cached.conversationIds)
        : await ParticipantModel.getConversationsForUser(user.id);

      for (const convId of conversationIds) {
        io.to(`conversation:${convId}`).emit('participant:offline', {
          conversationId: convId,
          userId: user.id,
          userType: user.type,
          agentId: user.agentId,
        });
      }

      // Invalidate cache on disconnect (will be refreshed on reconnect)
      invalidateParticipantCache(user.id);

      // Global presence broadcast
      socket.broadcast.emit('presence:changed', {
        userId: user.id,
        userType: user.type,
        agentId: user.agentId,
        status: 'offline',
      });
    });
  });
}
