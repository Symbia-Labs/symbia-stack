/**
 * Graph Executor
 *
 * Manages the execution of Symbia Script graphs.
 *
 * Execution is IMPLEMENTED (5 Aug 2026). Components return {port: value};
 * only emitted ports fire their edges, giving real branching. Values carry
 * lanes that only tighten. See ./components.ts for the registry.
 */

import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'events';
import type {
  GraphDefinition,
  LoadedGraph,
  GraphExecution,
  ExecutionMetrics,
  PortMessage,
  NodeInstance,
} from '../types/index.js';
import { config } from '../config.js';
import {
  getComponent,
  normaliseEmission,
  listComponents,
  type FlowValue,
} from './components.js';
import { clearExecutionState } from './components-state.js';
import { TIMER_COMPONENT } from './components-sources.js';
import './components-sinks.js'; // sink registration happens in index.ts with deps

export interface TraceEntry {
  node: string;
  port: string;
  lane: 'canonical' | 'apocryphal';
  ms: number;
  summary: string;
}

/**
 * How hard the executor enforces that a graph node's component is backed by a
 * registered catalog manifest.
 *
 * `strict` is the honest default: the platform's central claim is that no
 * capability enters without a recorded gate, and a mode that silently degrades
 * to "run it anyway" would be that claim without a mechanism again. When the
 * catalog is unreachable in strict mode, graph loads fail loudly rather than
 * quietly falling back to trusting the in-process registry.
 */
export type ManifestEnforcement = 'strict' | 'warn' | 'off';

export interface GraphExecutorConfig {
  maxConcurrentExecutions?: number;
  defaultTimeout?: number;
  maxBackpressureQueue?: number;
  enableMetrics?: boolean;
  /**
   * Returns the component keys the catalog currently manifests, or undefined
   * if that set is not known (catalog never reached, or reachable but not yet
   * synced). Undefined is distinct from empty: empty means the registry
   * genuinely has no components.
   */
  manifestResolver?: () => Set<string> | undefined;
  manifestEnforcement?: ManifestEnforcement;
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
 * Executes graphs by message passing over the topological order.
 */
export class GraphExecutor extends EventEmitter {
  private loadedGraphs = new Map<string, LoadedGraph>();
  private executions = new Map<string, GraphExecution>();
  private timers = new Map<string, ReturnType<typeof setInterval>[]>();
  private config: Required<GraphExecutorConfig>;

  /** Start intervals for every timer-source node of a running execution. */
  private startTimers(execution: GraphExecution, graph: LoadedGraph): void {
    const handles: ReturnType<typeof setInterval>[] = [];
    for (const node of graph.definition.nodes) {
      if (node.component !== TIMER_COMPONENT) continue;
      const cfg = (node.config ?? {}) as Record<string, unknown>;
      const intervalMs = Math.max(100, Number(cfg.intervalMs ?? 5000));
      let tick = 0;
      handles.push(setInterval(() => {
        const current = this.executions.get(execution.id);
        if (!current || current.state !== 'running') return;
        tick += 1;
        const payload = {
          tick,
          ts: new Date().toISOString(),
          ...((cfg.payload as Record<string, unknown>) ?? {}),
        };
        void this.runFlow(current, graph, node.id, 'in', {
          value: payload,
          lane: 'canonical',
        }).catch((err) => {
          console.error(`[GraphExecutor] timer flow failed (${node.id}):`, err);
        });
      }, intervalMs));
    }
    if (handles.length > 0) this.timers.set(execution.id, handles);
  }

  private clearTimers(executionId: string): void {
    for (const h of this.timers.get(executionId) ?? []) clearInterval(h);
    this.timers.delete(executionId);
  }

