/**
 * Event Timeline Component
 *
 * Displays network events as a vertical timeline with type/status indicators.
 * Shows the flow of events through the system in chronological order.
 */
import { useMemo } from 'react';

export interface TimelineEvent {
  id: string;
  timestamp: number;
  type: string;
  source: string;
  target?: string;
  status: 'delivered' | 'dropped' | 'pending' | 'error';
  durationMs?: number;
  data?: unknown;
}

interface EventTimelineProps {
  events: TimelineEvent[];
  maxEvents?: number;
  title?: string;
  onEventClick?: (event: TimelineEvent) => void;
}

const STATUS_STYLES: Record<string, { color: string; bg: string; icon: string }> = {
  delivered: { color: 'text-emerald-400', bg: 'bg-emerald-500', icon: '✓' },
  dropped: { color: 'text-slate-400', bg: 'bg-slate-500', icon: '○' },
  pending: { color: 'text-amber-400', bg: 'bg-amber-500', icon: '◐' },
  error: { color: 'text-red-400', bg: 'bg-red-500', icon: '✗' },
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  'obs.http.request': '#3b82f6',
  'obs.http.response': '#22c55e',
  'message.new': '#8b5cf6',
  'message.response': '#a855f7',
  'llm.request': '#f59e0b',
  'llm.response': '#eab308',
  'graph.execute': '#06b6d4',
  'assistant.action.respond': '#ec4899',
  default: '#64748b',
};

function getEventColor(type: string): string {
  return EVENT_TYPE_COLORS[type] || EVENT_TYPE_COLORS.default;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 2,
  } as Intl.DateTimeFormatOptions);
}

function formatEventType(type: string): string {
  // Shorten common prefixes
  return type
    .replace('obs.http.', 'HTTP ')
    .replace('obs.', '')
    .replace('message.', 'MSG ')
    .replace('assistant.action.', '')
    .replace('graph.', 'GRAPH ');
}

export function EventTimeline({
  events,
  maxEvents = 20,
  title,
  onEventClick,
}: EventTimelineProps) {
  const displayEvents = useMemo(() => {
    return [...events]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, maxEvents);
  }, [events, maxEvents]);

  if (displayEvents.length === 0) {
    return (
      <div className="flex items-center justify-center bg-scc-elevated/30 rounded-lg border border-scc-border/50 h-48">
        <p className="text-slate-500 text-sm">No events to display</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-300">{title}</h3>
          <span className="text-xs text-slate-500">{events.length} events</span>
        </div>
      )}
      <div className="bg-scc-elevated/30 rounded-lg border border-scc-border/50 overflow-hidden max-h-80 overflow-y-auto">
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[22px] top-0 bottom-0 w-0.5 bg-scc-border/50" />

          {displayEvents.map((event, index) => {
            const statusStyle = STATUS_STYLES[event.status] || STATUS_STYLES.pending;
            const eventColor = getEventColor(event.type);

            return (
              <div
                key={event.id}
                className={`relative flex items-start gap-3 px-3 py-2 hover:bg-scc-elevated/50 transition-colors ${
                  onEventClick ? 'cursor-pointer' : ''
                } ${index !== displayEvents.length - 1 ? 'border-b border-scc-border/20' : ''}`}
                onClick={() => onEventClick?.(event)}
              >
                {/* Timeline node */}
                <div
                  className={`relative z-10 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${statusStyle.bg}`}
                >
                  {statusStyle.icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {/* Event type */}
                    <span
                      className="text-xs font-medium px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: `${eventColor}20`, color: eventColor }}
                    >
                      {formatEventType(event.type)}
                    </span>

                    {/* Duration */}
                    {event.durationMs !== undefined && (
                      <span className="text-[10px] text-slate-500">
                        {event.durationMs}ms
                      </span>
                    )}

                    {/* Time */}
                    <span className="text-[10px] text-slate-500 ml-auto">
                      {formatTime(event.timestamp)}
                    </span>
                  </div>

                  {/* Source → Target */}
                  <div className="mt-1 text-xs text-slate-400 truncate">
                    <span className="text-slate-500">{event.source}</span>
                    {event.target && (
                      <>
                        <span className="text-slate-600 mx-1">→</span>
                        <span className="text-slate-400">{event.target}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
