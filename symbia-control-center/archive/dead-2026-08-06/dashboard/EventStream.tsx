import { usePlatformStore, type PlatformEvent } from '@/stores/platformStore';

const EVENT_COLORS: Record<string, string> = {
  'service.healthy': 'var(--success)',
  'service.unhealthy': 'var(--error)',
  'catalog.loaded': 'var(--node-tool)',
  'catalog.error': 'var(--error)',
  'message.sent': 'var(--primary-500)',
  'message.received': 'var(--node-recall)',
  'auth.login': 'var(--success)',
  'auth.logout': 'var(--warning)',
  'graph.started': 'var(--node-output)',
  'graph.completed': 'var(--success)',
  'graph.failed': 'var(--error)',
};

export function EventStream() {
  const { events, clearEvents } = usePlatformStore();

  return (
    <div className="card p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-text-primary">Events</h2>
          <span className="text-xs text-text-muted">
            {events.length} events
          </span>
        </div>
        <button
          onClick={clearEvents}
          className="btn-ghost text-xs px-2 py-1"
        >
          Clear
        </button>
      </div>

      {/* Event List */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {events.length === 0 ? (
          <div className="text-center py-8 text-text-muted text-sm">
            No events yet
          </div>
        ) : (
          events.map((event) => (
            <EventItem key={event.id} event={event} />
          ))
        )}
      </div>
    </div>
  );
}

function EventItem({ event }: { event: PlatformEvent }) {
  const color = EVENT_COLORS[event.type] || 'var(--text-muted)';
  const time = new Date(event.timestamp).toLocaleTimeString();

  return (
    <div className="p-2 rounded-md bg-surface-sunken border border-border hover:border-border-emphasis transition-colors duration-fast">
      <div className="flex items-center gap-2 mb-1">
        <div
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-xs font-medium" style={{ color }}>
          {event.type}
        </span>
        <span className="text-xs text-text-muted ml-auto">{time}</span>
      </div>
      <div className="text-xs text-text-primary">{event.message}</div>
      {event.source && (
        <div className="text-xs text-text-muted mt-0.5">
          Source: {event.source}
        </div>
      )}
    </div>
  );
}
