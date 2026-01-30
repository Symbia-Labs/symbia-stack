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

// REST API Client
export { MessagingClient, createMessagingClient } from './client.js';

// WebSocket Client
export { MessagingSocket, createMessagingSocket } from './socket.js';

// Types
export type {
  // Core types
  Conversation,
  Participant,
  Message,
  ConversationType,
  ParticipantRole,
  UserType,
  MessagePriority,

  // Request params
  CreateConversationParams,
  SendMessageParams,
  GetMessagesParams,
  ControlEventParams,

  // Event types
  MessageNewEvent,
  MessageUpdatedEvent,
  MessageDeletedEvent,
  TypingEvent,
  PresenceEvent,
  ControlEvent,

  // Config types
  MessagingClientConfig,
  SocketClientConfig,

  // Handler types
  MessageHandler,
  TypingHandler,
  PresenceHandler,
  ControlHandler,
  ErrorHandler,
} from './types.js';
