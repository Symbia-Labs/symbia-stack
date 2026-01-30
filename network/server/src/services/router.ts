/**
 * Router Service
 *
 * Handles event routing between nodes with policy enforcement.
 * Tracks event history for tracing and debugging.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  SandboxEvent,
  EventPayload,
  EventWrapper,
  EventTrace,
  TraceHop,
  RoutingPolicy,
  PolicyCondition,
} from '../types.js';
import { config } from '../config.js';
import * as registry from './registry.js';
import * as policy from './policy.js';
import { telemetry, NetworkEvents, NetworkMetrics } from '../telemetry.js';

// Event history for tracing (ring buffer)
const eventHistory: SandboxEvent[] = [];
const traces = new Map<string, EventTrace>();

// Active subscriptions for live event watching
type EventHandler = (event: SandboxEvent, trace: EventTrace) => void;
const eventHandlers = new Map<string, EventHandler>();

/**
 * Create a new sandbox event
 *
 * Supports both node-based and entity-based addressing:
 * - Node IDs: Direct network node targeting (e.g., "service:messaging")
 * - Entity IDs: Resolved via Entity Directory (e.g., "ent_abc123")
 *
 * When entity IDs are provided, they are stored in the wrapper and resolved
 * to node IDs during routing.
 */
export function createEvent(
  payload: EventPayload,
  source: string,
  runId: string,
  options: {
    target?: string;
    causedBy?: string;
    boundary?: EventWrapper['boundary'];
    sourceEntityId?: string;   // Entity UUID of the source
    targetEntityId?: string;   // Entity UUID of the target
  } = {}
): SandboxEvent {
  const wrapper: EventWrapper = {
    id: uuidv4(),
    runId,
    timestamp: new Date().toISOString(),
    source,
    target: options.target,
    causedBy: options.causedBy,
    path: [source],
    boundary: options.boundary || 'intra',
    // Entity-based addressing
    sourceEntityId: options.sourceEntityId,
    targetEntityId: options.targetEntityId,
  };

  const hash = policy.computeEventHash(payload, wrapper);

  return { payload, wrapper, hash };
}

/**
 * Route an event through the network
 */
