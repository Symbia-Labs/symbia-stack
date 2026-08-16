// ../../network/server/src/routes.ts
import { ServiceId as ServiceId3, resolveServiceUrl as resolveServiceUrl2 } from "@symbia/sys";

// ../../network/server/src/config.ts
import { ServiceId, ServicePorts, resolveServiceUrl, resolveServicePort } from "@symbia/sys";
function getEnvArray(key, defaultValue) {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}
var config = {
  serviceId: ServiceId.NETWORK,
  // Derived. Was `parseInt(process.env.PORT || '5054', 10)` — a hardcoded
  // default in a file that already imports the registry holding it.
  port: resolveServicePort(ServiceId.NETWORK),
  host: process.env.HOST || "0.0.0.0",
  // CORS origins.
  //
  // I got this wrong on 6 Aug and a browser caught it. I trimmed this list to
  // only the Vite dev server on 5173 — a port that no longer exists — and did
  // not add 8000, where the console now actually lives. Measured:
  //
  //   Origin: http://localhost:5173  ->  101 Switching Protocols
  //   Origin: http://localhost:8000  ->  400 Bad Request
  //
  // HTTP calls were fine because they are genuinely same-origin through the
  // /svc proxy. But Socket.IO checks Origin on the handshake regardless of who
  // proxied it, so the network graph's socket was the one thing the proxy
  // could not make same-origin. Every HTTP-level check passed while the
  // network panel retried forever — the exact "API call works, button does
  // nothing" failure this project hunts.
  //
  // Derived from the registry, so moving the console's port cannot orphan this
  // the way hardcoding 5173 did.
  corsOrigins: getEnvArray("CORS_ORIGINS", [
    `http://localhost:${ServicePorts[ServiceId.CONTROL_CENTER]}`
  ]),
  // Service endpoints - resolved via @symbia/sys (supports env overrides)
  identityServiceUrl: process.env.IDENTITY_SERVICE_URL || resolveServiceUrl(ServiceId.IDENTITY),
  loggingServiceUrl: process.env.TELEMETRY_ENDPOINT || resolveServiceUrl(ServiceId.LOGGING),
  // Rate limiting (disabled by default)
  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED === "true",
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100", 10),
  // Network configuration
  heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || "30000", 10),
  nodeTimeoutMs: parseInt(process.env.NODE_TIMEOUT_MS || "90000", 10),
  maxEventHistorySize: parseInt(process.env.MAX_EVENT_HISTORY_SIZE || "10000", 10),
  maxTraceHistorySize: parseInt(process.env.MAX_TRACE_HISTORY_SIZE || "5000", 10)
};

// ../../network/server/src/services/policy.ts
import { hmacSha256Hex, verifyHmacSha256Hex } from "@symbia/crypto";

// ../../network/server/src/telemetry.ts
import { createTelemetryClient } from "@symbia/logging-client";
var telemetry = createTelemetryClient({
  serviceId: process.env.TELEMETRY_SERVICE_ID || config.serviceId
});
var NetworkMetrics = {
  // Event routing metrics
  EVENT_ROUTED: "network.event.routed",
  EVENT_DROPPED: "network.event.dropped",
  EVENT_ERROR: "network.event.error",
  EVENT_LATENCY: "network.event.latency_ms",
  EVENT_DELIVERY_SUCCESS: "network.event.delivery.success",
  EVENT_DELIVERY_FAILURE: "network.event.delivery.failure",
  // Node lifecycle metrics
  NODE_REGISTERED: "network.node.registered",
  NODE_UNREGISTERED: "network.node.unregistered",
  NODE_HEARTBEAT: "network.node.heartbeat",
  NODE_STALE_CLEANUP: "network.node.stale_cleanup",
  NODE_ACTIVE_COUNT: "network.node.active_count",
  // Contract metrics
  CONTRACT_CREATED: "network.contract.created",
  CONTRACT_DELETED: "network.contract.deleted",
  CONTRACT_EXPIRED: "network.contract.expired",
  CONTRACT_ACTIVE_COUNT: "network.contract.active_count",
  // Bridge metrics
  BRIDGE_REGISTERED: "network.bridge.registered",
  BRIDGE_DELETED: "network.bridge.deleted",
  BRIDGE_ACTIVE_COUNT: "network.bridge.active_count",
  // Policy metrics
  POLICY_EVALUATED: "network.policy.evaluated",
  POLICY_DENIED: "network.policy.denied",
  POLICY_ALLOWED: "network.policy.allowed",
  POLICY_EVALUATION_LATENCY: "network.policy.evaluation_latency_ms",
  // Hash verification metrics
  HASH_VERIFIED: "network.hash.verified",
  HASH_FAILED: "network.hash.failed",
  // WebSocket metrics
  SOCKET_CONNECTED: "network.socket.connected",
  SOCKET_DISCONNECTED: "network.socket.disconnected",
  SOCKET_MESSAGE_RECEIVED: "network.socket.message_received",
  // Agent authentication metrics
  AGENT_AUTH_SUCCESS: "network.agent.auth.success",
  AGENT_AUTH_FAILURE: "network.agent.auth.failure",
  // User authentication metrics
  USER_AUTH_SUCCESS: "network.user.auth.success",
  USER_AUTH_FAILURE: "network.user.auth.failure",
  // Permission check metrics
  PERMISSION_DENIED: "network.permission.denied",
  // SDN watch metrics
  SDN_WATCH_SUBSCRIBED: "network.sdn.watch.subscribed",
  SDN_WATCH_UNSUBSCRIBED: "network.sdn.watch.unsubscribed",
  SDN_WATCH_ACTIVE_COUNT: "network.sdn.watch.active_count"
};
var NetworkEvents = {
  // Service lifecycle
  SERVICE_STARTED: "network.service.started",
  SERVICE_STOPPED: "network.service.stopped",
  // Event routing
  EVENT_ROUTED: "network.event.routed",
  EVENT_DROPPED: "network.event.dropped",
  EVENT_DELIVERY_FAILED: "network.event.delivery_failed",
  // Node lifecycle
  NODE_REGISTERED: "network.node.registered",
  NODE_UNREGISTERED: "network.node.unregistered",
  NODE_STALE_CLEANUP: "network.node.stale_cleanup",
  NODE_HEARTBEAT_MISSED: "network.node.heartbeat_missed",
  // Contract lifecycle
  CONTRACT_CREATED: "network.contract.created",
  CONTRACT_DELETED: "network.contract.deleted",
  CONTRACT_EXPIRED: "network.contract.expired",
  // Bridge lifecycle
  BRIDGE_REGISTERED: "network.bridge.registered",
  BRIDGE_DELETED: "network.bridge.deleted",
  BRIDGE_STATUS_CHANGED: "network.bridge.status_changed",
  // Policy events
  POLICY_CREATED: "network.policy.created",
  POLICY_UPDATED: "network.policy.updated",
  POLICY_DELETED: "network.policy.deleted",
  POLICY_DENIED: "network.policy.denied",
  // Security events
  HASH_VERIFICATION_FAILED: "network.security.hash_failed",
  AGENT_AUTH_SUCCESS: "network.agent.authenticated",
  AGENT_AUTH_FAILURE: "network.agent.auth_failed",
  USER_AUTH_SUCCESS: "network.user.authenticated",
  USER_AUTH_FAILURE: "network.user.auth_failed",
  PERMISSION_DENIED: "network.permission.denied",
  // WebSocket events
  SOCKET_CONNECTED: "network.socket.connected",
  SOCKET_DISCONNECTED: "network.socket.disconnected",
  // SDN events
  SDN_WATCH_STARTED: "network.sdn.watch.started",
  SDN_WATCH_STOPPED: "network.sdn.watch.stopped",
  TOPOLOGY_CHANGED: "network.topology.changed"
};

