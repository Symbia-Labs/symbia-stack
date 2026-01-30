/**
 * Benchmark Runner
 *
 * Orchestrates the execution of benchmarks against models.
 * Handles parallel execution, timeouts, retries, and result aggregation.
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getProvider, type ProviderAdapter } from "../../providers/base.js";
import { getBenchmark } from "./benchmark-registry.js";
import { evaluate, type EvaluatorContext } from "./evaluators.js";
import { EvalRepository, getEvalRepository } from "../storage/eval-repository.js";
import type {
  BenchmarkDefinition,
  TestCase,
  TestCaseResult,
  EvalRunConfig,
  EvaluationResult,
  EvalStatus,
} from "../types.js";
import type { InsertModelEvaluation } from "../storage/eval-schema.js";

// =============================================================================
// Types
// =============================================================================

export interface RunnerOptions {
  /** Maximum parallel test cases */
  parallelism?: number;

  /** Timeout per test case in ms */
  timeout?: number;

  /** Number of retries on failure */
  retries?: number;

  /** Global seed for deterministic generation */
  seed?: number;

  /** API key for the provider */
  apiKey?: string;

  /** Callback for progress updates */
  onProgress?: (completed: number, total: number, current?: TestCaseResult) => void;

  /** Mock mode - returns simulated results without calling the actual provider */
  mockMode?: boolean;
}

interface TestCaseExecution {
  testCase: TestCase;
  startTime: number;
  endTime?: number;
  result?: TestCaseResult;
  error?: Error;
  retryCount: number;
}

// =============================================================================
// Benchmark Runner
// =============================================================================

export class BenchmarkRunner {
  private repository: EvalRepository;

  constructor(db: PostgresJsDatabase) {
    this.repository = getEvalRepository(db);
  }

  /**
   * Run a benchmark against a model
   */
  async runBenchmark(
    config: EvalRunConfig,
    options: RunnerOptions = {}
  ): Promise<EvaluationResult> {
    const {
      parallelism = 1,
      timeout = 30000,
      retries = 0,
      seed,
      apiKey,
      onProgress,
      mockMode = false,
    } = options;

    // Get benchmark definition
    const benchmark = getBenchmark(config.benchmarkId);
    if (!benchmark) {
      throw new Error(`Benchmark not found: ${config.benchmarkId}`);
    }

    // Get provider adapter
    const provider = getProvider(config.provider);
    if (!provider) {
      throw new Error(`Provider not found: ${config.provider}`);
    }

    // Create initial evaluation record
    const startedAt = new Date();
    const evaluationRecord = await this.repository.createEvaluation({
      provider: config.provider,
      modelId: config.modelId,
      benchmarkId: config.benchmarkId,
      benchmarkVersion: config.benchmarkVersion || benchmark.version,
      overallScore: 0,
      accuracy: 0,
      latencyP50Ms: 0,
      latencyP95Ms: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      estimatedCostCents: 0,
      testCaseResults: [],
      runConfig: config,
      orgId: config.orgId || null,
      scope: config.scope,
      status: "running",
      startedAt,
    });

    try {
      // Filter test cases if specific IDs requested
      let testCases = benchmark.testCases;
      if (config.testCaseIds && config.testCaseIds.length > 0) {
        const idSet = new Set(config.testCaseIds);
        testCases = testCases.filter((tc) => idSet.has(tc.id));
      }
      if (config.tags && config.tags.length > 0) {
        const tagSet = new Set(config.tags);
        testCases = testCases.filter((tc) =>
          tc.tags?.some((t) => tagSet.has(t))
        );
      }

      // Execute test cases
      const benchmarkConfig = {
        timeout: benchmark.config?.timeout ?? timeout,
        maxTokens: benchmark.config?.maxTokens,
        temperature: benchmark.config?.temperature,
        seed: benchmark.config?.seed,
      };

      const results = await this.executeTestCases(
        testCases,
        provider,
        config.modelId,
        benchmarkConfig,
        {
          parallelism,
          timeout: benchmarkConfig.timeout,
          retries,
          seed: seed ?? benchmarkConfig.seed,
          apiKey,
          onProgress,
          mockMode,
        }
      );

      // Calculate aggregate metrics
      const completedAt = new Date();
      const aggregates = this.calculateAggregates(results, benchmark);

      // Update evaluation record
      const updatedRecord = await this.repository.updateEvaluation(
        evaluationRecord.id,
        {
          status: "completed",
          completedAt,
          ...aggregates,
          testCaseResults: results,
        }
      );

      return this.recordToResult(updatedRecord!, config);
    } catch (error) {
      // Update evaluation with error
      await this.repository.updateEvaluation(evaluationRecord.id, {
        status: "failed",
        completedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });

      throw error;
    }
  }

