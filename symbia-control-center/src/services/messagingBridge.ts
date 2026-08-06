import { endpoints } from '@/config/endpoints';
import { useAuthStore } from '@/stores/authStore';
import { useOrgStore } from '@/stores/orgStore';
import type { Conversation, Message } from '@/stores/messagingStore';

// Types for messaging operations
export interface CreateConversationParams {
  type: 'private' | 'group';
  name?: string;
  description?: string;
  participants?: Array<{ userId: string; userType?: 'user' | 'agent' }>;
  metadata?: Record<string, unknown>;
}

export interface SendMessageParams {
  content: string;
  contentType?: string;
  replyTo?: string;
  metadata?: Record<string, unknown>;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  interruptible?: boolean;
}

export interface ControlEventParams {
  event: string;
  target?: { principalId: string; principalType: string };
  reason?: string;
  metadata?: Record<string, unknown>;
}

class MessagingBridge {
  private getHeaders(): Record<string, string> {
    const token = useAuthStore.getState().token;
    const orgId = useOrgStore.getState().currentOrgId;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (orgId) {
      headers['X-Org-Id'] = orgId;
    }

    return headers;
  }

  async listConversations(): Promise<Conversation[]> {
    const response = await fetch(endpoints.messaging.conversations, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to list conversations');
    }

    const data = await response.json();
    return data.conversations || data;
  }

  async getConversation(id: string): Promise<Conversation> {
    const response = await fetch(`${endpoints.messaging.conversations}/${id}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to get conversation');
    }

    return response.json();
  }

  async createConversation(params: CreateConversationParams): Promise<Conversation> {
    const response = await fetch(endpoints.messaging.conversations, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to create conversation' }));
      throw new Error(error.message);
    }

    return response.json();
  }

  async getMessages(
    conversationId: string,
    options?: { limit?: number; before?: string; after?: string }
  ): Promise<Message[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.before) params.set('before', options.before);
    if (options?.after) params.set('after', options.after);

    const url = `${endpoints.messaging.messages(conversationId)}${params.toString() ? `?${params}` : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to get messages');
    }

    const data = await response.json();
    return data.messages || data;
  }

  async sendMessage(
    conversationId: string,
    params: SendMessageParams
  ): Promise<Message> {
    const response = await fetch(endpoints.messaging.messages(conversationId), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to send message' }));
      throw new Error(error.message);
    }

    return response.json();
  }

  async sendControl(
    conversationId: string,
    params: ControlEventParams
  ): Promise<void> {
    const response = await fetch(endpoints.messaging.control(conversationId), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to send control event' }));
      throw new Error(error.message);
    }
  }

  async addParticipant(
    conversationId: string,
    userId: string,
    userType: 'user' | 'agent' = 'user'
  ): Promise<void> {
    const url = `${endpoints.messaging.conversations}/${conversationId}/participants`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ userId, userType }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to add participant' }));
      throw new Error(error.message || error.error);
    }
  }

  async updateConversation(
    conversationId: string,
    updates: { name?: string; description?: string; metadata?: Record<string, unknown> }
  ): Promise<Conversation> {
    const url = `${endpoints.messaging.conversations}/${conversationId}`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to update conversation' }));
      throw new Error(error.message || error.error);
    }

    return response.json();
  }

  async generateTopicName(conversationId: string): Promise<string | null> {
    try {
      // Call the coordinator's topic name generation endpoint
      // Use same URL pattern as assistantsClient for proxy compatibility
      const baseUrl = import.meta.env.DEV
        ? '/api/assistants'
        : `${endpoints.assistants.base}`;
      const url = `${baseUrl}/coordinator/topic-name`;

      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ conversationId }),
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.topicName || null;
    } catch {
      return null;
    }
  }
}

export const messagingBridge = new MessagingBridge();

// Socket.IO connection manager
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let currentHandlers: SocketEventHandlers | null = null;
let connectionId = 0; // Track connection attempts to handle race conditions

// Default timeout for socket emit callbacks (ms)
const SOCKET_EMIT_TIMEOUT = 10000;

