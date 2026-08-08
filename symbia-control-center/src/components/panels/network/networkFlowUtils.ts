/**
 * Network Flow Utilities
 *
 * Converts NetworkNodes and NodeContracts to React Flow nodes and edges.
 * Uses dagre layout for hierarchical visualization.
 */

import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';
import type { NetworkNode, NodeContract, SandboxEvent, EventTrace } from '@/services/networkClient';

// Edge data type for our custom edges
interface EdgeData extends Record<string, unknown> {
  isEventTraffic?: boolean;
  eventCount?: number;
  eventTypes?: string[];
  latencyStats?: LatencyStats | null;
  recentActivity?: boolean;
}

// Node dimensions for layout
const NODE_WIDTH = 180;
const NODE_HEIGHT = 70;

// Node type colors
export const NODE_TYPE_COLORS: Record<string, string> = {
  service: '#00d4ff',    // cyan
  assistant: '#a855f7',  // purple
  sandbox: '#f59e0b',    // amber
  bridge: '#22c55e',     // green
  integration: '#ec4899', // pink - external integrations
  client: '#64748b',     // slate - UI clients
};

// Node type icons
export const NODE_TYPE_ICONS: Record<string, string> = {
  service: '🔧',
  assistant: '🤖',
  sandbox: '📦',
  bridge: '🌉',
  integration: '🔌',
  client: '🖥️',
};

// Node type labels
export const NODE_TYPE_LABELS: Record<string, string> = {
  service: 'Service',
  assistant: 'Assistant',
  sandbox: 'Sandbox',
  bridge: 'Bridge',
  integration: 'Integration',
  client: 'Client',
};

export interface NetworkFlowNodeData extends Record<string, unknown> {
  nodeType: 'network';
  networkNode: NetworkNode;
  color: string;
  icon: string;
  label: string;
  isStale: boolean;
  isConnected: boolean;
  capabilityCount: number;
  // Activity tracking for animations
  isActive: boolean;           // Has recent activity (within 2s)
  activityLevel: number;       // 0-1 intensity based on event volume
  lastActivityAt?: number;     // Timestamp of last activity
  recentEventCount: number;    // Events in last 5 seconds
  /**
   * Observed traffic, from obs.http.response events.
   *
   * The graph's edges are DECLARED CONTRACTS, not observed calls, and there
   * are three of them against thousands of real requests. Measured 8 Aug 2026:
   * obs.http.* records only `source`, `method`, `path`, `statusCode` and
   * `durationMs` — no callee — and 1011 distinct trace ids appeared, ZERO of
   * them shared between two services, so trace context does not propagate and
   * no call graph can be derived today.
   *
   * Until it can, the honest thing the graph can show is what each node is
   * doing on its own: how much, how fast, how often it fails. That is real
   * measured data rather than a picture of a topology nobody is using.
   */
  traffic?: NodeTraffic;
}

export interface NodeTraffic {
  /** Requests observed in the window. */
  requests: number;
  /** Responses with status >= 400. */
  errors: number;
  /** 0-1. */
  errorRate: number;
  /** 95th percentile duration, ms. Null when there is nothing to sort. */
  p95Ms: number | null;
  /** Seconds of history this covers. */
  windowSec: number;
}

export interface NetworkFlowConversionResult {
  nodes: Node<NetworkFlowNodeData>[];
  edges: Edge[];
}

/**
 * Apply dagre layout to nodes - creates a hierarchical left-to-right visualization
 */
function getDagreLayout(
  nodes: Node<NetworkFlowNodeData>[],
  edges: Edge[]
): { nodes: Node<NetworkFlowNodeData>[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes, edges };

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  // Optimized layout settings for cleaner visualization
  dagreGraph.setGraph({
    rankdir: 'LR',           // Left-to-right flow
    nodesep: 100,            // Vertical spacing between nodes in same rank
    ranksep: 200,            // Horizontal spacing between ranks
    align: 'UL',             // Align nodes to upper-left for consistency
    ranker: 'network-simplex', // Better ranking algorithm for complex graphs
  });

  // Add nodes to dagre
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  // Add only contract edges for layout calculation (skip mesh and client edges)
  // This creates a cleaner hierarchy based on actual service relationships
  edges
    .filter((edge) => !edge.data?.isMesh && !edge.data?.isClientConnection)
    .forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });

  // Run the layout algorithm
  dagre.layout(dagreGraph);

  // Apply positions to nodes
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

