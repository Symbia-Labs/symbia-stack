/**
 * @symbia/db - Shared database and persistence utilities
 *
 * This package provides standardized database connection and ORM setup
 * for all Symbia microservices. It handles:
 * - PostgreSQL connection pooling
 * - In-memory database (pg-mem) for development/testing
 * - Drizzle ORM integration
 * - Common PostgreSQL function registration
 * - Environment variable configuration
 *
 * @example
 * ```typescript
 * import { initializeDatabase } from '@symbia/db';
 * import * as schema from './schema';
 * import { MEMORY_SCHEMA_SQL } from './memory-schema';
 *
 * const { db, pool } = initializeDatabase({
 *   serviceId: 'my-service',
 *   memorySchema: MEMORY_SCHEMA_SQL,
 *   memoryDbEnvVar: 'MY_SERVICE_USE_MEMORY_DB',
 * }, schema);
 *
 * // Use db for queries
 * const users = await db.query.users.findMany();
 * ```
 */

export * from "./types.js";
export * from "./database.js";
export * from "./memory.js";
export * from "./indexes.js";
export * from "./rls.js";
