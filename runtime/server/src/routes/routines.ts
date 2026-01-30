/**
 * Routine Routes
 *
 * Dedicated API endpoints for routine definitions.
 * These provide a cleaner interface for working with routines
 * specifically, separate from general graph operations.
 */

import { Router } from 'express';
import { requireAuth } from '../auth.js';
import type { GraphExecutor } from '../executor/index.js';
import type { RoutineDefinition } from '../types/routine.js';
import { routineCompiler, CompilationError } from '../compiler/index.js';

export function createRoutineRoutes(executor: GraphExecutor): Router {
  const router = Router();

  /**
   * Validate a routine definition without compiling
   * POST /api/routines/validate
   */
  router.post('/validate', requireAuth, async (req, res) => {
    try {
      const definition = req.body as RoutineDefinition;
      const result = routineCompiler.validate(definition);

      res.json({
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings,
      });
    } catch (error) {
      console.error('[RoutineRoutes] Validation error:', error);
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Validation failed',
      });
    }
  });

  /**
   * Compile and load routines
   * POST /api/routines
   */
  router.post('/', requireAuth, async (req, res) => {
    try {
      const definition = req.body as RoutineDefinition;

      console.log('[RoutineRoutes] Compiling routines for:', definition.assistantId);

      const result = routineCompiler.compile(definition);

      // Load all compiled graphs
      const loadedGraphs = [];
      for (const graphDef of result.graphs) {
        const graph = await executor.loadGraph(graphDef);
        loadedGraphs.push({
          id: graph.id,
          name: graph.definition.name,
          routineId: graphDef.metadata?.routineId,
          routineName: graphDef.metadata?.routineName,
          isMain: graphDef.metadata?.isMain,
          trigger: graphDef.metadata?.trigger,
          nodeCount: graph.definition.nodes.length,
          edgeCount: graph.definition.edges.length,
          loadedAt: graph.loadedAt.toISOString(),
        });
      }

      res.status(201).json({
        assistantId: definition.assistantId,
        alias: definition.alias,
        compiledAt: result.metadata.compiledAt,
        compilerVersion: result.metadata.compilerVersion,
        sourceHash: result.metadata.sourceHash,
        routineCount: result.metadata.routineCount,
        totalNodeCount: result.metadata.totalNodeCount,
        totalEdgeCount: result.metadata.totalEdgeCount,
        graphs: loadedGraphs,
        warnings: result.warnings,
      });
    } catch (error) {
      console.error('[RoutineRoutes] Compile error:', error);

      if (error instanceof CompilationError) {
        res.status(400).json({
          error: 'Compilation failed',
          code: 'COMPILATION_ERROR',
          details: error.errors,
        });
        return;
      }

      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to compile routines',
      });
    }
  });

  /**
   * Preview compiled output without loading
   * POST /api/routines/preview
   */
  router.post('/preview', requireAuth, async (req, res) => {
    try {
      const definition = req.body as RoutineDefinition;

      const result = routineCompiler.compile(definition, { debug: true });

      res.json({
        assistantId: definition.assistantId,
        metadata: result.metadata,
        graphs: result.graphs.map(g => ({
          name: g.name,
          description: g.description,
          nodes: g.nodes,
          edges: g.edges,
          metadata: g.metadata,
        })),
        warnings: result.warnings,
      });
    } catch (error) {
      if (error instanceof CompilationError) {
        res.status(400).json({
          error: 'Compilation failed',
          code: 'COMPILATION_ERROR',
          details: error.errors,
        });
        return;
      }

      res.status(400).json({
        error: error instanceof Error ? error.message : 'Failed to preview routines',
      });
    }
  });

  return router;
}
