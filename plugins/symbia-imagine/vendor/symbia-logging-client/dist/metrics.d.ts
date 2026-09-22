import type { MetricDefinition } from "./types.js";
/**
 * Standard metric definitions used across Symbia services
 */
export declare const METRIC_DEFINITIONS: Record<string, MetricDefinition>;
/**
 * Get metric definition, falling back to gauge for custom metrics
 */
export declare function getMetricDefinition(name: string): MetricDefinition;
//# sourceMappingURL=metrics.d.ts.map