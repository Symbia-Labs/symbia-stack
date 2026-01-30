import type { Pool } from "pg";

/**
 * Database configuration options
 */
export interface DatabaseConfig {
  /**
   * Database connection URL (PostgreSQL)
   */
  databaseUrl?: string;

  /**
   * Force use of in-memory database (pg-mem)
   * @default false
   */
  useMemoryDb?: boolean;

  /**
   * SQL schema for initializing memory database
   */
  memorySchema?: string;

  /**
   * Service identifier for logging
   */
  serviceId?: string;

  /**
   * Whether to log database initialization
   * @default true
   */
  enableLogging?: boolean;

  /**
   * Custom environment variable name for memory DB check
   * @example "IDENTITY_USE_MEMORY_DB"
   */
  memoryDbEnvVar?: string;
}

/**
 * Result from database initialization
 */
export interface DatabaseInstance<TSchema = any> {
  /**
   * Drizzle ORM instance
   */
  db: any;

  /**
   * Underlying pg.Pool instance
   */
  pool: Pool;

  /**
   * Whether using in-memory database
   */
  isMemory: boolean;

  /**
   * Export the in-memory database to a file (only available when isMemory is true)
   * @param filePath Path to write the export file
   * @returns true if export succeeded, false otherwise
   */
  exportToFile: (filePath: string) => boolean;

  /**
   * Close the database connection gracefully
   */
  close: () => Promise<void>;
}
