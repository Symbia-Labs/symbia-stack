/**
 * Network Service Telemetry
 *
 * Centralized telemetry for the Network Service.
 * Exports the telemetry client and helper functions for consistent instrumentation.
 */

import { createTelemetryClient } from '@symbia/logging-client';
import { config } from './config.js';

/**
 * Telemetry client instance for the Network Service
 */
export const telemetry = createTelemetryClient({
  serviceId: process.env.TELEMETRY_SERVICE_ID || config.serviceId,
});

/**
 * Metric names used throughout the Network Service
 */
export const NetworkMetrics = {
  // Event routing metrics
  EVENT_ROUTED: 'network.event.routed',
  EVENT_DROPPED: 'network.event.dropped',
  EVENT_ERROR: 'network.event.error',
  EVENT_LATENCY: 'network.event.latency_ms',
  EVENT_DELIVERY_SUCCESS: 'network.event.delivery.success',
  EVENT_DELIVERY_FAILURE: 'network.event.delivery.failure',

  // Node lifecycle metrics
  NODE_REGISTERED: 'network.node.registered',
  NODE_UNREGISTERED: 'network.node.unregistered',
  NODE_HEARTBEAT: 'network.node.heartbeat',
  NODE_STALE_CLEANUP: 'network.node.stale_cleanup',
  NODE_ACTIVE_COUNT: 'network.node.active_count',

  // Contract metrics
  CONTRACT_CREATED: 'network.contract.created',
  CONTRACT_DELETED: 'network.contract.deleted',
  CONTRACT_EXPIRED: 'network.contract.expired',
  CONTRACT_ACTIVE_COUNT: 'network.contract.active_count',

  // Bridge metrics
  BRIDGE_REGISTERED: 'network.bridge.registered',
  BRIDGE_DELETED: 'network.bridge.deleted',
  BRIDGE_ACTIVE_COUNT: 'network.bridge.active_count',

  // Policy metrics
  POLICY_EVALUATED: 'network.policy.evaluated',
  POLICY_DENIED: 'network.policy.denied',
  POLICY_ALLOWED: 'network.policy.allowed',
  POLICY_EVALUATION_LATENCY: 'network.policy.evaluation_latency_ms',

  // Hash verification metrics
  HASH_VERIFIED: 'network.hash.verified',
  HASH_FAILED: 'network.hash.failed',

  // WebSocket metrics
  SOCKET_CONNECTED: 'network.socket.connected',
  SOCKET_DISCONNECTED: 'network.socket.disconnected',
  SOCKET_MESSAGE_RECEIVED: 'network.socket.message_received',

  // Agent authentication metrics
  AGENT_AUTH_SUCCESS: 'network.agent.auth.success',
  AGENT_AUTH_FAILURE: 'network.agent.auth.failure',

  // User authentication metrics
  USER_AUTH_SUCCESS: 'network.user.auth.success',
  USER_AUTH_FAILURE: 'network.user.auth.failure',

  // Permission check metrics
  PERMISSION_DENIED: 'network.permission.denied',

  // SDN watch metrics
  SDN_WATCH_SUBSCRIBED: 'network.sdn.watch.subscribed',
  SDN_WATCH_UNSUBSCRIBED: 'network.sdn.watch.unsubscribed',
  SDN_WATCH_ACTIVE_COUNT: 'network.sdn.watch.active_count',
} as const;

/**
 * Event types used throughout the Network Service
 */
export const NetworkEvents = {
  // Service lifecycle
  SERVICE_STARTED: 'network.service.started',
  SERVICE_STOPPED: 'network.service.stopped',

  // Event routing
  EVENT_ROUTED: 'network.event.routed',
  EVENT_DROPPED: 'network.event.dropped',
  EVENT_DELIVERY_FAILED: 'network.event.delivery_failed',

  // Node lifecycle
  NODE_REGISTERED: 'network.node.registered',
  NODE_UNREGISTERED: 'network.node.unregistered',
  NODE_STALE_CLEANUP: 'network.node.stale_cleanup',
  NODE_HEARTBEAT_MISSED: 'network.node.heartbeat_missed',

  // Contract lifecycle
  CONTRACT_CREATED: 'network.contract.created',
  CONTRACT_DELETED: 'network.contract.deleted',
  CONTRACT_EXPIRED: 'network.contract.expired',

  // Bridge lifecycle
  BRIDGE_REGISTERED: 'network.bridge.registered',
  BRIDGE_DELETED: 'network.bridge.deleted',
  BRIDGE_STATUS_CHANGED: 'network.bridge.status_changed',

  // Policy events
  POLICY_CREATED: 'network.policy.created',
  POLICY_UPDATED: 'network.policy.updated',
  POLICY_DELETED: 'network.policy.deleted',
  POLICY_DENIED: 'network.policy.denied',

  // Security events
  HASH_VERIFICATION_FAILED: 'network.security.hash_failed',
  AGENT_AUTH_SUCCESS: 'network.agent.authenticated',
  AGENT_AUTH_FAILURE: 'network.agent.auth_failed',
  USER_AUTH_SUCCESS: 'network.user.authenticated',
  USER_AUTH_FAILURE: 'network.user.auth_failed',
  PERMISSION_DENIED: 'network.permission.denied',

  // WebSocket events
  SOCKET_CONNECTED: 'network.socket.connected',
  SOCKET_DISCONNECTED: 'network.socket.disconnected',

  // SDN events
  SDN_WATCH_STARTED: 'network.sdn.watch.started',
  SDN_WATCH_STOPPED: 'network.sdn.watch.stopped',
  TOPOLOGY_CHANGED: 'network.topology.changed',
} as const;
