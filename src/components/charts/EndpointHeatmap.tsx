/**
 * Endpoint Heatmap Component
 *
 * Displays endpoint performance as a heatmap with latency coloring.
 * Shows which endpoints are hot (high traffic) and slow (high latency).
 */
import { useMemo } from 'react';

export interface EndpointData {
  method: string;
  path: string;
  count: number;
  avgLatency: number;
  p95Latency: number;
  errorRate: number;
}

interface EndpointHeatmapProps {
  data: EndpointData[];
  maxEndpoints?: number;
  title?: string;
  sortBy?: 'count' | 'latency' | 'errors';
  onEndpointClick?: (endpoint: EndpointData) => void;
}

function getLatencyColor(avgLatency: number): string {
  if (avgLatency < 100) return '#22c55e';  // Green - fast
  if (avgLatency < 300) return '#84cc16';  // Lime - good
  if (avgLatency < 500) return '#eab308';  // Yellow - moderate
  if (avgLatency < 1000) return '#f59e0b'; // Orange - slow
  return '#ef4444';  // Red - very slow
}

function getHeatIntensity(count: number, maxCount: number): number {
  if (maxCount === 0) return 0.2;
  return Math.max(0.2, Math.min(1, count / maxCount));
}

function formatLatency(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
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

export function EndpointHeatmap({
  data,
  maxEndpoints = 10,
  title,
  sortBy = 'count',
  onEndpointClick,
}: EndpointHeatmapProps) {
  const sortedData = useMemo(() => {
    if (data.length === 0) return [];

    const sorted = [...data];
    switch (sortBy) {
      case 'latency':
        sorted.sort((a, b) => b.avgLatency - a.avgLatency);
        break;
      case 'errors':
        sorted.sort((a, b) => b.errorRate - a.errorRate);
        break;
      default:
        sorted.sort((a, b) => b.count - a.count);
    }

    return sorted.slice(0, maxEndpoints);
  }, [data, maxEndpoints, sortBy]);

  const maxCount = useMemo(() => {
    return Math.max(...sortedData.map((d) => d.count), 1);
  }, [sortedData]);

  if (sortedData.length === 0) {
    return (
      <div className="flex items-center justify-center bg-scc-elevated/30 rounded-lg border border-scc-border/50 h-48">
        <p className="text-slate-500 text-sm">No endpoint data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-300">{title}</h3>
          <div className="flex items-center gap-1 text-[10px] text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Fast
            <span className="w-2 h-2 rounded-full bg-amber-500 ml-2" /> Moderate
            <span className="w-2 h-2 rounded-full bg-red-500 ml-2" /> Slow
          </div>
        </div>
      )}
      <div className="bg-scc-elevated/30 rounded-lg border border-scc-border/50 overflow-hidden">
        {sortedData.map((endpoint, index) => {
          const latencyColor = getLatencyColor(endpoint.avgLatency);
          const intensity = getHeatIntensity(endpoint.count, maxCount);
          const methodColor = getMethodColor(endpoint.method);

          return (
            <div
              key={`${endpoint.method}-${endpoint.path}-${index}`}
              className={`flex items-center gap-3 px-3 py-2 border-b border-scc-border/20 last:border-b-0 hover:bg-scc-elevated/50 transition-colors ${
                onEndpointClick ? 'cursor-pointer' : ''
              }`}
              style={{
                background: `linear-gradient(90deg, ${latencyColor}${Math.round(intensity * 25).toString(16).padStart(2, '0')} 0%, transparent 100%)`,
              }}
              onClick={() => onEndpointClick?.(endpoint)}
            >
              {/* Method badge */}
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                style={{ backgroundColor: `${methodColor}20`, color: methodColor }}
              >
                {endpoint.method}
              </span>

              {/* Path */}
              <span className="text-xs text-slate-300 truncate flex-1" title={endpoint.path}>
                {endpoint.path}
              </span>

              {/* Metrics */}
              <div className="flex items-center gap-3 shrink-0">
                {/* Request count */}
                <div className="text-right">
                  <div className="text-xs font-medium text-slate-200">{endpoint.count}</div>
                  <div className="text-[10px] text-slate-500">req</div>
                </div>

                {/* Avg Latency */}
                <div className="text-right">
                  <div
                    className="text-xs font-medium"
                    style={{ color: latencyColor }}
                  >
                    {formatLatency(endpoint.avgLatency)}
                  </div>
                  <div className="text-[10px] text-slate-500">avg</div>
                </div>

                {/* P95 Latency */}
                <div className="text-right">
                  <div className="text-xs font-medium text-amber-400">
                    {formatLatency(endpoint.p95Latency)}
                  </div>
                  <div className="text-[10px] text-slate-500">p95</div>
                </div>

                {/* Error rate */}
                <div className="text-right w-12">
                  <div
                    className={`text-xs font-medium ${
                      endpoint.errorRate > 5 ? 'text-red-400' : 'text-slate-400'
                    }`}
                  >
                    {endpoint.errorRate.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-slate-500">err</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