// ../../network/server/src/services/policy.ts
var policies = /* @__PURE__ */ new Map();
var HASH_SECRET = process.env.NETWORK_HASH_SECRET;
if (!HASH_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("NETWORK_HASH_SECRET is required in production");
}
var hashSecret = HASH_SECRET || "symbia-network-dev-only";
function computeEventHash(payload, wrapper) {
  return hmacSha256Hex(hashSecret, eventHashInput(payload, wrapper));
}
function eventHashInput(payload, wrapper) {
  return JSON.stringify({
    type: payload.type,
    data: payload.data,
    id: wrapper.id,
    timestamp: wrapper.timestamp,
    source: wrapper.source,
    runId: wrapper.runId,
    boundary: wrapper.boundary,
    target: wrapper.target
  });
}
function verifyEventHash(event) {
  const { path: path2, ...wrapperWithoutPath } = event.wrapper;
  return verifyHmacSha256Hex(hashSecret, eventHashInput(event.payload, wrapperWithoutPath), event.hash);
}
function createPolicy(name, priority, conditions, action) {
  const policyObj = {
    id: `policy_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    name,
    priority,
    conditions,
    action,
    enabled: true,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  policies.set(policyObj.id, policyObj);
  telemetry.event(
    NetworkEvents.POLICY_CREATED,
    `Policy created: ${name}`,
    {
      policyId: policyObj.id,
      policyName: name,
      priority,
      actionType: action.type,
      conditionCount: conditions.length
    }
  );
  return policyObj;
}
function getPolicy(policyId) {
  return policies.get(policyId);
}
function getAllPolicies() {
  return Array.from(policies.values());
}
function updatePolicy(policyId, updates) {
  const existing = policies.get(policyId);
  if (!existing) return null;
  const updated = { ...existing, ...updates };
  policies.set(policyId, updated);
  telemetry.event(
    NetworkEvents.POLICY_UPDATED,
    `Policy updated: ${updated.name}`,
    {
      policyId,
      policyName: updated.name,
      priority: updated.priority,
      actionType: updated.action.type,
      enabled: updated.enabled,
      updatedFields: Object.keys(updates)
    }
  );
  return updated;
}
function deletePolicy(policyId) {
  const existing = policies.get(policyId);
  const deleted = policies.delete(policyId);
  if (deleted && existing) {
    telemetry.event(
      NetworkEvents.POLICY_DELETED,
      `Policy deleted: ${existing.name}`,
      {
        policyId,
        policyName: existing.name,
        priority: existing.priority,
        actionType: existing.action.type
      }
    );
  }
  return deleted;
}
function evaluatePolicies(event) {
  const sortedPolicies = Array.from(policies.values()).filter((p) => p.enabled).sort((a, b) => b.priority - a.priority);
  for (const policy of sortedPolicies) {
    if (matchesConditions(event, policy.conditions)) {
      return {
        policyId: policy.id,
        action: policy.action
      };
    }
  }
  return { action: { type: "allow" } };
}
function matchesConditions(event, conditions) {
  for (const condition of conditions) {
    const value = getFieldValue(event, condition.field);
    if (!matchesCondition(value, condition.operator, condition.value)) {
      return false;
    }
  }
  return true;
}
function getFieldValue(event, field) {
  switch (field) {
    case "source":
      return event.wrapper.source;
    case "target":
      return event.wrapper.target || "";
    case "eventType":
      return event.payload.type;
    case "boundary":
      return event.wrapper.boundary;
    case "runId":
      return event.wrapper.runId;
    default:
      return "";
  }
}
function matchesCondition(value, operator, conditionValue) {
  switch (operator) {
    case "eq":
      return value === conditionValue;
    case "neq":
      return value !== conditionValue;
    case "contains":
      return value.includes(conditionValue);
    case "startsWith":
      return value.startsWith(conditionValue);
    case "regex":
      try {
        return new RegExp(conditionValue).test(value);
      } catch {
        return false;
      }
    default:
      return false;
  }
}
function initDefaultPolicies() {
  createPolicy(
    "allow-intra",
    100,
    [{ field: "boundary", operator: "eq", value: "intra" }],
    { type: "allow" }
  );
  createPolicy(
    "log-inter",
    90,
    [{ field: "boundary", operator: "eq", value: "inter" }],
    { type: "log", level: "info" }
  );
  createPolicy(
    "log-extra",
    90,
    [{ field: "boundary", operator: "eq", value: "extra" }],
    { type: "log", level: "warn" }
  );
}

// ../../network/server/src/services/registry.ts
import { v4 as uuidv4 } from "uuid";
var nodes = /* @__PURE__ */ new Map();
var contracts = /* @__PURE__ */ new Map();
var bridges = /* @__PURE__ */ new Map();
function registerNode(id, name, type, capabilities, endpoint, socketId, metadata) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const isUpdate = nodes.has(id);
  const node = {
    id,
    name,
    type,
    capabilities,
    endpoint,
    socketId,
    registeredAt: now,
    lastHeartbeat: now,
    metadata
  };
  nodes.set(id, node);
  const labels = { nodeId: id, nodeType: type, nodeName: name };
  telemetry.event(
    NetworkEvents.NODE_REGISTERED,
    `Node ${isUpdate ? "re-" : ""}registered: ${name} (${id})`,
    { ...labels, capabilities, endpoint, isUpdate }
  );
  telemetry.metric(NetworkMetrics.NODE_REGISTERED, 1, labels);
  telemetry.metric(NetworkMetrics.NODE_ACTIVE_COUNT, nodes.size);
  if (!isUpdate && type === "service") {
    createDefaultServiceContracts(id);
  }
  return node;
}
function createDefaultServiceContracts(nodeId) {
  const SERVICE_CONTRACTS = [
    // Messaging → Assistants: message notifications
    {
      from: "messaging",
      to: "assistants",
      eventTypes: ["message.new", "message.*"]
    },
    // Assistants → Messaging: assistant responses
    {
      from: "assistants",
      to: "messaging",
      eventTypes: ["message.response", "assistant.action.respond", "assistant.*"]
    },
    // Assistants → Network: justification events (broadcast)
    {
      from: "assistants",
      to: "*",
      // Wildcard - all nodes can receive
      eventTypes: ["assistant.intent.claim", "assistant.intent.defer", "assistant.action.observe"]
    }
  ];
  for (const pattern of SERVICE_CONTRACTS) {
    if (pattern.from === nodeId) {
      const existing = getContract(pattern.from, pattern.to);
      if (!existing) {
        const contract = createContractInternal(
          pattern.from,
          pattern.to,
          pattern.eventTypes,
          ["intra", "inter"]
        );
        if (contract) {
          console.log(`[Registry] Auto-created contract: ${pattern.from} \u2192 ${pattern.to} for [${pattern.eventTypes.join(", ")}]`);
        }
      }
    }
    if (pattern.to === nodeId && nodes.has(pattern.from)) {
      const existing = getContract(pattern.from, pattern.to);
      if (!existing) {
        const contract = createContractInternal(
          pattern.from,
          pattern.to,
          pattern.eventTypes,
          ["intra", "inter"]
        );
        if (contract) {
          console.log(`[Registry] Auto-created contract: ${pattern.from} \u2192 ${pattern.to} for [${pattern.eventTypes.join(", ")}]`);
        }
      }
    }
  }
}
function createContractInternal(from, to, allowedEventTypes, boundaries, expiresAt) {
  const contract = {
    id: uuidv4(),
    from,
    to,
    allowedEventTypes,
    boundaries,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    expiresAt
  };
  contracts.set(contract.id, contract);
  const fromNode = nodes.get(from);
  const toNode = nodes.get(to);
  const labels = {
    contractId: contract.id,
    from,
    to,
    fromType: fromNode?.type,
    toType: toNode?.type || "pending"
  };
  telemetry.event(
    NetworkEvents.CONTRACT_CREATED,
    `Contract created: ${from} \u2192 ${to}`,
    { ...labels, allowedEventTypes, boundaries, expiresAt, auto: true }
  );
  telemetry.metric(NetworkMetrics.CONTRACT_CREATED, 1, labels);
  telemetry.metric(NetworkMetrics.CONTRACT_ACTIVE_COUNT, contracts.size);
  return contract;
}
function heartbeat(nodeId) {
  const node = nodes.get(nodeId);
  if (!node) return false;
  node.lastHeartbeat = (/* @__PURE__ */ new Date()).toISOString();
  telemetry.metric(NetworkMetrics.NODE_HEARTBEAT, 1, {
    nodeId,
    nodeType: node.type,
    nodeName: node.name
  });
  return true;
}
function unregisterNode(nodeId) {
  const node = nodes.get(nodeId);
  let unboundEntityId;
  if (node?.entityId) {
    unboundEntityId = node.entityId;
    entityToNode.delete(node.entityId);
  }
  let contractsRemoved = 0;
  for (const [id, contract] of contracts) {
    if (contract.from === nodeId || contract.to === nodeId) {
      contracts.delete(id);
      contractsRemoved++;
    }
  }
  const deleted = nodes.delete(nodeId);
  if (deleted && node) {
    const labels = { nodeId, nodeType: node.type, nodeName: node.name };
    telemetry.event(
      NetworkEvents.NODE_UNREGISTERED,
      `Node unregistered: ${node.name} (${nodeId})`,
      { ...labels, contractsRemoved, unboundEntityId }
    );
    telemetry.metric(NetworkMetrics.NODE_UNREGISTERED, 1, labels);
    telemetry.metric(NetworkMetrics.NODE_ACTIVE_COUNT, nodes.size);
    if (contractsRemoved > 0) {
      telemetry.metric(NetworkMetrics.CONTRACT_DELETED, contractsRemoved, { reason: "node_unregistered" });
    }
  }
  return deleted;
}
function getNode(nodeId) {
  return nodes.get(nodeId);
}
function getAllNodes() {
  return Array.from(nodes.values());
}
function findNodesByCapability(capability) {
  return Array.from(nodes.values()).filter(
    (node) => node.capabilities.includes(capability)
  );
}
function findNodesByType(type) {
  return Array.from(nodes.values()).filter((node) => node.type === type);
}
var entityToNode = /* @__PURE__ */ new Map();
function getNodeByEntityId(entityId) {
  const nodeId = entityToNode.get(entityId);
  if (!nodeId) return void 0;
  return nodes.get(nodeId);
}
function createContract(from, to, allowedEventTypes, boundaries, expiresAt) {
  if (!nodes.has(from)) {
    return null;
  }
  const contract = {
    id: uuidv4(),
    from,
    to,
    allowedEventTypes,
    boundaries,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    expiresAt
  };
  contracts.set(contract.id, contract);
  const fromNode = nodes.get(from);
  const toNode = nodes.get(to);
  const labels = {
    contractId: contract.id,
    from,
    to,
    fromType: fromNode?.type,
    toType: toNode?.type
  };
  telemetry.event(
    NetworkEvents.CONTRACT_CREATED,
    `Contract created: ${from} \u2192 ${to}`,
    { ...labels, allowedEventTypes, boundaries, expiresAt }
  );
  telemetry.metric(NetworkMetrics.CONTRACT_CREATED, 1, labels);
  telemetry.metric(NetworkMetrics.CONTRACT_ACTIVE_COUNT, contracts.size);
  return contract;
}
function getContract(from, to) {
  return Array.from(contracts.values()).find(
    (c) => c.from === from && c.to === to
  );
}
function getContractsForNode(nodeId) {
  return Array.from(contracts.values()).filter(
    (c) => c.from === nodeId || c.to === nodeId
  );
}
function deleteContract(contractId) {
  const contract = contracts.get(contractId);
  const deleted = contracts.delete(contractId);
  if (deleted && contract) {
    telemetry.event(
      NetworkEvents.CONTRACT_DELETED,
      `Contract deleted: ${contract.from} \u2192 ${contract.to}`,
      { contractId, from: contract.from, to: contract.to }
    );
    telemetry.metric(NetworkMetrics.CONTRACT_DELETED, 1, { contractId, from: contract.from, to: contract.to });
    telemetry.metric(NetworkMetrics.CONTRACT_ACTIVE_COUNT, contracts.size);
  }
  return deleted;
}
function registerBridge(name, type, endpoint, eventTypes, bridgeConfig) {
  const bridge = {
    id: uuidv4(),
    name,
    type,
    endpoint,
    eventTypes,
    active: true,
    config: bridgeConfig,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  bridges.set(bridge.id, bridge);
  const labels = { bridgeId: bridge.id, bridgeName: name, bridgeType: type };
  telemetry.event(
    NetworkEvents.BRIDGE_REGISTERED,
    `Bridge registered: ${name} (${type})`,
    { ...labels, endpoint, eventTypes }
  );
  telemetry.metric(NetworkMetrics.BRIDGE_REGISTERED, 1, labels);
  telemetry.metric(NetworkMetrics.BRIDGE_ACTIVE_COUNT, bridges.size);
  return bridge;
}
function getBridge(bridgeId) {
  return bridges.get(bridgeId);
}
function getAllBridges() {
  return Array.from(bridges.values());
}
function setBridgeActive(bridgeId, active) {
  const bridge = bridges.get(bridgeId);
  if (!bridge) return false;
  const wasActive = bridge.active;
  bridge.active = active;
  if (wasActive !== active) {
    telemetry.event(
      NetworkEvents.BRIDGE_STATUS_CHANGED,
      `Bridge ${active ? "activated" : "deactivated"}: ${bridge.name}`,
      { bridgeId, bridgeName: bridge.name, bridgeType: bridge.type, active, previousActive: wasActive }
    );
  }
  return true;
}
function deleteBridge(bridgeId) {
  const bridge = bridges.get(bridgeId);
  const deleted = bridges.delete(bridgeId);
  if (deleted && bridge) {
    telemetry.event(
      NetworkEvents.BRIDGE_DELETED,
      `Bridge deleted: ${bridge.name}`,
      { bridgeId, bridgeName: bridge.name, bridgeType: bridge.type }
    );
    telemetry.metric(NetworkMetrics.BRIDGE_DELETED, 1, { bridgeId, bridgeName: bridge.name, bridgeType: bridge.type });
    telemetry.metric(NetworkMetrics.BRIDGE_ACTIVE_COUNT, bridges.size);
  }
  return deleted;
}
function getTopology() {
  return {
    nodes: getAllNodes(),
    contracts: Array.from(contracts.values()),
    bridges: getAllBridges(),
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function cleanupStaleNodes() {
  const now = Date.now();
  const staleIds = [];
  for (const [id, node] of nodes) {
    const lastHeartbeat = new Date(node.lastHeartbeat).getTime();
    if (now - lastHeartbeat > config.nodeTimeoutMs) {
      staleIds.push(id);
    }
  }
  for (const id of staleIds) {
    unregisterNode(id);
  }
  return staleIds;
}
function cleanupExpiredContracts() {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const expiredIds = [];
  for (const [id, contract] of contracts) {
    if (contract.expiresAt && contract.expiresAt < now) {
      expiredIds.push(id);
    }
  }
  for (const id of expiredIds) {
    contracts.delete(id);
  }
  return expiredIds;
}

// ../../network/server/src/routes/registry.ts
import { Router } from "express";

// ../../network/server/src/middleware/auth.ts
import {
  createAuthClient,
  hasEntitlement
} from "@symbia/auth";
var authClient = createAuthClient({
  identityServiceUrl: config.identityServiceUrl
});
function extractBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}
function toUserPrincipal(user) {
  return {
    id: user.id,
    email: user.email || "",
    name: user.name || "",
    entitlements: user.entitlements,
    roles: user.roles,
    organizations: user.organizations,
    isSuperAdmin: user.isSuperAdmin
  };
}
function toAgentPrincipal(user) {
  return {
    id: user.id,
    agentId: user.agentId || user.id,
    name: user.name || "",
    orgId: user.orgId || "",
    capabilities: user.entitlements
  };
}
async function requireAuth(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "authentication_required", message: "Authorization header required" });
    return;
  }
  const authUser = await authClient.introspectToken(token);
  if (!authUser) {
    telemetry.metric(NetworkMetrics.USER_AUTH_FAILURE, 1, { source: "rest" });
    res.status(401).json({ error: "invalid_token", message: "Token is invalid or expired" });
    return;
  }
  if (authUser.type === "agent") {
    req.agent = toAgentPrincipal(authUser);
    req.principalType = "agent";
    telemetry.metric(NetworkMetrics.AGENT_AUTH_SUCCESS, 1, { agentId: authUser.agentId, source: "rest" });
  } else {
    req.user = authUser;
    req.userPrincipal = toUserPrincipal(authUser);
    req.principalType = "user";
    telemetry.metric(NetworkMetrics.USER_AUTH_SUCCESS, 1, { source: "rest" });
  }
  next();
}
function requirePermission(permission) {
  return async (req, res, next) => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: "authentication_required", message: "Authorization header required" });
      return;
    }
    const authUser = await authClient.introspectToken(token);
    if (!authUser) {
      telemetry.metric(NetworkMetrics.USER_AUTH_FAILURE, 1, { source: "rest" });
      res.status(401).json({ error: "invalid_token", message: "Token is invalid or expired" });
      return;
    }
    if (authUser.type === "agent") {
      req.agent = toAgentPrincipal(authUser);
      req.principalType = "agent";
      telemetry.metric(NetworkMetrics.AGENT_AUTH_SUCCESS, 1, { agentId: authUser.agentId, source: "rest" });
      next();
      return;
    }
    req.user = authUser;
    req.userPrincipal = toUserPrincipal(authUser);
    req.principalType = "user";
    telemetry.metric(NetworkMetrics.USER_AUTH_SUCCESS, 1, { source: "rest" });
    if (authUser.isSuperAdmin) {
      next();
      return;
    }
    if (!hasEntitlement(authUser, permission)) {
      telemetry.event(
        NetworkEvents.PERMISSION_DENIED,
        `REST permission denied: ${permission}`,
        { userId: authUser.id, email: authUser.email, operation: req.path, requiredPermission: permission },
        "warn"
      );
      telemetry.metric(NetworkMetrics.PERMISSION_DENIED, 1, { operation: req.path });
      res.status(403).json({
        error: "insufficient_permissions",
        message: `Required permission: ${permission}`,
        requiredPermission: permission
      });
      return;
    }
    next();
  };
}

// ../../network/server/src/types.ts
var NetworkPermissions = {
  // Read permissions
  TOPOLOGY_READ: "cap:network.topology.read",
  EVENTS_READ: "cap:network.events.read",
  TRACES_READ: "cap:network.traces.read",
  POLICIES_READ: "cap:network.policies.read",
  // Write permissions
  POLICIES_WRITE: "cap:network.policies.write",
  CONTRACTS_WRITE: "cap:network.contracts.write",
  // Admin permissions
  NODES_ADMIN: "cap:network.nodes.admin"
};

// ../../network/server/src/routes/registry.ts
function getParam(params, key) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value ?? "";
}
var router = Router();
router.use(requireAuth);
router.post("/nodes", requirePermission(NetworkPermissions.NODES_ADMIN), (req, res) => {
  const { id, name, type, capabilities, endpoint, metadata } = req.body;
  if (!id || !name || !type || !capabilities || !endpoint) {
    res.status(400).json({ error: "Missing required fields: id, name, type, capabilities, endpoint" });
    return;
  }
  const validTypes = ["service", "assistant", "sandbox", "bridge", "client"];
  if (!validTypes.includes(type)) {
    res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(", ")}` });
    return;
  }
  const node = registerNode(id, name, type, capabilities, endpoint, void 0, metadata);
  res.status(201).json(node);
});
router.get("/nodes", (_req, res) => {
  const nodes2 = getAllNodes();
  res.json({ nodes: nodes2, count: nodes2.length });
});
router.get("/nodes/:id", (req, res) => {
  const node = getNode(getParam(req.params, "id"));
  if (!node) {
    res.status(404).json({ error: "Node not found" });
    return;
  }
  res.json(node);
});
router.post("/nodes/:id/heartbeat", (req, res) => {
  const success = heartbeat(getParam(req.params, "id"));
  if (!success) {
    res.status(404).json({ error: "Node not found" });
    return;
  }
  res.json({ ok: true, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
});
router.delete("/nodes/:id", requirePermission(NetworkPermissions.NODES_ADMIN), (req, res) => {
  const success = unregisterNode(getParam(req.params, "id"));
  if (!success) {
    res.status(404).json({ error: "Node not found" });
    return;
  }
  res.json({ ok: true });
});
router.get("/nodes/capability/:capability", (req, res) => {
  const nodes2 = findNodesByCapability(getParam(req.params, "capability"));
  res.json({ nodes: nodes2, count: nodes2.length });
});
router.get("/nodes/type/:type", (req, res) => {
  const validTypes = ["service", "assistant", "sandbox", "bridge", "client"];
  if (!validTypes.includes(getParam(req.params, "type"))) {
    res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(", ")}` });
    return;
  }
  const nodes2 = findNodesByType(getParam(req.params, "type"));
  res.json({ nodes: nodes2, count: nodes2.length });
});
router.post("/contracts", requirePermission(NetworkPermissions.CONTRACTS_WRITE), (req, res) => {
  const { from, to, allowedEventTypes, boundaries, expiresAt } = req.body;
  if (!from || !to || !allowedEventTypes || !boundaries) {
    res.status(400).json({ error: "Missing required fields: from, to, allowedEventTypes, boundaries" });
    return;
  }
  const contract = createContract(from, to, allowedEventTypes, boundaries, expiresAt);
  if (!contract) {
    res.status(400).json({ error: "One or both nodes not found" });
    return;
  }
  res.status(201).json(contract);
});
router.get("/contracts", (req, res) => {
  const nodeId = req.query.nodeId;
  if (nodeId) {
    const contracts2 = getContractsForNode(nodeId);
    res.json({ contracts: contracts2, count: contracts2.length });
  } else {
    const topology = getTopology();
    res.json({ contracts: topology.contracts, count: topology.contracts.length });
  }
});
router.delete("/contracts/:id", requirePermission(NetworkPermissions.CONTRACTS_WRITE), (req, res) => {
  const success = deleteContract(getParam(req.params, "id"));
  if (!success) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }
  res.json({ ok: true });
});
router.post("/bridges", requirePermission(NetworkPermissions.NODES_ADMIN), (req, res) => {
  const { name, type, endpoint, eventTypes, config: bridgeConfig } = req.body;
  if (!name || !type || !endpoint || !eventTypes) {
    res.status(400).json({ error: "Missing required fields: name, type, endpoint, eventTypes" });
    return;
  }
  const validTypes = ["webhook", "websocket", "grpc", "custom"];
  if (!validTypes.includes(type)) {
    res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(", ")}` });
    return;
  }
  const bridge = registerBridge(name, type, endpoint, eventTypes, bridgeConfig);
  res.status(201).json(bridge);
});
router.get("/bridges", (_req, res) => {
  const bridges2 = getAllBridges();
  res.json({ bridges: bridges2, count: bridges2.length });
});
router.get("/bridges/:id", (req, res) => {
  const bridge = getBridge(getParam(req.params, "id"));
  if (!bridge) {
    res.status(404).json({ error: "Bridge not found" });
    return;
  }
  res.json(bridge);
});
router.patch("/bridges/:id", requirePermission(NetworkPermissions.NODES_ADMIN), (req, res) => {
  const { active } = req.body;
  if (typeof active !== "boolean") {
    res.status(400).json({ error: "active must be a boolean" });
    return;
  }
  const success = setBridgeActive(getParam(req.params, "id"), active);
  if (!success) {
    res.status(404).json({ error: "Bridge not found" });
    return;
  }
  const bridge = getBridge(getParam(req.params, "id"));
  res.json(bridge);
});
router.delete("/bridges/:id", requirePermission(NetworkPermissions.NODES_ADMIN), (req, res) => {
  const success = deleteBridge(getParam(req.params, "id"));
  if (!success) {
    res.status(404).json({ error: "Bridge not found" });
    return;
  }
  res.json({ ok: true });
});
var registry_default = router;

