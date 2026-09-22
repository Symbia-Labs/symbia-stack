import type { DatabaseConfig, DatabaseInstance } from "./types.js";
/**
 * Initialize a database connection (real PostgreSQL or in-memory)
 *
 * @example
 * ```typescript
 * import { initializeDatabase } from '@symbia/persistence';
 * import * as schema from './schema';
 *
 * const { db, pool } = initializeDatabase({
 *   serviceId: 'my-service',
 *   memorySchema: MEMORY_SCHEMA_SQL,
 * }, schema);
 * ```
 */
export declare function initializeDatabase<TSchema extends Record<string, unknown>>(config: DatabaseConfig, schema?: TSchema): DatabaseInstance<TSchema>;
/**
 * Check if database connection is configured
 */
export declare function isDatabaseConfigured(): boolean;
/**
 * Get database configuration from environment variables
 */
export declare function getDatabaseConfig(servicePrefix?: string): Partial<DatabaseConfig>;
