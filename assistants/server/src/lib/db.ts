import { initializeDatabase } from "@symbia/db";
import * as schema from "../models/schema.js";
import { MEMORY_SCHEMA_SQL } from "./memory-schema.js";

const database = initializeDatabase({
  serviceId: "assistants-service",
  memorySchema: MEMORY_SCHEMA_SQL,
  memoryDbEnvVar: "ASSISTANTS_USE_MEMORY_DB",
}, schema);

const { db, pool, isMemory, exportToFile, close } = database;

export { db, pool, isMemory, exportToFile, close, database };
