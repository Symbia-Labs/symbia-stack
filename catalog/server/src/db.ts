import { initializeDatabase, setSessionContext, clearSessionContext, type RLSContext } from "@symbia/db";
import * as schema from "@shared/schema";
import { MEMORY_SCHEMA_SQL } from "./memory-schema";
import type { Pool } from "pg";

const database = initializeDatabase({
  serviceId: "catalog-service",
  memorySchema: MEMORY_SCHEMA_SQL,
  memoryDbEnvVar: "CATALOG_USE_MEMORY_DB",
}, schema);

const { db, pool, isMemory, exportToFile, close } = database;

/**
 * Set RLS context for the current request.
 * For catalog, this supports both authenticated and public access.
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
    serviceId: "catalog",
  });
}

export { db, pool, isMemory, exportToFile, close, database };
export { setSessionContext, clearSessionContext };
export type { RLSContext };
