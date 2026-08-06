/**
 * Logging Service Stream Client
 *
 * Provides comprehensive access to the Logging service for logs, metrics, traces, and analytics.
 * Includes efficient polling mechanism for near-real-time updates.
 */
import { useAuthStore } from '@/stores/authStore';
import { useOrgStore } from '@/stores/orgStore';
import { getServiceUrl } from '@/config/services';

// =============================================================================
// Types
// =============================================================================

export interface LogStream {
  id: string;
  name: string;
  description?: string;
  orgId: string;
  serviceId: string;
  env: string;
  dataClass: string;
  policyRef?: string;
  retention?: number;
  status: 'active' | 'inactive' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface LogEntry {
  id: string;
  streamId: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  source?: string;
  tags?: Record<string, string>;
  metadata?: Record<string, unknown>;
  traceId?: string;
  spanId?: string;
}

export interface MetricDefinition {
  id: string;
  name: string;
  description?: string;
  unit: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  orgId: string;
  serviceId: string;
  env: string;
  labels?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DataPoint {
  id: string;
  metricId: string;
  timestamp: string;
  value: number;
  labels?: Record<string, string>;
}

export interface Trace {
  id: string;
  traceId: string;
  name: string;
  serviceName: string;
  status: 'ok' | 'error' | 'timeout';
  startTime: string;
  endTime?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface Span {
  id: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  serviceName: string;
  status: 'ok' | 'error';
  startTime: string;
  endTime?: string;
  durationMs?: number;
  attributes?: Record<string, unknown>;
  events?: Array<{ name: string; timestamp: string; attributes?: Record<string, unknown> }>;
}

export interface LogsQuery {
  streamIds?: string[];
  level?: 'debug' | 'info' | 'warn' | 'error';
  search?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
  offset?: number;
}

export interface MetricsQuery {
  metricIds?: string[];
  startTime?: string;
  endTime?: string;
  aggregation?: 'avg' | 'sum' | 'min' | 'max' | 'count';
  interval?: string;
  limit?: number;
}

export interface TracesQuery {
  serviceName?: string;
  status?: 'ok' | 'error' | 'timeout';
  minDuration?: number;
  maxDuration?: number;
  startTime?: string;
  endTime?: string;
  limit?: number;
}

export interface LoggingStats {
  totalLogEntries: number;
  totalMetrics: number;
  totalDataPoints: number;
  totalTraces: number;
  totalSpans: number;
  logStreamsCount: number;
  metricsCount: number;
  ingestRate?: number;
  queryLatency?: number;
}

export interface LogInsight {
  text: string;
  type: 'summary' | 'error_pattern' | 'anomaly' | 'suggestion';
  severity?: 'info' | 'warning' | 'critical';
  relatedLogIds?: string[];
}

export interface LogAnalysis {
  insights: LogInsight[];
  errorPatterns?: Array<{ pattern: string; count: number; examples: string[] }>;
  recommendations?: string[];
}

// =============================================================================
// Polling Manager
// =============================================================================

type PollCallback<T> = (data: T) => void;

interface PollSubscription {
  id: string;
  intervalMs: number;
  callback: PollCallback<unknown>;
  fetcher: () => Promise<unknown>;
  timer?: ReturnType<typeof setInterval>;
  lastFetchTime?: number;
}

class PollingManager {
  private subscriptions = new Map<string, PollSubscription>();
  private idCounter = 0;

  subscribe<T>(
    fetcher: () => Promise<T>,
    callback: PollCallback<T>,
    intervalMs: number = 5000
  ): string {
    const id = `poll_${++this.idCounter}`;
    const subscription: PollSubscription = {
      id,
      intervalMs,
      callback: callback as PollCallback<unknown>,
      fetcher,
    };

    // Initial fetch
    fetcher().then(callback).catch(console.error);

    // Set up polling
    subscription.timer = setInterval(async () => {
      try {
        const data = await fetcher();
        subscription.lastFetchTime = Date.now();
        callback(data as T);
      } catch (error) {
        console.error(`[PollingManager] Error in subscription ${id}:`, error);
      }
    }, intervalMs);

    this.subscriptions.set(id, subscription);
    return id;
  }

