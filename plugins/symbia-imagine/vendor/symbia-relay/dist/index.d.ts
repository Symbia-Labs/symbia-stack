/**
 * @symbia/relay
 *
 * Client library for connecting to the Symbia Network Service.
 *
 * Usage:
 *
 * ```typescript
 * import { createRelayClient } from '@symbia/relay';
 *
 * const relay = createRelayClient({
 *   nodeId: 'messaging:main',
 *   nodeName: 'Messaging Service',
 *   nodeType: 'service',
 *   capabilities: ['messaging.send', 'messaging.receive'],
 * });
 *
 * await relay.connect();
 *
 * // Send an event
 * await relay.send(
 *   { type: 'message.sent', data: { conversationId: '123', content: 'Hello' } },
 *   'run_abc123'
 * );
 *
 * // Listen for events
 * relay.onEvent('message.received', (event) => {
 *   console.log('Received message:', event.payload.data);
 * });
 *
 * // Watch network activity (SDN)
 * await relay.watch({ runId: 'run_abc123' }, (event, trace) => {
 *   console.log('Event flow:', trace);
 * });
 * ```
 */
export { RelayClient, createRelayClient } from './client.js';
export { initServiceRelay, getRelay, emitEvent, shutdownRelay, createServiceContract, type ServiceRelayConfig, initAgentRelay, getAgentRelay, sendAgentMessage, sendAgentRequest, disconnectAgentRelay, disconnectAllAgentRelays, type AgentRelayConfig, emitClaim, emitDefer, emitObserve, emitRespond, waitForClaimWindow, registerExternalClaim, type AssistantJustification, type AssistantClaim, emitHttpRequest, emitHttpResponse, emitDbQuery, emitDbSlowQuery, emitCacheHit, emitCacheMiss, emitObservabilityError, emitProcessMetrics, emitCurrentProcessMetrics, startProcessMetricsInterval, type ObservabilityEventType, type HttpRequestEvent, type HttpResponseEvent, type DbQueryEvent, type ProcessMetricsEvent, type ObservabilityErrorEvent, } from './integration.js';
export type { RelayConfig, SendEventOptions, WatchFilter, SandboxEvent, EventPayload, EventWrapper, EventTrace, TraceHop, NetworkNode, NodeContract, NetworkTopology, NetworkBridge, AgentEventType, AgentMessagePayload, AgentPrincipal, } from './types.js';
export { observabilityMiddleware, timingMiddleware, type ObservabilityMiddlewareOptions, } from './middleware.js';
export { installFetchTracePropagation, currentTrace, withTrace, mintTraceId, traceIdFromHeaders, callerFromHeaders, originFromHeaders, isTrafficOrigin, TRACE_HEADER, CALLER_HEADER, ORIGIN_HEADER, TRAFFIC_ORIGINS, type TraceContext, type TrafficOrigin, } from './trace-context.js';
//# sourceMappingURL=index.d.ts.map