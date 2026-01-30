/**
 * Graph Routes
 *
 * API endpoints for loading, managing, and executing graphs.
 * Supports both direct graph definitions and routine definitions
 * (which are compiled to graphs automatically).
 */

import { Router } from 'express';
import { parse as parseYaml } from 'yaml';
import { requireAuth, optionalAuth } from '../auth.js';
import type { GraphExecutor } from '../executor/index.js';
import type { GraphDefinition } from '../types/index.js';
import { isRoutineDefinition, type RoutineDefinition } from '../types/routine.js';
import { routineCompiler, CompilationError } from '../compiler/index.js';

function getParamId(params: Record<string, string | string[]>, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export function createGraphRoutes(executor: GraphExecutor): Router {
  const router = Router();

  /**
   * Load a graph definition or routine definition
   * POST /api/graphs
   *
   * Accepts:
   * - GraphDefinition: Direct graph with nodes/edges
   * - RoutineDefinition: Plain-English routines (auto-compiled to graphs)
   */
  router.post('/', requireAuth, async (req, res) => {
    try {
      let rawBody: unknown;

      // Support both JSON and YAML
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('yaml') || contentType.includes('x-yaml')) {
        rawBody = parseYaml(req.body);
      } else if (typeof req.body === 'string') {
        // Try YAML first, then JSON
        try {
          rawBody = parseYaml(req.body);
        } catch {
          rawBody = JSON.parse(req.body);
        }
      } else {
        rawBody = req.body;
      }

      // Check if this is a routine definition
      if (isRoutineDefinition(rawBody)) {
        // Compile routine to graphs
        console.log('[GraphRoutes] Compiling routine definition:', rawBody.name);

        const result = routineCompiler.compile(rawBody as RoutineDefinition);

        // Load all compiled graphs
        const loadedGraphs = [];
        for (const graphDef of result.graphs) {
          const graph = await executor.loadGraph(graphDef);
          loadedGraphs.push({
            id: graph.id,
            name: graph.definition.name,
            version: graph.definition.version,
            nodeCount: graph.definition.nodes.length,
            edgeCount: graph.definition.edges.length,
            topology: {
              inputNodes: graph.topology.inputNodes,
              outputNodes: graph.topology.outputNodes,
            },
            loadedAt: graph.loadedAt.toISOString(),
          });
        }

        res.status(201).json({
          type: 'routine',
          assistantId: rawBody.assistantId,
          compiledAt: result.metadata.compiledAt,
          routineCount: result.metadata.routineCount,
          totalNodeCount: result.metadata.totalNodeCount,
          totalEdgeCount: result.metadata.totalEdgeCount,
          graphs: loadedGraphs,
          warnings: result.warnings,
        });
        return;
      }

      // Regular graph definition
      const definition = rawBody as GraphDefinition;
      const graph = await executor.loadGraph(definition);

      res.status(201).json({
        type: 'graph',
        id: graph.id,
        name: graph.definition.name,
        version: graph.definition.version,
        nodeCount: graph.definition.nodes.length,
        edgeCount: graph.definition.edges.length,
        topology: {
          inputNodes: graph.topology.inputNodes,
          outputNodes: graph.topology.outputNodes,
        },
        loadedAt: graph.loadedAt.toISOString(),
      });
    } catch (error) {
      console.error('[GraphRoutes] Load error:', error);

      // Handle compilation errors specially
      if (error instanceof CompilationError) {
        res.status(400).json({
          error: 'Routine compilation failed',
          code: 'COMPILATION_ERROR',
          details: error.errors,
        });
        return;
      }

      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to load graph',
      });
    }
  });

  /**
   * List loaded graphs
   * GET /api/graphs
   */
  router.get('/', optionalAuth, async (_req, res) => {
    const stats = executor.getStats();
    const graphs: Array<{
      id: string;
      name: string;
      version: string;
      nodeCount: number;
      loadedAt: string;
    }> = [];

    // Note: In a real implementation, we'd have a method to list graphs
    // For now, return stats
    res.json({
      loadedGraphs: stats.loadedGraphs,
      activeExecutions: stats.activeExecutions,
      graphs,
    });
  });

  /**
   * Get a specific graph
   * GET /api/graphs/:id
   */
  router.get('/:id', optionalAuth, async (req, res) => {
    const graph = executor.getGraph(getParamId(req.params, 'id'));
    if (!graph) {
      res.status(404).json({ error: 'Graph not found' });
      return;
    }

    res.json({
      id: graph.id,
      name: graph.definition.name,
      version: graph.definition.version,
      description: graph.definition.description,
      nodes: graph.definition.nodes,
      edges: graph.definition.edges,
      topology: {
        sorted: graph.topology.sorted,
        inputNodes: graph.topology.inputNodes,
        outputNodes: graph.topology.outputNodes,
      },
      loadedAt: graph.loadedAt.toISOString(),
    });
  });

  /**
   * Unload a graph
   * DELETE /api/graphs/:id
   */
  router.delete('/:id', requireAuth, async (req, res) => {
    try {
      await executor.unloadGraph(getParamId(req.params, 'id'));
      res.status(204).send();
    } catch (error) {
      res.status(404).json({
        error: error instanceof Error ? error.message : 'Failed to unload graph',
      });
    }
  });

  /**
   * Start graph execution
   * POST /api/graphs/:id/execute
   */
  router.post('/:id/execute', requireAuth, async (req, res) => {
    try {
      const execution = await executor.startExecution(getParamId(req.params, 'id'));

      res.status(201).json({
        executionId: execution.id,
        graphId: execution.graphId,
        state: execution.state,
        startedAt: execution.startedAt?.toISOString(),
      });
    } catch (error) {
      console.error('[GraphRoutes] Execute error:', error);
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to start execution',
      });
    }
  });

  return router;
}
