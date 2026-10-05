/**
 * Network Graph
 *
 * React Flow visualization of network topology showing nodes and contracts.
 * Features animated edges with flowing particles.
 */

import { useMemo, useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  Background,
  BackgroundVariant,
  Controls,
  type Node,
  useReactFlow,
  useNodesInitialized,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { NetworkFlowNode } from './NetworkFlowNode';
import { AnimatedEdge } from './AnimatedEdge';
import { networkToFlow, NODE_TYPE_COLORS, type NetworkFlowNodeData } from './networkFlowUtils';
import type { NetworkNode, NodeContract, SandboxEvent, EventTrace } from '@/services/networkClient';

// Register custom node and edge types
const nodeTypes = {
  networkFlowNode: NetworkFlowNode,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const edgeTypes: Record<string, any> = {
  animated: AnimatedEdge,
};

// Default edge styling - use animated edge type
// Note: stroke uses CSS variable for theming
const defaultEdgeOptions = {
  type: 'animated',
  style: {
    strokeWidth: 2,
  },
};

interface NetworkGraphProps {
  networkNodes: NetworkNode[];
  contracts: NodeContract[];
  events?: Array<{ event: SandboxEvent; trace: EventTrace }>;
  className?: string;
  onNodeClick?: (node: NetworkNode) => void;
  showIntegrations?: boolean;
  integrationCount?: number;
  onToggleIntegrations?: () => void;
}

/**
 * Re-fit when the graph arrives.
 *
 * `fitView` on <ReactFlow> fits ONCE, at mount. This graph's nodes arrive over
 * the mesh socket a moment later, so the fit ran against an empty canvas and
 * was never repeated. Measured: 22 nodes laid out on a ring roughly 2100px
 * across, viewport left where it started — every node outside the pane and
 * only the chords between them visible. The picture was edges crossing empty
 * space, which reads as a rendering bug and is actually a stale viewport.
 *
 * Fits again whenever the node COUNT changes, not on every render: dragging a
 * node must not yank the camera, and node data updates every few seconds with
 * fresh traffic counts.
 */
function FitWhenGraphChanges({ nodeCount }: { nodeCount: number }) {
  const { fitView } = useReactFlow();
  const initialized = useNodesInitialized();
  const lastFitted = useRef<number>(-1);

  useEffect(() => {
    if (!initialized || nodeCount === 0) return;
    if (lastFitted.current === nodeCount) return;
    lastFitted.current = nodeCount;
    // Measured, not measured-once: nodes must have real dimensions before a
    // fit means anything, which is what useNodesInitialized reports.
    void fitView({ padding: 0.15, maxZoom: 1.1, duration: 300 });
  }, [initialized, nodeCount, fitView]);

  return null;
}

export function NetworkGraph({
  networkNodes,
  contracts,
  events = [],
  className = '',
  onNodeClick,
  showIntegrations = false,
  integrationCount = 0,
  onToggleIntegrations,
}: NetworkGraphProps) {
  // Track if we've done initial layout
  const hasInitialLayout = useRef(false);
  const nodePositions = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Convert network data to React Flow format
  const { nodes: calculatedNodes, edges: calculatedEdges } = useMemo(
    () => networkToFlow(networkNodes, contracts, events),
    [networkNodes, contracts, events]
  );

  // Preserve positions after initial layout
  const initialNodes = useMemo(() => {
    if (!hasInitialLayout.current) {
      // First render - use calculated positions
      return calculatedNodes;
    }
    // Subsequent renders - preserve existing positions, only update data
    return calculatedNodes.map((node) => {
      const savedPos = nodePositions.current.get(node.id);
      if (savedPos) {
        return { ...node, position: savedPos };
      }
      return node;
    });
  }, [calculatedNodes]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(calculatedEdges);

  // Save positions when nodes change (e.g., user drags)
  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);
      // Save any position changes
      changes.forEach((change) => {
        if (change.type === 'position' && change.position) {
          nodePositions.current.set(change.id, change.position);
        }
      });
    },
    [onNodesChange]
  );

  // Update nodes/edges when network topology changes (new nodes added/removed).
  //
  // Deliberately depends ONLY on the SOURCE data (calculatedNodes/Edges), never
  // on `nodes`. Depending on `nodes` while calling setNodes here is an infinite
  // loop: the data-update branch returns fresh object references every run, so
  // `nodes` changes identity, which refires the effect, which setNodes again —
  // React aborts with "Maximum update depth exceeded" and the panel renders
  // blank (observed 9 Aug: the Network view drew a black screen and flooded the
  // console with 10k identical errors). Current nodes are read through the
  // functional setNodes updater instead, so no reactive dependency on them.
  useEffect(() => {
    setNodes((currentNodes) => {
      const currentNodeIds = new Set(currentNodes.map((n) => n.id));
      const newNodeIds = new Set(calculatedNodes.map((n) => n.id));

      const topologyChanged =
        currentNodeIds.size !== newNodeIds.size ||
        [...newNodeIds].some((id) => !currentNodeIds.has(id));

      if (topologyChanged) {
        hasInitialLayout.current = false;
        nodePositions.current.clear();
        return calculatedNodes;
      }

      // Only data changed — update data, preserve positions.
      hasInitialLayout.current = true;
      return currentNodes.map((node) => {
        const updatedNode = calculatedNodes.find((n) => n.id === node.id);
        if (updatedNode) {
          nodePositions.current.set(node.id, node.position);
          return { ...node, data: updatedNode.data };
        }
        return node;
      });
    });
    setEdges(calculatedEdges);
  }, [calculatedNodes, calculatedEdges, setNodes, setEdges]);

  // Handle node click
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node<NetworkFlowNodeData>) => {
      if (onNodeClick && node.data?.networkNode) {
        onNodeClick(node.data.networkNode);
      }
    },
    [onNodeClick]
  );

  // Empty state
  if (networkNodes.length === 0) {
    return (
      <div className={`flex items-center justify-center text-text-muted ${className}`}>
        <div className="text-center">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
          <p className="text-sm">No nodes connected</p>
          <p className="text-xs mt-1 text-text-secondary">
            Nodes will appear here when they register with the network
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative rounded-lg overflow-hidden bg-surface-sunken border border-border ${className}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1.1 }}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag={true}
        zoomOnScroll={true}
        zoomOnPinch={true}
        preventScrolling={false}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="network-graph-canvas"
      >
        <FitWhenGraphChanges nodeCount={nodes.length} />
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          className="!fill-border-muted"
        />
        <Controls
          showZoom={true}
          showFitView={true}
          showInteractive={false}
          className="network-graph-controls"
        />

        {/* External integrations, off by default. See NetworkPanel for why. */}
        {integrationCount > 0 && onToggleIntegrations && (
          <div className="absolute top-3 right-3 z-10">
            <button
              onClick={onToggleIntegrations}
              className={`rounded-md border px-2.5 py-1.5 text-[11px] backdrop-blur transition-colors ${
                showIntegrations
                  ? 'border-pink-400/40 bg-pink-500/10 text-pink-200'
                  : 'border-border bg-surface-sunken/90 text-text-secondary hover:text-text-primary'
              }`}
            >
              {showIntegrations ? 'Hide' : 'Show'} {integrationCount} external integrations
            </button>
          </div>
        )}

        {/* Say what the edges are.
            They are DECLARED CONTRACTS, not observed calls. Measured 8 Aug
            2026: three contracts exist on a stack serving thousands of
            requests a minute, obs.http.* records no callee, and 1011 distinct
            trace ids appeared with ZERO shared between two services — so
            trace context does not propagate and a real call graph cannot be
            derived yet. A diagram that looks like a service map while showing
            intentions is worse than one that admits which it is. */}
        <div className="absolute bottom-3 right-3 z-10 max-w-[300px] rounded-md border border-border bg-surface-sunken/90 px-2.5 py-1.5 backdrop-blur">
          <div className="space-y-1 text-[11px] text-text-secondary leading-snug">
            <div className="flex items-center gap-2">
              <span className="inline-block w-6 h-0 border-t-2 border-cyan-400 shrink-0" />
              <span>
                <span className="text-text-primary">observed call</span> — count · p95, last 60s
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-6 h-0 border-t border-dashed border-slate-500 shrink-0" />
              <span>declared contract — permitted, not necessarily used</span>
            </div>
            <p className="text-text-muted pt-0.5">
              A call with no <code>caller</code> draws no edge: it came from a browser, or from
              outside a request.
            </p>
          </div>
        </div>
      </ReactFlow>

      {/* Dynamic Legend - shows only node types present in the graph */}
      <div className="absolute top-2 left-2 bg-surface-overlay/90 border border-border rounded-lg px-3 py-1.5 text-xs flex items-center gap-4 z-10">
        {Array.from(new Set(networkNodes.map(n => n.type)))
          .filter(type => NODE_TYPE_COLORS[type])
          .map((type) => (
            <div key={type} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded"
                style={{ backgroundColor: NODE_TYPE_COLORS[type] }}
              />
              <span className="text-text-secondary capitalize">{type}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
