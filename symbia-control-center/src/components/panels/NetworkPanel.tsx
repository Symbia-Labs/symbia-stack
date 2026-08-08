/**
 * Network Panel
 *
 * Real-time network topology visualization with SDN event stream.
 * Includes external integrations to show data exfiltration to/from third-party APIs.
 *
 * User Permissions:
 * - Respects user's network entitlements from Identity Service
 * - Shows permission status and gracefully handles permission errors
 */
import { useState, useMemo, useRef, useEffect } from 'react';
import { useServices } from '@/hooks/useServices';
import { useAuthStore, getUserNetworkPermissions } from '@/stores/authStore';
import type { NetworkNode, NodeContract, SandboxEvent, EventTrace } from '@/services/networkClient';
import { NetworkGraph } from './network';
import { StreamActionBar, RowActions, PayloadInspector } from '@/components/common/StreamActionBar';

const NODE_TYPE_COLORS: Record<string, string> = {
  service: '#00d4ff',
  assistant: '#7b68ee',
  sandbox: '#f59e0b',
  bridge: '#22c55e',
  integration: '#ec4899',
  client: '#64748b',
};

/**
 * Format timestamp with milliseconds for event stream display
 * e.g., "2:48:06.123 PM"
 */
function formatTimeWithMs(timestamp: string | Date): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes}:${seconds}.${ms} ${ampm}`;
}

const NODE_TYPE_LABELS: Record<string, string> = {
  service: 'Service',
  assistant: 'Assistant',
  sandbox: 'Sandbox',
  bridge: 'Bridge',
  integration: 'Integration',
  client: 'Client',
};

function NodeCard({ node }: { node: NetworkNode }) {
  const color = NODE_TYPE_COLORS[node.type] || '#64748b';
  const timeSinceHeartbeat = node.lastHeartbeat
    ? Math.floor((Date.now() - new Date(node.lastHeartbeat).getTime()) / 1000)
    : null;
  const isStale = timeSinceHeartbeat !== null && timeSinceHeartbeat > 60;
  const isConnected = !!node.socketId;

  // Determine status
  const status = isStale ? 'stale' : isConnected ? 'connected' : 'registered';
  const statusConfig = {
    connected: { color: 'emerald', label: 'Connected', glow: true },
    stale: { color: 'amber', label: 'Stale', glow: false },
    registered: { color: 'slate', label: 'Registered', glow: false },
  }[status];

  return (
    <div
      className={`
        scc-card p-4 border transition-all hover:shadow-lg
        ${isStale ? 'border-amber-500/30 opacity-60' : 'border-scc-border hover:border-scc-primary/50'}
      `}
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      {/* Header: Name + Type */}
      <div className="flex items-start justify-between mb-3">
        <span className="font-medium text-slate-200 truncate pr-2">{node.name}</span>
        <span
          className="text-xs px-2 py-0.5 rounded-full shrink-0"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {NODE_TYPE_LABELS[node.type] || node.type}
        </span>
      </div>

      {/* Node ID */}
      <p className="text-xs font-mono text-slate-500 truncate mb-3">{node.id}</p>

      {/* Status row */}
      <div className="flex items-center justify-between text-xs mb-3">
        <div className="flex items-center gap-1.5">
          <div
            className={`
              w-2 h-2 rounded-full bg-${statusConfig.color}-500
              ${statusConfig.glow ? `shadow-[0_0_8px_rgba(16,185,129,0.5)]` : ''}
            `}
            style={{
              backgroundColor: statusConfig.color === 'emerald' ? '#10b981' :
                               statusConfig.color === 'amber' ? '#f59e0b' : '#64748b'
            }}
          />
          <span className={`text-${statusConfig.color}-400`} style={{
            color: statusConfig.color === 'emerald' ? '#34d399' :
                   statusConfig.color === 'amber' ? '#fbbf24' : '#94a3b8'
          }}>
            {statusConfig.label}
          </span>
        </div>
        {timeSinceHeartbeat !== null && (
          <span className="text-slate-500">
            {timeSinceHeartbeat < 60 ? `${timeSinceHeartbeat}s ago` : `${Math.floor(timeSinceHeartbeat / 60)}m ago`}
          </span>
        )}
      </div>

      {/* Capabilities - with label */}
      {node.capabilities.length > 0 && (
        <div className="border-t border-scc-border/50 pt-3">
          <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1.5">Capabilities</p>
          <div className="flex flex-wrap gap-1">
            {node.capabilities.slice(0, 4).map((cap) => (
              <span key={cap} className="px-1.5 py-0.5 bg-slate-700/50 rounded text-xs text-slate-400">
                {cap}
              </span>
            ))}
            {node.capabilities.length > 4 && (
              <span className="px-1.5 py-0.5 text-xs text-slate-500">
                +{node.capabilities.length - 4}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ContractCard({ contract }: { contract: NodeContract }) {
  return (
    <div className="scc-card p-3 border border-scc-border">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-scc-primary font-mono truncate">{contract.from}</span>
        <svg className="w-4 h-4 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
        </svg>
        <span className="text-scc-secondary font-mono truncate">{contract.to}</span>
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        {contract.allowedEventTypes.slice(0, 3).map((type) => (
          <span key={type} className="text-xs px-1.5 py-0.5 bg-slate-700 rounded text-slate-400">
            {type}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
        <span>Boundaries: {contract.boundaries.join(', ')}</span>
      </div>
    </div>
  );
}

function EventCard({
  event,
  trace,
  isExpanded,
  onToggle,
  onInspect,
}: {
  event: SandboxEvent;
  trace: EventTrace;
  isExpanded: boolean;
  onToggle: () => void;
  onInspect: () => void;
}) {
  const statusColors = {
    delivered: 'text-emerald-400 bg-emerald-400/10',
    // Recorded, no subscriber. Not an error, so not red.
    unrouted: 'text-slate-400 bg-slate-400/10',
    dropped: 'text-red-400 bg-red-400/10',
    pending: 'text-amber-400 bg-amber-400/10',
    error: 'text-red-400 bg-red-400/10',
  };
  const statusClass = statusColors[trace.status] || statusColors.pending;

  return (
    <div
      className={`
        py-2 border-b border-scc-border/50 last:border-0 cursor-pointer transition-colors
        ${isExpanded ? 'bg-scc-elevated/50' : 'hover:bg-scc-elevated/30'}
      `}
      onClick={onToggle}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-1.5 py-0.5 rounded uppercase font-medium ${statusClass}`}>
            {trace.status}
          </span>
          <span className="text-sm text-slate-300 font-mono">
            {event.payload.type}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 font-mono">
            {formatTimeWithMs(event.wrapper.timestamp)}
          </span>
          <span className="text-xs text-slate-500">
            {trace.totalDurationMs}ms
          </span>
          <RowActions
            isExpanded={isExpanded}
            onToggleExpand={onToggle}
            onInspect={onInspect}
          />
        </div>
      </div>
      <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
        <span>{event.wrapper.source}</span>
        {event.wrapper.target && (
          <>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
            <span>{event.wrapper.target}</span>
          </>
        )}
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-scc-border/30 space-y-2">
          {/* Event ID */}
          <div className="text-xs">
            <span className="text-slate-500">Event ID:</span>
            <span className="text-slate-300 ml-2 font-mono">{event.wrapper.id}</span>
          </div>

          {/* Trace path */}
          {trace.path && trace.path.length > 0 && (
            <div className="text-xs">
              <span className="text-slate-500">Trace ({trace.path.length} hops):</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {trace.path.map((hop, i) => (
                  <span key={i} className="px-1.5 py-0.5 bg-slate-700 rounded text-slate-400">
                    {hop.node} <span className="text-slate-500">({hop.durationMs}ms)</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Payload preview */}
          <div className="text-xs">
            <span className="text-slate-500">Payload:</span>
            <pre className="mt-1 p-2 bg-scc-surface rounded text-slate-400 overflow-x-auto text-[10px]">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Permission error banner component
 */
function PermissionBanner({ error }: { error: { operation: string; requiredPermission?: string; message: string } }) {
  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-4">
      <div className="flex items-start gap-3">
        <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div>
          <p className="text-sm text-amber-200 font-medium">Limited Access</p>
          <p className="text-xs text-amber-300/70 mt-1">
            {error.message}
            {error.requiredPermission && (
              <span className="ml-1">
                (Requires: <code className="bg-amber-500/20 px-1 rounded">{error.requiredPermission}</code>)
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Permission badges component
 */
function PermissionBadges({ permissions }: { permissions: ReturnType<typeof getUserNetworkPermissions> }) {
  const badges = [
    { key: 'topology', label: 'Topology', enabled: permissions.canViewTopology },
    { key: 'events', label: 'Events', enabled: permissions.canViewEvents },
    { key: 'traces', label: 'Traces', enabled: permissions.canViewTraces },
    { key: 'policies', label: 'Policies', enabled: permissions.canViewPolicies },
  ];

  return (
    <div className="flex items-center gap-1">
      {badges.map(({ key, label, enabled }) => (
        <span
          key={key}
          className={`text-xs px-1.5 py-0.5 rounded ${
            enabled
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-slate-700 text-slate-500'
          }`}
          title={enabled ? `Can view ${label.toLowerCase()}` : `No ${label.toLowerCase()} access`}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

export function NetworkPanel() {
  const {
    networkNodes,
    networkContracts,
    networkConnectionStatus,
    recentNetworkEvents,
    networkEventsTotal,
    networkPermissionError,
    refreshNetwork: _refreshNetwork,
    integrations,
  } = useServices({ enableNetwork: true, networkEventStream: true, enableIntegrations: true });

  const user = useAuthStore((s) => s.user);
  const permissions = useMemo(() => getUserNetworkPermissions(user), [user]);

  const [activeTab, setActiveTab] = useState<'graph' | 'nodes' | 'contracts' | 'events'>('graph');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [nodeTypeFilter, setNodeTypeFilter] = useState<string | null>(null);
  const [inspectingEvent, setInspectingEvent] = useState<{ event: SandboxEvent; trace: EventTrace } | null>(null);

  // Event stream state
  const [isLiveEvents, setIsLiveEvents] = useState(true);
  const [displayedEvents, setDisplayedEvents] = useState<Array<{ event: SandboxEvent; trace: EventTrace }>>([]);
  const eventsContainerRef = useRef<HTMLDivElement>(null);

  // Sort events by timestamp descending (newest first) using useMemo
  // This ensures sorting happens synchronously on every render, avoiding race conditions
  // Uses string comparison for ISO timestamps to preserve microsecond precision
  const sortedNetworkEvents = useMemo(() => {
    return [...recentNetworkEvents].sort((a, b) =>
      b.event.wrapper.timestamp.localeCompare(a.event.wrapper.timestamp)
    );
  }, [recentNetworkEvents]);

  // Freeze displayed events when paused
  useEffect(() => {
    if (!isLiveEvents && displayedEvents.length === 0) {
      // When first pausing, capture current state
      setDisplayedEvents(sortedNetworkEvents);
    } else if (isLiveEvents) {
      // Clear frozen state when resuming (will use sortedNetworkEvents directly)
      setDisplayedEvents([]);
    }
  }, [isLiveEvents, sortedNetworkEvents, displayedEvents.length]);

  // Use sorted events directly when live, frozen snapshot when paused
  const eventsToRender = isLiveEvents ? sortedNetworkEvents : displayedEvents;

  // Convert integrations to network nodes for visualization
  const integrationNodes: NetworkNode[] = useMemo(() => {
    return integrations
      .filter((i) => i.status === 'active')
      .map((integration) => ({
        id: `integration:${integration.key}`,
        name: integration.name,
        type: 'integration' as const,
        capabilities: integration.operations?.slice(0, 5).map((op) => op.id) || [],
        endpoint: integration.openapi?.serverUrl || '',
        registeredAt: integration.lastSyncedAt || new Date().toISOString(),
        lastHeartbeat: new Date().toISOString(), // Always "fresh" since they're external
        metadata: {
          integrationKey: integration.key,
          integrationType: integration.type,
          operationCount: integration.operations?.length || 0,
        },
      }));
  }, [integrations]);

  // Combine network nodes with integration nodes
  const allNodes = useMemo(() => {
    return [...networkNodes, ...integrationNodes];
  }, [networkNodes, integrationNodes]);

  // Create synthetic edges from integrations service to external integrations
  const integrationEdges: NodeContract[] = useMemo(() => {
    const integrationsService = networkNodes.find(
      (n) => n.name.toLowerCase().includes('integrations') || n.id.toLowerCase().includes('integrations')
    );
    if (!integrationsService) return [];

    return integrationNodes.map((node) => ({
      id: `contract:${integrationsService.id}-${node.id}`,
      from: integrationsService.id,
      to: node.id,
      allowedEventTypes: ['api.request', 'api.response'],
      boundaries: ['extra'] as ('intra' | 'inter' | 'extra')[],
      createdAt: new Date().toISOString(),
    }));
  }, [networkNodes, integrationNodes]);

  // Combine network contracts with integration edges
  const allContracts = useMemo(() => {
    return [...networkContracts, ...integrationEdges];
  }, [networkContracts, integrationEdges]);

  // Get unique node types for filter
  const nodeTypes = useMemo(() => {
    const types = new Set(allNodes.map(n => n.type));
    return Array.from(types).sort();
  }, [allNodes]);

  // Filter nodes by selected type
  const filteredNodes = useMemo(() => {
    if (!nodeTypeFilter) return allNodes;
    return allNodes.filter(n => n.type === nodeTypeFilter);
  }, [allNodes, nodeTypeFilter]);

  // Group filtered nodes by type for display
  const nodesByType = filteredNodes.reduce((acc, node) => {
    const type = node.type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(node);
    return acc;
  }, {} as Record<string, NetworkNode[]>);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 p-6 border-b border-scc-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Network Topology</h1>
            <p className="text-sm text-slate-500 mt-1">
              Service mesh nodes, contracts, and event routing
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Permission badges */}
            <PermissionBadges permissions={permissions} />

            <div className="w-px h-6 bg-slate-700" />

            <div className="flex items-center gap-2">
              <div
                className={`
                  w-2 h-2 rounded-full
                  ${networkConnectionStatus === 'connected'
                    ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                    : networkConnectionStatus === 'connecting'
                    ? 'bg-amber-500 animate-pulse'
                    : 'bg-slate-500'
                  }
                `}
              />
              <span className="text-xs text-slate-500 capitalize">
                {networkConnectionStatus}
              </span>
            </div>
          </div>
        </div>

        {/* Permission error banner */}
        {networkPermissionError && (
          <div className="mt-4">
            <PermissionBanner error={networkPermissionError} />
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 mt-4">
          {(['graph', 'nodes', 'contracts', 'events'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`
                px-4 py-2 text-sm font-medium rounded transition-all capitalize
                ${activeTab === tab
                  ? 'bg-scc-primary/20 text-scc-primary border border-scc-primary/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700 border border-transparent'
                }
              `}
            >
              {tab}
              <span className="ml-2 text-xs opacity-60">
                {tab === 'graph' && `${allNodes.length}/${allContracts.length}`}
                {tab === 'nodes' && allNodes.length}
                {tab === 'contracts' && allContracts.length}
                {tab === 'events' && networkEventsTotal}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'graph' && (
          <NetworkGraph
            networkNodes={allNodes}
            contracts={allContracts}
            events={recentNetworkEvents}
            className="h-[calc(100vh-280px)] min-h-[400px]"
          />
        )}

        {activeTab === 'nodes' && (
          <div className="space-y-4">
            {/* Filter bar */}
            <div className="flex items-center gap-2 pb-4 border-b border-scc-border/50">
              <span className="text-xs text-slate-500">Filter by type:</span>
              <button
                onClick={() => setNodeTypeFilter(null)}
                className={`
                  px-2.5 py-1 text-xs rounded-full transition-all
                  ${!nodeTypeFilter
                    ? 'bg-scc-primary/20 text-scc-primary border border-scc-primary/50'
                    : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 border border-transparent'
                  }
                `}
              >
                All ({allNodes.length})
              </button>
              {nodeTypes.map((type) => {
                const count = allNodes.filter(n => n.type === type).length;
                const color = NODE_TYPE_COLORS[type] || '#64748b';
                return (
                  <button
                    key={type}
                    onClick={() => setNodeTypeFilter(nodeTypeFilter === type ? null : type)}
                    className={`
                      px-2.5 py-1 text-xs rounded-full transition-all flex items-center gap-1.5
                      ${nodeTypeFilter === type
                        ? 'border'
                        : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 border border-transparent'
                      }
                    `}
                    style={nodeTypeFilter === type ? {
                      backgroundColor: `${color}20`,
                      borderColor: `${color}50`,
                      color: color,
                    } : undefined}
                  >
                    <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
                    {NODE_TYPE_LABELS[type] || type} ({count})
                  </button>
                );
              })}
            </div>

            {/* Nodes list */}
            {filteredNodes.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
                <p>No nodes {nodeTypeFilter ? `of type "${NODE_TYPE_LABELS[nodeTypeFilter] || nodeTypeFilter}"` : ''}</p>
                <p className="text-sm mt-2">Nodes will appear here when they register with the network</p>
              </div>
            ) : (
              Object.entries(nodesByType).map(([type, nodes]) => (
                <div key={type}>
                  <div className="flex items-center gap-2 mb-3">
                    <div
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: NODE_TYPE_COLORS[type] }}
                    />
                    <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                      {NODE_TYPE_LABELS[type] || type}s ({nodes.length})
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {nodes.map((node) => (
                      <NodeCard key={node.id} node={node} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'contracts' && (
          <div>
            {allContracts.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <p>No contracts established</p>
                <p className="text-sm mt-2">Contracts define allowed communication paths between nodes</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {allContracts.map((contract) => (
                  <ContractCard key={contract.id} contract={contract} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'events' && (
          <div>
            {/* Sticky header - use negative top to account for parent p-6 padding, extend full width */}
            <div
              className="flex items-center justify-between mb-4 sticky -top-6 z-30 py-3 pt-6 -mx-6 px-6 border-b border-scc-border/50 shadow-md"
              style={{ backgroundColor: '#0f1419' }}
            >
              <h3 className="text-sm font-medium text-slate-400">SDN Event Stream</h3>
              <StreamActionBar
                isLive={isLiveEvents}
                onPause={() => setIsLiveEvents(false)}
                onResume={() => {
                  setIsLiveEvents(true);
                  setExpandedEventId(null);
                }}
                onRestart={() => {
                  setDisplayedEvents([]);
                  setIsLiveEvents(true);
                  setExpandedEventId(null);
                }}
                itemCount={networkEventsTotal}
                itemLabel="events"
                compact
              />
            </div>
            {eventsToRender.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <p>No events captured</p>
                <p className="text-sm mt-2">Events will stream here when network activity occurs</p>
              </div>
            ) : (
              <div ref={eventsContainerRef}>
                {eventsToRender.map(({ event, trace }) => (
                  <EventCard
                    key={event.wrapper.id}
                    event={event}
                    trace={trace}
                    isExpanded={expandedEventId === event.wrapper.id}
                    onToggle={() => {
                      const newExpandedId = expandedEventId === event.wrapper.id ? null : event.wrapper.id;
                      setExpandedEventId(newExpandedId);
                      if (newExpandedId) {
                        setIsLiveEvents(false);
                      }
                    }}
                    onInspect={() => {
                      setInspectingEvent({ event, trace });
                      setIsLiveEvents(false);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Payload Inspector Modal */}
        {inspectingEvent && (
          <PayloadInspector
            payload={{
              eventId: inspectingEvent.event.wrapper.id,
              type: inspectingEvent.event.payload.type,
              source: inspectingEvent.event.wrapper.source,
              target: inspectingEvent.event.wrapper.target,
              status: inspectingEvent.trace.status,
              durationMs: inspectingEvent.trace.totalDurationMs,
              path: inspectingEvent.trace.path,
              payload: inspectingEvent.event.payload,
            }}
            title="Event Details"
            onClose={() => setInspectingEvent(null)}
          />
        )}
      </div>
    </div>
  );
}
