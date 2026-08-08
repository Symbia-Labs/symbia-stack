import { SERVICES, getServiceUrl } from '@/config/services';
import { useAuthStore } from '@/stores/authStore';
import { CatalogClient, type Resource, type ResourceType } from '@symbia/catalog-client';
import { pollingManager } from './loggingStreamClient';

// Re-export Resource type for convenience
export type CatalogResource = Resource;

export interface ServiceHealth {
  serviceId: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  latencyMs?: number;
  version?: string;
  uptime?: string;
  error?: string;
  checkedAt: string;
  stats?: ServiceStats;
  /**
   * Why there are no stats, when there are none.
   *
   * `stats` being undefined used to mean three different things at once: the
   * service exposes no metrics, the request failed, or nobody asked. The tile
   * rendered all three as an empty space below the description, which reads as
   * "this service has nothing to report" — the most flattering of the three,
   * and the one that was almost never true.
   *
   * Separated so the tile can say which. Observation, not inference: this
   * holds what happened ("HTTP 401"), never a conclusion about what it means.
   */
  statsError?: string;
}

// Service-specific stats - different services expose different metrics
export interface ServiceStats {
  // Logging service
  totalLogEntries?: number;
  totalMetrics?: number;
  totalDataPoints?: number;
  ingestRate?: number;
  queryLatency?: number;
  // Catalog service
  totalResources?: number;
  publishedVersions?: number;
  bootstrapEntries?: number;
  // Runtime service
  loadedGraphs?: number;
  activeExecutions?: number;
  totalMessagesProcessed?: number;
  // Network service
  totalEvents?: number;
  deliveredCount?: number;
  errorCount?: number;
  // Messaging service
  totalConversations?: number;
  totalMessages?: number;
  uniqueParticipants?: number;
  activeConnections?: number;
  // Assistants service
  loadedAssistants?: number;
  totalGraphs?: number;
  activeRuns?: number;
  totalRuns?: number;
  // Identity service
  totalUsers?: number;
  totalOrgs?: number;
  totalAgents?: number;
  // Integrations service
  totalProviders?: number;
  configuredProviders?: number;
  totalIntegrations?: number;
  // Generic
  [key: string]: number | string | undefined;
}

export interface ServiceBootstrap {
  service: string;
  version: string;
  description: string;
  docsUrls?: {
    openapi?: string;
    llms?: string;
  };
  endpoints?: Record<string, string>;
  authentication?: string[];
}

export interface PlatformEvent {
  id: string;
  type: string;
  source: string;
  timestamp: string;
  data: unknown;
}

