import { Router, Request, Response } from 'express';
import { db } from '../lib/db.js';
import { agentPrincipals } from '@shared/schema.js';
import { eq, and, desc } from 'drizzle-orm';

/**
 * Helper to safely extract route params (Express 5.x returns string | string[])
 */
function getParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] : (value ?? '');
}

const router = Router();

function requireOrgId(req: Request, res: Response): string | null {
  const orgId = (req.headers['x-org-id'] as string) || (req.query.orgId as string) || req.body?.orgId;
  if (!orgId) {
    res.status(400).json({ error: 'orgId required (via X-Org-Id header, query param, or body)' });
    return null;
  }
  return orgId;
}

// List all agent principals (agents + assistants)
router.get('/', async (req: Request, res: Response) => {
  try {
    const orgId = requireOrgId(req, res);
    if (!orgId) return;

    const principalType = req.query.type as string;

    let query = db.select().from(agentPrincipals)
      .where(eq(agentPrincipals.orgId, orgId))
      .orderBy(desc(agentPrincipals.createdAt));

    const agents = await query;

    // Filter by type if specified
    const filtered = principalType
      ? agents.filter((a: typeof agents[number]) => a.principalType === principalType)
      : agents;

    res.json(filtered);
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const orgId = requireOrgId(req, res);
    if (!orgId) return;

    const id = getParam(req.params, 'id');

    const agent = await db.select().from(agentPrincipals)
      .where(and(eq(agentPrincipals.id, id), eq(agentPrincipals.orgId, orgId)))
      .limit(1);

    if (!agent.length) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json(agent[0]);
  } catch (error) {
    console.error('Error fetching agent:', error);
    res.status(500).json({ error: 'Failed to fetch agent' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { orgId, principalId, principalType, name, description, defaultGraphId, capabilities, webhooks, assistantConfig } = req.body;

    if (!orgId || !principalId || !name) {
      return res.status(400).json({ error: 'orgId, principalId, and name required' });
    }

    const [newAgent] = await db.insert(agentPrincipals).values({
      orgId,
      principalId,
      principalType: principalType || 'agent',
      name,
      description,
      defaultGraphId,
      capabilities: capabilities || ['cap:messaging.interrupt'],
      webhooks: webhooks || {},
      assistantConfig: assistantConfig || {},
    }).returning();

    res.status(201).json(newAgent);
  } catch (error) {
    console.error('Error creating agent:', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const orgId = requireOrgId(req, res);
    if (!orgId) return;

    const id = getParam(req.params, 'id');
    const { name, description, defaultGraphId, capabilities, webhooks, assistantConfig, isActive } = req.body;

    const [updated] = await db.update(agentPrincipals)
      .set({
        name,
        description,
        defaultGraphId,
        capabilities,
        webhooks,
        assistantConfig,
        isActive,
        updatedAt: new Date(),
      })
      .where(and(eq(agentPrincipals.id, id), eq(agentPrincipals.orgId, orgId)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error('Error updating agent:', error);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const orgId = requireOrgId(req, res);
    if (!orgId) return;

    const id = getParam(req.params, 'id');

    const [deleted] = await db.delete(agentPrincipals)
      .where(and(eq(agentPrincipals.id, id), eq(agentPrincipals.orgId, orgId)))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting agent:', error);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

export default router;
