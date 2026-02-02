/**
 * Graph Executor
 *
 * Manages the execution of Symbia Script graphs.
 *
 * NOTE: This module has been simplified. The runtime service requires
 * a complete rework to implement a new execution model. Currently only
 * graph loading and validation work; execution is stubbed.
 */

import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'events';
import type {
  GraphDefinition,
  LoadedGraph,
  GraphExecution,
  ExecutionMetrics,
  PortMessage,
} from '../types/index.js';
import { config } from '../config.js';

export interface GraphExecutorConfig {
  maxConcurrentExecutions?: number;
  defaultTimeout?: number;
  maxBackpressureQueue?: number;
  enableMetrics?: boolean;
}

export interface ExecutorEvents {
  'execution:started': (execution: GraphExecution) => void;
  'execution:paused': (execution: GraphExecution) => void;
  'execution:resumed': (execution: GraphExecution) => void;
  'execution:completed': (execution: GraphExecution) => void;
  'execution:failed': (execution: GraphExecution, error: Error) => void;
  'port:emit': (message: PortMessage) => void;
  'metrics:update': (executionId: string, metrics: ExecutionMetrics) => void;
}

/**
 * Graph Executor
 *
 * NOTE: Execution functionality is currently stubbed pending runtime rework.
 */
export class GraphExecutor extends EventEmitter {
  private loadedGraphs = new Map<string, LoadedGraph>();
  private executions = new Map<string, GraphExecution>();
  private config: Required<GraphExecutorConfig>;

  constructor(executorConfig: GraphExecutorConfig = {}) {
    super();
    this.config = {
      maxConcurrentExecutions: executorConfig.maxConcurrentExecutions ?? config.runtime.maxConcurrentExecutions,
      defaultTimeout: executorConfig.defaultTimeout ?? config.runtime.defaultExecutionTimeout,
      maxBackpressureQueue: executorConfig.maxBackpressureQueue ?? config.runtime.maxBackpressureQueue,
      enableMetrics: executorConfig.enableMetrics ?? config.runtime.enableMetrics,
    };
  }

  /**
   * Load a graph definition
   */
  async loadGraph(definition: GraphDefinition): Promise<LoadedGraph> {
    const graphId = uuid();

    // Validate graph
    this.validateGraph(definition);

    // Build topology
    const topology = this.buildTopology(definition);

    const loadedGraph: LoadedGraph = {
      id: graphId,
      definition,
      topology,
      loadedAt: new Date(),
    };

    this.loadedGraphs.set(graphId, loadedGraph);
    console.log(`[GraphExecutor] Loaded graph: ${definition.name} (${graphId})`);

    return loadedGraph;
  }

  /**
   * Unload a graph
   */
  async unloadGraph(graphId: string): Promise<void> {
    // Stop any running executions for this graph
    for (const execution of this.executions.values()) {
      if (execution.graphId === graphId) {
        await this.stopExecution(execution.id);
      }
    }

    this.loadedGraphs.delete(graphId);
    console.log(`[GraphExecutor] Unloaded graph: ${graphId}`);
  }

  /**
   * Get a loaded graph
   */
  getGraph(graphId: string): LoadedGraph | undefined {
    return this.loadedGraphs.get(graphId);
  }

  /**
   * Start executing a graph
   *
   * NOTE: Currently stubbed - returns execution object but no actual processing occurs.
   */
  async startExecution(graphId: string): Promise<GraphExecution> {
    const graph = this.loadedGraphs.get(graphId);
    if (!graph) {
      throw new Error(`Graph not found: ${graphId}`);
    }

    if (this.executions.size >= this.config.maxConcurrentExecutions) {
      throw new Error(`Maximum concurrent executions reached: ${this.config.maxConcurrentExecutions}`);
    }

    const executionId = uuid();
    const execution: GraphExecution = {
      id: executionId,
      graphId,
      state: 'running',
      instances: new Map(),
      metrics: {
        messagesProcessed: 0,
        messagesEmitted: 0,
        nodeInvocations: 0,
        componentInvocations: 0,
        totalLatencyMs: 0,
        avgLatencyMs: 0,
        maxLatencyMs: 0,
        errorCount: 0,
        backpressureEvents: 0,
        startTime: Date.now(),
        lastActivityTime: Date.now(),
      },
      startedAt: new Date(),
      createdAt: new Date(),
    };

    this.executions.set(executionId, execution);
    this.emit('execution:started', execution);
    console.log(`[GraphExecutor] Started execution: ${executionId} (NOTE: execution stubbed pending runtime rework)`);

    return execution;
  }

