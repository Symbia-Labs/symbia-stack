/**
 * Benchmark Registry
 *
 * Central registry for benchmark definitions. Manages loading,
 * registration, and retrieval of benchmarks.
 */

import type { BenchmarkDefinition, TaskType } from "../types.js";

// =============================================================================
// Registry State
// =============================================================================

const benchmarkRegistry = new Map<string, BenchmarkDefinition>();

// =============================================================================
// Registration Functions
// =============================================================================

/**
 * Register a benchmark definition
 */
export function registerBenchmark(benchmark: BenchmarkDefinition): void {
  if (benchmarkRegistry.has(benchmark.id)) {
    console.warn(`[benchmark-registry] Overwriting existing benchmark: ${benchmark.id}`);
  }
  benchmarkRegistry.set(benchmark.id, benchmark);
}

/**
 * Register multiple benchmarks at once
 */
export function registerBenchmarks(benchmarks: BenchmarkDefinition[]): void {
  for (const benchmark of benchmarks) {
    registerBenchmark(benchmark);
  }
}

// =============================================================================
// Retrieval Functions
// =============================================================================

/**
 * Get a benchmark by ID
 */
export function getBenchmark(id: string): BenchmarkDefinition | undefined {
  return benchmarkRegistry.get(id);
}

/**
 * Get all registered benchmarks
 */
export function getAllBenchmarks(): BenchmarkDefinition[] {
  return Array.from(benchmarkRegistry.values());
}

/**
 * Get benchmarks by task type
 */
export function getBenchmarksByTaskType(taskType: TaskType): BenchmarkDefinition[] {
  return Array.from(benchmarkRegistry.values()).filter(
    (b) => b.taskType === taskType
  );
}

/**
 * Get benchmarks by category
 */
export function getBenchmarksByCategory(category: string): BenchmarkDefinition[] {
  return Array.from(benchmarkRegistry.values()).filter(
    (b) => b.category === category
  );
}

/**
 * Get all registered benchmark IDs
 */
export function getBenchmarkIds(): string[] {
  return Array.from(benchmarkRegistry.keys());
}

/**
 * Check if a benchmark exists
 */
export function hasBenchmark(id: string): boolean {
  return benchmarkRegistry.has(id);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get a summary of registered benchmarks
 */
export function getBenchmarkSummary(): {
  total: number;
  byTaskType: Record<string, number>;
  byCategory: Record<string, number>;
} {
  const benchmarks = getAllBenchmarks();

  const byTaskType: Record<string, number> = {};
  const byCategory: Record<string, number> = {};

  for (const benchmark of benchmarks) {
    byTaskType[benchmark.taskType] = (byTaskType[benchmark.taskType] || 0) + 1;
    byCategory[benchmark.category] = (byCategory[benchmark.category] || 0) + 1;
  }

  return {
    total: benchmarks.length,
    byTaskType,
    byCategory,
  };
}

/**
 * Clear all registered benchmarks (for testing)
 */
export function clearBenchmarkRegistry(): void {
  benchmarkRegistry.clear();
}

// =============================================================================
// Built-in Benchmarks Initialization
// =============================================================================

import { routingBenchmarks } from "./suites/routing-benchmarks.js";
import { codeReviewBenchmarks } from "./suites/code-review-benchmarks.js";
import { reasoningBenchmarks } from "./suites/reasoning-benchmarks.js";
import { functionCallingBenchmarks } from "./suites/function-calling-benchmarks.js";

/**
 * Initialize all built-in benchmarks
 */
export function initializeBuiltinBenchmarks(): void {
  registerBenchmarks(routingBenchmarks);
  registerBenchmarks(codeReviewBenchmarks);
  registerBenchmarks(reasoningBenchmarks);
  registerBenchmarks(functionCallingBenchmarks);

  const summary = getBenchmarkSummary();
  console.log(
    `[benchmark-registry] Initialized ${summary.total} built-in benchmarks:`,
    summary.byTaskType
  );
}
