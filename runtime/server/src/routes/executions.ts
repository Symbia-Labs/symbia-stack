/**
 * Execution Routes
 *
 * API endpoints for managing graph executions.
 */

import { Router } from 'express';
import { requireAuth, optionalAuth } from '../auth.js';
import type { GraphExecutor } from '../executor/index.js';

function getParamId(params: Record<string, string | string[]>, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export function createExecutionRoutes(executor: GraphExecutor): Router {
  const router = Router();

  /**
   * List all executions
   * GET /api/executions
   */
  router.get('/', optionalAuth, async (_req, res) => {
    const executions = executor.getAllExecutions();

    res.json({
      executions: executions.map(e => ({
        id: e.id,
        graphId: e.graphId,
        state: e.state,
        instanceCount: e.instances.size,
        metrics: {
          messagesProcessed: e.metrics.messagesProcessed,
          messagesEmitted: e.metrics.messagesEmitted,
          componentInvocations: e.metrics.componentInvocations,
          avgLatencyMs: e.metrics.avgLatencyMs,
          errorCount: e.metrics.errorCount,
        },
        startedAt: e.startedAt?.toISOString(),
        completedAt: e.completedAt?.toISOString(),
        createdAt: e.createdAt.toISOString(),
      })),
      total: executions.length,
    });
  });

  /**
   * Get execution status
   * GET /api/executions/:id
   */
  router.get('/:id', optionalAuth, async (req, res) => {
    const execution = executor.getExecution(getParamId(req.params, 'id'));
    if (!execution) {
      res.status(404).json({ error: 'Execution not found' });
      return;
    }

    res.json({
      id: execution.id,
      graphId: execution.graphId,
      state: execution.state,
      instances: Array.from(execution.instances.entries()).map(([nodeId, instance]) => ({
        nodeId,
        instanceId: instance.id,
        componentId: instance.componentId,
        state: instance.state,
        metrics: instance.metrics,
      })),
      metrics: execution.metrics,
      error: execution.error,
      startedAt: execution.startedAt?.toISOString(),
      completedAt: execution.completedAt?.toISOString(),
      createdAt: execution.createdAt.toISOString(),
    });
  });

  /**
   * Get execution metrics
   * GET /api/executions/:id/metrics
   */
  router.get('/:id/metrics', optionalAuth, async (req, res) => {
    const execution = executor.getExecution(getParamId(req.params, 'id'));
    if (!execution) {
      res.status(404).json({ error: 'Execution not found' });
      return;
    }

    res.json({
      executionId: execution.id,
      state: execution.state,
      ...execution.metrics,
      uptimeMs: execution.startedAt
        ? Date.now() - execution.startedAt.getTime()
        : 0,
    });
  });

  /**
   * Inject message into execution
   * POST /api/executions/:id/inject
   */
  router.post('/:id/inject', requireAuth, async (req, res) => {
    const { nodeId, port, value } = req.body;

    if (!nodeId || !port) {
      res.status(400).json({ error: 'nodeId and port are required' });
      return;
    }

    try {
      await executor.injectMessage(getParamId(req.params, 'id'), nodeId, port, value);

      res.json({
        success: true,
        executionId: getParamId(req.params, 'id'),
        nodeId,
        port,
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to inject message',
      });
    }
  });

  /**
   * Pause execution
   * POST /api/executions/:id/pause
   */
  router.post('/:id/pause', requireAuth, async (req, res) => {
    try {
      await executor.pauseExecution(getParamId(req.params, 'id'));

      const execution = executor.getExecution(getParamId(req.params, 'id'));
      res.json({
        executionId: getParamId(req.params, 'id'),
        state: execution?.state,
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to pause execution',
      });
    }
  });

  /**
   * Resume execution
   * POST /api/executions/:id/resume
   */
  router.post('/:id/resume', requireAuth, async (req, res) => {
    try {
      await executor.resumeExecution(getParamId(req.params, 'id'));

      const execution = executor.getExecution(getParamId(req.params, 'id'));
      res.json({
        executionId: getParamId(req.params, 'id'),
        state: execution?.state,
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to resume execution',
      });
    }
  });

  /**
   * Stop execution
   * POST /api/executions/:id/stop
   */
  router.post('/:id/stop', requireAuth, async (req, res) => {
    try {
      await executor.stopExecution(getParamId(req.params, 'id'));

      res.json({
        executionId: getParamId(req.params, 'id'),
        state: 'cancelled',
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to stop execution',
      });
    }
  });

  return router;
}
