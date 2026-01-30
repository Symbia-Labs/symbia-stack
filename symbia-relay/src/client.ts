/**
 * Relay Client
 *
 * Client library for connecting to the Symbia Network Service.
 * Handles node registration, event sending, and SDN watching.
 */

import { io, Socket } from 'socket.io-client';
import { resolveServiceUrl, ServiceId } from '@symbia/sys';
import type {
  RelayConfig,
  SendEventOptions,
  WatchFilter,
  SandboxEvent,
  EventTrace,
  EventPayload,
  NetworkTopology,
  NodeContract,
} from './types.js';

export class RelayClient {
  private socket: Socket | null = null;
  private config: Required<Omit<RelayConfig, 'authToken'>> & Pick<RelayConfig, 'authToken'>;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private connected = false;
  private registered = false;
  private eventHandlers = new Map<string, Set<(event: SandboxEvent) => void>>();
  private watchSubscriptions = new Map<string, string>(); // filter key -> subscription ID

  constructor(config: RelayConfig) {
    this.config = {
      networkUrl: config.networkUrl || resolveServiceUrl(ServiceId.NETWORK),
      nodeId: config.nodeId,
      nodeName: config.nodeName,
      nodeType: config.nodeType,
      capabilities: config.capabilities || [],
      endpoint: config.endpoint || `http://localhost:${process.env.PORT || '5000'}/api/events/receive`,
      metadata: config.metadata || {},
      autoReconnect: config.autoReconnect ?? true,
      heartbeatIntervalMs: config.heartbeatIntervalMs || 30000,
      authToken: config.authToken,
    };
  }

  /**
   * Connect to the network service
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(this.config.networkUrl, {
        autoConnect: true,
        reconnection: this.config.autoReconnect,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        // Pass auth token in handshake for agent authentication
        auth: this.config.authToken ? { token: this.config.authToken } : undefined,
      });

      this.socket.on('connect', () => {
        console.log(`[Relay] Connected to network at ${this.config.networkUrl}`);
        this.connected = true;
        this.register().then(resolve).catch(reject);
      });

      this.socket.on('disconnect', (reason) => {
        console.log(`[Relay] Disconnected from network: ${reason}`);
        this.connected = false;
        this.registered = false;
        this.stopHeartbeat();
      });

      this.socket.on('connect_error', (error) => {
        console.error(`[Relay] Connection error:`, error.message);
        if (!this.connected) {
          reject(error);
        }
      });

      // Handle incoming events
      this.socket.on('event:received', (event: SandboxEvent) => {
        console.log(`[Relay] ====== EVENT:RECEIVED ======`);
        console.log(`[Relay] Node: ${this.config.nodeId}`);
        console.log(`[Relay] Event type: ${event.payload.type}`);
        console.log(`[Relay] Event ID: ${event.wrapper.id}`);
        console.log(`[Relay] Source: ${event.wrapper.source}`);
        console.log(`[Relay] Run ID: ${event.wrapper.runId}`);
        this.handleIncomingEvent(event);
      });

      // Handle SDN watch events
      this.socket.on('sdn:event', (data: { event: SandboxEvent; trace: EventTrace }) => {
        this.handleWatchEvent(data.event, data.trace);
      });

      // Handle network events
      this.socket.on('network:node:joined', (data) => {
        console.log(`[Relay] Node joined: ${data.nodeId} (${data.name})`);
      });

      this.socket.on('network:node:left', (data) => {
        console.log(`[Relay] Node left: ${data.nodeId}`);
      });
    });
  }

  /**
   * Register this node with the network
   */
  private async register(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected'));
        return;
      }

