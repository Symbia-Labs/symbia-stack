/**
 * Routine Flow Utilities
 *
 * Converts Routine/Step data to React Flow nodes and edges.
 * Uses dagre for automatic hierarchical layout.
 */

import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';
import type { Routine, StepType } from './RoutineEditor';

// Node dimensions for layout
const NODE_WIDTH = 140;
const NODE_HEIGHT = 50;
const ROUTER_WIDTH = 220;
const ROUTER_HEADER_HEIGHT = 32;
const ROUTER_ROW_HEIGHT = 24;

// Step type to color mapping
export const STEP_COLORS: Record<StepType, string> = {
  say: '#00d4ff',      // cyan (scc-primary)
  ask: '#00d4ff',      // cyan
  think: '#a855f7',    // purple
  remember: '#f59e0b', // amber
  recall: '#f59e0b',   // amber
  wait: '#64748b',     // slate
  check: '#f59e0b',    // amber
  call: '#64748b',     // slate
  repeat: '#64748b',   // slate
  stop: '#ef4444',     // red
};

// Step type icons
export const STEP_ICONS: Record<StepType, string> = {
  say: '💬',
  ask: '❓',
  think: '🧠',
  remember: '📝',
  recall: '🔍',
  wait: '⏱️',
  check: '🔀',
  call: '▶️',
  repeat: '🔄',
  stop: '⏹️',
};

// Step type labels
export const STEP_LABELS: Record<StepType, string> = {
  say: 'Say',
  ask: 'Ask',
  think: 'Think',
  remember: 'Remember',
  recall: 'Recall',
  wait: 'Wait',
  check: 'If',
  call: 'Run',
  repeat: 'Repeat',
  stop: 'Stop',
};

// Node types for the flow
export type FlowNodeType = 'input' | 'router' | 'routine' | 'step' | 'output';

export interface RouterOutput {
  id: string;
  label: string;
  color: string;
}

export interface FlowNodeData {
  nodeType: FlowNodeType;
  routineName?: string;
  stepCount?: number;
  isMain?: boolean;
  stepType?: StepType;
  label: string;
  icon: string;
  description: string;
  color: string;
  routerOutputs?: RouterOutput[];  // For router node - list of outputs
  [key: string]: unknown;
}

export interface FlowConversionResult {
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
}

/**
 * Apply dagre layout to nodes and edges
 */
