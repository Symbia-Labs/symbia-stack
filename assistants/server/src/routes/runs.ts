import { Router, Request, Response } from 'express';
import { db } from '../lib/db.js';
import { graphRuns, runLogs } from '../models/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';

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

    const { conversationId, graphId, status } = req.query;

    let conditions = [eq(graphRuns.orgId, orgId)];
    if (conversationId) conditions.push(eq(graphRuns.conversationId, conversationId as string));
    if (graphId) conditions.push(eq(graphRuns.graphId, graphId as string));
    if (status) conditions.push(eq(graphRuns.status, status as any));

    const runs = await db.select().from(graphRuns)
      .where(and(...conditions))
      .orderBy(desc(graphRuns.startedAt))
      .limit(100);

    res.json({ runs });
  } catch (error) {
    console.error('Error fetching runs:', error);
    res.status(500).json({ error: 'Failed to fetch runs' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const orgId = requireOrgId(req, res);
    if (!orgId) return;

    const { id } = req.params;

    const run = await db.select().from(graphRuns)
      .where(and(eq(graphRuns.id, id), eq(graphRuns.orgId, orgId)))
      .limit(1);

    if (!run.length) {
      return res.status(404).json({ error: 'Run not found' });
    }

    res.json({ run: run[0] });
  } catch (error) {
    console.error('Error fetching run:', error);
    res.status(500).json({ error: 'Failed to fetch run' });
  }
});

router.get('/:id/logs', async (req: Request, res: Response) => {
  try {
    const orgId = requireOrgId(req, res);
    if (!orgId) return;

    const { id } = req.params;
    const { level } = req.query;

    const run = await db.select().from(graphRuns)
      .where(and(eq(graphRuns.id, id), eq(graphRuns.orgId, orgId)))
      .limit(1);

    if (!run.length) {
      return res.status(404).json({ error: 'Run not found' });
    }

    let conditions = [eq(runLogs.runId, id)];
    if (level) conditions.push(eq(runLogs.level, level as any));

    const logs = await db.select().from(runLogs)
      .where(and(...conditions))
      .orderBy(desc(runLogs.createdAt))
      .limit(500);

    res.json({ logs });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

export default router;
