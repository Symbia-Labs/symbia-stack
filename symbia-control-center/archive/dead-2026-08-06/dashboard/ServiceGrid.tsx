import { useEffect, useCallback } from 'react';
import { SERVICES } from '@/config/services';
import { usePlatformStore } from '@/stores/platformStore';
import { platformClient, type ServiceStats } from '@/services/platformClient';

// Format large numbers compactly
function formatNumber(n: number | undefined): string {
  if (n === undefined) return '-';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// Get key metrics to display for each service type
function getServiceMetrics(serviceId: string, stats: ServiceStats | undefined): Array<{ label: string; value: string }> {
  if (!stats) return [];

  switch (serviceId) {
    case 'logging':
      return [
        { label: 'Logs', value: formatNumber(stats.totalLogEntries) },
        { label: 'Metrics', value: formatNumber(stats.totalDataPoints) },
        { label: 'Rate', value: stats.ingestRate !== undefined ? `${stats.ingestRate}/s` : '-' },
      ];
    case 'catalog':
      return [
        { label: 'Resources', value: formatNumber(stats.totalResources) },
        { label: 'Bootstrap', value: formatNumber(stats.bootstrapEntries) },
      ];
    case 'runtime':
      return [
        { label: 'Graphs', value: formatNumber(stats.loadedGraphs) },
        { label: 'Active', value: formatNumber(stats.activeExecutions) },
        { label: 'Processed', value: formatNumber(stats.totalMessagesProcessed) },
      ];
    case 'network':
      return [
        { label: 'Events', value: formatNumber(stats.totalEvents) },
        { label: 'Delivered', value: formatNumber(stats.deliveredCount) },
        { label: 'Errors', value: formatNumber(stats.errorCount) },
      ];
    case 'assistants':
      return [
        { label: 'Loaded', value: formatNumber(stats.loadedAssistants) },
        { label: 'Active', value: formatNumber(stats.activeRuns) },
      ];
    case 'messaging':
      return [
        { label: 'Convos', value: formatNumber(stats.totalConversations) },
        { label: 'Connections', value: formatNumber(stats.activeConnections) },
      ];
    default:
      return [];
  }
}

export function ServiceGrid() {
  const {
    serviceHealth,
    isCheckingHealth,
    lastHealthCheck,
    setServiceHealth,
    setCheckingHealth,
    addEvent,
  } = usePlatformStore();

  const checkHealth = useCallback(async () => {
    setCheckingHealth(true);
    try {
      const results = await platformClient.checkAllHealthWithStats();
      const previousHealth = serviceHealth;
      setServiceHealth(results);

      // Log health state changes as events
      results.forEach((result) => {
        const previous = previousHealth.get(result.serviceId);
        const wasHealthy = previous?.status === 'healthy';
        const isNowHealthy = result.status === 'healthy';

        // Only emit event on state change or first check
        if (!previous || wasHealthy !== isNowHealthy) {
          if (result.status === 'unhealthy') {
            addEvent({
              type: 'service.unhealthy',
              source: result.serviceId,
              message: `${result.serviceId} is unhealthy: ${result.error || 'Unknown error'}`,
              data: result,
            });
          } else if (result.status === 'healthy' && previous) {
            // Only emit recovery events (not initial healthy state)
            addEvent({
              type: 'service.healthy',
              source: result.serviceId,
              message: `${result.serviceId} recovered (${result.latencyMs}ms)`,
              data: result,
            });
          }
        }
      });
    } finally {
      setCheckingHealth(false);
    }
  }, [serviceHealth, setServiceHealth, setCheckingHealth, addEvent]);

  // Initial check and interval
  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  const healthyCount = Array.from(serviceHealth.values()).filter(
    (h) => h.status === 'healthy'
  ).length;

  return (
    <div className="card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-text-primary">Services</h2>
          <span className="text-sm text-text-muted">
            {healthyCount}/{SERVICES.length} healthy
          </span>
        </div>
        {isCheckingHealth && (
          <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {SERVICES.map((service) => {
          const health = serviceHealth.get(service.id);
          const status = health?.status || 'unknown';
          const metrics = getServiceMetrics(service.id, health?.stats);

          return (
            <div
              key={service.id}
              className={`
                p-3 rounded-lg border transition-all duration-fast
                ${
                  status === 'healthy'
                    ? 'bg-success-muted border-success/30'
                    : status === 'unhealthy'
                    ? 'bg-error-muted border-error/30'
                    : 'bg-surface-highlight border-border'
                }
              `}
            >
              {/* Header row: status + name + latency */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`
                      w-2 h-2 rounded-full shrink-0
                      ${
                        status === 'healthy'
                          ? 'bg-success shadow-[0_0_8px_var(--success)]'
                          : status === 'unhealthy'
                          ? 'bg-error shadow-[0_0_8px_var(--error)]'
                          : 'bg-text-muted animate-pulse'
                      }
                    `}
                  />
                  <span
                    className="text-sm font-medium truncate"
                    style={{ color: service.color }}
                  >
                    {service.name}
                  </span>
                </div>
                {health?.latencyMs && (
                  <span className="text-xs text-text-muted shrink-0">
                    {health.latencyMs}ms
                  </span>
                )}
              </div>

              {/* Metrics grid */}
              {metrics.length > 0 && status === 'healthy' && (
                <div className="grid grid-cols-3 gap-1 mt-2 pt-2 border-t border-border-muted">
                  {metrics.map((metric) => (
                    <div key={metric.label} className="text-center">
                      <div className="text-xs font-medium text-text-primary">
                        {metric.value}
                      </div>
                      <div className="text-[10px] text-text-muted uppercase tracking-wider">
                        {metric.label}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Port (shown when no metrics) */}
              {metrics.length === 0 && status === 'healthy' && (
                <div className="text-xs text-text-muted">
                  :{service.port}
                </div>
              )}

              {/* Error message */}
              {health?.error && (
                <div className="text-xs text-error truncate mt-1" title={health.error}>
                  {health.error}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Last check timestamp */}
      {lastHealthCheck && (
        <div className="mt-3 text-xs text-text-muted text-right">
          Last check: {new Date(lastHealthCheck).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
