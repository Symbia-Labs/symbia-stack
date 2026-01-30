import { type PlatformStatus as Status } from '../hooks/useSymbia';

interface PlatformStatusProps {
  status: Status;
  compact?: boolean;
  expanded?: boolean;
}

// Service color mapping
const SERVICE_COLORS: Record<string, string> = {
  identity: '#3b82f6',
  logging: '#8b5cf6',
  catalog: '#06b6d4',
  assistants: '#22c55e',
  messaging: '#f59e0b',
  runtime: '#ef4444',
  integrations: '#ec4899',
  network: '#10b981',
};

export function PlatformStatus({ status, compact, expanded }: PlatformStatusProps) {
  if (compact) {
    return (
      <div className="platform-status-compact">
        <span
          className="status-dot"
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: status.connected ? 'var(--node-input)' : 'var(--text-muted)',
            boxShadow: status.connected ? '0 0 8px var(--node-input)' : 'none',
          }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {status.connected ? 'Live' : 'Demo'}
        </span>
      </div>
    );
  }

  if (expanded) {
    const healthyCount = status.services.filter(s => s.healthy).length;
    const totalCount = status.services.length;
    const allHealthy = healthyCount === totalCount;

    return (
      <div style={{ padding: 'var(--space-4)' }}>
        {/* Connection Banner */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-3)',
          padding: 'var(--space-3) var(--space-4)',
          marginBottom: 'var(--space-5)',
          background: allHealthy
            ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(16, 185, 129, 0.1) 100%)'
            : 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(139, 92, 246, 0.1) 100%)',
          borderRadius: 'var(--radius-lg)',
          border: `1px solid ${allHealthy ? 'rgba(34, 197, 94, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
        }}>
          <div style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: allHealthy ? '#22c55e' : '#3b82f6',
            boxShadow: `0 0 12px ${allHealthy ? '#22c55e' : '#3b82f6'}`,
            animation: 'pulse 2s ease-in-out infinite',
          }} />
          <span style={{
            fontSize: 14,
            fontWeight: 600,
            color: allHealthy ? '#22c55e' : '#3b82f6',
            letterSpacing: 0.5,
          }}>
            {status.connected ? `${healthyCount}/${totalCount} Services Online` : 'Connecting...'}
          </span>
        </div>

        {/* Hero Stats Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-5)',
        }}>
          <HeroStat
            value={status.stats?.totalAssistants?.toString() || '0'}
            label="AI Assistants"
            icon="🤖"
            color="#22c55e"
          />
          <HeroStat
            value={status.stats?.totalIntegrations?.toString() || '0'}
            label="Integrations"
            icon="🔌"
            color="#8b5cf6"
          />
          <HeroStat
            value={status.stats?.totalResources?.toString() || '0'}
            label="Resources"
            icon="📦"
            color="#3b82f6"
          />
        </div>

        {/* Service Grid - 2 columns */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 'var(--space-2)',
        }}>
          {status.services.slice(0, 8).map(service => (
            <ServiceChip
              key={service.name}
              name={service.name}
              healthy={service.healthy}
              latency={service.latency}
              color={SERVICE_COLORS[service.name] || '#6b7280'}
            />
          ))}
        </div>

        {!status.connected && (
          <div style={{
            marginTop: 'var(--space-5)',
            padding: 'var(--space-4)',
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}>
              Start the platform to see live data
            </div>
            <code style={{
              display: 'inline-block',
              fontSize: 13,
              padding: 'var(--space-2) var(--space-4)',
              background: 'var(--bg-muted)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--primary)',
              fontWeight: 500,
              fontFamily: 'var(--font-mono)',
            }}>
              ./scripts/dev-start.sh
            </code>
          </div>
        )}

        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(1.1); }
          }
        `}</style>
      </div>
    );
  }

  return null;
}

function HeroStat({ value, label, icon, color }: {
  value: string;
  label: string;
  icon: string;
  color: string;
}) {
  return (
    <div style={{
      padding: 'var(--space-4)',
      background: 'var(--bg-muted)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border)',
      textAlign: 'center',
      transition: 'all 0.2s ease',
    }}>
      <div style={{ fontSize: 24, marginBottom: 'var(--space-2)' }}>{icon}</div>
      <div style={{
        fontSize: 32,
        fontWeight: 700,
        color: color,
        lineHeight: 1,
        marginBottom: 'var(--space-1)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 12,
        color: 'var(--text-muted)',
        fontWeight: 500,
      }}>
        {label}
      </div>
    </div>
  );
}

function ServiceChip({ name, healthy, latency, color }: {
  name: string;
  healthy: boolean;
  latency?: number;
  color: string;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 12px',
      background: healthy ? `${color}10` : 'var(--bg-muted)',
      borderRadius: 'var(--radius-md)',
      border: `1px solid ${healthy ? `${color}25` : 'var(--border)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: healthy ? color : 'var(--text-muted)',
            boxShadow: healthy ? `0 0 6px ${color}` : 'none',
            flexShrink: 0,
          }}
        />
        <span style={{
          fontSize: 12,
          fontWeight: 500,
          color: healthy ? color : 'var(--text-muted)',
          textTransform: 'capitalize',
        }}>
          {name}
        </span>
      </div>
      <span style={{
        fontSize: 10,
        color: 'var(--text-muted)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {healthy && latency ? `${latency}ms` : '—'}
      </span>
    </div>
  );
}
