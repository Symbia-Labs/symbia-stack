/**
 * @symbia/messaging - REST API Client
 *
 * Client for interacting with the Symbia Messaging Service REST API.
 * Used by services to create conversations, send messages, and manage participants.
 */
import type { MessagingClientConfig, Conversation, Participant, Message, CreateConversationParams, SendMessageParams, GetMessagesParams, ControlEventParams } from './types.js';
export declare class MessagingClient {
    private endpoint;
    private token?;
    private apiKey?;
    private onError?;
    constructor(config?: MessagingClientConfig);
    /**
     * Set authentication token
     */
    setToken(token: string): void;
    /**
     * Set API key
     */
    setApiKey(apiKey: string): void;
    private getHeaders;
    private request;
    /**
     * Create a new conversation
     */
    createConversation(params: CreateConversationParams, options?: {
        asUserId?: string;
    }): Promise<Conversation>;
    /**
     * Get a conversation by ID
     */
    getConversation(conversationId: string, options?: {
        asUserId?: string;
    }): Promise<Conversation | null>;
    /**
     * List conversations for the authenticated user
     */
    listConversations(orgId?: string, options?: {
        asUserId?: string;
    }): Promise<Conversation[]>;
    /**
     * Update a conversation
     */
    updateConversation(conversationId: string, updates: {
        name?: string;
        description?: string;
        metadata?: Record<string, unknown>;
    }, options?: {
        asUserId?: string;
    }): Promise<Conversation>;
    /**
     * Delete a conversation
     */
    deleteConversation(conversationId: string, options?: {
        asUserId?: string;
    }): Promise<void>;
    /**
     * Add a participant to a conversation
     */
    addParticipant(conversationId: string, userId: string, userType?: 'user' | 'agent', options?: {
        asUserId?: string;
    }): Promise<Participant>;
    /**
     * Remove a participant from a conversation
     */
    removeParticipant(conversationId: string, userId: string, options?: {
        asUserId?: string;
    }): Promise<void>;
    /**
     * Join a conversation (as the authenticated user)
     */
    joinConversation(conversationId: string, options?: {
        asUserId?: string;
    }): Promise<Participant>;
    /**
     * Leave a conversation
     */
    leaveConversation(conversationId: string, options?: {
        asUserId?: string;
    }): Promise<void>;
    /**
     * Send a message to a conversation
     */
    sendMessage(params: SendMessageParams, options?: {
        asUserId?: string;
    }): Promise<Message>;
    /**
     * Get messages in a conversation
     */
    getMessages(conversationId: string, params?: GetMessagesParams, options?: {
        asUserId?: string;
    }): Promise<Message[]>;
    /**
     * Send a control event to a conversation
     */
    sendControl(conversationId: string, params: ControlEventParams, options?: {
        asUserId?: string;
    }): Promise<Message>;
}
/**
 * Create a messaging client instance
 */
export declare function createMessagingClient(config?: MessagingClientConfig): MessagingClient;
