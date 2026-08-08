/**
 * Service Observation Panel
 *
 * Comprehensive observability dashboard for a single service including:
 * - Real-time latency charts
 * - Throughput visualization
 * - HTTP status distribution
 * - Request waterfall/swimlane
 * - Endpoint heatmap
 * - Event timeline
 * - Logs and metrics
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { type ServiceConfig } from '@/config/services';
import { platformClient, type ServiceHealth, type ServiceStats } from '@/services/platformClient';
import { type LogEntry } from '@/services/loggingStreamClient';
import { type TrafficOrigin } from '@/services/origin';
// Network event types used in useServices hook
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { type SandboxEvent as _SandboxEvent, type EventTrace as _EventTrace } from '@/services/networkClient';
import { useServices } from '@/hooks/useServices';
import { useSharedTimeline } from '@/hooks/useTimeSeriesData';
import { StreamActionBar, RowActions, PayloadInspector } from '@/components/common/StreamActionBar';
import {
  LatencyChart,
  ThroughputChart,
  StatusDistribution,
  RequestSwimlane,
  EndpointHeatmap,
  EventTimeline,
  type LatencyDataPoint,
  type ThroughputDataPoint,
  type StatusCount,
  type RequestEvent,
  type EndpointData,
  type TimelineEvent,
} from '@/components/charts';

type TabId = 'dashboard' | 'logs' | 'metrics' | 'events';
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface ServiceObservationPanelProps {
  serviceId: string;
  service: ServiceConfig;
  initialHealth?: ServiceHealth;
  onBack: () => void;
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: 'text-slate-400 bg-slate-400/10',
  info: 'text-blue-400 bg-blue-400/10',
  warn: 'text-amber-400 bg-amber-400/10',
  error: 'text-red-400 bg-red-400/10',
};

/**
 * Format timestamp with milliseconds for event stream display
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

const LEVEL_DOTS: Record<LogLevel, string> = {
  debug: 'bg-slate-400',
  info: 'bg-blue-400',
  warn: 'bg-amber-400',
  error: 'bg-red-400',
};

// Service-specific stats configuration
const SERVICE_STATS_CONFIG: Record<string, { key: keyof ServiceStats; label: string }[]> = {
  logging: [
    { key: 'totalLogEntries', label: 'Total Logs' },
    { key: 'totalMetrics', label: 'Metrics' },
    { key: 'totalDataPoints', label: 'Data Points' },
    { key: 'ingestRate', label: 'Ingest Rate' },
  ],
  catalog: [
    { key: 'totalResources', label: 'Resources' },
    { key: 'publishedVersions', label: 'Published' },
    { key: 'bootstrapEntries', label: 'Bootstrap' },
  ],
  runtime: [
    { key: 'loadedGraphs', label: 'Graphs' },
    { key: 'activeExecutions', label: 'Active' },
    { key: 'totalMessagesProcessed', label: 'Messages' },
  ],
  network: [
    { key: 'totalEvents', label: 'Events' },
    { key: 'deliveredCount', label: 'Delivered' },
    { key: 'errorCount', label: 'Errors' },
  ],
  messaging: [
    { key: 'totalConversations', label: 'Conversations' },
    { key: 'totalMessages', label: 'Messages' },
    { key: 'activeConnections', label: 'Connections' },
  ],
  assistants: [
    { key: 'loadedAssistants', label: 'Loaded' },
    { key: 'activeRuns', label: 'Active Runs' },
    { key: 'totalRuns', label: 'Total Runs' },
  ],
  identity: [
    { key: 'totalUsers', label: 'Users' },
    { key: 'totalOrgs', label: 'Organizations' },
    { key: 'totalAgents', label: 'Agents' },
  ],
  integrations: [
    { key: 'totalProviders', label: 'Providers' },
    { key: 'configuredProviders', label: 'Configured' },
    { key: 'totalIntegrations', label: 'Integrations' },
  ],
};

function formatStatValue(value: unknown): string {
  if (typeof value === 'number') {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return String(value);
  }
  return String(value || '-');
}

function StatCard({ label, value, color, trend }: { label: string; value: string | number; color?: string; trend?: 'up' | 'down' | 'stable' }) {
  return (
    <div className="scc-card p-4 border border-scc-border">
      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <div className="flex items-end gap-2">
        <p className={`text-2xl font-bold ${color || 'text-scc-primary'}`}>
          {formatStatValue(value)}
        </p>
        {trend && (
          <span className={`text-xs ${trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : 'text-slate-500'}`}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
          </span>
        )}
      </div>
    </div>
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
      className={`border-b border-scc-border/30 hover:bg-scc-elevated/50 cursor-pointer ${isExpanded ? 'bg-scc-elevated/30' : ''}`}
      onClick={onToggle}
    >
      <div className="flex items-start gap-3 px-4 py-2">
        <div className={`w-1.5 h-1.5 mt-2 rounded-full shrink-0 ${dotClass}`} />
        <span className="text-xs text-slate-500 font-mono shrink-0 w-28">
          {formatTimeWithMs(timestamp)}
        </span>
        <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 uppercase font-medium ${levelClass}`}>
          {log.level}
        </span>
        <p className={`text-sm flex-1 ${isExpanded ? 'text-slate-200' : 'text-slate-300 truncate'}`}>
          {log.message}
        </p>
        <RowActions
          isExpanded={isExpanded}
          onToggleExpand={onToggle}
          onInspect={onInspect}
          showInspect={!!(log.metadata || log.tags)}
        />
      </div>
      {isExpanded && (
        <div className="px-4 pb-3 pt-1 ml-8 space-y-2">
          {log.traceId && (
            <div className="text-xs">
              <span className="text-slate-500">Trace:</span>{' '}
              <span className="text-slate-400 font-mono">{log.traceId}</span>
            </div>
          )}
          {log.tags && Object.keys(log.tags).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {Object.entries(log.tags).map(([k, v]) => (
                <span key={k} className="text-xs bg-slate-700/50 px-1.5 py-0.5 rounded">
                  {k}: {v}
                </span>
              ))}
            </div>
          )}
          {log.metadata && Object.keys(log.metadata).length > 0 && (
            <pre className="text-xs text-slate-400 bg-slate-800/50 p-2 rounded overflow-x-auto">
              {JSON.stringify(log.metadata, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// Type for observability event data
interface ObsHttpResponseData {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  size?: number;
  traceId?: string;
  /**
   * Why the request happened. Absent on events emitted by a service that has
   * not been rebuilt since this field was added — which is NOT the same as
   * `unknown`, and the filter below keeps them apart.
   */
  origin?: TrafficOrigin;
}

