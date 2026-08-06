import { useState, useEffect, useCallback } from 'react';
import { loggingClient, type LogEntry, type LogStream, type LoggingStats } from '@/services/loggingClient';

const LEVEL_COLORS: Record<string, string> = {
  debug: 'var(--log-debug)',
  info: 'var(--log-info)',
  warn: 'var(--log-warn)',
  error: 'var(--log-error)',
  fatal: 'var(--error)',
};

const LEVEL_OPTIONS = [
  { value: '', label: 'All Levels' },
  { value: 'debug', label: 'Debug' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warning' },
  { value: 'error', label: 'Error' },
];

export function LogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [streams, setStreams] = useState<LogStream[]>([]);
  const [stats, setStats] = useState<LoggingStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedStream, setSelectedStream] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Expanded log
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [logsData, streamsData, statsData] = await Promise.all([
        loggingClient.queryLogs({
          streamIds: selectedStream ? [selectedStream] : undefined,
          level: selectedLevel || undefined,
          search: searchQuery || undefined,
          limit: 100,
        }),
        loggingClient.getLogStreams(),
        loggingClient.getStats(),
      ]);

      setLogs(logsData);
      setStreams(streamsData);
      setStats(statsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load logs');
    } finally {
      setIsLoading(false);
    }
  }, [selectedStream, selectedLevel, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Pause stream when viewing an expanded log
  const isPaused = expandedLog !== null;

  useEffect(() => {
    if (!autoRefresh || isPaused) return;

    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, isPaused, loadData]);

  return (
    <div className="card p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-text-primary">Logs</h2>
          {stats && (
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <span>{stats.logs?.total || 0} entries</span>
              <span className="text-text-muted">|</span>
              <span>{streams.length} streams</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isPaused && (
            <div className="flex items-center gap-1.5 text-xs text-warning">
              <div className="w-2 h-2 rounded-full bg-warning animate-pulse" />
              <span>Paused</span>
            </div>
          )}
          <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-3 h-3 accent-primary-500"
            />
            Live
          </label>
          {isLoading && (
            <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search logs..."
          className="input text-sm flex-1"
        />
        <select
          value={selectedStream}
          onChange={(e) => setSelectedStream(e.target.value)}
          className="input text-sm w-40"
        >
          <option value="">All Streams</option>
          {streams.map((stream) => (
            <option key={stream.id} value={stream.id}>
              {stream.name}
            </option>
          ))}
        </select>
        <select
          value={selectedLevel}
          onChange={(e) => setSelectedLevel(e.target.value)}
          className="input text-sm w-28"
        >
          {LEVEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-3 p-2 bg-error-muted border border-error/30 rounded-md text-xs text-error">
          {error}
        </div>
      )}

      {/* Log List */}
      <div className="flex-1 overflow-y-auto space-y-1 font-mono text-xs">
        {logs.length === 0 ? (
          <div className="text-center py-8 text-text-muted">
            {isLoading ? 'Loading...' : 'No logs found'}
          </div>
        ) : (
          logs.map((log) => (
            <LogEntryItem
              key={log.id}
              log={log}
              isExpanded={expandedLog === log.id}
              onToggle={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
            />
          ))
        )}
      </div>

      {/* Stats Footer */}
      {stats && (
        <div className="mt-3 pt-3 border-t border-border flex items-center gap-4 text-xs text-text-muted">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-info" />
            <span>Logs: {stats.logs?.total || 0}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-node-router" />
            <span>Metrics: {stats.metrics?.total || 0}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-warning" />
            <span>Traces: {stats.traces?.total || 0}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function LogEntryItem({
  log,
  isExpanded,
  onToggle,
}: {
  log: LogEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const levelColor = LEVEL_COLORS[log.level] || LEVEL_COLORS.info;
  const time = new Date(log.timestamp).toLocaleTimeString();

  return (
    <div
      className={`
        p-2 rounded-md transition-colors duration-fast cursor-pointer
        ${isExpanded ? 'bg-surface-raised border border-border' : 'hover:bg-surface-highlight'}
      `}
      onClick={onToggle}
    >
      <div className="flex items-start gap-2">
        <span className="text-text-muted shrink-0">{time}</span>
        <span
          className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase shrink-0"
          style={{ backgroundColor: `color-mix(in srgb, ${levelColor} 20%, transparent)`, color: levelColor }}
        >
          {log.level}
        </span>
        <span className="text-text-primary break-all">{log.message}</span>
      </div>

      {isExpanded && log.metadata && Object.keys(log.metadata).length > 0 && (
        <div className="mt-2 pl-4 border-l-2 border-border">
          <div className="text-text-muted mb-1">Metadata:</div>
          <pre className="text-text-secondary text-[10px] overflow-x-auto">
            {JSON.stringify(log.metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
