import { useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import type { Message } from '@/stores/messagingStore';

interface ConversationViewProps {
  messages: Message[];
  typingUsers: string[];
}

export function ConversationView({ messages, typingUsers }: ConversationViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  if (messages.length === 0 && typingUsers.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 opacity-20">
            &gt;_
          </div>
          <p className="text-slate-500 text-sm">
            Start a conversation...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto p-4 space-y-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}

      {typingUsers.length > 0 && (
        <TypingIndicator users={typingUsers} />
      )}
    </div>
  );
}
