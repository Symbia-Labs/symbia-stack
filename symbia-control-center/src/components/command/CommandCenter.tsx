import { useState } from 'react';
import { useMessaging } from '@/hooks/useMessaging';
import { useMessagingStore } from '@/stores/messagingStore';
import { ConversationView } from '@/components/messaging/ConversationView';
import { CommandInput } from './CommandInput';
import { StreamControls } from '@/components/messaging/StreamControls';

export function CommandCenter() {
  const [isPaused, setIsPaused] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const { activeConversationId } = useMessagingStore();
  const {
    sendMessage,
    sendControl,
    startTyping,
    stopTyping,
    getConversationMessages,
    getTypingUsers,
  } = useMessaging();

  const messages = activeConversationId
    ? getConversationMessages(activeConversationId)
    : [];

  const typingUsers = activeConversationId
    ? getTypingUsers(activeConversationId)
    : [];

  const handleSend = async (content: string) => {
    if (!activeConversationId || !content.trim()) return;

    try {
      await sendMessage(activeConversationId, content);
      // Simulate streaming state for demo
      setIsStreaming(true);
      setTimeout(() => setIsStreaming(false), 3000);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handlePause = async () => {
    if (!activeConversationId) return;
    try {
      await sendControl(activeConversationId, 'stream.pause');
      setIsPaused(true);
    } catch (error) {
      console.error('Failed to pause:', error);
    }
  };

  const handleResume = async () => {
    if (!activeConversationId) return;
    try {
      await sendControl(activeConversationId, 'stream.resume');
      setIsPaused(false);
    } catch (error) {
      console.error('Failed to resume:', error);
    }
  };

  const handlePreempt = async () => {
    if (!activeConversationId) return;
    try {
      await sendControl(activeConversationId, 'stream.preempt', {
        reason: 'User interrupted',
      });
      setIsPaused(false);
      setIsStreaming(false);
    } catch (error) {
      console.error('Failed to preempt:', error);
    }
  };

  const handleTypingStart = () => {
    if (activeConversationId) {
      startTyping(activeConversationId);
    }
  };

  const handleTypingStop = () => {
    if (activeConversationId) {
      stopTyping(activeConversationId);
    }
  };

  if (!activeConversationId) {
    return (
      <div className="h-full flex items-center justify-center bg-scc-surface">
        <div className="text-center">
          <div className="text-6xl mb-6 text-scc-primary/20">
            &gt;_
          </div>
          <h2 className="text-xl font-semibold text-slate-300 mb-2">
            Welcome to Symbia Control Center
          </h2>
          <p className="text-slate-500 text-sm max-w-md">
            Select an existing session from the sidebar or start a new one
            to begin interacting with Symbia.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-scc-surface">
      {/* Messages Area */}
      <div className="flex-1 overflow-hidden">
        <ConversationView messages={messages} typingUsers={typingUsers} />
      </div>

      {/* Stream Controls */}
      <StreamControls
        onPause={handlePause}
        onResume={handleResume}
        onPreempt={handlePreempt}
        isPaused={isPaused}
        isStreaming={isStreaming}
      />

      {/* Input Area */}
      <div className="border-t border-scc-border p-4 bg-scc-elevated">
        <CommandInput
          onSend={handleSend}
          onTypingStart={handleTypingStart}
          onTypingStop={handleTypingStop}
          disabled={!activeConversationId}
        />
      </div>
    </div>
  );
}
