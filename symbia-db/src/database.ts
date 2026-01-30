import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { DatabaseConfig, DatabaseInstance } from "./types.js";
import { createMemoryDatabase, exportMemoryDatabase } from "./memory.js";

const { Pool } = pg;

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
export function initializeDatabase<TSchema extends Record<string, unknown>>(
  config: DatabaseConfig,
  schema?: TSchema
): DatabaseInstance<TSchema> {
  const {
    databaseUrl = process.env.DATABASE_URL,
    useMemoryDb: forceMemory = false,
    memorySchema,
    serviceId = "unknown",
    enableLogging = true,
    memoryDbEnvVar,
  } = config;

  // Determine if we should use memory database
  let useMemory = forceMemory || !databaseUrl;

  // Check custom environment variable if provided
  if (memoryDbEnvVar && process.env[memoryDbEnvVar] === "true") {
    useMemory = true;
  }

  let pool: pg.Pool;
  let isMemory = false;

  if (useMemory) {
    pool = createMemoryDatabase(memorySchema);
    isMemory = true;
    if (enableLogging) {
      console.log(`[${serviceId}] Using in-memory database (pg-mem).`);
    }
  } else {
    pool = new Pool({ connectionString: databaseUrl });
    if (enableLogging) {
      console.log(`[${serviceId}] Connected to PostgreSQL database.`);
    }
  }

  const db = schema ? drizzle(pool, { schema }) : drizzle(pool);

  /**
   * Export the in-memory database to a file
   */
  function exportToFile(filePath: string): boolean {
    if (!isMemory) {
      if (enableLogging) {
        console.log(`[${serviceId}] Skipping export - not using in-memory database`);
      }
      return false;
    }
    return exportMemoryDatabase(filePath, serviceId);
  }

  /**
   * Close the database connection gracefully
   */
  async function close(): Promise<void> {
    try {
      await pool.end();
      if (enableLogging) {
        console.log(`[${serviceId}] Database connection closed`);
      }
    } catch (error) {
      if (enableLogging) {
        console.error(`[${serviceId}] Error closing database:`, error);
      }
    }
  }

  return {
    db,
    pool,
    isMemory,
    exportToFile,
    close,
  };
}

/**
 * Check if database connection is configured
 */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Get database configuration from environment variables
 */
export function getDatabaseConfig(servicePrefix?: string): Partial<DatabaseConfig> {
  const config: Partial<DatabaseConfig> = {
    databaseUrl: process.env.DATABASE_URL,
  };

  if (servicePrefix) {
    const memoryVar = `${servicePrefix}_USE_MEMORY_DB`;
    config.memoryDbEnvVar = memoryVar;
    if (process.env[memoryVar] === "true") {
      config.useMemoryDb = true;
    }
  }

  return config;
}