  /**
   * Inject a message into an execution
   *
   * NOTE: Currently stubbed - no actual message processing occurs.
   */
  async injectMessage(
    executionId: string,
    nodeId: string,
    port: string,
    _value: unknown
  ): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    if (execution.state !== 'running') {
      throw new Error(`Execution not running: ${executionId} (state: ${execution.state})`);
    }

    console.log(`[GraphExecutor] Message injected to ${nodeId}:${port} (NOTE: processing stubbed)`);
  }

  /**
   * Pause execution
   */
  async pauseExecution(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    if (execution.state !== 'running') {
      throw new Error(`Cannot pause: execution not running (state: ${execution.state})`);
    }

    execution.state = 'paused';
    this.emit('execution:paused', execution);
    console.log(`[GraphExecutor] Paused execution: ${executionId}`);
  }

  /**
   * Resume execution
   */
  async resumeExecution(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    if (execution.state !== 'paused') {
      throw new Error(`Cannot resume: execution not paused (state: ${execution.state})`);
    }

    execution.state = 'running';
    this.emit('execution:resumed', execution);
    console.log(`[GraphExecutor] Resumed execution: ${executionId}`);
  }

  /**
   * Stop execution
   */
  async stopExecution(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      return;
    }

    execution.state = 'cancelled';
    execution.completedAt = new Date();

    this.emit('execution:completed', execution);
    console.log(`[GraphExecutor] Stopped execution: ${executionId}`);
  }

  /**
   * Get execution status
   */
  getExecution(executionId: string): GraphExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * Get all executions
   */
  getAllExecutions(): GraphExecution[] {
    return Array.from(this.executions.values());
  }

  /**
   * Get executor stats
   */
  getStats(): {
    loadedGraphs: number;
    activeExecutions: number;
    totalMessagesProcessed: number;
  } {
    let totalMessagesProcessed = 0;
    for (const execution of this.executions.values()) {
      totalMessagesProcessed += execution.metrics.messagesProcessed;
    }

    return {
      loadedGraphs: this.loadedGraphs.size,
      activeExecutions: this.executions.size,
      totalMessagesProcessed,
    };
  }

  // Private methods

  private validateGraph(definition: GraphDefinition): void {
    if (!definition.symbia) {
      throw new Error('Graph missing symbia version');
    }
    if (!definition.name) {
      throw new Error('Graph missing name');
    }
    if (!definition.nodes || !Array.isArray(definition.nodes)) {
      throw new Error('Graph missing nodes array');
    }
    if (!definition.edges || !Array.isArray(definition.edges)) {
      throw new Error('Graph missing edges array');
    }

    // Check for duplicate node IDs
    const nodeIds = new Set<string>();
    for (const node of definition.nodes) {
      if (!node.id) {
        throw new Error('Node missing id');
      }
      if (nodeIds.has(node.id)) {
        throw new Error(`Duplicate node id: ${node.id}`);
      }
      nodeIds.add(node.id);
    }

    // Validate edges reference valid nodes
    for (const edge of definition.edges) {
      if (!nodeIds.has(edge.source.node)) {
        throw new Error(`Edge references unknown source node: ${edge.source.node}`);
      }
      if (!nodeIds.has(edge.target.node)) {
        throw new Error(`Edge references unknown target node: ${edge.target.node}`);
      }
    }
  }

  private buildTopology(definition: GraphDefinition): LoadedGraph['topology'] {
    const nodeIds = definition.nodes.map(n => n.id);
    const adjacency = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    // Initialize
    for (const nodeId of nodeIds) {
      adjacency.set(nodeId, []);
      inDegree.set(nodeId, 0);
    }

    // Build adjacency list
    for (const edge of definition.edges) {
      adjacency.get(edge.source.node)!.push(edge.target.node);
      inDegree.set(edge.target.node, (inDegree.get(edge.target.node) || 0) + 1);
    }

    // Topological sort (Kahn's algorithm)
    const sorted: string[] = [];
    const queue: string[] = [];
    const levels = new Map<string, number>();

    // Find all nodes with no incoming edges (input nodes)
    const inputNodes: string[] = [];
    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(nodeId);
        inputNodes.push(nodeId);
        levels.set(nodeId, 0);
      }
    }

    while (queue.length > 0) {
      const node = queue.shift()!;
      sorted.push(node);

      for (const neighbor of adjacency.get(node) || []) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);

        if (newDegree === 0) {
          queue.push(neighbor);
          levels.set(neighbor, (levels.get(node) || 0) + 1);
        }
      }
    }

    // Check for cycles
    if (sorted.length !== nodeIds.length) {
      throw new Error('Graph contains cycles');
    }

    // Find output nodes (no outgoing edges)
    const outputNodes = nodeIds.filter(id => (adjacency.get(id) || []).length === 0);

    return {
      sorted,
      levels,
      inputNodes,
      outputNodes,
    };
  }
}
