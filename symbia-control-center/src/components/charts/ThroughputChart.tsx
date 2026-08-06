/**
 * Throughput Chart Component
 *
 * Stacked bar chart showing requests per second over time.
 * Uses a standardized 60-second rolling timeline that updates every second.
 * X-axis shows relative time (-60s to now).
 * Color-coded by status (success/error).
 */
import { useMemo, useRef, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

export interface ThroughputDataPoint {
  timestamp: number;
  successCount: number;
  errorCount: number;
}

interface ThroughputChartProps {
  /** Raw request data with timestamps and status codes */
  rawData?: Array<{ timestamp: number; statusCode: number }>;
  /** Pre-aggregated data (alternative to rawData) */
  data?: ThroughputDataPoint[];
  /** Shared timeline (60 timestamps, one per second) - if not provided, generates own */
  timeline?: number[];
  height?: number;
  title?: string;
}

// Format as relative seconds from now (e.g., "-60s", "-30s", "now")
function formatRelativeTime(index: number, total: number): string {
  const secondsAgo = total - 1 - index;
  if (secondsAgo === 0) return 'now';
  // Only show labels every 10 seconds
  if (secondsAgo % 10 !== 0) return '';
  return `-${secondsAgo}s`;
}

function formatTimeFull(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Generate a 60-second timeline from now
function generateTimeline(): number[] {
  const now = Math.floor(Date.now() / 1000) * 1000;
  const timeline: number[] = [];
  for (let i = 59; i >= 0; i--) {
    timeline.push(now - i * 1000);
  }
  return timeline;
}

interface ChartPoint {
  index: number;
  timestamp: number;
  successCount: number;
  errorCount: number;
}

export function ThroughputChart({
  rawData,
  data,
  timeline,
  height = 180,
  title,
}: ThroughputChartProps) {
  // Accumulate data in a rolling buffer keyed by second
  const dataBufferRef = useRef<Map<number, { success: number; errors: number }>>(new Map());
  // Track smoothed Y-axis max for gradual scaling
  const yAxisMaxRef = useRef<number>(10); // Start with reasonable default

  // Update buffer from rawData
  useEffect(() => {
    if (rawData && rawData.length > 0) {
      rawData.forEach((point) => {
        const second = Math.floor(point.timestamp / 1000) * 1000;
        const existing = dataBufferRef.current.get(second) || { success: 0, errors: 0 };
        if (point.statusCode >= 400) {
          existing.errors++;
        } else {
          existing.success++;
        }
        dataBufferRef.current.set(second, existing);
      });
    }

    // Clean up old data (older than 2 minutes)
    const cutoff = Date.now() - 120000;
    for (const key of dataBufferRef.current.keys()) {
      if (key < cutoff) {
        dataBufferRef.current.delete(key);
      }
    }
  }, [rawData]);

  // Update buffer from pre-aggregated data
  useEffect(() => {
    if (data && data.length > 0) {
      data.forEach((point) => {
        const second = Math.floor(point.timestamp / 1000) * 1000;
        // For pre-aggregated data, use the values directly (don't accumulate)
        dataBufferRef.current.set(second, {
          success: point.successCount,
          errors: point.errorCount,
        });
      });
    }

    // Clean up old data
    const cutoff = Date.now() - 120000;
    for (const key of dataBufferRef.current.keys()) {
      if (key < cutoff) {
        dataBufferRef.current.delete(key);
      }
    }
  }, [data]);

  const { chartData, totalRequests, errorRate, hasData, yAxisMax } = useMemo(() => {
    // Use provided timeline or generate one
    const timelineToUse = timeline || generateTimeline();

    // Build chart data using index-based positioning
    // Use 0 for empty points (bars need numeric values)
    let total = 0;
    let errors = 0;
    let maxPerSecond = 0;

    const points: ChartPoint[] = timelineToUse.map((timestamp, index) => {
      const counts = dataBufferRef.current.get(timestamp);
      if (counts) {
        const perSecond = counts.success + counts.errors;
        total += perSecond;
        errors += counts.errors;
        maxPerSecond = Math.max(maxPerSecond, perSecond);
        return {
          index,
          timestamp,
          successCount: counts.success,
          errorCount: counts.errors,
        };
      }
      // Return 0 for empty points - bars will just not render
      return {
        index,
        timestamp,
        successCount: 0,
        errorCount: 0,
      };
    });

    const rate = total > 0 ? (errors / total) * 100 : 0;

    // Calculate target Y-axis max (2x the current max, at least 2)
    const targetMax = Math.max(maxPerSecond * 2, 2);
    const niceMax = Math.ceil(targetMax); // Round up to whole number

    // Smoothly transition Y-axis (20% movement toward target per update)
    const currentMax = yAxisMaxRef.current;
    const smoothingFactor = 0.2;
    const newMax = currentMax + (niceMax - currentMax) * smoothingFactor;
    // Snap to target if very close
    const finalMax = Math.abs(newMax - niceMax) < 1 ? niceMax : Math.round(newMax);
    yAxisMaxRef.current = finalMax;

    return {
      chartData: points,
      totalRequests: total,
      errorRate: rate,
      hasData: total > 0,
      yAxisMax: finalMax,
    };
  }, [rawData, data, timeline]);

  const totalPoints = chartData.length;

  return (
    <div className="space-y-2">
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-300">{title}</h3>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span>Total: <span className={hasData ? 'text-slate-300' : 'text-slate-500'}>{totalRequests}</span></span>
            <span>
              Error Rate:{' '}
              <span className={hasData ? (errorRate > 5 ? 'text-red-400' : 'text-emerald-400') : 'text-slate-500'}>
                {errorRate.toFixed(1)}%
              </span>
            </span>
          </div>
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} vertical={false} />
          <XAxis
            dataKey="index"
            tickFormatter={(index) => formatRelativeTime(index, totalPoints)}
            stroke="#64748b"
            fontSize={10}
            tickLine={false}
            axisLine={{ stroke: '#334155' }}
            interval={9}
            tick={{ fill: '#64748b' }}
          />
          <YAxis
            stroke="#64748b"
            fontSize={10}
            tickLine={false}
            axisLine={{ stroke: '#334155' }}
            width={35}
            domain={[0, yAxisMax]}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelFormatter={(index) => {
              const point = chartData[index as number];
              return point ? formatTimeFull(point.timestamp) : '';
            }}
            cursor={{ fill: 'rgba(100, 116, 139, 0.1)' }}
          />
          <Legend
            wrapperStyle={{ fontSize: '11px', paddingTop: '5px' }}
            iconType="square"
            iconSize={8}
          />
          <Bar
            dataKey="successCount"
            name="Success"
            stackId="requests"
            fill="#22c55e"
            isAnimationActive={false}
          />
          <Bar
            dataKey="errorCount"
            name="Errors"
            stackId="requests"
            fill="#ef4444"
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