export function ServiceObservationPanel({ serviceId, service, initialHealth, onBack }: ServiceObservationPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [health, setHealth] = useState<ServiceHealth | undefined>(initialHealth);
  const [stats, setStats] = useState<ServiceStats | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState<LogLevel | 'all'>('all');
  const [inspectingLog, setInspectingLog] = useState<LogEntry | null>(null);
  const [isLiveLogging, setIsLiveLogging] = useState(true);

  // Internal traffic is HIDDEN BY DEFAULT, and the count of what is hidden
  // stays on screen.
  //
  // Measured 8 Aug 2026: ~96% of all observed HTTP traffic was the console
  // polling the stack, so every one of these panels was mostly a picture of
  // itself. Filtering it out is the only way the remaining 4% is visible.
  //
  // Hidden, never dropped. A filter that quietly changed the totals would be
  // the same defect as a confident zero — so the control always shows how many
  // events it is holding back.
  const [showInternal, setShowInternal] = useState(false);

  // Events tab state
  const [isLiveEvents, setIsLiveEvents] = useState(true);
  const [displayedEvents, setDisplayedEvents] = useState<Array<{ event: typeof recentNetworkEvents[0]['event']; trace: typeof recentNetworkEvents[0]['trace'] }>>([]);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [inspectingEvent, setInspectingEvent] = useState<{ event: typeof recentNetworkEvents[0]['event']; trace: typeof recentNetworkEvents[0]['trace'] } | null>(null);

  // Observability data storage
  const [latencyData, setLatencyData] = useState<LatencyDataPoint[]>([]);
  const [throughputData, setThroughputData] = useState<ThroughputDataPoint[]>([]);
  const [statusData, setStatusData] = useState<Map<number, number>>(new Map());
  const [requestData, setRequestData] = useState<RequestEvent[]>([]);
  const [endpointData, setEndpointData] = useState<Map<string, { count: number; latencies: number[]; errors: number }>>(new Map());

  // Get network events from the services hook (WebSocket-based) and logs (SSE-based)
  const { recentNetworkEvents, recentLogs: allLogs, isLoadingLogging } = useServices({
    enableNetwork: true,
    networkEventStream: true,
    enableLogging: true,
  });

  // Shared timeline for all time-series charts (60 seconds, updates every second)
  const { timeline } = useSharedTimeline();

  // Filter network events by service (source matches service)
  // Check both source and target, and handle variations in service naming
  const serviceEvents = useMemo(() => {
    const serviceIdLower = serviceId.toLowerCase();
    const serviceNameLower = service.name.toLowerCase().replace(/\s+/g, '-');

    // Debug: log what events we're receiving
    if (recentNetworkEvents.length > 0 && recentNetworkEvents.length % 10 === 0) {
      console.log('[ServiceObservationPanel] Received events:', recentNetworkEvents.length);
      console.log('[ServiceObservationPanel] Sample sources:',
        [...new Set(recentNetworkEvents.slice(0, 20).map(e => e.event.wrapper.source))]);
      console.log('[ServiceObservationPanel] Looking for:', serviceIdLower, serviceNameLower);
    }

    return recentNetworkEvents.filter(({ event }) => {
      const source = event.wrapper.source.toLowerCase();
      const target = event.wrapper.target?.toLowerCase() || '';
      const eventType = event.payload.type;

      // Match observability events from this service
      const matchesSource = source.includes(serviceIdLower) ||
                           source.includes(serviceNameLower) ||
                           source === `symbia-${serviceIdLower}` ||
                           source === serviceNameLower;

      // Also match events targeted at this service
      const matchesTarget = target.includes(serviceIdLower) ||
                           target.includes(serviceNameLower);

      // For obs.http.* events, match by source
      const isObsEvent = eventType.startsWith('obs.');

      return matchesSource || (isObsEvent && matchesTarget);
    });
  }, [recentNetworkEvents, serviceId, service.name]);

  // Split by origin. `internal` is the console's own polling; everything else
  // is either real activity or an event from a service that predates the
  // field. Only `internal` is hidden — `unknown` and absent are shown, because
  // hiding what has not been classified would make the filter a claim about
  // events nobody has labelled yet.
  const { visibleEvents, hiddenInternalCount } = useMemo(() => {
    let hidden = 0;
    const visible = serviceEvents.filter(({ event }) => {
      if (!event.payload.type.startsWith('obs.')) return true;
      const origin = (event.payload.data as { origin?: string } | undefined)?.origin;
      if (origin === 'internal' && !showInternal) {
        hidden++;
        return false;
      }
      return true;
    });
    return { visibleEvents: visible, hiddenInternalCount: hidden };
  }, [serviceEvents, showInternal]);

  // Sort events by timestamp descending (newest first) using useMemo
  // This ensures sorting happens synchronously on every render, avoiding race conditions
  const sortedServiceEvents = useMemo(() => {
    return [...visibleEvents].sort((a, b) =>
      b.event.wrapper.timestamp.localeCompare(a.event.wrapper.timestamp)
    );
  }, [visibleEvents]);

  // Freeze displayed events when paused
  useEffect(() => {
    if (!isLiveEvents && displayedEvents.length === 0) {
      // When first pausing, capture current state
      setDisplayedEvents(sortedServiceEvents);
    } else if (isLiveEvents) {
      // Clear frozen state when resuming (will use sortedServiceEvents directly)
      setDisplayedEvents([]);
    }
  }, [isLiveEvents, sortedServiceEvents, displayedEvents.length]);

  // Use sorted events directly when live, frozen snapshot when paused
  const eventsToRender = isLiveEvents ? sortedServiceEvents : displayedEvents;

  // Process observability events to extract metrics
  useEffect(() => {
    const bucketSize = 5000; // 5 second buckets for throughput
    const throughputBuckets = new Map<number, { success: number; errors: number }>();
    const newStatusData = new Map<number, number>();
    const newEndpointData = new Map<string, { count: number; latencies: number[]; errors: number }>();
    const newLatencyData: LatencyDataPoint[] = [];
    const newRequestData: RequestEvent[] = [];

    // Process HTTP response events (they have the latency and status info)
    // The SAME filtered set the list uses. If the charts counted everything
    // while the list showed a subset, the two would disagree on screen and the
    // filter would look like it had lost data.
    visibleEvents.forEach(({ event }) => {
      const eventType = event.payload.type;
      const eventData = event.payload.data as Record<string, unknown>;
      const timestamp = new Date(event.wrapper.timestamp).getTime();

      // Process HTTP response events
      if (eventType === 'obs.http.response') {
        const data = eventData as unknown as ObsHttpResponseData;

        // Latency data point
        newLatencyData.push({
          timestamp,
          latency: data.durationMs,
          path: data.path,
          statusCode: data.statusCode,
        });

        // Request event for swimlane
        newRequestData.push({
          id: event.wrapper.id,
          timestamp,
          method: data.method || 'GET',
          path: data.path,
          statusCode: data.statusCode,
          durationMs: data.durationMs,
          traceId: data.traceId,
        });

        // Throughput bucket
        const bucketTime = Math.floor(timestamp / bucketSize) * bucketSize;
        const bucket = throughputBuckets.get(bucketTime) || { success: 0, errors: 0 };
        if (data.statusCode >= 400) {
          bucket.errors++;
        } else {
          bucket.success++;
        }
        throughputBuckets.set(bucketTime, bucket);

        // Status code count
        newStatusData.set(data.statusCode, (newStatusData.get(data.statusCode) || 0) + 1);

        // Endpoint aggregation
        const endpointKey = `${data.method}:${data.path}`;
        const endpoint = newEndpointData.get(endpointKey) || { count: 0, latencies: [], errors: 0 };
        endpoint.count++;
        endpoint.latencies.push(data.durationMs);
        if (data.statusCode >= 400) {
          endpoint.errors++;
        }
        newEndpointData.set(endpointKey, endpoint);
      }
    });

    // Sort and limit latency data
    newLatencyData.sort((a, b) => a.timestamp - b.timestamp);

    // Convert throughput buckets to array
    const throughputArray: ThroughputDataPoint[] = Array.from(throughputBuckets.entries())
      .map(([timestamp, data]) => ({
        timestamp,
        successCount: data.success,
        errorCount: data.errors,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    setLatencyData(newLatencyData);
    setThroughputData(throughputArray);
    setStatusData(newStatusData);
    setRequestData(newRequestData);
    setEndpointData(newEndpointData);
  }, [visibleEvents]);

  // Convert maps to chart formats
  const statusChartData: StatusCount[] = useMemo(() => {
    return Array.from(statusData.entries()).map(([statusCode, count]) => ({
      statusCode,
      count,
    }));
  }, [statusData]);

  const endpointChartData: EndpointData[] = useMemo(() => {
    return Array.from(endpointData.entries()).map(([key, data]) => {
      const [method, path] = key.split(':');
      const sortedLatencies = [...data.latencies].sort((a, b) => a - b);
      const p95Index = Math.floor(sortedLatencies.length * 0.95);

      return {
        method,
        path,
        count: data.count,
        avgLatency: data.latencies.reduce((a, b) => a + b, 0) / data.latencies.length,
        p95Latency: sortedLatencies[p95Index] || 0,
        errorRate: data.count > 0 ? (data.errors / data.count) * 100 : 0,
      };
    });
  }, [endpointData]);

  const timelineEvents: TimelineEvent[] = useMemo(() => {
    return visibleEvents.map(({ event, trace }) => ({
      id: event.wrapper.id,
      timestamp: new Date(event.wrapper.timestamp).getTime(),
      type: event.payload.type,
      source: event.wrapper.source,
      target: event.wrapper.target,
      status: trace.status,
      durationMs: trace.totalDurationMs,
      data: event.payload.data,
    }));
  }, [visibleEvents]);

  // Fetch health and stats
  const fetchHealthAndStats = useCallback(async () => {
    const [healthResult, statsResult] = await Promise.all([
      // Both on a 5s timer below — the console looking, not a person asking.
      platformClient.checkHealth(serviceId, 'internal'),
      platformClient.getServiceStats(serviceId, 'internal'),
    ]);
    setHealth(healthResult);
    // getServiceStats now reports WHY there are no stats rather than returning
    // a bare null, so unwrap it. This panel keeps only the stats; the reason
    // is surfaced on the Overview tile.
    setStats(statsResult.stats);
  }, [serviceId]);

  // Filter SSE-streamed logs by service source (no polling needed)
  // Match on serviceId, which is what the logging service actually sends.
  //
  // This filtered on `log.source` alone. No log record has ever had a `source`
  // field — measured 8 Aug 2026, 300 records, zero — so this returned an empty
  // array for every service and the Logs tab has been blank since it was
  // written. `source` is still consulted as a fallback because removing a read
  // is a separate claim from fixing a missing one.
  const serviceLogs = useMemo(() => {
    const id = serviceId.toLowerCase();
    const name = service.name.toLowerCase();
    return allLogs.filter((log) => {
      const sid = log.serviceId?.toLowerCase();
      if (sid) return sid === id || sid.includes(id) || sid.includes(name);
      const src = log.source?.toLowerCase();
      return Boolean(src && (src.includes(id) || src.includes(name)));
    });
  }, [allLogs, serviceId, service.name]);

  // Initial data fetch
  useEffect(() => {
    fetchHealthAndStats();
  }, [fetchHealthAndStats]);

  // Poll health every 5 seconds (health check is lightweight, keep polling)
  useEffect(() => {
    const interval = setInterval(fetchHealthAndStats, 5000);
    return () => clearInterval(interval);
  }, [fetchHealthAndStats]);

  // Note: Logs now come via SSE streaming from useServices - no polling needed

  const isHealthy = health?.status === 'healthy';
  const statsConfig = SERVICE_STATS_CONFIG[serviceId] || [];

  // Filter and sort logs (newest first)
  const filteredLogs = useMemo(() => {
    const filtered = levelFilter === 'all' ? serviceLogs : serviceLogs.filter((l) => l.level === levelFilter);
    return [...filtered].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [serviceLogs, levelFilter]);

  // Calculate summary metrics
  const summaryMetrics = useMemo(() => {
    const totalRequests = requestData.length;
    const avgLatency = latencyData.length > 0
      ? latencyData.reduce((sum, d) => sum + d.latency, 0) / latencyData.length
      : 0;
    const errorCount = requestData.filter((r) => r.statusCode >= 400).length;
    const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;
    const latencies = latencyData.map((d) => d.latency).sort((a, b) => a - b);
    const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;

    return { totalRequests, avgLatency, errorRate, p95, eventCount: visibleEvents.length };
  }, [requestData, latencyData, visibleEvents]);

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'logs', label: 'Logs', count: serviceLogs.length },
    { id: 'metrics', label: 'Metrics' },
    { id: 'events', label: 'Events', count: serviceEvents.length },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 p-6 border-b border-scc-border">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Overview
          </button>
        </div>
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-3 h-3 rounded-full ${
                isHealthy
                  ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                  : health?.status === 'unhealthy'
                  ? 'bg-red-500'
                  : 'bg-slate-500 animate-pulse'
              }`}
            />
            <h1 className="text-xl font-semibold" style={{ color: service.color }}>
              {service.name}
            </h1>
            <span className="text-sm text-slate-500">{service.description}</span>
          </div>
          {/*
            The filter states its own effect. A control that said only
            "show internal" would leave a reader guessing whether the charts
            above were complete; this says how many events are being held
            back, so the number on screen is never mistaken for the total.
          */}
          <button
            onClick={() => setShowInternal((v) => !v)}
            className={`text-xs px-2 py-1 rounded border transition-colors ${
              showInternal
                ? 'border-scc-border text-slate-300 bg-scc-elevated'
                : 'border-scc-border/60 text-slate-400 hover:text-slate-200'
            }`}
            title="Traffic the console generates by polling this service, as opposed to user or agent activity"
          >
            {showInternal
              ? 'hide internal traffic'
              : hiddenInternalCount > 0
              ? `+${hiddenInternalCount} internal hidden`
              : 'no internal traffic seen'}
          </button>
          <div className="flex items-center gap-4 text-sm">
            {health?.latencyMs !== undefined && (
              <span className="text-slate-400">{health.latencyMs}ms</span>
            )}
            {health?.version && (
              <span className="text-slate-500">v{health.version}</span>
            )}
            <span
              className={`px-2 py-1 rounded text-xs font-medium ${
                isHealthy
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : health?.status === 'unhealthy'
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-slate-500/20 text-slate-400'
              }`}
            >
              {health?.status || 'unknown'}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t transition-colors flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'bg-scc-elevated text-slate-100 border-b-2 border-scc-primary'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-scc-elevated/50'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="text-xs bg-slate-700 px-1.5 rounded">{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Dashboard Tab - Main observability dashboard */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatCard label="Total Requests" value={summaryMetrics.totalRequests} />
              <StatCard
                label="Avg Latency"
                value={`${Math.round(summaryMetrics.avgLatency)}ms`}
                color={summaryMetrics.avgLatency > 500 ? 'text-amber-400' : 'text-emerald-400'}
              />
              <StatCard
                label="P95 Latency"
                value={`${Math.round(summaryMetrics.p95)}ms`}
                color={summaryMetrics.p95 > 1000 ? 'text-red-400' : 'text-amber-400'}
              />
              <StatCard
                label="Error Rate"
                value={`${summaryMetrics.errorRate.toFixed(1)}%`}
                color={summaryMetrics.errorRate > 5 ? 'text-red-400' : 'text-emerald-400'}
              />
              <StatCard label="Events" value={summaryMetrics.eventCount} />
            </div>

            {/* Charts Row 1: Latency & Throughput */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="scc-card p-4 border border-scc-border">
                <LatencyChart
                  data={latencyData}
                  timeline={timeline}
                  height={200}
                  title="Response Latency"
                  color={service.color}
                />
              </div>
              <div className="scc-card p-4 border border-scc-border">
                <ThroughputChart
                  data={throughputData}
                  timeline={timeline}
                  height={200}
                  title="Request Throughput"
                />
              </div>
            </div>

            {/* Charts Row 2: Status & Endpoint Heatmap */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="scc-card p-4 border border-scc-border">
                <StatusDistribution
                  data={statusChartData}
                  height={180}
                  title="HTTP Status Distribution"
                />
              </div>
              <div className="scc-card p-4 border border-scc-border">
                <EndpointHeatmap
                  data={endpointChartData}
                  maxEndpoints={8}
                  title="Endpoint Performance"
                />
              </div>
            </div>

            {/* Charts Row 3: Request Swimlane & Event Timeline */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="scc-card p-4 border border-scc-border">
                <RequestSwimlane
                  requests={requestData}
                  maxRequests={12}
                  height={280}
                  title="Recent Requests"
                />
              </div>
              <div className="scc-card p-4 border border-scc-border">
                <EventTimeline
                  events={timelineEvents}
                  maxEvents={15}
                  title="Event Stream"
                />
              </div>
            </div>

            {/* Empty state if no data */}
            {serviceEvents.length === 0 && (
              <div className="scc-card p-12 text-center border border-scc-border">
                <div className="text-4xl mb-4">📊</div>
                <h3 className="text-lg font-medium text-slate-300 mb-2">Waiting for observability data...</h3>
                <p className="text-slate-500 max-w-md mx-auto">
                  HTTP request and response events will appear here once the service starts handling traffic.
                  The observability middleware automatically emits events for all HTTP requests.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && (
          <div>
            {/* Sticky header - use negative top to account for parent p-6 padding */}
            <div
              className="flex items-center justify-between mb-4 sticky -top-6 z-30 py-2 pt-6 -mx-6 px-6 border-b border-scc-border/50 shadow-md"
              style={{ backgroundColor: '#0f1419' }}
            >
              <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                Logs ({filteredLogs.length})
              </h2>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Level:</span>
                  <select
                    value={levelFilter}
                    onChange={(e) => setLevelFilter(e.target.value as LogLevel | 'all')}
                    className="text-sm bg-scc-elevated border border-scc-border rounded px-2 py-1 text-slate-300"
                  >
                    <option value="all">All</option>
                    <option value="debug">Debug</option>
                    <option value="info">Info</option>
                    <option value="warn">Warn</option>
                    <option value="error">Error</option>
                  </select>
                </div>
                <StreamActionBar
                  isLive={isLiveLogging}
                  isPaused={expandedLogId !== null}
                  pauseReason="Viewing details"
                  onPause={() => setIsLiveLogging(false)}
                  onResume={() => {
                    setExpandedLogId(null);
                    setIsLiveLogging(true);
                  }}
                  onRestart={() => {
                    setExpandedLogId(null);
                    setIsLiveLogging(true);
                  }}
                  itemCount={filteredLogs.length}
                  itemLabel="logs"
                  compact
                />
              </div>
            </div>
            {/* Logs list - no nested scroll, uses parent panel scroll */}
            {isLoadingLogging && serviceLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-500">Loading logs...</div>
            ) : filteredLogs.length > 0 ? (
              <div>
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
            ) : (
              <div className="p-8 text-center text-slate-500">
                No logs found for {service.name}
              </div>
            )}
          </div>
        )}

        {/* Metrics Tab */}
        {activeTab === 'metrics' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">
                Service Metrics
              </h2>
              {statsConfig.length > 0 && stats ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {statsConfig.map((config) => (
                    <StatCard
                      key={config.key}
                      label={config.label}
                      value={stats[config.key] ?? '-'}
                    />
                  ))}
                  {/* Show all other stats from the response */}
                  {Object.entries(stats)
                    .filter(([key]) => !statsConfig.some((c) => c.key === key))
                    .map(([key, value]) => (
                      <StatCard
                        key={key}
                        label={key.replace(/([A-Z])/g, ' $1').trim()}
                        value={value ?? '-'}
                      />
                    ))}
                </div>
              ) : (
                <div className="scc-card p-8 text-center">
                  <p className="text-slate-500">No metrics available for this service</p>
                </div>
              )}
            </div>

            {/* Observability metrics summary */}
            <div>
              <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">
                HTTP Performance
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Total Requests" value={summaryMetrics.totalRequests} />
                <StatCard
                  label="Avg Latency"
                  value={`${Math.round(summaryMetrics.avgLatency)}ms`}
                  color={summaryMetrics.avgLatency > 500 ? 'text-amber-400' : 'text-emerald-400'}
                />
                <StatCard
                  label="P95 Latency"
                  value={`${Math.round(summaryMetrics.p95)}ms`}
                  color={summaryMetrics.p95 > 1000 ? 'text-red-400' : 'text-amber-400'}
                />
                <StatCard
                  label="Error Rate"
                  value={`${summaryMetrics.errorRate.toFixed(1)}%`}
                  color={summaryMetrics.errorRate > 5 ? 'text-red-400' : 'text-emerald-400'}
                />
              </div>
            </div>
          </div>
        )}

        {/* Events Tab */}
        {activeTab === 'events' && (
          <div>
            {/* Sticky header - use negative top to account for parent p-6 padding */}
            <div
              className="flex items-center justify-between mb-4 sticky -top-6 z-30 py-2 pt-6 -mx-6 px-6 border-b border-scc-border/50 shadow-md"
              style={{ backgroundColor: '#0f1419' }}
            >
              <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                Event Stream ({eventsToRender.length})
              </h2>
              <StreamActionBar
                isLive={isLiveEvents}
                isPaused={expandedEventId !== null}
                pauseReason="Viewing details"
                onPause={() => setIsLiveEvents(false)}
                onResume={() => {
                  setExpandedEventId(null);
                  setIsLiveEvents(true);
                }}
                onRestart={() => {
                  setDisplayedEvents([]);
                  setExpandedEventId(null);
                  setIsLiveEvents(true);
                }}
                itemCount={eventsToRender.length}
                itemLabel="events"
                compact
              />
            </div>

            {/* Continuous event stream - newest first, no nested containers */}
            {eventsToRender.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <p>No network events found for {service.name}</p>
                <p className="text-sm mt-2">Events will appear here when network activity occurs</p>
              </div>
            ) : (
              <div>
                {eventsToRender.map(({ event, trace }) => {
                  const isExpanded = expandedEventId === event.wrapper.id;
                  const eventData = event.payload.data as Record<string, unknown> | undefined;
                  const isHttpEvent = event.payload.type.startsWith('obs.http.');
                  const httpData = isHttpEvent ? eventData as ObsHttpResponseData | undefined : undefined;

                  return (
                    <div
                      key={event.wrapper.id}
                      className={`border-b border-scc-border/30 hover:bg-scc-elevated/30 cursor-pointer ${
                        isExpanded ? 'bg-scc-elevated/30' : ''
                      }`}
                      onClick={() => setExpandedEventId(prev => prev === event.wrapper.id ? null : event.wrapper.id)}
                    >
                      <div className="flex items-center gap-2 px-4 py-3">
                        {/* Timestamp with ms - fixed width */}
                        <span className="text-xs text-slate-400 font-mono w-28 shrink-0">
                          {formatTimeWithMs(event.wrapper.timestamp)}
                        </span>

                        {/* Status indicator - fixed width */}
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded w-16 text-center shrink-0 ${
                            trace.status === 'delivered'
                              ? 'text-emerald-400 bg-emerald-400/10'
                              : trace.status === 'error'
                              ? 'text-red-400 bg-red-400/10'
                              : 'text-amber-400 bg-amber-400/10'
                          }`}
                        >
                          {trace.status}
                        </span>

                        {/* Event type - fixed width */}
                        <span className="text-sm text-scc-primary font-medium w-32 truncate shrink-0">
                          {event.payload.type}
                        </span>

                        {/* HTTP-specific: method + path + status - fixed width */}
                        <span className="text-xs text-slate-400 w-48 truncate shrink-0">
                          {httpData ? (
                            <>
                              <span className="font-medium">{httpData.method}</span>{' '}
                              <span className="text-slate-500">{httpData.path}</span>{' '}
                              <span className={httpData.statusCode >= 400 ? 'text-red-400' : 'text-emerald-400'}>
                                {httpData.statusCode}
                              </span>
                            </>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </span>

                        {/* Source → Target - flexible */}
                        <span className="text-xs text-slate-500 flex-1 truncate min-w-0">
                          {event.wrapper.source} → {event.wrapper.target || 'broadcast'}
                        </span>

                        {/* Duration - fixed width */}
                        <span className="text-xs text-slate-500 w-14 text-right shrink-0">
                          {httpData?.durationMs || trace.totalDurationMs}ms
                        </span>

                        {/* Actions - fixed width */}
                        <div className="w-16 shrink-0">
                          <RowActions
                            isExpanded={isExpanded}
                            onToggleExpand={() => setExpandedEventId(prev => prev === event.wrapper.id ? null : event.wrapper.id)}
                            onInspect={() => setInspectingEvent({ event, trace })}
                            showInspect={true}
                          />
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="px-4 pb-3 pt-1 ml-8 space-y-2">
                          <div className="text-xs">
                            <span className="text-slate-500">Event ID:</span>
                            <span className="text-slate-400 ml-2 font-mono">{event.wrapper.id}</span>
                          </div>
                          <div className="text-xs">
                            <span className="text-slate-500">Full timestamp:</span>
                            <span className="text-slate-400 ml-2 font-mono">{event.wrapper.timestamp}</span>
                          </div>
                          <div className="flex gap-4 text-xs">
                            <div>
                              <span className="text-slate-500">Hops:</span>
                              <span className="text-slate-400 ml-2">{trace.path?.length || 0}</span>
                            </div>
                            <div>
                              <span className="text-slate-500">Duration:</span>
                              <span className="text-slate-400 ml-2">{trace.totalDurationMs}ms</span>
                            </div>
                          </div>
                          {eventData && Object.keys(eventData).length > 0 && (
                            <div className="text-xs">
                              <span className="text-slate-500">Payload:</span>
                              <pre className="mt-1 p-2 bg-scc-surface rounded text-slate-400 overflow-x-auto text-xs">
                                {JSON.stringify(eventData, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Payload Inspector Modal for Logs */}
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

        {/* Payload Inspector Modal for Events */}
        {inspectingEvent && (
          <PayloadInspector
            payload={{
              id: inspectingEvent.event.wrapper.id,
              type: inspectingEvent.event.payload.type,
              timestamp: inspectingEvent.event.wrapper.timestamp,
              source: inspectingEvent.event.wrapper.source,
              target: inspectingEvent.event.wrapper.target,
              status: inspectingEvent.trace.status,
              hops: inspectingEvent.trace.path?.length || 0,
              totalDurationMs: inspectingEvent.trace.totalDurationMs,
              data: inspectingEvent.event.payload.data as Record<string, unknown>,
            }}
            title="Event Details"
            onClose={() => setInspectingEvent(null)}
          />
        )}
      </div>
    </div>
  );
}
