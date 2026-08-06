/**
 * Network Service Client
 *
 * Provides both REST and WebSocket connectivity to the Symbia Network service.
 * Enables real-time network topology monitoring, SDN event streaming, and node status.
 *
 * Authentication:
 * - User JWT is passed via auth handshake for WebSocket
 * - User JWT is passed via Authorization header for REST
 * - Permission errors are thrown as NetworkPermissionError
 */
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/authStore';
import { getServiceUrl, ServicePorts } from '@/config/services';

// =============================================================================
// Error Types
// =============================================================================

/**
 * Error thrown when a network operation fails due to missing permissions
 */
export class NetworkPermissionError extends Error {
  public readonly code = 'PERMISSION_DENIED';
  public readonly requiredPermission?: string;
  public readonly operation: string;

  constructor(message: string, operation: string, requiredPermission?: string) {
    super(message);
    this.name = 'NetworkPermissionError';
    this.operation = operation;
    this.requiredPermission = requiredPermission;
  }
}

/**
 * Error thrown when a network operation fails due to missing authentication
 */
export class NetworkAuthError extends Error {
  public readonly code = 'AUTH_REQUIRED';
  public readonly operation: string;

  constructor(message: string, operation: string) {
    super(message);
    this.name = 'NetworkAuthError';
    this.operation = operation;
  }
}

// =============================================================================
// Types
// =============================================================================

