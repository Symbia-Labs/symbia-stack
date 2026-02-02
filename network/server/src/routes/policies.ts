/**
 * Policy Routes
 *
 * API endpoints for managing routing policies.
 *
 * Authorization:
 * - Agents (services) have full access
 * - Users require cap:network.policies.read for read operations
 * - Users require cap:network.policies.write for write operations
 */

import { Router, type Request, type Response } from 'express';
import * as policy from '../services/policy.js';
import { requirePermission } from '../middleware/auth.js';
import { NetworkPermissions } from '../types.js';

/**
 * Helper to safely extract route params (Express 5.x returns string | string[])
 */
function getParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] : (value ?? '');
}

const policiesRouter = Router();

/**
 * Create a new policy
 * POST /api/policies
 * Requires: cap:network.policies.write
 */
policiesRouter.post('/', requirePermission(NetworkPermissions.POLICIES_WRITE), (req: Request, res: Response) => {
  const { name, priority, conditions, action } = req.body;

  if (!name || priority === undefined || !conditions || !action) {
    res.status(400).json({ error: 'Missing required fields: name, priority, conditions, action' });
    return;
  }

  if (!Array.isArray(conditions)) {
    res.status(400).json({ error: 'conditions must be an array' });
    return;
  }

  const validActionTypes = ['allow', 'deny', 'route', 'transform', 'log'];
  if (!validActionTypes.includes(action.type)) {
    res.status(400).json({ error: `Invalid action type. Must be one of: ${validActionTypes.join(', ')}` });
    return;
  }

  const newPolicy = policy.createPolicy(name, priority, conditions, action);
  res.status(201).json(newPolicy);
});

/**
 * List all policies
 * GET /api/policies
 * Requires: cap:network.policies.read
 */
policiesRouter.get('/', requirePermission(NetworkPermissions.POLICIES_READ), (_req: Request, res: Response) => {
  const policies = policy.getAllPolicies();
  res.json({ policies, count: policies.length });
});

/**
 * Get a specific policy
 * GET /api/policies/:id
 * Requires: cap:network.policies.read
 */
policiesRouter.get('/:id', requirePermission(NetworkPermissions.POLICIES_READ), (req: Request, res: Response) => {
  const p = policy.getPolicy(getParam(req.params, 'id'));
  if (!p) {
    res.status(404).json({ error: 'Policy not found' });
    return;
  }
  res.json(p);
});

/**
 * Update a policy
 * PATCH /api/policies/:id
 * Requires: cap:network.policies.write
 */
policiesRouter.patch('/:id', requirePermission(NetworkPermissions.POLICIES_WRITE), (req: Request, res: Response) => {
  const updates = req.body;
  delete updates.id;
  delete updates.createdAt;

  const updated = policy.updatePolicy(getParam(req.params, 'id'), updates);
  if (!updated) {
    res.status(404).json({ error: 'Policy not found' });
    return;
  }
  res.json(updated);
});

/**
 * Delete a policy
 * DELETE /api/policies/:id
 * Requires: cap:network.policies.write
 */
policiesRouter.delete('/:id', requirePermission(NetworkPermissions.POLICIES_WRITE), (req: Request, res: Response) => {
  const success = policy.deletePolicy(getParam(req.params, 'id'));
  if (!success) {
    res.status(404).json({ error: 'Policy not found' });
    return;
  }
  res.json({ ok: true });
});

/**
 * Test a policy against a sample event
 * POST /api/policies/test
 * Requires: cap:network.policies.read
 */
policiesRouter.post('/test', requirePermission(NetworkPermissions.POLICIES_READ), (req: Request, res: Response) => {
  const { payload, source, runId, boundary, target } = req.body;

  if (!payload || !source || !runId) {
    res.status(400).json({ error: 'Missing required fields: payload, source, runId' });
    return;
  }

  // Create a mock event for testing
  const mockEvent = {
    payload: {
      type: payload.type || 'test',
      data: payload.data || {},
    },
    wrapper: {
      id: 'test-event',
      runId,
      timestamp: new Date().toISOString(),
      source,
      target,
      boundary: boundary || 'intra',
      path: [source],
    },
    hash: 'test-hash',
  };

  const result = policy.evaluatePolicies(mockEvent);
  res.json({
    event: mockEvent,
    result,
    allPolicies: policy.getAllPolicies().map((p) => ({
      id: p.id,
      name: p.name,
      priority: p.priority,
      enabled: p.enabled,
    })),
  });
});

export default policiesRouter;
