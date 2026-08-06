/**
 * Logs Panel
 *
 * Live streaming logs with filtering, search, and AI-powered analysis.
 */
import { useState, useEffect, useRef } from 'react';
import { useServices } from '@/hooks/useServices';
import { loggingStreamClient, type LogEntry, type LogsQuery } from '@/services/loggingStreamClient';
import { StreamActionBar, RowActions, PayloadInspector } from '@/components/common/StreamActionBar';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: 'text-slate-400 bg-slate-400/10',
  info: 'text-blue-400 bg-blue-400/10',
  warn: 'text-amber-400 bg-amber-400/10',
  error: 'text-red-400 bg-red-400/10',
};

const LEVEL_DOTS: Record<LogLevel, string> = {
  debug: 'bg-slate-400',
  info: 'bg-blue-400',
  warn: 'bg-amber-400',
  error: 'bg-red-400',
};

/**
 * Format timestamp with milliseconds for log stream display
 * e.g., "2:48:06.123 PM"
 */
function formatTimeWithMs(timestamp: string | Date): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes}:${seconds}.${ms} ${ampm}`;
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
        border-b border-scc-border/30 hover:bg-scc-elevated/50 cursor-pointer
        ${isExpanded ? 'bg-scc-elevated/30' : ''}
      `}
      onClick={onToggle}
    >
      <div className="flex items-start gap-3 px-4 py-2">
        {/* Level indicator */}
        <div className={`w-1.5 h-1.5 mt-2 rounded-full shrink-0 ${dotClass}`} />

        {/* Timestamp with ms */}
        <span className="text-xs text-slate-500 font-mono shrink-0 w-28">
          {formatTimeWithMs(timestamp)}
        </span>

        {/* Level badge */}
        <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 uppercase font-medium ${levelClass}`}>
          {log.level}
        </span>

        {/* Source */}
        {log.source && (
          <span className="text-xs text-slate-500 shrink-0 max-w-24 truncate">
            {log.source}
          </span>
        )}

        {/* Message */}
        <p className={`text-sm flex-1 ${isExpanded ? 'text-slate-200' : 'text-slate-300 truncate'}`}>
          {log.message}
        </p>

        {/* Row actions */}
        <RowActions
          isExpanded={isExpanded}
          onToggleExpand={onToggle}
          onInspect={onInspect}
          showInspect={!!(log.metadata || log.tags)}
        />
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-4 pb-3 pt-1 ml-8 space-y-2">
          {/* Full timestamp */}
          <div className="text-xs">
            <span className="text-slate-500">Full timestamp:</span>
            <span className="text-slate-300 ml-2 font-mono">{log.timestamp}</span>
          </div>

          {/* Trace/Span IDs */}
          {(log.traceId || log.spanId) && (
            <div className="flex gap-4 text-xs">
              {log.traceId && (
                <div>
                  <span className="text-slate-500">Trace:</span>
                  <span className="text-scc-primary ml-2 font-mono">{log.traceId.slice(0, 16)}</span>
                </div>
              )}
              {log.spanId && (
                <div>
                  <span className="text-slate-500">Span:</span>
                  <span className="text-scc-secondary ml-2 font-mono">{log.spanId.slice(0, 16)}</span>
                </div>
              )}
            </div>
          )}

          {/* Tags */}
          {log.tags && Object.keys(log.tags).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {Object.entries(log.tags).map(([key, value]) => (
                <span key={key} className="text-xs px-1.5 py-0.5 bg-slate-700 rounded">
                  <span className="text-slate-500">{key}:</span>
                  <span className="text-slate-300 ml-1">{value}</span>
                </span>
              ))}
            </div>
          )}

          {/* Metadata */}
          {log.metadata && Object.keys(log.metadata).length > 0 && (
            <div className="text-xs">
              <span className="text-slate-500">Metadata:</span>
              <pre className="mt-1 p-2 bg-scc-surface rounded text-slate-400 overflow-x-auto">
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StreamSelector({
  streams,
  selectedStreams,
  onToggle,
}: {
  streams: Array<{ id: string; name: string; status: string }>;
  selectedStreams: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (streams.length === 0) {
    return <p className="text-sm text-slate-500">No log streams available</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {streams.map((stream) => (
        <button
          key={stream.id}
          onClick={() => onToggle(stream.id)}
          className={`
            px-2 py-1 text-xs rounded transition-all
            ${selectedStreams.has(stream.id)
              ? 'bg-scc-primary/20 text-scc-primary border border-scc-primary/50'
              : 'bg-slate-700 text-slate-400 border border-transparent hover:border-slate-600'
            }
          `}
        >
          {stream.name}
        </button>
      ))}
    </div>
  );
}

export function LogsPanel() {
  const {
    logStreams,
    recentLogs,
    loggingStats,
    isLoadingLogging,
  } = useServices({ enableLogging: true });

  const [levelFilter, setLevelFilter] = useState<LogLevel | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStreams, setSelectedStreams] = useState<Set<string>>(new Set());
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [manualLogs, setManualLogs] = useState<LogEntry[]>([]);
  const [inspectingLog, setInspectingLog] = useState<LogEntry | null>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Pause stream when viewing an expanded log
  const isPausedForExpand = expandedLogId !== null;
  const effectiveLive = isLive && !isPausedForExpand;

  // Scroll to top when new logs arrive (if live mode and not paused)
  useEffect(() => {
    if (effectiveLive && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = 0;
    }
  }, [recentLogs, effectiveLive]);

  const handleStreamToggle = (id: string) => {
    const newSet = new Set(selectedStreams);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedStreams(newSet);
  };

  const handleSearch = async () => {
    setIsLive(false);
    try {
      const query: LogsQuery = {
        limit: 200,
      };
      if (searchQuery) {
        query.search = searchQuery;
      }
      if (levelFilter !== 'all') {
        query.level = levelFilter;
      }
      if (selectedStreams.size > 0) {
        query.streamIds = Array.from(selectedStreams);
      }
      const results = await loggingStreamClient.queryLogs(query);
      setManualLogs(results);
    } catch (error) {
      console.error('Failed to search logs:', error);
    }
  };

  const handleResumeLive = () => {
    setIsLive(true);
    setManualLogs([]);
    setSearchQuery('');
  };

  // Filter and sort logs - recentLogs are streamed via SSE from useServices hook
  const sourceLogs = isLive ? recentLogs : manualLogs;
  const filteredLogs = sourceLogs
    .filter((log) => {
      if (levelFilter !== 'all' && log.level !== levelFilter) return false;
      if (selectedStreams.size > 0 && !selectedStreams.has(log.streamId)) return false;
      if (searchQuery && !log.message.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    })
    // Sort descending (newest first) using ISO timestamp string comparison
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const levelCounts = recentLogs.reduce(
    (acc, log) => {
      acc[log.level] = (acc[log.level] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 p-6 border-b border-scc-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Logs</h1>
            <p className="text-sm text-slate-500 mt-1">
              Live log streaming with filtering and search
            </p>
          </div>
          <StreamActionBar
            isLive={isLive}
            isPaused={isPausedForExpand}
            pauseReason="Viewing details"
            onPause={() => setIsLive(false)}
            onResume={() => {
              setExpandedLogId(null);
              handleResumeLive();
            }}
            onRestart={() => {
              setManualLogs([]);
              setExpandedLogId(null);
              handleResumeLive();
            }}
            itemCount={loggingStats?.totalLogEntries || filteredLogs.length}
            itemLabel="logs"
            stats={loggingStats?.ingestRate !== undefined && (
              <span className="text-xs text-slate-500">{loggingStats.ingestRate}/s</span>
            )}
          />
        </div>

        {/* Filters */}
        <div className="space-y-3">
          {/* Level filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 w-16">Level:</span>
            {(['all', 'debug', 'info', 'warn', 'error'] as const).map((level) => (
              <button
                key={level}
                onClick={() => setLevelFilter(level)}
                className={`
                  px-2 py-1 text-xs rounded transition-all capitalize
                  ${levelFilter === level
                    ? level === 'all'
                      ? 'bg-scc-primary/20 text-scc-primary'
                      : LEVEL_COLORS[level as LogLevel]
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                  }
                `}
              >
                {level}
                {level !== 'all' && levelCounts[level] !== undefined && (
                  <span className="ml-1 opacity-60">({levelCounts[level] || 0})</span>
                )}
              </button>
            ))}
          </div>

          {/* Stream filter */}
          <div className="flex items-start gap-2">
            <span className="text-xs text-slate-500 w-16 pt-1">Streams:</span>
            <StreamSelector
              streams={logStreams}
              selectedStreams={selectedStreams}
              onToggle={handleStreamToggle}
            />
          </div>

          {/* Search */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 w-16">Search:</span>
            <div className="flex-1 flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search log messages..."
                className="scc-input flex-1 text-sm"
              />
              <button onClick={handleSearch} className="scc-button text-sm px-4">
                Search
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Logs list */}
      <div ref={logsContainerRef} className="flex-1 overflow-y-auto">
        {isLoadingLogging && filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <svg className="w-8 h-8 mx-auto mb-2 text-slate-600 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm text-slate-500">Loading logs...</p>
            </div>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-slate-500">No logs found</p>
              <p className="text-sm text-slate-600 mt-1">
                {searchQuery ? 'Try adjusting your search criteria' : 'Waiting for log entries...'}
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-transparent">
            {filteredLogs.map((log) => (
              <LogRow
                key={log.id}
                log={log}
                isExpanded={expandedLogId === log.id}
                onToggle={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                onInspect={() => setInspectingLog(log)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Stats footer */}
      {loggingStats && (
        <div className="shrink-0 px-6 py-3 border-t border-scc-border bg-scc-elevated/50">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-6">
              <span>Showing {filteredLogs.length} of {sourceLogs.length}</span>
              {loggingStats.ingestRate !== undefined && (
                <span>Ingest: {loggingStats.ingestRate}/s</span>
              )}
            </div>
            <div className="flex items-center gap-6">
              <span>{logStreams.length} streams</span>
              <span>{loggingStats.totalTraces || 0} traces</span>
            </div>
          </div>
        </div>
      )}

      {/* Payload Inspector Modal */}
      {inspectingLog && (
        <PayloadInspector
          payload={{
            id: inspectingLog.id,
            level: inspectingLog.level,
            message: inspectingLog.message,
            timestamp: inspectingLog.timestamp,
            source: inspectingLog.source,
            traceId: inspectingLog.traceId,
            spanId: inspectingLog.spanId,
            tags: inspectingLog.tags,
            metadata: inspectingLog.metadata,
          }}
          title="Log Entry Details"
          onClose={() => setInspectingLog(null)}
        />
      )}
    </div>
  );
}
