/**
 * Utility functions for seed data operations
 */
/**
 * Logger for seed operations
 */
export class SeedLogger {
    verbose;
    constructor(verbose = false) {
        this.verbose = verbose;
    }
    info(message, ...args) {
        if (this.verbose) {
            console.log(`[SEED] ${message}`, ...args);
        }
    }
    success(message, ...args) {
        console.log(`[SEED] ✓ ${message}`, ...args);
    }
    error(message, ...args) {
        console.error(`[SEED] ✗ ${message}`, ...args);
    }
    warn(message, ...args) {
        if (this.verbose) {
            console.warn(`[SEED] ⚠ ${message}`, ...args);
        }
    }
}
/**
 * Check if data should be seeded based on configuration
 */
export function shouldSeed(config, existingCount) {
    if (config.skipIfExists && existingCount > 0) {
        return false;
    }
    return true;
}
/**
 * Generate timestamp for seed data
 */
export function getSeedTimestamp(offsetMinutes = 0) {
    const now = new Date();
    now.setMinutes(now.getMinutes() + offsetMinutes);
    return now;
}
/**
 * Batch insert helper - splits large arrays into chunks for efficient insertion
 */
export async function batchInsert(items, insertFn, batchSize = 100) {
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        await insertFn(batch);
    }
}
/**
 * Create a seed configuration with defaults
 */
export function createSeedConfig(partial = {}) {
    return {
        environment: partial.environment || "development",
        verbose: partial.verbose ?? true,
        skipIfExists: partial.skipIfExists ?? true,
        orgId: partial.orgId || "",
    };
}
