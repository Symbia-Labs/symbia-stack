/**
 * Standard metric definitions used across Symbia services
 */
export const METRIC_DEFINITIONS = {
    "service.request.count": {
        type: "counter",
        description: "Total HTTP requests",
    },
    "service.error.count": {
        type: "counter",
        description: "Total HTTP errors",
    },
    "service.request.latency_ms": {
        type: "histogram",
        description: "HTTP request latency (ms)",
    },
    "service.dependency.latency_ms": {
        type: "histogram",
        description: "Dependency latency (ms)",
    },
};
/**
 * Get metric definition, falling back to gauge for custom metrics
 */
export function getMetricDefinition(name) {
    return (METRIC_DEFINITIONS[name] || { type: "gauge", description: "Custom metric" });
}
//# sourceMappingURL=metrics.js.map