export interface NetworkNode {
  id: string;
  name: string;
  type: 'service' | 'assistant' | 'sandbox' | 'bridge' | 'integration' | 'client';
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

export interface NetworkTopology {
  nodes: NetworkNode[];
  contracts: NodeContract[];
  bridges: NetworkBridge[];
  timestamp: string;
}

export interface SandboxEvent {
  payload: {
    type: string;
    data: unknown;
  };
  wrapper: {
    id: string;
    runId: string;
    timestamp: string;
    source: string;
    target?: string;
    causedBy?: string;
    path: string[];
    boundary: 'intra' | 'inter' | 'extra';
  };
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

export interface NetworkEventHandlers {
  onNodeJoined?: (event: { nodeId: string; name: string; type: string; isAgent?: boolean }) => void;
  onNodeLeft?: (event: { nodeId: string }) => void;
  onNodeDisconnected?: (event: { nodeId: string }) => void;
  onContractCreated?: (contract: NodeContract) => void;
  onSDNEvent?: (event: SandboxEvent, trace: EventTrace) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

// =============================================================================
// Socket Connection
// =============================================================================

let socket: Socket | null = null;
let watchSubscriptionId: string | null = null;
let heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;
let registeredClientId: string | null = null;

// Heartbeat interval (30 seconds - matches server's heartbeatIntervalMs)
const HEARTBEAT_INTERVAL_MS = 30000;

/**
 * Register the client as a node in the network topology
 * This is extracted to allow re-registration if needed
 */
function registerClientNode(): void {
  if (!socket?.connected) return;

  const isDev = import.meta.env.DEV;
  const user = useAuthStore.getState().user;
  const clientId = `client:control-center:${user?.id || 'anonymous'}`;
  const clientName = user ? `${user.name || user.email}'s Control Center` : 'Control Center';

  // Skip if already registered with same ID
  if (registeredClientId === clientId) {
    if (isDev) console.log('[NetworkSocket] Already registered as:', clientId);
    return;
  }

  if (isDev) {
    console.log('[NetworkSocket] Registering as client node:', {
      id: clientId,
      name: clientName,
      type: 'client',
      userId: user?.id,
    });
  }

  socket.emit('node:register', {
    id: clientId,
    name: clientName,
    type: 'client',
    capabilities: ['topology.view', 'events.watch', 'logs.view'],
    endpoint: window.location.origin,
    metadata: {
      userAgent: navigator.userAgent,
      userId: user?.id,
      userName: user?.name,
      userEmail: user?.email,
    },
  }, (response: { ok: boolean; error?: string; node?: NetworkNode }) => {
    if (isDev) {
      console.log('[NetworkSocket] Registration response received:', response);
      if (response?.ok) {
        console.log('[NetworkSocket] Registered as client node:', clientId, response.node);
      } else {
        console.warn('[NetworkSocket] Failed to register as client:', response?.error);
      }
    }

    // Start sending heartbeats to prevent being marked as stale
    if (response?.ok) {
      registeredClientId = clientId;

      // Clear any existing heartbeat interval
      if (heartbeatIntervalId) {
        clearInterval(heartbeatIntervalId);
      }

      // Start heartbeat interval with timeout protection
      heartbeatIntervalId = setInterval(() => {
        if (socket?.connected && registeredClientId) {
          // Add timeout to heartbeat callback to prevent hanging
          const heartbeatTimeout = setTimeout(() => {
            if (isDev) {
              console.warn('[NetworkSocket] Heartbeat timed out for:', registeredClientId);
            }
          }, 10000); // 10 second timeout

          socket.emit('node:heartbeat', { nodeId: registeredClientId }, (hbResponse: { ok: boolean }) => {
            clearTimeout(heartbeatTimeout);
            if (isDev && !hbResponse?.ok) {
              console.warn('[NetworkSocket] Heartbeat failed for:', registeredClientId);
            }
          });
        }
      }, HEARTBEAT_INTERVAL_MS);

      if (isDev) {
        console.log('[NetworkSocket] Started heartbeat interval for:', clientId);
      }
    }
  });
}

/**
 * Get the Network service socket URL (direct, not proxied)
 */
function getNetworkSocketUrl(): string {
  const envVar = 'VITE_NETWORK_URL';
  const envUrl = import.meta.env[envVar];
  if (envUrl) return envUrl;
  return `http://localhost:${ServicePorts.network}`;
}

/**
 * Connect to the Network service via WebSocket
 */
export function connectNetworkSocket(handlers: NetworkEventHandlers): Socket {
  const token = useAuthStore.getState().token;
  const isDev = import.meta.env.DEV;

  if (isDev) {
    console.log('[NetworkSocket] Connecting to:', getNetworkSocketUrl());
  }

  if (socket?.connected) {
    if (isDev) console.log('[NetworkSocket] Already connected, reusing');
    // Immediately trigger onConnect for the new handlers since socket is already connected
    handlers.onConnect?.();
    // Ensure client is registered (may have been skipped if socket was reused before registration completed)
    registerClientNode();
    return socket;
  }

  // Clean up existing socket if it exists but isn't connected
  if (socket && !socket.connected) {
    if (isDev) console.log('[NetworkSocket] Cleaning up existing disconnected socket');
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  const socketUrl = getNetworkSocketUrl();
  if (isDev) {
    console.log('[NetworkSocket] Creating new socket connection to:', socketUrl);
    console.log('[NetworkSocket] Auth token present:', !!token);
  }

  socket = io(socketUrl, {
    auth: token ? { token } : undefined,
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 10000,
    // Force websocket transport to avoid polling issues
    transports: ['websocket', 'polling'],
  });

  // Debug: Log all transport-level events in development
  if (isDev) {
    socket.io.on('error', (error) => {
      console.error('[NetworkSocket] Engine.IO error:', error);
    });

    socket.io.on('reconnect_attempt', (attempt) => {
      console.log('[NetworkSocket] Reconnection attempt:', attempt);
    });

    socket.io.on('reconnect_error', (error) => {
      console.error('[NetworkSocket] Reconnection error:', error);
    });

    socket.io.on('reconnect_failed', () => {
      console.error('[NetworkSocket] Reconnection failed after all attempts');
    });

    socket.io.on('ping', () => {
      console.log('[NetworkSocket] Ping sent');
    });
  }

  socket.on('connect', () => {
    if (isDev) console.log('[NetworkSocket] Connected');

    // Signal connection immediately (don't wait for registration)
    handlers.onConnect?.();

    // Register this client as a node in the network topology (async, non-blocking)
    registerClientNode();
  });

  socket.on('disconnect', () => {
    if (isDev) console.log('[NetworkSocket] Disconnected');

    // Clear heartbeat interval on disconnect
    if (heartbeatIntervalId) {
      clearInterval(heartbeatIntervalId);
      heartbeatIntervalId = null;
    }
    registeredClientId = null;

    handlers.onDisconnect?.();
  });

  socket.on('connect_error', (error) => {
    if (isDev) console.error('[NetworkSocket] Connection error:', error.message);
    handlers.onError?.(error);
  });

  // Network topology events
  socket.on('network:node:joined', (event: { nodeId: string; name: string; type: string; isAgent?: boolean }) => {
    if (isDev) console.log('[NetworkSocket] Node joined:', event.nodeId);
    handlers.onNodeJoined?.(event);
  });

  socket.on('network:node:left', (event: { nodeId: string }) => {
    if (isDev) console.log('[NetworkSocket] Node left:', event.nodeId);
    handlers.onNodeLeft?.(event);
  });

  socket.on('network:node:disconnected', (event: { nodeId: string }) => {
    if (isDev) console.log('[NetworkSocket] Node disconnected:', event.nodeId);
    handlers.onNodeDisconnected?.(event);
  });

  socket.on('network:contract:created', (contract: NodeContract) => {
    if (isDev) console.log('[NetworkSocket] Contract created:', contract.id);
    handlers.onContractCreated?.(contract);
  });

  // SDN event stream (after subscribing)
  socket.on('sdn:event', (data: { event: SandboxEvent; trace: EventTrace }) => {
    if (isDev) console.log('[NetworkSocket] Received sdn:event:', data.event?.payload?.type);
    handlers.onSDNEvent?.(data.event, data.trace);
  });

  return socket;
}

/**
 * Disconnect from the Network service
 */
export function disconnectNetworkSocket(): void {
  // Clear heartbeat interval
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
  registeredClientId = null;

  if (watchSubscriptionId && socket?.connected) {
    socket.emit('sdn:unwatch', { subscriptionId: watchSubscriptionId });
    watchSubscriptionId = null;
  }

  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Get the current socket instance
 */
export function getNetworkSocket(): Socket | null {
  return socket;
}

/**
 * Request current network topology via WebSocket
 * Requires: cap:network.topology.read
 */
export function requestTopology(): Promise<NetworkTopology> {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      reject(new Error('Not connected'));
      return;
    }

    const timeout = setTimeout(() => {
      reject(new Error('Topology request timed out'));
    }, 5000);

    socket.emit('sdn:topology', (response: NetworkTopology | { ok: false; error: string; requiredPermission?: string }) => {
      clearTimeout(timeout);
      // Check if it's an error response
      if (response && 'ok' in response && response.ok === false) {
        if (response.error === 'insufficient_permissions') {
          reject(new NetworkPermissionError(
            'Insufficient permissions to view topology',
            'sdn:topology',
            response.requiredPermission
          ));
        } else if (response.error === 'authentication_required') {
          reject(new NetworkAuthError('Authentication required', 'sdn:topology'));
        } else {
          reject(new Error(response.error || 'Failed to get topology'));
        }
        return;
      }
      resolve(response as NetworkTopology);
    });
  });
}

/**
 * Subscribe to SDN event stream
 * Requires: cap:network.events.read
 */
export function subscribeToSDNEvents(options?: {
  runId?: string;
  source?: string;
  eventType?: string;
}): Promise<string> {
  const isDev = import.meta.env.DEV;
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      if (isDev) console.log('[NetworkSocket] Cannot subscribe - not connected');
      reject(new Error('Not connected'));
      return;
    }