// Runtime execution status response
export interface ExecutionStatus {
  id: string;
  graphId: string;
  state: 'initializing' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  instances?: Array<{
    nodeId: string;
    instanceId: string;
    componentId: string;
    state: string;
    metrics?: Record<string, number>;
  }>;
  metrics?: {
    messagesProcessed: number;
    messagesEmitted: number;
    componentInvocations: number;
    avgLatencyMs: number;
    errorCount: number;
  };
  error?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

// Create catalog client instance - will update token dynamically
const catalogClient = new CatalogClient({
  endpoint: getServiceUrl('catalog'),
});

/**
 * Why a request is being made, declared at the edge.
 *
 * The browser is where the answer is actually known. A timer firing a health
 * poll and a person pressing a button arrive at a service looking identical —
 * same origin header, same session, same paths in some cases — so nothing
 * downstream can work it out, and anything that tried would be guessing.
 *
 * Measured 8 Aug 2026 before this existed: 96% of observed HTTP traffic was
 * this console polling itself, indistinguishable from real activity.
 */
export type TrafficOrigin = 'internal' | 'user' | 'agent' | 'unknown';
const ORIGIN_HEADER = 'x-symbia-origin';

class PlatformClient {
  /**
   * @param origin Why this call is happening. REQUIRED at each call site
   *   rather than defaulting, because a default is a claim made by whoever
   *   forgot to think about it — and the flattering default here ("user")
   *   would quietly inflate the exact number this field exists to isolate.
   */
  private getHeaders(origin: TrafficOrigin): Record<string, string> {
    const token = useAuthStore.getState().token;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      [ORIGIN_HEADER]: origin,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  private updateCatalogToken(): void {
    const token = useAuthStore.getState().token;
    if (token) {
      catalogClient.setToken(token);
    }
  }

  /**
   * Check health of a single service.
   *
   * `origin` is a required argument and not a property of this method, because
   * this exact call has two different reasons behind it: the observability
   * panel polls it every 5s (internal) and the command bar calls it when a
   * person types `health <service>` (user). A method cannot know which; only
   * the call site can. Anything that guessed here would be writing a
   * conclusion into a probe.
   */
  async checkHealth(serviceId: string, origin: TrafficOrigin): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      const url = getServiceUrl(serviceId);
      const response = await fetch(`${url}/health`, {
        method: 'GET',
        headers: { [ORIGIN_HEADER]: origin },
        signal: AbortSignal.timeout(5000),
      });

      const latencyMs = Date.now() - start;

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        return {
          serviceId,
          status: 'healthy',
          latencyMs,
          version: data.version,
          uptime: data.uptime,
          checkedAt: new Date().toISOString(),
        };
      } else {
        return {
          serviceId,
          status: 'unhealthy',
          latencyMs,
          error: `HTTP ${response.status}`,
          checkedAt: new Date().toISOString(),
        };
      }
    } catch (error) {
      return {
        serviceId,
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        checkedAt: new Date().toISOString(),
      };
    }
  }

  // Check health of all services
  async checkAllHealth(origin: TrafficOrigin): Promise<ServiceHealth[]> {
    const results = await Promise.all(
      SERVICES.map((service) => this.checkHealth(service.id, origin))
    );
    return results;
  }

  /**
   * Where each service keeps its metrics.
   *
   * Only `network` differs, and it differs because its stats are about routed
   * events rather than about itself. Written as a map rather than a `switch`
   * with a `default` so that adding a service makes the omission visible here
   * instead of silently falling through to a path that 404s.
   */
  private statsPath(serviceId: string): string {
    const OVERRIDES: Record<string, string> = {
      network: '/api/events/stats',
    };
    return OVERRIDES[serviceId] ?? '/api/stats';
  }

  /**
   * Fetch stats for a single service.
   *
   * SENDS THE AUTH HEADER. It did not, and `logging` and `network` both answer
   * `/api/stats` with 401 without one — measured 8 Aug 2026 through the
   * console's own proxy. Both returned full metrics the moment a token was
   * attached, so the tiles were not empty because those services are quiet.
   * They were empty because nobody signed the request.
   *
   * `getHeaders()` was already right here in this class and doing exactly
   * this; this one method just never called it.
   *
   * Failures are RETURNED, not swallowed. The old `catch { return null }`
   * turned a 401, a timeout, a 404 and "no such endpoint" into the same
   * silence.
   */
  async getServiceStats(
    serviceId: string,
    origin: TrafficOrigin
  ): Promise<{ stats: ServiceStats | null; error?: string }> {
    const url = `${getServiceUrl(serviceId)}${this.statsPath(serviceId)}`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(origin),
        signal: AbortSignal.timeout(3000),
      });

      if (response.ok) {
        return { stats: await response.json() };
      }
      return { stats: null, error: `HTTP ${response.status}` };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.name === 'TimeoutError'
            ? 'timed out'
            : error.message
          : 'request failed';
      return { stats: null, error: message };
    }
  }

  // Check health and fetch stats for all services
  async checkAllHealthWithStats(origin: TrafficOrigin): Promise<ServiceHealth[]> {
    const healthResults = await this.checkAllHealth(origin);

    // Fetch stats in parallel for healthy services
    const statsPromises = healthResults.map(async (health) => {
      if (health.status === 'healthy') {
        const { stats, error } = await this.getServiceStats(health.serviceId, origin);
        return { ...health, stats: stats || undefined, statsError: error };
      }
      return health;
    });

    return Promise.all(statsPromises);
  }

  // Get service bootstrap info
  async getServiceBootstrap(serviceId: string, origin: TrafficOrigin): Promise<ServiceBootstrap | null> {
    try {
      const url = getServiceUrl(serviceId);
      const response = await fetch(`${url}/api/bootstrap/service`, {
        method: 'GET',
        headers: this.getHeaders(origin),
      });

      if (response.ok) {
        return response.json();
      }
      return null;
    } catch {
      return null;
    }
  }

  // Catalog: List resources (using @symbia/catalog-client)
  async listCatalogResources(options?: {
    type?: string;
    status?: string;
    limit?: number;
  }): Promise<Resource[]> {
    try {
      this.updateCatalogToken();
      return await catalogClient.listResources({
        type: options?.type as ResourceType | undefined,
        status: options?.status as 'draft' | 'published' | 'deprecated' | undefined,
        limit: options?.limit,
      });
    } catch (error) {
      console.error('[platformClient] listCatalogResources error:', error);
      return [];
    }
  }

  // Catalog: Get single resource (using @symbia/catalog-client)
  async getCatalogResource(id: string): Promise<Resource | null> {
    try {
      this.updateCatalogToken();
      return await catalogClient.getResource(id);
    } catch (error) {
      console.error('[platformClient] getCatalogResource error:', error);
      return null;
    }
  }

  // Catalog: Get bootstrap resources (using @symbia/catalog-client)
  async getBootstrapResources(): Promise<Resource[]> {
    try {
      this.updateCatalogToken();
      return await catalogClient.getBootstrap();
    } catch (error) {
      console.error('[platformClient] getBootstrapResources error:', error);
      return [];
    }
  }

  // Catalog: List assistants (using @symbia/catalog-client)
  async listAssistants(): Promise<Resource[]> {
    try {
      this.updateCatalogToken();
      return await catalogClient.listAssistants();
    } catch (error) {
      console.error('[platformClient] listAssistants error:', error);
      return [];
    }
  }

  // Runtime: Execute a graph
  async executeGraph(
    origin: TrafficOrigin,
    graphId: string,
    input?: Record<string, unknown>
  ): Promise<{ executionId: string } | null> {
    try {
      const url = `${getServiceUrl('runtime')}/api/graphs/${graphId}/execute`;
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(origin),
        body: JSON.stringify({ input }),
      });

      if (response.ok) {
        return response.json();
      }
      return null;
    } catch {
      return null;
    }
  }

  // Runtime: Get execution status
  async getExecutionStatus(executionId: string, origin: TrafficOrigin): Promise<ExecutionStatus | null> {
    try {
      const url = `${getServiceUrl('runtime')}/api/executions/${executionId}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(origin),
      });

      if (response.ok) {
        return response.json();
      }
      return null;
    } catch {
      return null;
    }
  }

  // Logging: Get recent logs
  async getRecentLogs(origin: TrafficOrigin, options?: {
    service?: string;
    level?: string;
    limit?: number;
  }): Promise<unknown[]> {
    try {
      const params = new URLSearchParams();
      if (options?.service) params.set('service', options.service);
      if (options?.level) params.set('level', options.level);
      if (options?.limit) params.set('limit', String(options.limit));

      const url = `${getServiceUrl('logging')}/api/logs${params.toString() ? `?${params}` : ''}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(origin),
      });

      if (response.ok) {
        const data = await response.json();
        return data.logs || data || [];
      }
      return [];
    } catch {
      return [];
    }
  }

  // Logging: Get metrics summary
  async getMetricsSummary(origin: TrafficOrigin): Promise<unknown | null> {
    try {
      const url = `${getServiceUrl('logging')}/api/metrics/summary`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(origin),
      });

      if (response.ok) {
        return response.json();
      }
      return null;
    } catch {
      return null;
    }
  }

  // Network: Get connected nodes
  async getNetworkNodes(origin: TrafficOrigin): Promise<unknown[]> {
    try {
      const url = `${getServiceUrl('network')}/api/sdn/nodes`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(origin),
      });

      if (response.ok) {
        const data = await response.json();
        return data.nodes || data || [];
      }
      return [];
    } catch {
      return [];
    }
  }

  // ===========================================================================
  // Event-Driven Health Monitoring
  // ===========================================================================

  private healthSubscriptionId: string | null = null;

  /**
   * Subscribe to health updates via polling
   * This provides near-real-time health monitoring for all services
   */
  subscribeToHealthUpdates(
    callback: (health: ServiceHealth[]) => void,
    options?: {
      intervalMs?: number;
      includeStats?: boolean;
    }
  ): string {
    // A timer. By definition nobody asked for this one — it is the console
    // observing the stack on its own initiative, which is the exact traffic
    // that made up ~96% of all recorded HTTP events on 8 Aug 2026.
    const fetcher = options?.includeStats
      ? () => this.checkAllHealthWithStats('internal')
      : () => this.checkAllHealth('internal');

    this.healthSubscriptionId = pollingManager.subscribe(
      fetcher,
      callback,
      options?.intervalMs || 10000 // Default to 10 seconds
    );

    return this.healthSubscriptionId;
  }

  /**
   * Unsubscribe from health updates
   */
  unsubscribeFromHealthUpdates(): void {
    if (this.healthSubscriptionId) {
      pollingManager.unsubscribe(this.healthSubscriptionId);
      this.healthSubscriptionId = null;
    }
  }

  /**
   * Update health check interval
   */
  setHealthCheckInterval(intervalMs: number): void {
    if (this.healthSubscriptionId) {
      pollingManager.updateInterval(this.healthSubscriptionId, intervalMs);
    }
  }
}

export const platformClient = new PlatformClient();
