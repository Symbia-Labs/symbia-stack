import { create } from 'zustand';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: 'user' | 'agent';
  content: string;
  content_type?: string;
  reply_to?: string;
  metadata?: Record<string, unknown>;
  run_id?: string;
  trace_id?: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  interruptible?: boolean;
  preempted_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  type: 'private' | 'group';
  name?: string;
  description?: string;
  org_id?: string;
  created_by: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Participant {
  conversation_id: string;
  user_id: string;
  user_type: 'user' | 'agent';
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  last_read_at?: string;
}

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

interface MessagingState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Map<string, Message[]>;
  typingUsers: Map<string, Set<string>>;
  connectionStatus: ConnectionStatus;

  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  updateConversation: (conversationId: string, updates: Partial<Conversation>) => void;
  setActiveConversation: (id: string | null) => void;
  setMessages: (conversationId: string, messages: Message[]) => void;
  addMessage: (conversationId: string, message: Message) => void;
  updateMessage: (conversationId: string, message: Message) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
  setTyping: (conversationId: string, userId: string, isTyping: boolean) => void;
  clearTyping: () => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  cleanupOldMessages: (conversationId: string, maxMessages?: number) => void;
  reset: () => void;
}

const initialState = {
  conversations: [],
  activeConversationId: null,
  messages: new Map<string, Message[]>(),
  typingUsers: new Map<string, Set<string>>(),
  connectionStatus: 'disconnected' as ConnectionStatus,
};

export const useMessagingStore = create<MessagingState>((set, get) => ({
  ...initialState,

  setConversations: (conversations) => set({ conversations }),

  addConversation: (conversation) =>
    set((state) => ({
      conversations: [conversation, ...state.conversations],
    })),

  updateConversation: (conversationId, updates) =>
    set((state) => ({
      conversations: state.conversations.map((conv) =>
        conv.id === conversationId ? { ...conv, ...updates } : conv
      ),
    })),

  setActiveConversation: (id) => set({ activeConversationId: id }),

  setMessages: (conversationId, messages) => {
    const newMessages = new Map(get().messages);
    newMessages.set(conversationId, messages);
    set({ messages: newMessages });
  },

  addMessage: (conversationId, message) => {
    const messages = new Map(get().messages);
    const existing = messages.get(conversationId) || [];
    // Avoid duplicates
    if (!existing.find((m) => m.id === message.id)) {
      messages.set(conversationId, [...existing, message]);
      set({ messages });
    }
  },

  updateMessage: (conversationId, message) => {
    const messages = new Map(get().messages);
    const existing = messages.get(conversationId) || [];
    const index = existing.findIndex((m) => m.id === message.id);
    if (index >= 0) {
      existing[index] = message;
      messages.set(conversationId, [...existing]);
      set({ messages });
    }
  },

  deleteMessage: (conversationId, messageId) => {
    const messages = new Map(get().messages);
    const existing = messages.get(conversationId) || [];
    messages.set(
      conversationId,
      existing.filter((m) => m.id !== messageId)
    );
    set({ messages });
  },

  setTyping: (conversationId, userId, isTyping) => {
    const typingUsers = new Map(get().typingUsers);
    const users = new Set(typingUsers.get(conversationId) || []);
    if (isTyping) {
      users.add(userId);
    } else {
      users.delete(userId);
    }
    typingUsers.set(conversationId, users);
    set({ typingUsers });
  },

  clearTyping: () => {
    set({ typingUsers: new Map<string, Set<string>>() });
  },

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  cleanupOldMessages: (conversationId, maxMessages = 500) => {
    const messages = new Map(get().messages);
    const existing = messages.get(conversationId);
    if (existing && existing.length > maxMessages) {
      // Keep only the most recent messages
      messages.set(conversationId, existing.slice(-maxMessages));
      set({ messages });
    }
  },

  reset: () => set(initialState),
}));