    if (isDev) console.log('[NetworkSocket] Subscribing to SDN events...');

    // Timeout if server doesn't respond
    const timeout = setTimeout(() => {
      if (isDev) console.warn('[NetworkSocket] SDN watch callback timed out');
      reject(new Error('Subscription timed out'));
    }, 5000);

    socket.emit('sdn:watch', options || {}, (response: { ok: boolean; subscriptionId?: string; error?: string; requiredPermission?: string }) => {
      clearTimeout(timeout);
      if (isDev) console.log('[NetworkSocket] SDN watch response:', response);
      if (response.ok && response.subscriptionId) {
        watchSubscriptionId = response.subscriptionId;
        resolve(response.subscriptionId);
      } else {
        // Handle specific error types
        if (response.error === 'insufficient_permissions') {
          reject(new NetworkPermissionError(
            'Insufficient permissions to watch SDN events',
            'sdn:watch',
            response.requiredPermission
          ));
        } else if (response.error === 'authentication_required') {
          reject(new NetworkAuthError('Authentication required to watch SDN events', 'sdn:watch'));
        } else {
          reject(new Error(response.error || 'Failed to subscribe'));
        }
      }
    });
  });
}

/**
 * Unsubscribe from SDN event stream
 */
export function unsubscribeFromSDNEvents(): Promise<void> {
  return new Promise((resolve) => {
    if (!socket?.connected || !watchSubscriptionId) {
      resolve();
      return;
    }

    socket.emit('sdn:unwatch', { subscriptionId: watchSubscriptionId }, () => {
      watchSubscriptionId = null;
      resolve();
    });
  });
}

