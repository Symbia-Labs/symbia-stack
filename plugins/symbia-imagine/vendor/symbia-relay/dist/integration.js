/**
 * Service Integration Helper
 *
 * Provides easy integration of the relay client into Symbia services.
 * Call initServiceRelay() during service startup to connect to the network.
 */
import { createRelayClient } from './client.js';
import { ServiceId, resolveServiceUrl, serviceDisplayName } from '@symbia/sys';
let globalRelay = null;
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
export async function initServiceRelay(config) {
    // Check if relay is disabled
    if (config.enabled === false || process.env.NETWORK_RELAY_ENABLED === 'false') {
        console.log('[Relay] Network relay disabled');
        return null;
    }
    // Check if network URL is configured - use @symbia/sys for resolution
    const networkUrl = config.networkUrl
        || process.env.NETWORK_ENDPOINT
        || process.env.NETWORK_SERVICE_URL
        || resolveServiceUrl(ServiceId.NETWORK);
    // Skip if explicitly set to skip
    if (networkUrl === 'none' || networkUrl === 'disabled') {
        console.log('[Relay] Network relay explicitly disabled via URL');
        return null;
    }
    const port = process.env.PORT || '5000';
    const host = process.env.HOST || 'localhost';
    try {
        globalRelay = createRelayClient({
            networkUrl,
            nodeId: config.serviceId,
            nodeName: config.serviceName || serviceDisplayName(config.serviceId),
            nodeType: 'service',
            capabilities: config.capabilities || [],
            endpoint: `http://${host}:${port}/api/network/receive`,
            metadata: {
                startedAt: new Date().toISOString(),
                version: process.env.npm_package_version || '1.0.0',
            },
        });
        await globalRelay.connect();
        console.log(`[Relay] Connected to network at ${networkUrl}`);
        // Register event handlers
        if (config.eventHandlers) {
            for (const [eventType, handler] of Object.entries(config.eventHandlers)) {
                globalRelay.onEvent(eventType, (event) => {
                    Promise.resolve(handler(event)).catch((err) => {
                        console.error(`[Relay] Event handler error for ${eventType}:`, err);
                    });
                });
            }
        }
        return globalRelay;
    }
    catch (error) {
        // KEEP THE CLIENT.
        //
        // This used to set globalRelay = null, which made a transient startup race
        // permanent. Services that came up before the network service — measured 7
        // Aug 2026: identity, catalog and messaging — logged "xhr poll error" once
        // and never emitted an observability event again, for the entire life of
        // the process. Their Service Observation dashboards were empty and nothing
        // anywhere said why.
        //
        // The socket underneath is still retrying: connect() rejects on the FIRST
        // connect_error, but Socket.IO's own reconnection keeps going and the
        // client re-registers on every 'connect'. Throwing away the reference was
        // the only thing stopping recovery. emitEvent already gates on isReady(),
        // so holding a not-yet-connected client is safe — it no-ops until the
        // socket is actually up, then starts working on its own.
        console.log(`[Relay] Not connected yet: ${error instanceof Error ? error.message : error}`);
        console.log('[Relay] Events will not be emitted until the network service is reachable. Retrying in the background.');
        return globalRelay;
    }
}
/**
 * Get the global relay client instance
 *
 * Returns null if relay is not initialized or disabled.
 */
export function getRelay() {
    return globalRelay;
}
/**
 * Send an event via the relay if connected
 *
 * Silently no-ops if relay is not connected.
 */
export async function emitEvent(type, data, runId, options) {
    if (!globalRelay || !globalRelay.isReady()) {
        return null;
    }
    try {
        return await globalRelay.send({ type, data }, runId, options);
    }
    catch (error) {
        console.error(`[Relay] Failed to emit event ${type}:`, error);
        return null;
    }
}
/**
 * Shutdown the relay client
 *
 * Call this during service shutdown.
 */
export async function shutdownRelay() {
    if (globalRelay) {
        await globalRelay.disconnect();
        globalRelay = null;
    }
}
/**
 * Create contracts with other services
 */
