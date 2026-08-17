/**
 * The graph executor and catalog sync, as a module rather than as two
 * locals inside index.ts.
 *
 * Extracted 15 Aug 2026: routes.ts and index.ts both need this singleton,
 * and it lived in the file that also calls server.start(). Anything two
 * hosts must share is a module, not a closure variable — the same reason
 * routes moved out. See docs/proposals/service-composition.md.
 */
import { GraphExecutor } from './executor/index.js';
import { CatalogSync } from './catalog/sync.js';
import { config } from './config.js';

// The catalog sync owns the manifest authority the executor validates against.
// Declared before the executor so the resolver can be handed in by reference —
// the executor asks the sync what is manifested, rather than the sync pushing
// state into the executor.
let catalogSync: CatalogSync | undefined;

// Initialize graph executor
const graphExecutor = new GraphExecutor({
  maxConcurrentExecutions: config.runtime.maxConcurrentExecutions,
  defaultTimeout: config.runtime.defaultExecutionTimeout,
  maxBackpressureQueue: config.runtime.maxBackpressureQueue,
  enableMetrics: config.runtime.enableMetrics,
  manifestEnforcement: config.runtime.manifestEnforcement,
  manifestResolver: () => catalogSync?.getManifestedKeys(),
});

catalogSync = new CatalogSync(graphExecutor);

export { graphExecutor, catalogSync };
