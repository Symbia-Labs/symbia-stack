/**
 * Events Routes
 *
 * API endpoints for sending and receiving events.
 * All routes require authentication; event operations require specific permissions.
 */

import { Router, type Request, type Response } from 'express';
import * as router from '../services/router.js';
import * as policy from '../services/policy.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { NetworkPermissions } from '../types.js';

/**
 * Helper to safely extract route params (Express 5.x returns string | string[])
 */
function getParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] : (value ?? '');
}

const eventsRouter = Router();

// All event routes require authentication
eventsRouter.use(requireAuth);

/**
 * Send an event through the network
 * POST /api/events
 */
eventsRouter.post('/', requirePermission(NetworkPermissions.EVENTS_READ), async (req: Request, res: Response) => {
  const { payload, source, runId, target, causedBy, boundary } = req.body;

  if (!payload || !source || !runId) {
    res.status(400).json({ error: 'Missing required fields: payload, source, runId' });
    return;
  }

  if (!payload.type || payload.data === undefined) {
    res.status(400).json({ error: 'payload must have type and data fields' });
    return;
  }

  const validBoundaries = ['intra', 'inter', 'extra'];
  if (boundary && !validBoundaries.includes(boundary)) {
    res.status(400).json({ error: `Invalid boundary. Must be one of: ${validBoundaries.join(', ')}` });
    return;
  }

  try {
    const event = router.createEvent(payload, source, runId, {
      target,
      causedBy,
      boundary,
    });

    // Record the event
    router.recordEvent(event);

    // Route the event
    const trace = await router.routeEvent(event);

    res.status(202).json({
      eventId: event.wrapper.id,
      trace,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to route event',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get recent events with their traces
 * GET /api/events
 */
eventsRouter.get('/', requirePermission(NetworkPermissions.EVENTS_READ), (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const runId = req.query.runId as string;
  const includeTraces = req.query.traces !== 'false';

  const events = runId
    ? router.getEventsForRun(runId, limit)
    : router.getRecentEvents(limit);

  // Include traces for each event if requested (default: true)
  const eventsWithTraces = includeTraces
    ? events.map((event) => ({
        event,
        trace: router.getTrace(event.wrapper.id) || {
          eventId: event.wrapper.id,
          runId: event.wrapper.runId,
          path: [],
          totalDurationMs: 0,
          status: 'pending' as const,
        },
      }))
    : events;

  res.json({ events: eventsWithTraces, count: events.length });
});

/**
 * Get event trace
 * GET /api/events/:id/trace
 */
eventsRouter.get('/:id/trace', requirePermission(NetworkPermissions.TRACES_READ), (req: Request, res: Response) => {
  const trace = router.getTrace(getParam(req.params, 'id'));
  if (!trace) {
    res.status(404).json({ error: 'Trace not found' });
    return;
  }
  res.json(trace);
});

/**
 * Get all traces for a run
 * GET /api/events/traces/:runId
 */
eventsRouter.get('/traces/:runId', requirePermission(NetworkPermissions.TRACES_READ), (req: Request, res: Response) => {
  const traces = router.getTracesForRun(getParam(req.params, 'runId'));
  res.json({ traces, count: traces.length });
});

/**
 * Compute a hash for a payload (utility endpoint)
 * POST /api/events/hash
 */
eventsRouter.post('/hash', requirePermission(NetworkPermissions.EVENTS_READ), (req: Request, res: Response) => {
  const { payload, source, runId, boundary, target } = req.body;

  if (!payload || !source || !runId) {
    res.status(400).json({ error: 'Missing required fields: payload, source, runId' });
    return;
  }

  const hash = policy.computeEventHash(payload, {
    id: 'preview',
    runId,
    timestamp: new Date().toISOString(),
    source,
    target,
    boundary: boundary || 'intra',
  });

  res.json({ hash });
});

/**
 * Get routing statistics
 * GET /api/events/stats
 */
eventsRouter.get('/stats', requirePermission(NetworkPermissions.EVENTS_READ), (_req: Request, res: Response) => {
  const stats = router.getStats();
  res.json(stats);
});

export default eventsRouter;
