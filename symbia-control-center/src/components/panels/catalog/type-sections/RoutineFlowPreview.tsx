/**
 * Routine Flow Preview
 *
 * Read-only React Flow visualization of assistant routines.
 * Shows a horizontal process flow diagram of the routine steps.
 */

import { useMemo } from 'react';
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { FlowNode } from './flow-nodes';
import { routinesToFlow } from './routineFlowUtils';
import type { Routine } from './RoutineEditor';

// Register custom node types
const nodeTypes = {
  flowNode: FlowNode,
};

// Default edge styling
const defaultEdgeOptions = {
  type: 'smoothstep',
  style: {
    stroke: '#64748b',
    strokeWidth: 2,
  },
};

interface RoutineFlowPreviewProps {
  routines: Routine[];
  className?: string;
}

export function RoutineFlowPreview({ routines, className = '' }: RoutineFlowPreviewProps) {
  // Convert all routines to React Flow format
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => routinesToFlow(routines),
    [routines]
  );

  const [nodes] = useNodesState(initialNodes);
  const [edges] = useEdgesState(initialEdges);

  // Count total steps across all routines
  const totalSteps = routines.reduce((sum, r) => sum + r.steps.length, 0);

  // Don't render if no steps
  if (totalSteps === 0) {
    return (
      <div className={`h-24 flex items-center justify-center text-slate-500 text-sm ${className}`}>
        Add steps to see the flow diagram
      </div>
    );
  }

  // Calculate height based on number of routines (min 250px, ~100px per routine)
  const height = Math.max(250, routines.length * 100 + 50);

  return (
    <div
      className={`rounded-lg overflow-hidden bg-slate-900/30 border border-slate-700/30 ${className}`}
      style={{ height: `${height}px` }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={true}
        zoomOnScroll={true}
        zoomOnPinch={true}
        preventScrolling={false}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      />
    </div>
  );
}
