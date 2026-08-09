/**
 * Operation diagram — one component, drawn as exactly the node it is.
 *
 * This is a SymbiaNode with nothing wired to it. Not a diagram *of* the node,
 * not a special single-operation layout: the same component, the same ports,
 * the same geometry the graph preview and the runtime use. Inspecting a
 * component in the catalog and finding it inside a graph should be recognising
 * one object, not comparing two drawings.
 *
 * The earlier version was bespoke HTML that happened to look similar. It was a
 * fourth node dialect, and two drawings that merely agree today are two
 * drawings that can disagree tomorrow.
 */
import { ReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  symbiaNodeTypes,
  nodeHeight,
  NODE_WIDTH,
  LANE_TEXT,
  LANE_MEANING,
  type Port,
  type Lane,
  type SymbiaNodeData,
} from './SymbiaNode';

export function OperationDiagram({
  componentKey,
  inputs,
  outputs,
  implementation,
  capability,
  version,
}: {
  componentKey: string;
  inputs: Port[];
  outputs: Port[];
  implementation?: string;
  capability?: string;
  version?: string;
}) {
  const data: SymbiaNodeData = {
    label: componentKey.replace(/^symbia\.[a-z]+\./, ''),
    componentKey,
    inputs,
    outputs,
    subtitle: [version && `v${version}`, implementation].filter(Boolean).join(' · '),
  };

  const h = nodeHeight(data);
  const lanesUsed = [...new Set(outputs.map((o) => (o.lane ?? 'inherit') as Lane))];

  return (
    <div className="rounded-lg ring-1 ring-scc-border bg-scc-elevated/20 p-6">
      {/* Height is the node's own height plus breathing room — no panning, no
          zoom, nothing to discover. One node needs no canvas affordances. */}
      <div style={{ height: h + 48 }}>
        <ReactFlow
          nodes={[
            {
              id: componentKey,
              type: 'symbia',
              position: { x: 24, y: 24 },
              data: data as unknown as Record<string, unknown>,
              draggable: false,
            },
          ]}
          edges={[]}
          nodeTypes={symbiaNodeTypes}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
          style={{ width: NODE_WIDTH + 80 }}
        />
      </div>

      {capability && (
        <p className="font-mono text-slate-500 -mt-4">requires {capability}</p>
      )}

      {outputs.some((o) => o.laneNote) && (
        <dl className="mt-5 pt-5 border-t border-scc-border space-y-2">
          {outputs
            .filter((o) => o.laneNote)
            .map((o) => (
              <div key={o.name} className="flex gap-3">
                <dt className="font-mono text-slate-300 shrink-0">{o.name}</dt>
                <dd className="text-slate-400 leading-relaxed">{o.laneNote}</dd>
              </div>
            ))}
        </dl>
      )}

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-slate-600">
        {lanesUsed.map((l) => (
          <span key={l}>
            <span className={LANE_TEXT[l]}>{l}</span> — {LANE_MEANING[l]}
          </span>
        ))}
      </div>
    </div>
  );
}
