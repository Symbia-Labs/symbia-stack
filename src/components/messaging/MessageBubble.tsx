import { useAuthStore } from '@/stores/authStore';
import type { Message } from '@/stores/messagingStore';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const { user } = useAuthStore();
  const isOwnMessage = message.sender_id === user?.id;
  const isAgent = message.sender_type === 'agent';

  return (
    <div
      className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} animate-fade-in`}
    >
      <div
        className={`
          max-w-[80%] rounded-lg px-4 py-2
          ${
            isOwnMessage
              ? 'bg-scc-primary/20 border border-scc-primary/30 text-slate-100'
              : isAgent
              ? 'bg-scc-secondary/20 border border-scc-secondary/30 text-slate-100'
              : 'bg-scc-elevated border border-scc-border text-slate-200'
          }
        `}
      >
        {/* Sender Label (for non-own messages) */}
        {!isOwnMessage && (
          <div
            className={`text-xs font-medium mb-1 ${
              isAgent ? 'text-scc-secondary' : 'text-slate-400'
            }`}
          >
            {isAgent ? 'Assistant' : 'User'}
          </div>
        )}

        {/* Message Content */}
        <div className="text-sm whitespace-pre-wrap break-words">
          {message.content}
        </div>

        {/* Metadata */}
        <div className="flex items-center justify-between mt-1 gap-4">
          <div className="text-xs text-slate-500">
            {new Date(message.created_at).toLocaleTimeString()}
          </div>

          {/* Priority Badge */}
          {message.priority && message.priority !== 'normal' && (
            <span
              className={`
                text-xs px-1.5 py-0.5 rounded
                ${
                  message.priority === 'critical'
                    ? 'bg-red-500/20 text-red-400'
                    : message.priority === 'high'
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-slate-500/20 text-slate-400'
                }
              `}
            >
              {message.priority}
            </span>
          )}

          {/* Preempted indicator */}
          {message.preempted_by && (
            <span className="text-xs text-red-400">
              [preempted]
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
