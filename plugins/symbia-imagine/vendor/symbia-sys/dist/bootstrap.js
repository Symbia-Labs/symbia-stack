/**
 * System Bootstrap - Service-to-service authentication
 *
 * Fetches ephemeral credentials from Identity service for internal telemetry.
 * Includes retry logic for resilience when Identity restarts.
 */
import { resolveServiceUrl, ServiceId } from "./index.js";
// Cached bootstrap config
let cachedConfig = null;
let fetchPromise = null;
/**
 * Fetch bootstrap config from Identity service
 *
 * @param retries - Number of retries on failure
 * @param retryDelayMs - Delay between retries
 * @returns Bootstrap config or null if unavailable
 */
export async function fetchBootstrapConfig(retries = 3, retryDelayMs = 1000) {
    // Return cached config if available
    if (cachedConfig) {
        return cachedConfig;
    }
    // Dedupe concurrent fetches
    if (fetchPromise) {
        return fetchPromise;
    }
    fetchPromise = (async () => {
        const identityUrl = resolveServiceUrl(ServiceId.IDENTITY);
        const endpoint = `${identityUrl}/api/bootstrap/internal`;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const response = await fetch(endpoint, {
                    method: "GET",
                    headers: { "Accept": "application/json" },
                });
                if (response.ok) {
                    const config = (await response.json());
                    cachedConfig = config;
                    return config;
                }
                // Don't retry on 403 (forbidden) - endpoint is blocked
                if (response.status === 403) {
                    console.warn("[bootstrap] Identity bootstrap endpoint forbidden");
                    return null;
                }
                // Retry on other errors
                if (attempt < retries) {
                    await sleep(retryDelayMs * (attempt + 1));
                }
            }
            catch (error) {
                // Network error - retry
                if (attempt < retries) {
                    await sleep(retryDelayMs * (attempt + 1));
                }
            }
        }
        console.warn("[bootstrap] Failed to fetch bootstrap config after retries");
        return null;
    })();
    const result = await fetchPromise;
    fetchPromise = null;
    return result;
}
/**
 * Clear cached bootstrap config
 * Call this when receiving a 401 to force re-fetch
 */
export function clearBootstrapCache() {
    cachedConfig = null;
}
/**
 * Get the current cached bootstrap config (if any)
 * Does not fetch - use fetchBootstrapConfig for that
 */
export function getBootstrapCache() {
    return cachedConfig;
}
/**
 * Check if we have a valid bootstrap config
 */
export function hasBootstrapConfig() {
    return cachedConfig !== null;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=bootstrap.js.map