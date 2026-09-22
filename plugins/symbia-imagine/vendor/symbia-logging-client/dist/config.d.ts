import { type BootstrapConfig } from "@symbia/sys";
import type { TelemetryConfig } from "./types.js";
/**
 * Initialize system bootstrap for telemetry
 * Called automatically on first request when auth mode is "system"
 */
export declare function initSystemAuth(): Promise<BootstrapConfig | null>;
/**
 * Clear system bootstrap cache
 * Call this on 401 to force re-fetch
 */
export declare function clearSystemAuth(): void;
/**
 * Get current system bootstrap config (if available)
 */
export declare function getSystemAuth(): BootstrapConfig | null;
/**
 * Default telemetry configuration from environment variables
 * Can be overridden by passing config to createTelemetryClient()
 */
export declare const DEFAULT_CONFIG: Omit<TelemetryConfig, "serviceId">;
/**
 * Normalize endpoint URL
 * - Remove trailing slashes
 * - Ensure /api suffix
 */
export declare function normalizeEndpoint(endpoint: string): string;
/**
 * Build HTTP headers for telemetry requests
 */
export declare function getHeaders(config: TelemetryConfig): Record<string, string>;
/**
 * Get current timestamp in ISO format
 */
export declare function nowIso(): string;
/**
 * Build base metadata for telemetry entries
 */
export declare function buildBaseMetadata(config: TelemetryConfig): Record<string, unknown>;
/**
 * Clamp queue size by removing oldest entries
 */
export declare function clampQueue(queue: Array<unknown>, maxQueue: number): void;
//# sourceMappingURL=config.d.ts.map