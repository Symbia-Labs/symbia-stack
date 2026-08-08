/**
 * Realization graph.
 *
 * THE PREMISE, in Brian's words: a catalog object is not real until it is
 * loaded into a graph in the runtime. Registration is a claim. The runtime
 * holding it is what makes it true.
 *
 * So this draws the claim and the truth in the same picture, and distinguishes
 * them the way the network topology does — solid for what the runtime actually
 * holds, dashed for what is only declared. That page's legend already teaches
 * the reader this distinction ("declared contract — permitted, not necessarily
 * used"); reusing the language rather than inventing a second one is the point.
 *
 * WHAT AN EDGE MEANS HERE. app → graph is "this app provides that graph".
 * graph → component is "a node in this graph references that component". Both
 * are declarations in the catalog. Whether either is realized depends on the
 * runtime, which is a separate question asked separately.
 *
 * A COMPONENT NOBODY USES IS DASHED. It may be manifested, versioned and
 * perfectly correct, and still be a claim nobody has cashed. That is not a
 * defect — sixteen builtins ship whether or not a graph wires them — but it is
 * a fact the catalog alone cannot show you.
 */
import { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

export interface GraphResource {
  key: string;
  name: string;
  type: string;
  metadata?: Record<string, unknown>;
}

export interface Realization {
  /** Graph names the runtime has actually loaded. */
  loadedGraphs: Set<string>;
  /** Component ids the runtime actually has compiled in. */
  runningComponents: Set<string>;
}

interface Def {
  nodes?: { id: string; component?: string }[];
  edges?: unknown[];
  metadata?: Record<string, unknown>;
}

function defOf(r: GraphResource): Def {
  const m = (r.metadata ?? {}) as Record<string, unknown>;
  return (m.definition ?? m.graph ?? m) as Def;
}

const COL = {
  real: '#2dd4bf',
  declared: '#64748b',
  app: '#a78bfa',
  text: '#e2e8f0',
  dim: '#94a3b8',
};

export function RealizationGraph({
  resources,
  realization,
  onSelect,
}: {
  resources: GraphResource[];
  realization: Realization;
  onSelect?: (key: string) => void;
}) {
  const { nodes, edges, stats } = useMemo(() => {
    const apps = resources.filter((r) => r.type === 'app');
    const graphs = resources.filter((r) => r.type === 'graph');
    const components = resources.filter((r) => r.type === 'component');

    const n: Node[] = [];
    const e: Edge[] = [];

    // Which components does any graph actually reference?
    const referenced = new Map<string, string[]>();
    for (const g of graphs) {
      const gname = (defOf(g).metadata?.name as string) ?? g.name;
      for (const node of defOf(g).nodes ?? []) {
        if (!node.component) continue;
        if (!referenced.has(node.component)) referenced.set(node.component, []);
        if (!referenced.get(node.component)!.includes(gname)) {
          referenced.get(node.component)!.push(gname);
        }
      }
    }

    const isGraphReal = (g: GraphResource) => realization.loadedGraphs.has(g.name);
    // A component is realized when the runtime has it AND some loaded graph uses it.
    const isComponentReal = (key: string) =>
      realization.runningComponents.has(key) &&
      (referenced.get(key) ?? []).some((gn) => realization.loadedGraphs.has(gn));

    const COLUMN = { app: 40, graph: 400, component: 820 };
    const box = (
      id: string,
      label: string,
      sub: string,
      x: number,
      y: number,
      real: boolean,
      accent: string,
    ): Node => ({
      id,
      position: { x, y },
      data: { label: `${label}\n${sub}` },
      style: {
        width: 260,
        padding: '10px 12px',
        borderRadius: 10,
        border: real ? `1px solid ${accent}` : `1px dashed ${COL.declared}`,
        background: real ? 'rgba(45,212,191,0.07)' : 'rgba(100,116,139,0.06)',
        color: real ? COL.text : COL.dim,
        fontSize: 15,
        whiteSpace: 'pre-line',
        textAlign: 'left',
        boxShadow: real ? `0 0 0 1px ${accent}22` : 'none',
      },
      sourcePosition: 'right' as never,
      targetPosition: 'left' as never,
    });

    apps.forEach((a, i) => {
      const provides =
        ((a.metadata as never as { manifest?: { provides?: { graphs?: string[] } } })?.manifest
          ?.provides?.graphs) ?? [];
      const anyReal = provides.some((gn) => realization.loadedGraphs.has(gn));
      n.push(box(`app:${a.key}`, a.name, `app · provides ${provides.length}`, COLUMN.app, i * 150, anyReal, COL.app));
      for (const gn of provides) {
        const target = graphs.find((g) => g.name === gn);
        if (!target) continue;
        e.push({
          id: `e:${a.key}->${gn}`,
          source: `app:${a.key}`,
          target: `graph:${target.key}`,
          animated: realization.loadedGraphs.has(gn),
          style: {
            stroke: realization.loadedGraphs.has(gn) ? COL.real : COL.declared,
            strokeWidth: 1.5,
            strokeDasharray: realization.loadedGraphs.has(gn) ? undefined : '5 5',
          },
          markerEnd: { type: MarkerType.ArrowClosed, color: realization.loadedGraphs.has(gn) ? COL.real : COL.declared },
        });
      }
    });

    graphs.forEach((g, i) => {
      const d = defOf(g);
      const real = isGraphReal(g);
      n.push(
        box(
          `graph:${g.key}`,
          g.name,
          `graph · ${(d.nodes ?? []).length} nodes${real ? ' · loaded' : ' · not loaded'}`,
          COLUMN.graph,
          i * 150,
          real,
          COL.real,
        ),
      );
      const seen = new Set<string>();
      for (const node of d.nodes ?? []) {
        if (!node.component || seen.has(node.component)) continue;
        seen.add(node.component);
        const target = components.find(
          (c) => c.key === `components/${node.component}` || c.name === node.component,
        );
        if (!target) continue;
        e.push({
          id: `e:${g.key}->${node.component}`,
          source: `graph:${g.key}`,
          target: `comp:${target.key}`,
          animated: real,
          style: {
            stroke: real ? COL.real : COL.declared,
            strokeWidth: 1.5,
            strokeDasharray: real ? undefined : '5 5',
          },
          markerEnd: { type: MarkerType.ArrowClosed, color: real ? COL.real : COL.declared },
        });
      }
    });

    components.forEach((c, i) => {
      const key = c.name;
      const real = isComponentReal(key);
      const users = referenced.get(key) ?? [];
      n.push(
        box(
          `comp:${c.key}`,
          key,
          `component · ${users.length ? `used by ${users.length}` : 'unused'}`,
          COLUMN.component,
          i * 92,
          real,
          COL.real,
        ),
      );
    });

    return {
      nodes: n,
      edges: e,
      stats: {
        graphsReal: graphs.filter(isGraphReal).length,
        graphsTotal: graphs.length,
        compsReal: components.filter((c) => isComponentReal(c.name)).length,
        compsTotal: components.length,
      },
    };
  }, [resources, realization]);

  // Both panels sit OUTSIDE the canvas. Overlaying them covered the first app
  // card and the whole right-hand component column at the zoom this console is
  // actually read at — a legend that hides the thing it explains.
  return (
    <div className="h-full w-full flex flex-col min-h-0">
      <div className="shrink-0 flex flex-wrap items-center gap-x-8 gap-y-2 px-6 py-3 border-b border-scc-border">
        <span className="text-slate-200">
          <span className="text-xl font-medium">
            {stats.graphsReal}/{stats.graphsTotal}
          </span>{' '}
          <span className="text-slate-500">graphs loaded</span>
        </span>
        <span className="text-slate-200">
          <span className="text-xl font-medium">
            {stats.compsReal}/{stats.compsTotal}
          </span>{' '}
          <span className="text-slate-500">components reached by a loaded graph</span>
        </span>
        <span className="flex items-center gap-2 ml-auto">
          <span className="w-8 border-t-2 inline-block" style={{ borderColor: COL.real }} />
          <span className="text-slate-400">real</span>
          <span
            className="w-8 border-t-2 border-dashed inline-block ml-4"
            style={{ borderColor: COL.declared }}
          />
          <span className="text-slate-500">registered only</span>
        </span>
      </div>

      <div className="flex-1 min-h-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, node) => onSelect?.(String(node.id).split(':').slice(1).join(':'))}
        >
          <Background color="#1e293b" gap={20} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <p className="shrink-0 px-6 py-3 border-t border-scc-border text-slate-500 leading-relaxed">
        A catalog object is not real until a graph in the runtime loads it. A component can be
        manifested, versioned and correct and still be reached by nothing — that is a claim nobody
        has cashed, not a defect.
      </p>
    </div>
  );
}
