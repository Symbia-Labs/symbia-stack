/**
 * Graph Editor Types
 *
 * Type definitions for the visual graph editor including nodes, edges,
 * and React Flow integration.
 */

import type { Node, Edge, XYPosition } from '@xyflow/react';

// Node types supported in the graph editor
export type GraphNodeType =
  | 'start'
  | 'prompt'
  | 'condition'
  | 'tool'
  | 'context'
  | 'wait'
  | 'parallel'
  | 'loop'
  | 'webhook'
  | 'transform'
  | 'end';

// Base data interface for all node types
export interface BaseNodeData {
  label: string;
  description?: string;
  [key: string]: unknown;
}

// Start node - entry point
export interface StartNodeData extends BaseNodeData {
  triggerType?: 'manual' | 'message' | 'event' | 'schedule';
  triggerConfig?: Record<string, unknown>;
}

// Prompt node - LLM invocation
export interface PromptNodeData extends BaseNodeData {
  systemPrompt?: string;
  promptTemplate: string;
  model?: string;
  provider?: string;
  temperature?: number;
  maxTokens?: number;
  outputVariable?: string;
}

// Condition node - branching
export interface ConditionNodeData extends BaseNodeData {
  conditions: Condition[];
  matchMode: 'all' | 'any';
}

export interface Condition {
  id: string;
  field: string;
  operator: ConditionOperator;
  value: string | number | boolean;
}

export type ConditionOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'matches'
  | 'in'
  | 'not_in'
  | 'exists'
  | 'not_exists';

export const CONDITION_OPERATORS: Record<ConditionOperator, {
  label: string;
  description: string;
}> = {
  eq: { label: 'equals', description: 'Field equals value' },
  neq: { label: 'not equals', description: 'Field does not equal value' },
  gt: { label: 'greater than', description: 'Field is greater than value' },
  gte: { label: 'greater or equal', description: 'Field is greater than or equal to value' },
  lt: { label: 'less than', description: 'Field is less than value' },
  lte: { label: 'less or equal', description: 'Field is less than or equal to value' },
  contains: { label: 'contains', description: 'Field contains value' },
  not_contains: { label: 'does not contain', description: 'Field does not contain value' },
  starts_with: { label: 'starts with', description: 'Field starts with value' },
  ends_with: { label: 'ends with', description: 'Field ends with value' },
  matches: { label: 'matches regex', description: 'Field matches regular expression' },
  in: { label: 'in list', description: 'Field is in comma-separated list' },
  not_in: { label: 'not in list', description: 'Field is not in comma-separated list' },
  exists: { label: 'exists', description: 'Field exists and is not null' },
  not_exists: { label: 'does not exist', description: 'Field does not exist or is null' },
};

// Tool node - service/webhook call
export interface ToolNodeData extends BaseNodeData {
  toolType: 'service' | 'webhook' | 'function';
  serviceName?: string;
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  bodyTemplate?: string;
  outputVariable?: string;
  timeout?: number;
}

// Context update node
export interface ContextUpdateNodeData extends BaseNodeData {
  operation: 'set' | 'merge' | 'delete';
  updates: Record<string, unknown>;
}

// Wait node - delay/timer
export interface WaitNodeData extends BaseNodeData {
  waitType: 'duration' | 'until' | 'event';
  durationMs?: number;
  untilCondition?: Condition;
  eventName?: string;
}

// Parallel node - parallel execution
export interface ParallelNodeData extends BaseNodeData {
  mode: 'all' | 'race' | 'any';
}

// Loop node - iteration
export interface LoopNodeData extends BaseNodeData {
  collection: string;
  itemVariable: string;
  indexVariable?: string;
  maxIterations?: number;
}

// Webhook node - external webhook call
export interface WebhookNodeData extends BaseNodeData {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  bodyTemplate?: string;
  outputVariable?: string;
}