  unsubscribe(id: string): boolean {
    const subscription = this.subscriptions.get(id);
    if (subscription) {
      if (subscription.timer) {
        clearInterval(subscription.timer);
      }
      this.subscriptions.delete(id);
      return true;
    }
    return false;
  }

  updateInterval(id: string, intervalMs: number): boolean {
    const subscription = this.subscriptions.get(id);
    if (subscription) {
      if (subscription.timer) {
        clearInterval(subscription.timer);
      }
      subscription.intervalMs = intervalMs;
      subscription.timer = setInterval(async () => {
        try {
          const data = await subscription.fetcher();
          subscription.lastFetchTime = Date.now();
          subscription.callback(data);
        } catch (error) {
          console.error(`[PollingManager] Error in subscription ${id}:`, error);
        }
      }, intervalMs);
      return true;
    }
    return false;
  }

  clear(): void {
    for (const subscription of this.subscriptions.values()) {
      if (subscription.timer) {
        clearInterval(subscription.timer);
      }
    }
    this.subscriptions.clear();
  }
}

export const pollingManager = new PollingManager();

// =============================================================================
// SSE Stream Manager
// =============================================================================

interface SSESubscription {
  id: string;
  eventSource: EventSource;
  callback: (logs: LogEntry[]) => void;
  onError?: (error: Event) => void;
}

class SSEStreamManager {
  private subscriptions = new Map<string, SSESubscription>();
  private idCounter = 0;

  subscribe(
    url: string,
    callback: (logs: LogEntry[]) => void,
    onError?: (error: Event) => void
  ): string {
    const id = `sse_${++this.idCounter}`;

    const eventSource = new EventSource(url);

    eventSource.addEventListener('connected', () => {
      console.log('[SSE] Connected to log stream');
    });

    eventSource.addEventListener('logs', (event) => {
      try {
        const logs = JSON.parse(event.data) as LogEntry[];
        if (logs.length > 0) {
          callback(logs);
        }
      } catch (error) {
        console.error('[SSE] Error parsing logs:', error);
      }
    });

    eventSource.addEventListener('error', (event) => {
      console.error('[SSE] Stream error:', event);
      if (onError) {
        onError(event);
      }
    });

    eventSource.onerror = (error) => {
      console.error('[SSE] Connection error:', error);
      // EventSource will automatically reconnect
    };

    this.subscriptions.set(id, { id, eventSource, callback, onError });
    return id;
  }

  unsubscribe(id: string): boolean {
    const subscription = this.subscriptions.get(id);
    if (subscription) {
      subscription.eventSource.close();
      this.subscriptions.delete(id);
      console.log(`[SSE] Unsubscribed from stream ${id}`);
      return true;
    }
    return false;
  }

  clear(): void {
    for (const subscription of this.subscriptions.values()) {
      subscription.eventSource.close();
    }
    this.subscriptions.clear();
    console.log('[SSE] Cleared all subscriptions');
  }
}

export const sseStreamManager = new SSEStreamManager();

// =============================================================================
// Client
// =============================================================================

class LoggingStreamClient {
  private getHeaders(): Record<string, string> {
    const token = useAuthStore.getState().token;
    const orgId = useOrgStore.getState().currentOrgId;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Context headers for the logging service.
    //
    // BEHAVIOUR CHANGE, 6 Aug 2026. Two of these were gated on
    // import.meta.env.DEV and were not logging — they were the app deciding
    // what to claim about itself based on a flag that measured wrong.
    //
    // X-Org-Id was OMITTED in "development" so the logging service would fall
    // back to its "symbia-dev" default, which matched the seeded demo data.
    // That is a convenience that hides whether org scoping works at all: the
    // panel showed rows either way. It is now always sent when we have one, so
    // an org with no data shows no data — which is the truth.
    //
    // X-Env was `DEV ? 'development' : 'production'`. A browser cannot know
    // which environment a stack is deployed as; it was reporting a build flag
    // as a fact about the world. It is no longer sent. The service may default
    // it, refuse without it, or ignore it — any of those is more honest than a
    // guess, and if the service needs it, it should come from the service.
    if (orgId) {
      headers['X-Org-Id'] = orgId;
    }
    headers['X-Service-Id'] = 'control-center';
    headers['X-Data-Class'] = 'internal';

    return headers;
  }