/**
 * Latency statistics for an edge
 */
interface LatencyStats {
  avg: number;
  min: number;
  max: number;
}

/**
 * Event traffic data for an edge
 */
interface EventTrafficData {
  count: number;
  types: Set<string>;
  latencies: number[];
}

/**
 * Create edges from observed event traffic with latency statistics
 */
function createEventEdges(
  nodes: Node<NetworkFlowNodeData>[],
  events: Array<{ event: SandboxEvent; trace: EventTrace }>,
  existingEdges: Edge[]
): Edge[] {
  // Track events and latencies per source-target pair
  const eventTraffic = new Map<string, EventTrafficData>();

  events.forEach(({ event, trace }) => {
    const source = event.wrapper.source;
    const target = event.wrapper.target;
    if (!source || !target) return;

    // Find matching node IDs (event source/target might be partial matches)
    const sourceNode = nodes.find(n =>
      n.id === source ||
      n.data.networkNode.name.toLowerCase() === source.toLowerCase() ||
      n.id.toLowerCase().includes(source.toLowerCase())
    );
    const targetNode = nodes.find(n =>
      n.id === target ||
      n.data.networkNode.name.toLowerCase() === target.toLowerCase() ||
      n.id.toLowerCase().includes(target.toLowerCase())
    );

    if (sourceNode && targetNode && sourceNode.id !== targetNode.id) {
      const pairKey = `${sourceNode.id}-${targetNode.id}`;
      if (!eventTraffic.has(pairKey)) {
        eventTraffic.set(pairKey, { count: 0, types: new Set(), latencies: [] });
      }
      const data = eventTraffic.get(pairKey)!;
      data.count++;
      data.types.add(event.payload.type);
      if (trace.totalDurationMs !== undefined) {
        data.latencies.push(trace.totalDurationMs);
      }
    }
  });

  // Calculate latency stats
  const calculateLatencyStats = (latencies: number[]): LatencyStats | null => {
    if (latencies.length === 0) return null;
    const sum = latencies.reduce((a, b) => a + b, 0);
    return {
      avg: Math.round(sum / latencies.length),
      min: Math.min(...latencies),
      max: Math.max(...latencies),
    };
  };

  // Build a map of existing edge pairs for quick lookup (both directions)
  const existingEdgeMap = new Map<string, number>();
  existingEdges.forEach((edge, index) => {
    // Map both directions to the same edge index
    existingEdgeMap.set(`${edge.source}-${edge.target}`, index);
    existingEdgeMap.set(`${edge.target}-${edge.source}`, index);
  });

  // Start with a copy of existing edges
  const edges: Edge[] = existingEdges.map(e => ({ ...e, data: { ...e.data } }));

  // Track which edges have been updated to accumulate counts from both directions
  const updatedEdges = new Set<number>();

  // Apply event traffic data to edges
  eventTraffic.forEach((data, pairKey) => {
    const latencyStats = calculateLatencyStats(data.latencies);
    const existingIndex = existingEdgeMap.get(pairKey);

    if (existingIndex !== undefined) {
      // Update existing contract edge with event traffic data
      const edgeData = edges[existingIndex].data as EdgeData | undefined;
      const currentCount = edgeData?.eventCount || 0;
      const newCount = updatedEdges.has(existingIndex)
        ? currentCount + data.count  // Accumulate if already updated
        : data.count;
      const existingEventTypes = edgeData?.eventTypes || [];

      edges[existingIndex] = {
        ...edges[existingIndex],
        data: {
          ...edgeData,
          isEventTraffic: true,
          eventCount: newCount,
          eventTypes: Array.from(new Set([
            ...existingEventTypes,
            ...Array.from(data.types),
          ])),
          latencyStats,
          recentActivity: true,
        } as EdgeData,
      };
      updatedEdges.add(existingIndex);
    } else {
      // Create new edge for traffic without a contract
      const [source, target] = pairKey.split('-');
      const strokeWidth = Math.min(2 + Math.log2(data.count + 1) * 1.5, 6);

      edges.push({
        id: `event-${pairKey}`,
        source,
        target,
        type: 'animated',
        animated: true,
        style: {
          stroke: '#22c55e',
          strokeWidth,
        },
        data: {
          isEventTraffic: true,
          eventCount: data.count,
          eventTypes: Array.from(data.types),
          latencyStats,
        },
      });
    }
  });

  return edges;
}

