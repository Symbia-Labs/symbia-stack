/**
 * @symbia/messaging - WebSocket Client
 *
 * Socket.IO client for real-time messaging with the Symbia Messaging Service.
 * Used by clients (browser/node) for real-time message delivery.
 */

import type {
  SocketClientConfig,
  Message,
  TypingEvent,
  PresenceEvent,
  ControlEvent,
  MessageHandler,
  TypingHandler,
  PresenceHandler,
  ControlHandler,
  ErrorHandler,
  SendMessageParams,
  ControlEventParams,
} from './types.js';

// Dynamic import for socket.io-client to make it optional
let io: typeof import('socket.io-client').io | null = null;

async function getSocketIO() {
  if (!io) {
    try {
      const module = await import('socket.io-client');
      io = module.io;
    } catch {
      throw new Error('@symbia/messaging: socket.io-client is required for WebSocket support. Install it with: npm install socket.io-client');
    }
  }
  return io;
}

// Default endpoint uses port 5005 (Messaging service port from @symbia/sys)
// In production, set MESSAGING_ENDPOINT or MESSAGING_SERVICE_URL env var
const DEFAULT_ENDPOINT = 'http://localhost:5005';

type Socket = ReturnType<typeof import('socket.io-client').io>;

export class MessagingSocket {
  private endpoint: string;
  private token?: string;
  private apiKey?: string;
  private socket: Socket | null = null;
  private onError?: ErrorHandler;
  private autoConnect: boolean;
  private reconnection: boolean;
  private reconnectionAttempts: number;
  private reconnectionDelay: number;

  // Event handlers
  private messageHandlers: Set<MessageHandler> = new Set();
  private messageUpdateHandlers: Set<MessageHandler> = new Set();
  private messageDeleteHandlers: Set<(event: { id: string; conversationId: string }) => void> = new Set();
  private typingStartHandlers: Set<TypingHandler> = new Set();
  private typingStopHandlers: Set<TypingHandler> = new Set();
  private presenceHandlers: Set<PresenceHandler> = new Set();
  private controlHandlers: Map<string, Set<ControlHandler>> = new Map();
  private connectionHandlers: Set<() => void> = new Set();
  private disconnectionHandlers: Set<(reason: string) => void> = new Set();

  constructor(config: SocketClientConfig = {}) {
    // Use config.endpoint, then try process.env (Node.js only), then default
    const envEndpoint = typeof process !== 'undefined' && process.env?.MESSAGING_ENDPOINT;
    this.endpoint = (config.endpoint || envEndpoint || DEFAULT_ENDPOINT).replace(/\/$/, '');
    this.token = config.token;
    this.apiKey = config.apiKey;
    this.onError = config.onError;
    this.autoConnect = config.autoConnect ?? true;
    this.reconnection = config.reconnection ?? true;
    this.reconnectionAttempts = config.reconnectionAttempts ?? 5;
    this.reconnectionDelay = config.reconnectionDelay ?? 1000;
  }

  /**
   * Set authentication token
   */
  setToken(token: string): void {
    this.token = token;
  }

  /**
   * Connect to the messaging service
   */
  async connect(): Promise<void> {
    if (this.socket?.connected) {
      return;
    }

    const socketIO = await getSocketIO();

    this.socket = socketIO(this.endpoint, {
      auth: {
        token: this.token,
        apiKey: this.apiKey,
      },
      autoConnect: this.autoConnect,
      reconnection: this.reconnection,
      reconnectionAttempts: this.reconnectionAttempts,
      reconnectionDelay: this.reconnectionDelay,
    });

    this.setupEventListeners();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);