// ../../network/server/src/routes/events.ts
import { Router as Router2 } from "express";

// ../../network/server/src/services/router.ts
import { v4 as uuidv42 } from "uuid";
import { eventHeaders, contextForEvent, traceHeaders } from "@symbia/sys";
var eventHistory = [];
var traces = /* @__PURE__ */ new Map();
var eventHandlers = /* @__PURE__ */ new Map();
function createEvent(payload, source, runId, options = {}) {
  const wrapper = {
    id: uuidv42(),
    runId,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    source,
    target: options.target,
    causedBy: options.causedBy,
    path: [source],
    boundary: options.boundary || "intra",
    // Entity-based addressing
    sourceEntityId: options.sourceEntityId,
    targetEntityId: options.targetEntityId
  };
  const hash = computeEventHash(payload, wrapper);
  return { payload, wrapper, hash };
}
async function routeEvent(event) {
  const startTime = Date.now();
  const trace = {
    eventId: event.wrapper.id,
    runId: event.wrapper.runId,
    path: [],
    totalDurationMs: 0,
    status: "pending"
  };
  const eventLabels = {
    eventType: event.payload.type,
    boundary: event.wrapper.boundary,
    source: event.wrapper.source,
    runId: event.wrapper.runId
  };
  try {
    const isValid = verifyEventHash(event);
    if (!isValid) {
      trace.status = "error";
      trace.error = "Invalid event hash - security policy violation";
      telemetry.event(
        NetworkEvents.HASH_VERIFICATION_FAILED,
        `Hash verification failed for event ${event.wrapper.id}`,
        { eventId: event.wrapper.id, ...eventLabels },
        "warn"
      );
      telemetry.metric(NetworkMetrics.HASH_FAILED, 1, eventLabels);
      telemetry.metric(NetworkMetrics.EVENT_ERROR, 1, { ...eventLabels, reason: "hash_invalid" });
      return finishTrace(trace, startTime, event);
    }
    telemetry.metric(NetworkMetrics.HASH_VERIFIED, 1, eventLabels);
    const sourceNode = getNode(event.wrapper.source);
    if (!sourceNode) {
      trace.status = "error";
      trace.error = `Source node not found: ${event.wrapper.source}`;
      telemetry.metric(NetworkMetrics.EVENT_ERROR, 1, { ...eventLabels, reason: "source_not_found" });
      return finishTrace(trace, startTime, event);
    }
    let targets = [];
    if (event.wrapper.targetEntityId) {
      const targetNode = getNodeByEntityId(event.wrapper.targetEntityId);
      if (targetNode) {
        targets = [targetNode.id];
        telemetry.event(
          NetworkEvents.EVENT_ROUTED,
          `Resolved entity ${event.wrapper.targetEntityId} to node ${targetNode.id}`,
          { eventId: event.wrapper.id, entityId: event.wrapper.targetEntityId, nodeId: targetNode.id, ...eventLabels }
        );
      } else {
        trace.status = "dropped";
        trace.error = `Target entity not connected: ${event.wrapper.targetEntityId}`;
        telemetry.event(
          NetworkEvents.EVENT_DROPPED,
          `Event dropped - target entity not connected: ${event.wrapper.targetEntityId}`,
          { eventId: event.wrapper.id, targetEntityId: event.wrapper.targetEntityId, reason: "entity_not_connected", ...eventLabels },
          "warn"
        );
        telemetry.metric(NetworkMetrics.EVENT_DROPPED, 1, { ...eventLabels, reason: "entity_not_connected" });
        return finishTrace(trace, startTime, event);
      }
    } else if (event.wrapper.target) {
      targets = [event.wrapper.target];
    } else {
      const sourceContracts = getContractsForNode(event.wrapper.source);
      console.log(`[Router] Finding contracts for source: ${event.wrapper.source}`);
      console.log(`[Router] Found ${sourceContracts.length} contracts involving this node`);
      const validContracts = sourceContracts.filter((c) => c.from === event.wrapper.source).filter((c) => {
        for (const allowed of c.allowedEventTypes) {
          if (allowed === "*") {
            console.log(`[Router] Contract ${c.id}: wildcard match (*)`);
            return true;
          }
          if (allowed === event.payload.type) {
            console.log(`[Router] Contract ${c.id}: exact match (${allowed})`);
            return true;
          }
          if (allowed.endsWith(".*")) {
            const prefix = allowed.slice(0, -2);
            if (event.payload.type.startsWith(prefix + ".")) {
              console.log(`[Router] Contract ${c.id}: prefix match (${allowed} -> ${event.payload.type})`);
              return true;
            }
          }
        }
        console.log(`[Router] Contract ${c.from} \u2192 ${c.to}: no match for ${event.payload.type} in [${c.allowedEventTypes.join(", ")}]`);
        return false;
      }).filter((c) => {
        const boundaryMatch = c.boundaries.includes(event.wrapper.boundary);
        if (!boundaryMatch) {
          console.log(`[Router] Contract ${c.from} \u2192 ${c.to}: boundary mismatch (${event.wrapper.boundary} not in [${c.boundaries.join(", ")}])`);
        }
        return boundaryMatch;
      });
      console.log(`[Router] Found ${validContracts.length} valid contracts for event type ${event.payload.type}`);
      for (const contract of validContracts) {
        if (contract.to === "*") {
          const allNodes = getAllNodes();
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
      console.log(`[Router] Final targets: [${targets.join(", ")}]`);
    }
    if (targets.length === 0) {
      trace.status = "unrouted";
      trace.error = `No subscriber: no contract routes ${event.payload.type} from ${event.wrapper.source}, and no explicit target was given. The event is recorded.`;
      telemetry.event(
        NetworkEvents.EVENT_DROPPED,
        `Event unrouted - no subscriber: ${event.wrapper.id}`,
        { eventId: event.wrapper.id, reason: "no_targets", ...eventLabels }
      );
      telemetry.metric(NetworkMetrics.EVENT_DROPPED, 1, { ...eventLabels, reason: "no_targets" });
      return finishTrace(trace, startTime, event);
    }
    const policyStartTime = Date.now();
    const policyResult = evaluatePolicies(event);
    const policyDuration = Date.now() - policyStartTime;
    telemetry.metric(NetworkMetrics.POLICY_EVALUATION_LATENCY, policyDuration, eventLabels);
    telemetry.metric(NetworkMetrics.POLICY_EVALUATED, 1, { ...eventLabels, policyId: policyResult.policyId });
    if (policyResult.action.type === "deny") {
      trace.status = "dropped";
      trace.error = policyResult.action.reason || "Denied by policy";
      trace.path.push({
        node: event.wrapper.source,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        durationMs: Date.now() - startTime,
        policyId: policyResult.policyId,
        action: "drop"
      });
      telemetry.event(
        NetworkEvents.POLICY_DENIED,
        `Event denied by policy: ${policyResult.policyId}`,
        { eventId: event.wrapper.id, policyId: policyResult.policyId, reason: policyResult.action.reason, ...eventLabels },
        "warn"
      );
      telemetry.metric(NetworkMetrics.POLICY_DENIED, 1, { ...eventLabels, policyId: policyResult.policyId });
      telemetry.metric(NetworkMetrics.EVENT_DROPPED, 1, { ...eventLabels, reason: "policy_denied" });
      return finishTrace(trace, startTime, event);
    }
    telemetry.metric(NetworkMetrics.POLICY_ALLOWED, 1, { ...eventLabels, policyId: policyResult.policyId });
    let deliverySuccessCount = 0;
    let deliveryFailureCount = 0;
    for (const targetId of targets) {
      const hopStart = Date.now();
      const targetNode = getNode(targetId);
      if (!targetNode) {
        trace.path.push({
          node: targetId,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          durationMs: Date.now() - hopStart,
          action: "drop"
        });
        deliveryFailureCount++;
        telemetry.metric(NetworkMetrics.EVENT_DELIVERY_FAILURE, 1, { ...eventLabels, target: targetId, reason: "target_not_found" });
        continue;
      }
      event.wrapper.path.push(targetId);
      const delivered = await deliverToNode(event, targetNode);
      trace.path.push({
        node: targetId,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        durationMs: Date.now() - hopStart,
        policyId: policyResult.policyId,
        action: delivered ? "deliver" : "drop"
      });
      if (delivered) {
        deliverySuccessCount++;
        telemetry.metric(NetworkMetrics.EVENT_DELIVERY_SUCCESS, 1, { ...eventLabels, target: targetId });
      } else {
        deliveryFailureCount++;
        telemetry.metric(NetworkMetrics.EVENT_DELIVERY_FAILURE, 1, { ...eventLabels, target: targetId, reason: "delivery_failed" });
        telemetry.event(
          NetworkEvents.EVENT_DELIVERY_FAILED,
          `Failed to deliver event to ${targetId}`,
          { eventId: event.wrapper.id, target: targetId, ...eventLabels },
          "warn"
        );
      }
    }
    const deliveredCount = trace.path.filter((h) => h.action === "deliver").length;
    trace.status = deliveredCount > 0 ? "delivered" : "dropped";
    if (trace.status === "delivered") {
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
        { eventId: event.wrapper.id, targetCount: targets.length, reason: "all_deliveries_failed", ...eventLabels }
      );
      telemetry.metric(NetworkMetrics.EVENT_DROPPED, 1, { ...eventLabels, reason: "all_deliveries_failed" });
    }
    return finishTrace(trace, startTime, event);
  } catch (error) {
    trace.status = "error";
    trace.error = error instanceof Error ? error.message : "Unknown error";
    telemetry.event(
      NetworkEvents.EVENT_DROPPED,
      `Event routing error: ${trace.error}`,
      { eventId: event.wrapper.id, error: trace.error, ...eventLabels },
      "error"
    );
    telemetry.metric(NetworkMetrics.EVENT_ERROR, 1, { ...eventLabels, reason: "exception" });
    return finishTrace(trace, startTime, event);
  }
}
async function deliverToNode(event, node) {
  if (node.socketId) {
    return true;
  }
  try {
    const { context } = contextForEvent({
      runId: event.wrapper.runId,
      inboundTraceparent: null
    });
    const response = await fetch(node.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...eventHeaders(event.wrapper),
        ...traceHeaders(context)
      },
      body: JSON.stringify(event)
    });
    return response.ok;
  } catch {
    return false;
  }
}
function finishTrace(trace, startTime, event) {
  trace.totalDurationMs = Date.now() - startTime;
  traces.set(trace.eventId, trace);
  const labels = event ? {
    eventType: event.payload.type,
    boundary: event.wrapper.boundary,
    status: trace.status
  } : { status: trace.status };
  telemetry.metric(NetworkMetrics.EVENT_LATENCY, trace.totalDurationMs, labels);
  if (traces.size > config.maxTraceHistorySize) {
    const oldest = Array.from(traces.keys()).slice(0, traces.size - config.maxTraceHistorySize);
    for (const id of oldest) {
      traces.delete(id);
    }
  }
  if (event) {
    notifyHandlers(event, trace);
  }
  return trace;
}
function recordEvent(event) {
  eventHistory.push(event);
  if (eventHistory.length > config.maxEventHistorySize) {
    eventHistory.shift();
  }
}
function getTrace(eventId) {
  return traces.get(eventId);
}
function getTracesForRun(runId) {
  return Array.from(traces.values()).filter((t) => t.runId === runId);
}
function getRecentEvents(limit = 100) {
  return eventHistory.slice(-limit);
}
function getEventsForRun(runId, limit = 100) {
  return eventHistory.filter((e) => e.wrapper.runId === runId).slice(-limit);
}
function notifyHandlers(event, trace) {
  for (const handler of eventHandlers.values()) {
    try {
      handler(event, trace);
    } catch {
    }
  }
}
function getStats() {
  const traceList = Array.from(traces.values());
  return {
    totalEvents: eventHistory.length,
    totalTraces: traceList.length,
    deliveredCount: traceList.filter((t) => t.status === "delivered").length,
    droppedCount: traceList.filter((t) => t.status === "dropped").length,
    errorCount: traceList.filter((t) => t.status === "error").length
  };
}

