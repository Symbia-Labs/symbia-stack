import { Router } from 'express';
import type { Request, Response } from 'express';
import type { Rule, RuleSet } from '../engine/types.js';
import { setRuleSet, getRuns, clearRuns, defaultCoordinator } from '../engine/run-coordinator.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

/**
 * Helper to safely extract route params (Express 5.x returns string | string[])
 */
function getParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] : (value ?? '');
}

const router = Router();

// All rules routes require authentication - these control business logic
router.use(requireAuth);

const ruleSets: Record<string, RuleSet> = {};

/**
 * Register a rule set directly (used by assistant loader for bootstrap rules)
 */
export function registerRuleSet(orgId: string, ruleSet: RuleSet): void {
  ruleSets[orgId] = ruleSet;
  setRuleSet(orgId, ruleSet);
}

/**
 * Get all registered rule sets
 */
export function getAllRuleSets(): Record<string, RuleSet> {
  return ruleSets;
}

router.get('/', (_req: Request, res: Response) => {
  const all = Object.values(ruleSets);
  res.json({ data: all, count: all.length });
});

router.get('/:orgId', (req: Request, res: Response) => {
  const orgId = getParam(req.params, 'orgId');
  const ruleSet = ruleSets[orgId];
  
  if (!ruleSet) {
    res.status(404).json({ error: 'Rule set not found' });
    return;
  }
  
  res.json({ data: ruleSet });
});

router.post('/', (req: Request, res: Response) => {
  const body = req.body as Partial<RuleSet>;
  
  if (!body.orgId || !body.name) {
    res.status(400).json({ error: 'orgId and name are required' });
    return;
  }
  
  const ruleSet: RuleSet = {
    id: crypto.randomUUID(),
    orgId: body.orgId,
    name: body.name,
    description: body.description,
    rules: body.rules || [],
    version: 1,
    isActive: body.isActive ?? true,
  };
  
  ruleSets[body.orgId] = ruleSet;
  setRuleSet(body.orgId, ruleSet);
  
  res.status(201).json({ data: ruleSet });
});

router.put('/:orgId', (req: Request, res: Response) => {
  const orgId = getParam(req.params, 'orgId');
  const body = req.body as Partial<RuleSet>;
  
  const existing = ruleSets[orgId];
  if (!existing) {
    res.status(404).json({ error: 'Rule set not found' });
    return;
  }
  
  const updated: RuleSet = {
    ...existing,
    name: body.name ?? existing.name,
    description: body.description ?? existing.description,
    rules: body.rules ?? existing.rules,
    isActive: body.isActive ?? existing.isActive,
    version: existing.version + 1,
  };
  
  ruleSets[orgId] = updated;
  setRuleSet(orgId, updated);
  
  res.json({ data: updated });
});

router.post('/:orgId/rules', (req: Request, res: Response) => {
  const orgId = getParam(req.params, 'orgId');
  const body = req.body as Partial<Rule>;
  
  const ruleSet = ruleSets[orgId];
  if (!ruleSet) {
    res.status(404).json({ error: 'Rule set not found' });
    return;
  }
  
  if (!body.name || !body.trigger) {
    res.status(400).json({ error: 'name and trigger are required' });
    return;
  }
  
  const rule: Rule = {
    id: crypto.randomUUID(),
    name: body.name,
    description: body.description,
    priority: body.priority ?? 0,
    enabled: body.enabled ?? true,
    trigger: body.trigger,
    conditions: body.conditions || { logic: 'and', conditions: [] },
    actions: body.actions || [],
    metadata: body.metadata,
  };
  
  ruleSet.rules.push(rule);
  ruleSet.version += 1;
  setRuleSet(orgId, ruleSet);
  
  res.status(201).json({ data: rule });
});

router.delete('/:orgId/rules/:ruleId', (req: Request, res: Response) => {
  const orgId = getParam(req.params, 'orgId');
  const ruleId = getParam(req.params, 'ruleId');

  const ruleSet = ruleSets[orgId];
  if (!ruleSet) {
    res.status(404).json({ error: 'Rule set not found' });
    return;
  }

  const index = ruleSet.rules.findIndex((r: Rule) => r.id === ruleId);
  if (index === -1) {
    res.status(404).json({ error: 'Rule not found' });
    return;
  }
  
  ruleSet.rules.splice(index, 1);
  ruleSet.version += 1;
  setRuleSet(orgId, ruleSet);
  
  res.json({ success: true });
});

router.post('/execute', async (req: Request, res: Response) => {
  const { orgId, conversationId, trigger, data, message, user } = req.body;
  
  if (!orgId || !conversationId || !trigger) {
    res.status(400).json({ error: 'orgId, conversationId, and trigger are required' });
    return;
  }
  
  try {
    const result = await defaultCoordinator.processEvent({
      type: trigger,
      orgId,
      conversationId,
      data: data || {},
      message,
      user,
    });
    
    res.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Execution failed';
    res.status(500).json({ error: message });
  }
});

router.get('/runs', (_req: Request, res: Response) => {
  const runs = getRuns();
  res.json({ data: runs, count: runs.length });
});

router.delete('/runs', (_req: Request, res: Response) => {
  clearRuns();
  res.json({ success: true });
});

export default router;
