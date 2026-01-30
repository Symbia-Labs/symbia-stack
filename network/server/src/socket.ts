/**
 * Socket Handler
 *
 * WebSocket handlers for real-time network communication.
 * Supports node connections, event streaming, and live SDN watch.
 *
 * Authentication:
 * - Agents must provide an auth token in the socket handshake
 * - Users (control plane UIs) can provide a user JWT for proxied access
 * - Token is validated via Identity service introspection
 * - Validated principals get their info attached to the socket
 *
 * Authorization:
 * - SDN operations require appropriate cap:network.* entitlements
 * - Admin operations require write entitlements
 * - Unauthenticated sockets have no SDN access (nodes only)
 */

import type { Server as SocketServer, Socket } from 'socket.io';
import * as registry from './services/registry.js';
import * as router from './services/router.js';
import type { WatchSubscription, AgentPrincipal, UserPrincipal } from './types.js';
import { NetworkPermissions } from './types.js';
import { resolveServiceUrl, ServiceId } from '@symbia/sys';
import { telemetry, NetworkEvents, NetworkMetrics } from './telemetry.js';

// Active watch subscriptions
const watchSubscriptions = new Map<string, WatchSubscription>();

// Socket to agent principal mapping (for authenticated agents)
const socketAgents = new Map<string, AgentPrincipal>();

// Socket to user principal mapping (for authenticated users/control plane UIs)
const socketUsers = new Map<string, UserPrincipal>();

/**
 * Validate agent token via Identity service introspection
 */