// ../../network/server/src/routes/events.ts
function getParam2(params, key) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value ?? "";
}
var eventsRouter = Router2();
eventsRouter.use(requireAuth);
eventsRouter.post("/", requirePermission(NetworkPermissions.EVENTS_READ), async (req, res) => {
  const { payload, source, runId, target, causedBy, boundary } = req.body;
  if (!payload || !source || !runId) {
    res.status(400).json({ error: "Missing required fields: payload, source, runId" });
    return;
  }
  if (!payload.type || payload.data === void 0) {
    res.status(400).json({ error: "payload must have type and data fields" });
    return;
  }
  const validBoundaries = ["intra", "inter", "extra"];
  if (boundary && !validBoundaries.includes(boundary)) {
    res.status(400).json({ error: `Invalid boundary. Must be one of: ${validBoundaries.join(", ")}` });
    return;
  }
  try {
    const event = createEvent(payload, source, runId, {
      target,
      causedBy,
      boundary
    });
    recordEvent(event);
    const trace = await routeEvent(event);
    res.status(202).json({
      eventId: event.wrapper.id,
      trace
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to route event",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
});
eventsRouter.get("/", requirePermission(NetworkPermissions.EVENTS_READ), (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const runId = req.query.runId;
  const includeTraces = req.query.traces !== "false";
  const events = runId ? getEventsForRun(runId, limit) : getRecentEvents(limit);
  const eventsWithTraces = includeTraces ? events.map((event) => ({
    event,
    trace: getTrace(event.wrapper.id) || {
      eventId: event.wrapper.id,
      runId: event.wrapper.runId,
      path: [],
      totalDurationMs: 0,
      status: "pending"
    }
  })) : events;
  res.json({ events: eventsWithTraces, count: events.length });
});
eventsRouter.get("/:id/trace", requirePermission(NetworkPermissions.TRACES_READ), (req, res) => {
  const trace = getTrace(getParam2(req.params, "id"));
  if (!trace) {
    res.status(404).json({ error: "Trace not found" });
    return;
  }
  res.json(trace);
});
eventsRouter.get("/traces/:runId", requirePermission(NetworkPermissions.TRACES_READ), (req, res) => {
  const traces2 = getTracesForRun(getParam2(req.params, "runId"));
  res.json({ traces: traces2, count: traces2.length });
});
eventsRouter.post("/hash", requirePermission(NetworkPermissions.EVENTS_READ), (req, res) => {
  const { payload, source, runId, boundary, target } = req.body;
  if (!payload || !source || !runId) {
    res.status(400).json({ error: "Missing required fields: payload, source, runId" });
    return;
  }
  const hash = computeEventHash(payload, {
    id: "preview",
    runId,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    source,
    target,
    boundary: boundary || "intra"
  });
  res.json({ hash });
});
eventsRouter.get("/stats", requirePermission(NetworkPermissions.EVENTS_READ), (_req, res) => {
  const stats = getStats();
  res.json(stats);
});
var events_default = eventsRouter;

// ../../network/server/src/routes/policies.ts
import { Router as Router3 } from "express";
function getParam3(params, key) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value ?? "";
}
var policiesRouter = Router3();
policiesRouter.post("/", requirePermission(NetworkPermissions.POLICIES_WRITE), (req, res) => {
  const { name, priority, conditions, action } = req.body;
  if (!name || priority === void 0 || !conditions || !action) {
    res.status(400).json({ error: "Missing required fields: name, priority, conditions, action" });
    return;
  }
  if (!Array.isArray(conditions)) {
    res.status(400).json({ error: "conditions must be an array" });
    return;
  }
  const validActionTypes = ["allow", "deny", "route", "transform", "log"];
  if (!validActionTypes.includes(action.type)) {
    res.status(400).json({ error: `Invalid action type. Must be one of: ${validActionTypes.join(", ")}` });
    return;
  }
  const newPolicy = createPolicy(name, priority, conditions, action);
  res.status(201).json(newPolicy);
});
policiesRouter.get("/", requirePermission(NetworkPermissions.POLICIES_READ), (_req, res) => {
  const policies2 = getAllPolicies();
  res.json({ policies: policies2, count: policies2.length });
});
policiesRouter.get("/:id", requirePermission(NetworkPermissions.POLICIES_READ), (req, res) => {
  const p = getPolicy(getParam3(req.params, "id"));
  if (!p) {
    res.status(404).json({ error: "Policy not found" });
    return;
  }
  res.json(p);
});
policiesRouter.patch("/:id", requirePermission(NetworkPermissions.POLICIES_WRITE), (req, res) => {
  const updates = req.body;
  delete updates.id;
  delete updates.createdAt;
  const updated = updatePolicy(getParam3(req.params, "id"), updates);
  if (!updated) {
    res.status(404).json({ error: "Policy not found" });
    return;
  }
  res.json(updated);
});
policiesRouter.delete("/:id", requirePermission(NetworkPermissions.POLICIES_WRITE), (req, res) => {
  const success = deletePolicy(getParam3(req.params, "id"));
  if (!success) {
    res.status(404).json({ error: "Policy not found" });
    return;
  }
  res.json({ ok: true });
});
policiesRouter.post("/test", requirePermission(NetworkPermissions.POLICIES_READ), (req, res) => {
  const { payload, source, runId, boundary, target } = req.body;
  if (!payload || !source || !runId) {
    res.status(400).json({ error: "Missing required fields: payload, source, runId" });
    return;
  }
  const mockEvent = {
    payload: {
      type: payload.type || "test",
      data: payload.data || {}
    },
    wrapper: {
      id: "test-event",
      runId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      source,
      target,
      boundary: boundary || "intra",
      path: [source]
    },
    hash: "test-hash"
  };
  const result = evaluatePolicies(mockEvent);
  res.json({
    event: mockEvent,
    result,
    allPolicies: getAllPolicies().map((p) => ({
      id: p.id,
      name: p.name,
      priority: p.priority,
      enabled: p.enabled
    }))
  });
});
var policies_default = policiesRouter;

// ../../network/server/src/routes/sdn.ts
import { Router as Router4 } from "express";
function getParam4(params, key) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value ?? "";
}
var sdnRouter = Router4();
sdnRouter.get("/topology", requirePermission(NetworkPermissions.TOPOLOGY_READ), (_req, res) => {
  const topology = getTopology();
  res.json(topology);
});
sdnRouter.get("/summary", requirePermission(NetworkPermissions.TOPOLOGY_READ), (_req, res) => {
  const topology = getTopology();
  const routingStats = getStats();
  const policies2 = getAllPolicies();
  res.json({
    nodes: {
      total: topology.nodes.length,
      byType: {
        service: topology.nodes.filter((n) => n.type === "service").length,
        assistant: topology.nodes.filter((n) => n.type === "assistant").length,
        sandbox: topology.nodes.filter((n) => n.type === "sandbox").length,
        bridge: topology.nodes.filter((n) => n.type === "bridge").length
      },
      connected: topology.nodes.filter((n) => n.socketId).length
    },
    contracts: {
      total: topology.contracts.length
    },
    bridges: {
      total: topology.bridges.length,
      active: topology.bridges.filter((b) => b.active).length
    },
    events: routingStats,
    policies: {
      total: policies2.length,
      enabled: policies2.filter((p) => p.enabled).length
    },
    timestamp: topology.timestamp
  });
});
sdnRouter.get("/trace/:eventId", requirePermission(NetworkPermissions.TRACES_READ), (req, res) => {
  const trace = getTrace(getParam4(req.params, "eventId"));
  if (!trace) {
    res.status(404).json({ error: "Trace not found" });
    return;
  }
  const enrichedPath = trace.path.map((hop) => {
    const node = getNode(hop.node);
    return {
      ...hop,
      nodeName: node?.name || hop.node,
      nodeType: node?.type
    };
  });
  res.json({
    ...trace,
    path: enrichedPath
  });
});
sdnRouter.get("/traces/:runId", requirePermission(NetworkPermissions.TRACES_READ), (req, res) => {
  const traces2 = getTracesForRun(getParam4(req.params, "runId"));
  res.json({ traces: traces2, count: traces2.length, runId: getParam4(req.params, "runId") });
});
sdnRouter.get("/flow/:runId", requirePermission(NetworkPermissions.TRACES_READ), (req, res) => {
  const limit = parseInt(req.query.limit) || 500;
  const events = getEventsForRun(getParam4(req.params, "runId"), limit);
  const nodes2 = /* @__PURE__ */ new Set();
  const edges = [];
  for (const event of events) {
    nodes2.add(event.wrapper.source);
    for (let i = 0; i < event.wrapper.path.length - 1; i++) {
      nodes2.add(event.wrapper.path[i]);
      nodes2.add(event.wrapper.path[i + 1]);
      edges.push({
        from: event.wrapper.path[i],
        to: event.wrapper.path[i + 1],
        eventType: event.payload.type,
        timestamp: event.wrapper.timestamp
      });
    }
  }
  res.json({
    runId: getParam4(req.params, "runId"),
    nodes: Array.from(nodes2).map((id) => {
      const node = getNode(id);
      return { id, name: node?.name, type: node?.type };
    }),
    edges,
    eventCount: events.length
  });
});
sdnRouter.get("/policies", requirePermission(NetworkPermissions.POLICIES_READ), (_req, res) => {
  const policies2 = getAllPolicies();
  res.json({ policies: policies2, count: policies2.length });
});
sdnRouter.post("/simulate", requirePermission(NetworkPermissions.EVENTS_READ), (req, res) => {
  const { payload, source, runId, target, boundary } = req.body;
  if (!payload || !source || !runId) {
    res.status(400).json({ error: "Missing required fields: payload, source, runId" });
    return;
  }
  const tempEvent = createEvent(payload, source, runId, {
    target,
    boundary: boundary || "intra"
  });
  const sourceNode = getNode(source);
  if (!sourceNode) {
    res.json({
      wouldSucceed: false,
      reason: "Source node not registered",
      event: tempEvent
    });
    return;
  }
  let targets = [];
  if (target) {
    targets = [target];
  } else {
    const contracts2 = getContractsForNode(source);
    targets = contracts2.filter((c) => c.from === source).filter((c) => c.allowedEventTypes.includes(payload.type) || c.allowedEventTypes.includes("*")).filter((c) => c.boundaries.includes(boundary || "intra")).map((c) => c.to);
  }
  const policyResult = evaluatePolicies(tempEvent);
  res.json({
    wouldSucceed: policyResult.action.type !== "deny" && targets.length > 0,
    event: tempEvent,
    sourceNode: { id: sourceNode.id, name: sourceNode.name, type: sourceNode.type },
    targets: targets.map((t) => {
      const node = getNode(t);
      return { id: t, name: node?.name, type: node?.type, exists: !!node };
    }),
    policyResult,
    reasons: [
      targets.length === 0 ? "No valid targets found" : null,
      policyResult.action.type === "deny" ? `Denied by policy: ${policyResult.policyId}` : null
    ].filter(Boolean)
  });
});
sdnRouter.get("/graph", requirePermission(NetworkPermissions.TOPOLOGY_READ), (_req, res) => {
  const topology = getTopology();
  const adjacency = {};
  for (const node of topology.nodes) {
    adjacency[node.id] = [];
  }
  for (const contract of topology.contracts) {
    if (adjacency[contract.from]) {
      adjacency[contract.from].push(contract.to);
    }
  }
  res.json({
    nodes: topology.nodes.map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      connected: !!n.socketId
    })),
    adjacency,
    bridges: topology.bridges.map((b) => ({
      id: b.id,
      name: b.name,
      type: b.type,
      active: b.active,
      eventTypes: b.eventTypes
    }))
  });
});
var sdn_default = sdnRouter;