export async function createServiceContract(targetServiceId, allowedEventTypes, boundaries = ['intra']) {
    if (!globalRelay || !globalRelay.isReady()) {
        console.log('[Relay] Cannot create contract - not connected');
        return;
    }
    try {
        await globalRelay.createContract(targetServiceId, allowedEventTypes, boundaries);
        console.log(`[Relay] Contract created with ${targetServiceId}`);
    }
    catch (error) {
        console.error(`[Relay] Failed to create contract:`, error);
    }
}
// Per-agent relay instances (agents may run multiple in same process)
const agentRelays = new Map();
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
export async function initAgentRelay(config) {
    const networkUrl = config.networkUrl
        || process.env.NETWORK_ENDPOINT
        || process.env.NETWORK_SERVICE_URL
        || resolveServiceUrl(ServiceId.NETWORK);
    // Use agentId as the node ID for routing
    const relay = createRelayClient({
        networkUrl,
        nodeId: config.agentId,
        nodeName: config.agentName,
        nodeType: 'assistant',
        capabilities: config.capabilities || [],
        authToken: config.authToken,
        metadata: {
            authenticatedAt: new Date().toISOString(),
        },
    });
    await relay.connect();
    console.log(`[Relay] Agent ${config.agentId} connected to network`);
    // Register event handlers
    if (config.eventHandlers) {
        for (const [eventType, handler] of Object.entries(config.eventHandlers)) {
            relay.onEvent(eventType, (event) => {
                Promise.resolve(handler(event)).catch((err) => {
                    console.error(`[Relay] Agent event handler error for ${eventType}:`, err);
                });
            });
        }
    }
    agentRelays.set(config.agentId, relay);
    return relay;
}
/**
 * Get an agent's relay client
 */
export function getAgentRelay(agentId) {
    return agentRelays.get(agentId);
}
/**
 * Send a message to another agent
 *
 * @param targetAgentId - The target agent's ID (e.g., "assistant:support")
 * @param message - The message payload
 * @param runId - Workflow/context run ID
 * @param fromAgentId - Source agent ID (optional if only one agent in process)
 */
export async function sendAgentMessage(targetAgentId, message, runId, fromAgentId) {
    // Find the source relay
    let relay;
    if (fromAgentId) {
        relay = agentRelays.get(fromAgentId);
    }
    else if (agentRelays.size === 1) {
        relay = agentRelays.values().next().value;
    }
    if (!relay || !relay.isReady()) {
        console.error('[Relay] No agent relay available to send message');
        return null;
    }
    const payload = {
        type: 'agent.message',
        data: message,
    };
    try {
        return await relay.send(payload, runId, {
            target: targetAgentId,
            boundary: 'inter',
        });
    }
    catch (error) {
        console.error(`[Relay] Failed to send agent message to ${targetAgentId}:`, error);
        return null;
    }
}
/**
 * Send a request to another agent and await response
 *
 * @param targetAgentId - The target agent's ID
 * @param request - The request payload
 * @param runId - Workflow/context run ID
 * @param timeoutMs - Timeout in milliseconds (default: 30000)
 * @param fromAgentId - Source agent ID
 */
export async function sendAgentRequest(targetAgentId, request, runId, timeoutMs = 30000, fromAgentId) {
    let relay;
    if (fromAgentId) {
        relay = agentRelays.get(fromAgentId);
    }
    else if (agentRelays.size === 1) {
        relay = agentRelays.values().next().value;
    }
    if (!relay || !relay.isReady()) {
        return { error: 'No agent relay available' };
    }
    const correlationId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    // Set up response listener
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            unsubscribe();
            resolve({ error: `Request timed out after ${timeoutMs}ms` });
        }, timeoutMs);
        const unsubscribe = relay.onEvent('agent.response', (event) => {
            const data = event.payload.data;
            if (data.correlationId === correlationId) {
                clearTimeout(timeout);
                unsubscribe();
                resolve({
                    response: data.content,
                    eventId: event.wrapper.id,
                });
            }
        });
        // Also handle error responses
        const unsubError = relay.onEvent('agent.error', (event) => {
            const data = event.payload.data;
            if (data.correlationId === correlationId) {
                clearTimeout(timeout);
                unsubscribe();
                unsubError();
                resolve({
                    error: String(data.content) || 'Agent error',
                });
            }
        });
        // Send the request
        const payload = {
            type: 'agent.request',
            data: {
                content: request.content,
                correlationId,
                ttlMs: timeoutMs,
                metadata: request.metadata,
            },
        };
        relay.send(payload, runId, {
            target: targetAgentId,
            boundary: 'inter',
        }).catch((err) => {
            clearTimeout(timeout);
            unsubscribe();
            unsubError();
            resolve({ error: err.message });
        });
    });
}
/**
 * Disconnect an agent's relay
 */
