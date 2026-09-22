/**
 * @symbia/messaging
 *
 * Shared messaging client for Symbia services.
 * Provides REST API and WebSocket clients for the Messaging Service.
 *
 * @example
 * ```typescript
 * // REST API client (for server-side use)
 * import { createMessagingClient } from '@symbia/messaging';
 *
 * const client = createMessagingClient({ token: 'your-token' });
 * const conversation = await client.createConversation({ type: 'private' });
 * await client.sendMessage({ conversationId: conversation.id, content: 'Hello!' });
 * ```
 *
 * @example
 * ```typescript
 * // WebSocket client (for real-time updates)
 * import { createMessagingSocket } from '@symbia/messaging';
 *
 * const socket = createMessagingSocket({ token: 'your-token' });
 * await socket.connect();
 * await socket.joinConversation('conv-123');
 *
 * socket.onMessage((message) => {
 *   console.log('New message:', message);
 * });
 * ```
 */
export { MessagingClient, createMessagingClient } from './client.js';
export { MessagingSocket, createMessagingSocket } from './socket.js';
export type { Conversation, Participant, Message, ConversationType, ParticipantRole, UserType, MessagePriority, CreateConversationParams, SendMessageParams, GetMessagesParams, ControlEventParams, MessageNewEvent, MessageUpdatedEvent, MessageDeletedEvent, TypingEvent, PresenceEvent, ControlEvent, MessagingClientConfig, SocketClientConfig, MessageHandler, TypingHandler, PresenceHandler, ControlHandler, ErrorHandler, } from './types.js';
