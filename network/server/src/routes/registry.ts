/**
 * Registry Routes
 *
 * API endpoints for node registration, contracts, and bridges.
 * All routes require authentication; write operations require specific permissions.
 */

import { Router, type Request, type Response } from 'express';
import * as registry from '../services/registry.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { NetworkPermissions } from '../types.js';

const router = Router();

// All registry routes require authentication
router.use(requireAuth);

// ============================================================================
// Node Registration
// ============================================================================

/**
 * Register a new node
 * POST /api/registry/nodes
 */
router.post('/nodes', requirePermission(NetworkPermissions.NODES_ADMIN), (req: Request, res: Response) => {
  const { id, name, type, capabilities, endpoint, metadata } = req.body;

  if (!id || !name || !type || !capabilities || !endpoint) {
    res.status(400).json({ error: 'Missing required fields: id, name, type, capabilities, endpoint' });
    return;
  }

  const validTypes = ['service', 'assistant', 'sandbox', 'bridge', 'client'];
  if (!validTypes.includes(type)) {
    res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
    return;
  }

  const node = registry.registerNode(id, name, type, capabilities, endpoint, undefined, metadata);
  res.status(201).json(node);
});

/**
 * List all nodes
 * GET /api/registry/nodes
 */
router.get('/nodes', (_req: Request, res: Response) => {
  const nodes = registry.getAllNodes();
  res.json({ nodes, count: nodes.length });
});

/**
 * Get a specific node
 * GET /api/registry/nodes/:id
 */
router.get('/nodes/:id', (req: Request, res: Response) => {
  const node = registry.getNode(req.params.id);
  if (!node) {
    res.status(404).json({ error: 'Node not found' });
    return;
  }
  res.json(node);
});

/**
 * Send heartbeat for a node
 * POST /api/registry/nodes/:id/heartbeat
 */
router.post('/nodes/:id/heartbeat', (req: Request, res: Response) => {
  const success = registry.heartbeat(req.params.id);
  if (!success) {
    res.status(404).json({ error: 'Node not found' });
    return;
  }
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

/**
 * Unregister a node
 * DELETE /api/registry/nodes/:id
 */
router.delete('/nodes/:id', requirePermission(NetworkPermissions.NODES_ADMIN), (req: Request, res: Response) => {
  const success = registry.unregisterNode(req.params.id);
  if (!success) {
    res.status(404).json({ error: 'Node not found' });
    return;
  }
  res.json({ ok: true });
});

/**
 * Find nodes by capability
 * GET /api/registry/nodes/capability/:capability
 */
router.get('/nodes/capability/:capability', (req: Request, res: Response) => {
  const nodes = registry.findNodesByCapability(req.params.capability);
  res.json({ nodes, count: nodes.length });
});

/**
 * Find nodes by type
 * GET /api/registry/nodes/type/:type
 */
router.get('/nodes/type/:type', (req: Request, res: Response) => {
  const validTypes = ['service', 'assistant', 'sandbox', 'bridge', 'client'];
  if (!validTypes.includes(req.params.type)) {
    res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
    return;
  }
  const nodes = registry.findNodesByType(req.params.type as any);
  res.json({ nodes, count: nodes.length });
});

// ============================================================================
// Contracts
// ============================================================================

/**
 * Create a contract between nodes
 * POST /api/registry/contracts
 */
router.post('/contracts', requirePermission(NetworkPermissions.CONTRACTS_WRITE), (req: Request, res: Response) => {
  const { from, to, allowedEventTypes, boundaries, expiresAt } = req.body;

  if (!from || !to || !allowedEventTypes || !boundaries) {
    res.status(400).json({ error: 'Missing required fields: from, to, allowedEventTypes, boundaries' });
    return;
  }

  const contract = registry.createContract(from, to, allowedEventTypes, boundaries, expiresAt);
  if (!contract) {
    res.status(400).json({ error: 'One or both nodes not found' });
    return;
  }

  res.status(201).json(contract);
});

/**
 * Get contracts for a node
 * GET /api/registry/contracts?nodeId=xxx
 */
router.get('/contracts', (req: Request, res: Response) => {
  const nodeId = req.query.nodeId as string;
  if (nodeId) {
    const contracts = registry.getContractsForNode(nodeId);
    res.json({ contracts, count: contracts.length });
  } else {
    // Return all contracts via topology
    const topology = registry.getTopology();
    res.json({ contracts: topology.contracts, count: topology.contracts.length });
  }
});

/**
 * Delete a contract
 * DELETE /api/registry/contracts/:id
 */
router.delete('/contracts/:id', requirePermission(NetworkPermissions.CONTRACTS_WRITE), (req: Request, res: Response) => {
  const success = registry.deleteContract(req.params.id);
  if (!success) {
    res.status(404).json({ error: 'Contract not found' });
    return;
  }
  res.json({ ok: true });
});

// ============================================================================
// Bridges
// ============================================================================

/**
 * Register a bridge
 * POST /api/registry/bridges
 */
router.post('/bridges', requirePermission(NetworkPermissions.NODES_ADMIN), (req: Request, res: Response) => {
  const { name, type, endpoint, eventTypes, config: bridgeConfig } = req.body;

  if (!name || !type || !endpoint || !eventTypes) {
    res.status(400).json({ error: 'Missing required fields: name, type, endpoint, eventTypes' });
    return;
  }

  const validTypes = ['webhook', 'websocket', 'grpc', 'custom'];
  if (!validTypes.includes(type)) {
    res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
    return;
  }

  const bridge = registry.registerBridge(name, type, endpoint, eventTypes, bridgeConfig);
  res.status(201).json(bridge);
});

/**
 * List all bridges
 * GET /api/registry/bridges
 */
router.get('/bridges', (_req: Request, res: Response) => {
  const bridges = registry.getAllBridges();
  res.json({ bridges, count: bridges.length });
});

/**
 * Get a specific bridge
 * GET /api/registry/bridges/:id
 */
router.get('/bridges/:id', (req: Request, res: Response) => {
  const bridge = registry.getBridge(req.params.id);
  if (!bridge) {
    res.status(404).json({ error: 'Bridge not found' });
    return;
  }
  res.json(bridge);
});

/**
 * Update bridge status
 * PATCH /api/registry/bridges/:id
 */
router.patch('/bridges/:id', requirePermission(NetworkPermissions.NODES_ADMIN), (req: Request, res: Response) => {
  const { active } = req.body;
  if (typeof active !== 'boolean') {
    res.status(400).json({ error: 'active must be a boolean' });
    return;
  }

  const success = registry.setBridgeActive(req.params.id, active);
  if (!success) {
    res.status(404).json({ error: 'Bridge not found' });
    return;
  }

  const bridge = registry.getBridge(req.params.id);
  res.json(bridge);
});

/**
 * Delete a bridge
 * DELETE /api/registry/bridges/:id
 */
router.delete('/bridges/:id', requirePermission(NetworkPermissions.NODES_ADMIN), (req: Request, res: Response) => {
  const success = registry.deleteBridge(req.params.id);
  if (!success) {
    res.status(404).json({ error: 'Bridge not found' });
    return;
  }
  res.json({ ok: true });
});

export default router;
