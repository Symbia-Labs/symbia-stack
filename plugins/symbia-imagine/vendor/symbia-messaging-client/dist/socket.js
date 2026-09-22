/**
 * @symbia/messaging - WebSocket Client
 *
 * Socket.IO client for real-time messaging with the Symbia Messaging Service.
 * Used by clients (browser/node) for real-time message delivery.
 */
// Dynamic import for socket.io-client to make it optional
let io = null;
async function getSocketIO() {
    if (!io) {
        try {
            const module = await import('socket.io-client');
            io = module.io;
        }
        catch {
            throw new Error('@symbia/messaging: socket.io-client is required for WebSocket support. Install it with: npm install socket.io-client');
        }
    }
    return io;
}
// Default endpoint uses port 5005 (Messaging service port from @symbia/sys)
// In production, set MESSAGING_ENDPOINT or MESSAGING_SERVICE_URL env var
const DEFAULT_ENDPOINT = 'http://localhost:5005';
export class MessagingSocket {
    endpoint;
    token;
    apiKey;
    socket = null;
    onError;
    autoConnect;
    reconnection;
    reconnectionAttempts;
    reconnectionDelay;
    // Event handlers
    messageHandlers = new Set();
    messageUpdateHandlers = new Set();
    messageDeleteHandlers = new Set();
    typingStartHandlers = new Set();
    typingStopHandlers = new Set();
    presenceHandlers = new Set();
    controlHandlers = new Map();
    connectionHandlers = new Set();
    disconnectionHandlers = new Set();
    constructor(config = {}) {
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
    setToken(token) {
        this.token = token;
    }
    /**
     * Connect to the messaging service
     */
    async connect() {
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
            this.socket.on('connect', () => {
                clearTimeout(timeout);
                resolve();
            });
            this.socket.on('connect_error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
            if (!this.autoConnect) {
                this.socket.connect();
            }
        });
    }
    /**
     * Disconnect from the messaging service
     */
    disconnect() {
        this.socket?.disconnect();
        this.socket = null;
    }
    /**
     * Check if connected
     */
    get connected() {
        return this.socket?.connected ?? false;
    }
    setupEventListeners() {
        if (!this.socket)
            return;
        this.socket.on('connect', () => {
            this.connectionHandlers.forEach(handler => handler());
        });
        this.socket.on('disconnect', (reason) => {
            this.disconnectionHandlers.forEach(handler => handler(reason));
        });
        this.socket.on('connect_error', (error) => {
            this.onError?.(error);
        });
        this.socket.on('message:new', (message) => {
            this.messageHandlers.forEach(handler => handler(message));
        });
        this.socket.on('message:updated', (message) => {
            this.messageUpdateHandlers.forEach(handler => handler(message));
        });
        this.socket.on('message:deleted', (event) => {
            this.messageDeleteHandlers.forEach(handler => handler(event));
        });
        this.socket.on('typing:started', (event) => {
            this.typingStartHandlers.forEach(handler => handler(event));
        });
        this.socket.on('typing:stopped', (event) => {
            this.typingStopHandlers.forEach(handler => handler(event));
        });
        this.socket.on('presence:changed', (event) => {
            this.presenceHandlers.forEach(handler => handler(event));
        });
        // Control events
        const controlEvents = [
            'stream.pause', 'stream.resume', 'stream.preempt',
            'stream.route', 'stream.handoff', 'stream.cancel', 'stream.priority'
        ];
        for (const eventName of controlEvents) {
            this.socket.on(eventName, (event) => {
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
    async joinConversation(conversationId) {
        return new Promise((resolve) => {
            if (!this.socket) {
                resolve({ success: false, error: 'Not connected' });
                return;
            }
            this.socket.emit('join:conversation', conversationId, (result) => {
                resolve(result);
            });
        });
    }
    /**
     * Leave a conversation room
     */
    leaveConversation(conversationId) {
        this.socket?.emit('leave:conversation', conversationId);
    }
    // ============================================
    // Messaging
    // ============================================
    /**
     * Send a message via WebSocket
     */
    async sendMessage(params) {
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
            }, (result) => {
                resolve(result);
            });
        });
    }
    /**
     * Edit a message
     */
    async editMessage(messageId, content) {
        return new Promise((resolve) => {
            if (!this.socket) {
                resolve({ success: false, error: 'Not connected' });
                return;
            }
            this.socket.emit('message:edit', { messageId, content }, (result) => {
                resolve(result);
            });
        });
    }
    /**
     * Delete a message
     */
    async deleteMessage(messageId) {
        return new Promise((resolve) => {
            if (!this.socket) {
                resolve({ success: false, error: 'Not connected' });
                return;
            }
            this.socket.emit('message:delete', messageId, (result) => {
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
    async sendControl(conversationId, params) {
        return new Promise((resolve) => {
            if (!this.socket) {
                resolve({ success: false, error: 'Not connected' });
                return;
            }
            this.socket.emit('control:send', {
                conversationId,
                ...params,
            }, (result) => {
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
    startTyping(conversationId) {
        this.socket?.emit('typing:start', conversationId);
    }
    /**
     * Stop typing indicator
     */
    stopTyping(conversationId) {
        this.socket?.emit('typing:stop', conversationId);
    }
    // ============================================
    // Presence
    // ============================================
    /**
     * Update presence status
     */
    updatePresence(status) {
        this.socket?.emit('presence:update', status);
    }
    // ============================================
    // Event Handlers
    // ============================================
    onConnect(handler) {
        this.connectionHandlers.add(handler);
        return () => this.connectionHandlers.delete(handler);
    }
    onDisconnect(handler) {
        this.disconnectionHandlers.add(handler);
        return () => this.disconnectionHandlers.delete(handler);
    }
    onMessage(handler) {
        this.messageHandlers.add(handler);
        return () => this.messageHandlers.delete(handler);
    }
    onMessageUpdate(handler) {
        this.messageUpdateHandlers.add(handler);
        return () => this.messageUpdateHandlers.delete(handler);
    }
    onMessageDelete(handler) {
        this.messageDeleteHandlers.add(handler);
        return () => this.messageDeleteHandlers.delete(handler);
    }
    onTypingStart(handler) {
        this.typingStartHandlers.add(handler);
        return () => this.typingStartHandlers.delete(handler);
    }
    onTypingStop(handler) {
        this.typingStopHandlers.add(handler);
        return () => this.typingStopHandlers.delete(handler);
    }
    onPresence(handler) {
        this.presenceHandlers.add(handler);
        return () => this.presenceHandlers.delete(handler);
    }
    /**
     * Listen for control events
     * @param event - Event name or '*' for all control events
     */
    onControl(event, handler) {
        if (!this.controlHandlers.has(event)) {
            this.controlHandlers.set(event, new Set());
        }
        this.controlHandlers.get(event).add(handler);
        return () => this.controlHandlers.get(event)?.delete(handler);
    }
}
/**
 * Create a messaging socket instance
 */
export function createMessagingSocket(config) {
    return new MessagingSocket(config);
}
