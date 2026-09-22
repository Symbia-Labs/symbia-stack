/**
 * Service Integration Helper
 *
 * Provides easy integration of the relay client into Symbia services.
 * Call initServiceRelay() during service startup to connect to the network.
 */
import { RelayClient } from './client.js';
import type { SandboxEvent, EventTrace } from './types.js';
import type { TrafficOrigin } from './trace-context.js';
export interface ServiceRelayConfig {
    /** Service ID (e.g., 'symbia-messaging-service') */
    serviceId: string;
    /** Human-readable service name */
    /**
     * Display name. Optional: defaults to serviceDisplayName(serviceId), which
     * is the single source of truth. Pass one only if a service genuinely needs
     * to be called something other than its id — and note that three services
     * doing that independently is how the topology ended up listing nodes in
     * three different letter cases at once.
     */
    serviceName?: string;
    /** Capabilities this service provides */
    capabilities?: string[];
    /** Network service URL (default: from env or @symbia/sys resolution) */
    networkUrl?: string;
    /** Whether to enable relay (default: true, can disable in tests) */
    enabled?: boolean;
    /** Event handlers by type */
    eventHandlers?: Record<string, (event: SandboxEvent) => void | Promise<void>>;
}
/**
 * Initialize the relay client for a service
 *
 * Call this during service startup, after the HTTP server is listening.
 * The relay will automatically connect to the network service and register.
 *
 * @example
 * ```ts
 * import { initServiceRelay } from '@symbia/relay';
 * import { ServiceId } from '@symbia/sys';
 *
 * // In your service startup
 * await initServiceRelay({
 *   serviceId: ServiceId.MESSAGING,
 *   serviceName: 'Messaging Service',
 *   capabilities: ['messaging.send', 'messaging.receive'],
 * });
 * ```
 */
export declare function initServiceRelay(config: ServiceRelayConfig): Promise<RelayClient | null>;
/**
 * Get the global relay client instance
 *
 * Returns null if relay is not initialized or disabled.
 */
export declare function getRelay(): RelayClient | null;
/**
 * Send an event via the relay if connected
 *
 * Silently no-ops if relay is not connected.
 */
export declare function emitEvent(type: string, data: unknown, runId: string, options?: {
    target?: string;
    causedBy?: string;
    boundary?: 'intra' | 'inter' | 'extra';
}): Promise<{
    eventId: string;
    trace: EventTrace;
} | null>;
/**
 * Shutdown the relay client
 *
 * Call this during service shutdown.
 */
export declare function shutdownRelay(): Promise<void>;
/**
 * Create contracts with other services
 */
export declare function createServiceContract(targetServiceId: string, allowedEventTypes: string[], boundaries?: ('intra' | 'inter' | 'extra')[]): Promise<void>;
export interface AgentRelayConfig {
    /** Agent ID from Identity service (e.g., "assistant:onboarding") */
    agentId: string;
    /** Human-readable agent name */
    agentName: string;
    /** JWT token from agent login */
    authToken: string;
    /** Capabilities this agent has */
    capabilities?: string[];
    /** Network service URL (default: from env or @symbia/sys resolution) */
    networkUrl?: string;
    /** Event handlers by type */
    eventHandlers?: Record<string, (event: SandboxEvent) => void | Promise<void>>;
}
/**
 * Initialize a relay client for an agent
 *
 * Unlike services which use a global singleton, agents can have
 * multiple instances in the same process.
 *
 * @example
 * ```ts
 * import { initAgentRelay, sendAgentMessage } from '@symbia/relay';
 *
 * // After authenticating with Identity service
 * const relay = await initAgentRelay({
 *   agentId: 'assistant:onboarding',
 *   agentName: 'Onboarding Assistant',
 *   authToken: loginResponse.token,
 *   capabilities: ['cap:messaging.send', 'cap:messaging.receive'],
 * });
 *
 * // Listen for messages from other agents
 * relay.onEvent('agent.message', (event) => {
 *   console.log('Received:', event.payload.data);
 * });
 *
 * // Send a message to another agent
 * await sendAgentMessage('assistant:support', {
 *   content: { text: 'User needs help with billing' },
 *   priority: 'high',
 * }, 'run_123');
 * ```
 */
export declare function initAgentRelay(config: AgentRelayConfig): Promise<RelayClient>;
/**
 * Get an agent's relay client
 */
export declare function getAgentRelay(agentId: string): RelayClient | undefined;
/**
 * Send a message to another agent
 *
 * @param targetAgentId - The target agent's ID (e.g., "assistant:support")
 * @param message - The message payload
 * @param runId - Workflow/context run ID
 * @param fromAgentId - Source agent ID (optional if only one agent in process)
 */
