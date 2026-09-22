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
export { 
// Service integration
initServiceRelay, getRelay, emitEvent, shutdownRelay, createServiceContract, 
// Agent integration
initAgentRelay, getAgentRelay, sendAgentMessage, sendAgentRequest, disconnectAgentRelay, disconnectAllAgentRelays, 
// Justification event protocol
emitClaim, emitDefer, emitObserve, emitRespond, waitForClaimWindow, registerExternalClaim, 
// Ephemeral observability
emitHttpRequest, emitHttpResponse, emitDbQuery, emitDbSlowQuery, emitCacheHit, emitCacheMiss, emitObservabilityError, emitProcessMetrics, emitCurrentProcessMetrics, startProcessMetricsInterval, } from './integration.js';
// Express middleware for automatic HTTP observability
export { observabilityMiddleware, timingMiddleware, } from './middleware.js';
// Trace context. One id carried across a request's whole journey, so the
// topology graph can draw edges it OBSERVED rather than edges someone declared.
export { installFetchTracePropagation, currentTrace, withTrace, mintTraceId, traceIdFromHeaders, callerFromHeaders, originFromHeaders, isTrafficOrigin, TRACE_HEADER, CALLER_HEADER, ORIGIN_HEADER, TRAFFIC_ORIGINS, } from './trace-context.js';
//# sourceMappingURL=index.js.map