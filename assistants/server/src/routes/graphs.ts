import { Router, Request, Response } from 'express';
import { db } from '../lib/db.js';
import { promptGraphs, compiledGraphs, graphRuns, runLogs, actorPrincipals } from '@shared/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

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

router.get('/', async (req: Request, res: Response) => {
  try {
    const orgId = requireOrgId(req, res);
    if (!orgId) return;

    const graphs = await db.select().from(promptGraphs)
      .where(eq(promptGraphs.orgId, orgId))
      .orderBy(desc(promptGraphs.updatedAt));

    res.json(graphs);
  } catch (error) {
    console.error('Error fetching graphs:', error);
    res.status(500).json({ error: 'Failed to fetch graphs' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const orgId = requireOrgId(req, res);
    if (!orgId) return;

    const id = getParam(req.params, 'id');

    const graph = await db.select().from(promptGraphs)
      .where(and(eq(promptGraphs.id, id), eq(promptGraphs.orgId, orgId)))
      .limit(1);

    if (!graph.length) {
      return res.status(404).json({ error: 'Graph not found' });
    }

    res.json(graph[0]);
  } catch (error) {
    console.error('Error fetching graph:', error);
    res.status(500).json({ error: 'Failed to fetch graph' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { orgId, name, description, graphJson, triggerConditions, logLevel } = req.body;

    if (!orgId || !name || !graphJson) {
      return res.status(400).json({ error: 'orgId, name, and graphJson required' });
    }

    const [newGraph] = await db.insert(promptGraphs).values({
      orgId,
      name,
      description,
      graphJson,
      triggerConditions: triggerConditions || {},
      logLevel: logLevel || 'warn',
    }).returning();

    res.status(201).json(newGraph);
  } catch (error) {
    console.error('Error creating graph:', error);
    res.status(500).json({ error: 'Failed to create graph' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const orgId = requireOrgId(req, res);
    if (!orgId) return;

    const id = getParam(req.params, 'id');
    const { name, description, graphJson, triggerConditions, logLevel } = req.body;

    const [updated] = await db.update(promptGraphs)
      .set({
        name,
        description,
        graphJson,
        triggerConditions,
        logLevel,
        updatedAt: new Date(),
      })
      .where(and(eq(promptGraphs.id, id), eq(promptGraphs.orgId, orgId)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Graph not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error('Error updating graph:', error);
    res.status(500).json({ error: 'Failed to update graph' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const orgId = requireOrgId(req, res);
    if (!orgId) return;

    const id = getParam(req.params, 'id');

    const [deleted] = await db.delete(promptGraphs)
      .where(and(eq(promptGraphs.id, id), eq(promptGraphs.orgId, orgId)))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Graph not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting graph:', error);
    res.status(500).json({ error: 'Failed to delete graph' });
  }
});

router.post('/:id/publish', async (req: Request, res: Response) => {
  try {
    const orgId = requireOrgId(req, res);
    if (!orgId) return;

    const id = getParam(req.params, 'id');

    const graph = await db.select().from(promptGraphs)
      .where(and(eq(promptGraphs.id, id), eq(promptGraphs.orgId, orgId)))
      .limit(1);

    if (!graph.length) {
      return res.status(404).json({ error: 'Graph not found' });
    }

    const graphData = graph[0];
    const bytecode = JSON.stringify({
      compiled: true,
      version: graphData.version,
      nodes: (graphData.graphJson as any)?.components || [],
      edges: (graphData.graphJson as any)?.edges || [],
      compiledAt: new Date().toISOString(),
    });

    const checksum = Buffer.from(bytecode).toString('base64').slice(0, 64);

    const [compiled] = await db.insert(compiledGraphs).values({
      graphId: id,
      version: graphData.version,
      bytecode,
      checksum,
    }).returning();

    await db.update(promptGraphs)
      .set({
        isPublished: true,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(promptGraphs.id, id), eq(promptGraphs.orgId, orgId)));

    res.json({ success: true, compiled });
  } catch (error) {
    console.error('Error publishing graph:', error);
    res.status(500).json({ error: 'Failed to publish graph' });
  }
});

router.get('/:id/runs', async (req: Request, res: Response) => {
  try {
    const orgId = requireOrgId(req, res);
    if (!orgId) return;

    const id = getParam(req.params, 'id');

    const graph = await db.select().from(promptGraphs)
      .where(and(eq(promptGraphs.id, id), eq(promptGraphs.orgId, orgId)))
      .limit(1);

    if (!graph.length) {
      return res.status(404).json({ error: 'Graph not found' });
    }

    const runs = await db.select().from(graphRuns)
      .where(and(eq(graphRuns.graphId, id), eq(graphRuns.orgId, orgId)))
      .orderBy(desc(graphRuns.startedAt))
      .limit(100);

    res.json(runs);
  } catch (error) {
    console.error('Error fetching runs:', error);
    res.status(500).json({ error: 'Failed to fetch runs' });
  }
});

export default router;
