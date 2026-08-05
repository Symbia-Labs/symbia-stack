/**
 * Log Results Table
 *
 * Virtual-scrolled log results with expandable rows and configurable columns.
 */
import { useRef, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { type LogEntry } from '@/services/loggingStreamClient';
import { useLogSearchStore } from '@/stores/logSearchStore';
import { RowActions, PayloadInspector } from '@/components/common/StreamActionBar';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: 'text-log-debug bg-log-debug-bg',
  info: 'text-log-info bg-log-info-bg',
  warn: 'text-log-warn bg-log-warn-bg',
  error: 'text-log-error bg-log-error-bg',
};

const LEVEL_DOTS: Record<LogLevel, string> = {
  debug: 'bg-text-muted',
  info: 'bg-info',
  warn: 'bg-warning',
  error: 'bg-error',
};

interface LogResultsTableProps {
  logs: LogEntry[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

export function LogResultsTable({
  logs,
  isLoading,
  hasMore,
  onLoadMore,
}: LogResultsTableProps) {
  const { expandedLogId, setExpandedLogId } = useLogSearchStore();
  const parentRef = useRef<HTMLDivElement>(null);
  const inspectingLogRef = useRef<LogEntry | null>(null);

  // Virtualizer for efficient rendering of large lists
  const rowVirtualizer = useVirtualizer({
    count: logs.length + (hasMore ? 1 : 0), // +1 for load more row
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback((index: number) => {
      if (index >= logs.length) return 40; // Load more row
      const log = logs[index];
      const isExpanded = expandedLogId === log.id;
      if (!isExpanded) return 44;
      // Estimate expanded height based on metadata size
      const metadataLines = log.metadata ? JSON.stringify(log.metadata, null, 2).split('\n').length : 0;
      const baseHeight = 120; // Base expanded height
      const metadataHeight = Math.min(metadataLines * 16, 400); // Cap at 400px for metadata
      return baseHeight + metadataHeight;
    }, [logs, expandedLogId]),
    overscan: 10,
  });

  // Remeasure all rows when expanded state changes
  useEffect(() => {
    rowVirtualizer.measure();
  }, [expandedLogId, rowVirtualizer]);

  const handleToggleExpand = (logId: string) => {
    setExpandedLogId(expandedLogId === logId ? null : logId);
  };

  const handleInspect = (log: LogEntry) => {
    inspectingLogRef.current = log;
    // Force re-render
    setExpandedLogId(expandedLogId);
  };

  const handleCloseInspect = () => {
    inspectingLogRef.current = null;
    setExpandedLogId(expandedLogId);
  };

  // Check for load more
  const items = rowVirtualizer.getVirtualItems();
  const lastItem = items[items.length - 1];
  if (lastItem && lastItem.index >= logs.length - 5 && hasMore && !isLoading) {
    onLoadMore();
  }

  if (logs.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <svg className="w-12 h-12 mx-auto mb-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-text-secondary">No logs found</p>
          <p className="text-sm text-text-muted mt-1">Try adjusting your search criteria or time range</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        ref={parentRef}
        className="flex-1 overflow-auto"
        style={{ contain: 'strict' }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const index = virtualRow.index;

            // Load more row
            if (index >= logs.length) {
              return (
                <div
                  key="load-more"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="flex items-center justify-center text-sm text-text-muted"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Loading more...
                    </span>
                  ) : (
                    <button
                      onClick={onLoadMore}
                      className="px-4 py-2 text-sm text-scc-primary hover:underline"
                    >
                      Load more
                    </button>
                  )}
                </div>
              );
            }

            const log = logs[index];
            const isExpanded = expandedLogId === log.id;

            return (
              <div
                key={log.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <LogRow
                  log={log}
                  isExpanded={isExpanded}
                  onToggle={() => handleToggleExpand(log.id)}
                  onInspect={() => handleInspect(log)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Payload Inspector Modal */}
      {inspectingLogRef.current && (
        <PayloadInspector
          payload={{
            id: inspectingLogRef.current.id,
            level: inspectingLogRef.current.level,
            message: inspectingLogRef.current.message,
            timestamp: inspectingLogRef.current.timestamp,
            source: inspectingLogRef.current.source,
            traceId: inspectingLogRef.current.traceId,
            spanId: inspectingLogRef.current.spanId,
            tags: inspectingLogRef.current.tags,
            metadata: inspectingLogRef.current.metadata,
          }}
          title="Log Entry Details"
          onClose={handleCloseInspect}
        />
      )}
    </>
  );
}

function LogRow({
  log,
  isExpanded,
  onToggle,
  onInspect,
}: {
  log: LogEntry;
  isExpanded: boolean;
  onToggle: () => void;
  onInspect: () => void;
}) {
  const levelClass = LEVEL_COLORS[log.level] || LEVEL_COLORS.info;
  const dotClass = LEVEL_DOTS[log.level] || LEVEL_DOTS.info;
  const timestamp = new Date(log.timestamp);

  return (
    <div
      className={`
        border-b border-scc-border/30 cursor-pointer
        ${isExpanded ? 'bg-scc-bg' : 'hover:bg-scc-elevated/50'}
      `}
      onClick={onToggle}
    >
      <div className="flex items-center gap-2 px-4 py-2.5">
        {/* Level dot - fixed width */}
        <div className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />

        {/* Timestamp - fixed width */}
        <span className="text-xs text-text-muted font-mono w-20 shrink-0">
          {timestamp.toLocaleTimeString()}
        </span>

        {/* Level badge - fixed width */}
        <span className={`text-xs px-1.5 py-0.5 rounded w-14 text-center shrink-0 uppercase font-medium ${levelClass}`}>
          {log.level}
        </span>

        {/* Source - fixed width */}
        <span className="text-xs text-text-muted w-24 truncate shrink-0" title={log.source}>
          {log.source || '-'}
        </span>

        {/* Message - flexible */}
        <span className={`text-sm flex-1 min-w-0 ${isExpanded ? 'text-text-primary' : 'text-text-secondary truncate'}`}>
          {log.message}
        </span>

        {/* Actions - fixed width */}
        <div className="w-16 shrink-0">
          <RowActions
            isExpanded={isExpanded}
            onToggleExpand={onToggle}
            onInspect={onInspect}
            showInspect={!!(log.metadata || log.tags)}
          />
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div
          className="mx-4 mb-3 mt-1 p-3 bg-surface-raised rounded-lg border border-border space-y-3"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Full timestamp */}
          <div className="text-xs flex items-center gap-2">
            <span className="text-text-muted w-24 shrink-0">Timestamp:</span>
            <span className="text-text-secondary font-mono">{log.timestamp}</span>
          </div>

          {/* Trace/Span IDs */}
          {(log.traceId || log.spanId) && (
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
              {log.traceId && (
                <div className="flex items-center gap-2">
                  <span className="text-text-muted w-24 shrink-0">Trace ID:</span>
                  <span className="text-primary-500 font-mono">{log.traceId}</span>
                </div>
              )}
              {log.spanId && (
                <div className="flex items-center gap-2">
                  <span className="text-text-muted w-24 shrink-0">Span ID:</span>
                  <span className="text-info font-mono">{log.spanId}</span>
                </div>
              )}
            </div>
          )}

          {/* Tags */}
          {log.tags && Object.keys(log.tags).length > 0 && (
            <div className="text-xs">
              <div className="text-text-muted mb-1.5">Tags:</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(log.tags).map(([key, value]) => (
                  <span key={key} className="px-2 py-1 bg-surface-highlight rounded border border-border">
                    <span className="text-text-muted">{key}:</span>
                    <span className="text-text-primary ml-1">{value}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          {log.metadata && Object.keys(log.metadata).length > 0 && (
            <div className="text-xs">
              <div className="text-text-muted mb-1.5">Metadata:</div>
              <pre className="p-3 bg-surface-sunken rounded border border-border text-text-secondary overflow-x-auto max-h-80 overflow-y-auto">
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
