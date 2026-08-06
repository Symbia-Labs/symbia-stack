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

class PlatformClient {
  private getHeaders(): Record<string, string> {
    const token = useAuthStore.getState().token;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
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

  // Check health of a single service
  async checkHealth(serviceId: string): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      const url = getServiceUrl(serviceId);
      const response = await fetch(`${url}/health`, {
        method: 'GET',
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
  async checkAllHealth(): Promise<ServiceHealth[]> {
    const results = await Promise.all(
      SERVICES.map((service) => this.checkHealth(service.id))
    );
    return results;
  }

  // Fetch stats for a single service
  async getServiceStats(serviceId: string): Promise<ServiceStats | null> {
    try {
      const url = getServiceUrl(serviceId);
      let statsUrl: string;

      // Different services have different stats endpoints
      switch (serviceId) {
        case 'network':
          statsUrl = `${url}/api/events/stats`;
          break;
        default:
          statsUrl = `${url}/api/stats`;
      }

      const response = await fetch(statsUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });

      if (response.ok) {
        return response.json();
      }
      return null;
    } catch {
      return null;
    }
  }

  // Check health and fetch stats for all services
  async checkAllHealthWithStats(): Promise<ServiceHealth[]> {
    const healthResults = await this.checkAllHealth();

    // Fetch stats in parallel for healthy services
    const statsPromises = healthResults.map(async (health) => {
      if (health.status === 'healthy') {
        const stats = await this.getServiceStats(health.serviceId);
        return { ...health, stats: stats || undefined };
      }
      return health;
    });

    return Promise.all(statsPromises);
  }

  // Get service bootstrap info
  async getServiceBootstrap(serviceId: string): Promise<ServiceBootstrap | null> {
    try {
      const url = getServiceUrl(serviceId);
      const response = await fetch(`${url}/api/bootstrap/service`, {
        method: 'GET',
        headers: this.getHeaders(),
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
    graphId: string,
    input?: Record<string, unknown>
  ): Promise<{ executionId: string } | null> {
    try {
      const url = `${getServiceUrl('runtime')}/api/graphs/${graphId}/execute`;
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
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
  async getExecutionStatus(executionId: string): Promise<ExecutionStatus | null> {
    try {
      const url = `${getServiceUrl('runtime')}/api/executions/${executionId}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
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
  async getRecentLogs(options?: {
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
        headers: this.getHeaders(),
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
  async getMetricsSummary(): Promise<unknown | null> {
    try {
      const url = `${getServiceUrl('logging')}/api/metrics/summary`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
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
  async getNetworkNodes(): Promise<unknown[]> {
    try {
      const url = `${getServiceUrl('network')}/api/sdn/nodes`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
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
    const fetcher = options?.includeStats
      ? () => this.checkAllHealthWithStats()
      : () => this.checkAllHealth();

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
