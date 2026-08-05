import { useState, useRef, useEffect, type KeyboardEvent, type ChangeEvent } from 'react';

interface CommandInputProps {
  onSend: (content: string) => void;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export function CommandInput({
  onSend,
  onTypingStart,
  onTypingStop,
  disabled = false,
  placeholder = 'Type a message...',
}: CommandInputProps) {
  const [value, setValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  // Handle typing indicators
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);

    // Start typing indicator
    if (!isTyping && e.target.value.length > 0) {
      setIsTyping(true);
      onTypingStart?.();
    }

    // Reset typing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      if (isTyping) {
        setIsTyping(false);
        onTypingStop?.();
      }
    }, 2000);
  };

  const handleSend = () => {
    if (!value.trim() || disabled) return;

    onSend(value.trim());
    setValue('');
    setIsTyping(false);
    onTypingStop?.();

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Focus back on textarea
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex items-end gap-3">
      {/* Input Field */}
      <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          className="scc-input resize-none pr-12"
          style={{ minHeight: '44px' }}
        />

        {/* Character hint */}
        {value.length > 0 && (
          <div className="absolute bottom-2 right-3 text-xs text-slate-600">
            {value.length}
          </div>
        )}
      </div>

      {/* Send Button */}
      <button
        onClick={handleSend}
        disabled={!value.trim() || disabled}
        className="scc-button px-4 py-2.5 flex items-center gap-2"
        title="Send message (Enter)"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
          />
        </svg>
        <span className="hidden sm:inline">Send</span>
      </button>
    </div>
  );
}