export interface SocketEventHandlers {
  onMessage?: (message: Message) => void;
  onMessageUpdate?: (message: Message) => void;
  onMessageDelete?: (event: { id: string; conversationId: string }) => void;
  onTypingStart?: (event: { conversationId: string; userId: string; userType?: string }) => void;
  onTypingStop?: (event: { conversationId: string; userId: string; userType?: string }) => void;
  onControl?: (event: { event: string; conversationId: string; [key: string]: unknown }) => void;
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onError?: (error: Error) => void;
  onReconnecting?: (attempt: number) => void;
  onReconnectFailed?: () => void;
}

/**
 * Helper to wrap socket.emit with a timeout
 * Prevents hanging promises when server doesn't respond
 */
function emitWithTimeout<T>(
  eventName: string,
  data: unknown,
  timeoutMs: number = SOCKET_EMIT_TIMEOUT
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      reject(new Error('Socket not connected'));
      return;
    }

    const timeout = setTimeout(() => {
      reject(new Error(`Socket emit '${eventName}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.emit(eventName, data, (response: T) => {
      clearTimeout(timeout);
      resolve(response);
    });
  });
}

/**
 * Setup all socket event listeners
 * Extracted to allow re-registration with new handlers
 */
function setupSocketListeners(handlers: SocketEventHandlers): void {
  if (!socket) return;
  const isDev = import.meta.env.DEV;

  // IMPORTANT: Remove ALL existing listeners before adding new ones
  // This prevents the memory leak where listeners accumulate
  socket.removeAllListeners();

  socket.on('connect', () => {
    if (isDev) console.log('[Socket] Connected successfully');
    handlers.onConnect?.();
  });

  socket.on('disconnect', (reason) => {
    if (isDev) console.log('[Socket] Disconnected:', reason);
    handlers.onDisconnect?.(reason);
  });

  socket.on('connect_error', (error) => {
    if (isDev) console.error('[Socket] Connection error:', error.message);
    handlers.onError?.(error);
  });

  // Handle message:new - backend may send wrapped or unwrapped format
  socket.on('message:new', (data: Message | { conversationId: string; message: Message }) => {
    // Handle both wrapped { conversationId, message } and unwrapped Message formats
    const message = 'message' in data && data.message ? data.message : data as Message;
    // Ensure conversation_id is set (may come as conversationId from wrapper)
    if (!message.conversation_id && 'conversationId' in data) {
      message.conversation_id = (data as { conversationId: string }).conversationId;
    }
    if (isDev) {
      console.log('[Socket] Received message:new:', {
        id: message.id,
        conversationId: message.conversation_id,
        senderId: message.sender_id,
      });
    }
    handlers.onMessage?.(message);
  });

  socket.on('message:updated', (data: Message | { conversationId: string; message: Message }) => {
    const message = 'message' in data && data.message ? data.message : data as Message;
    if (!message.conversation_id && 'conversationId' in data) {
      message.conversation_id = (data as { conversationId: string }).conversationId;
    }
    handlers.onMessageUpdate?.(message);
  });

  socket.on('message:deleted', (event: { id: string; conversationId: string }) => {
    handlers.onMessageDelete?.(event);
  });

  socket.on('typing:started', (event: { conversationId: string; userId: string; userType?: string }) => {
    handlers.onTypingStart?.(event);
  });

  socket.on('typing:stopped', (event: { conversationId: string; userId: string; userType?: string }) => {
    handlers.onTypingStop?.(event);
  });

  // Control events
  const controlEvents = [
    'stream.pause',
    'stream.resume',
    'stream.preempt',
    'stream.route',
    'stream.handoff',
    'stream.cancel',
    'stream.priority',
  ];

  controlEvents.forEach((eventName) => {
    socket!.on(eventName, (event: { conversationId: string; [key: string]: unknown }) => {
      handlers.onControl?.({ event: eventName, ...event });
    });
  });

  // Reconnection events for better status tracking
  socket.io.on('reconnect_attempt', (attempt) => {
    if (isDev) console.log('[Socket] Reconnection attempt:', attempt);
    handlers.onReconnecting?.(attempt);
  });

  socket.io.on('reconnect_failed', () => {
    if (isDev) console.error('[Socket] Reconnection failed after all attempts');
    handlers.onReconnectFailed?.();
  });
}

export function connectSocket(handlers: SocketEventHandlers): Socket {
  const token = useAuthStore.getState().token;
  const isDev = import.meta.env.DEV;
  const thisConnectionId = ++connectionId;

  if (isDev) {
    console.log('[Socket] Connecting to:', endpoints.messaging.base);
    console.log('[Socket] Has token:', !!token);
    console.log('[Socket] Connection ID:', thisConnectionId);
  }

  // Store handlers for potential reconnection
  currentHandlers = handlers;

  // If socket exists and is connected, just update handlers
  if (socket?.connected) {
    if (isDev) console.log('[Socket] Already connected, updating handlers');
    setupSocketListeners(handlers);
    // Trigger onConnect since we're already connected
    handlers.onConnect?.();
    return socket;
  }

  // Clean up existing socket completely if it exists
  if (socket) {
    if (isDev) console.log('[Socket] Cleaning up existing socket');
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  socket = io(endpoints.messaging.base, {
    auth: { token },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10, // Increased from 5
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000, // Exponential backoff up to 30s
    randomizationFactor: 0.5, // Add jitter to prevent thundering herd
    timeout: 15000, // Increased from 10s
  });

  // Setup listeners with the new handlers
  setupSocketListeners(handlers);

  return socket;
}

/**
 * Update handlers on existing socket (e.g., when component re-renders)
 */
export function updateSocketHandlers(handlers: SocketEventHandlers): void {
  currentHandlers = handlers;
  if (socket) {
    setupSocketListeners(handlers);
  }
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  currentHandlers = null;
}

export function getSocket(): Socket | null {
  return socket;
}

export function getConnectionStatus(): 'connected' | 'connecting' | 'disconnected' | 'reconnecting' {
  if (!socket) return 'disconnected';
  if (socket.connected) return 'connected';
  // Check if actively reconnecting
  if (socket.io._reconnecting) return 'reconnecting';
  return 'disconnected';
}

export async function joinConversation(conversationId: string): Promise<boolean> {
  const isDev = import.meta.env.DEV;

  if (!socket?.connected) {
    if (isDev) console.log('[Socket] Cannot join conversation - socket not connected');
    return false;
  }

  if (isDev) console.log('[Socket] Joining conversation room:', conversationId);

  try {
    const response = await emitWithTimeout<{ success: boolean; error?: string }>(
      'join:conversation',
      conversationId,
      5000 // 5 second timeout for join
    );
    if (isDev) console.log('[Socket] Join response:', response);
    return response?.success ?? false;
  } catch (error) {
    if (isDev) console.error('[Socket] Join conversation failed:', error);
    return false;
  }
}

export async function leaveConversation(conversationId: string): Promise<void> {
  if (socket?.connected) {
    socket.emit('leave:conversation', conversationId);
  }
}

export async function sendSocketMessage(
  conversationId: string,
  content: string,
  options?: Omit<SendMessageParams, 'content'>
): Promise<Message | null> {
  const isDev = import.meta.env.DEV;

  if (!socket?.connected) {
    if (isDev) console.log('[Socket] Cannot send message - socket not connected');
    return null;
  }

  try {
    const response = await emitWithTimeout<{ success: boolean; message?: Message; error?: string }>(
      'message:send',
      { conversationId, content, ...options },
      15000 // 15 second timeout for message send
    );

    if (response?.success && response.message) {
      return response.message;
    }

    if (isDev && response?.error) {
      console.error('[Socket] Send message error:', response.error);
    }
    return null;
  } catch (error) {
    if (isDev) console.error('[Socket] Send message failed:', error);
    return null;
  }
}

export function startTyping(conversationId: string): void {
  if (socket?.connected) {
    socket.emit('typing:start', conversationId);
  }
}

export function stopTyping(conversationId: string): void {
  if (socket?.connected) {
    socket.emit('typing:stop', conversationId);
  }
}

export async function sendSocketControl(
  conversationId: string,
  event: string,
  options?: Omit<ControlEventParams, 'event'>
): Promise<boolean> {
  const isDev = import.meta.env.DEV;

  if (!socket?.connected) {
    if (isDev) console.log('[Socket] Cannot send control - socket not connected');
    return false;
  }

  try {
    const response = await emitWithTimeout<{ success: boolean; error?: string }>(
      'control:send',
      { conversationId, event, ...options },
      10000 // 10 second timeout for control events
    );
    return response?.success ?? false;
  } catch (error) {
    if (isDev) console.error('[Socket] Send control failed:', error);
    return false;
  }
}
