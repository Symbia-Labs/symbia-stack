/**
 * Registry Service
 *
 * Manages network node registration, contracts, and bridges.
 * This is the local directory that nodes use to discover each other.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  NetworkNode,
  NodeContract,
  NetworkBridge,
  NetworkTopology,
} from '../types.js';
import { config } from '../config.js';
import { telemetry, NetworkEvents, NetworkMetrics } from '../telemetry.js';

// In-memory storage (MVP - could be backed by DB later)
const nodes = new Map<string, NetworkNode>();
const contracts = new Map<string, NodeContract>();
const bridges = new Map<string, NetworkBridge>();

/**
 * Register a new node in the network
 */
export function registerNode(
  id: string,
  name: string,
  type: NetworkNode['type'],
  capabilities: string[],
  endpoint: string,
  socketId?: string,
  metadata?: Record<string, unknown>
): NetworkNode {
  const now = new Date().toISOString();
  const isUpdate = nodes.has(id);
  const node: NetworkNode = {
    id,
    name,
    type,
    capabilities,
    endpoint,
    socketId,
    registeredAt: now,
    lastHeartbeat: now,
    metadata,
  };
  nodes.set(id, node);

  // Record telemetry
  const labels = { nodeId: id, nodeType: type, nodeName: name };
  telemetry.event(
    NetworkEvents.NODE_REGISTERED,
    `Node ${isUpdate ? 're-' : ''}registered: ${name} (${id})`,
    { ...labels, capabilities, endpoint, isUpdate }
  );
  telemetry.metric(NetworkMetrics.NODE_REGISTERED, 1, labels);
  telemetry.metric(NetworkMetrics.NODE_ACTIVE_COUNT, nodes.size);

  // Auto-create standard service contracts for known communication patterns
  if (!isUpdate && type === 'service') {
    createDefaultServiceContracts(id);
  }

  return node;
}

/**
 * Create default contracts for standard service-to-service communication patterns.
 * This ensures services can communicate via SDN without manual contract setup.
 */
function createDefaultServiceContracts(nodeId: string): void {
  // Known service communication patterns
  // Note: ServiceId values are just the service name (e.g., "messaging", "assistants")
  const SERVICE_CONTRACTS: Array<{
    from: string;
    to: string;
    eventTypes: string[];
  }> = [
    // Messaging → Assistants: message notifications
    {
      from: 'messaging',
      to: 'assistants',
      eventTypes: ['message.new', 'message.*'],
    },
    // Assistants → Messaging: assistant responses
    {
      from: 'assistants',
      to: 'messaging',
      eventTypes: ['message.response', 'assistant.action.respond', 'assistant.*'],
    },
    // Assistants → Network: justification events (broadcast)
    {
      from: 'assistants',
      to: '*', // Wildcard - all nodes can receive
      eventTypes: ['assistant.intent.claim', 'assistant.intent.defer', 'assistant.action.observe'],
    },
  ];

  for (const pattern of SERVICE_CONTRACTS) {
    // Check if this node is the 'from' in the pattern
    if (pattern.from === nodeId) {
      // Check if contract already exists
      const existing = getContract(pattern.from, pattern.to);
      if (!existing) {
        const contract = createContractInternal(
          pattern.from,
          pattern.to,
          pattern.eventTypes,
          ['intra', 'inter']
        );
        if (contract) {
          console.log(`[Registry] Auto-created contract: ${pattern.from} → ${pattern.to} for [${pattern.eventTypes.join(', ')}]`);
        }
      }
    }
    // Check if this node is the 'to' in the pattern (and 'from' already exists)
    if (pattern.to === nodeId && nodes.has(pattern.from)) {
      const existing = getContract(pattern.from, pattern.to);
      if (!existing) {
        const contract = createContractInternal(
          pattern.from,
          pattern.to,
          pattern.eventTypes,
          ['intra', 'inter']
        );
        if (contract) {
          console.log(`[Registry] Auto-created contract: ${pattern.from} → ${pattern.to} for [${pattern.eventTypes.join(', ')}]`);
        }
      }
    }
  }
}

/**
 * Internal contract creation that doesn't require target to exist.
 * Used for auto-contract creation.
 */
