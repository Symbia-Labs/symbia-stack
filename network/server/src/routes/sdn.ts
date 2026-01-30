/**
 * SoftSDN Routes
 *
 * Read-only API for network observability.
 * Designed for assistant access to understand topology and trace events.
 *
 * Authorization:
 * - Agents (services) have full access
 * - Users require appropriate cap:network.* entitlements
 * - Anonymous access is denied
 */

import { Router, type Request, type Response } from 'express';
import * as registry from '../services/registry.js';
import * as router from '../services/router.js';
import * as policy from '../services/policy.js';
import { requirePermission } from '../middleware/auth.js';
import { NetworkPermissions } from '../types.js';

const sdnRouter = Router();

/**
 * Get full network topology
 * GET /api/sdn/topology
 *
 * Returns all nodes, contracts, and bridges for visualization.
 * Requires: cap:network.topology.read
 */
sdnRouter.get('/topology', requirePermission(NetworkPermissions.TOPOLOGY_READ), (_req: Request, res: Response) => {
  const topology = registry.getTopology();
  res.json(topology);
});

/**
 * Get network summary
 * GET /api/sdn/summary
 *
 * High-level stats about the network state.
 * Requires: cap:network.topology.read
 */
sdnRouter.get('/summary', requirePermission(NetworkPermissions.TOPOLOGY_READ), (_req: Request, res: Response) => {
  const topology = registry.getTopology();
  const routingStats = router.getStats();
  const policies = policy.getAllPolicies();

  res.json({
    nodes: {
      total: topology.nodes.length,
      byType: {
        service: topology.nodes.filter((n) => n.type === 'service').length,
        assistant: topology.nodes.filter((n) => n.type === 'assistant').length,
        sandbox: topology.nodes.filter((n) => n.type === 'sandbox').length,
        bridge: topology.nodes.filter((n) => n.type === 'bridge').length,
      },
      connected: topology.nodes.filter((n) => n.socketId).length,
    },
    contracts: {
      total: topology.contracts.length,
    },
    bridges: {
      total: topology.bridges.length,
      active: topology.bridges.filter((b) => b.active).length,
    },
    events: routingStats,
    policies: {
      total: policies.length,
      enabled: policies.filter((p) => p.enabled).length,
    },
    timestamp: topology.timestamp,
  });
});

/**
 * Trace an event by ID
 * GET /api/sdn/trace/:eventId
 *
 * Returns the full trace of how an event was routed.
 * Requires: cap:network.traces.read
 */
sdnRouter.get('/trace/:eventId', requirePermission(NetworkPermissions.TRACES_READ), (req: Request, res: Response) => {
  const trace = router.getTrace(req.params.eventId);
  if (!trace) {
    res.status(404).json({ error: 'Trace not found' });
    return;
  }

  // Enrich with node names
  const enrichedPath = trace.path.map((hop) => {
    const node = registry.getNode(hop.node);
    return {
      ...hop,
      nodeName: node?.name || hop.node,
      nodeType: node?.type,
    };
  });

  res.json({
    ...trace,
    path: enrichedPath,
  });
});

/**
 * Get traces for a workflow run
 * GET /api/sdn/traces/:runId
 *
 * Returns all traces for a specific run for debugging.
 * Requires: cap:network.traces.read
 */
sdnRouter.get('/traces/:runId', requirePermission(NetworkPermissions.TRACES_READ), (req: Request, res: Response) => {
  const traces = router.getTracesForRun(req.params.runId);
  res.json({ traces, count: traces.length, runId: req.params.runId });
});

/**
 * Get event flow for a run
 * GET /api/sdn/flow/:runId
 *
 * Returns events in chronological order for visualization.
 * Requires: cap:network.traces.read
 */