// ../../network/server/src/doc-routes.ts
import fs from "fs";
import path from "path";

// ../../network/server/src/openapi.ts
var apiDocumentation = {
  openapi: "3.0.3",
  info: {
    title: "Symbia Network Service API",
    version: "1.0.0",
    description: "Event routing, policy enforcement, and SoftSDN observability API for the Symbia ecosystem."
  },
  servers: [{ url: "/api", description: "API Base URL" }],
  tags: [
    { name: "Registry", description: "Node registration and discovery" },
    { name: "Contracts", description: "Node-to-node communication contracts" },
    { name: "Bridges", description: "External system bridges" },
    { name: "Events", description: "Event routing and tracing" },
    { name: "Policies", description: "Routing policy management" },
    { name: "SDN", description: "SoftSDN observability (read-only)" }
  ],
  security: [
    { bearerAuth: [] },
    { apiKeyAuth: [] },
    { cookieAuth: [] }
  ],
  paths: {
    "/registry/nodes": {
      post: {
        tags: ["Registry"],
        summary: "Register a new node",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/NodeRegistration" }
            }
          }
        },
        responses: {
          "201": {
            description: "Node registered",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/NetworkNode" }
              }
            }
          },
          "400": { description: "Invalid input" }
        }
      },
      get: {
        tags: ["Registry"],
        summary: "List all nodes",
        responses: {
          "200": {
            description: "List of nodes",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    nodes: { type: "array", items: { $ref: "#/components/schemas/NetworkNode" } },
                    count: { type: "integer" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/registry/nodes/{id}": {
      get: {
        tags: ["Registry"],
        summary: "Get a specific node",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Node details",
            content: { "application/json": { schema: { $ref: "#/components/schemas/NetworkNode" } } }
          },
          "404": { description: "Node not found" }
        }
      },
      delete: {
        tags: ["Registry"],
        summary: "Unregister a node",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Node unregistered" },
          "404": { description: "Node not found" }
        }
      }
    },
    "/registry/nodes/{id}/heartbeat": {
      post: {
        tags: ["Registry"],
        summary: "Send heartbeat",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Heartbeat recorded" },
          "404": { description: "Node not found" }
        }
      }
    },
    "/registry/nodes/capability/{capability}": {
      get: {
        tags: ["Registry"],
        summary: "Find nodes by capability",
        parameters: [{ name: "capability", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Nodes with capability" }
        }
      }
    },
    "/registry/nodes/type/{type}": {
      get: {
        tags: ["Registry"],
        summary: "Find nodes by type",
        parameters: [
          {
            name: "type",
            in: "path",
            required: true,
            schema: { type: "string", enum: ["service", "assistant", "sandbox", "bridge", "client"] }
          }
        ],
        responses: { "200": { description: "Nodes of type" } }
      }
    },
    "/registry/contracts": {
      post: {
        tags: ["Contracts"],
        summary: "Create a contract",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ContractCreate" } } }
        },
        responses: {
          "201": {
            description: "Contract created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/NodeContract" } } }
          },
          "400": { description: "Invalid input" }
        }
      },
      get: {
        tags: ["Contracts"],
        summary: "List contracts",
        parameters: [{ name: "nodeId", in: "query", schema: { type: "string" } }],
        responses: { "200": { description: "List of contracts" } }
      }
    },
    "/registry/contracts/{id}": {
      delete: {
        tags: ["Contracts"],
        summary: "Delete a contract",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Contract deleted" }, "404": { description: "Not found" } }
      }
    },
    "/registry/bridges": {
      post: {
        tags: ["Bridges"],
        summary: "Register a bridge",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/BridgeCreate" } } }
        },
        responses: {
          "201": {
            description: "Bridge registered",
            content: { "application/json": { schema: { $ref: "#/components/schemas/NetworkBridge" } } }
          }
        }
      },
      get: {
        tags: ["Bridges"],
        summary: "List bridges",
        responses: { "200": { description: "List of bridges" } }
      }
    },
    "/registry/bridges/{id}": {
      get: {
        tags: ["Bridges"],
        summary: "Get a bridge",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Bridge details" }, "404": { description: "Not found" } }
      },
      patch: {
        tags: ["Bridges"],
        summary: "Update bridge status",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", properties: { active: { type: "boolean" } } }
            }
          }
        },
        responses: { "200": { description: "Bridge updated" } }
      },
      delete: {
        tags: ["Bridges"],
        summary: "Delete a bridge",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Bridge deleted" } }
      }
    },
    "/events": {
      post: {
        tags: ["Events"],
        summary: "Send an event",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/EventCreate" } } }
        },
        responses: {
          "202": {
            description: "Event accepted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    eventId: { type: "string" },
                    trace: { $ref: "#/components/schemas/EventTrace" }
                  }
                }
              }
            }
          }
        }
      },
      get: {
        tags: ["Events"],
        summary: "Get recent events",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 100 } },
          { name: "runId", in: "query", schema: { type: "string" } }
        ],
        responses: { "200": { description: "List of events" } }
      }
    },
    "/events/{id}/trace": {
      get: {
        tags: ["Events"],
        summary: "Get event trace",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Event trace",
            content: { "application/json": { schema: { $ref: "#/components/schemas/EventTrace" } } }
          },
          "404": { description: "Trace not found" }
        }
      }
    },
    "/events/traces/{runId}": {
      get: {
        tags: ["Events"],
        summary: "Get traces for a run",
        parameters: [{ name: "runId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Traces for run" } }
      }
    },
    "/events/hash": {
      post: {
        tags: ["Events"],
        summary: "Compute event hash",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["payload", "source", "runId"],
                properties: {
                  payload: { $ref: "#/components/schemas/EventPayload" },
                  source: { type: "string" },
                  runId: { type: "string" },
                  boundary: { type: "string", enum: ["intra", "inter", "extra"] }
                }
              }
            }
          }
        },
        responses: { "200": { description: "Hash computed" } }
      }
    },
    "/events/stats": {
      get: {
        tags: ["Events"],
        summary: "Get routing statistics",
        responses: { "200": { description: "Routing stats" } }
      }
    },
    "/policies": {
      post: {
        tags: ["Policies"],
        summary: "Create a policy",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/PolicyCreate" } } }
        },
        responses: {
          "201": {
            description: "Policy created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/RoutingPolicy" } } }
          }
        }
      },
      get: {
        tags: ["Policies"],
        summary: "List policies",
        responses: { "200": { description: "List of policies" } }
      }
    },
    "/policies/{id}": {
      get: {
        tags: ["Policies"],
        summary: "Get a policy",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Policy details" }, "404": { description: "Not found" } }
      },
      patch: {
        tags: ["Policies"],
        summary: "Update a policy",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Policy updated" } }
      },
      delete: {
        tags: ["Policies"],
        summary: "Delete a policy",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Policy deleted" } }
      }
    },
    "/policies/test": {
      post: {
        tags: ["Policies"],
        summary: "Test policy evaluation",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["payload", "source", "runId"],
                properties: {
                  payload: { $ref: "#/components/schemas/EventPayload" },
                  source: { type: "string" },
                  runId: { type: "string" },
                  boundary: { type: "string" }
                }
              }
            }
          }
        },
        responses: { "200": { description: "Evaluation result" } }
      }
    },
    "/sdn/topology": {
      get: {
        tags: ["SDN"],
        summary: "Get network topology",
        responses: {
          "200": {
            description: "Network topology",
            content: { "application/json": { schema: { $ref: "#/components/schemas/NetworkTopology" } } }
          }
        }
      }
    },
    "/sdn/summary": {
      get: {
        tags: ["SDN"],
        summary: "Get network summary",
        responses: { "200": { description: "Network summary" } }
      }
    },
    "/sdn/trace/{eventId}": {
      get: {
        tags: ["SDN"],
        summary: "Trace an event",
        parameters: [{ name: "eventId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Event trace" }, "404": { description: "Not found" } }
      }
    },
    "/sdn/traces/{runId}": {
      get: {
        tags: ["SDN"],
        summary: "Get traces for a run",
        parameters: [{ name: "runId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Traces for run" } }
      }
    },
    "/sdn/flow/{runId}": {
      get: {
        tags: ["SDN"],
        summary: "Get event flow",
        parameters: [
          { name: "runId", in: "path", required: true, schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 500 } }
        ],
        responses: { "200": { description: "Event flow graph" } }
      }
    },
    "/sdn/policies": {
      get: {
        tags: ["SDN"],
        summary: "Get policies (read-only)",
        responses: { "200": { description: "List of policies" } }
      }
    },
    "/sdn/simulate": {
      post: {
        tags: ["SDN"],
        summary: "Simulate event routing",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["payload", "source", "runId"],
                properties: {
                  payload: { $ref: "#/components/schemas/EventPayload" },
                  source: { type: "string" },
                  runId: { type: "string" },
                  target: { type: "string" },
                  boundary: { type: "string", enum: ["intra", "inter", "extra"] }
                }
              }
            }
          }
        },
        responses: { "200": { description: "Simulation result" } }
      }
    },
    "/sdn/graph": {
      get: {
        tags: ["SDN"],
        summary: "Get network graph",
        responses: { "200": { description: "Network graph" } }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT token from Identity Service"
      },
      apiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
        description: "API key from Identity Service"
      },
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "token",
        description: "Session cookie from Identity Service"
      }
    },
    schemas: {
      EventPayload: {
        type: "object",
        required: ["type", "data"],
        properties: {
          type: { type: "string" },
          data: {}
        }
      },
      EventWrapper: {
        type: "object",
        properties: {
          id: { type: "string" },
          runId: { type: "string" },
          timestamp: { type: "string", format: "date-time" },
          source: { type: "string" },
          target: { type: "string" },
          causedBy: { type: "string" },
          path: { type: "array", items: { type: "string" } },
          boundary: { type: "string", enum: ["intra", "inter", "extra"] }
        }
      },
      SandboxEvent: {
        type: "object",
        properties: {
          payload: { $ref: "#/components/schemas/EventPayload" },
          wrapper: { $ref: "#/components/schemas/EventWrapper" },
          hash: { type: "string" }
        }
      },
      EventCreate: {
        type: "object",
        required: ["payload", "source", "runId"],
        properties: {
          payload: { $ref: "#/components/schemas/EventPayload" },
          source: { type: "string" },
          runId: { type: "string" },
          target: { type: "string" },
          causedBy: { type: "string" },
          boundary: { type: "string", enum: ["intra", "inter", "extra"] }
        }
      },
      NetworkNode: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          type: { type: "string", enum: ["service", "assistant", "sandbox", "bridge", "client"] },
          capabilities: { type: "array", items: { type: "string" } },
          endpoint: { type: "string" },
          socketId: { type: "string" },
          registeredAt: { type: "string", format: "date-time" },
          lastHeartbeat: { type: "string", format: "date-time" },
          metadata: { type: "object" }
        }
      },
      NodeRegistration: {
        type: "object",
        required: ["id", "name", "type", "capabilities", "endpoint"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          type: { type: "string", enum: ["service", "assistant", "sandbox", "bridge", "client"] },
          capabilities: { type: "array", items: { type: "string" } },
          endpoint: { type: "string" },
          metadata: { type: "object" }
        }
      },
      NodeContract: {
        type: "object",
        properties: {
          id: { type: "string" },
          from: { type: "string" },
          to: { type: "string" },
          allowedEventTypes: { type: "array", items: { type: "string" } },
          boundaries: { type: "array", items: { type: "string", enum: ["intra", "inter", "extra"] } },
          createdAt: { type: "string", format: "date-time" },
          expiresAt: { type: "string", format: "date-time" }
        }
      },
      ContractCreate: {
        type: "object",
        required: ["from", "to", "allowedEventTypes", "boundaries"],
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          allowedEventTypes: { type: "array", items: { type: "string" } },
          boundaries: { type: "array", items: { type: "string", enum: ["intra", "inter", "extra"] } },
          expiresAt: { type: "string", format: "date-time" }
        }
      },
      NetworkBridge: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          type: { type: "string", enum: ["webhook", "websocket", "grpc", "custom"] },
          endpoint: { type: "string" },
          eventTypes: { type: "array", items: { type: "string" } },
          active: { type: "boolean" },
          config: { type: "object" },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      BridgeCreate: {
        type: "object",
        required: ["name", "type", "endpoint", "eventTypes"],
        properties: {
          name: { type: "string" },
          type: { type: "string", enum: ["webhook", "websocket", "grpc", "custom"] },
          endpoint: { type: "string" },
          eventTypes: { type: "array", items: { type: "string" } },
          config: { type: "object" }
        }
      },
      RoutingPolicy: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          priority: { type: "integer" },
          conditions: { type: "array", items: { $ref: "#/components/schemas/PolicyCondition" } },
          action: { $ref: "#/components/schemas/PolicyAction" },
          enabled: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      PolicyCreate: {
        type: "object",
        required: ["name", "priority", "conditions", "action"],
        properties: {
          name: { type: "string" },
          priority: { type: "integer" },
          conditions: { type: "array", items: { $ref: "#/components/schemas/PolicyCondition" } },
          action: { $ref: "#/components/schemas/PolicyAction" }
        }
      },
      PolicyCondition: {
        type: "object",
        properties: {
          field: { type: "string", enum: ["source", "target", "eventType", "boundary", "runId"] },
          operator: { type: "string", enum: ["eq", "neq", "contains", "startsWith", "regex"] },
          value: { type: "string" }
        }
      },
      PolicyAction: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["allow", "deny", "route", "transform", "log"] },
          reason: { type: "string" },
          to: { type: "string" },
          mapping: { type: "object" },
          level: { type: "string", enum: ["debug", "info", "warn", "error"] }
        }
      },
      EventTrace: {
        type: "object",
        properties: {
          eventId: { type: "string" },
          runId: { type: "string" },
          path: { type: "array", items: { $ref: "#/components/schemas/TraceHop" } },
          totalDurationMs: { type: "number" },
          status: { type: "string", enum: ["delivered", "unrouted", "dropped", "pending", "error"] },
          error: { type: "string" }
        }
      },
      TraceHop: {
        type: "object",
        properties: {
          node: { type: "string" },
          timestamp: { type: "string", format: "date-time" },
          durationMs: { type: "number" },
          policyId: { type: "string" },
          action: { type: "string", enum: ["forward", "deliver", "drop", "transform"] }
        }
      },
      NetworkTopology: {
        type: "object",
        properties: {
          nodes: { type: "array", items: { $ref: "#/components/schemas/NetworkNode" } },
          contracts: { type: "array", items: { $ref: "#/components/schemas/NodeContract" } },
          bridges: { type: "array", items: { $ref: "#/components/schemas/NetworkBridge" } },
          timestamp: { type: "string", format: "date-time" }
        }
      }
    }
  }
};
{
  const __autoDocumentedPaths = {
    "/bootstrap/service": {
      "get": {
        "tags": [
          "Bootstrap"
        ],
        "summary": "Get service",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/platform/health": {
      "get": {
        "tags": [
          "Platform"
        ],
        "summary": "Get health",
        "description": "Documented from the implemented route. Request/response schema to be enriched.",
        "x-auto-documented": true,
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "additionalProperties": true
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    }
  };
  const __paths = apiDocumentation.paths;
  for (const [key, ops] of Object.entries(__autoDocumentedPaths)) {
    __paths[key] = { ...__paths[key] || {}, ...ops };
  }
}

// ../../network/server/src/doc-routes.ts
var docsRoot = path.resolve(process.cwd(), "docs");
function sendDocFile(res, filename, contentType) {
  const filePath = path.join(docsRoot, filename);
  if (fs.existsSync(filePath)) {
    res.type(contentType).sendFile(filePath);
  } else {
    res.status(404).json({ error: "Document not found. Run build to generate docs." });
  }
}
function registerDocRoutes(app) {
  app.get("/docs/openapi.json", (_req, res) => {
    const filePath = path.join(docsRoot, "openapi.json");
    if (fs.existsSync(filePath)) {
      res.type("application/json").sendFile(filePath);
    } else {
      res.type("application/json").json(apiDocumentation);
    }
  });
  app.get("/api/docs/openapi.json", (_req, res) => {
    res.redirect(302, "/docs/openapi.json");
  });
  app.get("/openapi.json", (_req, res) => {
    res.redirect(302, "/docs/openapi.json");
  });
  app.get("/.well-known/openapi.json", (_req, res) => {
    res.redirect(302, "/docs/openapi.json");
  });
  app.get("/api/docs", (_req, res) => {
    res.redirect(302, "/docs/openapi.json");
  });
  app.get("/docs/llms.txt", (_req, res) => {
    sendDocFile(res, "llms.txt", "text/plain");
  });
  app.get("/llms.txt", (_req, res) => {
    res.redirect(302, "/docs/llms.txt");
  });
  app.get("/llm.txt", (_req, res) => {
    res.redirect(302, "/docs/llms.txt");
  });
  app.get("/docs/llms-full.txt", (_req, res) => {
    sendDocFile(res, "llms-full.txt", "text/plain");
  });
  app.get("/llms-full.txt", (_req, res) => {
    res.redirect(302, "/docs/llms-full.txt");
  });
}

// ../../network/server/src/seed.ts
import { ServiceId as ServiceId2, ServicePorts as ServicePorts2 } from "@symbia/sys";
var DEV_SERVICE_SHAPES = [
  {
    id: ServiceId2.IDENTITY,
    name: "Identity Service",
    type: "service",
    capabilities: ["auth", "users", "orgs", "api-keys"]
  },
  {
    id: ServiceId2.LOGGING,
    name: "Logging Service",
    type: "service",
    capabilities: ["telemetry", "logs", "metrics", "traces"]
  },
  {
    id: ServiceId2.CATALOG,
    name: "Catalog Service",
    type: "service",
    capabilities: ["resources", "schemas", "manifests"]
  },
  {
    id: ServiceId2.ASSISTANTS,
    name: "Assistants Service",
    type: "assistant",
    capabilities: ["graphs", "actors", "runs", "ai-engine"]
  },
  {
    id: ServiceId2.MESSAGING,
    name: "Messaging Service",
    type: "service",
    capabilities: ["conversations", "messages", "realtime"]
  },
  {
    id: ServiceId2.RUNTIME,
    name: "Runtime Service",
    type: "sandbox",
    capabilities: ["graphs", "execution", "sandbox"]
  },
  {
    id: ServiceId2.INTEGRATIONS,
    name: "Integrations Service",
    type: "bridge",
    capabilities: ["providers", "credentials", "external-apis"]
  },
  {
    id: ServiceId2.NETWORK,
    name: "Network Service",
    type: "service",
    capabilities: ["registry", "routing", "policies", "sdn"]
  }
];
var DEV_SERVICES = DEV_SERVICE_SHAPES.map((s) => ({
  ...s,
  port: ServicePorts2[s.id]
}));
async function seedDevServices() {
  const isDev = process.env.NODE_ENV === "development" || process.env.NETWORK_DEV_SEED === "true";
  if (!isDev) {
    return;
  }
  console.log("[Network Seed] Seeding dev services...");
  for (const service of DEV_SERVICES) {
    const endpoint = `http://localhost:${service.port}`;
    const isRunning = await checkServiceHealth(endpoint);
    registerNode(
      service.id,
      service.name,
      service.type,
      service.capabilities,
      endpoint,
      void 0,
      { seeded: true, running: isRunning }
    );
    console.log(`[Network Seed] Registered ${service.name} (${service.id}) - ${isRunning ? "ONLINE" : "offline"}`);
  }
  const contractCount = seedDevContracts();
  console.log(`[Network Seed] Created ${contractCount} contracts`);
  await seedDevEvents();
  startPeriodicEventGenerator();
  console.log("[Network Seed] Done seeding dev environment");
}
async function checkServiceHealth(endpoint) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2e3);
    const response = await fetch(`${endpoint}/health`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}
function seedDevContracts() {
  let count = 0;
  const contractDefs = [
    // Assistants -> Runtime: workflow execution
    {
      from: ServiceId2.ASSISTANTS,
      to: ServiceId2.RUNTIME,
      events: ["graph.execute", "graph.input", "graph.output", "node.execute"],
      boundaries: ["intra"]
    },
    // Assistants -> Integrations: LLM calls
    {
      from: ServiceId2.ASSISTANTS,
      to: ServiceId2.INTEGRATIONS,
      events: ["llm.invoke", "llm.complete", "provider.execute"],
      boundaries: ["intra", "extra"]
    },
    // Runtime -> Integrations: external API calls from graph nodes
    {
      from: ServiceId2.RUNTIME,
      to: ServiceId2.INTEGRATIONS,
      events: ["provider.execute", "http.request", "api.call"],
      boundaries: ["intra", "extra"]
    },
    // Runtime -> Catalog: load graph definitions
    {
      from: ServiceId2.RUNTIME,
      to: ServiceId2.CATALOG,
      events: ["resource.get", "schema.validate", "manifest.load"],
      boundaries: ["intra"]
    },
    // Assistants -> Catalog: load actor configs
    {
      from: ServiceId2.ASSISTANTS,
      to: ServiceId2.CATALOG,
      events: ["resource.get", "actor.config", "graph.definition"],
      boundaries: ["intra"]
    },
    // Messaging -> Assistants: route messages to AI
    {
      from: ServiceId2.MESSAGING,
      to: ServiceId2.ASSISTANTS,
      events: ["message.received", "message.new", "conversation.started", "user.input"],
      boundaries: ["intra"]
    },
    // Messaging -> Integrations: route assistant messages to channel bridge
    {
      from: ServiceId2.MESSAGING,
      to: ServiceId2.INTEGRATIONS,
      events: ["message.new"],
      boundaries: ["intra"]
    },
    // Assistants -> Messaging: send AI responses
    {
      from: ServiceId2.ASSISTANTS,
      to: ServiceId2.MESSAGING,
      events: ["message.send", "message.response", "assistant.action.respond", "typing.start", "typing.stop", "stream.chunk"],
      boundaries: ["intra"]
    },
    // Integrations -> external (bridge) - logging
    {
      from: ServiceId2.INTEGRATIONS,
      to: ServiceId2.LOGGING,
      events: ["api.request", "api.response", "api.error", "llm.request", "llm.response"],
      boundaries: ["extra"]
    }
  ];
  for (const def of contractDefs) {
    const contract = createContract(
      def.from,
      def.to,
      def.events,
      [...def.boundaries]
    );
    if (contract) {
      count++;
    }
  }
  for (const service of DEV_SERVICES) {
    if (service.id !== ServiceId2.LOGGING) {
      const contract = createContract(
        service.id,
        ServiceId2.LOGGING,
        [
          "log.write",
          "metric.record",
          "trace.span",
          "error.report",
          // Additional telemetry event types
          "api.request",
          "api.response",
          "api.error",
          "message.received",
          "message.sent",
          "resource.access",
          "resource.modified",
          // Ephemeral observability events (via @symbia/relay)
          "obs.http.request",
          "obs.http.response",
          "obs.db.query",
          "obs.db.slow",
          "obs.cache.hit",
          "obs.cache.miss",
          "obs.error",
          "obs.process.metrics"
        ],
        ["intra", "extra"]
        // Allow both intra and extra boundary for logging
      );
      if (contract) count++;
    }
  }
  for (const service of DEV_SERVICES) {
    if (service.id !== ServiceId2.NETWORK) {
      const contract = createContract(
        service.id,
        ServiceId2.NETWORK,
        [
          "obs.http.request",
          "obs.http.response",
          "obs.db.query",
          "obs.db.slow",
          "obs.cache.hit",
          "obs.cache.miss",
          "obs.error",
          "obs.process.metrics"
        ],
        ["intra"]
      );
      if (contract) count++;
    }
  }
  for (const service of DEV_SERVICES) {
    if (service.id !== ServiceId2.IDENTITY) {
      const contract = createContract(
        service.id,
        ServiceId2.IDENTITY,
        ["auth.verify", "token.validate", "user.lookup", "permission.check"],
        ["intra"]
      );
      if (contract) count++;
    }
  }
  return count;
}
async function seedDevEvents() {
  const runId = `demo-run-${Date.now()}`;
  const eventSequence = [
    // User sends a message
    {
      source: ServiceId2.MESSAGING,
      target: ServiceId2.ASSISTANTS,
      type: "message.received",
      data: { content: "Hello, can you help me analyze this data?", userId: "demo-user" },
      boundary: "intra"
    },
    // Assistants validates auth
    {
      source: ServiceId2.ASSISTANTS,
      target: ServiceId2.IDENTITY,
      type: "auth.verify",
      data: { userId: "demo-user", action: "assistant.invoke" },
      boundary: "intra"
    },
    // Assistants loads graph definition
    {
      source: ServiceId2.ASSISTANTS,
      target: ServiceId2.CATALOG,
      type: "resource.get",
      data: { resourceType: "graph", resourceId: "data-analysis-graph" },
      boundary: "intra"
    },
    // Assistants triggers graph execution
    {
      source: ServiceId2.ASSISTANTS,
      target: ServiceId2.RUNTIME,
      type: "graph.execute",
      data: { graphId: "data-analysis-graph", input: { query: "analyze data" } },
      boundary: "intra"
    },
    // Runtime calls LLM via integrations
    {
      source: ServiceId2.RUNTIME,
      target: ServiceId2.INTEGRATIONS,
      type: "llm.invoke",
      data: { provider: "openai", model: "gpt-4o-mini", prompt: "Analyze the following..." },
      boundary: "extra"
    },
    // Integrations logs the external call
    {
      source: ServiceId2.INTEGRATIONS,
      target: ServiceId2.LOGGING,
      type: "api.request",
      data: { provider: "openai", endpoint: "/v1/chat/completions", status: 200 },
      boundary: "extra"
    },
    // Assistants sends response back
    {
      source: ServiceId2.ASSISTANTS,
      target: ServiceId2.MESSAGING,
      type: "message.send",
      data: { content: "I've analyzed your data. Here are the insights...", userId: "demo-user" },
      boundary: "intra"
    },
    // Telemetry events
    {
      source: ServiceId2.RUNTIME,
      target: ServiceId2.LOGGING,
      type: "metric.record",
      data: { metric: "graph.execution.duration", value: 1250, unit: "ms" },
      boundary: "intra"
    },
    {
      source: ServiceId2.ASSISTANTS,
      target: ServiceId2.LOGGING,
      type: "trace.span",
      data: { operation: "assistant.process", duration: 1842, success: true },
      boundary: "intra"
    }
  ];
  console.log("[Network Seed] Generating sample SDN events...");
  for (let i = 0; i < eventSequence.length; i++) {
    const eventDef = eventSequence[i];
    const event = createEvent(
      { type: eventDef.type, data: eventDef.data },
      eventDef.source,
      runId,
      {
        target: eventDef.target,
        boundary: eventDef.boundary,
        causedBy: i > 0 ? `demo-event-${i - 1}` : void 0
      }
    );
    recordEvent(event);
    await routeEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  console.log(`[Network Seed] Generated ${eventSequence.length} sample events`);
}
function startPeriodicEventGenerator() {
  const eventTypes = [
    { source: ServiceId2.RUNTIME, type: "metric.record", data: () => ({ metric: "graph.executions", value: Math.floor(Math.random() * 100), unit: "count" }) },
    { source: ServiceId2.ASSISTANTS, type: "trace.span", data: () => ({ operation: "assistant.invoke", duration: Math.floor(Math.random() * 2e3), success: true }) },
    { source: ServiceId2.INTEGRATIONS, type: "api.request", data: () => ({ provider: "openai", latency: Math.floor(Math.random() * 500), status: 200 }) },
    { source: ServiceId2.MESSAGING, type: "message.received", data: () => ({ conversationId: `conv-${Date.now()}`, messageCount: Math.floor(Math.random() * 10) + 1 }) },
    { source: ServiceId2.CATALOG, type: "resource.access", data: () => ({ resourceType: "graph", action: "read", cached: Math.random() > 0.5 }) }
  ];
  let eventIndex = 0;
  setInterval(async () => {
    const eventDef = eventTypes[eventIndex % eventTypes.length];
    eventIndex++;
    const runId = `live-telemetry-${Date.now()}`;
    const event = createEvent(
      { type: eventDef.type, data: eventDef.data() },
      eventDef.source,
      runId,
      { target: ServiceId2.LOGGING, boundary: "intra" }
    );
    recordEvent(event);
    await routeEvent(event);
  }, 5e3);
  console.log("[Network Seed] Started periodic event generator (every 5s)");
}

// ../../network/server/src/routes.ts
async function registerRoutes(_server, app) {
  initDefaultPolicies();
  registerDocRoutes(app);
  app.get("/api/bootstrap/service", (_req, res) => {
    res.json({
      service: config.serviceId,
      version: "1.0.0",
      description: "Event routing, policy enforcement, and SoftSDN observability",
      docsUrls: {
        openapi: "/docs/openapi.json",
        llms: "/docs/llms.txt"
      },
      endpoints: {
        registry: "/api/registry",
        events: "/api/events",
        policies: "/api/policies",
        sdn: "/api/sdn",
        websocket: "/"
      },
      authentication: [
        "Bearer token (JWT)",
        "API key (X-API-Key header)"
      ],
      websocketEvents: {
        client: [
          "node:register",
          "node:heartbeat",
          "node:unregister",
          "event:send",
          "contract:create",
          "sdn:watch",
          "sdn:unwatch",
          "sdn:topology"
        ],
        server: [
          "network:node:joined",
          "network:node:left",
          "network:node:disconnected",
          "network:contract:created",
          "event:received",
          "sdn:event"
        ]
      }
    });
  });
  app.use("/api/registry", registry_default);
  app.use("/api/events", events_default);
  app.use("/api/policies", policies_default);
  app.use("/api/sdn", sdn_default);
  app.get("/api/platform/health", async (_req, res) => {
    const services = [
      { id: ServiceId3.IDENTITY, name: "Identity" },
      { id: ServiceId3.LOGGING, name: "Logging" },
      { id: ServiceId3.CATALOG, name: "Catalog" },
      { id: ServiceId3.MESSAGING, name: "Messaging" },
      { id: ServiceId3.RUNTIME, name: "Runtime" },
      { id: ServiceId3.ASSISTANTS, name: "Assistants" }
    ];
    const results = await Promise.all(
      services.map(async ({ id, name }) => {
        const url = resolveServiceUrl2(id);
        try {
          const response = await fetch(`${url}/health`, {
            signal: AbortSignal.timeout(3e3)
          });
          return {
            service: name,
            serviceId: id,
            url,
            status: response.ok ? "healthy" : "unhealthy",
            statusCode: response.status
          };
        } catch (error) {
          return {
            service: name,
            serviceId: id,
            url,
            status: "unreachable",
            error: error instanceof Error ? error.message : "Unknown error"
          };
        }
      })
    );
    const healthy = results.filter((r) => r.status === "healthy").length;
    const total = results.length;
    const allHealthy = healthy === total;
    res.status(allHealthy ? 200 : 503).json({
      platform: allHealthy ? "healthy" : "degraded",
      summary: `${healthy}/${total} services healthy`,
      services: results,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  setInterval(() => {
    const staleNodes = cleanupStaleNodes();
    if (staleNodes.length > 0) {
      console.log(`[Network] Cleaned up ${staleNodes.length} stale nodes:`, staleNodes);
      telemetry.event(
        NetworkEvents.NODE_STALE_CLEANUP,
        `Cleaned up ${staleNodes.length} stale nodes`,
        { nodeIds: staleNodes, count: staleNodes.length }
      );
      telemetry.metric(NetworkMetrics.NODE_STALE_CLEANUP, staleNodes.length);
    }
    const expiredContracts = cleanupExpiredContracts();
    if (expiredContracts.length > 0) {
      console.log(`[Network] Cleaned up ${expiredContracts.length} expired contracts`);
      telemetry.event(
        NetworkEvents.CONTRACT_EXPIRED,
        `Cleaned up ${expiredContracts.length} expired contracts`,
        { count: expiredContracts.length }
      );
      telemetry.metric(NetworkMetrics.CONTRACT_EXPIRED, expiredContracts.length);
    }
    const topology = getTopology();
    telemetry.metric(NetworkMetrics.NODE_ACTIVE_COUNT, topology.nodes.length);
    telemetry.metric(NetworkMetrics.CONTRACT_ACTIVE_COUNT, topology.contracts.length);
    telemetry.metric(NetworkMetrics.BRIDGE_ACTIVE_COUNT, topology.bridges.length);
  }, config.heartbeatIntervalMs);
  if (process.env.NODE_ENV === "development" || process.env.NETWORK_DEV_SEED === "true") {
    setTimeout(() => {
      seedDevServices().catch((err) => {
        console.error("[Network] Failed to seed dev services:", err);
      });
    }, 3e3);
  }
}
export {
  registerRoutes
};