/**
 * Create mesh edges connecting all services to show potential communication paths
 */
function createMeshEdges(
  nodes: Node<NetworkFlowNodeData>[],
  existingEdges: Edge[]
): Edge[] {
  const edges: Edge[] = [...existingEdges];
  const existingPairs = new Set(existingEdges.map(e => `${e.source}-${e.target}`));

  // Get all service nodes
  const serviceNodes = nodes.filter(n => n.data.networkNode.type === 'service');

  // Create light mesh connections between services (if not already connected)
  serviceNodes.forEach((sourceNode, i) => {
    serviceNodes.forEach((targetNode, j) => {
      if (i >= j) return; // Only create one direction, skip self

      const pairKey = `${sourceNode.id}-${targetNode.id}`;
      const reversePairKey = `${targetNode.id}-${sourceNode.id}`;

      if (!existingPairs.has(pairKey) && !existingPairs.has(reversePairKey)) {
        edges.push({
          id: `mesh-${sourceNode.id}-${targetNode.id}`,
          source: sourceNode.id,
          target: targetNode.id,
          type: 'animated', // Use orthogonal step edges
          style: {
            stroke: '#1e293b',
            strokeWidth: 1,
            strokeDasharray: '4 4',
          },
          data: {
            isMesh: true,
          },
        });
      }
    });
  });

  return edges;
}

/**
 * Calculate activity stats for each node from recent events
 */
/**
 * Per-node request volume, error rate and p95 latency from obs.http.response.
 *
 * A SIXTY SECOND window, not the five used for the blink animation. Five
 * seconds is right for "is this thing alive" and useless for "is this thing
 * healthy" — a service handling one request every few seconds would show a p95
 * computed from one sample, which is a number with the shape of a statistic
 * and none of the meaning.
 *
 * Only `obs.http.response` is counted. The matching request event carries no
 * status or duration, so counting both would double every total and halve
 * every error rate.
 */
function calculateNodeTraffic(
  events: Array<{ event: SandboxEvent; trace: EventTrace }>
): Map<string, NodeTraffic> {
  const WINDOW_MS = 60_000;
  const now = Date.now();
  const durations = new Map<string, number[]>();
  const counts = new Map<string, { requests: number; errors: number }>();

  for (const { event } of events) {
    if (event.payload?.type !== 'obs.http.response') continue;
    const source = event.wrapper.source;
    if (!source) continue;
    const at = new Date(event.wrapper.timestamp).getTime();
    if (!Number.isFinite(at) || now - at > WINDOW_MS) continue;

    const data = (event.payload.data ?? {}) as { statusCode?: number; durationMs?: number };
    const c = counts.get(source) ?? { requests: 0, errors: 0 };
    c.requests += 1;
    if (typeof data.statusCode === 'number' && data.statusCode >= 400) c.errors += 1;
    counts.set(source, c);

    if (typeof data.durationMs === 'number' && Number.isFinite(data.durationMs)) {
      const arr = durations.get(source) ?? [];
      arr.push(data.durationMs);
      durations.set(source, arr);
    }
  }

  const out = new Map<string, NodeTraffic>();
  for (const [source, c] of counts) {
    const d = (durations.get(source) ?? []).slice().sort((a, b) => a - b);
    // Nearest-rank p95. Null rather than 0 when there is nothing to compute
    // from — a latency of zero and an unmeasured latency are different claims.
    const p95Ms = d.length ? d[Math.min(d.length - 1, Math.ceil(d.length * 0.95) - 1)] : null;
    out.set(source, {
      requests: c.requests,
      errors: c.errors,
      errorRate: c.requests ? c.errors / c.requests : 0,
      p95Ms,
      windowSec: WINDOW_MS / 1000,
    });
  }
  return out;
}

