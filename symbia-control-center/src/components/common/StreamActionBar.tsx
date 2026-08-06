/**
 * StreamActionBar Component
 *
 * Unified control bar for log/trace/event stream displays.
 * Provides consistent pause, restart, expand, and inspect controls.
 */

interface StreamActionBarProps {
  /** Is the stream currently live/active */
  isLive: boolean;
  /** Is the stream currently paused (e.g., viewing expanded item) */
  isPaused?: boolean;
  /** Pause reason to display */
  pauseReason?: string;
  /** Handler for pause - if provided, enables pause functionality */
  onPause?: () => void;
  /** Handler for resume/live toggle */
  onResume: () => void;
  /** Handler for restart/clear */
  onRestart?: () => void;
  /** Handler for expand all toggle */
  onExpandAll?: () => void;
  /** Is currently expanded */
  isExpanded?: boolean;
  /** Handler for inspect/query - shows payload modal */
  onInspect?: () => void;
  /** Whether inspect is currently active */
  isInspecting?: boolean;
  /** Total count of items */
  itemCount?: number;
  /** Label for items (e.g., "logs", "events", "traces") */
  itemLabel?: string;
  /** Additional stats to show */
  stats?: React.ReactNode;
  /** Compact mode for inline display */
  compact?: boolean;
}

export function StreamActionBar({
  isLive,
  isPaused = false,
  pauseReason,
  onPause,
  onResume,
  onRestart,
  onExpandAll,
  isExpanded = false,
  onInspect,
  isInspecting = false,
  itemCount,
  itemLabel = 'items',
  stats,
  compact = false,
}: StreamActionBarProps) {
  const effectiveLive = isLive && !isPaused;

  const handlePlayPauseClick = () => {
    if (effectiveLive && onPause) {
      onPause();
    } else {
      onResume();
    }
  };

  return (
    <div className={`flex items-center gap-3 ${compact ? '' : 'py-2'}`}>
      {/* Live/Paused status indicator */}
      {isPaused && (
        <div className="flex items-center gap-1.5 text-xs text-amber-500">
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span>{pauseReason || 'Paused'}</span>
        </div>
      )}

      {/* Control buttons */}
      <div className="flex items-center gap-1.5">
        {/* Play/Pause button */}
        <button
          onClick={handlePlayPauseClick}
          className={`
            px-2.5 py-1.5 text-xs rounded flex items-center gap-1.5 transition-all
            ${effectiveLive
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 hover:bg-emerald-500/30'
              : 'bg-slate-700 text-slate-300 border border-slate-600 hover:bg-slate-600'
            }
          `}
          title={effectiveLive ? 'Pause streaming' : 'Resume live streaming'}
        >
          {effectiveLive ? (
            <>
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
              <span>Pause</span>
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span>Resume</span>
            </>
          )}
          <div className={`w-1.5 h-1.5 rounded-full ${effectiveLive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
        </button>

        {/* Restart button */}
        {onRestart && (
          <button
            onClick={onRestart}
            className="px-2.5 py-1.5 text-xs rounded flex items-center gap-1.5 transition-all
              bg-slate-700 text-slate-300 border border-slate-600 hover:bg-slate-600 hover:text-slate-100"
            title="Clear and restart stream"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Restart</span>
          </button>
        )}

        {/* Expand all toggle */}
        {onExpandAll && (
          <button
            onClick={onExpandAll}
            className={`
              px-2.5 py-1.5 text-xs rounded flex items-center gap-1.5 transition-all border
              ${isExpanded
                ? 'bg-scc-primary/20 text-scc-primary border-scc-primary/50'
                : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'
              }
            `}
            title={isExpanded ? 'Collapse all' : 'Expand all'}
          >
            <svg
              className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
            <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
          </button>
        )}

        {/* Inspect/Query button */}
        {onInspect && (
          <button
            onClick={onInspect}
            className={`
              px-2.5 py-1.5 text-xs rounded flex items-center gap-1.5 transition-all border
              ${isInspecting
                ? 'bg-scc-secondary/20 text-scc-secondary border-scc-secondary/50'
                : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'
              }
            `}
            title="Inspect payload / Query details"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 21h7a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v11m0 5l4.879-4.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242z" />
            </svg>
            <span>Inspect</span>
          </button>
        )}
      </div>

      {/* Separator */}
      {(itemCount !== undefined || stats) && (
        <div className="w-px h-4 bg-slate-700" />
      )}

      {/* Item count */}
      {itemCount !== undefined && (
        <span className="text-xs text-slate-500">
          {itemCount.toLocaleString()} {itemLabel}
        </span>
      )}

      {/* Additional stats */}
      {stats}
    </div>
  );
}

/**
 * Inline action buttons for individual log/event rows
 */
interface RowActionsProps {
  isExpanded: boolean;
  onToggleExpand: () => void;
  onInspect?: () => void;
  showInspect?: boolean;
}

export function RowActions({
  isExpanded,
  onToggleExpand,
  onInspect,
  showInspect = true,
}: RowActionsProps) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      {/* Expand/Collapse */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpand();
        }}
        className="p-1 rounded hover:bg-slate-700 transition-colors"
        title={isExpanded ? 'Collapse' : 'Expand'}
      >
        <svg
          className={`w-4 h-4 text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Inspect */}
      {showInspect && onInspect && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onInspect();
          }}
          className="p-1 rounded hover:bg-slate-700 transition-colors"
          title="Inspect payload"
        >
          <svg
            className="w-4 h-4 text-slate-500 hover:text-scc-secondary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 21h7a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v11m0 5l4.879-4.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242z" />
          </svg>
        </button>
      )}
    </div>
  );
}

/**
 * Payload inspector modal/panel
 */
interface PayloadInspectorProps {
  payload: unknown;
  title?: string;
  onClose: () => void;
}

export function PayloadInspector({
  payload,
  title = 'Payload Inspector',
  onClose,
}: PayloadInspectorProps) {
  const payloadString = JSON.stringify(payload, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(payloadString);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-scc-surface border border-scc-border rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-scc-border">
          <h3 className="text-sm font-medium text-slate-200">{title}</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-2.5 py-1 text-xs rounded bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
            >
              Copy
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-slate-700 transition-colors"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap">
            {payloadString}
          </pre>
        </div>
      </div>
    </div>
  );
}
