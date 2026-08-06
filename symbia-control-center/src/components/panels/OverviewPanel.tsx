/**
 * Overview Panel
 *
 * High-level dashboard with live platform metrics and service health.
 */
import { useEffect, useState, useRef } from 'react';
import { platformClient, type ServiceHealth } from '@/services/platformClient';
import { useServices } from '@/hooks/useServices';
import { SERVICES, type ServiceConfig } from '@/config/services';
import { ServiceObservationPanel } from './ServiceObservationPanel';
import { Sparkline } from '@/components/charts/Sparkline';

// Number of data points to keep for sparklines (60 seconds)
const SPARKLINE_HISTORY_SIZE = 60;

const SPARKLINE_COLORS = {
  primary: '#00e5ff',
  secondary: '#a855f7',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
};

function MetricCard({
  label,
  value,
  subtext,
  color = 'primary',
  icon,
  sparklineData,
  notFetched,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  color?: 'primary' | 'secondary' | 'green' | 'amber' | 'red';
  icon?: React.ReactNode;
  sparklineData?: number[];
  /**
   * SYMBIA_MARKER_T02_NOT_FETCHED_20260805
   * When the number could not be fetched, pass the reason here. The card then
   * renders "—" and names the reason instead of printing a number it does not
   * have. A confident 0 that means "never asked" is the exact failure this
   * product exists to argue against; it should not be in the product.
   */
  notFetched?: string | null;
}) {
  const colorClasses = {
    primary: 'text-scc-primary border-scc-primary/30',
    secondary: 'text-scc-secondary border-scc-secondary/30',
    green: 'text-emerald-400 border-emerald-400/30',
    amber: 'text-amber-400 border-amber-400/30',
    red: 'text-red-400 border-red-400/30',
  };
  const shownColor = notFetched ? 'amber' : color;

  return (
    <div className={`scc-card p-4 border ${colorClasses[shownColor]}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-text-muted uppercase tracking-wider mb-1">{label}</p>
          <p className={`text-2xl font-bold ${colorClasses[shownColor].split(' ')[0]}`}>
            {notFetched ? '—' : value}
          </p>
          {notFetched ? (
            <p className="text-xs text-amber-400/90 mt-1" title={notFetched}>
              {notFetched}
            </p>
          ) : (
            subtext && <p className="text-xs text-text-muted mt-1">{subtext}</p>
          )}
        </div>
        {icon && <div className="text-text-muted">{icon}</div>}
      </div>
      {sparklineData && sparklineData.length > 0 && (
        <div className="mt-3 -mx-1">
          <Sparkline data={sparklineData} color={SPARKLINE_COLORS[color]} height={28} />
        </div>
      )}
    </div>
  );
}

function ServiceHealthCard({
  service,
  health,
  onClick,
}: {
  service: ServiceConfig;
  health?: ServiceHealth;
  onClick?: () => void;
}) {
  const isHealthy = health?.status === 'healthy';
  const latency = health?.latencyMs;

  return (
    <div
      onClick={onClick}
      className={`
        scc-card p-3 border transition-all cursor-pointer
        ${isHealthy
          ? 'border-success/30 hover:border-success/50'
          : health?.status === 'unhealthy'
          ? 'border-error/30 hover:border-error/50'
          : 'border-border hover:border-border-emphasis'
        }
      `}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className={`
              w-2 h-2 rounded-full
              ${isHealthy
                ? 'bg-success shadow-[0_0_8px_var(--success)]'
                : health?.status === 'unhealthy'
                ? 'bg-error'
                : 'bg-text-muted animate-pulse'
              }
            `}
          />
          <span
            className="font-medium text-sm"
            style={{ color: service.color }}
          >
            {service.name}
          </span>
        </div>
        {latency !== undefined && (
          <span className="text-xs text-text-muted">{latency}ms</span>
        )}
      </div>
      <p className="text-xs text-text-muted">{service.description}</p>
      {health?.stats && (
        <div className="mt-2 pt-2 border-t border-scc-border">
          <div className="grid grid-cols-3 gap-2 text-xs">
            {Object.entries(health.stats).slice(0, 3).map(([key, value]) => (
              <div key={key}>
                <p className="text-text-muted truncate">{formatStatKey(key)}</p>
                <p className="text-text-secondary font-medium">{formatStatValue(value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatStatKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .replace(/total/i, '')
    .trim();
}

function formatStatValue(value: unknown): string {
  if (typeof value === 'number') {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return String(value);
  }
  return String(value || '-');
}

// Track sparkline history
interface SparklineHistory {
  logs: number[];
  metrics: number[];
  dataPoints: number[];
  ingestRate: number[];
}

export function OverviewPanel() {
  const [healthMap, setHealthMap] = useState<Map<string, ServiceHealth>>(new Map());
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<'overview' | 'observation'>('overview');
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);

  // Historical data for sparklines
  const sparklineHistoryRef = useRef<SparklineHistory>({
    logs: [],
    metrics: [],
    dataPoints: [],
    ingestRate: [],
  });
  const [sparklineData, setSparklineData] = useState<SparklineHistory>({
    logs: [],
    metrics: [],
    dataPoints: [],
    ingestRate: [],
  });

  const handleServiceClick = (serviceId: string) => {
    setSelectedServiceId(serviceId);
    setViewMode('observation');
  };

  const handleBackToOverview = () => {
    setViewMode('overview');
    setSelectedServiceId(null);
  };

  const {
    loadedAssistants,
    runs,
    providers,
    networkNodes,
    loggingStats,
    assistantsError,
    integrationsError,
  } = useServices();

  // Subscribe to health updates
  useEffect(() => {
    platformClient.subscribeToHealthUpdates(
      (health) => {
        const map = new Map<string, ServiceHealth>();
        health.forEach((h) => map.set(h.serviceId, h));
        setHealthMap(map);
        setLastUpdate(new Date());
      },
      { intervalMs: 5000, includeStats: true }
    );

    return () => {
      platformClient.unsubscribeFromHealthUpdates();
    };
  }, []);

  // Update sparkline history when stats change
  useEffect(() => {
    if (!loggingStats) return;

    const history = sparklineHistoryRef.current;

    // Add new values
    history.logs.push(loggingStats.totalLogEntries || 0);
    history.metrics.push(loggingStats.totalMetrics || 0);
    history.dataPoints.push(loggingStats.totalDataPoints || 0);
    history.ingestRate.push(loggingStats.ingestRate || 0);

    // Trim to history size
    if (history.logs.length > SPARKLINE_HISTORY_SIZE) {
      history.logs = history.logs.slice(-SPARKLINE_HISTORY_SIZE);
      history.metrics = history.metrics.slice(-SPARKLINE_HISTORY_SIZE);
      history.dataPoints = history.dataPoints.slice(-SPARKLINE_HISTORY_SIZE);
      history.ingestRate = history.ingestRate.slice(-SPARKLINE_HISTORY_SIZE);
    }

    // Update state to trigger re-render
    setSparklineData({
      logs: [...history.logs],
      metrics: [...history.metrics],
      dataPoints: [...history.dataPoints],
      ingestRate: [...history.ingestRate],
    });
  }, [loggingStats]);

  // SYMBIA_MARKER_T01_HEALTH_HONEST_20260805
  // "8/8 healthy" was reported while services that had never answered were
  // simply absent from healthMap — and separately while Chat was dead behind
  // a service whose /health returns 200. Two different lies sharing one tile.
  // Split the three states apart and never fold "unknown" into either side.
  const healthValues = Array.from(healthMap.values());
  const healthyCount = healthValues.filter((h) => h.status === 'healthy').length;
  const unhealthyCount = healthValues.filter((h) => h.status === 'unhealthy').length;
  const totalServices = SERVICES.length;
  const unknownCount = totalServices - healthyCount - unhealthyCount;
  const healthSubtext =
    unknownCount > 0
      ? `healthy · ${unknownCount} not reporting`
      : unhealthyCount > 0
      ? `healthy · ${unhealthyCount} down`
      : 'responding to /health';
  const activeRuns = runs.filter((r) => r.status === 'running').length;

  // Show Service Observation Panel when a service is selected
  if (viewMode === 'observation' && selectedServiceId) {
    const selectedService = SERVICES.find((s) => s.id === selectedServiceId);
    if (selectedService) {
      return (
        <ServiceObservationPanel
          serviceId={selectedServiceId}
          service={selectedService}
          initialHealth={healthMap.get(selectedServiceId)}
          onBack={handleBackToOverview}
        />
      );
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 p-6 border-b border-scc-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">Platform Overview</h1>
            <p className="text-sm text-text-muted mt-1">
              Real-time status and metrics across all Symbia services
            </p>
          </div>
          {lastUpdate && (
            <div className="text-xs text-text-muted">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <MetricCard
            label="Services"
            value={`${healthyCount}/${totalServices}`}
            subtext={healthSubtext}
            color={
              unknownCount > 0 || unhealthyCount > 0
                ? 'amber'
                : healthyCount === totalServices
                ? 'green'
                : 'amber'
            }
          />
          <MetricCard
            label="Network Nodes"
            value={networkNodes.length}
            subtext="connected"
            color="primary"
          />
          <MetricCard
            label="Active Runs"
            value={activeRuns}
            subtext={`of ${runs.length} total`}
            color={activeRuns > 0 ? 'secondary' : 'primary'}
          />
          <MetricCard
            label="Assistants"
            value={loadedAssistants.length}
            subtext="loaded"
            color="primary"
            notFetched={assistantsError}
          />
        </div>

        {/* Telemetry Summary with Sparklines */}
        {loggingStats && (
          <div className="mb-8">
            <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-4">
              Telemetry Summary
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard
                label="Total Logs"
                value={formatStatValue(loggingStats.totalLogEntries)}
                color="primary"
                sparklineData={sparklineData.logs}
              />
              <MetricCard
                label="Metrics"
                value={formatStatValue(loggingStats.totalMetrics)}
                color="secondary"
                sparklineData={sparklineData.metrics}
              />
              <MetricCard
                label="Data Points"
                value={formatStatValue(loggingStats.totalDataPoints)}
                color="primary"
                sparklineData={sparklineData.dataPoints}
              />
              <MetricCard
                label="Ingest Rate"
                value={loggingStats.ingestRate ? `${loggingStats.ingestRate}/s` : '-'}
                color="green"
                sparklineData={sparklineData.ingestRate}
              />
            </div>
          </div>
        )}

        {/* Service Health Grid */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-4">
            Service Health
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {SERVICES.map((service) => (
              <ServiceHealthCard
                key={service.id}
                service={service}
                health={healthMap.get(service.id)}
                onClick={() => handleServiceClick(service.id)}
              />
            ))}
          </div>
        </div>

        {/* LLM Providers */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-4">
            LLM Providers
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {/*
              SYMBIA_MARKER_T03_PROVIDERS_20260805
              This said "No providers configured" while the API reported
              configuredProviders: 3. An empty list after a failed fetch is
              not the same fact as an empty list after a successful one, and
              it must not render the same sentence. When the fetch failed,
              say so and name the service; only claim "none configured" when
              we actually asked and were told none.
            */}
            {providers.length === 0 && integrationsError ? (
              <div className="scc-card p-4 col-span-full border border-amber-400/40">
                <p className="text-sm text-amber-400">
                  Provider list unavailable — integrations service: {integrationsError}
                </p>
                <p className="text-xs text-text-muted mt-1">
                  This is not a claim that no providers exist. It means the list
                  could not be read.
                </p>
              </div>
            ) : providers.length === 0 ? (
              <div className="scc-card p-4 col-span-full">
                <p className="text-sm text-text-muted">
                  No providers configured
                </p>
                <p className="text-xs text-text-muted mt-1">
                  Integrations service answered; the list was empty.
                </p>
              </div>
            ) : (
              providers.map((p) => (
                <div key={p.name} className="scc-card p-4 border border-scc-border">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded bg-primary-500/20 flex items-center justify-center">
                      <span className="text-sm font-bold text-primary-500">
                        {p.name.slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary capitalize">{p.name}</p>
                      <p className="text-xs text-text-muted truncate">{p.defaultModel}</p>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-success shadow-[0_0_8px_var(--success)]" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
