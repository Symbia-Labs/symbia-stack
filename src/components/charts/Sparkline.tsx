/**
 * Sparkline Component
 *
 * Minimal line chart for inline visualization in metric cards.
 * Shows trends without axis labels or legends.
 */
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

export interface SparklineProps {
  /** Array of numeric values to display */
  data: number[];
  /** Line color */
  color?: string;
  /** Chart height in pixels */
  height?: number;
  /** Show area fill under line */
  showArea?: boolean;
}

export function Sparkline({
  data,
  color = '#22c55e',
  height = 32,
  showArea = false,
}: SparklineProps) {
  // Convert to chart format
  const chartData = data.map((value, index) => ({ index, value }));

  // Calculate min/max for proper scaling
  const values = data.filter((v) => v > 0);
  const min = values.length > 0 ? Math.min(...values) * 0.8 : 0;
  const max = values.length > 0 ? Math.max(...values) * 1.2 : 100;

  if (data.length === 0 || values.length === 0) {
    // Show empty state
    return (
      <div style={{ height }} className="flex items-center justify-center">
        <div className="h-px w-full bg-slate-700 opacity-50" />
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <YAxis domain={[min, max]} hide />
        <defs>
          {showArea && (
            <linearGradient id={`sparkGradient-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          )}
        </defs>
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
          fill={showArea ? `url(#sparkGradient-${color.replace('#', '')})` : 'none'}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