  private getBaseUrl(): string {
    return `${getServiceUrl('logging')}/api`;
  }

  // ===========================================================================
  // Log Streams
  // ===========================================================================

  async getLogStreams(): Promise<LogStream[]> {
    const response = await fetch(`${this.getBaseUrl()}/logs/streams`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to get log streams');
    }

    return response.json();
  }

  async getLogStream(id: string): Promise<LogStream | null> {
    const response = await fetch(`${this.getBaseUrl()}/logs/streams/${id}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to get log stream: ${id}`);
    }

    return response.json();
  }

  // ===========================================================================
  // Log Queries
  // ===========================================================================

  async queryLogs(query: LogsQuery): Promise<LogEntry[]> {
    const response = await fetch(`${this.getBaseUrl()}/logs/query`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(query),
    });

    if (!response.ok) {
      throw new Error('Failed to query logs');
    }

    const data = await response.json();
    return data.data || [];
  }

  async getRecentLogs(options?: {
    streamIds?: string[];
    level?: 'debug' | 'info' | 'warn' | 'error';
    limit?: number;
  }): Promise<LogEntry[]> {
    return this.queryLogs({
      streamIds: options?.streamIds,
      level: options?.level,
      limit: options?.limit || 100,
    });
  }

  /**
   * Subscribe to live log updates via SSE (Server-Sent Events)
   * Falls back to polling if SSE is not available
   */
  subscribeLogs(
    callback: (logs: LogEntry[]) => void,
    options?: {
      streamIds?: string[];
      level?: 'debug' | 'info' | 'warn' | 'error';
      limit?: number;
      intervalMs?: number;
      usePolling?: boolean;
    }
  ): string {
    // Build SSE URL with query parameters
    const params = new URLSearchParams();
    if (options?.streamIds?.length) {
      params.set('streamIds', options.streamIds.join(','));
    }
    if (options?.level) {
      params.set('level', options.level);
    }
    if (options?.limit) {
      params.set('limit', String(options.limit));
    }

    const sseUrl = `${this.getBaseUrl()}/logs/stream?${params.toString()}`;

    // Use SSE by default, fall back to polling if requested
    if (options?.usePolling) {
      return pollingManager.subscribe(
        () => this.getRecentLogs({
          streamIds: options?.streamIds,
          level: options?.level,
          limit: options?.limit || 50,
        }),
        callback,
        options?.intervalMs || 3000
      );
    }

    // Use SSE for real-time streaming
    return sseStreamManager.subscribe(
      sseUrl,
      callback,
      () => {
        console.warn('[LoggingStreamClient] SSE error, consider falling back to polling');
      }
    );
  }

  /**
   * Subscribe to live log updates via polling (legacy method)
   * @deprecated Use subscribeLogs with usePolling: true instead
   */
  subscribeLogsPoll(
    callback: (logs: LogEntry[]) => void,
    options?: {
      streamIds?: string[];
      level?: 'debug' | 'info' | 'warn' | 'error';
      limit?: number;
      intervalMs?: number;
    }
  ): string {
    return pollingManager.subscribe(
      () => this.getRecentLogs({
        streamIds: options?.streamIds,
        level: options?.level,
        limit: options?.limit || 50,
      }),
      callback,
      options?.intervalMs || 3000
    );
  }

  // ===========================================================================
  // Metrics
  // ===========================================================================

  async getMetrics(): Promise<MetricDefinition[]> {
    const response = await fetch(`${this.getBaseUrl()}/metrics`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to get metrics');
    }

    return response.json();
  }

  async queryMetrics(query: MetricsQuery): Promise<DataPoint[]> {
    const response = await fetch(`${this.getBaseUrl()}/metrics/query`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(query),
    });

    if (!response.ok) {
      throw new Error('Failed to query metrics');
    }

    const data = await response.json();
    return data.data || [];
  }

  /**
   * Subscribe to metric updates via polling
   */
  subscribeMetrics(
    metricIds: string[],
    callback: (dataPoints: DataPoint[]) => void,
    intervalMs: number = 5000
  ): string {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    return pollingManager.subscribe(
      () => this.queryMetrics({
        metricIds,
        startTime: fiveMinutesAgo.toISOString(),
        endTime: now.toISOString(),
      }),
      callback,
      intervalMs
    );
  }

