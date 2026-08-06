import { endpoints } from '@/config/endpoints';

// Types for logging data
export interface LogEntry {
  id: string;
  streamId: string;
  timestamp: string;
  level: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface LogStream {
  id: string;
  name: string;
  description?: string;
  level?: string;
  orgId?: string;
  serviceId?: string;
  createdAt: string;
}

export interface MetricDefinition {
  id: string;
  name: string;
  metricType: string;
  description?: string;
  orgId?: string;
  serviceId?: string;
  createdAt: string;
}

export interface DataPoint {
  id: string;
  metricId: string;
  timestamp: string;
  value: number;
  labels?: Record<string, unknown>;
}

export interface Trace {
  id: string;
  traceId: string;
  name: string;
  serviceName?: string;
  startTime: string;
  endTime?: string;
  status?: string;
}

export interface LoggingStats {
  logs?: { total: number };
  metrics?: { total: number };
  traces?: { total: number };
  logStreams?: number;
  metricsCount?: number;
}

export interface LogQueryParams {
  streamIds?: string[];
  level?: string;
  search?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
}

export interface MetricQueryParams {
  metricIds?: string[];
  startTime?: string;
  endTime?: string;
  limit?: number;
}

class LoggingClient {
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    // Note: In dev mode, don't send Bearer token to logging service.
    // The logging service validates tokens against the production identity
    // service by default, so local tokens fail. In dev, the logging service
    // runs in "optional" auth mode and accepts anonymous requests.
    // Add required scope headers (per logging service bootstrap)
    headers['X-Org-Id'] = 'control-center';
    headers['X-Service-Id'] = 'scc-client';
    headers['X-Env'] = 'development';
    headers['X-Data-Class'] = 'none';
    headers['X-Policy-Ref'] = 'policy/default';
    return headers;
  }

  // Stats
  async getStats(): Promise<LoggingStats | null> {
    try {
      const response = await fetch(endpoints.logging.stats, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      if (response.ok) {
        return response.json();
      }
      return null;
    } catch (error) {
      console.error('[loggingClient] getStats error:', error);
      return null;
    }
  }

  // Log Streams
  async getLogStreams(): Promise<LogStream[]> {
    try {
      const response = await fetch(endpoints.logging.logStreams, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      if (response.ok) {
        return response.json();
      }
      return [];
    } catch (error) {
      console.error('[loggingClient] getLogStreams error:', error);
      return [];
    }
  }

  async createLogStream(name: string, description?: string): Promise<LogStream | null> {
    try {
      const response = await fetch(endpoints.logging.logStreams, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ name, description, level: 'info' }),
      });
      if (response.ok) {
        return response.json();
      }
      return null;
    } catch (error) {
      console.error('[loggingClient] createLogStream error:', error);
      return null;
    }
  }

  // Query Logs
  async queryLogs(params: LogQueryParams = {}): Promise<LogEntry[]> {
    try {
      const response = await fetch(endpoints.logging.logsQuery, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          streamIds: params.streamIds,
          level: params.level,
          search: params.search,
          startTime: params.startTime,
          endTime: params.endTime,
          limit: params.limit || 100,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        return data.data || [];
      }
      return [];
    } catch (error) {
      console.error('[loggingClient] queryLogs error:', error);
      return [];
    }
  }

  // Ingest Logs
  async ingestLogs(streamId: string, entries: Array<{
    timestamp?: string;
    level: string;
    message: string;
    metadata?: Record<string, unknown>;
  }>): Promise<boolean> {
    try {
      const formattedEntries = entries.map(e => ({
        timestamp: e.timestamp || new Date().toISOString(),
        level: e.level,
        message: e.message,
        metadata: e.metadata,
      }));

      const response = await fetch(endpoints.logging.logsIngest, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ streamId, entries: formattedEntries }),
      });
      return response.ok;
    } catch (error) {
      console.error('[loggingClient] ingestLogs error:', error);
      return false;
    }
  }

  // Metrics
  async getMetrics(): Promise<MetricDefinition[]> {
    try {
      const response = await fetch(endpoints.logging.metrics, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      if (response.ok) {
        return response.json();
      }
      return [];
    } catch (error) {
      console.error('[loggingClient] getMetrics error:', error);
      return [];
    }
  }

  async queryMetrics(params: MetricQueryParams = {}): Promise<DataPoint[]> {
    try {
      const response = await fetch(endpoints.logging.metricsQuery, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          metricIds: params.metricIds,
          startTime: params.startTime,
          endTime: params.endTime,
          limit: params.limit || 100,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        return data.data || [];
      }
      return [];
    } catch (error) {
      console.error('[loggingClient] queryMetrics error:', error);
      return [];
    }
  }

  // Traces
  async getTraces(): Promise<Trace[]> {
    try {
      const response = await fetch(endpoints.logging.traces, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      if (response.ok) {
        return response.json();
      }
      return [];
    } catch (error) {
      console.error('[loggingClient] getTraces error:', error);
      return [];
    }
  }
}

export const loggingClient = new LoggingClient();

// Browser-compatible telemetry client for sending events from Control Center
class ControlCenterTelemetry {
  private streamId: string | null = null;
  private queue: Array<{ level: string; message: string; metadata?: Record<string, unknown> }> = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private initializing = false;

  private async ensureStream(): Promise<string | null> {
    if (this.streamId) return this.streamId;
    if (this.initializing) return null;

    this.initializing = true;
    try {
      // Check if stream exists
      const streams = await loggingClient.getLogStreams();
      const existing = streams.find(s => s.name === 'control-center.client');
      if (existing) {
        this.streamId = existing.id;
        return this.streamId;
      }

      // Create new stream
      const stream = await loggingClient.createLogStream('control-center.client', 'Symbia Control Center web client telemetry');
      if (stream) {
        this.streamId = stream.id;
        return this.streamId;
      }
      return null;
    } finally {
      this.initializing = false;
    }
  }

  private scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flush();
      this.flushTimer = null;
    }, 2000);
  }

  async flush() {
    const streamId = await this.ensureStream();
    if (!streamId || this.queue.length === 0) return;

    const entries = [...this.queue];
    this.queue = [];

    await loggingClient.ingestLogs(streamId, entries);
  }

  log(level: string, message: string, metadata?: Record<string, unknown>) {
    this.queue.push({ level, message, metadata });
    this.scheduleFlush();
  }

  info(message: string, metadata?: Record<string, unknown>) {
    this.log('info', message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>) {
    this.log('warn', message, metadata);
  }

  error(message: string, metadata?: Record<string, unknown>) {
    this.log('error', message, metadata);
  }

  debug(message: string, metadata?: Record<string, unknown>) {
    this.log('debug', message, metadata);
  }

  event(eventType: string, message: string, metadata?: Record<string, unknown>) {
    this.log('info', message, { eventType, ...metadata });
  }
}

export const telemetry = new ControlCenterTelemetry();
