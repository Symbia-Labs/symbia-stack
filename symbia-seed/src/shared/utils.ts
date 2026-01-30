/**
 * Utility functions for seed data operations
 */

import { SeedConfig } from "./constants.js";

/**
 * Logger for seed operations
 */
export class SeedLogger {
  private verbose: boolean;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  info(message: string, ...args: any[]) {
    if (this.verbose) {
      console.log(`[SEED] ${message}`, ...args);
    }
  }

  success(message: string, ...args: any[]) {
    console.log(`[SEED] ✓ ${message}`, ...args);
  }

  error(message: string, ...args: any[]) {
    console.error(`[SEED] ✗ ${message}`, ...args);
  }

  warn(message: string, ...args: any[]) {
    if (this.verbose) {
      console.warn(`[SEED] ⚠ ${message}`, ...args);
    }
  }
}

/**
 * Check if data should be seeded based on configuration
 */
export function shouldSeed(config: SeedConfig, existingCount: number): boolean {
  if (config.skipIfExists && existingCount > 0) {
    return false;
  }
  return true;
}

/**
 * Generate timestamp for seed data
 */
export function getSeedTimestamp(offsetMinutes: number = 0): Date {
  const now = new Date();
  now.setMinutes(now.getMinutes() + offsetMinutes);
  return now;
}

/**
 * Batch insert helper - splits large arrays into chunks for efficient insertion
 */
export async function batchInsert<T>(
  items: T[],
  insertFn: (batch: T[]) => Promise<void>,
  batchSize: number = 100
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await insertFn(batch);
  }
}

/**
 * Create a seed configuration with defaults
 */
export function createSeedConfig(partial: Partial<SeedConfig> = {}): Required<SeedConfig> {
  return {
    environment: partial.environment || "development",
    verbose: partial.verbose ?? true,
    skipIfExists: partial.skipIfExists ?? true,
    orgId: partial.orgId || "",
  };
}
