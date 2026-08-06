import { useState, useRef, useEffect, type KeyboardEvent, type ChangeEvent } from 'react';
import { parseAndExecuteCommand, getCommandSuggestions } from '@/services/commandParser';
import { useMessaging } from '@/hooks/useMessaging';
import { useMessagingStore } from '@/stores/messagingStore';
import { usePlatformStore } from '@/stores/platformStore';

interface UnifiedInputProps {
  onCommandResult: (message: string, target?: string) => void;
}

export function UnifiedInput({ onCommandResult }: UnifiedInputProps) {
  const [value, setValue] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { activeConversationId } = useMessagingStore();
  const { sendMessage, createConversation, setActiveConversation } = useMessaging();
  const { setActivePanel, addEvent } = usePlatformStore();

  // Update suggestions as user types
  useEffect(() => {
    if (value.startsWith('/')) {
      const sug = getCommandSuggestions(value);
      setSuggestions(sug);
      setSelectedSuggestion(-1);
    } else {
      setSuggestions([]);
    }
  }, [value]);

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if (!trimmed || isProcessing) return;

    setIsProcessing(true);
    setValue('');
    setSuggestions([]);

    try {
      // Try to parse as command first
      const result = await parseAndExecuteCommand(trimmed);

      if (result) {
        // It was a command
        onCommandResult(result.message, result.target);

        if (!result.success) {
          addEvent({
            type: 'command.failed',
            source: 'control-center',
            message: result.message,
          });
        }
      } else {
        // Not a command - treat as chat message
        if (!activeConversationId) {
          // Create a new conversation first
          const conv = await createConversation({
            type: 'private',
            name: `Session ${new Date().toLocaleTimeString()}`,
          });
          setActiveConversation(conv.id);
          setActivePanel('chat');

          // Wait a moment for the conversation to be active
          await new Promise((resolve) => setTimeout(resolve, 100));
          await sendMessage(conv.id, trimmed);
        } else {
          setActivePanel('chat');
          await sendMessage(activeConversationId, trimmed);
        }

        addEvent({
          type: 'message.sent',
          source: 'user',
          message: `Sent: ${trimmed.slice(0, 50)}${trimmed.length > 50 ? '...' : ''}`,
        });
      }
    } catch (error) {
      onCommandResult(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedSuggestion >= 0 && suggestions[selectedSuggestion]) {
        setValue(suggestions[selectedSuggestion]);
        setSuggestions([]);
        setSelectedSuggestion(-1);
      } else {
        handleSubmit();
      }
    } else if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault();
      setSelectedSuggestion((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault();
      setSelectedSuggestion((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Escape') {
      setSuggestions([]);
      setSelectedSuggestion(-1);
    } else if (e.key === 'Tab' && suggestions.length > 0) {
      e.preventDefault();
      const idx = selectedSuggestion >= 0 ? selectedSuggestion : 0;
      if (suggestions[idx]) {
        setValue(suggestions[idx]);
        setSuggestions([]);
        setSelectedSuggestion(-1);
      }
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };

  return (
    <div className="relative p-4">
      {/* Suggestions Dropdown */}
      {suggestions.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 mb-1 bg-surface-overlay border border-border rounded-lg shadow-lg overflow-hidden z-dropdown">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion}
              onClick={() => {
                setValue(suggestion);
                setSuggestions([]);
                inputRef.current?.focus();
              }}
              className={`
                w-full text-left px-3 py-2 text-sm font-mono transition-colors duration-fast
                ${
                  index === selectedSuggestion
                    ? 'bg-primary-500/15 text-primary-500'
                    : 'text-text-primary hover:bg-surface-highlight'
                }
              `}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-3">
        <div className="text-primary-500 font-bold">&gt;</div>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={isProcessing}
          placeholder="Type a command (/help) or message..."
          className="flex-1 bg-transparent border-none text-text-primary placeholder-text-muted focus:outline-none font-mono"
          autoFocus
        />
        {isProcessing && (
          <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        )}
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || isProcessing}
          className="btn-primary px-4 py-1.5 text-sm"
        >
          Execute
        </button>
      </div>

      {/* Hint */}
      <div className="mt-2 text-xs text-text-muted flex items-center gap-4">
        <span>
          <kbd className="px-1.5 py-0.5 bg-surface-sunken border border-border-muted rounded text-text-secondary">/</kbd> commands
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 bg-surface-sunken border border-border-muted rounded text-text-secondary">Tab</kbd> complete
        </span>
        <span>
          <kbd className="px-1.5 py-0.5 bg-surface-sunken border border-border-muted rounded text-text-secondary">Enter</kbd> execute
        </span>
      </div>
    </div>
  );
}