function getLayoutedElements(
  nodes: Node<FlowNodeData>[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'LR'
): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

  g.setGraph({
    rankdir: direction,
    nodesep: 60,      // Horizontal spacing between nodes
    ranksep: 80,      // Vertical spacing between ranks
    edgesep: 20,
    marginx: 20,
    marginy: 20,
  });

  // Add nodes to dagre graph (router gets dynamic size based on outputs)
  nodes.forEach((node) => {
    let width = NODE_WIDTH;
    let height = NODE_HEIGHT;
    if (node.data.nodeType === 'router' && node.data.routerOutputs) {
      width = ROUTER_WIDTH;
      height = ROUTER_HEADER_HEIGHT + node.data.routerOutputs.length * ROUTER_ROW_HEIGHT + 8;
    }
    g.setNode(node.id, { width, height });
  });

  // Add edges to dagre graph
  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  // Run layout
  dagre.layout(g);

  // Apply layout positions to nodes
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = g.node(node.id);
    // Get actual dimensions for this node (router may be larger)
    let nodeWidth = NODE_WIDTH;
    let nodeHeight = NODE_HEIGHT;
    if (node.data.nodeType === 'router' && node.data.routerOutputs) {
      nodeWidth = ROUTER_WIDTH;
      nodeHeight = ROUTER_HEADER_HEIGHT + node.data.routerOutputs.length * ROUTER_ROW_HEIGHT + 8;
    }
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

/**
 * Convert multiple routines to a hierarchical React Flow diagram
 * Layout: Input → Router → Routines → Steps (using dagre)
 */
export function routinesToFlow(routines: Routine[]): FlowConversionResult {
  const nodes: Node<FlowNodeData>[] = [];
  const edges: Edge[] = [];

  if (routines.length === 0) {
    return { nodes, edges };
  }

  // 1. Create Input node
  nodes.push({
    id: 'input',
    type: 'flowNode',
    position: { x: 0, y: 0 }, // Will be set by dagre
    data: {
      nodeType: 'input',
      label: 'Input',
      icon: '📥',
      description: 'User message',
      color: '#22c55e',
    },
  });

  // 2. Build router outputs from routines
  const routerOutputs: RouterOutput[] = routines.map((routine) => {
    const triggerLabel = routine.trigger
      ? (routine.trigger.length > 35 ? routine.trigger.slice(0, 32) + '...' : routine.trigger)
      : (routine.isMain ? 'default' : routine.name);
    return {
      id: `routine-${routine.id}`,
      label: triggerLabel,
      color: routine.isMain ? '#00d4ff' : '#64748b',
    };
  });

  // 2. Create Router node with outputs
  nodes.push({
    id: 'router',
    type: 'flowNode',
    position: { x: 0, y: 0 },
    data: {
      nodeType: 'router',
      label: 'Router',
      icon: '🔀',
      description: `${routines.length} routine${routines.length !== 1 ? 's' : ''}`,
      color: '#f59e0b',
      routerOutputs,
    },
  });

  // Edge: Input → Router
  edges.push({
    id: 'e-input-router',
    source: 'input',
    target: 'router',
    type: 'smoothstep',
  });

  // 3. Create routine and step nodes
  const lastStepIds: string[] = []; // Track last step of each routine for output edges

  routines.forEach((routine) => {
    const routineId = `routine-${routine.id}`;
    const stepCount = routine.steps.length;

    // Create routine node
    nodes.push({
      id: routineId,
      type: 'flowNode',
      position: { x: 0, y: 0 },
      data: {
        nodeType: 'routine',
        routineName: routine.name,
        stepCount,
        isMain: routine.isMain,
        label: routine.name,
        icon: routine.isMain ? '★' : '◇',
        description: `${stepCount} step${stepCount !== 1 ? 's' : ''}`,
        color: routine.isMain ? '#00d4ff' : '#64748b',
      },
    });

    // Edge: Router → Routine (using specific sourceHandle)
    edges.push({
      id: `e-router-${routineId}`,
      source: 'router',
      sourceHandle: `out-${routineId}`,
      target: routineId,
      type: 'smoothstep',
    });

    // Create step nodes
    routine.steps.forEach((step, stepIndex) => {
      const stepId = `${routineId}-step-${step.id}`;

      nodes.push({
        id: stepId,
        type: 'flowNode',
        position: { x: 0, y: 0 },
        data: {
          nodeType: 'step',
          stepType: step.type,
          label: STEP_LABELS[step.type],
          icon: STEP_ICONS[step.type],
          description: step.description || STEP_LABELS[step.type],
          color: STEP_COLORS[step.type],
        },
      });

      // Edge: Routine → first step, or step → step
      if (stepIndex === 0) {
        edges.push({
          id: `e-${routineId}-${stepId}`,
          source: routineId,
          target: stepId,
          type: 'smoothstep',
        });
      } else {
        const prevStepId = `${routineId}-step-${routine.steps[stepIndex - 1].id}`;
        edges.push({
          id: `e-${prevStepId}-${stepId}`,
          source: prevStepId,
          target: stepId,
          type: 'smoothstep',
        });
      }

      // Track the last step for output edge
      if (stepIndex === routine.steps.length - 1) {
        lastStepIds.push(stepId);
      }
    });

    // If routine has no steps, connect routine directly to output
    if (routine.steps.length === 0) {
      lastStepIds.push(routineId);
    }
  });

  // 4. Create Output node
  nodes.push({
    id: 'output',
    type: 'flowNode',
    position: { x: 0, y: 0 },
    data: {
      nodeType: 'output',
      label: 'Output',
      icon: '📤',
      description: 'Response',
      color: '#22c55e',
    },
  });

  // 5. Edges: Last steps → Output
  lastStepIds.forEach((lastStepId) => {
    edges.push({
      id: `e-${lastStepId}-output`,
      source: lastStepId,
      target: 'output',
      type: 'smoothstep',
    });
  });

  // Apply dagre layout
  return getLayoutedElements(nodes, edges, 'LR');
}

/**
 * Convert a single routine to React Flow nodes and edges
 */
export function routineToFlow(routine: Routine): FlowConversionResult {
  return routinesToFlow([routine]);
}
