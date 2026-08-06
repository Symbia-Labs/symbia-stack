/**
 * Symbia Script Graph Types
 *
 * These types mirror the Symbia Script specification for graph definitions.
 *
 * NOTE: Component types have been removed. The runtime service requires
 * a complete rework to implement a new execution model.
 */

export interface GraphNode {
  id: string;
  type?: string;
  component?: string;
  version?: string;
  config?: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface GraphEdge {
  id: string;
  source: {
    node: string;
    port: string;
  };
  target: {
    node: string;
    port: string;
  };
}

export interface NetworkBinding {
  input?: {
    network: string;
    node: string;
    port: string;
    protocol?: 'grpc' | 'http' | 'ws';
  };
  output?: {
    network: string;
    node: string;
    port: string;
    protocol?: 'grpc' | 'http' | 'ws';
  };
}

export interface GraphDefinition {
  symbia: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  bindings?: Record<string, Record<string, NetworkBinding>>;
  metadata?: Record<string, unknown>;
}

export interface LoadedGraph {
  id: string;
  definition: GraphDefinition;
  topology: {
    sorted: string[];
    levels: Map<string, number>;
    inputNodes: string[];
    outputNodes: string[];
  };
  loadedAt: Date;
  /**
   * Org that owns this graph, taken from its catalog resource. Values a graph
   * derives belong to whoever owns the graph, so sinks attribute their writes
   * to this org rather than to the runtime's own system identity (defect D6).
   * Undefined for graphs loaded ad hoc via POST /api/graphs, which have no
   * owning resource — those fall back to the system org.
   */
  orgId?: string;
  /**
   * Catalog resource key for hydrated graphs. This is the graph's stable
   * identity across restarts, and is what operator state is keyed on.
   */
  key?: string;
}
