/**
 * Model Evaluation API Routes
 *
 * REST API endpoints for running benchmarks, querying evaluations,
 * and getting model recommendations.
 */

import { Router, type Request, type Response } from "express";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";
import { fromError } from "zod-validation-error";

import { getBenchmarkRunner } from "../benchmarks/benchmark-runner.js";
import {
  getAllBenchmarks,
  getBenchmark,
  getBenchmarksByTaskType,
  getBenchmarkSummary,
} from "../benchmarks/benchmark-registry.js";
import { getEvalRepository } from "../storage/eval-repository.js";
import { getRecommendationEngine } from "../recommendation/recommendation-engine.js";
import { getScoreAggregator } from "../recommendation/score-aggregator.js";
import { discoverAllModels, getModelsForTask } from "../discovery/model-discovery.js";
import { getCatalogSyncService } from "../catalog/catalog-sync.js";
import {
  taskTypeSchema,
  runBenchmarkRequestSchema,
  listEvaluationsRequestSchema,
  getModelScoresRequestSchema,
  recommendationRequestSchema,
} from "../types.js";

// =============================================================================
// Helper to safely extract route params (Express 5.x returns string | string[])
// =============================================================================
function getParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] : (value ?? '');
}

// =============================================================================
// Route Factory
// =============================================================================