sdnRouter.get('/flow/:runId', requirePermission(NetworkPermissions.TRACES_READ), (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 500;
  const events = router.getEventsForRun(req.params.runId, limit);

  // Build flow graph
  const nodes = new Set<string>();
  const edges: Array<{ from: string; to: string; eventType: string; timestamp: string }> = [];

  for (const event of events) {
    nodes.add(event.wrapper.source);
    for (let i = 0; i < event.wrapper.path.length - 1; i++) {
      nodes.add(event.wrapper.path[i]);
      nodes.add(event.wrapper.path[i + 1]);
      edges.push({
        from: event.wrapper.path[i],
        to: event.wrapper.path[i + 1],
        eventType: event.payload.type,
        timestamp: event.wrapper.timestamp,
      });
    }
  }

  res.json({
    runId: req.params.runId,
    nodes: Array.from(nodes).map((id) => {
      const node = registry.getNode(id);
      return { id, name: node?.name, type: node?.type };
    }),
    edges,
    eventCount: events.length,
  });
});

/**
 * Get all routing policies
 * GET /api/sdn/policies
 * Requires: cap:network.policies.read
 */
sdnRouter.get('/policies', requirePermission(NetworkPermissions.POLICIES_READ), (_req: Request, res: Response) => {
  const policies = policy.getAllPolicies();
  res.json({ policies, count: policies.length });
});

/**
 * Simulate routing an event (dry run)
 * POST /api/sdn/simulate
 *
 * Tests what would happen if an event was sent without actually sending it.
 * Requires: cap:network.events.read
 */
sdnRouter.post('/simulate', requirePermission(NetworkPermissions.EVENTS_READ), (req: Request, res: Response) => {
  const { payload, source, runId, target, boundary } = req.body;

  if (!payload || !source || !runId) {
    res.status(400).json({ error: 'Missing required fields: payload, source, runId' });
    return;
  }

  // Create a temporary event to evaluate
  const tempEvent = router.createEvent(payload, source, runId, {
    target,
    boundary: boundary || 'intra',
  });

  // Check if source node exists
  const sourceNode = registry.getNode(source);
  if (!sourceNode) {
    res.json({
      wouldSucceed: false,
      reason: 'Source node not registered',
      event: tempEvent,
    });
    return;
  }

  // Find potential targets
  let targets: string[] = [];
  if (target) {
    targets = [target];
  } else {
    const contracts = registry.getContractsForNode(source);
    targets = contracts
      .filter((c) => c.from === source)
      .filter((c) => c.allowedEventTypes.includes(payload.type) || c.allowedEventTypes.includes('*'))
      .filter((c) => c.boundaries.includes(boundary || 'intra'))
      .map((c) => c.to);
  }

  // Evaluate policies
  const policyResult = policy.evaluatePolicies(tempEvent);

  res.json({
    wouldSucceed: policyResult.action.type !== 'deny' && targets.length > 0,
    event: tempEvent,
    sourceNode: { id: sourceNode.id, name: sourceNode.name, type: sourceNode.type },
    targets: targets.map((t) => {
      const node = registry.getNode(t);
      return { id: t, name: node?.name, type: node?.type, exists: !!node };
    }),
    policyResult,
    reasons: [
      targets.length === 0 ? 'No valid targets found' : null,
      policyResult.action.type === 'deny' ? `Denied by policy: ${policyResult.policyId}` : null,
    ].filter(Boolean),
  });
});

/**
 * Get node graph (adjacency list)
 * GET /api/sdn/graph
 *
 * Returns the network as a graph for visualization tools.
 * Requires: cap:network.topology.read
 */
sdnRouter.get('/graph', requirePermission(NetworkPermissions.TOPOLOGY_READ), (_req: Request, res: Response) => {
  const topology = registry.getTopology();

  // Build adjacency list from contracts
  const adjacency: Record<string, string[]> = {};
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
      connected: !!n.socketId,
    })),
    adjacency,
    bridges: topology.bridges.map((b) => ({
      id: b.id,
      name: b.name,
      type: b.type,
      active: b.active,
      eventTypes: b.eventTypes,
    })),
  });
});

export default sdnRouter;
