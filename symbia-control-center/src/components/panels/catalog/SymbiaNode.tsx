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

/**
 * Lane colour, once, as hex.
 *
 * SOURCE OF RECORD for anything DRAWN — port dots and edge strokes both read
 * this. The edge stroke used to be a literal `#f59e0b` in GraphFlowPreview
 * while the port dot next to it was Tailwind `amber-400` (#fbbf24): the same
 * lane, two colours, half a shade apart, decided in two files. A refusal path
 * and the port it leaves from must be the same colour or the drawing is
 * telling you they are different things.
 */
export const LANE_HEX: Record<Lane, string> = {
  canonical: '#34d399',   // emerald-400
  apocryphal: '#fbbf24',  // amber-400
  conditional: '#a78bfa', // violet-400
  inherit: '#64748b',     // slate-500
};

/** Tailwind equivalents, kept for callers that need a class. See LANE_HEX. */
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

/* Geometry lives here so dagre and the renderer cannot disagree about size.
 *
 * Sized for 16px type, per the standing rule that base text is at least 16px.
 * These constants and the font sizes below move together: shrink the type
 * without shrinking the rows and the port labels collide. */
export const NODE_WIDTH = 264;
const HEADER_H = 56;
const PORT_ROW_H = 30;
const PAD = 12;

/* Type scale for the node. Declared, not inherited, because this component is
 * rendered inside a React Flow canvas that does not inherit the app's base. */
const LABEL_PX = 17;
const SUB_PX = 15;
const PORT_PX = 16;

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
          <span className="text-slate-500" style={{ fontSize: LABEL_PX }}>
            {FAMILY_ICON[family] ?? '➜'}
          </span>
          <span
            className="font-mono text-slate-100 truncate"
            style={{ fontSize: LABEL_PX }}
          >
            {data.label}
          </span>
        </div>
        {data.subtitle && (
          <div
            className="font-mono text-slate-500 truncate leading-tight"
            style={{ fontSize: SUB_PX }}
          >
            {data.subtitle}
          </div>
        )}
      </div>

      <div className="relative" style={{ height: rows * PORT_ROW_H + PAD - 6 }}>
        {/*
          THE HANDLE IS INSIDE ITS OWN ROW, and carries no `top`.

          It used to set `top: i * PORT_ROW_H + HEADER_H + 12` while sitting
          inside this ports container — which is ALREADY offset by the header.
          The header height was therefore counted twice and every handle landed
          about 46px below the port it belonged to, i.e. at or past the bottom
          edge of the card. That is why edges appeared to leave from underneath
          a node rather than from a port.

          A row div is `absolute`, so it is a positioned ancestor: a Handle
          inside it with React Flow's default `top: 50%` centres on that row and
          cannot drift from the label beside it. The offset is now impossible to
          get wrong rather than merely corrected.
        */}
        {data.inputs.map((p, i) => (
          <div
            key={`in-${p.name}`}
            className="absolute left-0 flex items-center gap-2 pl-2.5"
            style={{ top: i * PORT_ROW_H + 4, height: PORT_ROW_H - 6 }}
          >
            {/* The handle IS the port dot. There used to be a decorative
                <span> dot beside it, so every port rendered two circles a few
                pixels apart and the one you could see was not the one the wire
                attached to. One dot, and it is the real connection point. */}
            <Handle
              type="target"
              id={p.name}
              position={Position.Left}
              style={{ background: LANE_HEX.inherit, width: 9, height: 9, border: 'none', left: 6 }}
            />
            <span
              className="font-mono text-slate-400"
              style={{ fontSize: PORT_PX, marginLeft: 8 }}
            >
              {p.name}
            </span>
          </div>
        ))}

        {data.outputs.map((p, i) => {
          const lane = p.lane ?? 'inherit';
          return (
            <div
              key={`out-${p.name}`}
              className="absolute right-0 flex items-center gap-2 pr-2.5"
              style={{ top: i * PORT_ROW_H + 4, height: PORT_ROW_H - 6 }}
              title={p.laneNote ?? LANE_MEANING[lane]}
            >
              <span
                className={`font-mono ${LANE_TEXT[lane]}`}
                style={{ fontSize: PORT_PX, marginRight: 8 }}
              >
                {p.name}
              </span>
              <Handle
                type="source"
                id={p.name}
                position={Position.Right}
                style={{ background: LANE_HEX[lane], width: 9, height: 9, border: 'none', right: 6 }}
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