export function createEvalRoutes(db: PostgresJsDatabase): Router {
  const router = Router();
  const runner = getBenchmarkRunner(db);
  const repository = getEvalRepository(db);
  const recommendationEngine = getRecommendationEngine(db);
  const scoreAggregator = getScoreAggregator(db);

  // ===========================================================================
  // Benchmark Routes
  // ===========================================================================

  /**
   * GET /api/model-eval/benchmarks
   * List all available benchmarks
   */
  router.get("/benchmarks", async (_req: Request, res: Response) => {
    try {
      const taskType = _req.query.taskType as string | undefined;

      let benchmarks;
      if (taskType) {
        const parsed = taskTypeSchema.safeParse(taskType);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Invalid task type",
            details: fromError(parsed.error).message,
          });
        }
        benchmarks = getBenchmarksByTaskType(parsed.data);
      } else {
        benchmarks = getAllBenchmarks();
      }

      // Return summary without full test cases
      const summaries = benchmarks.map((b) => ({
        id: b.id,
        name: b.name,
        description: b.description,
        version: b.version,
        taskType: b.taskType,
        category: b.category,
        testCaseCount: b.testCases.length,
      }));

      res.json({
        benchmarks: summaries,
        summary: getBenchmarkSummary(),
      });
    } catch (error) {
      console.error("[eval-routes] Error listing benchmarks:", error);
      res.status(500).json({ error: "Failed to list benchmarks" });
    }
  });

  /**
   * GET /api/model-eval/benchmarks/:id
   * Get a specific benchmark with full test cases
   */
  router.get("/benchmarks/:id", async (req: Request, res: Response) => {
    try {
      const benchmark = getBenchmark(getParam(req.params, 'id'));
      if (!benchmark) {
        return res.status(404).json({ error: "Benchmark not found" });
      }
      res.json(benchmark);
    } catch (error) {
      console.error("[eval-routes] Error getting benchmark:", error);
      res.status(500).json({ error: "Failed to get benchmark" });
    }
  });

  /**
   * POST /api/model-eval/benchmarks/run
   * Run a benchmark against a model
   */
  router.post("/benchmarks/run", async (req: Request, res: Response) => {
    try {
      const parsed = runBenchmarkRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: fromError(parsed.error).message,
        });
      }

      const { provider, modelId, benchmarkId, testCaseIds, seed, mock } = parsed.data;

      // In mock mode, skip API key requirement
      let apiKey = "";
      if (!mock) {
        // Get API key from header, environment variable, or fail
        const headerKey = req.headers["x-api-key"] as string;
        const envKeyMap: Record<string, string | undefined> = {
          openai: process.env.OPENAI_API_KEY,
          anthropic: process.env.ANTHROPIC_API_KEY,
          google: process.env.GOOGLE_API_KEY,
          mistral: process.env.MISTRAL_API_KEY,
          cohere: process.env.COHERE_API_KEY,
          huggingface: process.env.HUGGINGFACE_API_KEY,
        };
        apiKey = headerKey || envKeyMap[provider] || "";

        if (!apiKey) {
          return res.status(401).json({
            error: "API key required",
            details: `Provide API key in X-API-Key header or set ${provider.toUpperCase()}_API_KEY environment variable, or use mock=true for testing`,
          });
        }
      }

      // Run the benchmark
      const result = await runner.runBenchmark(
        {
          provider,
          modelId,
          benchmarkId,
          testCaseIds,
          seed,
          parallelism: 3,
          retries: 1,
          scope: "global",
        },
        {
          apiKey,
          parallelism: 3,
          timeout: 30000,
          retries: 1,
          mockMode: mock,
        }
      );

      res.json(result);
    } catch (error) {
      console.error("[eval-routes] Error running benchmark:", error);
      res.status(500).json({
        error: "Failed to run benchmark",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // ===========================================================================
  // Evaluation Routes
  // ===========================================================================

  /**
   * GET /api/model-eval/evaluations
   * Query evaluation results
   */
  router.get("/evaluations", async (req: Request, res: Response) => {
    try {
      const query = {
        provider: req.query.provider as string | undefined,
        modelId: req.query.modelId as string | undefined,
        benchmarkId: req.query.benchmarkId as string | undefined,
        status: req.query.status as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      };

      const evaluations = await repository.queryEvaluations(query as any);

      // Return summary without full test case results
      const summaries = evaluations.map((e) => ({
        id: e.id,
        provider: e.provider,
        modelId: e.modelId,
        benchmarkId: e.benchmarkId,
        benchmarkVersion: e.benchmarkVersion,
        overallScore: e.overallScore,
        accuracy: e.accuracy,
        latencyP50Ms: e.latencyP50Ms,
        latencyP95Ms: e.latencyP95Ms,
        status: e.status,
        startedAt: e.startedAt,
        completedAt: e.completedAt,
        testCaseCount: e.testCaseResults.length,
      }));

      res.json({
        evaluations: summaries,
        count: summaries.length,
        limit: query.limit,
        offset: query.offset,
      });
    } catch (error) {
      console.error("[eval-routes] Error querying evaluations:", error);
      res.status(500).json({ error: "Failed to query evaluations" });
    }
  });

  /**
   * GET /api/model-eval/evaluations/:id
   * Get a specific evaluation with full details
   */
  router.get("/evaluations/:id", async (req: Request, res: Response) => {
    try {
      const evaluation = await repository.getEvaluation(getParam(req.params, 'id'));
      if (!evaluation) {
        return res.status(404).json({ error: "Evaluation not found" });
      }
      res.json(evaluation);
    } catch (error) {
      console.error("[eval-routes] Error getting evaluation:", error);
      res.status(500).json({ error: "Failed to get evaluation" });
    }
  });

  // ===========================================================================
  // Score Routes
  // ===========================================================================

  /**
   * GET /api/model-eval/scores
   * Get aggregated model scores
   */
  router.get("/scores", async (req: Request, res: Response) => {
    try {
      const query = {
        provider: req.query.provider as string | undefined,
        modelId: req.query.modelId as string | undefined,
        taskType: req.query.taskType as string | undefined,
      };

      const scores = await repository.queryScores(query as any);

      res.json({
        scores,
        count: scores.length,
      });
    } catch (error) {
      console.error("[eval-routes] Error querying scores:", error);
      res.status(500).json({ error: "Failed to query scores" });
    }
  });

  /**
   * POST /api/model-eval/scores/aggregate
   * Trigger score aggregation for a task type
   */
  router.post("/scores/aggregate", async (req: Request, res: Response) => {
    try {
      const taskType = taskTypeSchema.safeParse(req.body.taskType);
      if (!taskType.success) {
        return res.status(400).json({
          error: "Invalid task type",
          details: fromError(taskType.error).message,
        });
      }

      const scores = await scoreAggregator.aggregateAllScores(taskType.data, {
        persist: true,
      });

      res.json({
        message: "Score aggregation complete",
        modelsProcessed: scores.length,
        scores,
      });
    } catch (error) {
      console.error("[eval-routes] Error aggregating scores:", error);
      res.status(500).json({ error: "Failed to aggregate scores" });
    }
  });

  // ===========================================================================
  // Recommendation Routes
  // ===========================================================================

  /**
   * POST /api/model-eval/recommendations
   * Get model recommendations for a task type
   */
  router.post("/recommendations", async (req: Request, res: Response) => {
    try {
      const parsed = recommendationRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: fromError(parsed.error).message,
        });
      }

      const recommendations = await recommendationEngine.getRecommendations(
        parsed.data,
        { useCache: true }
      );

      res.json(recommendations);
    } catch (error) {
      console.error("[eval-routes] Error getting recommendations:", error);
      res.status(500).json({ error: "Failed to get recommendations" });
    }
  });

  // ===========================================================================
  // Model Discovery Routes
  // ===========================================================================

  /**
   * GET /api/model-eval/models
   * Discover available models
   */
  router.get("/models", async (req: Request, res: Response) => {
    try {
      const taskType = req.query.taskType as string | undefined;
      const providers = req.query.providers
        ? (req.query.providers as string).split(",")
        : undefined;

      let models;
      if (taskType) {
        const parsed = taskTypeSchema.safeParse(taskType);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Invalid task type",
            details: fromError(parsed.error).message,
          });
        }
        models = await getModelsForTask(parsed.data, { providers });
      } else {
        const result = await discoverAllModels({ providers });
        models = result.models;
      }

      res.json({
        models,
        count: models.length,
      });
    } catch (error) {
      console.error("[eval-routes] Error discovering models:", error);
      res.status(500).json({ error: "Failed to discover models" });
    }
  });

  // ===========================================================================
  // Catalog Sync Routes
  // ===========================================================================

  /**
   * POST /api/model-eval/catalog/sync
   * Sync discovered models to the catalog service
   */
  router.post("/catalog/sync", async (req: Request, res: Response) => {
    try {
      const syncService = getCatalogSyncService();
      const providers = req.body.providers
        ? (req.body.providers as string[])
        : undefined;
      const dryRun = req.body.dryRun === true;
      const forceUpdate = req.body.forceUpdate === true;

      const result = await syncService.syncModels({
        providers,
        dryRun,
        forceUpdate,
      });

      res.json({
        message: dryRun ? "Dry run complete" : "Catalog sync complete",
        ...result,
      });
    } catch (error) {
      console.error("[eval-routes] Error syncing to catalog:", error);
      res.status(500).json({
        error: "Failed to sync to catalog",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  /**
   * GET /api/model-eval/catalog/preview
   * Preview what would be synced to the catalog (generates resources without syncing)
   */
  router.get("/catalog/preview", async (req: Request, res: Response) => {
    try {
      const syncService = getCatalogSyncService();
      const providers = req.query.providers
        ? (req.query.providers as string).split(",")
        : undefined;

      const resources = await syncService.generateResources({ providers });

      res.json({
        resources,
        count: resources.length,
        providers: [...new Set(resources.map((r) => (r.metadata as { provider?: string }).provider).filter(Boolean))],
      });
    } catch (error) {
      console.error("[eval-routes] Error previewing catalog resources:", error);
      res.status(500).json({ error: "Failed to preview catalog resources" });
    }
  });

  /**
   * GET /api/model-eval/catalog/export
   * Export catalog resources as JSON (for bootstrap file generation)
   */
  router.get("/catalog/export", async (req: Request, res: Response) => {
    try {
      const syncService = getCatalogSyncService();
      const providers = req.query.providers
        ? (req.query.providers as string).split(",")
        : undefined;

      const json = await syncService.exportToJson({ providers });

      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="integrations-bootstrap-${new Date().toISOString().split("T")[0]}.json"`
      );
      res.send(json);
    } catch (error) {
      console.error("[eval-routes] Error exporting catalog resources:", error);
      res.status(500).json({ error: "Failed to export catalog resources" });
    }
  });

  return router;
}
