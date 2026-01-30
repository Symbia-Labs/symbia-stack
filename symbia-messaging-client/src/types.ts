/**
 * @symbia/messaging - Type definitions
 *
 * Shared types for the Symbia Messaging Service.
 */

// Conversation types
export type ConversationType = 'private' | 'group';
export type ParticipantRole = 'owner' | 'admin' | 'member';
export type UserType = 'user' | 'agent';
export type MessagePriority = 'low' | 'normal' | 'high' | 'critical';

export interface Conversation {
  id: string;
  type: ConversationType;
  name?: string;
  description?: string;
  org_id?: string;
  created_by: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  participants?: Participant[];
}

export interface Participant {
  conversation_id: string;
  user_id: string;
  user_type: UserType;
  role: ParticipantRole;
  joined_at: string;
  last_read_at?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: UserType;
  content: string;
  content_type?: string;
  reply_to?: string;
  metadata?: Record<string, unknown>;
  run_id?: string;
  trace_id?: string;
  priority?: MessagePriority;
  interruptible?: boolean;
  preempted_by?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

// API request/response types
export interface CreateConversationParams {
  type: ConversationType;
  name?: string;
  description?: string;
  orgId?: string;
  participants?: Array<{ userId: string; userType?: UserType }>;
  metadata?: Record<string, unknown>;
}

export interface SendMessageParams {
  conversationId: string;
  content: string;
  contentType?: string;
  replyTo?: string;
  metadata?: Record<string, unknown>;
  runId?: string;
  traceId?: string;
  priority?: MessagePriority;
  interruptible?: boolean;
}

export interface GetMessagesParams {
  limit?: number;
  before?: string | Date;
  after?: string | Date;
}

export interface ControlEventParams {
  event: string;
  target?: { principalId: string; principalType: string };
  reason?: string;
  metadata?: Record<string, unknown>;
  runId?: string;
  traceId?: string;
  preemptedBy?: string;
}

// WebSocket event types
export interface MessageNewEvent extends Message {}

export interface MessageUpdatedEvent extends Message {}

export interface MessageDeletedEvent {
  id: string;
  conversationId: string;
}

export interface TypingEvent {
  conversationId: string;
  userId: string;
  userType?: UserType;
}

export interface PresenceEvent {
  userId: string;
  status: 'online' | 'away' | 'busy' | 'offline';
}

export interface ControlEvent {
  event: string;
  conversationId: string;
  target?: { principalId: string; principalType: string };
  reason?: string;
  preemptedBy?: string;
  runId?: string;
  traceId?: string;
  effectiveAt: string;
}

// Client configuration
export interface MessagingClientConfig {
  endpoint?: string;
  token?: string;
  apiKey?: string;
  onError?: (error: Error) => void;
}

export interface SocketClientConfig extends MessagingClientConfig {
  autoConnect?: boolean;
  reconnection?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
}

// Event handler types
export type MessageHandler = (message: Message) => void;
export type TypingHandler = (event: TypingEvent) => void;
export type PresenceHandler = (event: PresenceEvent) => void;
export type ControlHandler = (event: ControlEvent) => void;
export type ErrorHandler = (error: Error) => void;
