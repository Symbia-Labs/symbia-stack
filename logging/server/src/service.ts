/**
 * The logging service as a value: routes, middleware, and the schema those
 * routes need in order to answer anything.
 *
 * Third instance of one defect (16 Aug). Track 1 found component wiring in
 * `runtime/index.ts`; Track 2 found the OpenAPI route in `models/index.ts`;
 * this is `ensureLoggingSchema()` and `initSystemBootstrap()` in
 * `logging/index.ts`. Each time, a host that mounted the routes got a
 * service that answered requests and could not do its job.
 *
 * The symptom here was three 500s with generic bodies — "Failed to query
 * logs", "Failed to fetch log streams", "Failed to ingest logs" — because
 * the tables in `memory-schema.ts` were never created in the sidecar's
 * pg-mem. The service code was correct throughout. Nothing was wrong except
 * that the one function which prepares the store lived somewhere only
 * `index.ts` could reach.
 */
import { authMiddleware, rlsMiddleware, initSystemBootstrap } from "./auth";
import { ensureLoggingSchema } from "./db";

export { registerRoutes } from "./routes";

/**
 * The same order index.ts uses: schema first, then the system principal
 * that the auth middleware expects to exist.
 */
export async function bootstrap(): Promise<void> {
  await ensureLoggingSchema();
  await initSystemBootstrap();
}

export const middleware = [authMiddleware, rlsMiddleware];
