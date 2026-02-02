/**
 * Execution Types
 *
 * Types for graph execution state.
 *
 * NOTE: This file has been simplified. The runtime service requires
 * a complete rework to implement a new execution model.
 */

export type ExecutionState =
  | 'pending'
  | 'initializing'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ExecutionMetrics {
  messagesProcessed: number;
  messagesEmitted: number;
  nodeInvocations: number;
  componentInvocations: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
  errorCount: number;
  backpressureEvents: number;
  startTime: number;
  lastActivityTime: number;
}

export interface NodeInstance {
  id: string;
  componentId: string;
  state: ExecutionState;
  metrics: {
    invocations: number;
    totalLatencyMs: number;
    avgLatencyMs: number;
    errorCount: number;
  };
}

export interface GraphExecution {
  id: string;
  graphId: string;
  state: ExecutionState;
  instances: Map<string, NodeInstance>;
  metrics: ExecutionMetrics;
  error?: {
    message: string;
    nodeId?: string;
    stack?: string;
  };
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

export interface PortMessage {
  id: string;
  executionId: string;
  sourceNodeId: string;
  sourcePort: string;
  targetNodeId: string;
  targetPort: string;
  value: unknown;
  timestamp: number;
  sequence: number;
}
