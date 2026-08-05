/**
 * Status Distribution Component
 *
 * Displays HTTP status code distribution as a horizontal bar chart
 * with color-coded status groups (2xx, 3xx, 4xx, 5xx).
 */
import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

export interface StatusCount {
  statusCode: number;
  count: number;
}

interface StatusDistributionProps {
  data: StatusCount[];
  height?: number;
  title?: string;
}

const STATUS_COLORS: Record<string, string> = {
  '2xx': '#22c55e',
  '3xx': '#3b82f6',
  '4xx': '#f59e0b',
  '5xx': '#ef4444',
};

function getStatusGroup(code: number): string {
  if (code >= 200 && code < 300) return '2xx';
  if (code >= 300 && code < 400) return '3xx';
  if (code >= 400 && code < 500) return '4xx';
  return '5xx';
}

function getStatusColor(code: number): string {
  return STATUS_COLORS[getStatusGroup(code)] || '#64748b';
}

export function StatusDistribution({
  data,
  height = 150,
  title,
}: StatusDistributionProps) {
  const { chartData, groupedData } = useMemo(() => {
    if (data.length === 0) {
      return { chartData: [], groupedData: {} };
    }

    // Sort by status code
    const sorted = [...data].sort((a, b) => a.statusCode - b.statusCode);
    const totalCount = sorted.reduce((sum, d) => sum + d.count, 0);

    // Group by status category
    const groups: Record<string, number> = {};
    sorted.forEach((d) => {
      const group = getStatusGroup(d.statusCode);
      groups[group] = (groups[group] || 0) + d.count;
    });

    return {
      chartData: sorted.map((d) => ({
        ...d,
        name: String(d.statusCode),
        percent: totalCount > 0 ? (d.count / totalCount) * 100 : 0,
      })),
      groupedData: groups,
    };
  }, [data]);

  if (chartData.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-scc-elevated/30 rounded-lg border border-scc-border/50"
        style={{ height }}
      >
        <p className="text-slate-500 text-sm">No status data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {title && (
        <h3 className="text-sm font-medium text-slate-300">{title}</h3>
      )}

      {/* Status group summary */}
      <div className="flex items-center gap-3 text-xs">
        {Object.entries(STATUS_COLORS).map(([group, color]) => (
          <div key={group} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-slate-400">{group}:</span>
            <span className="text-slate-200 font-medium">
              {groupedData[group] || 0}
            </span>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={height - 30}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 5, left: 35, bottom: 5 }}>
          <XAxis type="number" stroke="#64748b" fontSize={10} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            stroke="#64748b"
            fontSize={10}
            tickLine={false}
            width={35}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            formatter={(value, _name, props) => {
              const payload = props.payload as { statusCode: number; percent: number };
              return [`${value} (${payload.percent.toFixed(1)}%)`, `Status ${payload.statusCode}`];
            }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {chartData.map((entry) => (
              <Cell key={entry.statusCode} fill={getStatusColor(entry.statusCode)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
