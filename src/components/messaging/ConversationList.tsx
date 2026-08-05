import { useMessaging } from '@/hooks/useMessaging';
import { useMessagingStore } from '@/stores/messagingStore';

export function ConversationList() {
  const { conversations, activeConversationId } = useMessagingStore();
  const { setActiveConversation, loadMessages } = useMessaging();

  const handleSelect = async (conversationId: string) => {
    setActiveConversation(conversationId);
    await loadMessages(conversationId);
  };

  if (conversations.length === 0) {
    return (
      <div className="text-center py-8 text-text-muted text-sm">
        No sessions yet.
        <br />
        Start a new one above.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {conversations.map((conversation) => {
        const isActive = conversation.id === activeConversationId;

        return (
          <button
            key={conversation.id}
            onClick={() => handleSelect(conversation.id)}
            className={`
              w-full text-left px-3 py-2 rounded-md transition-all duration-fast
              ${
                isActive
                  ? 'bg-primary-500/15 border border-primary-500/40 text-primary-500'
                  : 'hover:bg-surface-highlight text-text-primary border border-transparent'
              }
            `}
          >
            <div className="font-medium text-sm truncate">
              {conversation.name || `Session ${conversation.id.slice(0, 8)}`}
            </div>
            <div className="text-xs text-text-muted mt-0.5">
              {new Date(conversation.created_at).toLocaleDateString()}
            </div>
          </button>
        );
      })}
    </div>
  );
}
