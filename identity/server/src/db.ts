import { initializeDatabase, setSessionContext, clearSessionContext, splitSqlStatements, type RLSContext } from "@symbia/db";
import * as schema from "@shared/schema";
import { MEMORY_SCHEMA_SQL } from "./memory-schema";
import type { Pool } from "pg";

const database = initializeDatabase({
  serviceId: "identity-service",
  memorySchema: MEMORY_SCHEMA_SQL,
  memoryDbEnvVar: "IDENTITY_USE_MEMORY_DB",
}, schema);

const { db, isMemory, exportToFile, close } = database;
// Annotated against this package's pg types: two @types/pg copies exist
// (identity's and @symbia/db's) and the inferred type is not portable.
const pool: Pool = database.pool as unknown as Pool;

function toIdempotentSchemaSql(sql: string): string {
  return sql
    .replace(/\bCREATE TABLE\s+"/g, 'CREATE TABLE IF NOT EXISTS "')
    .replace(/\bCREATE UNIQUE INDEX\s+/g, "CREATE UNIQUE INDEX IF NOT EXISTS ")
    .replace(/\bCREATE INDEX\s+/g, "CREATE INDEX IF NOT EXISTS ");
}

export async function ensureIdentitySchema(): Promise<void> {
  if (isMemory) return;

  const client = await pool.connect();
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    const { rows } = await client.query<{ regclass: string | null }>(
      "select to_regclass('public.users') as regclass"
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

    // If users doesn't exist, definitely apply schema; otherwise still apply idempotently
    // so missing tables/indexes get created if the DB is partially initialized.
    if (!rows?.[0]?.regclass) {
      console.log('[identity-service] Initializing PostgreSQL schema (tables missing)...');
    }

    for (const statement of statements) {
      await client.query(statement);
    }
  } finally {
    client.release();
  }
}

// setRLSContext removed 13 Aug 2026 (A4): it applied transaction-local
// set_config against the pool — a no-op under pooling. Requests now run
// inside runWithRLSContext (@symbia/db AsyncLocalStorage scope), which pins
// a client and uses SET LOCAL inside a real transaction.

export { db, pool, isMemory, exportToFile, close, database };
export { setSessionContext, clearSessionContext };
export type { RLSContext };
