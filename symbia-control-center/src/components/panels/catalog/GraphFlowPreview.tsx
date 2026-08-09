/**
 * Graph flow preview — the same nodes, wired.
 *
 * Every node here is a `SymbiaNode`, identical to the one the catalog draws
 * when you inspect that component on its own. Same ports, same lane colours,
 * same geometry. Finding `symbia.compute.arithmetic` inside a pipeline should
 * be recognising the object you just read about, not decoding a second
 * notation for it.
 *
 * PORTS CARRY THE EDGES. Each edge attaches to the named handle it actually
 * leaves from and arrives at, so `pue.error → errlog.in` is drawn from the
 * amber `error` port rather than from the middle of a box. A graph's branching
 * is its whole behaviour, and the ports are where the branching lives.
 *
 * WHERE THE PORTS COME FROM. A graph node names a component; the component's
 * published manifest names the ports and their lanes. A node whose component is
 * not manifested falls back to the ports the graph's own edges reference, and
 * says so by having no lane colour rather than by guessing one.
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, Controls, useNodesState, useEdgesState, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';

import {
  symbiaNodeTypes,
  nodeHeight,
  NODE_WIDTH,
  LANE_HEX,
  type Port,
  type SymbiaNodeData,
} from './SymbiaNode';

export interface ComponentPorts {
  inputs: Port[];
  outputs: Port[];
  version?: string;
  implementation?: string;
}

export interface GraphDefinition {
  nodes?: { id: string; component?: string; config?: Record<string, unknown> }[];
  edges?: {
    id?: string;
    source?: { node?: string; port?: string };
    target?: { node?: string; port?: string };
  }[];
  metadata?: Record<string, unknown>;
}

/**
 * How far a wire runs straight out of a port before its first corner.
 *
 * Without it a wire leaves a port and immediately turns across the face of its
 * own node, over the port labels the diagram exists to show.
 */
const EDGE_OFFSET = 18;

/**
 * The readability floor.
 *
 * The viewport will not shrink past this even when the graph then overflows
 * the pane. A diagram scaled to five-pixel labels is a decoration, and this is
 * where shrinking stops being a fit and starts being a lie about legibility.
 */
const MIN_ZOOM = 0.62;

/** Breathing room between the graph and the pane edge. */
const PANE_PAD = 20;

/**
 * Edge styling.
 *
 * Colour comes from `LANE_HEX`, the same map the port dots read. Previously
 * the refusal edge was a literal `#f59e0b` here while the `error` port dot it
 * left from was Tailwind `amber-400` (#fbbf24) — one lane, two colours, half a
 * shade apart, decided in two files.
 */
const defaultEdgeOptions = {
  type: 'smoothstep',
  pathOptions: { borderRadius: 10, offset: EDGE_OFFSET },
  style: { stroke: LANE_HEX.inherit, strokeWidth: 1.75 },
  // Under the nodes: a wire crossing a card obscured its port labels.
  zIndex: 0,
};

function layout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  // ranksep leaves room for the straight run out of each port plus the corner
  // radius at both ends; below roughly 2 x EDGE_OFFSET the wires have nowhere
  // to turn and doubled back over the nodes.
  g.setGraph({ rankdir: 'LR', nodesep: 26, ranksep: 110, marginx: 0, marginy: 0 });
  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_WIDTH, height: nodeHeight(n.data as SymbiaNodeData) });
  }
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    return {
      ...n,
      position: { x: p.x - NODE_WIDTH / 2, y: p.y - nodeHeight(n.data as SymbiaNodeData) / 2 },
    };
  });
}