function calculateNodeActivity(
  networkNodes: NetworkNode[],
  events: Array<{ event: SandboxEvent; trace: EventTrace }>
): Map<string, { isActive: boolean; activityLevel: number; recentEventCount: number; lastActivityAt?: number }> {
  const activity = new Map<string, { count: number; lastAt: number }>();
  const now = Date.now();
  const recentWindow = 5000; // 5 second window for "recent"
  const activeWindow = 2000; // 2 second window for "active" animation

  // Count events per node
  events.forEach(({ event }) => {
    const source = event.wrapper.source;
    const target = event.wrapper.target;
    const eventTime = new Date(event.wrapper.timestamp).getTime();
    const age = now - eventTime;

    if (age < recentWindow) {
      // Count for source
      if (source) {
        const current = activity.get(source) || { count: 0, lastAt: 0 };
        activity.set(source, {
          count: current.count + 1,
          lastAt: Math.max(current.lastAt, eventTime),
        });
      }
      // Count for target
      if (target) {
        const current = activity.get(target) || { count: 0, lastAt: 0 };
        activity.set(target, {
          count: current.count + 1,
          lastAt: Math.max(current.lastAt, eventTime),
        });
      }
    }
  });

  // Convert to activity levels
  const result = new Map<string, { isActive: boolean; activityLevel: number; recentEventCount: number; lastActivityAt?: number }>();
  const maxCount = Math.max(1, ...Array.from(activity.values()).map(a => a.count));

  networkNodes.forEach((node) => {
    const nodeActivity = activity.get(node.id);
    if (nodeActivity) {
      const isActive = (now - nodeActivity.lastAt) < activeWindow;
      result.set(node.id, {
        isActive,
        activityLevel: Math.min(1, nodeActivity.count / Math.max(maxCount, 10)), // Normalize to 0-1
        recentEventCount: nodeActivity.count,
        lastActivityAt: nodeActivity.lastAt,
      });
    } else {
      result.set(node.id, {
        isActive: false,
        activityLevel: 0,
        recentEventCount: 0,
      });
    }
  });

  return result;
}

/**
 * Convert network nodes and contracts to React Flow format
 */
export function networkToFlow(
  networkNodes: NetworkNode[],
  contracts: NodeContract[],
  events: Array<{ event: SandboxEvent; trace: EventTrace }> = [],
  options: { showMesh?: boolean } = { showMesh: false }
): NetworkFlowConversionResult {
  const nodes: Node<NetworkFlowNodeData>[] = [];
  let edges: Edge[] = [];

  if (networkNodes.length === 0) {
    return { nodes, edges };
  }

  // Calculate activity levels for each node
  const nodeActivity = calculateNodeActivity(networkNodes, events);
  const nodeTraffic = calculateNodeTraffic(events);

  // Create a node for each network node
  networkNodes.forEach((networkNode) => {
    const timeSinceHeartbeat = networkNode.lastHeartbeat
      ? Math.floor((Date.now() - new Date(networkNode.lastHeartbeat).getTime()) / 1000)
      : null;
    const isStale = timeSinceHeartbeat !== null && timeSinceHeartbeat > 60;
    const isConnected = !!networkNode.socketId;
    const activity = nodeActivity.get(networkNode.id) || { isActive: false, activityLevel: 0, recentEventCount: 0 };

    nodes.push({
      id: networkNode.id,
      type: 'networkFlowNode',
      position: { x: 0, y: 0 }, // Will be set by layout
      data: {
        nodeType: 'network',
        networkNode,
        color: NODE_TYPE_COLORS[networkNode.type] || '#64748b',
        icon: NODE_TYPE_ICONS[networkNode.type] || '📍',
        label: networkNode.name,
        isStale,
        isConnected,
        capabilityCount: networkNode.capabilities.length,
        isActive: activity.isActive,
        activityLevel: activity.activityLevel,
        recentEventCount: activity.recentEventCount,
        traffic: nodeTraffic.get(networkNode.id),
        lastActivityAt: activity.lastActivityAt,
      },
    });
  });

  // Create edges from contracts (subtle, no animation - just shows potential paths)
  contracts.forEach((contract) => {
    // Only create edge if both source and target nodes exist
    const sourceExists = networkNodes.some((n) => n.id === contract.from);
    const targetExists = networkNodes.some((n) => n.id === contract.to);

    if (sourceExists && targetExists) {
      edges.push({
        id: contract.id,
        source: contract.from,
        target: contract.to,
        type: 'animated', // Use orthogonal step edges (for routing only)
        animated: false,  // No animation for contract edges
        style: {
          stroke: '#334155',  // Very subtle slate color
          strokeWidth: 1,
          strokeDasharray: '4 4', // Dashed to indicate "potential" connection
        },
        data: {
          allowedEventTypes: contract.allowedEventTypes,
          boundaries: contract.boundaries,
          isContract: true,
        },
      });
    }
  });

  // Add edges from observed event traffic
  if (events.length > 0) {
    edges = createEventEdges(nodes, events, edges);
  }

  // Add mesh edges if enabled (shows potential communication paths)
  if (options.showMesh) {
    edges = createMeshEdges(nodes, edges);
  }

  // Connect client nodes to the network service (they observe the topology)
  edges = createClientEdges(nodes, edges);

  // Assign parallel edge offsets to prevent overlapping
  edges = assignParallelEdgeOffsets(edges);

  // Apply dagre layout for hierarchical visualization
  return getDagreLayout(nodes, edges);
}

