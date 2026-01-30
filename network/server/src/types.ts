/**
 * Network Service Types
 *
 * Core primitives for the Symbia event routing system.
 * Based on the payload + wrapper + hash architecture.
 */

/**
 * The event payload - what happened
 */
export interface EventPayload {
  type: string;
  data: unknown;
}

/**
 * The event wrapper - routing and provenance metadata
 */
export interface EventWrapper {
  /** Unique event identifier */
  id: string;
  /** Workflow/sandbox run identifier */
  runId: string;
  /** When the event was created */
  timestamp: string;
  /** Source node that emitted the event */
  source: string;
  /** Target node (optional - for directed events) */
  target?: string;
  /** ID of the event that caused this one (for tracing) */
  causedBy?: string;
  /** Accumulated path of nodes this event has traversed */
  path: string[];
  /** Boundary type: intra (within sandbox), inter (between sandboxes), extra (external) */
  boundary: 'intra' | 'inter' | 'extra';

  // Entity-based addressing (optional - for UUID-to-UUID routing)
  /** Source entity UUID (ent_xxx format) - abstract identity */
  sourceEntityId?: string;
  /** Target entity UUID (ent_xxx format) - abstract identity */
  targetEntityId?: string;
}

/**
 * Complete sandbox event - the unified primitive
 */
export interface SandboxEvent {
  payload: EventPayload;
  wrapper: EventWrapper;
  /** Cryptographic hash representing the security policy commitment */
  hash: string;
}

/**
 * A registered node in the network
 */
export interface NetworkNode {
  /** Unique node identifier (typically service:instance format) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Node type */
  type: 'service' | 'assistant' | 'sandbox' | 'bridge' | 'client';
  /** Capabilities this node advertises */
  capabilities: string[];
  /** Endpoint for receiving events */
  endpoint: string;
  /** WebSocket connection ID if connected */
  socketId?: string;
  /** When the node registered */
  registeredAt: string;
  /** Last heartbeat timestamp */
  lastHeartbeat: string;
  /** Node metadata */
  metadata?: Record<string, unknown>;

  // Entity Directory integration
  /** Entity UUID from Identity service (ent_xxx format) */
  entityId?: string;
  /** When the entity was bound to this node */
  entityBoundAt?: string;
}

/**
 * A contract between two nodes defining what can be exchanged
 */
export interface NodeContract {
  id: string;
  /** Source node */
  from: string;
  /** Target node */
  to: string;
  /** Event types this contract allows */
  allowedEventTypes: string[];
  /** Boundary permissions */
  boundaries: ('intra' | 'inter' | 'extra')[];
  /** When the contract was established */
  createdAt: string;
  /** When the contract expires (optional) */
  expiresAt?: string;
}

/**
 * A bridge connecting to external systems
 */
export interface NetworkBridge {
  id: string;
  name: string;
  /** Bridge type */
  type: 'webhook' | 'websocket' | 'grpc' | 'custom';
  /** External endpoint */
  endpoint: string;
  /** Event types this bridge handles */
  eventTypes: string[];
  /** Is the bridge currently active */
  active: boolean;
  /** Bridge configuration */
  config?: Record<string, unknown>;
  createdAt: string;
}

/**
 * A routing policy that controls how events flow
 */
export interface RoutingPolicy {
  id: string;
  name: string;
  /** Policy priority (higher = evaluated first) */
  priority: number;
  /** Conditions that must match for this policy */
  conditions: PolicyCondition[];
  /** Action to take when conditions match */
  action: PolicyAction;
  /** Is the policy enabled */
  enabled: boolean;
  createdAt: string;
}

export interface PolicyCondition {
  field: 'source' | 'target' | 'eventType' | 'boundary' | 'runId';
  operator: 'eq' | 'neq' | 'contains' | 'startsWith' | 'regex';
  value: string;
}

export type PolicyAction =
  | { type: 'allow' }
  | { type: 'deny'; reason?: string }
  | { type: 'route'; to: string }
  | { type: 'transform'; mapping: Record<string, string> }
  | { type: 'log'; level: 'debug' | 'info' | 'warn' | 'error' };

/**
 * Event trace for debugging and observability
 */
export interface EventTrace {
  eventId: string;
  runId: string;
  /** Full path the event took */
  path: TraceHop[];
  /** Total time from start to completion */
  totalDurationMs: number;
  /** Final status */
  status: 'delivered' | 'dropped' | 'pending' | 'error';
  /** Error message if status is error */
  error?: string;
}

export interface TraceHop {
  node: string;
  timestamp: string;
  durationMs: number;
  /** Policy that was evaluated at this hop */
  policyId?: string;
  /** Action taken */
  action: 'forward' | 'deliver' | 'drop' | 'transform';
}

/**
 * Network topology snapshot for SoftSDN
 */
export interface NetworkTopology {
  /** All registered nodes */
  nodes: NetworkNode[];
  /** Active contracts between nodes */
  contracts: NodeContract[];
  /** Active bridges */
  bridges: NetworkBridge[];
  /** Timestamp of this snapshot */
  timestamp: string;
}

/**
 * SoftSDN watch subscription
 */
export interface WatchSubscription {
  id: string;
  /** Filter by run ID */
  runId?: string;
  /** Filter by source node */
  source?: string;
  /** Filter by event type */
  eventType?: string;
  /** Socket ID to send updates to */
  socketId: string;
  createdAt: string;
}

/**
 * Authenticated agent principal (from Identity service)
 */
export interface AgentPrincipal {
  /** Internal UUID from Identity */
  id: string;
  /** Agent identifier (e.g., "assistant:onboarding") */
  agentId: string;
  /** Human-readable name */
  name: string;
  /** Organization ID if scoped to an org */
  orgId?: string;
  /** Agent capabilities from Identity */
  capabilities: string[];
}

/**
 * Authenticated user principal (from Identity service)
 * Used for user-proxied clients like Mission Control
 */
export interface UserPrincipal {
  /** Internal UUID from Identity */
  id: string;
  /** User's email */
  email: string;
  /** Human-readable name */
  name: string;
  /** User's entitlements (cap:* permissions) */
  entitlements: string[];
  /** User's roles (role:* permissions) */
  roles: string[];
  /** Organizations the user belongs to */
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    role: 'admin' | 'member' | 'viewer';
  }>;
  /** Is this user a super admin */
  isSuperAdmin: boolean;
}

/**
 * Network-specific permission constants
 * These entitlements control access to Network Service operations
 */
export const NetworkPermissions = {
  // Read permissions
  TOPOLOGY_READ: 'cap:network.topology.read',
  EVENTS_READ: 'cap:network.events.read',
  TRACES_READ: 'cap:network.traces.read',
  POLICIES_READ: 'cap:network.policies.read',

  // Write permissions
  POLICIES_WRITE: 'cap:network.policies.write',
  CONTRACTS_WRITE: 'cap:network.contracts.write',

  // Admin permissions
  NODES_ADMIN: 'cap:network.nodes.admin',
} as const;

export type NetworkPermission = typeof NetworkPermissions[keyof typeof NetworkPermissions];