export async function routeEvent(event: SandboxEvent): Promise<EventTrace> {
  const startTime = Date.now();
  const trace: EventTrace = {
    eventId: event.wrapper.id,
    runId: event.wrapper.runId,
    path: [],
    totalDurationMs: 0,
    status: 'pending',
  };

  const eventLabels = {
    eventType: event.payload.type,
    boundary: event.wrapper.boundary,
    source: event.wrapper.source,
    runId: event.wrapper.runId,
  };

  try {
    // Verify the event hash is valid
    const isValid = policy.verifyEventHash(event);
    if (!isValid) {
      trace.status = 'error';
      trace.error = 'Invalid event hash - security policy violation';

      telemetry.event(
        NetworkEvents.HASH_VERIFICATION_FAILED,
        `Hash verification failed for event ${event.wrapper.id}`,
        { eventId: event.wrapper.id, ...eventLabels },
        'warn'
      );
      telemetry.metric(NetworkMetrics.HASH_FAILED, 1, eventLabels);
      telemetry.metric(NetworkMetrics.EVENT_ERROR, 1, { ...eventLabels, reason: 'hash_invalid' });

      return finishTrace(trace, startTime, event);
    }

    telemetry.metric(NetworkMetrics.HASH_VERIFIED, 1, eventLabels);

    // Get source node
    const sourceNode = registry.getNode(event.wrapper.source);
    if (!sourceNode) {
      trace.status = 'error';
      trace.error = `Source node not found: ${event.wrapper.source}`;

      telemetry.metric(NetworkMetrics.EVENT_ERROR, 1, { ...eventLabels, reason: 'source_not_found' });

      return finishTrace(trace, startTime, event);
    }

    // Determine target(s)
    // Supports both node-based and entity-based targeting
    let targets: string[] = [];

    // First, try entity-based targeting if targetEntityId is provided
    if (event.wrapper.targetEntityId) {
      const targetNode = registry.getNodeByEntityId(event.wrapper.targetEntityId);
      if (targetNode) {
        targets = [targetNode.id];
        telemetry.event(
          NetworkEvents.EVENT_ROUTED,
          `Resolved entity ${event.wrapper.targetEntityId} to node ${targetNode.id}`,
          { eventId: event.wrapper.id, entityId: event.wrapper.targetEntityId, nodeId: targetNode.id, ...eventLabels }
        );
      } else {
        // Entity exists but isn't connected - event cannot be delivered
        trace.status = 'dropped';
        trace.error = `Target entity not connected: ${event.wrapper.targetEntityId}`;

        telemetry.event(
          NetworkEvents.EVENT_DROPPED,
          `Event dropped - target entity not connected: ${event.wrapper.targetEntityId}`,
          { eventId: event.wrapper.id, targetEntityId: event.wrapper.targetEntityId, reason: 'entity_not_connected', ...eventLabels },
          'warn'
        );
        telemetry.metric(NetworkMetrics.EVENT_DROPPED, 1, { ...eventLabels, reason: 'entity_not_connected' });

        return finishTrace(trace, startTime, event);
      }
    } else if (event.wrapper.target) {
      // Direct node-based targeting
      targets = [event.wrapper.target];
    } else {
      // Broadcast to all nodes with contracts from source
      const sourceContracts = registry.getContractsForNode(event.wrapper.source);
      console.log(`[Router] Finding contracts for source: ${event.wrapper.source}`);
      console.log(`[Router] Found ${sourceContracts.length} contracts involving this node`);

      const validContracts = sourceContracts
        .filter((c) => c.from === event.wrapper.source)
        .filter((c) => {
          // Check if event type matches
          for (const allowed of c.allowedEventTypes) {
            if (allowed === '*') {
              console.log(`[Router] Contract ${c.id}: wildcard match (*)`);
              return true;
            }
            if (allowed === event.payload.type) {
              console.log(`[Router] Contract ${c.id}: exact match (${allowed})`);
              return true;
            }
            // Support wildcard suffix (e.g., 'message.*' matches 'message.new')
            if (allowed.endsWith('.*')) {
              const prefix = allowed.slice(0, -2);
              if (event.payload.type.startsWith(prefix + '.')) {
                console.log(`[Router] Contract ${c.id}: prefix match (${allowed} -> ${event.payload.type})`);
                return true;
              }
            }
          }
          console.log(`[Router] Contract ${c.from} → ${c.to}: no match for ${event.payload.type} in [${c.allowedEventTypes.join(', ')}]`);
          return false;
        })
        .filter((c) => {
          const boundaryMatch = c.boundaries.includes(event.wrapper.boundary);
          if (!boundaryMatch) {
            console.log(`[Router] Contract ${c.from} → ${c.to}: boundary mismatch (${event.wrapper.boundary} not in [${c.boundaries.join(', ')}])`);
          }
          return boundaryMatch;
        });

      console.log(`[Router] Found ${validContracts.length} valid contracts for event type ${event.payload.type}`);

      // Collect targets, handling wildcards
      for (const contract of validContracts) {
        if (contract.to === '*') {
          // Wildcard target - add all nodes except source
          const allNodes = registry.getAllNodes();
          console.log(`[Router] Contract has wildcard target (*), adding ${allNodes.length - 1} nodes`);
          for (const node of allNodes) {
            if (node.id !== event.wrapper.source && !targets.includes(node.id)) {
              targets.push(node.id);
            }
          }
        } else if (!targets.includes(contract.to)) {
          console.log(`[Router] Adding target from contract: ${contract.to}`);
          targets.push(contract.to);
        }
      }

      console.log(`[Router] Final targets: [${targets.join(', ')}]`);
    }

    if (targets.length === 0) {
      trace.status = 'dropped';
      trace.error = 'No valid targets for event';

      telemetry.event(
        NetworkEvents.EVENT_DROPPED,
        `Event dropped - no valid targets: ${event.wrapper.id}`,
        { eventId: event.wrapper.id, reason: 'no_targets', ...eventLabels }
      );
      telemetry.metric(NetworkMetrics.EVENT_DROPPED, 1, { ...eventLabels, reason: 'no_targets' });

      return finishTrace(trace, startTime, event);
    }

    // Apply routing policies
    const policyStartTime = Date.now();
    const policyResult = policy.evaluatePolicies(event);
    const policyDuration = Date.now() - policyStartTime;

    telemetry.metric(NetworkMetrics.POLICY_EVALUATION_LATENCY, policyDuration, eventLabels);
    telemetry.metric(NetworkMetrics.POLICY_EVALUATED, 1, { ...eventLabels, policyId: policyResult.policyId });

    if (policyResult.action.type === 'deny') {
      trace.status = 'dropped';
      trace.error = policyResult.action.reason || 'Denied by policy';
      trace.path.push({
        node: event.wrapper.source,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        policyId: policyResult.policyId,
        action: 'drop',
      });

      telemetry.event(
        NetworkEvents.POLICY_DENIED,
        `Event denied by policy: ${policyResult.policyId}`,
        { eventId: event.wrapper.id, policyId: policyResult.policyId, reason: policyResult.action.reason, ...eventLabels },
        'warn'
      );
      telemetry.metric(NetworkMetrics.POLICY_DENIED, 1, { ...eventLabels, policyId: policyResult.policyId });
      telemetry.metric(NetworkMetrics.EVENT_DROPPED, 1, { ...eventLabels, reason: 'policy_denied' });

      return finishTrace(trace, startTime, event);
    }

    telemetry.metric(NetworkMetrics.POLICY_ALLOWED, 1, { ...eventLabels, policyId: policyResult.policyId });

    // Route to each target
    let deliverySuccessCount = 0;
    let deliveryFailureCount = 0;

    for (const targetId of targets) {
      const hopStart = Date.now();
      const targetNode = registry.getNode(targetId);

      if (!targetNode) {
        trace.path.push({
          node: targetId,
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - hopStart,
          action: 'drop',
        });
        deliveryFailureCount++;
        telemetry.metric(NetworkMetrics.EVENT_DELIVERY_FAILURE, 1, { ...eventLabels, target: targetId, reason: 'target_not_found' });
        continue;
      }

      // Update event path
      event.wrapper.path.push(targetId);

      // Deliver to target
      const delivered = await deliverToNode(event, targetNode);

      trace.path.push({
        node: targetId,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - hopStart,
        policyId: policyResult.policyId,
        action: delivered ? 'deliver' : 'drop',
      });

      if (delivered) {
        deliverySuccessCount++;
        telemetry.metric(NetworkMetrics.EVENT_DELIVERY_SUCCESS, 1, { ...eventLabels, target: targetId });
      } else {
        deliveryFailureCount++;
        telemetry.metric(NetworkMetrics.EVENT_DELIVERY_FAILURE, 1, { ...eventLabels, target: targetId, reason: 'delivery_failed' });
        telemetry.event(
          NetworkEvents.EVENT_DELIVERY_FAILED,
          `Failed to deliver event to ${targetId}`,
          { eventId: event.wrapper.id, target: targetId, ...eventLabels },
          'warn'
        );
      }
    }

    // Determine final status
    const deliveredCount = trace.path.filter((h) => h.action === 'deliver').length;
    trace.status = deliveredCount > 0 ? 'delivered' : 'dropped';

    // Record final routing metrics
    if (trace.status === 'delivered') {
      telemetry.event(
        NetworkEvents.EVENT_ROUTED,
        `Event routed successfully to ${deliverySuccessCount} targets`,
        { eventId: event.wrapper.id, targetCount: targets.length, deliveredCount: deliverySuccessCount, ...eventLabels }
      );
      telemetry.metric(NetworkMetrics.EVENT_ROUTED, 1, eventLabels);
    } else {
      telemetry.event(
        NetworkEvents.EVENT_DROPPED,
        `Event dropped - all deliveries failed`,
        { eventId: event.wrapper.id, targetCount: targets.length, reason: 'all_deliveries_failed', ...eventLabels }
      );
      telemetry.metric(NetworkMetrics.EVENT_DROPPED, 1, { ...eventLabels, reason: 'all_deliveries_failed' });
    }

    return finishTrace(trace, startTime, event);
  } catch (error) {
    trace.status = 'error';
    trace.error = error instanceof Error ? error.message : 'Unknown error';

    telemetry.event(
      NetworkEvents.EVENT_DROPPED,
      `Event routing error: ${trace.error}`,
      { eventId: event.wrapper.id, error: trace.error, ...eventLabels },
      'error'
    );
    telemetry.metric(NetworkMetrics.EVENT_ERROR, 1, { ...eventLabels, reason: 'exception' });

    return finishTrace(trace, startTime, event);
  }
}

