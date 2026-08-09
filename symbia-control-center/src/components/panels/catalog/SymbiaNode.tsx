/**
 * SymbiaNode — the one drawing of a Symbia object.
 *
 * THE RULE THIS FILE EXISTS TO KEEP: a component looks the same wherever you
 * meet it. Alone in the catalog, wired inside a graph, or lit up in the
 * runtime, it is the same object and therefore the same node — same ports, same
 * lanes, same geometry. Only the surroundings change.
 *
 * This was not true an hour ago. The console had four independent node
 * drawings: `FlowNode` for assistant routines, `NetworkFlowNode` for the mesh,
 * a step-shaped mapping for graphs, and a bespoke HTML layout for a single
 * operation. A component inspected in the catalog and the same component inside
 * a graph were drawn by different code, which meant they could disagree — and
 * a reader had to learn the difference rather than the platform.
 *
 * That is the same defect as four namespace lists (§8) and four panel lists
 * (F37), in pixels. A shared concern with N independent implementations is not
 * shared.
 *
 * PORTS ARE REAL HANDLES. Each named port gets its own React Flow handle keyed
 * by port name, so an edge in a graph lands on the port it actually leaves
 * from. `error` arriving at a log sink is visibly the same `error` port the
 * catalog shows on that component — not a line to the middle of a box.
 */
import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

export type Lane = 'inherit' | 'canonical' | 'apocryphal' | 'conditional';

export interface Port {
  name: string;
  lane?: Lane;
  laneNote?: string;
}

export interface SymbiaNodeData {
  /** Node id inside a graph, or the component's short name when standing alone. */
  label: string;
  /** Full component key, e.g. symbia.compute.arithmetic. */
  componentKey?: string;
  inputs: Port[];
  outputs: Port[];
  /** v1.3.0 · builtin, or a config summary. */
  subtitle?: string;
  /** Reserved for the runtime view: idle / active / refused. */
  state?: 'idle' | 'active' | 'refused';
  [key: string]: unknown;
}

export const LANE_DOT: Record<Lane, string> = {
  canonical: 'bg-emerald-400',
  apocryphal: 'bg-amber-400',
  conditional: 'bg-violet-400',
  inherit: 'bg-slate-500',
};

export const LANE_TEXT: Record<Lane, string> = {
  canonical: 'text-emerald-300',
  apocryphal: 'text-amber-300',
  conditional: 'text-violet-300',
  inherit: 'text-slate-400',
};

export const LANE_MEANING: Record<Lane, string> = {
  canonical: 'recomputable from the graph',
  apocryphal: 'cannot be verified by recomputation',
  conditional: 'decided by the data',
  inherit: 'carries whatever arrived',
};

export const FAMILY_ICON: Record<string, string> = {
  io: '➜',
  logic: '⑂',
  state: '▤',
  compute: '∑',
  transform: '⇄',
  sink: '⇥',
  source: '⇤',
  entry: '📥',
  exit: '📤',
};

/* Geometry lives here so dagre and the renderer cannot disagree about size. */
export const NODE_WIDTH = 230;
const HEADER_H = 46;
const PORT_ROW_H = 24;
const PAD = 10;

export function nodeHeight(d: SymbiaNodeData): number {
  const rows = Math.max(d.inputs.length, d.outputs.length, 1);
  return HEADER_H + rows * PORT_ROW_H + PAD;
}

function SymbiaNodeComponent({ data }: { data: SymbiaNodeData }) {
  const family = (data.componentKey ?? '').split('.')[1] ?? 'io';
  const rows = Math.max(data.inputs.length, data.outputs.length, 1);

  const stateRing =
    data.state === 'active'
      ? 'ring-scc-primary'
      : data.state === 'refused'
        ? 'ring-amber-500/60'
        : 'ring-scc-border';

  return (
    <div
      className={`rounded-xl bg-scc-elevated ring-1 ${stateRing} shadow-md overflow-hidden`}
      style={{ width: NODE_WIDTH, height: nodeHeight(data) }}
    >
      <div className="px-3 pt-2.5 pb-1.5 border-b border-scc-border/70">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">{FAMILY_ICON[family] ?? '➜'}</span>
          <span className="font-mono text-slate-100 truncate">{data.label}</span>
        </div>
        {data.subtitle && (
          <div className="font-mono text-slate-500 truncate leading-tight">{data.subtitle}</div>
        )}
      </div>

      <div className="relative" style={{ height: rows * PORT_ROW_H + PAD - 6 }}>
        {data.inputs.map((p, i) => (
          <div
            key={`in-${p.name}`}
            className="absolute left-0 flex items-center gap-1.5 pl-2.5"
            style={{ top: i * PORT_ROW_H + 4 }}
          >
            <Handle
              type="target"
              id={p.name}
              position={Position.Left}
              style={{ top: i * PORT_ROW_H + HEADER_H + 12, background: '#64748b', width: 9, height: 9 }}
            />
            <span className="w-2 h-2 rounded-full bg-slate-500" />
            <span className="font-mono text-slate-400">{p.name}</span>
          </div>
        ))}

        {data.outputs.map((p, i) => {
          const lane = p.lane ?? 'inherit';
          return (
            <div
              key={`out-${p.name}`}
              className="absolute right-0 flex items-center gap-1.5 pr-2.5"
              style={{ top: i * PORT_ROW_H + 4 }}
              title={p.laneNote ?? LANE_MEANING[lane]}
            >
              <span className={`font-mono ${LANE_TEXT[lane]}`}>{p.name}</span>
              <span className={`w-2 h-2 rounded-full ${LANE_DOT[lane]}`} />
              <Handle
                type="source"
                id={p.name}
                position={Position.Right}
                style={{
                  top: i * PORT_ROW_H + HEADER_H + 12,
                  background: lane === 'inherit' ? '#64748b' : undefined,
                  width: 9,
                  height: 9,
                }}
                className={lane !== 'inherit' ? LANE_DOT[lane] : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const SymbiaNode = memo(SymbiaNodeComponent);
export const symbiaNodeTypes = { symbia: SymbiaNode };
