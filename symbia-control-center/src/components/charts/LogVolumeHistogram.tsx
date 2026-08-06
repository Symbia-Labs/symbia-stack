/**
 * Log Volume Histogram
 *
 * Stacked bar chart showing log volume over time, colored by log level.
 * Click a bar to zoom to that time range.
 */
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { type HistogramBucket } from '@/stores/logSearchStore';

const LEVEL_COLORS = {
  debug: '#94a3b8', // slate-400
  info: '#60a5fa',  // blue-400
  warn: '#fbbf24',  // amber-400
  error: '#f87171', // red-400
};

interface LogVolumeHistogramProps {
  data: HistogramBucket[];
  isLoading?: boolean;
  onBarClick?: (bucket: HistogramBucket) => void;
  height?: number;
}

export function LogVolumeHistogram({
  data,
  isLoading = false,
  onBarClick,
  height = 80,
}: LogVolumeHistogramProps) {
  if (isLoading) {
    return (
      <div className="w-full bg-scc-elevated/30 rounded border border-scc-border/50" style={{ height }}>
        <div className="flex items-center justify-center h-full text-sm text-slate-500">
          <svg className="w-4 h-4 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading histogram...
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="w-full bg-scc-elevated/30 rounded border border-scc-border/50" style={{ height }}>
        <div className="flex items-center justify-center h-full text-sm text-slate-500">
          No data for histogram
        </div>
      </div>
    );
  }

  // Format data for recharts
  const chartData = data.map((bucket, index) => ({
    ...bucket,
    index,
    timeLabel: bucket.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  }));

  return (
    <div className="w-full bg-scc-elevated/30 rounded border border-scc-border/50 p-2" style={{ height: height + 16 }}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={chartData}
          margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
          onClick={(e) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data = e as any;
            if (data && data.activePayload && data.activePayload[0] && onBarClick) {
              const payload = data.activePayload[0].payload as HistogramBucket;
              onBarClick(payload);
            }
          }}
        >
          <XAxis
            dataKey="timeLabel"
            tick={{ fill: '#64748b', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis hide />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
          />
          <Bar dataKey="error" stackId="stack" fill={LEVEL_COLORS.error} radius={[0, 0, 0, 0]}>
            {chartData.map((_, index) => (
              <Cell key={`error-${index}`} cursor="pointer" />
            ))}
          </Bar>
          <Bar dataKey="warn" stackId="stack" fill={LEVEL_COLORS.warn} radius={[0, 0, 0, 0]}>
            {chartData.map((_, index) => (
              <Cell key={`warn-${index}`} cursor="pointer" />
            ))}
          </Bar>
          <Bar dataKey="info" stackId="stack" fill={LEVEL_COLORS.info} radius={[0, 0, 0, 0]}>
            {chartData.map((_, index) => (
              <Cell key={`info-${index}`} cursor="pointer" />
            ))}
          </Bar>
          <Bar dataKey="debug" stackId="stack" fill={LEVEL_COLORS.debug} radius={[2, 2, 0, 0]}>
            {chartData.map((_, index) => (
              <Cell key={`debug-${index}`} cursor="pointer" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; fill: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const total = payload.reduce((sum, p) => sum + (p.value || 0), 0);

  return (
    <div className="bg-scc-surface border border-scc-border rounded px-3 py-2 shadow-lg">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <div className="space-y-0.5">
        {payload.filter(p => p.value > 0).reverse().map((p) => (
          <div key={p.name} className="flex items-center gap-2 text-xs">
            <div
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: p.fill }}
            />
            <span className="text-slate-400 capitalize">{p.name}:</span>
            <span className="text-slate-200 font-medium">{p.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 pt-1 border-t border-scc-border text-xs">
        <span className="text-slate-400">Total:</span>
        <span className="text-slate-200 font-medium ml-2">{total}</span>
      </div>
    </div>
  );
}
