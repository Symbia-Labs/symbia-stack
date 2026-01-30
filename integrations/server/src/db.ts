import { initializeDatabase, type DatabaseInstance } from "@symbia/db";
import * as schema from "@shared/schema.js";
import { MEMORY_SCHEMA_SQL } from "./memory-schema.js";

const database: DatabaseInstance<typeof schema> = initializeDatabase({
  serviceId: "integrations-service",
  memorySchema: MEMORY_SCHEMA_SQL,
  memoryDbEnvVar: "INTEGRATIONS_USE_MEMORY_DB",
}, schema);

const { db, isMemory, exportToFile, close } = database;

export { db, isMemory, exportToFile, close, database };