function createContractInternal(
  from: string,
  to: string,
  allowedEventTypes: string[],
  boundaries: NodeContract['boundaries'],
  expiresAt?: string
): NodeContract | null {
  const contract: NodeContract = {
    id: uuidv4(),
    from,
    to,
    allowedEventTypes,
    boundaries,
    createdAt: new Date().toISOString(),
    expiresAt,
  };
  contracts.set(contract.id, contract);

  const fromNode = nodes.get(from);
  const toNode = nodes.get(to);
  const labels = {
    contractId: contract.id,
    from,
    to,
    fromType: fromNode?.type,
    toType: toNode?.type || 'pending',
  };
  telemetry.event(
    NetworkEvents.CONTRACT_CREATED,
    `Contract created: ${from} → ${to}`,
    { ...labels, allowedEventTypes, boundaries, expiresAt, auto: true }
  );
  telemetry.metric(NetworkMetrics.CONTRACT_CREATED, 1, labels);
  telemetry.metric(NetworkMetrics.CONTRACT_ACTIVE_COUNT, contracts.size);

  return contract;
}

/**
 * Update node heartbeat
 */
export function heartbeat(nodeId: string): boolean {
  const node = nodes.get(nodeId);
  if (!node) return false;
  node.lastHeartbeat = new Date().toISOString();

  telemetry.metric(NetworkMetrics.NODE_HEARTBEAT, 1, {
    nodeId,
    nodeType: node.type,
    nodeName: node.name,
  });

  return true;
}

/**
 * Update node socket connection
 */
export function updateNodeSocket(nodeId: string, socketId: string | undefined): boolean {
  const node = nodes.get(nodeId);
  if (!node) return false;
  node.socketId = socketId;
  return true;
}

/**
 * Unregister a node
 */
export function unregisterNode(nodeId: string): boolean {
  const node = nodes.get(nodeId);

  // Remove entity binding if present
  let unboundEntityId: string | undefined;
  if (node?.entityId) {
    unboundEntityId = node.entityId;
    entityToNode.delete(node.entityId);
  }

  // Remove any contracts involving this node
  let contractsRemoved = 0;
  for (const [id, contract] of contracts) {
    if (contract.from === nodeId || contract.to === nodeId) {
      contracts.delete(id);
      contractsRemoved++;
    }
  }

  const deleted = nodes.delete(nodeId);

  if (deleted && node) {
    const labels = { nodeId, nodeType: node.type, nodeName: node.name };
    telemetry.event(
      NetworkEvents.NODE_UNREGISTERED,
      `Node unregistered: ${node.name} (${nodeId})`,
      { ...labels, contractsRemoved, unboundEntityId }
    );
    telemetry.metric(NetworkMetrics.NODE_UNREGISTERED, 1, labels);
    telemetry.metric(NetworkMetrics.NODE_ACTIVE_COUNT, nodes.size);

    if (contractsRemoved > 0) {
      telemetry.metric(NetworkMetrics.CONTRACT_DELETED, contractsRemoved, { reason: 'node_unregistered' });
    }
  }

  return deleted;
}

/**
 * Get a node by ID
 */
export function getNode(nodeId: string): NetworkNode | undefined {
  return nodes.get(nodeId);
}

/**
 * Get all registered nodes
 */
export function getAllNodes(): NetworkNode[] {
  return Array.from(nodes.values());
}

/**
 * Find nodes by capability
 */
export function findNodesByCapability(capability: string): NetworkNode[] {
  return Array.from(nodes.values()).filter((node) =>
    node.capabilities.includes(capability)
  );
}

/**
 * Find nodes by type
 */
export function findNodesByType(type: NetworkNode['type']): NetworkNode[] {
  return Array.from(nodes.values()).filter((node) => node.type === type);
}

// ===========================================================================
// Entity Binding
// ===========================================================================

// Reverse index: entityId → nodeId (for efficient lookups)
const entityToNode = new Map<string, string>();

/**
 * Bind an entity UUID to a network node.
 * An entity represents a persistent identity (user, assistant, service) in the Entity Directory.
 * A node represents an ephemeral network connection.
 *
 * @param nodeId - The network node ID to bind to
 * @param entityId - The entity UUID (ent_xxx format) from Identity service
 * @returns true if binding succeeded, false if node not found
 */
export function bindEntityToNode(nodeId: string, entityId: string): boolean {
  const node = nodes.get(nodeId);
  if (!node) return false;

  // If entity was bound to another node, clear that binding
  const previousNodeId = entityToNode.get(entityId);
  if (previousNodeId && previousNodeId !== nodeId) {
    const previousNode = nodes.get(previousNodeId);
    if (previousNode) {
      previousNode.entityId = undefined;
      previousNode.entityBoundAt = undefined;
    }
  }

  // Bind entity to this node
  const now = new Date().toISOString();
  node.entityId = entityId;
  node.entityBoundAt = now;
  entityToNode.set(entityId, nodeId);

  telemetry.event(
    NetworkEvents.NODE_REGISTERED, // Reuse for now, could add ENTITY_BOUND event
    `Entity bound to node: ${entityId} → ${nodeId}`,
    { nodeId, entityId, nodeType: node.type, nodeName: node.name }
  );

  return true;
}

