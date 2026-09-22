/**
 * System Bootstrap - Service-to-service authentication
 *
 * Fetches ephemeral credentials from Identity service for internal telemetry.
 * Includes retry logic for resilience when Identity restarts.
 */
export interface BootstrapConfig {
    secret: string;
    orgId: string;
    orgName: string;
    serviceId: string;
}
/**
 * Fetch bootstrap config from Identity service
 *
 * @param retries - Number of retries on failure
 * @param retryDelayMs - Delay between retries
 * @returns Bootstrap config or null if unavailable
 */
export declare function fetchBootstrapConfig(retries?: number, retryDelayMs?: number): Promise<BootstrapConfig | null>;
/**
 * Clear cached bootstrap config
 * Call this when receiving a 401 to force re-fetch
 */
export declare function clearBootstrapCache(): void;
/**
 * Get the current cached bootstrap config (if any)
 * Does not fetch - use fetchBootstrapConfig for that
 */
export declare function getBootstrapCache(): BootstrapConfig | null;
/**
 * Check if we have a valid bootstrap config
 */
export declare function hasBootstrapConfig(): boolean;
//# sourceMappingURL=bootstrap.d.ts.map