  constructor(executorConfig: GraphExecutorConfig = {}) {
    super();
    this.config = {
      maxConcurrentExecutions: executorConfig.maxConcurrentExecutions ?? config.runtime.maxConcurrentExecutions,
      defaultTimeout: executorConfig.defaultTimeout ?? config.runtime.defaultExecutionTimeout,
      maxBackpressureQueue: executorConfig.maxBackpressureQueue ?? config.runtime.maxBackpressureQueue,
      enableMetrics: executorConfig.enableMetrics ?? config.runtime.enableMetrics,
      manifestResolver: executorConfig.manifestResolver ?? (() => undefined),
      manifestEnforcement: executorConfig.manifestEnforcement ?? config.runtime.manifestEnforcement,
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
   * Get all loaded graphs
   */
  getAllGraphs(): LoadedGraph[] {
    return Array.from(this.loadedGraphs.values());
  }

  /**
   * Run one message through the graph from a starting node.
   *
   * The execution model the stub was pending. Semantics ported from the
   * reference implementation in symbia-workbench (graph.py), which has been
   * running this same schema against real traffic:
   *
   *   - a component returns {port: value}; ONLY emitted ports fire their
   *     outgoing edges, which is what makes branching real
   *   - nodes are visited in topological order, so a node sees every input
   *     that can reach it before it runs
   *   - every value carries a lane, and lanes only tighten (see components.ts)
   *   - terminal emissions (no outgoing edge for that port) become outputs
   *
   * Returns the collected outputs and a per-hop trace.
   */
  private async runFlow(
    execution: GraphExecution,
    graph: LoadedGraph,
    startNodeId: string,
    startPort: string,
    seed: FlowValue
  ): Promise<{ outputs: Record<string, FlowValue>; trace: TraceEntry[] }> {
    const def = graph.definition;
    const nodeById = new Map(def.nodes.map((n) => [n.id, n]));
    const edgesFrom = new Map<string, typeof def.edges>();
    for (const e of def.edges) {
      const key = `${e.source.node}:${e.source.port}`;
      if (!edgesFrom.has(key)) edgesFrom.set(key, []);
      edgesFrom.get(key)!.push(e);
    }

    const inbox = new Map<string, { port: string; msg: FlowValue }[]>();
    inbox.set(startNodeId, [{ port: startPort, msg: seed }]);

    const outputs: Record<string, FlowValue> = {};
    const trace: TraceEntry[] = [];
    const order = graph.topology.sorted;
    const startIdx = Math.max(0, order.indexOf(startNodeId));

    for (const nodeId of order.slice(startIdx)) {
      const pending = inbox.get(nodeId);
      if (!pending || pending.length === 0) continue; // branch not taken

      const node = nodeById.get(nodeId)!;
      const component = node.component ? getComponent(node.component) : undefined;

      for (const { msg } of pending) {
        const t0 = Date.now();
        execution.metrics.messagesProcessed++;
        execution.metrics.nodeInvocations++;

        let emitted: Record<string, FlowValue>;
        try {
          if (!component) {
            // An unregistered component must not silently pass data through:
            // that would let a graph appear to work while doing nothing.
            throw new Error(
              `component not registered: ${node.component ?? '(none)'}`
            );
          }
          execution.metrics.componentInvocations++;
          const raw = await component.handler(msg, {
            nodeId,
            executionId: execution.id,
            config: (node.config ?? {}) as Record<string, unknown>,
            log: (m) => trace.push({ node: nodeId, port: 'log', lane: msg.lane, ms: 0, summary: m }),
          });
          emitted = normaliseEmission(raw, msg, component.emitsApocryphal);
        } catch (err) {
          execution.metrics.errorCount++;
          emitted = {
            error: { value: { error: (err as Error).message }, lane: 'apocryphal' },
          };
        }

        const ms = Date.now() - t0;
        execution.metrics.totalLatencyMs += ms;
        execution.metrics.maxLatencyMs = Math.max(execution.metrics.maxLatencyMs, ms);

        const inst = execution.instances.get(nodeId);
        if (inst) {
          inst.metrics.invocations++;
          inst.metrics.totalLatencyMs += ms;
          inst.metrics.avgLatencyMs = inst.metrics.totalLatencyMs / inst.metrics.invocations;
        }

        for (const [port, outMsg] of Object.entries(emitted)) {
          trace.push({
            node: nodeId,
            port,
            lane: outMsg.lane,
            ms,
            summary: JSON.stringify(outMsg.value).slice(0, 160),
          });

          const targets = edgesFrom.get(`${nodeId}:${port}`) ?? [];
          if (targets.length === 0) {
            outputs[`${nodeId}:${port}`] = outMsg;
            continue;
          }
          for (const edge of targets) {
            const list = inbox.get(edge.target.node) ?? [];
            list.push({ port: edge.target.port, msg: outMsg });
            inbox.set(edge.target.node, list);
            execution.metrics.messagesEmitted++;

            this.emit('port:emit', {
              id: uuid(),
              executionId: execution.id,
              sourceNodeId: nodeId,
              sourcePort: port,
              targetNodeId: edge.target.node,
              targetPort: edge.target.port,
              value: outMsg.value,
              timestamp: Date.now(),
              sequence: execution.metrics.messagesEmitted,
            } as PortMessage);
          }
        }
      }
      inbox.set(nodeId, []);
    }

    execution.metrics.avgLatencyMs =
      execution.metrics.nodeInvocations > 0
        ? execution.metrics.totalLatencyMs / execution.metrics.nodeInvocations
        : 0;
    execution.metrics.lastActivityTime = Date.now();

    return { outputs, trace };
  }

  /**
   * Start executing a graph.
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
    const instances = new Map<string, NodeInstance>();
    for (const n of graph.definition.nodes) {
      instances.set(n.id, {
        id: n.id,
        componentId: n.component ?? '',
        state: 'running',
        metrics: { invocations: 0, totalLatencyMs: 0, avgLatencyMs: 0, errorCount: 0 },
      });
    }
    const execution: GraphExecution = {
      id: executionId,
      graphId,
      state: 'running',
      instances,
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
    this.startTimers(execution, graph);
    this.emit('execution:started', execution);
    console.log(`[GraphExecutor] Started execution: ${executionId} (${graph.definition.nodes.length} nodes)`);

    return execution;
  }

  /**
   * Inject a message into an execution — and actually process it.
   *
   * Previously this logged "(NOTE: processing stubbed)" and dropped the
   * message while returning success. That shape is worse than an error:
   * callers cannot distinguish work done from work discarded.
   */
  async injectMessage(
    executionId: string,
    nodeId: string,
    port: string,
    value: unknown
  ): Promise<{ outputs: Record<string, FlowValue>; trace: TraceEntry[] }> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }
    if (execution.state !== 'running') {
      throw new Error(`Execution not running: ${executionId} (state: ${execution.state})`);
    }
    const graph = this.loadedGraphs.get(execution.graphId);
    if (!graph) {
      throw new Error(`Graph not loaded: ${execution.graphId}`);
    }
    if (!graph.definition.nodes.some((n) => n.id === nodeId)) {
      throw new Error(`Node not in graph: ${nodeId}`);
    }

    const seed: FlowValue = { value, lane: 'canonical' };
    const result = await this.runFlow(execution, graph, nodeId, port, seed);

    if (this.config.enableMetrics) {
      this.emit('metrics:update', executionId, execution.metrics);
    }
    console.log(
      `[GraphExecutor] ${executionId}: ${result.trace.length} hops, ` +
      `${execution.metrics.nodeInvocations} invocations, ` +
      `${Object.keys(result.outputs).length} output(s)`
    );
    return result;
  }

