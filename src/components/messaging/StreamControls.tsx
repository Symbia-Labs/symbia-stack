interface StreamControlsProps {
  onPause: () => void;
  onResume: () => void;
  onPreempt: () => void;
  isPaused?: boolean;
  isStreaming?: boolean;
}

export function StreamControls({
  onPause,
  onResume,
  onPreempt,
  isPaused = false,
  isStreaming = false,
}: StreamControlsProps) {
  // Only show controls when there's an active stream
  if (!isStreaming && !isPaused) {
    return null;
  }

  return (
    <div className="flex items-center justify-center gap-2 py-2 border-t border-scc-border bg-scc-surface/50">
      {isPaused ? (
        <button
          onClick={onResume}
          className="scc-button text-xs px-3 py-1"
          title="Resume response"
        >
          Resume
        </button>
      ) : (
        <button
          onClick={onPause}
          className="scc-button-ghost text-xs px-3 py-1"
          title="Pause response"
        >
          Pause
        </button>
      )}

      <button
        onClick={onPreempt}
        className="px-3 py-1 text-xs bg-scc-accent/20 border border-scc-accent/50 text-scc-accent rounded hover:bg-scc-accent/30 transition-all"
        title="Stop and take over"
      >
        Preempt
      </button>
    </div>
  );
}