async function validateAgentToken(token: string): Promise<AgentPrincipal | null> {
  const identityUrl = resolveServiceUrl(ServiceId.IDENTITY);

  try {
    const response = await fetch(`${identityUrl}/api/auth/introspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    // Check if token is active and is an agent
    if (!data.active || data.type !== 'agent') {
      return null;
    }

    return {
      id: data.sub,
      agentId: data.agentId,
      name: data.name,
      orgId: data.orgId,
      capabilities: data.capabilities || [],
    };
  } catch (error) {
    console.error('[Network] Agent token validation error:', error);
    return null;
  }
}

/**
 * Validate user token via Identity service introspection
 * Used for user-proxied clients like Mission Control
 */
async function validateUserToken(token: string): Promise<UserPrincipal | null> {
  const identityUrl = resolveServiceUrl(ServiceId.IDENTITY);

  try {
    const response = await fetch(`${identityUrl}/api/auth/introspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    // Check if token is active and is a user
    if (!data.active || data.type !== 'user') {
      return null;
    }

    return {
      id: data.sub,
      email: data.email,
      name: data.name,
      entitlements: data.entitlements || [],
      roles: data.roles || [],
      organizations: data.organizations || [],
      isSuperAdmin: data.isSuperAdmin || false,
    };
  } catch (error) {
    console.error('[Network] User token validation error:', error);
    return null;
  }
}

/**
 * Check if a user has a specific permission
 * Super admins bypass all permission checks
 */
function hasPermission(socketId: string, permission: string): boolean {
  const user = socketUsers.get(socketId);
  if (!user) {
    return false;
  }

  // Super admins have all permissions
  if (user.isSuperAdmin) {
    return true;
  }

  // Check if user has the specific entitlement
  return user.entitlements.includes(permission);
}

/**
 * Get the authenticated principal type for a socket
 */
function getSocketPrincipalType(socketId: string): 'agent' | 'user' | 'anonymous' {
  if (socketAgents.has(socketId)) return 'agent';
  if (socketUsers.has(socketId)) return 'user';
  return 'anonymous';
}

export function setupSocketHandlers(io: SocketServer): void {
  io.on('connection', async (socket: Socket) => {
    console.log(`[Network] Socket connected: ${socket.id}`);

    telemetry.event(
      NetworkEvents.SOCKET_CONNECTED,
      `Socket connected: ${socket.id}`,
      { socketId: socket.id, remoteAddress: socket.handshake.address }
    );
    telemetry.metric(NetworkMetrics.SOCKET_CONNECTED, 1);

    // Check for auth token in handshake
    // Supports both agent tokens and user tokens for control plane UIs
    const authToken = socket.handshake.auth?.token;
    if (authToken) {
      // Try agent validation first
      const agent = await validateAgentToken(authToken);
      if (agent) {
        socketAgents.set(socket.id, agent);
        console.log(`[Network] Agent authenticated: ${agent.agentId}`);

        telemetry.event(
          NetworkEvents.AGENT_AUTH_SUCCESS,
          `Agent authenticated: ${agent.agentId}`,
          { socketId: socket.id, agentId: agent.agentId, agentName: agent.name, orgId: agent.orgId }
        );
        telemetry.metric(NetworkMetrics.AGENT_AUTH_SUCCESS, 1, { agentId: agent.agentId });
      } else {
        // Try user validation (for control plane UIs like Mission Control)
        const user = await validateUserToken(authToken);
        if (user) {
          socketUsers.set(socket.id, user);
          console.log(`[Network] User authenticated: ${user.email}`);

          telemetry.event(
            NetworkEvents.USER_AUTH_SUCCESS,
            `User authenticated: ${user.email}`,
            {
              socketId: socket.id,
              userId: user.id,
              email: user.email,
              isSuperAdmin: user.isSuperAdmin,
              entitlementCount: user.entitlements.length,
            }
          );
          telemetry.metric(NetworkMetrics.USER_AUTH_SUCCESS, 1);
        } else {
          // Neither agent nor user token valid
          console.log(`[Network] Auth failed for socket ${socket.id} (neither agent nor user)`);

          telemetry.event(
            NetworkEvents.USER_AUTH_FAILURE,
            `Authentication failed for socket ${socket.id}`,
            { socketId: socket.id },
            'warn'
          );
          telemetry.metric(NetworkMetrics.USER_AUTH_FAILURE, 1);
        }
      }
    }

    // ========================================================================
    // Node Registration via Socket
    // ========================================================================

    /**
     * Register a node and associate it with this socket
     *
     * For 'assistant' type nodes (agents):
     * - Must have authenticated via token in socket handshake
     * - Node ID must match authenticated agent's agentId
     * - Capabilities are merged from auth and registration
     */
    socket.on('node:register', (data: {
      id: string;
      name: string;
      type: 'service' | 'assistant' | 'sandbox' | 'bridge' | 'client';
      capabilities: string[];
      endpoint: string;
      metadata?: Record<string, unknown>;
    }, callback?: (response: any) => void) => {
      console.log(`[Network] Received node:register event:`, {
        id: data.id,
        name: data.name,
        type: data.type,
        hasCallback: !!callback,
      });

      // For assistant (agent) type, enforce authentication
      if (data.type === 'assistant') {
        const agent = socketAgents.get(socket.id);
        if (!agent) {
          console.log(`[Network] Unauthenticated agent registration rejected: ${data.id}`);
          if (callback) {
            callback({ ok: false, error: 'Agent authentication required' });
          }
          return;
        }

        // Verify node ID matches authenticated agent
        if (data.id !== agent.agentId) {
          console.log(`[Network] Agent ID mismatch: ${data.id} != ${agent.agentId}`);
          if (callback) {
            callback({ ok: false, error: 'Agent ID does not match authenticated identity' });
          }
          return;
        }

        // Merge capabilities from auth
        const mergedCapabilities = [...new Set([...data.capabilities, ...agent.capabilities])];

        const node = registry.registerNode(
          agent.agentId,
          agent.name,
          'assistant',
          mergedCapabilities,
          data.endpoint,
          socket.id,
          {
            ...data.metadata,
            authenticatedAgentId: agent.id,
            orgId: agent.orgId,
          }
        );

        socket.join(`node:${agent.agentId}`);
        console.log(`[Network] Agent node registered: ${agent.agentId} (${agent.name})`);

        if (callback) {
          callback({ ok: true, node, agent });
        }

        io.emit('network:node:joined', {
          nodeId: agent.agentId,
          name: agent.name,
          type: 'assistant',
          isAgent: true,
        });
        return;
      }

      // For non-agent types (service, sandbox, bridge), allow registration
      const node = registry.registerNode(
        data.id,
        data.name,
        data.type,
        data.capabilities,
        data.endpoint,
        socket.id,
        data.metadata
      );

      // Join a room for this node
      socket.join(`node:${data.id}`);

      console.log(`[Network] Node registered: ${data.id} (${data.name})`);

      if (callback) {
        callback({ ok: true, node });
      }

      // Broadcast node joined
      io.emit('network:node:joined', {
        nodeId: data.id,
        name: data.name,
        type: data.type,
      });
    });

    /**
     * Send heartbeat
     */
    socket.on('node:heartbeat', (data: { nodeId: string }, callback?: (response: any) => void) => {
      const success = registry.heartbeat(data.nodeId);
      if (callback) {
        callback({ ok: success });
      }
    });

    /**
     * Unregister node
     */
    socket.on('node:unregister', (data: { nodeId: string }, callback?: (response: any) => void) => {
      const success = registry.unregisterNode(data.nodeId);
      if (success) {
        socket.leave(`node:${data.nodeId}`);
        io.emit('network:node:left', { nodeId: data.nodeId });
      }
      if (callback) {
        callback({ ok: success });
      }
    });

    // ========================================================================
    // Event Routing via Socket
    // ========================================================================

    /**
     * Send an event through the network
     */
    socket.on('event:send', async (data: {
      payload: { type: string; data: unknown };
      source: string;
      runId: string;
      target?: string;
      causedBy?: string;
      boundary?: 'intra' | 'inter' | 'extra';
    }, callback?: (response: any) => void) => {
      telemetry.metric(NetworkMetrics.SOCKET_MESSAGE_RECEIVED, 1, { messageType: 'event:send', socketId: socket.id });

      console.log(`[Network] ====== EVENT:SEND RECEIVED ======`);
      console.log(`[Network] Event type: ${data.payload.type}`);
      console.log(`[Network] Source: ${data.source}`);
      console.log(`[Network] Target: ${data.target || '(broadcast via contracts)'}`);
      console.log(`[Network] Run ID: ${data.runId}`);
      console.log(`[Network] Boundary: ${data.boundary || 'intra'}`);

      try {
        const event = router.createEvent(data.payload, data.source, data.runId, {
          target: data.target,
          causedBy: data.causedBy,
          boundary: data.boundary,
        });

        console.log(`[Network] Created event: ${event.wrapper.id}`);

        router.recordEvent(event);
        const trace = await router.routeEvent(event);

        console.log(`[Network] Route complete. Status: ${trace.status}`);
        console.log(`[Network] Trace path: ${JSON.stringify(trace.path.map(h => ({ node: h.node, action: h.action })))}`);
        if (trace.error) {
          console.log(`[Network] Trace error: ${trace.error}`);
        }

        // Emit to target nodes via socket
        // First check explicit target
        if (data.target) {
          console.log(`[Network] Emitting to explicit target: node:${data.target}`);
          io.to(`node:${data.target}`).emit('event:received', event);
        }

        // Also emit to all nodes that received the event via contract routing
        // The trace.path contains all nodes that were delivered to
        let emittedTo: string[] = [];
        for (const hop of trace.path) {
          if (hop.action === 'deliver' && hop.node !== data.target) {
            console.log(`[Network] Emitting to contract target: node:${hop.node}`);
            io.to(`node:${hop.node}`).emit('event:received', event);
            emittedTo.push(hop.node);
          }
        }

        if (emittedTo.length > 0) {
          console.log(`[Network] Emitted to ${emittedTo.length} node(s) via contracts: ${emittedTo.join(', ')}`);
        } else if (!data.target) {
          console.log(`[Network] WARNING: No explicit target and no contract-based deliveries!`);
        }

        // Notify watch subscribers
        notifyWatchers(io, event, trace);

        console.log(`[Network] ====== EVENT:SEND COMPLETE ======`);

        if (callback) {
          callback({ ok: true, eventId: event.wrapper.id, trace });
        }
      } catch (error) {
        console.error(`[Network] Event routing error:`, error);
        if (callback) {
          callback({
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    });

    // ========================================================================
    // SDN Watch Subscriptions
    // ========================================================================

    /**
     * Subscribe to live event flow
     * Requires: cap:network.events.read entitlement for user-proxied clients
     * Note: Agents with registered nodes can always watch events
     */
    socket.on('sdn:watch', (data: {
      runId?: string;
      source?: string;
      eventType?: string;
    }, callback?: (response: any) => void) => {
      console.log(`[Network] ====== SDN:WATCH REQUEST ======`);
      console.log(`[Network] Socket: ${socket.id}`);
      console.log(`[Network] Filters:`, data);

      const principalType = getSocketPrincipalType(socket.id);
      console.log(`[Network] Principal type: ${principalType}`);

      // User-proxied clients require events.read permission
      if (principalType === 'user' && !hasPermission(socket.id, NetworkPermissions.EVENTS_READ)) {
        console.log(`[Network] SDN watch denied: insufficient permissions for socket ${socket.id}`);
        telemetry.event(
          NetworkEvents.PERMISSION_DENIED,
          `SDN watch denied for user socket ${socket.id}`,
          { socketId: socket.id, operation: 'sdn:watch', requiredPermission: NetworkPermissions.EVENTS_READ },
          'warn'
        );
        telemetry.metric(NetworkMetrics.PERMISSION_DENIED, 1, { operation: 'sdn:watch' });
        if (callback) {
          callback({ ok: false, error: 'insufficient_permissions', requiredPermission: NetworkPermissions.EVENTS_READ });
        }
        return;
      }

      // Anonymous sockets (no auth) cannot use SDN features
      if (principalType === 'anonymous') {
        console.log(`[Network] SDN watch denied: authentication required for socket ${socket.id}`);
        if (callback) {
          callback({ ok: false, error: 'authentication_required' });
        }
        return;
      }

      const subscriptionId = `watch_${socket.id}_${Date.now()}`;
      const subscription: WatchSubscription = {
        id: subscriptionId,
        runId: data.runId,
        source: data.source,
        eventType: data.eventType,
        socketId: socket.id,
        createdAt: new Date().toISOString(),
      };

      watchSubscriptions.set(subscriptionId, subscription);
      socket.join('sdn:watchers');

      console.log(`[Network] SDN watch started: ${subscriptionId} (${principalType})`);

      telemetry.event(
        NetworkEvents.SDN_WATCH_STARTED,
        `SDN watch subscription started: ${subscriptionId}`,
        { subscriptionId, socketId: socket.id, principalType, filters: { runId: data.runId, source: data.source, eventType: data.eventType } }
      );
      telemetry.metric(NetworkMetrics.SDN_WATCH_SUBSCRIBED, 1);
      telemetry.metric(NetworkMetrics.SDN_WATCH_ACTIVE_COUNT, watchSubscriptions.size);

      if (callback) {
        callback({ ok: true, subscriptionId });
      }
    });

    /**
     * Unsubscribe from watch
     */
    socket.on('sdn:unwatch', (data: { subscriptionId: string }, callback?: (response: any) => void) => {
      const success = watchSubscriptions.delete(data.subscriptionId);

      if (success) {
        telemetry.event(
          NetworkEvents.SDN_WATCH_STOPPED,
          `SDN watch subscription stopped: ${data.subscriptionId}`,
          { subscriptionId: data.subscriptionId, socketId: socket.id }
        );
        telemetry.metric(NetworkMetrics.SDN_WATCH_UNSUBSCRIBED, 1);
        telemetry.metric(NetworkMetrics.SDN_WATCH_ACTIVE_COUNT, watchSubscriptions.size);
      }

      if (callback) {
        callback({ ok: success });
      }
    });

    /**
     * Get current topology
     * Requires: cap:network.topology.read entitlement for user-proxied clients
     * Note: Agents with registered nodes can always view topology
     */
    socket.on('sdn:topology', (callback?: (response: any) => void) => {
      const principalType = getSocketPrincipalType(socket.id);

      // User-proxied clients require topology.read permission
      if (principalType === 'user' && !hasPermission(socket.id, NetworkPermissions.TOPOLOGY_READ)) {
        console.log(`[Network] SDN topology denied: insufficient permissions for socket ${socket.id}`);
        telemetry.event(
          NetworkEvents.PERMISSION_DENIED,
          `SDN topology denied for user socket ${socket.id}`,
          { socketId: socket.id, operation: 'sdn:topology', requiredPermission: NetworkPermissions.TOPOLOGY_READ },
          'warn'
        );
        telemetry.metric(NetworkMetrics.PERMISSION_DENIED, 1, { operation: 'sdn:topology' });
        if (callback) {
          callback({ ok: false, error: 'insufficient_permissions', requiredPermission: NetworkPermissions.TOPOLOGY_READ });
        }
        return;
      }

      // Anonymous sockets (no auth) cannot use SDN features
      if (principalType === 'anonymous') {
        console.log(`[Network] SDN topology denied: authentication required for socket ${socket.id}`);
        if (callback) {
          callback({ ok: false, error: 'authentication_required' });
        }
        return;
      }

      const topology = registry.getTopology();
      if (callback) {
        callback(topology);
      }
    });

    // ========================================================================
    // Contract Management via Socket
    // ========================================================================

    /**
     * Create a contract
     * Requires: cap:network.contracts.write entitlement for user-proxied clients
     * Note: Agents/services can create contracts for their own communication paths
     */
    socket.on('contract:create', (data: {
      from: string;
      to: string;
      allowedEventTypes: string[];
      boundaries: ('intra' | 'inter' | 'extra')[];
      expiresAt?: string;
    }, callback?: (response: any) => void) => {
      const principalType = getSocketPrincipalType(socket.id);

      // User-proxied clients require contracts.write permission
      if (principalType === 'user' && !hasPermission(socket.id, NetworkPermissions.CONTRACTS_WRITE)) {
        console.log(`[Network] Contract create denied: insufficient permissions for socket ${socket.id}`);
        telemetry.event(
          NetworkEvents.PERMISSION_DENIED,
          `Contract create denied for user socket ${socket.id}`,
          { socketId: socket.id, operation: 'contract:create', requiredPermission: NetworkPermissions.CONTRACTS_WRITE },
          'warn'
        );
        telemetry.metric(NetworkMetrics.PERMISSION_DENIED, 1, { operation: 'contract:create' });
        if (callback) {
          callback({ ok: false, error: 'insufficient_permissions', requiredPermission: NetworkPermissions.CONTRACTS_WRITE });
        }
        return;
      }

      // Anonymous sockets cannot create contracts
      if (principalType === 'anonymous') {
        console.log(`[Network] Contract create denied: authentication required for socket ${socket.id}`);
        if (callback) {
          callback({ ok: false, error: 'authentication_required' });
        }
        return;
      }

      const contract = registry.createContract(
        data.from,
        data.to,
        data.allowedEventTypes,
        data.boundaries,
        data.expiresAt
      );

      if (contract) {
        io.emit('network:contract:created', contract);
      }

      if (callback) {
        callback(contract ? { ok: true, contract } : { ok: false, error: 'Failed to create contract' });
      }
    });

    // ========================================================================
    // Disconnect Handling
    // ========================================================================

    socket.on('disconnect', () => {
      console.log(`[Network] Socket disconnected: ${socket.id}`);

      telemetry.event(
        NetworkEvents.SOCKET_DISCONNECTED,
        `Socket disconnected: ${socket.id}`,
        { socketId: socket.id }
      );
      telemetry.metric(NetworkMetrics.SOCKET_DISCONNECTED, 1);

      // Clean up agent principal mapping
      const agent = socketAgents.get(socket.id);
      if (agent) {
        socketAgents.delete(socket.id);
        console.log(`[Network] Agent disconnected: ${agent.agentId}`);

        telemetry.event(
          NetworkEvents.SOCKET_DISCONNECTED,
          `Agent disconnected: ${agent.agentId}`,
          { socketId: socket.id, agentId: agent.agentId, agentName: agent.name }
        );
      }

      // Clean up user principal mapping
      const user = socketUsers.get(socket.id);
      if (user) {
        socketUsers.delete(socket.id);
        console.log(`[Network] User disconnected: ${user.email}`);

        telemetry.event(
          NetworkEvents.SOCKET_DISCONNECTED,
          `User disconnected: ${user.email}`,
          { socketId: socket.id, userId: user.id, email: user.email }
        );
      }

      // Find and update any nodes associated with this socket
      const nodes = registry.getAllNodes();
      let nodesDisconnected = 0;
      for (const node of nodes) {
        if (node.socketId === socket.id) {
          registry.updateNodeSocket(node.id, undefined);
          io.emit('network:node:disconnected', { nodeId: node.id });
          nodesDisconnected++;
        }
      }

      if (nodesDisconnected > 0) {
        telemetry.metric(NetworkMetrics.NODE_ACTIVE_COUNT, nodes.length);
      }

      // Clean up watch subscriptions
      let watchSubscriptionsCleaned = 0;
      for (const [id, sub] of watchSubscriptions) {
        if (sub.socketId === socket.id) {
          watchSubscriptions.delete(id);
          watchSubscriptionsCleaned++;
        }
      }

      if (watchSubscriptionsCleaned > 0) {
        telemetry.metric(NetworkMetrics.SDN_WATCH_UNSUBSCRIBED, watchSubscriptionsCleaned);
        telemetry.metric(NetworkMetrics.SDN_WATCH_ACTIVE_COUNT, watchSubscriptions.size);
      }
    });
  });

  // Set up event handler for router to notify watchers
  router.subscribeToEvents('socket-broadcast', (event, trace) => {
    notifyWatchers(io, event, trace);
  });
}

/**
 * Notify all matching watch subscribers of an event
 */
function notifyWatchers(io: SocketServer, event: any, trace: any): void {
  const subscriptionCount = watchSubscriptions.size;
  let matchedCount = 0;

  if (subscriptionCount === 0) {
    // Only log occasionally to avoid spam
    return;
  }

  for (const sub of watchSubscriptions.values()) {
    // Check filters
    if (sub.runId && event.wrapper.runId !== sub.runId) continue;
    if (sub.source && event.wrapper.source !== sub.source) continue;
    if (sub.eventType && event.payload.type !== sub.eventType) continue;

    matchedCount++;
    // Send to subscriber
    io.to(sub.socketId).emit('sdn:event', { event, trace });
  }

  if (matchedCount > 0) {
    console.log(`[Network] Sent sdn:event (${event.payload.type}) to ${matchedCount}/${subscriptionCount} watchers`);
  }
}
