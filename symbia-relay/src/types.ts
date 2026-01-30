/**
 * Relay Client Types
 *
 * Shared types for network communication.
 */

export interface EventPayload {
  type: string;
  data: unknown;
}

export interface EventWrapper {
  id: string;
  runId: string;
  timestamp: string;
  source: string;
  target?: string;
  causedBy?: string;
  path: string[];
  boundary: 'intra' | 'inter' | 'extra';
}

export interface SandboxEvent {
  payload: EventPayload;
  wrapper: EventWrapper;
  hash: string;
}

export interface EventTrace {
  eventId: string;
  runId: string;
  path: TraceHop[];
  totalDurationMs: number;
  status: 'delivered' | 'dropped' | 'pending' | 'error';
  error?: string;
}

export interface TraceHop {
  node: string;
  timestamp: string;
  durationMs: number;
  policyId?: string;
  action: 'forward' | 'deliver' | 'drop' | 'transform';
}

export interface NetworkNode {
  id: string;
  name: string;
  type: 'service' | 'assistant' | 'sandbox' | 'bridge';
  capabilities: string[];
  endpoint: string;
  socketId?: string;
  registeredAt: string;
  lastHeartbeat: string;
  metadata?: Record<string, unknown>;
}

export interface NodeContract {
  id: string;
  from: string;
  to: string;
  allowedEventTypes: string[];
  boundaries: ('intra' | 'inter' | 'extra')[];
  createdAt: string;
  expiresAt?: string;
}

export interface NetworkTopology {
  nodes: NetworkNode[];
  contracts: NodeContract[];
  bridges: NetworkBridge[];
  timestamp: string;
}

export interface NetworkBridge {
  id: string;
  name: string;
  type: 'webhook' | 'websocket' | 'grpc' | 'custom';
  endpoint: string;
  eventTypes: string[];
  active: boolean;
  config?: Record<string, unknown>;
  createdAt: string;
}

export interface RelayConfig {
  /** Network service URL (default: resolved via @symbia/sys) */
  networkUrl?: string;
  /** This node's ID */
  nodeId: string;
  /** Human-readable name */
  nodeName: string;
  /** Node type */
  nodeType: 'service' | 'assistant' | 'sandbox' | 'bridge';
  /** Capabilities this node provides */
  capabilities?: string[];
  /** Endpoint for HTTP delivery (optional if only using socket) */
  endpoint?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Heartbeat interval in ms (default: 30000) */
  heartbeatIntervalMs?: number;
  /** Authentication token (JWT) for agents - sent in socket handshake */
  authToken?: string;
}

// ============================================================================
// Agent-to-Agent Event Types
// ============================================================================

/** Standard agent event payload types */
export type AgentEventType =
  | 'agent.message'      // Direct message between agents
  | 'agent.request'      // Request expecting a response
  | 'agent.response'     // Response to a request
  | 'agent.error'        // Error response
  | 'agent.ack'          // Acknowledgment
  | 'agent.ping'         // Health check
  | 'agent.pong';        // Health check response

/** Agent message payload */
export interface AgentMessagePayload {
  type: AgentEventType;
  data: {
    /** Message content */
    content: unknown;
    /** Content type hint (json, text, binary) */
    contentType?: 'json' | 'text' | 'binary';
    /** For request/response correlation */
    correlationId?: string;
    /** Priority level */
    priority?: 'low' | 'normal' | 'high' | 'critical';
    /** TTL in milliseconds */
    ttlMs?: number;
    /** Additional metadata */
    metadata?: Record<string, unknown>;
  };
}

/** Agent principal info attached to authenticated connections */
export interface AgentPrincipal {
  id: string;           // Internal UUID
  agentId: string;      // e.g., "assistant:onboarding"
  name: string;
  orgId?: string;
  capabilities: string[];
}

export interface SendEventOptions {
  target?: string;
  causedBy?: string;
  boundary?: 'intra' | 'inter' | 'extra';
}

export interface WatchFilter {
  runId?: string;
  source?: string;
  eventType?: string;
}
