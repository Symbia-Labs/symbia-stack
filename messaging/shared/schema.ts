/**
 * Messaging Service Schema
 *
 * Type definitions for the messaging service database tables.
 * Note: The service currently uses raw SQL in database.ts.
 * These types provide type safety for query results.
 */

// Enums
export type ConversationType = 'private' | 'group';
export type UserType = 'user' | 'agent';
export type ParticipantRole = 'owner' | 'admin' | 'member';
export type SenderType = 'user' | 'agent' | 'service' | 'bot';
export type MessagePriority = 'low' | 'normal' | 'high' | 'critical';

// Table types
export interface Conversation {
  id: string;
  type: ConversationType;
  name?: string;
  description?: string;
  orgId?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

export interface Participant {
  id: string;
  conversationId: string;
  userId: string;
  userType: UserType;
  role: ParticipantRole;
  entityId?: string;
  joinedAt: Date;
  lastReadAt?: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderType: SenderType;
  content: string;
  contentType: string;
  replyTo?: string;
  orgId?: string;
  runId?: string;
  traceId?: string;
  sequence?: number;
  priority: MessagePriority;
  interruptible: boolean;
  preemptedBy?: string;
  createdAt: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  metadata: Record<string, unknown>;
}

// Insert types (for creating new records)
export interface InsertConversation {
  id?: string;
  type: ConversationType;
  name?: string;
  description?: string;
  orgId?: string;
  createdBy: string;
  metadata?: Record<string, unknown>;
}

export interface InsertParticipant {
  id?: string;
  conversationId: string;
  userId: string;
  userType?: UserType;
  role?: ParticipantRole;
  entityId?: string;
}

export interface InsertMessage {
  id?: string;
  conversationId: string;
  senderId: string;
  senderType?: SenderType;
  content: string;
  contentType?: string;
  replyTo?: string;
  orgId?: string;
  runId?: string;
  traceId?: string;
  sequence?: number;
  priority?: MessagePriority;
  interruptible?: boolean;
  metadata?: Record<string, unknown>;
}
