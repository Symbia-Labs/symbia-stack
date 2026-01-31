import { initializeDatabase, setSessionContext, clearSessionContext, type DatabaseInstance, type RLSContext } from "@symbia/db";
import * as schema from "@shared/schema.js";
import { MEMORY_SCHEMA_SQL } from "./memory-schema.js";
import type { Pool } from "pg";

const database: DatabaseInstance<typeof schema> = initializeDatabase({
  serviceId: "integrations-service",
  memorySchema: MEMORY_SCHEMA_SQL,
  memoryDbEnvVar: "INTEGRATIONS_USE_MEMORY_DB",
}, schema);

const { db, pool, isMemory, exportToFile, close } = database;

/**
 * Set RLS context for the current request.
 * Call this before any database queries to enable row-level security filtering.
 */
export async function setRLSContext(context: {
  orgId?: string;
  userId?: string;
  isSuperAdmin?: boolean;
  capabilities?: string[];
}): Promise<void> {
  await setSessionContext(pool as unknown as Pool, {
    orgId: context.orgId || "",
    userId: context.userId || "anonymous",
    isSuperAdmin: context.isSuperAdmin,
    capabilities: context.capabilities,
    serviceId: "integrations",
  });
}

export { db, pool, isMemory, exportToFile, close, database };
export { setSessionContext, clearSessionContext };
export type { RLSContext };