/**
 * Unbind an entity from a network node.
 * Called when a node disconnects or entity needs to be reassigned.
 *
 * @param nodeId - The network node ID to unbind from
 * @returns The entity ID that was unbound, or undefined if none
 */
export function unbindEntityFromNode(nodeId: string): string | undefined {
  const node = nodes.get(nodeId);
  if (!node || !node.entityId) return undefined;

  const entityId = node.entityId;

  // Clear the binding
  entityToNode.delete(entityId);
  node.entityId = undefined;
  node.entityBoundAt = undefined;

  telemetry.event(
    NetworkEvents.NODE_UNREGISTERED, // Reuse for now, could add ENTITY_UNBOUND event
    `Entity unbound from node: ${entityId} ← ${nodeId}`,
    { nodeId, entityId, nodeType: node.type, nodeName: node.name }
  );

  return entityId;
}

/**
 * Get the network node bound to an entity UUID.
 * Used for routing messages to a specific entity.
 *
 * @param entityId - The entity UUID (ent_xxx format)
 * @returns The bound network node, or undefined if not bound
 */
export function getNodeByEntityId(entityId: string): NetworkNode | undefined {
  const nodeId = entityToNode.get(entityId);
  if (!nodeId) return undefined;
  return nodes.get(nodeId);
}

/**
 * Find all nodes bound to entities of a specific type.
 * Useful for broadcasting to all users, all assistants, etc.
 *
 * @param entityType - Entity type prefix to match (e.g., 'ent_user', 'ent_assistant')
 * @returns Array of nodes with matching entity bindings
 */
export function findNodesByEntityType(entityType: string): NetworkNode[] {
  return Array.from(nodes.values()).filter(
    (node) => node.entityId && node.entityId.startsWith(entityType)
  );
}

/**
 * Get the entity ID bound to a node.
 *
 * @param nodeId - The network node ID
 * @returns The bound entity ID, or undefined if none
 */
export function getEntityIdForNode(nodeId: string): string | undefined {
  const node = nodes.get(nodeId);
  return node?.entityId;
}

// ===========================================================================
// Contracts
// ===========================================================================

/**
 * Create a contract between two nodes.
 * Note: Contracts can be created even if the target node doesn't exist yet.
 * This allows services to pre-register expected communication patterns.
 */
export function createContract(
  from: string,
  to: string,
  allowedEventTypes: string[],
  boundaries: NodeContract['boundaries'],
  expiresAt?: string
): NodeContract | null {
  // Source node must exist
  if (!nodes.has(from)) {
    return null;
  }
  // Target node doesn't need to exist yet - contracts can be pre-registered

  const contract: NodeContract = {
    id: uuidv4(),
    from,
    to,
    allowedEventTypes,
    boundaries,
    createdAt: new Date().toISOString(),
    expiresAt,
  };
  contracts.set(contract.id, contract);

  const fromNode = nodes.get(from);
  const toNode = nodes.get(to);
  const labels = {
    contractId: contract.id,
    from,
    to,
    fromType: fromNode?.type,
    toType: toNode?.type,
  };
  telemetry.event(
    NetworkEvents.CONTRACT_CREATED,
    `Contract created: ${from} → ${to}`,
    { ...labels, allowedEventTypes, boundaries, expiresAt }
  );
  telemetry.metric(NetworkMetrics.CONTRACT_CREATED, 1, labels);
  telemetry.metric(NetworkMetrics.CONTRACT_ACTIVE_COUNT, contracts.size);

  return contract;
}

/**
 * Get contract between two nodes
 */
export function getContract(from: string, to: string): NodeContract | undefined {
  return Array.from(contracts.values()).find(
    (c) => c.from === from && c.to === to
  );
}

/**
 * Get all contracts for a node
 */
export function getContractsForNode(nodeId: string): NodeContract[] {
  return Array.from(contracts.values()).filter(
    (c) => c.from === nodeId || c.to === nodeId
  );
}

/**
 * Delete a contract
 */
