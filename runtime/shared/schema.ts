/**
 * Runtime Service Schema
 *
 * The runtime service primarily executes graphs and does not maintain its own database.
 * Graph definitions and run states are stored in the Assistants service.
 * This file provides shared type definitions for runtime execution.
 */

export interface ExecutionContext {
  runId: string;
  graphId: string;
  traceId?: string;
  orgId: string;
  userId?: string;
  variables: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ExecutionState {
  currentNodeId: string;
  nodeStates: Record<string, NodeState>;
  outputs: Record<string, unknown>;
  status: 'running' | 'paused' | 'waiting' | 'completed' | 'failed';
}

export interface NodeState {
  nodeId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  input?: unknown;
  output?: unknown;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface ExecutionEvent {
  type: 'node_start' | 'node_complete' | 'node_error' | 'run_complete' | 'run_error';
  runId: string;
  nodeId?: string;
  data?: unknown;
  timestamp: Date;
}
