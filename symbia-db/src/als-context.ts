/**
 * AsyncLocalStorage-backed RLS context (13 Aug 2026).
 *
 * Why this exists: setSessionContext(pool, ctx) uses transaction-local
 * set_config with no open transaction, against a pool. The connection returns
 * to the pool and the route's query may run on a different backend with empty
 * (or a previous request's) context. The library warned about this in its own
 * doc comment; every service did it anyway (see
 * docs/2026-08-13-adversarial-analysis.md, finding A4).
 *
 * The fix: middleware stores the request's RLSContext in AsyncLocalStorage
 * (runWithRLSContext), and the pool's query() is wrapped so that any query
 * issued while a context is in scope runs on a pinned client inside its own
 * transaction: BEGIN → SET LOCAL context → query → COMMIT. Queries with no
 * context in scope pass through untouched.
 *
 * Explicit-client paths (pool.connect(), db.transaction()) are NOT covered by
 * the wrapper — use withRLSContext() from rls.ts for those.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { Pool, QueryResult } from "pg";
import { setSessionContext, type RLSContext } from "./rls.js";

const storage = new AsyncLocalStorage<RLSContext>();

/**
 * Run fn (and everything it awaits) with the given RLS context in scope.
 * Express usage: `runWithRLSContext(ctx, () => next())`.
 */
export function runWithRLSContext<T>(context: RLSContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** The RLS context in scope for the current async execution, if any. */
export function getCurrentRLSContext(): RLSContext | undefined {
  return storage.getStore();
}

/**
 * Wrap pool.query so pooled one-shot queries honor the ambient RLS context.
 * Idempotent per pool. Callback-style query() calls (not used by Drizzle)
 * pass through to the original implementation.
 */
export function attachRLSPoolWrapper(pool: Pool): void {
  const marker = "__symbiaRlsWrapped";
  if ((pool as unknown as Record<string, unknown>)[marker]) return;
  (pool as unknown as Record<string, unknown>)[marker] = true;

  const originalQuery = pool.query.bind(pool);

  (pool as unknown as { query: (...args: unknown[]) => unknown }).query =
    async function rlsQuery(...args: unknown[]): Promise<unknown> {
      const context = storage.getStore();
      if (!context || typeof args[args.length - 1] === "function") {
        return (originalQuery as (...a: unknown[]) => unknown)(...args);
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await setSessionContext(client, context);
        const result = (await (client.query as (...a: unknown[]) => Promise<QueryResult>)(
          ...args
        )) as QueryResult;
        await client.query("COMMIT");
        return result;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* connection may be broken; release below */
        }
        throw error;
      } finally {
        client.release();
      }
    };
}
