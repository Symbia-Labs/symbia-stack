import { initializeDatabase, setSessionContext, clearSessionContext, withRLSContext, splitSqlStatements, type RLSContext } from "@symbia/db";
import * as schema from "@shared/schema";
import { MEMORY_SCHEMA_SQL } from "./memory-schema";
import type { Pool } from "pg";

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
    // splitSqlStatements, NOT split(";").
    //
    // A semicolon inside a SQL comment — added on 8 Aug 2026 to document a
    // past schema defect — cut a CREATE TABLE in half here. Postgres replied
    // `syntax error at end of input`, identity refused to boot, and because
    // every service depends on identity the whole stack failed to start. The
    // comment was correct; the splitter was not.
    const statements = splitSqlStatements(schemaSql);

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

/**
 * Set RLS context for the current request.
 * Call this before any database queries to enable row-level security filtering.
 */
export async function setRLSContext(context: {
  orgId: string;
  userId: string;
  isSuperAdmin?: boolean;
  capabilities?: string[];
}): Promise<void> {
  await setSessionContext(pool as unknown as Pool, {
    orgId: context.orgId,
    userId: context.userId,
    isSuperAdmin: context.isSuperAdmin,
    capabilities: context.capabilities,
    serviceId: "logging",
  });
}

/**
 * Execute a function with RLS context, automatically clearing after.
 */
export async function withRLS<T>(
  context: RLSContext,
  fn: () => Promise<T>
): Promise<T> {
  await setSessionContext(pool as unknown as Pool, context);
  try {
    return await fn();
  } finally {
    await clearSessionContext(pool as unknown as Pool);
  }
}

export { db, pool, isMemory, exportToFile, close, database };
export { setSessionContext, clearSessionContext, withRLSContext };
export type { RLSContext };