export async function disconnectAgentRelay(agentId) {
    const relay = agentRelays.get(agentId);
    if (relay) {
        await relay.disconnect();
        agentRelays.delete(agentId);
        console.log(`[Relay] Agent ${agentId} disconnected`);
    }
}
/**
 * Disconnect all agent relays
 */
export async function disconnectAllAgentRelays() {
    for (const [agentId, relay] of agentRelays) {
        await relay.disconnect();
        console.log(`[Relay] Agent ${agentId} disconnected`);
    }
    agentRelays.clear();
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
export async function emitClaim(assistantKey, entityId, conversationId, justification, runId, claimTimeoutMs = 500) {
    const now = new Date();
    const claim = {
        claimedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + claimTimeoutMs).toISOString(),
        priority: Math.round(justification.confidence * 100), // Convert confidence to priority
    };
    const result = await emitEvent('assistant.intent.claim', {
        assistantKey,
        entityId,
        conversationId,
        justification,
        claim,
    }, runId, {
        boundary: 'intra',
    });
    if (result) {
        return { eventId: result.eventId, claim };
    }
    return null;
}
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
export async function emitDefer(assistantKey, entityId, conversationId, deferToKey, deferToEntityId, reason, runId) {
    const result = await emitEvent('assistant.intent.defer', {
        assistantKey,
        entityId,
        conversationId,
        deferTo: deferToKey,
        deferToEntityId,
        reason,
    }, runId, {
        boundary: 'intra',
    });
    return result ? { eventId: result.eventId } : null;
}
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
export async function emitObserve(assistantKey, entityId, conversationId, reason, runId) {
    const result = await emitEvent('assistant.action.observe', {
        assistantKey,
        entityId,
        conversationId,
        reason,
    }, runId, {
        boundary: 'intra',
    });
    return result ? { eventId: result.eventId } : null;
}
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
export async function emitRespond(assistantKey, entityId, conversationId, messageId, justification, runId) {
    const result = await emitEvent('assistant.action.respond', {
        assistantKey,
        entityId,
        conversationId,
        messageId,
        justification,
    }, runId, {
        target: 'service:messaging',
        boundary: 'intra',
    });
    return result ? { eventId: result.eventId } : null;
}
/**
 * Active claims by conversation ID for turn-taking
 */
const activeClaims = new Map();
/**
 * Emit an HTTP request observation event.
 * Call this when receiving an incoming request.
 */
export async function emitHttpRequest(data, runId) {
    const traceId = runId || data.traceId || `trace_${Date.now()}`;
    await emitEvent('obs.http.request', data, traceId, { boundary: 'intra' });
}
/**
 * Emit an HTTP response observation event.
 * Call this after sending a response.
 */
export async function emitHttpResponse(data, runId) {
    const traceId = runId || data.traceId || `trace_${Date.now()}`;
    await emitEvent('obs.http.response', data, traceId, { boundary: 'intra' });
}
/**
 * Emit a database query observation event.
 */
export async function emitDbQuery(data, runId) {
    await emitEvent('obs.db.query', data, runId, { boundary: 'intra' });
}
/**
 * Emit a slow query alert.
 */
export async function emitDbSlowQuery(data, runId) {
    await emitEvent('obs.db.slow', data, runId, { boundary: 'intra' });
}
/**
 * Emit cache hit/miss events.
 */
