import { initializeDatabase } from "@symbia/db";
import * as schema from "@shared/schema";
import { MEMORY_SCHEMA_SQL } from "./memory-schema";

const database = initializeDatabase({
  serviceId: "logging-service",
  memorySchema: MEMORY_SCHEMA_SQL,
  memoryDbEnvVar: "LOGGING_USE_MEMORY_DB",
}, schema);

const { db, pool, isMemory, exportToFile, close } = database;

function toIdempotentSchemaSql(sql: string): string {
  return sql
    .replace(/\bCREATE TABLE\s+"/g, 'CREATE TABLE IF NOT EXISTS "')
    .replace(/\bCREATE UNIQUE INDEX\s+/g, "CREATE UNIQUE INDEX IF NOT EXISTS ")
    .replace(/\bCREATE INDEX\s+/g, "CREATE INDEX IF NOT EXISTS ");
}

export async function ensureLoggingSchema(): Promise<void> {
  if (isMemory) return;

  const client = await pool.connect();
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    const { rows } = await client.query<{ regclass: string | null }>(
      "select to_regclass('public.log_streams') as regclass"
    );

    const schemaSql = toIdempotentSchemaSql(MEMORY_SCHEMA_SQL);
    const statements = schemaSql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!rows?.[0]?.regclass) {
      console.log('[logging-service] Initializing PostgreSQL schema (tables missing)...');
    }

    for (const statement of statements) {
      await client.query(statement);
    }
  } finally {
    client.release();
  }
}

export { db, pool, isMemory, exportToFile, close, database };
