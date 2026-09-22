/**
 * Relay Client
 *
 * Client library for connecting to the Symbia Network Service.
 * Handles node registration, event sending, and SDN watching.
 */
import { io } from 'socket.io-client';
import { resolveServiceUrl, ServiceId } from '@symbia/sys';
export class RelayClient {
    socket = null;
    config;
    heartbeatInterval = null;
    connected = false;
    registered = false;
    eventHandlers = new Map();
    watchSubscriptions = new Map(); // filter key -> subscription ID
    constructor(config) {
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
    async connect() {
        return new Promise((resolve, reject) => {
            this.socket = io(this.config.networkUrl, {
                autoConnect: true,
                reconnection: this.config.autoReconnect,
                // Never stop trying.
                //
                // This was 10 attempts at 1-5s — under a minute of tolerance. Measured
                // 7 Aug 2026: the network service was down longer than that, and
                // integrations, models and assistants each exhausted their attempts and
                // stopped for good. Their logs show two registrations and two
                // disconnects, and they have emitted nothing since; the observability
                // dashboard for every one of them has been empty ever since, with no
                // error anywhere to say why.
                //
                // A service that gives up on the mesh permanently because the mesh
                // restarted is a service that silently stops being observable. The
                // backoff below caps at 30s, so an unreachable network costs one
                // connection attempt every half minute and nothing else.
                reconnectionAttempts: Infinity,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 30000,
                randomizationFactor: 0.5,
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
            this.socket.on('event:received', (event) => {
                console.log(`[Relay] ====== EVENT:RECEIVED ======`);
                console.log(`[Relay] Node: ${this.config.nodeId}`);
                console.log(`[Relay] Event type: ${event.payload.type}`);
                console.log(`[Relay] Event ID: ${event.wrapper.id}`);
                console.log(`[Relay] Source: ${event.wrapper.source}`);
                console.log(`[Relay] Run ID: ${event.wrapper.runId}`);
                this.handleIncomingEvent(event);
            });
            // Handle SDN watch events
            this.socket.on('sdn:event', (data) => {
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
     * Register this node with the network.
     *
     * Re-emits on ack timeout. The network service attaches its socket handlers
     * only AFTER awaiting token introspection on authenticated connections
     * (network/server/src/socket.ts `io.on('connection', async ...)`), so a
     * register emitted immediately on connect can land before any listener
     * exists and is silently dropped — observed 12 Aug 2026 as a bridge that
     * "connected" and then hung forever. Registration is an upsert server-side,
     * so retrying is safe; a client that waits forever on a dropped emit is not.
     */
    async register() {
        const attempt = () => new Promise((resolve, reject) => {
            if (!this.socket) {
                reject(new Error('Not connected'));
                return;
            }
            const timer = setTimeout(() => resolve('timeout'), 2000);
            this.socket.emit('node:register', {
                id: this.config.nodeId,
                name: this.config.nodeName,
                type: this.config.nodeType,
                capabilities: this.config.capabilities,
                endpoint: this.config.endpoint,
                metadata: this.config.metadata,
            }, (response) => {
                clearTimeout(timer);
                if (response.ok) {
                    resolve('ok');
                }
                else {
                    reject(new Error(response.error || 'Registration failed'));
                }
            });
        });
        for (let i = 0; i < 5; i++) {
            const result = await attempt();
            if (result === 'ok') {
                console.log(`[Relay] Registered as ${this.config.nodeId}`);
                this.registered = true;
                this.startHeartbeat();
                return;
            }
            console.log(`[Relay] node:register unacknowledged after 2s (attempt ${i + 1}/5) — re-emitting`);
        }
        throw new Error('Registration failed: no acknowledgement after 5 attempts');
    }
    /**
     * Start sending heartbeats
     */
    startHeartbeat() {
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
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
    /**
     * Disconnect from the network
     */
    async disconnect() {
        this.stopHeartbeat();
        if (this.socket && this.registered) {
            return new Promise((resolve) => {
                this.socket.emit('node:unregister', { nodeId: this.config.nodeId }, () => {
                    this.socket.disconnect();
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
    async send(payload, runId, options = {}) {
        if (!this.socket || !this.registered) {
            throw new Error('Not connected or registered');
        }
        return new Promise((resolve, reject) => {
            this.socket.emit('event:send', {
                payload,
                source: this.config.nodeId,
                runId,
                target: options.target,
                causedBy: options.causedBy,
                boundary: options.boundary || 'intra',
            }, (response) => {
                if (response.ok) {
                    resolve({ eventId: response.eventId, trace: response.trace });
                }
                else {
                    reject(new Error(response.error || 'Failed to send event'));
                }
            });
        });
    }
    /**
     * Create a contract with another node
     */
    async createContract(toNodeId, allowedEventTypes, boundaries = ['intra'], expiresAt) {
        if (!this.socket || !this.registered) {
            throw new Error('Not connected or registered');
        }
        return new Promise((resolve, reject) => {
            this.socket.emit('contract:create', {
                from: this.config.nodeId,
                to: toNodeId,
                allowedEventTypes,
                boundaries,
                expiresAt,
            }, (response) => {
                if (response.ok) {
                    resolve(response.contract);
                }
                else {
                    reject(new Error(response.error || 'Failed to create contract'));
                }
            });
        });
    }
    /**
     * Subscribe to incoming events of a specific type
     */
    onEvent(eventType, handler) {
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, new Set());
        }
        this.eventHandlers.get(eventType).add(handler);
        // Return unsubscribe function
        return () => {
            this.eventHandlers.get(eventType)?.delete(handler);
        };
    }
    /**
     * Subscribe to all incoming events
     */
    onAnyEvent(handler) {
        return this.onEvent('*', handler);
    }
    /**
     * Handle incoming events
     */
    handleIncomingEvent(event) {
        // Notify specific handlers
        const handlers = this.eventHandlers.get(event.payload.type);
        if (handlers && handlers.size > 0) {
            console.log(`[Relay] Found ${handlers.size} handler(s) for event type: ${event.payload.type}`);
            for (const handler of handlers) {
                try {
                    console.log(`[Relay] Invoking handler for ${event.payload.type}`);
                    handler(event);
                }
                catch (error) {
                    console.error(`[Relay] Event handler error:`, error);
                }
            }
        }
        else {
            console.log(`[Relay] No handlers registered for event type: ${event.payload.type}`);
        }
        // Notify wildcard handlers
        const wildcardHandlers = this.eventHandlers.get('*');
        if (wildcardHandlers && wildcardHandlers.size > 0) {
            console.log(`[Relay] Found ${wildcardHandlers.size} wildcard handler(s)`);
            for (const handler of wildcardHandlers) {
                try {
                    handler(event);
                }
                catch (error) {
                    console.error(`[Relay] Event handler error:`, error);
                }
            }
        }
        console.log(`[Relay] ====== EVENT HANDLING COMPLETE ======`);
    }
    // SDN Watch handlers
    watchHandlers = new Map();
    /**
     * Start watching network events (SDN observability)
     */
    async watch(filter, handler) {
        if (!this.socket || !this.registered) {
            throw new Error('Not connected or registered');
        }
        const filterKey = JSON.stringify(filter);
        return new Promise((resolve, reject) => {
            this.socket.emit('sdn:watch', filter, (response) => {
                if (response.ok) {
                    this.watchSubscriptions.set(filterKey, response.subscriptionId);
                    this.watchHandlers.set(response.subscriptionId, handler);
                    resolve(response.subscriptionId);
                }
                else {
                    reject(new Error(response.error || 'Failed to start watch'));
                }
            });
        });
    }
    /**
     * Stop watching
     */
    async unwatch(subscriptionId) {
        if (!this.socket)
            return;
        return new Promise((resolve) => {
            this.socket.emit('sdn:unwatch', { subscriptionId }, () => {
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
    handleWatchEvent(event, trace) {
        for (const handler of this.watchHandlers.values()) {
            try {
                handler(event, trace);
            }
            catch (error) {
                console.error(`[Relay] Watch handler error:`, error);
            }
        }
    }
    /**
     * Get current network topology
     */
    async getTopology() {
        if (!this.socket || !this.connected) {
            throw new Error('Not connected');
        }
        return new Promise((resolve) => {
            this.socket.emit('sdn:topology', (topology) => {
                resolve(topology);
            });
        });
    }
    /**
     * Check if connected and registered
     */
    isReady() {
        return this.connected && this.registered;
    }
    /**
     * Get this node's ID
     */
    getNodeId() {
        return this.config.nodeId;
    }
}
/**
 * Create a relay client
 */
export function createRelayClient(config) {
    return new RelayClient(config);
}
//# sourceMappingURL=client.js.map