  // ===========================================================================
  // Traces
  // ===========================================================================

  async getTraces(query?: TracesQuery): Promise<Trace[]> {
    const response = await fetch(`${this.getBaseUrl()}/traces/query`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(query || {}),
    });

    if (!response.ok) {
      throw new Error('Failed to get traces');
    }

    const data = await response.json();
    return data.data || [];
  }

  async getTrace(id: string): Promise<Trace | null> {
    const response = await fetch(`${this.getBaseUrl()}/traces/${id}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to get trace: ${id}`);
    }

    return response.json();
  }

  async getTraceSpans(traceId: string): Promise<Span[]> {
    const response = await fetch(`${this.getBaseUrl()}/traces/${traceId}/spans`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get spans for trace: ${traceId}`);
    }

    return response.json();
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  async getStats(): Promise<LoggingStats> {
    const response = await fetch(`${this.getBaseUrl()}/stats`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to get stats');
    }

    return response.json();
  }

  async getIngestRate(): Promise<Array<{ time: string; value: number }>> {
    const response = await fetch(`${this.getBaseUrl()}/stats/ingest-rate`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to get ingest rate');
    }

    return response.json();
  }

  async getQueryLatency(): Promise<Array<{ time: string; value: number }>> {
    const response = await fetch(`${this.getBaseUrl()}/stats/query-latency`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to get query latency');
    }

    return response.json();
  }

  /**
   * Subscribe to stats updates via polling
   */
  subscribeStats(
    callback: (stats: LoggingStats) => void,
    intervalMs: number = 10000
  ): string {
    return pollingManager.subscribe(() => this.getStats(), callback, intervalMs);
  }

  // ===========================================================================
  // Log Assistant (AI-powered analysis)
  // ===========================================================================

  async getAssistantConfig(): Promise<{ configured: boolean; capabilities: string[] }> {
    const response = await fetch(`${this.getBaseUrl()}/assistant/config`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to get assistant config');
    }

    return response.json();
  }

  async summarizeLogs(options: {
    logIds?: string[];
    startTime?: string;
    endTime?: string;
    streamIds?: string[];
    level?: string;
    search?: string;
    limit?: number;
  }): Promise<LogAnalysis> {
    const response = await fetch(`${this.getBaseUrl()}/assistant/summarize`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      throw new Error('Failed to summarize logs');
    }

    return response.json();
  }

  async analyzeLogs(options: {
    logIds?: string[];
    startTime?: string;
    endTime?: string;
    streamIds?: string[];
    search?: string;
    limit?: number;
  }): Promise<LogAnalysis> {
    const response = await fetch(`${this.getBaseUrl()}/assistant/analyze`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      throw new Error('Failed to analyze logs');
    }

    return response.json();
  }

  async groupLogs(options: {
    logIds?: string[];
    startTime?: string;
    endTime?: string;
    limit?: number;
  }): Promise<{ groups: Array<{ name: string; logs: LogEntry[] }> }> {
    const response = await fetch(`${this.getBaseUrl()}/assistant/group`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      throw new Error('Failed to group logs');
    }

    return response.json();
  }

  async investigateInsight(
    insight: LogInsight,
    options: {
      startTime?: string;
      endTime?: string;
      streamIds?: string[];
      level?: string;
      search?: string;
      limit?: number;
    }
  ): Promise<{
    findings: string[];
    relatedLogs: LogEntry[];
    recommendations: string[];
  }> {
    const response = await fetch(`${this.getBaseUrl()}/assistant/investigate`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ insight, ...options }),
    });

    if (!response.ok) {
      throw new Error('Failed to investigate insight');
    }

    return response.json();
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Unsubscribe from a subscription (handles both SSE and polling)
   */
  unsubscribe(subscriptionId: string): boolean {
    // Try SSE first
    if (subscriptionId.startsWith('sse_')) {
      return sseStreamManager.unsubscribe(subscriptionId);
    }
    // Fall back to polling
    return pollingManager.unsubscribe(subscriptionId);
  }

  /**
   * Clear all subscriptions (both SSE and polling)
   */
  clearAllSubscriptions(): void {
    sseStreamManager.clear();
    pollingManager.clear();
  }
}

export const loggingStreamClient = new LoggingStreamClient();
