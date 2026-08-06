import { useEffect, useCallback, useRef } from 'react';
import { useMessagingStore, type Message } from '@/stores/messagingStore';
import { useAuthStore } from '@/stores/authStore';
import { useOrgStore } from '@/stores/orgStore';
import { usePlatformStore } from '@/stores/platformStore';
import {
  messagingBridge,
  connectSocket,
  disconnectSocket,
  updateSocketHandlers,
  joinConversation,
  leaveConversation,
  sendSocketMessage,
  startTyping as socketStartTyping,
  stopTyping as socketStopTyping,
  sendSocketControl,
  getConnectionStatus,
  type SendMessageParams,
  type ControlEventParams,
  type CreateConversationParams,
} from '@/services/messagingBridge';

export function useMessaging() {
  const { isAuthenticated, token } = useAuthStore();
  useOrgStore(); // For reactivity when org changes
  const {
    conversations,
    activeConversationId,
    messages,
    typingUsers,
    connectionStatus,
    setConversations,
    addConversation,
    setActiveConversation,
    setMessages,
    addMessage,
    updateMessage,
    deleteMessage,
    setTyping,
    clearTyping,
    setConnectionStatus,
  } = useMessagingStore();
  const { addEvent } = usePlatformStore();

  const previousConversationId = useRef<string | null>(null);
  const connectionAttemptRef = useRef<number>(0);
  const isConnectingRef = useRef<boolean>(false);

  // Create stable handler references to prevent reconnection on every render
  const handlersRef = useRef({
    onConnect: () => {
      const isDev = import.meta.env.DEV;
      if (isDev) console.log('[useMessaging] Connected!');
      isConnectingRef.current = false;
      setConnectionStatus('connected');
      addEvent({
        type: 'service.healthy',
        source: 'messaging',
        message: 'Connected to messaging service',
      });
    },
    onDisconnect: (reason: string) => {
      const isDev = import.meta.env.DEV;
      if (isDev) console.log('[useMessaging] Disconnected:', reason);
      // Don't set to disconnected if we're about to reconnect
      const status = getConnectionStatus();
      if (status === 'reconnecting') {
        setConnectionStatus('connecting');
      } else {
        setConnectionStatus('disconnected');
      }
      // Clear all typing indicators on disconnect
      clearTyping();
      addEvent({
        type: 'service.unhealthy',
        source: 'messaging',
        message: `Disconnected from messaging service: ${reason}`,
      });
    },
    onError: (error: Error) => {
      console.error('[useMessaging] Connection error:', error);
      // Only set disconnected if not reconnecting
      if (!isConnectingRef.current) {
        setConnectionStatus('disconnected');
      }
      addEvent({
        type: 'service.unhealthy',
        source: 'messaging',
        message: `Connection error: ${error.message}`,
      });
    },
    onReconnecting: (attempt: number) => {
      const isDev = import.meta.env.DEV;
      if (isDev) console.log('[useMessaging] Reconnecting, attempt:', attempt);
      setConnectionStatus('connecting');
      addEvent({
        type: 'service.connecting',
        source: 'messaging',
        message: `Reconnecting to messaging service (attempt ${attempt})`,
      });
    },
    onReconnectFailed: () => {
      console.error('[useMessaging] Reconnection failed after all attempts');
      isConnectingRef.current = false;
      setConnectionStatus('disconnected');
      addEvent({
        type: 'service.unhealthy',
        source: 'messaging',
        message: 'Failed to reconnect to messaging service after multiple attempts',
      });
    },
    onMessage: (message: { id: string; conversation_id: string; sender_id: string; sender_type: string; content?: string }) => {
      const isDev = import.meta.env.DEV;
      if (isDev) {
        console.log('[useMessaging] Received message:new event:', {
          id: message.id,
          conversationId: message.conversation_id,
          senderId: message.sender_id,
          senderType: message.sender_type,
          contentPreview: message.content?.slice(0, 50),
        });
      }
      addMessage(message.conversation_id, message as any);
      addEvent({
        type: 'message.received',
        source: 'messaging',
        message: `New message in conversation`,
        data: { conversationId: message.conversation_id, senderId: message.sender_id },
      });
    },
    onMessageUpdate: (message: { id: string; conversation_id: string }) => {
      updateMessage(message.conversation_id, message as any);
    },
    onMessageDelete: (event: { conversationId: string; id: string }) => {
      deleteMessage(event.conversationId, event.id);
    },
    onTypingStart: (event: { conversationId: string; userId: string; userType?: string }) => {
      setTyping(event.conversationId, event.userId, true);
    },
    onTypingStop: (event: { conversationId: string; userId: string; userType?: string }) => {
      setTyping(event.conversationId, event.userId, false);
    },
    onControl: (event: { event: string }) => {
      const isDev = import.meta.env.DEV;
      if (isDev) console.log('[Control Event]', event);
      addEvent({
        type: event.event,
        source: 'messaging',
        message: `Control event: ${event.event}`,
        data: event,
      });
    },
  });

  // Connect socket when authenticated (or always in dev mode)
  useEffect(() => {
    const isDev = import.meta.env.DEV;
    const currentAttempt = ++connectionAttemptRef.current;

    if (isDev) {
      console.log('[useMessaging] Auth state:', { isAuthenticated, hasToken: !!token, isDev, attempt: currentAttempt });
    }

    // In dev mode, connect even without auth (messaging server has dev mode bypass)
    // In production, require authentication
    if (!isDev && (!isAuthenticated || !token)) {
      if (isDev) console.log('[useMessaging] Not authenticated, staying disconnected');
      disconnectSocket();
      setConnectionStatus('disconnected');
      return;
    }

    // Prevent duplicate connection attempts
    if (isConnectingRef.current) {
      if (isDev) console.log('[useMessaging] Already connecting, skipping');
      return;
    }

    if (isDev) console.log('[useMessaging] Connecting to messaging service...');
    isConnectingRef.current = true;
    setConnectionStatus('connecting');

    // Small delay to allow any pending disconnects to complete
    const connectTimeout = setTimeout(() => {
      // Check if this attempt is still valid (handles rapid auth changes)
      if (connectionAttemptRef.current !== currentAttempt) {
        if (isDev) console.log('[useMessaging] Stale connection attempt, aborting:', currentAttempt);
        isConnectingRef.current = false;
        return;
      }

      connectSocket(handlersRef.current);
    }, 50);

    return () => {
      clearTimeout(connectTimeout);
      // Only disconnect if this was the most recent connection attempt
      if (connectionAttemptRef.current === currentAttempt) {
        isConnectingRef.current = false;
        disconnectSocket();
      }
    };
  }, [isAuthenticated, token, setConnectionStatus, addEvent, addMessage, updateMessage, deleteMessage, setTyping, clearTyping]);

  // Join/leave conversation rooms when active conversation changes
  useEffect(() => {
    const joinRoom = async () => {
      if (previousConversationId.current) {
        await leaveConversation(previousConversationId.current);
      }

      if (activeConversationId) {
        await joinConversation(activeConversationId);
      }

      previousConversationId.current = activeConversationId;
    };

    if (connectionStatus === 'connected') {
      joinRoom();
    }
  }, [activeConversationId, connectionStatus]);

  // Load conversations
  const loadConversations = useCallback(async () => {
    try {
      const convs = await messagingBridge.listConversations();
      setConversations(convs);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  }, [setConversations]);

  // Create a new conversation
  const createConversation = useCallback(
    async (params: CreateConversationParams) => {
      const conversation = await messagingBridge.createConversation(params);
      addConversation(conversation);
      return conversation;
    },
    [addConversation]
  );

  // Load messages for a conversation with pagination support
  const loadMessages = useCallback(
    async (conversationId: string, options?: { limit?: number; before?: string; after?: string }) => {
      try {
        const msgs = await messagingBridge.getMessages(conversationId, {
          limit: options?.limit || 50, // Default to 50 messages
          before: options?.before,
          after: options?.after,
        });

        if (options?.before || options?.after) {
          // Append/prepend to existing messages for pagination
          const existing = messages.get(conversationId) || [];
          if (options.before) {
            // Prepend older messages
            setMessages(conversationId, [...msgs, ...existing]);
          } else {
            // Append newer messages
            setMessages(conversationId, [...existing, ...msgs]);
          }
        } else {
          // Replace messages (initial load)
          setMessages(conversationId, msgs);
        }
      } catch (error) {
        console.error('Failed to load messages:', error);
      }
    },
    [setMessages, messages]
  );

  // Send message (prefer WebSocket, fallback to REST)
  const sendMessage = useCallback(
    async (conversationId: string, content: string, options?: Omit<SendMessageParams, 'content'>): Promise<Message | null> => {
      const isDev = import.meta.env.DEV;

      // Try WebSocket first
      try {
        const socketResult = await sendSocketMessage(conversationId, content, options);
        if (socketResult) {
          if (isDev) console.log('[useMessaging] Message sent via WebSocket:', socketResult.id);
          addEvent({
            type: 'message.sent',
            source: 'messaging',
            message: 'Message sent via WebSocket',
            data: { conversationId },
          });
          return socketResult;
        }
        if (isDev) console.log('[useMessaging] WebSocket send failed/timed out, falling back to REST');
      } catch (wsError) {
        if (isDev) console.warn('[useMessaging] WebSocket error:', wsError);
      }

      // Fallback to REST
      try {
        const result = await messagingBridge.sendMessage(conversationId, { content, ...options });
        if (isDev) console.log('[useMessaging] Message sent via REST:', result.id);
        addEvent({
          type: 'message.sent',
          source: 'messaging',
          message: 'Message sent via REST',
          data: { conversationId },
        });
        return result;
      } catch (restError) {
        console.error('[useMessaging] REST send failed:', restError);
        addEvent({
          type: 'message.error',
          source: 'messaging',
          message: `Failed to send message: ${restError instanceof Error ? restError.message : 'Unknown error'}`,
          data: { conversationId },
        });
        return null;
      }
    },
    [addEvent]
  );

  // Send control event
  const sendControl = useCallback(
    async (conversationId: string, event: string, options?: Omit<ControlEventParams, 'event'>) => {
      // Try WebSocket first
      const success = await sendSocketControl(conversationId, event, options);
      if (success) {
        return;
      }

      // Fallback to REST
      await messagingBridge.sendControl(conversationId, { event, ...options });
    },
    []
  );

  // Typing indicators
  const startTyping = useCallback((conversationId: string) => {
    socketStartTyping(conversationId);
  }, []);

  const stopTyping = useCallback((conversationId: string) => {
    socketStopTyping(conversationId);
  }, []);

  // Get messages for a specific conversation
  const getConversationMessages = useCallback(
    (conversationId: string) => {
      return messages.get(conversationId) || [];
    },
    [messages]
  );

  // Get typing users for a specific conversation
  const getTypingUsers = useCallback(
    (conversationId: string) => {
      return Array.from(typingUsers.get(conversationId) || []);
    },
    [typingUsers]
  );

  return {
    conversations,
    activeConversationId,
    connectionStatus,
    setActiveConversation,
    loadConversations,
    createConversation,
    loadMessages,
    sendMessage,
    sendControl,
    startTyping,
    stopTyping,
    getConversationMessages,
    getTypingUsers,
  };
}