export declare function sendAgentMessage(targetAgentId: string, message: {
    content: unknown;
    contentType?: 'json' | 'text' | 'binary';
    correlationId?: string;
    priority?: 'low' | 'normal' | 'high' | 'critical';
    ttlMs?: number;
    metadata?: Record<string, unknown>;
}, runId: string, fromAgentId?: string): Promise<{
    eventId: string;
    trace: EventTrace;
} | null>;
/**
 * Send a request to another agent and await response
 *
 * @param targetAgentId - The target agent's ID
 * @param request - The request payload
 * @param runId - Workflow/context run ID
 * @param timeoutMs - Timeout in milliseconds (default: 30000)
 * @param fromAgentId - Source agent ID
 */
export declare function sendAgentRequest(targetAgentId: string, request: {
    content: unknown;
    metadata?: Record<string, unknown>;
}, runId: string, timeoutMs?: number, fromAgentId?: string): Promise<{
    response: unknown;
    eventId: string;
} | {
    error: string;
}>;
/**
 * Disconnect an agent's relay
 */
export declare function disconnectAgentRelay(agentId: string): Promise<void>;
/**
 * Disconnect all agent relays
 */
export declare function disconnectAllAgentRelays(): Promise<void>;
/**
 * Justification payload structure for assistant actions.
 * Provides observability into why an assistant is acting.
 */
export interface AssistantJustification {
    /** Human-readable explanation */
    reason: string;
    /** Rule ID that triggered this action */
    triggerRule?: string;
    /** Conditions that evaluated true */
    conditions?: Array<{
        field: string;
        operator: string;
        value: string;
        matched: boolean;
    }>;
    /** Confidence score 0-1 */
    confidence: number;
    /** Alternative assistants that were considered */
    alternatives?: string[];
}
/**
 * Claim payload for turn-taking protocol.
 */
export interface AssistantClaim {
    /** When the claim was made */
    claimedAt: string;
    /** When the claim expires if not confirmed */
    expiresAt: string;
    /** Priority from rule configuration */
    priority: number;
}
/**
 * Emit an intent to claim a conversation turn.
 * Other assistants can see this claim and decide to defer or counter-claim.
 *
 * @param assistantKey - The assistant making the claim (e.g., "log-analyst")
 * @param entityId - The assistant's entity UUID
 * @param conversationId - The conversation being claimed
 * @param justification - Why this assistant wants to respond
 * @param runId - The run/trace ID for correlation
 * @param claimTimeoutMs - How long the claim is valid (default: 500ms)
 */
export declare function emitClaim(assistantKey: string, entityId: string | undefined, conversationId: string, justification: AssistantJustification, runId: string, claimTimeoutMs?: number): Promise<{
    eventId: string;
    claim: AssistantClaim;
} | null>;
/**
 * Emit an intent to defer to another assistant.
 * Used when this assistant determines another should respond.
 *
 * @param assistantKey - The deferring assistant
 * @param entityId - The assistant's entity UUID
 * @param conversationId - The conversation
 * @param deferToKey - The assistant to defer to
 * @param deferToEntityId - Entity UUID of the assistant to defer to
 * @param reason - Why this assistant is deferring
 * @param runId - The run/trace ID
 */
export declare function emitDefer(assistantKey: string, entityId: string | undefined, conversationId: string, deferToKey: string, deferToEntityId: string | undefined, reason: string, runId: string): Promise<{
    eventId: string;
} | null>;
/**
 * Emit an observation event (watching without responding).
 * Used when an assistant decides to monitor but not act.
 *
 * @param assistantKey - The observing assistant
 * @param entityId - The assistant's entity UUID
 * @param conversationId - The conversation
 * @param reason - Why the assistant is observing
 * @param runId - The run/trace ID
 */
export declare function emitObserve(assistantKey: string, entityId: string | undefined, conversationId: string, reason: string, runId: string): Promise<{
    eventId: string;
} | null>;
/**
 * Emit a response action with full justification.
 * This should be called after winning a claim or when no competing claims exist.
 *
 * @param assistantKey - The responding assistant
 * @param entityId - The assistant's entity UUID
 * @param conversationId - The conversation
 * @param messageId - The ID of the response message
 * @param justification - Full justification for the response
 * @param runId - The run/trace ID
 */
export declare function emitRespond(assistantKey: string, entityId: string | undefined, conversationId: string, messageId: string, justification: AssistantJustification, runId: string): Promise<{
    eventId: string;
} | null>;
/**
 * Observability event types for ephemeral service monitoring.
 * These events flow through the SDN and can be watched in real-time
 * without being persisted to the Logging service.
 */
