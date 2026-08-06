import { useEffect, useRef, useState } from 'react';
import { useMessaging } from '@/hooks/useMessaging';
import { useMessagingStore } from '@/stores/messagingStore';
import { useAuthStore } from '@/stores/authStore';

// Available assistants (could fetch from assistants service)
const ASSISTANTS = [
  { key: 'onboarding', name: 'Onboarding' },
  { key: 'log-analyst', name: 'Log Analyst' },
  { key: 'catalog-search', name: 'Catalog Search' },
  { key: 'cli-assistant', name: 'CLI Assistant' },
];

export function ChatPanel() {
  const { activeConversationId, connectionStatus } = useMessagingStore();
  const {
    loadConversations,
    loadMessages,
    getConversationMessages,
    getTypingUsers,
    setActiveConversation,
    createConversation,
  } = useMessaging();
  const { conversations } = useMessagingStore();
  const { user, isAuthenticated } = useAuthStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedAssistant, setSelectedAssistant] = useState('onboarding');

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (activeConversationId) {
      loadMessages(activeConversationId);
    }
  }, [activeConversationId, loadMessages]);

  const messages = activeConversationId
    ? getConversationMessages(activeConversationId)
    : [];

  const typingUsers = activeConversationId
    ? getTypingUsers(activeConversationId)
    : [];

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleCreateSession = async () => {
    const assistant = ASSISTANTS.find(a => a.key === selectedAssistant);
    const conv = await createConversation({
      type: 'private',
      name: `${assistant?.name || 'Chat'} - ${new Date().toLocaleTimeString()}`,
      participants: [
        { userId: `assistant:${selectedAssistant}`, userType: 'agent' },
      ],
    });
    setActiveConversation(conv.id);
  };

  return (
    <div className="flex-1 min-h-0 flex">
      {/* Conversation List */}
      <div className="w-48 border-r border-border flex flex-col">
        <div className="p-2 border-b border-border space-y-2">
          <select
            value={selectedAssistant}
            onChange={(e) => setSelectedAssistant(e.target.value)}
            className="w-full bg-surface-sunken border border-border rounded-md px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-border-emphasis"
          >
            {ASSISTANTS.map((a) => (
              <option key={a.key} value={a.key}>
                {a.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleCreateSession}
            className="btn-primary w-full text-xs py-1.5"
          >
            + New Session
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 ? (
            <div className="text-xs text-text-muted text-center py-4">
              No sessions
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setActiveConversation(conv.id)}
                className={`
                  w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors duration-fast
                  ${
                    conv.id === activeConversationId
                      ? 'bg-primary-500/15 text-primary-500'
                      : 'text-text-secondary hover:bg-surface-highlight'
                  }
                `}
              >
                <div className="truncate font-medium">
                  {conv.name || `Session`}
                </div>
                <div className="text-text-muted truncate">
                  {new Date(conv.created_at).toLocaleDateString()}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Connection Status */}
        <div className="px-3 py-1.5 border-b border-border flex items-center gap-2 text-xs">
          <div
            className={`
              w-2 h-2 rounded-full
              ${
                connectionStatus === 'connected'
                  ? 'bg-success shadow-[0_0_6px_var(--success)]'
                  : connectionStatus === 'connecting'
                  ? 'bg-warning animate-pulse'
                  : !isAuthenticated
                  ? 'bg-error'
                  : 'bg-text-muted'
              }
            `}
          />
          <span className="text-text-muted">
            {connectionStatus === 'connected'
              ? 'Connected to messaging'
              : connectionStatus === 'connecting'
              ? 'Connecting...'
              : !isAuthenticated
              ? 'Login required'
              : 'Disconnected'}
          </span>
        </div>

        {/* Message List */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-scroll p-3 space-y-3">
          {!activeConversationId ? (
            <div className="h-full flex items-center justify-center text-text-muted text-sm">
              Select or create a session
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-text-muted text-sm">
              No messages yet
            </div>
          ) : (
            messages.map((msg) => {
              const isOwn = msg.sender_id === user?.id;
              const isAgent = msg.sender_type === 'agent';

              return (
                <div
                  key={msg.id}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`
                      max-w-[80%] rounded-lg px-3 py-2 text-sm
                      ${
                        isOwn
                          ? 'bg-primary-500/15 border border-primary-500/30'
                          : isAgent
                          ? 'bg-node-llm-bg border border-node-llm/30'
                          : 'bg-surface-raised border border-border'
                      }
                    `}
                  >
                    {!isOwn && (
                      <div
                        className={`text-xs font-medium mb-1 ${
                          isAgent ? 'text-node-llm' : 'text-text-secondary'
                        }`}
                      >
                        {isAgent ? 'Assistant' : 'User'}
                      </div>
                    )}
                    <div className="whitespace-pre-wrap text-text-primary">{msg.content}</div>
                    <div className="text-xs text-text-muted mt-1">
                      {new Date(msg.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Typing Indicator */}
          {typingUsers.length > 0 && (
            <div className="flex items-center gap-2 text-text-muted text-xs">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-node-llm rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-node-llm rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-node-llm rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
              <span>typing...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
