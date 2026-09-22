import type { TelemetryClient, TelemetryConfig } from "./types.js";
/**
 * Create a telemetry client instance
 *
 * @param overrides - Partial config to override defaults from environment
 * @returns TelemetryClient instance (or no-op client if disabled)
 *
 * @example
 * ```typescript
 * const telemetry = createTelemetryClient({
 *   serviceId: 'my-service',
 * });
 *
 * telemetry.event('service.started', 'Service initialized');
 * telemetry.metric('service.request.count', 1);
 * ```
 */
export declare function createTelemetryClient(overrides: Partial<TelemetryConfig> & {
    serviceId: string;
}): TelemetryClient;
//# sourceMappingURL=client.d.ts.map