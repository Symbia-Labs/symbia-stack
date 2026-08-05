/**
 * Latency Chart Component
 *
 * Real-time line chart showing HTTP response latency over time.
 * Uses a standardized 60-second rolling timeline that updates every second.
 * X-axis shows relative time (-60s to now).
 */
import { useMemo, useRef, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

export interface LatencyDataPoint {
  timestamp: number;
  latency: number;
  path?: string;
  statusCode?: number;
}

interface LatencyChartProps {
  /** Raw latency data points */
  data: LatencyDataPoint[];
  /** Shared timeline (60 timestamps, one per second) - if not provided, generates own */
  timeline?: number[];
  height?: number;
  showP95Line?: boolean;
  color?: string;
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

function formatLatency(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}s`;
  }
  return `${Math.round(value)}ms`;
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
  latency: number | null;
  hasData: boolean;
}

export function LatencyChart({
  data,
  timeline,
  height = 200,
  showP95Line = true,
  color = '#22c55e',
  title,
}: LatencyChartProps) {
  // Accumulate data in a rolling buffer keyed by second
  const dataBufferRef = useRef<Map<number, number>>(new Map());
  const lastTimelineRef = useRef<number[]>([]);
  // Track smoothed Y-axis max for gradual scaling
  const yAxisMaxRef = useRef<number>(100); // Start with reasonable default

  // Update the data buffer when new data arrives
  useEffect(() => {
    data.forEach((point) => {
      const second = Math.floor(point.timestamp / 1000) * 1000;
      // Store latest (or average) latency for each second
      const existing = dataBufferRef.current.get(second);
      if (existing !== undefined) {
        // Average with existing
        dataBufferRef.current.set(second, (existing + point.latency) / 2);
      } else {
        dataBufferRef.current.set(second, point.latency);
      }
    });

    // Clean up old data (older than 2 minutes)
    const cutoff = Date.now() - 120000;
    for (const key of dataBufferRef.current.keys()) {
      if (key < cutoff) {
        dataBufferRef.current.delete(key);
      }
    }
  }, [data]);

  const { chartData, p95, avg, max, hasData, yAxisMax } = useMemo(() => {
    // Use provided timeline or generate one
    const timelineToUse = timeline || generateTimeline();
    lastTimelineRef.current = timelineToUse;

    // Build chart data using index-based positioning
    // Use null for empty points - Recharts will connect actual data points with connectNulls
    const points: ChartPoint[] = timelineToUse.map((timestamp, index) => {
      const latency = dataBufferRef.current.get(timestamp);
      if (latency !== undefined) {
        return { index, timestamp, latency: Math.round(latency), hasData: true };
      }
      // Return null for empty points - line will connect through these
      return { index, timestamp, latency: null, hasData: false };
    });

    // Calculate stats from buffer data within timeline (only actual readings)
    const allLatencies: number[] = [];
    timelineToUse.forEach((ts) => {
      const val = dataBufferRef.current.get(ts);
      if (val !== undefined) {
        allLatencies.push(val);
      }
    });

    if (allLatencies.length === 0) {
      return { chartData: points, p95: 0, avg: 0, max: 0, hasData: false, yAxisMax: yAxisMaxRef.current };
    }

    allLatencies.sort((a, b) => a - b);
    const p95Index = Math.floor(allLatencies.length * 0.95);
    const p95Value = allLatencies[p95Index] || 0;
    const avgValue = allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length;
    const maxValue = Math.max(...allLatencies);

    // Calculate target Y-axis max (2x the current max, rounded to nice number)
    const targetMax = Math.max(maxValue * 2, 10); // At least 10ms
    const niceMax = Math.ceil(targetMax / 10) * 10; // Round up to nearest 10

    // Smoothly transition Y-axis (20% movement toward target per update)
    const currentMax = yAxisMaxRef.current;
    const smoothingFactor = 0.2;
    const newMax = currentMax + (niceMax - currentMax) * smoothingFactor;
    // Snap to target if very close
    const finalMax = Math.abs(newMax - niceMax) < 5 ? niceMax : Math.round(newMax);
    yAxisMaxRef.current = finalMax;

    return {
      chartData: points,
      p95: p95Value,
      avg: avgValue,
      max: maxValue,
      hasData: true,
      yAxisMax: finalMax,
    };
  }, [data, timeline]);

  const totalPoints = chartData.length;

  return (
    <div className="space-y-2">
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-300">{title}</h3>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span>Avg: <span className={hasData ? 'text-slate-300' : 'text-slate-500'}>{formatLatency(avg)}</span></span>
            <span>P95: <span className={hasData ? 'text-amber-400' : 'text-slate-500'}>{formatLatency(p95)}</span></span>
            <span>Max: <span className={hasData ? 'text-red-400' : 'text-slate-500'}>{formatLatency(max)}</span></span>
          </div>
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
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
            tickFormatter={formatLatency}
            stroke="#64748b"
            fontSize={10}
            tickLine={false}
            axisLine={{ stroke: '#334155' }}
            width={45}
            domain={[0, yAxisMax]}
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
            formatter={(value) => [formatLatency(value as number), 'Latency']}
          />
          {showP95Line && p95 > 0 && (
            <ReferenceLine
              y={p95}
              stroke="#f59e0b"
              strokeDasharray="5 5"
              strokeOpacity={0.7}
            />
          )}
          <Line
            type="monotone"
            dataKey="latency"
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: color }}
            isAnimationActive={false}
            connectNulls={true}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
