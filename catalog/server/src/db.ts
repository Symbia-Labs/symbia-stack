import { initializeDatabase } from "@symbia/db";
import * as schema from "@shared/schema";
import { MEMORY_SCHEMA_SQL } from "./memory-schema";

const database = initializeDatabase({
  serviceId: "catalog-service",
  memorySchema: MEMORY_SCHEMA_SQL,
  memoryDbEnvVar: "CATALOG_USE_MEMORY_DB",
}, schema);

const { db, pool, isMemory, exportToFile, close } = database;

export { db, pool, isMemory, exportToFile, close, database };
