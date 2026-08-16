/**
 * The assistants service as a value: routes plus a loader that can be run
 * AGAIN once the catalog has contents.
 *
 * `loadAssistants` already runs inside `registerRoutes`, which is fine for
 * the container — the catalog is populated before assistants boots. In a
 * composition root the order inverts: services mount first, bootstrap
 * runs second, so the loader saw an empty catalog and registered nothing
 * (measured 15 Aug: an assistant authored through the API never appeared
 * in `GET /api/assistants`).
 *
 * The fix is not to reorder mounting — a host should not have to know
 * which service seeds which other one. It is to let a host say "the
 * catalog is ready now" and have the service respond.
 */
import type { Express } from 'express';
import { loadAssistants } from './services/assistant-loader.js';

export { registerRoutes } from './routes.js';

export interface StartContext {
  /** The app this service's routes were mounted on. */
  app: Express;
}

/** Re-read the roster from the catalog. Safe to call more than once. */
export async function start(ctx: StartContext): Promise<void> {
  await loadAssistants(ctx.app);
}
