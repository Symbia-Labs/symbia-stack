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
 * published manifest names the ports and their lanes. That lookup is the reason
 * the manifest work of 8 Aug matters here — before it, this drawing could not
 * have known that `error` is apocryphal without parsing an English sentence.
 * A node whose component is not manifested falls back to the ports the graph's
 * own edges reference, and says so by having no lane colour rather than by
 * guessing one.
 */
import { useMemo } from 'react';
import { ReactFlow, Controls, useNodesState, useEdgesState, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';

import {
  symbiaNodeTypes,
  nodeHeight,
  NODE_WIDTH,
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

const defaultEdgeOptions = {
  type: 'smoothstep',
  style: { stroke: '#64748b', strokeWidth: 2 },
};

function layout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 30, ranksep: 90 });
  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_WIDTH, height: nodeHeight(n.data as SymbiaNodeData) });
  }
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    return { ...n, position: { x: p.x - NODE_WIDTH / 2, y: p.y - nodeHeight(n.data as SymbiaNodeData) / 2 } };
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
          ? { stroke: '#f59e0b', strokeWidth: 2 }
          : defaultEdgeOptions.style,
      };
    });

    return { nodes: layout(n, e), edges: e, count: defNodes.length };
  }, [definition, manifests]);

  const [nodes] = useNodesState(initial);
  const [edges] = useEdgesState(initialEdges);

  if (count === 0) {
    return (
      <div className={`h-24 flex items-center justify-center text-slate-500 ${className}`}>
        This graph declares no nodes.
      </div>
    );
  }

  return (
    // Opens at real size and pans. Fitting a wide graph into this pane rendered
    // labels at about five pixels; a diagram you cannot read is a decoration.
    <div className={`h-[460px] rounded-lg ring-1 ring-scc-border bg-scc-elevated/20 relative ${className}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={symbiaNodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        defaultViewport={{ x: 24, y: 24, zoom: 1 }}
        minZoom={0.35}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
        proOptions={{ hideAttribution: true }}
      >
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
      <span className="absolute bottom-3 left-4 text-slate-500 pointer-events-none">
        drag to pan · ⌄ to fit
      </span>
    </div>
  );
}