export type ObservabilityEventType = 'obs.http.request' | 'obs.http.response' | 'obs.db.query' | 'obs.db.slow' | 'obs.cache.hit' | 'obs.cache.miss' | 'obs.error' | 'obs.process.metrics';
export interface HttpRequestEvent {
    method: string;
    path: string;
    /**
     * The service that made this call, from x-symbia-caller.
     *
     * This is what makes a graph EDGE — caller -> handler, directly, with no
     * correlation step. Absent means one of two things and they must not be
     * collapsed: a browser-originated request (browsers do not send it), or a
     * call made outside any request's async context, such as from a timer or a
     * socket handler.
     */
    caller?: string;
    /**
     * Why this request happened, from x-symbia-origin.
     *
     * Orthogonal to `caller` and to the wrapper's `boundary`: those say which
     * service and where, this says on whose behalf. A dashboard poll and a
     * person pressing Send were previously identical by every recorded field —
     * both `intra`, both called by `control-center`.
     *
     * Always present, because `unknown` is a value. Absence of a label is not
     * evidence of a human.
     */
    origin?: TrafficOrigin;
    query?: Record<string, string>;
    headers?: Record<string, string>;
    ip?: string;
    userAgent?: string;
    traceId?: string;
}
export interface HttpResponseEvent {
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
    /**
     * The service that made this call. Same value as on the matching request.
     *
     * It is on BOTH events on purpose. Anything counting calls must count one of
     * the pair, not both, and the response is the one carrying status and
     * duration — so the response is the one worth counting. Putting caller only
     * on the request made every consumer that counts responses see no caller at
     * all, which is precisely how the topology graph drew zero observed edges
     * while 147 of 300 events carried one.
     */
    caller?: string;
    /**
     * Why this request happened. On BOTH events for the same reason `caller` is:
     * consumers count responses, and a field that lives only on the request is
     * invisible to every one of them.
     */
    origin?: TrafficOrigin;
    size?: number;
    traceId?: string;
}
export interface DbQueryEvent {
    query: string;
    durationMs: number;
    rowCount?: number;
    table?: string;
}
export interface ProcessMetricsEvent {
    cpuPercent: number;
    memoryMB: number;
    heapUsedMB: number;
    heapTotalMB: number;
    eventLoopLagMs: number;
    activeHandles: number;
    uptime: number;
}
export interface ObservabilityErrorEvent {
    message: string;
    code?: string;
    stack?: string;
    context?: Record<string, unknown>;
}
/**
 * Emit an HTTP request observation event.
 * Call this when receiving an incoming request.
 */
export declare function emitHttpRequest(data: HttpRequestEvent, runId?: string): Promise<void>;
/**
 * Emit an HTTP response observation event.
 * Call this after sending a response.
 */
export declare function emitHttpResponse(data: HttpResponseEvent, runId?: string): Promise<void>;
/**
 * Emit a database query observation event.
 */
export declare function emitDbQuery(data: DbQueryEvent, runId: string): Promise<void>;
/**
 * Emit a slow query alert.
 */
export declare function emitDbSlowQuery(data: DbQueryEvent & {
    thresholdMs: number;
}, runId: string): Promise<void>;
/**
 * Emit cache hit/miss events.
 */
export declare function emitCacheHit(key: string, store: string, runId: string): Promise<void>;
export declare function emitCacheMiss(key: string, store: string, runId: string): Promise<void>;
/**
 * Emit an internal error event for observability.
 */
export declare function emitObservabilityError(data: ObservabilityErrorEvent, runId: string): Promise<void>;
/**
 * Emit process metrics snapshot.
 * Typically called on a timer (e.g., every 30s).
 */
export declare function emitProcessMetrics(data: ProcessMetricsEvent, runId?: string): Promise<void>;
/**
 * Collect and emit current process metrics.
 * Convenience function that gathers Node.js process stats.
 */
export declare function emitCurrentProcessMetrics(runId?: string): Promise<void>;
/**
 * Start periodic process metrics emission.
 * Returns a function to stop the interval.
 */
export declare function startProcessMetricsInterval(intervalMs?: number): () => void;
/**
 * Wait for the claim window to close, then determine if this assistant should proceed.
 * Returns true if this assistant has the highest priority claim.
 *
 * @param conversationId - The conversation
 * @param myAssistantKey - This assistant's key
 * @param myPriority - This assistant's priority
 * @param windowMs - Time to wait for competing claims (default: 500ms)
 */
export declare function waitForClaimWindow(conversationId: string, myAssistantKey: string, myPriority: number, windowMs?: number): Promise<{
    shouldProceed: boolean;
    winningAssistant?: string;
}>;
/**
 * Register a claim received from another assistant (via SDN event).
 * Used to update the local claim tracking.
 */
export declare function registerExternalClaim(conversationId: string, assistantKey: string, priority: number, claimedAt: string, expiresAt: string): void;
//# sourceMappingURL=integration.d.ts.map