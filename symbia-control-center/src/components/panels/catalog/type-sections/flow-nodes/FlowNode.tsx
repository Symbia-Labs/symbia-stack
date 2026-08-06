/**
 * FlowNode Component
 *
 * Unified node component for routine flow diagrams.
 * All nodes use consistent sizing for proper dagre layout.
 */

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { FlowNodeData } from '../routineFlowUtils';

interface FlowNodeProps {
  data: FlowNodeData;
}

function FlowNodeComponent({ data }: FlowNodeProps) {
  const { nodeType } = data;

  // Input node - entry point
  if (nodeType === 'input') {
    return (
      <div
        className="w-[140px] h-[50px] bg-green-900/30 border-2 rounded-lg shadow-md flex items-center"
        style={{ borderColor: data.color }}
      >
        <div className="flex items-center gap-2 px-3">
          <span className="text-base">{data.icon}</span>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-green-300">{data.label}</span>
            <span className="text-[10px] text-green-500/70">{data.description}</span>
          </div>
        </div>
        <Handle
          type="source"
          position={Position.Right}
          className="!w-2 !h-2 !bg-green-500 !border-green-400"
        />
      </div>
    );
  }

  // Router node - decision point with multiple outputs
  if (nodeType === 'router') {
    const outputs = data.routerOutputs || [];
    const headerHeight = 32; // px for header
    const rowHeight = 24;    // px per output row
    const totalHeight = headerHeight + outputs.length * rowHeight + 8; // +8 for padding

    return (
      <div
        className="w-[220px] bg-amber-900/30 border-2 rounded-lg shadow-md"
        style={{ borderColor: data.color, height: `${totalHeight}px` }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 h-8 border-b border-amber-700/30">
          <span className="text-sm">{data.icon}</span>
          <span className="text-xs font-semibold text-amber-300">{data.label}</span>
        </div>

        {/* Output rows - just labels, handles positioned separately */}
        <div className="flex flex-col">
          {outputs.map((output) => (
            <div
              key={output.id}
              className="flex items-center justify-end px-3 h-6 text-[10px]"
            >
              <span className="truncate" style={{ color: output.color }}>
                {output.label}
              </span>
            </div>
          ))}
        </div>

        {/* Source handles - positioned absolutely */}
        {outputs.map((output, index) => (
          <Handle
            key={output.id}
            type="source"
            position={Position.Right}
            id={`out-${output.id}`}
            className="!w-2 !h-2 !border-amber-400"
            style={{
              backgroundColor: output.color,
              top: `${headerHeight + index * rowHeight + rowHeight / 2}px`,
            }}
          />
        ))}

        {/* Input handle - centered */}
        <Handle
          type="target"
          position={Position.Left}
          className="!w-2 !h-2 !bg-amber-500 !border-amber-400"
          style={{ top: '50%' }}
        />
      </div>
    );
  }

  // Routine node - behavior container
  if (nodeType === 'routine') {
    const isMain = data.isMain;
    return (
      <div
        className="w-[140px] h-[50px] bg-slate-800/80 border-2 rounded-lg shadow-md flex items-center"
        style={{ borderColor: data.color }}
      >
        <div
          className="flex items-center gap-2 px-3 w-full h-full rounded-md"
          style={{ backgroundColor: `${data.color}15` }}
        >
          <span className="text-base">{data.icon}</span>
          <div className="flex flex-col min-w-0">
            <span className={`text-xs font-semibold truncate ${isMain ? 'text-cyan-300' : 'text-slate-300'}`}>
              {data.label}
            </span>
            <span className="text-[10px] text-slate-500 truncate">{data.description}</span>
          </div>
        </div>
        <Handle
          type="target"
          position={Position.Left}
          className="!w-2 !h-2 !bg-slate-500 !border-slate-400"
        />
        <Handle
          type="source"
          position={Position.Right}
          className="!w-2 !h-2 !bg-slate-500 !border-slate-400"
        />
      </div>
    );
  }

  // Output node - exit point
  if (nodeType === 'output') {
    return (
      <div
        className="w-[140px] h-[50px] bg-green-900/30 border-2 rounded-lg shadow-md flex items-center"
        style={{ borderColor: data.color }}
      >
        <Handle
          type="target"
          position={Position.Left}
          className="!w-2 !h-2 !bg-green-500 !border-green-400"
        />
        <div className="flex items-center gap-2 px-3">
          <span className="text-base">{data.icon}</span>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-green-300">{data.label}</span>
            <span className="text-[10px] text-green-500/70">{data.description}</span>
          </div>
        </div>
      </div>
    );
  }

  // Step node - same size as other nodes
  return (
    <div
      className="w-[140px] h-[50px] bg-scc-elevated border-2 rounded-lg shadow-md flex items-center"
      style={{ borderColor: data.color }}
    >
      <div
        className="flex items-center gap-2 px-3 w-full h-full rounded-md"
        style={{ backgroundColor: `${data.color}20` }}
      >
        <span className="text-base">{data.icon}</span>
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-semibold text-slate-200">{data.label}</span>
          <p className="text-[10px] text-slate-400 truncate">
            {data.description}
          </p>
        </div>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-slate-500 !border-slate-400"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-slate-500 !border-slate-400"
      />
    </div>
  );
}

export const FlowNode = memo(FlowNodeComponent);
