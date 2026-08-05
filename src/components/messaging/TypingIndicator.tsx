interface TypingIndicatorProps {
  users: string[];
}

export function TypingIndicator({ users }: TypingIndicatorProps) {
  const displayText =
    users.length === 1
      ? 'Someone is typing...'
      : `${users.length} people are typing...`;

  return (
    <div className="flex items-center gap-2 text-slate-500 text-sm animate-fade-in">
      <div className="flex gap-1">
        <span className="w-2 h-2 bg-scc-secondary rounded-full animate-bounce [animation-delay:0ms]" />
        <span className="w-2 h-2 bg-scc-secondary rounded-full animate-bounce [animation-delay:150ms]" />
        <span className="w-2 h-2 bg-scc-secondary rounded-full animate-bounce [animation-delay:300ms]" />
      </div>
      <span>{displayText}</span>
    </div>
  );
}