export function deleteContract(contractId: string): boolean {
  const contract = contracts.get(contractId);
  const deleted = contracts.delete(contractId);

  if (deleted && contract) {
    telemetry.event(
      NetworkEvents.CONTRACT_DELETED,
      `Contract deleted: ${contract.from} → ${contract.to}`,
      { contractId, from: contract.from, to: contract.to }
    );
    telemetry.metric(NetworkMetrics.CONTRACT_DELETED, 1, { contractId, from: contract.from, to: contract.to });
    telemetry.metric(NetworkMetrics.CONTRACT_ACTIVE_COUNT, contracts.size);
  }

  return deleted;
}

/**
 * Register a bridge to external systems
 */
export function registerBridge(
  name: string,
  type: NetworkBridge['type'],
  endpoint: string,
  eventTypes: string[],
  bridgeConfig?: Record<string, unknown>
): NetworkBridge {
  const bridge: NetworkBridge = {
    id: uuidv4(),
    name,
    type,
    endpoint,
    eventTypes,
    active: true,
    config: bridgeConfig,
    createdAt: new Date().toISOString(),
  };
  bridges.set(bridge.id, bridge);

  const labels = { bridgeId: bridge.id, bridgeName: name, bridgeType: type };
  telemetry.event(
    NetworkEvents.BRIDGE_REGISTERED,
    `Bridge registered: ${name} (${type})`,
    { ...labels, endpoint, eventTypes }
  );
  telemetry.metric(NetworkMetrics.BRIDGE_REGISTERED, 1, labels);
  telemetry.metric(NetworkMetrics.BRIDGE_ACTIVE_COUNT, bridges.size);

  return bridge;
}

/**
 * Get a bridge by ID
 */
export function getBridge(bridgeId: string): NetworkBridge | undefined {
  return bridges.get(bridgeId);
}

/**
 * Get all bridges
 */
export function getAllBridges(): NetworkBridge[] {
  return Array.from(bridges.values());
}

/**
 * Set bridge active status
 */
export function setBridgeActive(bridgeId: string, active: boolean): boolean {
  const bridge = bridges.get(bridgeId);
  if (!bridge) return false;

  const wasActive = bridge.active;
  bridge.active = active;

  if (wasActive !== active) {
    telemetry.event(
      NetworkEvents.BRIDGE_STATUS_CHANGED,
      `Bridge ${active ? 'activated' : 'deactivated'}: ${bridge.name}`,
      { bridgeId, bridgeName: bridge.name, bridgeType: bridge.type, active, previousActive: wasActive }
    );
  }

  return true;
}

/**
 * Delete a bridge
 */
export function deleteBridge(bridgeId: string): boolean {
  const bridge = bridges.get(bridgeId);
  const deleted = bridges.delete(bridgeId);

  if (deleted && bridge) {
    telemetry.event(
      NetworkEvents.BRIDGE_DELETED,
      `Bridge deleted: ${bridge.name}`,
      { bridgeId, bridgeName: bridge.name, bridgeType: bridge.type }
    );
    telemetry.metric(NetworkMetrics.BRIDGE_DELETED, 1, { bridgeId, bridgeName: bridge.name, bridgeType: bridge.type });
    telemetry.metric(NetworkMetrics.BRIDGE_ACTIVE_COUNT, bridges.size);
  }

  return deleted;
}

/**
 * Find bridges that handle a specific event type
 */
export function findBridgesForEventType(eventType: string): NetworkBridge[] {
  return Array.from(bridges.values()).filter(
    (b) => b.active && b.eventTypes.includes(eventType)
  );
}

/**
 * Get full network topology snapshot
 */
export function getTopology(): NetworkTopology {
  return {
    nodes: getAllNodes(),
    contracts: Array.from(contracts.values()),
    bridges: getAllBridges(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Clean up stale nodes (no heartbeat within timeout)
 */
export function cleanupStaleNodes(): string[] {
  const now = Date.now();
  const staleIds: string[] = [];

  for (const [id, node] of nodes) {
    const lastHeartbeat = new Date(node.lastHeartbeat).getTime();
    if (now - lastHeartbeat > config.nodeTimeoutMs) {
      staleIds.push(id);
    }
  }

  for (const id of staleIds) {
    unregisterNode(id);
  }

  return staleIds;
}

/**
 * Clean up expired contracts
 */
export function cleanupExpiredContracts(): string[] {
  const now = new Date().toISOString();
  const expiredIds: string[] = [];

  for (const [id, contract] of contracts) {
    if (contract.expiresAt && contract.expiresAt < now) {
      expiredIds.push(id);
    }
  }

  for (const id of expiredIds) {
    contracts.delete(id);
  }

  return expiredIds;
}
