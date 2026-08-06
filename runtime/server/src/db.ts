/**
 * Runtime persistence (roadmap Phase 3).
 *
 * The runtime was the only executing service holding all of its state in
 * process Maps, so a restart silently dropped running pipelines and everything
 * their stateful operators had accumulated. Phase 1 made the *graphs* survive
 * (they rehydrate from the catalog); this makes the *work* survive.
 *
 * Follows the pattern the other six services use: `@symbia/db`'s
 * initializeDatabase with a pg-mem fallback, so the runtime still starts
 * without Postgres — degraded to in-memory state, and saying so, rather than
 * failing to boot.
 */
import { initializeDatabase } from '@symbia/db';
import { MEMORY_SCHEMA_SQL } from './memory-schema.js';

const database = initializeDatabase({
  serviceId: 'runtime-service',
  memorySchema: MEMORY_SCHEMA_SQL,
  memoryDbEnvVar: 'RUNTIME_USE_MEMORY_DB',
});

export const { db, pool, isMemory, close } = database;

/**
 * True when state genuinely survives a process restart. In-memory mode keeps
 * the same code paths working but loses everything on exit — callers should
 * report that plainly rather than implying durability they do not have.
 */
export const isDurable = !isMemory;

export { database };
