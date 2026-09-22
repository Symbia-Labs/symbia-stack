/**
 * Relay Client
 *
 * Client library for connecting to the Symbia Network Service.
 * Handles node registration, event sending, and SDN watching.
 */
import type { RelayConfig, SendEventOptions, WatchFilter, SandboxEvent, EventTrace, EventPayload, NetworkTopology, NodeContract } from './types.js';
export declare class RelayClient {
    private socket;
    private config;
    private heartbeatInterval;
    private connected;
    private registered;
    private eventHandlers;
    private watchSubscriptions;
    constructor(config: RelayConfig);
    /**
     * Connect to the network service
     */
    connect(): Promise<void>;
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
    private register;
    /**
     * Start sending heartbeats
     */
    private startHeartbeat;
    /**
     * Stop sending heartbeats
     */
    private stopHeartbeat;
    /**
     * Disconnect from the network
     */
    disconnect(): Promise<void>;
    /**
     * Send an event through the network
     */
    send(payload: EventPayload, runId: string, options?: SendEventOptions): Promise<{
        eventId: string;
        trace: EventTrace;
    }>;
    /**
     * Create a contract with another node
     */
    createContract(toNodeId: string, allowedEventTypes: string[], boundaries?: ('intra' | 'inter' | 'extra')[], expiresAt?: string): Promise<NodeContract>;
    /**
     * Subscribe to incoming events of a specific type
     */
    onEvent(eventType: string, handler: (event: SandboxEvent) => void): () => void;
    /**
     * Subscribe to all incoming events
     */
    onAnyEvent(handler: (event: SandboxEvent) => void): () => void;
    /**
     * Handle incoming events
     */
    private handleIncomingEvent;
    private watchHandlers;
    /**
     * Start watching network events (SDN observability)
     */
    watch(filter: WatchFilter, handler: (event: SandboxEvent, trace: EventTrace) => void): Promise<string>;
    /**
     * Stop watching
     */
    unwatch(subscriptionId: string): Promise<void>;
    /**
     * Handle watch events
     */
    private handleWatchEvent;
    /**
     * Get current network topology
     */
    getTopology(): Promise<NetworkTopology>;
    /**
     * Check if connected and registered
     */
    isReady(): boolean;
    /**
     * Get this node's ID
     */
    getNodeId(): string;
}
/**
 * Create a relay client
 */
export declare function createRelayClient(config: RelayConfig): RelayClient;
//# sourceMappingURL=client.d.ts.map