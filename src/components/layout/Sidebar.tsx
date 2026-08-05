import { useEffect } from 'react';
import { useMessaging } from '@/hooks/useMessaging';
import { ConversationList } from '@/components/messaging/ConversationList';

export function Sidebar() {
  const { loadConversations, createConversation } = useMessaging();

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const handleNewConversation = async () => {
    try {
      await createConversation({
        type: 'private',
        name: `Session ${new Date().toLocaleTimeString()}`,
      });
      // Conversation will be added to the list via the store
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  return (
    <aside className="w-sidebar bg-surface-raised border-r border-border flex flex-col">
      {/* Sidebar Header */}
      <div className="h-header px-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-primary-500 text-glow">
            S
          </span>
          <span className="text-sm font-semibold text-text-primary">
            SYMBIA
          </span>
        </div>
      </div>

      {/* New Conversation Button */}
      <div className="p-3">
        <button
          onClick={handleNewConversation}
          className="btn-primary w-full text-sm"
        >
          + New Session
        </button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-2">
          <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
            Sessions
          </h3>
          <ConversationList />
        </div>
      </div>

      {/* Sidebar Footer */}
      <div className="p-3 border-t border-border">
        <div className="text-xs text-text-muted text-center">
          Symbia v1.0
        </div>
      </div>
    </aside>
  );
}