// Transform node - data transformation
export interface TransformNodeData extends BaseNodeData {
  transformType: 'jq' | 'template' | 'code';
  expression: string;
  inputVariable?: string;
  outputVariable: string;
}

// End node - terminal
export interface EndNodeData extends BaseNodeData {
  status?: 'success' | 'failure' | 'cancelled';
  outputTemplate?: string;
}

// Union type for all node data
export type GraphNodeData =
  | StartNodeData
  | PromptNodeData
  | ConditionNodeData
  | ToolNodeData
  | ContextUpdateNodeData
  | WaitNodeData
  | ParallelNodeData
  | LoopNodeData
  | WebhookNodeData
  | TransformNodeData
  | EndNodeData;

// React Flow node with our custom data
export type GraphNode = Node<GraphNodeData, GraphNodeType>;

// React Flow edge
export type GraphEdge = Edge<{
  label?: string;
  condition?: string;
}>;

// Node type metadata for UI
export interface NodeTypeMeta {
  type: GraphNodeType;
  label: string;
  icon: string;
  color: string;
  description: string;
  defaultData: Partial<GraphNodeData>;
  inputHandles: number;
  outputHandles: number | 'dynamic';
}

export const NODE_TYPE_META: Record<GraphNodeType, NodeTypeMeta> = {
  start: {
    type: 'start',
    label: 'Start',
    icon: '▶',
    color: 'bg-emerald-500',
    description: 'Entry point for the graph',
    defaultData: { label: 'Start', triggerType: 'manual' },
    inputHandles: 0,
    outputHandles: 1,
  },
  prompt: {
    type: 'prompt',
    label: 'Prompt',
    icon: '💬',
    color: 'bg-scc-primary',
    description: 'Invoke an LLM with a prompt',
    defaultData: { label: 'Prompt', promptTemplate: '' },
    inputHandles: 1,
    outputHandles: 1,
  },
  condition: {
    type: 'condition',
    label: 'Condition',
    icon: '⑂',
    color: 'bg-amber-500',
    description: 'Branch based on conditions',
    defaultData: { label: 'Condition', conditions: [], matchMode: 'all' },
    inputHandles: 1,
    outputHandles: 2,
  },
  tool: {
    type: 'tool',
    label: 'Tool',
    icon: '🔧',
    color: 'bg-purple-500',
    description: 'Call a service or function',
    defaultData: { label: 'Tool Call', toolType: 'service' },
    inputHandles: 1,
    outputHandles: 1,
  },
  context: {
    type: 'context',
    label: 'Context',
    icon: '📝',
    color: 'bg-blue-500',
    description: 'Update execution context',
    defaultData: { label: 'Update Context', operation: 'merge', updates: {} },
    inputHandles: 1,
    outputHandles: 1,
  },
  wait: {
    type: 'wait',
    label: 'Wait',
    icon: '⏸',
    color: 'bg-slate-500',
    description: 'Wait for duration or event',
    defaultData: { label: 'Wait', waitType: 'duration', durationMs: 1000 },
    inputHandles: 1,
    outputHandles: 1,
  },
  parallel: {
    type: 'parallel',
    label: 'Parallel',
    icon: '⫸',
    color: 'bg-indigo-500',
    description: 'Execute branches in parallel',
    defaultData: { label: 'Parallel', mode: 'all' },
    inputHandles: 1,
    outputHandles: 'dynamic',
  },
  loop: {
    type: 'loop',
    label: 'Loop',
    icon: '↻',
    color: 'bg-teal-500',
    description: 'Iterate over a collection',
    defaultData: { label: 'Loop', collection: '', itemVariable: 'item' },
    inputHandles: 1,
    outputHandles: 1,
  },
  webhook: {
    type: 'webhook',
    label: 'Webhook',
    icon: '🌐',
    color: 'bg-orange-500',
    description: 'Call an external webhook',
    defaultData: { label: 'Webhook', url: '', method: 'POST' },
    inputHandles: 1,
    outputHandles: 1,
  },
  transform: {
    type: 'transform',
    label: 'Transform',
    icon: '🔄',
    color: 'bg-pink-500',
    description: 'Transform data',
    defaultData: { label: 'Transform', transformType: 'template', expression: '', outputVariable: 'result' },
    inputHandles: 1,
    outputHandles: 1,
  },
  end: {
    type: 'end',
    label: 'End',
    icon: '🔚',
    color: 'bg-red-500',
    description: 'Terminal node',
    defaultData: { label: 'End', status: 'success' },
    inputHandles: 1,
    outputHandles: 0,
  },
};