  /** Components available to graphs. */
  listComponents() {
    return listComponents();
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
    this.clearTimers(executionId);
    clearExecutionState(executionId);

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

    this.resolveComponents(definition);
  }

  /**
   * Resolve every node's component against (a) the in-process implementation
   * registry and (b) the catalog's registered manifests.
   *
   * Both checks happen at LOAD time. Previously an unknown component was only
   * discovered when a message reached that node — a graph could sit "loaded"
   * and apparently healthy while containing a node that could never run. A
   * contract that is only checked on the happy path is not a contract.
   *
   * The manifest check is the Phase 1 edge: the catalog is the source of truth
   * for what a component *is*, and the runtime refuses to run a node whose
   * contract was never registered, even though the implementation happens to
   * be compiled into this very bundle.
   */
  private resolveComponents(definition: GraphDefinition): void {
    const missingImpl: string[] = [];
    for (const node of definition.nodes) {
      if (!node.component) {
        throw new Error(`Node "${node.id}" has no component`);
      }
      if (!getComponent(node.component)) {
        missingImpl.push(`${node.id} -> ${node.component}`);
      }
    }
    if (missingImpl.length > 0) {
      throw new Error(
        `Graph references components with no registered implementation: ${missingImpl.join(', ')}`
      );
    }

    const enforcement = this.config.manifestEnforcement;
    if (enforcement === 'off') return;

    const manifested = this.config.manifestResolver();
    if (manifested === undefined) {
      // The catalog was never reached, so we cannot tell a manifested
      // component from an unmanifested one. Guessing "allow" here is precisely
      // the failure mode Phase 1 exists to remove.
      const msg =
        'Component manifests unavailable (catalog not reached) — cannot verify graph components against the registry';
      if (enforcement === 'strict') {
        throw new Error(
          `${msg}. Set RUNTIME_MANIFEST_ENFORCEMENT=warn to load graphs against the in-process registry alone.`
        );
      }
      console.warn(`[GraphExecutor] ${msg} (enforcement=warn, loading anyway)`);
      return;
    }

    const unmanifested = definition.nodes
      .filter((n) => !manifested.has(n.component as string))
      .map((n) => `${n.id} -> ${n.component}`);
    if (unmanifested.length === 0) return;

    const msg = `Graph references components with no registered catalog manifest: ${unmanifested.join(', ')}`;
    if (enforcement === 'strict') throw new Error(msg);
    console.warn(`[GraphExecutor] ${msg} (enforcement=warn, loading anyway)`);
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