/**
 * Assign offset indices to parallel edges (edges between same node pairs)
 * This allows the edge renderer to spread them out visually
 */
function assignParallelEdgeOffsets(edges: Edge[]): Edge[] {
  // Group edges by their node pair (regardless of direction)
  const edgeGroups = new Map<string, Edge[]>();

  edges.forEach((edge) => {
    // Create a canonical key (sorted alphabetically so A-B and B-A are same group)
    const ids = [edge.source, edge.target].sort();
    const pairKey = `${ids[0]}::${ids[1]}`;

    if (!edgeGroups.has(pairKey)) {
      edgeGroups.set(pairKey, []);
    }
    edgeGroups.get(pairKey)!.push(edge);
  });

  // Assign offsets to edges in groups with multiple edges
  const result: Edge[] = [];

  edgeGroups.forEach((group) => {
    if (group.length === 1) {
      // Single edge, no offset needed
      result.push({
        ...group[0],
        data: { ...group[0].data, parallelOffset: 0, parallelCount: 1 },
      });
    } else {
      // Multiple parallel edges - assign offsets centered around 0
      const count = group.length;
      group.forEach((edge, index) => {
        // Calculate offset: spread edges evenly, centered at 0
        // e.g., 3 edges: -1, 0, 1 -> multiplied by spacing
        const offset = index - (count - 1) / 2;
        result.push({
          ...edge,
          data: { ...edge.data, parallelOffset: offset, parallelCount: count },
        });
      });
    }
  });

  return result;
}

/**
 * Create edges connecting client nodes to the network service
 */
function createClientEdges(
  nodes: Node<NetworkFlowNodeData>[],
  existingEdges: Edge[]
): Edge[] {
  const edges: Edge[] = [...existingEdges];

  // Find the network service node
  const networkServiceNode = nodes.find(
    n => n.data.networkNode.id === 'network' || n.data.networkNode.name.toLowerCase().includes('network')
  );
  if (!networkServiceNode) return edges;

  // Find all client nodes
  const clientNodes = nodes.filter(n => n.data.networkNode.type === 'client');

  // Create dashed edges from clients to network service
  clientNodes.forEach((clientNode) => {
    edges.push({
      id: `client-${clientNode.id}-to-network`,
      source: clientNode.id,
      target: networkServiceNode.id,
      type: 'animated', // Use orthogonal step edges
      style: {
        stroke: '#64748b',
        strokeWidth: 1,
        strokeDasharray: '3 3',
      },
      data: {
        isClientConnection: true,
      },
    });
  });

  return edges;
}

/**
 * Get edge label from contract data
 */
export function getEdgeLabel(contract: NodeContract): string {
  const types = contract.allowedEventTypes;
  if (types.includes('*')) return 'all events';
  if (types.length === 1) return types[0];
  if (types.length <= 3) return types.join(', ');
  return `${types.slice(0, 2).join(', ')} +${types.length - 2}`;
}