      this.socket.emit('node:register', {
        id: this.config.nodeId,
        name: this.config.nodeName,
        type: this.config.nodeType,
        capabilities: this.config.capabilities,
        endpoint: this.config.endpoint,
        metadata: this.config.metadata,
      }, (response: any) => {
        if (response.ok) {
          console.log(`[Relay] Registered as ${this.config.nodeId}`);
          this.registered = true;
          this.startHeartbeat();
          resolve();
        } else {
          reject(new Error(response.error || 'Registration failed'));
        }
      });
    });
  }

  /**
   * Start sending heartbeats
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.registered) {
        this.socket.emit('node:heartbeat', { nodeId: this.config.nodeId });
      }
    }, this.config.heartbeatIntervalMs);
  }

  /**
   * Stop sending heartbeats
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Disconnect from the network
   */
  async disconnect(): Promise<void> {
    this.stopHeartbeat();

    if (this.socket && this.registered) {
      return new Promise((resolve) => {
        this.socket!.emit('node:unregister', { nodeId: this.config.nodeId }, () => {
          this.socket!.disconnect();
          this.socket = null;
          this.connected = false;
          this.registered = false;
          resolve();
        });
      });
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connected = false;
    this.registered = false;
  }

  /**
   * Send an event through the network
   */
  async send(
    payload: EventPayload,
    runId: string,
    options: SendEventOptions = {}
  ): Promise<{ eventId: string; trace: EventTrace }> {
    if (!this.socket || !this.registered) {
      throw new Error('Not connected or registered');
    }

    return new Promise((resolve, reject) => {
      this.socket!.emit('event:send', {
        payload,
        source: this.config.nodeId,
        runId,
        target: options.target,
        causedBy: options.causedBy,
        boundary: options.boundary || 'intra',
      }, (response: any) => {
        if (response.ok) {
          resolve({ eventId: response.eventId, trace: response.trace });
        } else {
          reject(new Error(response.error || 'Failed to send event'));
        }
      });
    });
  }

  /**
   * Create a contract with another node
   */
  async createContract(
    toNodeId: string,
    allowedEventTypes: string[],
    boundaries: ('intra' | 'inter' | 'extra')[] = ['intra'],
    expiresAt?: string
  ): Promise<NodeContract> {
    if (!this.socket || !this.registered) {
      throw new Error('Not connected or registered');
    }

    return new Promise((resolve, reject) => {
      this.socket!.emit('contract:create', {
        from: this.config.nodeId,
        to: toNodeId,
        allowedEventTypes,
        boundaries,
        expiresAt,
      }, (response: any) => {
        if (response.ok) {
          resolve(response.contract);
        } else {
          reject(new Error(response.error || 'Failed to create contract'));
        }
      });
    });
  }

  /**
   * Subscribe to incoming events of a specific type
   */
  onEvent(eventType: string, handler: (event: SandboxEvent) => void): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.eventHandlers.get(eventType)?.delete(handler);
    };
  }

  /**
   * Subscribe to all incoming events
   */
  onAnyEvent(handler: (event: SandboxEvent) => void): () => void {
    return this.onEvent('*', handler);
  }

  /**
   * Handle incoming events
   */
  private handleIncomingEvent(event: SandboxEvent): void {
    // Notify specific handlers
    const handlers = this.eventHandlers.get(event.payload.type);
    if (handlers && handlers.size > 0) {
      console.log(`[Relay] Found ${handlers.size} handler(s) for event type: ${event.payload.type}`);
      for (const handler of handlers) {
        try {
          console.log(`[Relay] Invoking handler for ${event.payload.type}`);
          handler(event);
        } catch (error) {
          console.error(`[Relay] Event handler error:`, error);
        }
      }
    } else {
      console.log(`[Relay] No handlers registered for event type: ${event.payload.type}`);
    }

    // Notify wildcard handlers
    const wildcardHandlers = this.eventHandlers.get('*');
    if (wildcardHandlers && wildcardHandlers.size > 0) {
      console.log(`[Relay] Found ${wildcardHandlers.size} wildcard handler(s)`);
      for (const handler of wildcardHandlers) {
        try {
          handler(event);
        } catch (error) {
          console.error(`[Relay] Event handler error:`, error);
        }
      }
    }

    console.log(`[Relay] ====== EVENT HANDLING COMPLETE ======`);
  }

  // SDN Watch handlers
  private watchHandlers = new Map<string, (event: SandboxEvent, trace: EventTrace) => void>();

  /**
   * Start watching network events (SDN observability)
   */
  async watch(
    filter: WatchFilter,
    handler: (event: SandboxEvent, trace: EventTrace) => void
  ): Promise<string> {
    if (!this.socket || !this.registered) {
      throw new Error('Not connected or registered');
    }

    const filterKey = JSON.stringify(filter);

    return new Promise((resolve, reject) => {
      this.socket!.emit('sdn:watch', filter, (response: any) => {
        if (response.ok) {
          this.watchSubscriptions.set(filterKey, response.subscriptionId);
          this.watchHandlers.set(response.subscriptionId, handler);
          resolve(response.subscriptionId);
        } else {
          reject(new Error(response.error || 'Failed to start watch'));
        }
      });
    });
  }

  /**
   * Stop watching
   */
  async unwatch(subscriptionId: string): Promise<void> {
    if (!this.socket) return;

    return new Promise((resolve) => {
      this.socket!.emit('sdn:unwatch', { subscriptionId }, () => {
        this.watchHandlers.delete(subscriptionId);
        for (const [key, id] of this.watchSubscriptions) {
          if (id === subscriptionId) {
            this.watchSubscriptions.delete(key);
            break;
          }
        }
        resolve();
      });
    });
  }

  /**
   * Handle watch events
   */
  private handleWatchEvent(event: SandboxEvent, trace: EventTrace): void {
    for (const handler of this.watchHandlers.values()) {
      try {
        handler(event, trace);
      } catch (error) {
        console.error(`[Relay] Watch handler error:`, error);
      }
    }
  }

  /**
   * Get current network topology
   */
  async getTopology(): Promise<NetworkTopology> {
    if (!this.socket || !this.connected) {
      throw new Error('Not connected');
    }

    return new Promise((resolve) => {
      this.socket!.emit('sdn:topology', (topology: NetworkTopology) => {
        resolve(topology);
      });
    });
  }

  /**
   * Check if connected and registered
   */
  isReady(): boolean {
    return this.connected && this.registered;
  }

  /**
   * Get this node's ID
   */
  getNodeId(): string {
    return this.config.nodeId;
  }
}

/**
 * Create a relay client
 */
export function createRelayClient(config: RelayConfig): RelayClient {
  return new RelayClient(config);
}