  /**
   * Execute test cases with parallelism control
   */
  private async executeTestCases(
    testCases: TestCase[],
    provider: ProviderAdapter,
    modelId: string,
    benchmarkConfig: {
      timeout: number;
      maxTokens?: number;
      temperature?: number;
      seed?: number;
    },
    options: RunnerOptions & { apiKey?: string }
  ): Promise<TestCaseResult[]> {
    const { parallelism = 1, timeout = 30000, retries = 0, onProgress, apiKey, mockMode } = options;

    const results: TestCaseResult[] = [];
    const queue = [...testCases];
    let completed = 0;

    // Process in batches based on parallelism
    while (queue.length > 0) {
      const batch = queue.splice(0, parallelism);
      const batchPromises = batch.map((testCase) =>
        this.executeTestCase(testCase, provider, modelId, benchmarkConfig, {
          timeout,
          retries,
          apiKey,
          mockMode,
        })
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      completed += batchResults.length;
      if (onProgress) {
        const lastResult = batchResults[batchResults.length - 1];
        onProgress(completed, testCases.length, lastResult);
      }
    }

    return results;
  }

  /**
   * Execute a single test case
   */
  private async executeTestCase(
    testCase: TestCase,
    provider: ProviderAdapter,
    modelId: string,
    benchmarkConfig: {
      timeout: number;
      maxTokens?: number;
      temperature?: number;
      seed?: number;
    },
    options: { timeout: number; retries: number; apiKey?: string; mockMode?: boolean }
  ): Promise<TestCaseResult> {
    const { timeout, retries, apiKey, mockMode } = options;

    // Mock mode - return simulated results based on expected output
    if (mockMode) {
      return this.executeMockTestCase(testCase);
    }

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const startTime = performance.now();

        // Build the request
        const messages = testCase.input.messages || [];
        if (testCase.input.prompt) {
          messages.push({ role: "user", content: testCase.input.prompt });
        }

        // Transform tools to OpenAI format if needed
        let formattedTools: unknown[] | undefined;
        if (testCase.input.tools) {
          formattedTools = testCase.input.tools.map((tool: Record<string, unknown>) => {
            // If already in OpenAI format (has type: "function"), pass through
            if (tool.type === "function") {
              return tool;
            }
            // Transform to OpenAI format
            return {
              type: "function",
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
              },
            };
          });
        }

        // Execute with timeout
        const executePromise = provider.execute({
          operation: "chat.completions",
          model: modelId,
          params: {
            messages,
            max_tokens: benchmarkConfig.maxTokens || 500,
            temperature: benchmarkConfig.temperature ?? 0,
            ...(formattedTools && { tools: formattedTools }),
          },
          apiKey: apiKey || "",
          timeout,
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), timeout)
        );

        const response = await Promise.race([executePromise, timeoutPromise]);
        const endTime = performance.now();
        const latencyMs = Math.round(endTime - startTime);

        // Extract function call if present
        let functionCall: TestCaseResult["output"]["functionCall"];
        if (response.toolCalls && response.toolCalls.length > 0) {
          const firstCall = response.toolCalls[0];
          try {
            functionCall = {
              name: firstCall.function.name,
              arguments: JSON.parse(firstCall.function.arguments),
            };
          } catch {
            functionCall = {
              name: firstCall.function.name,
              arguments: {},
            };
          }
        }

        // Evaluate the result
        const evalContext: EvaluatorContext = {
          testCase,
          output: response.content,
          functionCall,
        };
        const evalResult = evaluate(evalContext);