export async function emitCacheHit(key, store, runId) {
    await emitEvent('obs.cache.hit', { key, store }, runId, { boundary: 'intra' });
}
export async function emitCacheMiss(key, store, runId) {
    await emitEvent('obs.cache.miss', { key, store }, runId, { boundary: 'intra' });
}
/**
 * Emit an internal error event for observability.
 */
export async function emitObservabilityError(data, runId) {
    await emitEvent('obs.error', data, runId, { boundary: 'intra' });
}
/**
 * Emit process metrics snapshot.
 * Typically called on a timer (e.g., every 30s).
 */
export async function emitProcessMetrics(data, runId) {
    const traceId = runId || `metrics_${Date.now()}`;
    await emitEvent('obs.process.metrics', data, traceId, { boundary: 'intra' });
}
/**
 * Collect and emit current process metrics.
 * Convenience function that gathers Node.js process stats.
 */
export async function emitCurrentProcessMetrics(runId) {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    // Calculate approximate CPU percentage (rough estimate)
    const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000 / process.uptime() / 10;
    const data = {
        cpuPercent: Math.round(cpuPercent * 100) / 100,
        memoryMB: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100,
        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100,
        heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100,
        eventLoopLagMs: 0, // Would need perf_hooks for accurate measurement
        activeHandles: process._getActiveHandles?.()?.length || 0,
        uptime: Math.round(process.uptime()),
    };
    await emitProcessMetrics(data, runId);
}
/**
 * Start periodic process metrics emission.
 * Returns a function to stop the interval.
 */
export function startProcessMetricsInterval(intervalMs = 30000) {
    const timer = setInterval(() => {
        emitCurrentProcessMetrics().catch((err) => {
            console.error('[Relay] Failed to emit process metrics:', err);
        });
    }, intervalMs);
    return () => clearInterval(timer);
}
/**
 * Wait for the claim window to close, then determine if this assistant should proceed.
 * Returns true if this assistant has the highest priority claim.
 *
 * @param conversationId - The conversation
 * @param myAssistantKey - This assistant's key
 * @param myPriority - This assistant's priority
 * @param windowMs - Time to wait for competing claims (default: 500ms)
 */
export async function waitForClaimWindow(conversationId, myAssistantKey, myPriority, windowMs = 500) {
    // Register this claim
    const now = Date.now();
    const claim = {
        assistantKey: myAssistantKey,
        priority: myPriority,
        claimedAt: now,
        expiresAt: now + windowMs,
    };
    const claims = activeClaims.get(conversationId) || [];
    claims.push(claim);
    activeClaims.set(conversationId, claims);
    // Wait for the claim window
    await new Promise((resolve) => setTimeout(resolve, windowMs));
    // Get all claims for this conversation
    const allClaims = activeClaims.get(conversationId) || [];
    // Filter to only valid (not expired) claims within this window
    const validClaims = allClaims.filter((c) => c.claimedAt >= now - windowMs && c.expiresAt >= now);
    // Sort by priority (highest first)
    validClaims.sort((a, b) => b.priority - a.priority);
    // Clean up expired claims
    const remaining = allClaims.filter((c) => c.expiresAt > now);
    if (remaining.length > 0) {
        activeClaims.set(conversationId, remaining);
    }
    else {
        activeClaims.delete(conversationId);
    }
    // Check if this assistant won
    const winner = validClaims[0];
    const shouldProceed = winner?.assistantKey === myAssistantKey;
    return {
        shouldProceed,
        winningAssistant: winner?.assistantKey,
    };
}
/**
 * Register a claim received from another assistant (via SDN event).
 * Used to update the local claim tracking.
 */
export function registerExternalClaim(conversationId, assistantKey, priority, claimedAt, expiresAt) {
    const claim = {
        assistantKey,
        priority,
        claimedAt: new Date(claimedAt).getTime(),
        expiresAt: new Date(expiresAt).getTime(),
    };
    const claims = activeClaims.get(conversationId) || [];
    claims.push(claim);
    activeClaims.set(conversationId, claims);
}
//# sourceMappingURL=integration.js.map