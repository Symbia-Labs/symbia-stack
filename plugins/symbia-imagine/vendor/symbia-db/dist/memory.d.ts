import { newDb, DataType, type IMemoryDb } from "pg-mem";
import type { Pool } from "pg";
/**
 * Get the current pg-mem database instance (if using in-memory mode)
 */
export declare function getMemoryDbInstance(): IMemoryDb | null;
/**
 * Export the in-memory database to a JSON file
 * @param filePath Path to write the export file
 * @param serviceId Optional service identifier for logging
 * @returns true if export succeeded, false otherwise
 */
export declare function exportMemoryDatabase(filePath: string, serviceId?: string): boolean;
/**
 * Wrap pg-mem pool to handle rowMode incompatibilities
 * This fixes issues with Drizzle ORM expecting array row mode
 */
export declare function wrapPgMemPool(pool: Pool): Pool;
/**
 * Create an in-memory PostgreSQL database using pg-mem
 * Automatically registers common PostgreSQL functions
 */
export declare function createMemoryDatabase(schemaSQL?: string): Pool;
/**
 * Register additional custom functions in pg-mem database
 */
export declare function registerMemoryFunctions(mem: ReturnType<typeof newDb>, functions: Array<{
    name: string;
    returns: DataType;
    implementation: (...args: any[]) => any;
    impure?: boolean;
}>): void;