      this.socket!.on('connect', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.socket!.on('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      if (!this.autoConnect) {
        this.socket!.connect();
      }
    });
  }

  /**
   * Disconnect from the messaging service
   */
  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.socket?.connected ?? false;
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.connectionHandlers.forEach(handler => handler());
    });

    this.socket.on('disconnect', (reason) => {
      this.disconnectionHandlers.forEach(handler => handler(reason));
    });

    this.socket.on('connect_error', (error) => {
      this.onError?.(error);
    });

    this.socket.on('message:new', (message: Message) => {
      this.messageHandlers.forEach(handler => handler(message));
    });

    this.socket.on('message:updated', (message: Message) => {
      this.messageUpdateHandlers.forEach(handler => handler(message));
    });

    this.socket.on('message:deleted', (event: { id: string; conversationId: string }) => {
      this.messageDeleteHandlers.forEach(handler => handler(event));
    });

    this.socket.on('typing:started', (event: TypingEvent) => {
      this.typingStartHandlers.forEach(handler => handler(event));
    });

    this.socket.on('typing:stopped', (event: TypingEvent) => {
      this.typingStopHandlers.forEach(handler => handler(event));
    });

    this.socket.on('presence:changed', (event: PresenceEvent) => {
      this.presenceHandlers.forEach(handler => handler(event));
    });

    // Control events
    const controlEvents = [
      'stream.pause', 'stream.resume', 'stream.preempt',
      'stream.route', 'stream.handoff', 'stream.cancel', 'stream.priority'
    ];

    for (const eventName of controlEvents) {
      this.socket.on(eventName, (event: ControlEvent) => {
        const handlers = this.controlHandlers.get(eventName);
        handlers?.forEach(handler => handler(event));

        // Also notify wildcard handlers
        const wildcardHandlers = this.controlHandlers.get('*');
        wildcardHandlers?.forEach(handler => handler(event));
      });
    }
  }

  // ============================================
  // Room Management
  // ============================================

  /**
   * Join a conversation room to receive messages
   */
  async joinConversation(conversationId: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }

      this.socket.emit('join:conversation', conversationId, (result: { success: boolean; error?: string }) => {
        resolve(result);
      });
    });
  }

  /**
   * Leave a conversation room
   */
  leaveConversation(conversationId: string): void {
    this.socket?.emit('leave:conversation', conversationId);
  }

  // ============================================
  // Messaging
  // ============================================

  /**
   * Send a message via WebSocket
   */
  async sendMessage(params: Omit<SendMessageParams, 'conversationId'> & { conversationId: string }): Promise<{ success: boolean; message?: Message; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }

      this.socket.emit('message:send', {
        conversationId: params.conversationId,
        content: params.content,
        contentType: params.contentType,
        replyTo: params.replyTo,
        metadata: params.metadata,
        runId: params.runId,
        traceId: params.traceId,
        priority: params.priority,
        interruptible: params.interruptible,
      }, (result: { success: boolean; message?: Message; error?: string }) => {
        resolve(result);
      });
    });
  }

  /**
   * Edit a message
   */
  async editMessage(messageId: string, content: string): Promise<{ success: boolean; message?: Message; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }

      this.socket.emit('message:edit', { messageId, content }, (result: { success: boolean; message?: Message; error?: string }) => {
        resolve(result);
      });
    });
  }

  /**
   * Delete a message
   */
  async deleteMessage(messageId: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }

      this.socket.emit('message:delete', messageId, (result: { success: boolean; error?: string }) => {
        resolve(result);
      });
    });
  }

  // ============================================
  // Control Events
  // ============================================

  /**
   * Send a control event via WebSocket
   */
  async sendControl(conversationId: string, params: ControlEventParams): Promise<{ success: boolean; control?: Message; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: 'Not connected' });
        return;
      }

      this.socket.emit('control:send', {
        conversationId,
        ...params,
      }, (result: { success: boolean; control?: Message; error?: string }) => {
        resolve(result);
      });
    });
  }

  // ============================================
  // Typing Indicators
  // ============================================

  /**
   * Start typing indicator
   */
  startTyping(conversationId: string): void {
    this.socket?.emit('typing:start', conversationId);
  }

  /**
   * Stop typing indicator
   */
  stopTyping(conversationId: string): void {
    this.socket?.emit('typing:stop', conversationId);
  }

  // ============================================
  // Presence
  // ============================================

  /**
   * Update presence status
   */
  updatePresence(status: 'online' | 'away' | 'busy' | 'offline'): void {
    this.socket?.emit('presence:update', status);
  }

  // ============================================
  // Event Handlers
  // ============================================

  onConnect(handler: () => void): () => void {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  onDisconnect(handler: (reason: string) => void): () => void {
    this.disconnectionHandlers.add(handler);
    return () => this.disconnectionHandlers.delete(handler);
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onMessageUpdate(handler: MessageHandler): () => void {
    this.messageUpdateHandlers.add(handler);
    return () => this.messageUpdateHandlers.delete(handler);
  }

  onMessageDelete(handler: (event: { id: string; conversationId: string }) => void): () => void {
    this.messageDeleteHandlers.add(handler);
    return () => this.messageDeleteHandlers.delete(handler);
  }

  onTypingStart(handler: TypingHandler): () => void {
    this.typingStartHandlers.add(handler);
    return () => this.typingStartHandlers.delete(handler);
  }

  onTypingStop(handler: TypingHandler): () => void {
    this.typingStopHandlers.add(handler);
    return () => this.typingStopHandlers.delete(handler);
  }

  onPresence(handler: PresenceHandler): () => void {
    this.presenceHandlers.add(handler);
    return () => this.presenceHandlers.delete(handler);
  }

  /**
   * Listen for control events
   * @param event - Event name or '*' for all control events
   */
  onControl(event: string, handler: ControlHandler): () => void {
    if (!this.controlHandlers.has(event)) {
      this.controlHandlers.set(event, new Set());
    }
    this.controlHandlers.get(event)!.add(handler);
    return () => this.controlHandlers.get(event)?.delete(handler);
  }
}

/**
 * Create a messaging socket instance
 */
export function createMessagingSocket(config?: SocketClientConfig): MessagingSocket {
  return new MessagingSocket(config);
}