// =============================================================================
// REST Client
// =============================================================================

class NetworkRESTClient {
  private getHeaders(): Record<string, string> {
    const token = useAuthStore.getState().token;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  private getBaseUrl(): string {
    // In development, use Vite proxy to avoid CORS issues
    // Proxy rewrites /api/network/* to http://localhost:5054/api/*
    if (import.meta.env.DEV) {
      return '/api/network';
    }
    return `${getServiceUrl('network')}/api`;
  }

  /**
   * Handle HTTP response errors, converting 401/403 to appropriate error types
   */
  private async handleResponseError(response: Response, operation: string): Promise<never> {
    let errorData: { error?: string; message?: string; requiredPermission?: string } = {};
    try {
      errorData = await response.json();
    } catch {
      // Ignore JSON parse errors
    }

    if (response.status === 401) {
      throw new NetworkAuthError(
        errorData.message || 'Authentication required',
        operation
      );
    }

    if (response.status === 403) {
      throw new NetworkPermissionError(
        errorData.message || 'Insufficient permissions',
        operation,
        errorData.requiredPermission
      );
    }

    throw new Error(errorData.message || `Failed to ${operation}`);
  }

  /**
   * Get full network topology (nodes, contracts, bridges)
   * Requires: cap:network.topology.read
   */
  async getTopology(): Promise<NetworkTopology> {
    const response = await fetch(`${this.getBaseUrl()}/sdn/topology`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      await this.handleResponseError(response, 'get topology');
    }

    return response.json();
  }

  /**
   * Get all registered nodes
   * Requires: authentication (no specific permission for registry)
   */
  async getNodes(): Promise<NetworkNode[]> {
    const response = await fetch(`${this.getBaseUrl()}/registry/nodes`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      await this.handleResponseError(response, 'get nodes');
    }

    const data = await response.json();
    return data.nodes || data || [];
  }

  /**
   * Get a specific node
   */
  async getNode(id: string): Promise<NetworkNode | null> {
    const response = await fetch(`${this.getBaseUrl()}/registry/nodes/${id}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      await this.handleResponseError(response, `get node ${id}`);
    }

    return response.json();
  }

  /**
   * Get all contracts
   */
  async getContracts(): Promise<NodeContract[]> {
    const response = await fetch(`${this.getBaseUrl()}/registry/contracts`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      await this.handleResponseError(response, 'get contracts');
    }

    const data = await response.json();
    return data.contracts || data || [];
  }

  /**
   * Get all bridges
   */
  async getBridges(): Promise<NetworkBridge[]> {
    const response = await fetch(`${this.getBaseUrl()}/registry/bridges`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      await this.handleResponseError(response, 'get bridges');
    }

    const data = await response.json();
    return data.bridges || data || [];
  }

  /**
   * Get event statistics
   */
  async getEventStats(): Promise<{
    totalEvents: number;
    deliveredCount: number;
    droppedCount: number;
    errorCount: number;
    avgLatencyMs: number;
  }> {
    const response = await fetch(`${this.getBaseUrl()}/events/stats`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      await this.handleResponseError(response, 'get event stats');
    }

    return response.json();
  }

  /**
   * Get recent events with traces
   * Requires: cap:network.events.read
   *
   * Note: The server returns events already wrapped with traces by default.
   */
  async getRecentEvents(options?: {
    runId?: string;
    source?: string;
    limit?: number;
    includeTraces?: boolean;
  }): Promise<Array<{ event: SandboxEvent; trace: EventTrace }>> {
    const params = new URLSearchParams();
    if (options?.runId) params.set('runId', options.runId);
    if (options?.source) params.set('source', options.source);
    if (options?.limit) params.set('limit', String(options.limit));
    // traces=true by default on server, explicitly set false to disable
    if (options?.includeTraces === false) params.set('traces', 'false');

    const response = await fetch(
      `${this.getBaseUrl()}/events${params.toString() ? `?${params}` : ''}`,
      {
        method: 'GET',
        headers: this.getHeaders(),
      }
    );

    if (!response.ok) {
      await this.handleResponseError(response, 'get events');
    }

    const data = await response.json();
    return data.events || [];
  }

  /**
   * Get event trace
   * Requires: cap:network.traces.read
   */
  async getEventTrace(eventId: string): Promise<EventTrace | null> {
    const response = await fetch(`${this.getBaseUrl()}/events/${eventId}/trace`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      await this.handleResponseError(response, `get event trace ${eventId}`);
    }

    return response.json();
  }

  /**
   * Get SDN summary
   * Requires: cap:network.topology.read
   */
  async getSummary(): Promise<{
    nodes: { total: number; byType: Record<string, number>; connected: number };
    contracts: { total: number };
    bridges: { total: number; active: number };
    events: { totalEvents: number; deliveredCount: number; droppedCount: number };
    policies: { total: number; enabled: number };
    timestamp: string;
  }> {
    const response = await fetch(`${this.getBaseUrl()}/sdn/summary`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      await this.handleResponseError(response, 'get summary');
    }

    return response.json();
  }

  /**
   * Get policies (read-only)
   * Requires: cap:network.policies.read
   */
  async getPolicies(): Promise<{
    policies: Array<{
      id: string;
      name: string;
      priority: number;
      conditions: Array<{ field: string; operator: string; value: string }>;
      action: { type: string; reason?: string };
      enabled: boolean;
      createdAt: string;
    }>;
    count: number;
  }> {
    const response = await fetch(`${this.getBaseUrl()}/sdn/policies`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      await this.handleResponseError(response, 'get policies');
    }

    return response.json();
  }

  /**
   * Simulate event routing (dry run)
   * Requires: cap:network.events.read
   */
  async simulate(event: {
    payload: { type: string; data: unknown };
    source: string;
    runId: string;
    target?: string;
    boundary?: 'intra' | 'inter' | 'extra';
  }): Promise<{
    wouldSucceed: boolean;
    event: SandboxEvent;
    sourceNode?: { id: string; name: string; type: string };
    targets: Array<{ id: string; name?: string; type?: string; exists: boolean }>;
    policyResult: { action: { type: string }; policyId?: string };
    reasons: string[];
  }> {
    const response = await fetch(`${this.getBaseUrl()}/sdn/simulate`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      await this.handleResponseError(response, 'simulate event');
    }

    return response.json();
  }
}

export const networkClient = new NetworkRESTClient();