        return {
          testCaseId: testCase.id,
          output: {
            content: response.content,
            functionCall,
            rawResponse: response.metadata,
          },
          passed: evalResult.passed,
          score: evalResult.score,
          reason: evalResult.reason,
          latencyMs,
          inputTokens: response.usage.promptTokens,
          outputTokens: response.usage.completionTokens,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on timeout
        if (lastError.message === "Timeout") {
          break;
        }
      }
    }

    // All retries failed
    return {
      testCaseId: testCase.id,
      output: {
        content: "",
      },
      passed: false,
      score: 0,
      reason: `Execution failed: ${lastError?.message || "Unknown error"}`,
      latencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      error: lastError?.message,
    };
  }

  /**
   * Calculate aggregate metrics from test results
   */
  private calculateAggregates(
    results: TestCaseResult[],
    benchmark: BenchmarkDefinition
  ): {
    overallScore: number;
    accuracy: number;
    latencyP50Ms: number;
    latencyP95Ms: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    estimatedCostCents: number;
  } {
    if (results.length === 0) {
      return {
        overallScore: 0,
        accuracy: 0,
        latencyP50Ms: 0,
        latencyP95Ms: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        estimatedCostCents: 0,
      };
    }

    // Build weight map from test cases
    const weightMap = new Map<string, number>();
    for (const tc of benchmark.testCases) {
      weightMap.set(tc.id, tc.weight || 1);
    }

    // Calculate weighted score
    let totalWeight = 0;
    let weightedScore = 0;
    let passedCount = 0;

    for (const result of results) {
      const weight = weightMap.get(result.testCaseId) || 1;
      totalWeight += weight;
      weightedScore += result.score * weight;
      if (result.passed) passedCount++;
    }

    const overallScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
    const accuracy = results.length > 0 ? passedCount / results.length : 0;

    // Calculate latency percentiles
    const latencies = results
      .filter((r) => r.latencyMs > 0)
      .map((r) => r.latencyMs)
      .sort((a, b) => a - b);

    const latencyP50Ms = this.percentile(latencies, 50);
    const latencyP95Ms = this.percentile(latencies, 95);

    // Sum tokens
    const totalInputTokens = results.reduce((sum, r) => sum + r.inputTokens, 0);
    const totalOutputTokens = results.reduce((sum, r) => sum + r.outputTokens, 0);

    // Estimate cost (placeholder - would need actual pricing)
    const estimatedCostCents = 0; // TODO: Calculate from provider pricing

    return {
      overallScore,
      accuracy,
      latencyP50Ms,
      latencyP95Ms,
      totalInputTokens,
      totalOutputTokens,
      estimatedCostCents,
    };
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
  }

  /**
   * Execute a mock test case - returns simulated results for testing
   */
  private executeMockTestCase(testCase: TestCase): TestCaseResult {
    // Simulate a realistic latency between 50-500ms
    const latencyMs = 50 + Math.floor(Math.random() * 450);

    // Generate mock output based on expected values
    let mockOutput = "";
    let passed = false;
    let score = 0;

    // Use expected content if available, otherwise generate based on evaluator type
    if (testCase.expected.content) {
      // 80% chance of returning expected content (simulating a good model)
      if (Math.random() < 0.8) {
        mockOutput = testCase.expected.content;
        passed = true;
        score = 1;
      } else {
        mockOutput = "Mock response that does not match expected";
        score = 0.3;
      }
    } else if (testCase.expected.contains && testCase.expected.contains.length > 0) {
      // Include expected substrings with 85% probability each
      const includeCount = testCase.expected.contains.filter(() => Math.random() < 0.85).length;
      mockOutput = testCase.expected.contains.slice(0, includeCount).join(" and ");
      score = includeCount / testCase.expected.contains.length;
      passed = score >= 0.5;
    } else if (testCase.expected.functionCall) {
      // Simulate function call response
      mockOutput = `Calling ${testCase.expected.functionCall.name}`;
      passed = Math.random() < 0.75;
      score = passed ? 1 : 0.4;
    } else {
      // Generic mock response
      mockOutput = "Mock response for testing purposes";
      passed = Math.random() < 0.7;
      score = passed ? 0.8 + Math.random() * 0.2 : 0.2 + Math.random() * 0.3;
    }

    // Simulate token usage
    const inputTokens = 50 + Math.floor(Math.random() * 200);
    const outputTokens = 20 + Math.floor(Math.random() * 100);

    return {
      testCaseId: testCase.id,
      output: {
        content: mockOutput,
        functionCall: testCase.expected.functionCall ? {
          name: testCase.expected.functionCall.name,
          arguments: testCase.expected.functionCall.arguments || {},
        } : undefined,
      },
      passed,
      score,
      reason: passed ? "Mock test passed" : "Mock test did not fully match expected",
      latencyMs,
      inputTokens,
      outputTokens,
    };
  }

  /**
   * Convert database record to EvaluationResult
   */
  private recordToResult(
    record: NonNullable<Awaited<ReturnType<EvalRepository["getEvaluation"]>>>,
    config: EvalRunConfig
  ): EvaluationResult {
    return {
      id: record.id,
      provider: record.provider,
      modelId: record.modelId,
      benchmarkId: record.benchmarkId,
      benchmarkVersion: record.benchmarkVersion,
      overallScore: record.overallScore,
      accuracy: record.accuracy,
      latencyP50Ms: record.latencyP50Ms,
      latencyP95Ms: record.latencyP95Ms,
      totalInputTokens: record.totalInputTokens,
      totalOutputTokens: record.totalOutputTokens,
      estimatedCostCents: record.estimatedCostCents,
      testCaseResults: record.testCaseResults,
      runConfig: config,
      orgId: record.orgId,
      scope: record.scope as "global" | "org",
      status: record.status as EvalStatus,
      startedAt: record.startedAt.toISOString(),
      completedAt: record.completedAt?.toISOString(),
      errorMessage: record.errorMessage || undefined,
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

let runnerInstance: BenchmarkRunner | null = null;

export function getBenchmarkRunner(db: PostgresJsDatabase): BenchmarkRunner {
  if (!runnerInstance) {
    runnerInstance = new BenchmarkRunner(db);
  }
  return runnerInstance;
}