/**
 * Deliver event to a specific node
 */
async function deliverToNode(event: SandboxEvent, node: { socketId?: string; endpoint: string }): Promise<boolean> {
  // If node has a socket connection, delivery happens via socket broadcast
  if (node.socketId) {
    return true;
  }

  // Otherwise, try HTTP delivery
  try {
    const response = await fetch(node.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Symbia-Event-Id': event.wrapper.id,
        'X-Symbia-Run-Id': event.wrapper.runId,
      },
      body: JSON.stringify(event),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Complete a trace and store it, then notify watchers
 */
function finishTrace(trace: EventTrace, startTime: number, event?: SandboxEvent): EventTrace {
  trace.totalDurationMs = Date.now() - startTime;
  traces.set(trace.eventId, trace);

  // Record latency metric
  const labels = event ? {
    eventType: event.payload.type,
    boundary: event.wrapper.boundary,
    status: trace.status,
  } : { status: trace.status };
  telemetry.metric(NetworkMetrics.EVENT_LATENCY, trace.totalDurationMs, labels);

  // Cleanup old traces if over limit
  if (traces.size > config.maxTraceHistorySize) {
    const oldest = Array.from(traces.keys()).slice(0, traces.size - config.maxTraceHistorySize);
    for (const id of oldest) {
      traces.delete(id);
    }
  }

  // Notify all watchers of this event (for real-time streaming)
  if (event) {
    notifyHandlers(event, trace);
  }

  return trace;
}

/**
 * Store event in history
 */
export function recordEvent(event: SandboxEvent): void {
  eventHistory.push(event);
  if (eventHistory.length > config.maxEventHistorySize) {
    eventHistory.shift();
  }
}

/**
 * Get event trace by ID
 */
export function getTrace(eventId: string): EventTrace | undefined {
  return traces.get(eventId);
}

/**
 * Get traces for a run
 */
export function getTracesForRun(runId: string): EventTrace[] {
  return Array.from(traces.values()).filter((t) => t.runId === runId);
}

/**
 * Get recent events
 */
export function getRecentEvents(limit: number = 100): SandboxEvent[] {
  return eventHistory.slice(-limit);
}

/**
 * Get events for a specific run
 */
export function getEventsForRun(runId: string, limit: number = 100): SandboxEvent[] {
  return eventHistory
    .filter((e) => e.wrapper.runId === runId)
    .slice(-limit);
}

/**
 * Subscribe to live event updates
 */
export function subscribeToEvents(
  subscriptionId: string,
  handler: EventHandler
): void {
  eventHandlers.set(subscriptionId, handler);
}

/**
 * Unsubscribe from event updates
 */
export function unsubscribeFromEvents(subscriptionId: string): void {
  eventHandlers.delete(subscriptionId);
}

/**
 * Notify all handlers of an event
 */
function notifyHandlers(event: SandboxEvent, trace: EventTrace): void {
  for (const handler of eventHandlers.values()) {
    try {
      handler(event, trace);
    } catch {
      // Ignore handler errors
    }
  }
}

/**
 * Get routing statistics
 */
export function getStats(): {
  totalEvents: number;
  totalTraces: number;
  deliveredCount: number;
  droppedCount: number;
  errorCount: number;
} {
  const traceList = Array.from(traces.values());
  return {
    totalEvents: eventHistory.length,
    totalTraces: traceList.length,
    deliveredCount: traceList.filter((t) => t.status === 'delivered').length,
    droppedCount: traceList.filter((t) => t.status === 'dropped').length,
    errorCount: traceList.filter((t) => t.status === 'error').length,
  };
}
