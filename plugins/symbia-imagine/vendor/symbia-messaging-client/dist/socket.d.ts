/**
 * @symbia/messaging - WebSocket Client
 *
 * Socket.IO client for real-time messaging with the Symbia Messaging Service.
 * Used by clients (browser/node) for real-time message delivery.
 */
import type { SocketClientConfig, Message, MessageHandler, TypingHandler, PresenceHandler, ControlHandler, SendMessageParams, ControlEventParams } from './types.js';
export declare class MessagingSocket {
    private endpoint;
    private token?;
    private apiKey?;
    private socket;
    private onError?;
    private autoConnect;
    private reconnection;
    private reconnectionAttempts;
    private reconnectionDelay;
    private messageHandlers;
    private messageUpdateHandlers;
    private messageDeleteHandlers;
    private typingStartHandlers;
    private typingStopHandlers;
    private presenceHandlers;
    private controlHandlers;
    private connectionHandlers;
    private disconnectionHandlers;
    constructor(config?: SocketClientConfig);
    /**
     * Set authentication token
     */
    setToken(token: string): void;
    /**
     * Connect to the messaging service
     */
    connect(): Promise<void>;
    /**
     * Disconnect from the messaging service
     */
    disconnect(): void;
    /**
     * Check if connected
     */
    get connected(): boolean;
    private setupEventListeners;
    /**
     * Join a conversation room to receive messages
     */
    joinConversation(conversationId: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Leave a conversation room
     */
    leaveConversation(conversationId: string): void;
    /**
     * Send a message via WebSocket
     */
    sendMessage(params: Omit<SendMessageParams, 'conversationId'> & {
        conversationId: string;
    }): Promise<{
        success: boolean;
        message?: Message;
        error?: string;
    }>;
    /**
     * Edit a message
     */
    editMessage(messageId: string, content: string): Promise<{
        success: boolean;
        message?: Message;
        error?: string;
    }>;
    /**
     * Delete a message
     */
    deleteMessage(messageId: string): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Send a control event via WebSocket
     */
    sendControl(conversationId: string, params: ControlEventParams): Promise<{
        success: boolean;
        control?: Message;
        error?: string;
    }>;
    /**
     * Start typing indicator
     */
    startTyping(conversationId: string): void;
    /**
     * Stop typing indicator
     */
    stopTyping(conversationId: string): void;
    /**
     * Update presence status
     */
    updatePresence(status: 'online' | 'away' | 'busy' | 'offline'): void;
    onConnect(handler: () => void): () => void;
    onDisconnect(handler: (reason: string) => void): () => void;
    onMessage(handler: MessageHandler): () => void;
    onMessageUpdate(handler: MessageHandler): () => void;
    onMessageDelete(handler: (event: {
        id: string;
        conversationId: string;
    }) => void): () => void;
    onTypingStart(handler: TypingHandler): () => void;
    onTypingStop(handler: TypingHandler): () => void;
    onPresence(handler: PresenceHandler): () => void;
    /**
     * Listen for control events
     * @param event - Event name or '*' for all control events
     */
    onControl(event: string, handler: ControlHandler): () => void;
}
/**
 * Create a messaging socket instance
 */
export declare function createMessagingSocket(config?: SocketClientConfig): MessagingSocket;