export function GraphFlowPreview({
  definition,
  manifests,
  className = '',
}: {
  definition: GraphDefinition;
  /** componentKey -> published ports. Absent entries degrade honestly. */
  manifests?: Map<string, ComponentPorts>;
  className?: string;
}) {
  const { nodes: initial, edges: initialEdges, count } = useMemo(() => {
    const defNodes = definition.nodes ?? [];
    const defEdges = (definition.edges ?? []).filter((e) => e.source?.node && e.target?.node);
    if (defNodes.length === 0) return { nodes: [], edges: [], count: 0 };

    // Ports actually referenced by this graph, as a fallback for unmanifested
    // components. Derived, and therefore laneless — an inferred port has no
    // published lane and must not be given one.
    const usedOut = new Map<string, Set<string>>();
    const usedIn = new Map<string, Set<string>>();
    for (const e of defEdges) {
      if (!usedOut.has(e.source!.node!)) usedOut.set(e.source!.node!, new Set());
      usedOut.get(e.source!.node!)!.add(e.source!.port ?? 'out');
      if (!usedIn.has(e.target!.node!)) usedIn.set(e.target!.node!, new Set());
      usedIn.get(e.target!.node!)!.add(e.target!.port ?? 'in');
    }

    const n: Node[] = defNodes.map((node) => {
      const m = node.component ? manifests?.get(node.component) : undefined;
      const inputs: Port[] =
        m?.inputs ?? [...(usedIn.get(node.id) ?? new Set(['in']))].map((name) => ({ name }));
      const outputs: Port[] =
        m?.outputs ?? [...(usedOut.get(node.id) ?? new Set(['out']))].map((name) => ({ name }));
      const data: SymbiaNodeData = {
        label: node.id,
        componentKey: node.component,
        inputs,
        outputs,
        subtitle: (node.component ?? '').replace(/^symbia\./, ''),
      };
      return {
        id: node.id,
        type: 'symbia',
        position: { x: 0, y: 0 },
        data: data as unknown as Record<string, unknown>,
      };
    });

    const e: Edge[] = defEdges.map((ed, i) => {
      const port = ed.source?.port ?? 'out';
      const refusal = port === 'error' || port === 'fail';
      return {
        id: ed.id ?? `e${i}`,
        source: ed.source!.node!,
        target: ed.target!.node!,
        sourceHandle: port,
        targetHandle: ed.target?.port ?? 'in',
        ...defaultEdgeOptions,
        style: refusal
          ? { stroke: LANE_HEX.apocryphal, strokeWidth: 1.75 }
          : defaultEdgeOptions.style,
      };
    });

    return { nodes: layout(n, e), edges: e, count: defNodes.length };
  }, [definition, manifests]);

  const [nodes] = useNodesState(initial);
  const [edges] = useEdgesState(initialEdges);

  /**
   * The opening viewport, computed rather than negotiated.
   *
   * `fitView` was tried and abandoned. It clamps at a minimum zoom and then
   * CENTRES what it cannot fit, which pushes the entry nodes of a
   * left-to-right graph off the left edge — the reader sees the middle of a
   * pipeline with wires arriving from nothing. Two attempts to correct it
   * afterwards, first in `onInit` and then in a child effect, both raced React
   * Flow's own fit and had no visible effect at all. Measured in a browser
   * both times.
   *
   * The bounds are already known here — this component laid the graph out — so
   * the viewport is arithmetic rather than a race. Shrink to fit while the
   * result is still legible; past that, stop shrinking, pin to the left edge,
   * and let the reader pan. Neither silently unreadable nor silently cut off.
   */
  const paneRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<{ x: number; y: number; zoom: number } | null>(null);

  useLayoutEffect(() => {
    const el = paneRef.current;
    if (!el || initial.length === 0) return;

    let graphW = 0;
    let graphH = 0;
    for (const n of initial) {
      graphW = Math.max(graphW, n.position.x + NODE_WIDTH);
      graphH = Math.max(graphH, n.position.y + nodeHeight(n.data as unknown as SymbiaNodeData));
    }

    const availW = el.clientWidth - PANE_PAD * 2;
    const availH = el.clientHeight - PANE_PAD * 2;
    const fit = Math.min(availW / Math.max(graphW, 1), availH / Math.max(graphH, 1));
    const zoom = Math.min(1, Math.max(MIN_ZOOM, fit));

    // Centre vertically only when the whole height fits. Otherwise start at the
    // top, for the same reason we start at the left.
    const scaledH = graphH * zoom;
    const y = scaledH < availH ? (el.clientHeight - scaledH) / 2 : PANE_PAD;

    setViewport({ x: PANE_PAD, y, zoom });
  }, [initial]);

  if (count === 0) {
    return (
      <div className={`h-24 flex items-center justify-center text-slate-500 ${className}`}>
        This graph declares no nodes.
      </div>
    );
  }

  return (
    <div
      ref={paneRef}
      className={`h-[460px] rounded-lg ring-1 ring-scc-border bg-scc-elevated/20 relative ${className}`}
    >
      {/* Rendered only once the pane has been measured, so `defaultViewport`
          is read with a real value. React Flow reads it on first render only,
          which is exactly why the earlier after-the-fact corrections lost. */}
      {viewport && (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={symbiaNodeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          defaultViewport={viewport}
          minZoom={0.4}
          maxZoom={1.5}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnScroll
          proOptions={{ hideAttribution: true }}
        >
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
      )}
      <span
        className="absolute bottom-3 left-4 text-slate-500 pointer-events-none"
        style={{ fontSize: 14 }}
      >
        drag to pan · scroll to zoom
      </span>
    </div>
  );
}
