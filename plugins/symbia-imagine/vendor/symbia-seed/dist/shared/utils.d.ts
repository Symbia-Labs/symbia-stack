/**
 * Utility functions for seed data operations
 */
import { SeedConfig } from "./constants.js";
/**
 * Logger for seed operations
 */
export declare class SeedLogger {
    private verbose;
    constructor(verbose?: boolean);
    info(message: string, ...args: any[]): void;
    success(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
}
/**
 * Check if data should be seeded based on configuration
 */
export declare function shouldSeed(config: SeedConfig, existingCount: number): boolean;
/**
 * Generate timestamp for seed data
 */
export declare function getSeedTimestamp(offsetMinutes?: number): Date;
/**
 * Batch insert helper - splits large arrays into chunks for efficient insertion
 */
export declare function batchInsert<T>(items: T[], insertFn: (batch: T[]) => Promise<void>, batchSize?: number): Promise<void>;
/**
 * Create a seed configuration with defaults
 */
export declare function createSeedConfig(partial?: Partial<SeedConfig>): Required<SeedConfig>;
