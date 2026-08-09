/**
 * Directory Service REST surface.
 *
 * Control plane only: the peer directory (BDT), the foreign-node table (FDT),
 * admission, and a forwarding-permission query the bridge asks before it
 * relays. No event ever passes through this service.
 */
import { Router, type Request, type Response } from 'express';
import * as registry from './registry.js';
import { checkAdmission } from './admission.js';
import { config } from './config.js';

export function createRouter(): Router {
  const router = Router();

  // --- Stats (for the console tile) ---------------------------------------

  router.get('/stats', (_req: Request, res: Response) => {
    const peers = registry.listPeers();
    res.json({
      totalPeers: peers.length,
      activePeers: peers.filter((p) => p.status === 'active').length,
      foreignNodes: registry.listForeign().length,
    });
  });

  // --- Peers (BDT) ---------------------------------------------------------

  router.post('/peers', (req: Request, res: Response) => {
    const admit = checkAdmission(req);
    if (!admit.ok) {
      return res.status(401).json({ error: 'admission_denied', message: admit.reason });
    }
    const { peerId, endpoint, acceptedEventTypes } = req.body ?? {};
    if (typeof peerId !== 'string' || !peerId) {
      return res.status(400).json({ error: 'invalid_request', message: 'peerId (string) required' });
    }
    if (typeof endpoint !== 'string' || !endpoint) {
      return res.status(400).json({ error: 'invalid_request', message: 'endpoint (string) required' });
    }
    if (acceptedEventTypes !== undefined && !Array.isArray(acceptedEventTypes)) {
      return res.status(400).json({ error: 'invalid_request', message: 'acceptedEventTypes must be an array' });
    }
    const peer = registry.upsertPeer({ peerId, endpoint, acceptedEventTypes });
    return res.status(201).json({ peer });
  });

  router.get('/peers', (_req: Request, res: Response) => {
    res.json({ peers: registry.listPeers() });
  });

  router.get('/peers/:peerId', (req: Request, res: Response) => {
    const peer = registry.getPeer((req.params.peerId as string));
    if (!peer) return res.status(404).json({ error: 'not_found' });
    res.json({ peer });
  });

  router.patch('/peers/:peerId/status', (req: Request, res: Response) => {
    const admit = checkAdmission(req);
    if (!admit.ok) {
      return res.status(401).json({ error: 'admission_denied', message: admit.reason });
    }
    const { status } = req.body ?? {};
    if (status !== 'active' && status !== 'suspended') {
      return res.status(400).json({ error: 'invalid_request', message: "status must be 'active' or 'suspended'" });
    }
    const peer = registry.setPeerStatus((req.params.peerId as string), status);
    if (!peer) return res.status(404).json({ error: 'not_found' });
    res.json({ peer });
  });

  router.delete('/peers/:peerId', (req: Request, res: Response) => {
    const admit = checkAdmission(req);
    if (!admit.ok) {
      return res.status(401).json({ error: 'admission_denied', message: admit.reason });
    }
    const ok = registry.removePeer((req.params.peerId as string));
    if (!ok) return res.status(404).json({ error: 'not_found' });
    res.status(204).end();
  });

  /**
   * Forwarding-permission query. The bridge asks before it relays; the answer
   * is capability-scoped (peer must be active AND have declared the event
   * type). This is the "smarter than BBMD" filter expressed as one endpoint.
   */
  router.get('/peers/:peerId/allow', (req: Request, res: Response) => {
    const eventType = req.query.eventType;
    if (typeof eventType !== 'string' || !eventType) {
      return res.status(400).json({ error: 'invalid_request', message: 'eventType query param required' });
    }
    res.json({ allowed: registry.isForwardAllowed((req.params.peerId as string), eventType) });
  });

  // --- Foreign nodes (FDT) -------------------------------------------------

  router.post('/foreign-nodes', (req: Request, res: Response) => {
    const admit = checkAdmission(req);
    if (!admit.ok) {
      return res.status(401).json({ error: 'admission_denied', message: admit.reason });
    }
    const { nodeId, endpoint, ttlSeconds } = req.body ?? {};
    if (typeof nodeId !== 'string' || !nodeId) {
      return res.status(400).json({ error: 'invalid_request', message: 'nodeId (string) required' });
    }
    if (typeof endpoint !== 'string' || !endpoint) {
      return res.status(400).json({ error: 'invalid_request', message: 'endpoint (string) required' });
    }
    const ttl = typeof ttlSeconds === 'number' && ttlSeconds > 0
      ? ttlSeconds
      : config.defaultForeignTtlSeconds;
    const node = registry.registerForeign({ nodeId, endpoint, ttlSeconds: ttl });
    return res.status(201).json({ node });
  });

  router.post('/foreign-nodes/:nodeId/heartbeat', (req: Request, res: Response) => {
    const admit = checkAdmission(req);
    if (!admit.ok) {
      return res.status(401).json({ error: 'admission_denied', message: admit.reason });
    }
    const { ttlSeconds } = req.body ?? {};
    const ttl = typeof ttlSeconds === 'number' && ttlSeconds > 0
      ? ttlSeconds
      : config.defaultForeignTtlSeconds;
    const node = registry.heartbeatForeign((req.params.nodeId as string), ttl);
    if (!node) return res.status(404).json({ error: 'not_found', message: 'no such foreign node (may have expired)' });
    res.json({ node });
  });

  router.get('/foreign-nodes', (_req: Request, res: Response) => {
    res.json({ nodes: registry.listForeign() });
  });

  router.delete('/foreign-nodes/:nodeId', (req: Request, res: Response) => {
    const admit = checkAdmission(req);
    if (!admit.ok) {
      return res.status(401).json({ error: 'admission_denied', message: admit.reason });
    }
    const ok = registry.removeForeign((req.params.nodeId as string));
    if (!ok) return res.status(404).json({ error: 'not_found' });
    res.status(204).end();
  });

  return router;
}
