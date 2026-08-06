/**
 * Request Swimlane Component
 *
 * Visualizes HTTP request timing as a swimlane/waterfall chart.
 * Shows request duration, status, and path for each request.
 */
import { useMemo } from 'react';

export interface RequestEvent {
  id: string;
  timestamp: number;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  traceId?: string;
}

interface RequestSwimlaneProps {
  requests: RequestEvent[];
  maxRequests?: number;
  height?: number;
  title?: string;
  onRequestClick?: (request: RequestEvent) => void;
}

function getStatusColor(statusCode: number): string {
  if (statusCode >= 200 && statusCode < 300) return '#22c55e';
  if (statusCode >= 300 && statusCode < 400) return '#3b82f6';
  if (statusCode >= 400 && statusCode < 500) return '#f59e0b';
  return '#ef4444';
}

function getMethodColor(method: string): string {
  const colors: Record<string, string> = {
    GET: '#22c55e',
    POST: '#3b82f6',
    PUT: '#f59e0b',
    PATCH: '#a855f7',
    DELETE: '#ef4444',
  };
  return colors[method.toUpperCase()] || '#64748b';
}

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 1,
  } as Intl.DateTimeFormatOptions);
}

export function RequestSwimlane({
  requests,
  maxRequests = 15,
  height = 300,
  title,
  onRequestClick,
}: RequestSwimlaneProps) {
  const { displayRequests, maxDuration } = useMemo(() => {
    if (requests.length === 0) {
      return { displayRequests: [], maxDuration: 100 };
    }

    // Sort by timestamp (newest first) and take the most recent
    const sorted = [...requests]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, maxRequests);

    const durations = sorted.map((r) => r.durationMs);
    const max = Math.max(...durations, 100);

    return {
      displayRequests: sorted,
      maxDuration: max,
    };
  }, [requests, maxRequests]);

  if (displayRequests.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-scc-elevated/30 rounded-lg border border-scc-border/50"
        style={{ height }}
      >
        <p className="text-slate-500 text-sm">No requests to display</p>
      </div>
    );
  }

  const barHeight = Math.min(24, (height - 40) / displayRequests.length);

  return (
    <div className="space-y-2">
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-300">{title}</h3>
          <span className="text-xs text-slate-500">{displayRequests.length} requests</span>
        </div>
      )}
      <div
        className="bg-scc-elevated/30 rounded-lg border border-scc-border/50 overflow-hidden"
        style={{ height: height - 24 }}
      >
        <div className="overflow-y-auto h-full">
          {displayRequests.map((request) => {
            const barWidth = Math.max(2, (request.durationMs / maxDuration) * 100);
            const statusColor = getStatusColor(request.statusCode);
            const methodColor = getMethodColor(request.method);

            return (
              <div
                key={request.id}
                className={`flex items-center gap-2 px-3 border-b border-scc-border/20 hover:bg-scc-elevated/50 ${
                  onRequestClick ? 'cursor-pointer' : ''
                }`}
                style={{ height: barHeight + 8 }}
                onClick={() => onRequestClick?.(request)}
              >
                {/* Time */}
                <span className="text-[10px] text-slate-500 font-mono w-16 shrink-0">
                  {formatTime(request.timestamp)}
                </span>

                {/* Method */}
                <span
                  className="text-[10px] font-bold w-10 shrink-0"
                  style={{ color: methodColor }}
                >
                  {request.method}
                </span>

                {/* Path */}
                <span className="text-xs text-slate-400 truncate w-32 shrink-0" title={request.path}>
                  {request.path}
                </span>

                {/* Duration bar */}
                <div className="flex-1 h-full flex items-center">
                  <div className="relative w-full bg-slate-800/50 rounded-full" style={{ height: barHeight * 0.6 }}>
                    <div
                      className="absolute left-0 top-0 h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${barWidth}%`,
                        backgroundColor: statusColor,
                        minWidth: '4px',
                      }}
                    />
                  </div>
                </div>

                {/* Duration text */}
                <span className="text-[10px] text-slate-400 font-mono w-12 text-right shrink-0">
                  {formatDuration(request.durationMs)}
                </span>

                {/* Status */}
                <span
                  className="text-[10px] font-bold w-8 text-right shrink-0"
                  style={{ color: statusColor }}
                >
                  {request.statusCode}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
