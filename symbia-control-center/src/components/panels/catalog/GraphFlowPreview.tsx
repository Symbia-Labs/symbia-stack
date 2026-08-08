/**
 * Graph Flow Preview
 *
 * The behaviour tile from the assistants page, pointed at a catalog graph
 * instead of an assistant's routines. Same grammar deliberately: dagre
 * left-to-right layout, green Input and Output endpoints, a coloured card per
 * step, read-only. An operator who has read one should not have to learn the
 * other.
 *
 * WHAT A NODE IS COLOURED BY. Its component's family — io, logic, state,
 * compute, transform, sink, source — because that is what tells you at a glance
 * whether a step moves data, decides something, remembers something or writes
 * somewhere. Lane is shown as a small mark rather than as the colour: a port's
 * lane is a property of an edge leaving the node, not of the node itself, and
 * colouring by it would say a component "is" apocryphal when only one of its
 * outputs is.
 *
 * ENTRY AND EXIT ARE DERIVED, NOT DECLARED. The Input endpoint attaches to the
 * node named by `metadata.ingress.node` when a graph declares one, and
 * otherwise to whichever nodes no edge targets. Exit is whichever nodes emit to
 * nothing. Both are inferences from the shape and are drawn as endpoints rather
 * than asserted as ports.
 */
import { useMemo } from 'react';
import { ReactFlow, Controls, useNodesState, useEdgesState, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';

import { FlowNode } from './type-sections/flow-nodes';

const nodeTypes = { flowNode: FlowNode };

const defaultEdgeOptions = {
  type: 'smoothstep',
  style: { stroke: '#64748b', strokeWidth: 2 },
};

/** Colour by what the step does, matching the step palette on the assistants page. */
const FAMILY_COLOR: Record<string, string> = {
  io: '#64748b',
  logic: '#f59e0b',
  state: '#f59e0b',
  compute: '#22c55e',
  transform: '#a855f7',
  sink: '#00d4ff',
  source: '#22c55e',
};

const FAMILY_ICON: Record<string, string> = {
  io: '➜',
  logic: '⑂',
  state: '▤',
  compute: '∑',
  transform: '⇄',
  sink: '⇥',
  source: '⇤',
};

export interface GraphDefinition {
  nodes?: { id: string; component?: string; config?: Record<string, unknown> }[];
  edges?: {
    id?: string;
    source?: { node?: string; port?: string };
    target?: { node?: string; port?: string };
  }[];
  metadata?: Record<string, unknown>;
}

// Must match FlowNode's fixed card size or dagre spaces against a phantom.
const W = 140;
const H = 50;

function layout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 24, ranksep: 56 });
  for (const n of nodes) g.setNode(n.id, { width: W, height: H });
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    return { ...n, position: { x: p.x - W / 2, y: p.y - H / 2 } };
  });
}

export function GraphFlowPreview({
  definition,
  className = '',
}: {
  definition: GraphDefinition;
  className?: string;
}) {
  const { nodes: initial, edges: initialEdges, count } = useMemo(() => {
    const defNodes = definition.nodes ?? [];
    const defEdges = (definition.edges ?? []).filter((e) => e.source?.node && e.target?.node);
    if (defNodes.length === 0) return { nodes: [], edges: [], count: 0 };

    const targeted = new Set(defEdges.map((e) => e.target!.node!));
    const sourced = new Set(defEdges.map((e) => e.source!.node!));
    const declaredEntry = (definition.metadata?.ingress as { node?: string } | undefined)?.node;

    const entries = declaredEntry
      ? [declaredEntry]
      : defNodes.filter((n) => !targeted.has(n.id)).map((n) => n.id);
    const exits = defNodes.filter((n) => !sourced.has(n.id)).map((n) => n.id);

    const n: Node[] = [];
    const e: Edge[] = [];

    n.push({
      id: '__in',
      type: 'flowNode',
      position: { x: 0, y: 0 },
      data: {
        nodeType: 'input',
        label: 'Input',
        icon: '📥',
        description: declaredEntry ? 'declared ingress' : 'entry',
        color: '#22c55e',
      },
    });

    for (const node of defNodes) {
      const family = (node.component ?? '').split('.')[1] ?? 'io';
      const short = (node.component ?? 'unknown').replace(/^symbia\.[a-z]+\./, '');
      n.push({
        id: node.id,
        type: 'flowNode',
        position: { x: 0, y: 0 },
        data: {
          nodeType: 'step',
          label: node.id,
          icon: FAMILY_ICON[family] ?? '➜',
          description: short,
          color: FAMILY_COLOR[family] ?? '#64748b',
        },
      });
    }

    n.push({
      id: '__out',
      type: 'flowNode',
      position: { x: 0, y: 0 },
      data: { nodeType: 'output', label: 'Output', icon: '📤', description: 'result', color: '#22c55e' },
    });

    for (const id of entries) e.push({ id: `in-${id}`, source: '__in', target: id, ...defaultEdgeOptions });
    for (const ed of defEdges) {
      // The port is the useful label: a graph that branches does it by port,
      // and "pass" versus "fail" or "out" versus "error" is the whole story.
      const port = ed.source?.port;
      e.push({
        id: ed.id ?? `${ed.source!.node}-${ed.target!.node}-${port ?? ''}`,
        source: ed.source!.node!,
        target: ed.target!.node!,
        label: port && port !== 'out' ? port : undefined,
        labelStyle: { fill: '#94a3b8', fontSize: 12 },
        labelBgStyle: { fill: '#0f172a' },
        ...defaultEdgeOptions,
        style:
          port === 'error' || port === 'fail'
            ? { stroke: '#f59e0b', strokeWidth: 2 }
            : defaultEdgeOptions.style,
      });
    }
    for (const id of exits) e.push({ id: `out-${id}`, source: id, target: '__out', ...defaultEdgeOptions });

    return { nodes: layout(n, e), edges: e, count: defNodes.length };
  }, [definition]);

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
    // NOT fitView. FlowNode is fixed at 140×50 with 12px labels, so fitting a
    // seven-rank graph into this pane rendered the text at about five pixels —
    // a diagram you cannot read is a decoration. It opens at real size and pans
    // instead, which is the honest trade when the drawing is wider than the
    // space: show it legibly and let the reader move, rather than shrink it
    // until it fits and nobody can use it.
    <div className={`h-[400px] rounded-lg ring-1 ring-scc-border bg-scc-elevated/20 relative ${className}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        defaultViewport={{ x: 24, y: 24, zoom: 1 }}
        minZoom={0.4}
        maxZoom={1.6}
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