// Context field categories for the field picker
export interface ContextFieldCategory {
  id: string;
  label: string;
  icon: string;
  fields: ContextField[];
}

export interface ContextField {
  path: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
}

// Default context field categories (built-in)
export const DEFAULT_CONTEXT_CATEGORIES: ContextFieldCategory[] = [
  {
    id: 'user',
    label: 'User',
    icon: '👤',
    fields: [
      { path: 'user.id', label: 'User ID', type: 'string' },
      { path: 'user.email', label: 'Email', type: 'string' },
      { path: 'user.displayName', label: 'Display Name', type: 'string' },
      { path: 'user.metadata', label: 'User Metadata', type: 'object' },
    ],
  },
  {
    id: 'message',
    label: 'Message',
    icon: '💬',
    fields: [
      { path: 'message.content', label: 'Content', type: 'string' },
      { path: 'message.role', label: 'Role', type: 'string' },
      { path: 'message.metadata', label: 'Metadata', type: 'object' },
    ],
  },
  {
    id: 'conversation',
    label: 'Conversation',
    icon: '🔄',
    fields: [
      { path: 'conversation.id', label: 'Conversation ID', type: 'string' },
      { path: 'conversation.state', label: 'State', type: 'string' },
      { path: 'conversation.turnCount', label: 'Turn Count', type: 'number' },
    ],
  },
];

// Conversion utilities
export function graphJsonToReactFlow(
  graphJson: { components: Array<{ id: string; type: string; params: Record<string, unknown>; position?: { x: number; y: number } }>; edges: Array<{ from: string; to: string; sourceHandle?: string; targetHandle?: string }> }
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = graphJson.components.map((comp, index) => ({
    id: comp.id,
    type: comp.type as GraphNodeType,
    position: comp.position || { x: 100, y: index * 150 },
    data: {
      label: (comp.params.name as string) || comp.type,
      ...comp.params,
    } as GraphNodeData,
  }));

  const edges: GraphEdge[] = graphJson.edges.map((edge, index) => ({
    id: `e-${edge.from}-${edge.to}-${index}`,
    source: edge.from,
    target: edge.to,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
  }));

  return { nodes, edges };
}

export function reactFlowToGraphJson(
  nodes: GraphNode[],
  edges: GraphEdge[]
): { components: Array<{ id: string; type: string; params: Record<string, unknown>; position: { x: number; y: number } }>; edges: Array<{ from: string; to: string; sourceHandle?: string; targetHandle?: string }> } {
  const components = nodes.map((node) => ({
    id: node.id,
    type: node.type || 'start',
    params: {
      name: node.data.label,
      ...node.data,
    },
    position: node.position,
  }));

  const graphEdges = edges.map((edge) => ({
    from: edge.source,
    to: edge.target,
    sourceHandle: edge.sourceHandle || undefined,
    targetHandle: edge.targetHandle || undefined,
  }));

  return { components, edges: graphEdges };
}

// Generate unique node ID
export function generateNodeId(type: GraphNodeType): string {
  return `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Create a new node at a position
export function createNode(
  type: GraphNodeType,
  position: XYPosition,
  data?: Partial<GraphNodeData>
): GraphNode {
  const meta = NODE_TYPE_META[type];
  return {
    id: generateNodeId(type),
    type,
    position,
    data: {
      ...meta.defaultData,
      ...data,
    } as GraphNodeData,
  };
}
