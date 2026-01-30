import { newDb, DataType, type IMemoryDb } from "pg-mem";
import type { Pool } from "pg";
import { randomUUID } from "crypto";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// Store reference to the pg-mem database instance for export/import
let memoryDbInstance: IMemoryDb | null = null;

/**
 * Get the current pg-mem database instance (if using in-memory mode)
 */
export function getMemoryDbInstance(): IMemoryDb | null {
  return memoryDbInstance;
}

/**
 * Export the in-memory database to a JSON file
 * @param filePath Path to write the export file
 * @param serviceId Optional service identifier for logging
 * @returns true if export succeeded, false otherwise
 */
export function exportMemoryDatabase(filePath: string, serviceId?: string): boolean {
  if (!memoryDbInstance) {
    if (serviceId) {
      console.log(`[${serviceId}] No in-memory database to export`);
    }
    return false;
  }

  try {
    // Ensure directory exists
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Get all table data using pg-mem's backup functionality
    const backup = memoryDbInstance.backup();

    // Also export raw table data for easier inspection
    const tables: Record<string, any[]> = {};
    for (const table of memoryDbInstance.public.listTables()) {
      const tableName = table.name;
      try {
        const result = memoryDbInstance.public.query(`SELECT * FROM "${tableName}"`);
        tables[tableName] = result.rows;
      } catch {
        // Some tables might not be queryable
        tables[tableName] = [];
      }
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      serviceId: serviceId || "unknown",
      tables,
      // Store the backup function reference for potential restore
      _backupAvailable: true,
    };

    writeFileSync(filePath, JSON.stringify(exportData, null, 2));

    if (serviceId) {
      console.log(`[${serviceId}] Database exported to ${filePath}`);
    }
    return true;
  } catch (error) {
    if (serviceId) {
      console.error(`[${serviceId}] Failed to export database:`, error);
    }
    return false;
  }
}

/**
 * Wrap pg-mem pool to handle rowMode incompatibilities
 * This fixes issues with Drizzle ORM expecting array row mode
 */
export function wrapPgMemPool(pool: Pool): Pool {
  const originalQuery = pool.query.bind(pool);
  pool.query = ((query: any, ...args: any[]) => {
    if (query && typeof query === "object") {
      const wantsArray = query.rowMode === "array";
      const sanitized = { ...query };
      delete sanitized.types;
      delete sanitized.rowMode;
      return Promise.resolve(originalQuery(sanitized, ...args)).then((result: any) => {
        if (wantsArray && result && Array.isArray(result.rows)) {
          const names =
            Array.isArray(result.fields) && result.fields.length > 0
              ? result.fields.map((field: any) => field.name)
              : null;
          result.rows = result.rows.map((row: any) =>
            names ? names.map((name: string) => row?.[name]) : Object.values(row)
          );
        }
        return result;
      });
    }
    return originalQuery(query, ...args);
  }) as typeof pool.query;
  return pool;
}

/**
 * Create an in-memory PostgreSQL database using pg-mem
 * Automatically registers common PostgreSQL functions
 */
export function createMemoryDatabase(schemaSQL?: string): Pool {
  const mem = newDb({ autoCreateForeignKeyIndices: true });

  // Store reference for export functionality
  memoryDbInstance = mem;

  // Register standard PostgreSQL functions
  mem.public.registerFunction({
    name: "gen_random_uuid",
    returns: DataType.uuid,
    impure: true,
    implementation: () => randomUUID(),
  });

  mem.public.registerFunction({
    name: "uuid_generate_v4",
    returns: DataType.uuid,
    impure: true,
    implementation: () => randomUUID(),
  });

  mem.public.registerFunction({
    name: "now",
    returns: DataType.timestamptz,
    impure: true,
    implementation: () => new Date(),
  });

  // Execute schema if provided
  if (schemaSQL) {
    mem.public.none(schemaSQL);
  }

  // Create pool adapter and wrap it
  const adapter = mem.adapters.createPg();
  const pool = new adapter.Pool();
  return wrapPgMemPool(pool as Pool);
}

/**
 * Register additional custom functions in pg-mem database
 */
export function registerMemoryFunctions(
  mem: ReturnType<typeof newDb>,
  functions: Array<{
    name: string;
    returns: DataType;
    implementation: (...args: any[]) => any;
    impure?: boolean;
  }>
): void {
  for (const fn of functions) {
    mem.public.registerFunction({
      name: fn.name,
      returns: fn.returns,
      impure: fn.impure ?? false,
      implementation: fn.implementation,
    });
  }
}
