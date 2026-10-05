/**
 * The runtime service as a value: routes plus the background loop that
 * makes a catalog graph become a running graph.
 *
 * Why `start()` is separate from `registerRoutes` — measured 15/16 Aug.
 * `CatalogSync.start()` was called only from index.ts, so a composition
 * root mounted the routes and the runtime never hydrated anything: a graph
 * created through the API sat in the catalog while `GET /api/graphs`
 * reported `loadedGraphs: 0`. On a full stack the same graph loads three
 * seconds after the write and executes. Same code, two hosts, and the
 * difference was a function no host but one could call.
 *
 * A service is routes AND the loops that make those routes mean something.
 * See docs/proposals/service-composition.md, stages S2–S4.
 */
import { createTelemetryClient } from '@symbia/logging-client';
import { config } from './config.js';
import { registerSinkComponents } from './executor/components-sinks.js';
import { MetricWriter } from './executor/metric-writer.js';
import { StateStore, setStateStore } from './executor/state-store.js';
import { pool, isDurable } from './db.js';
// Side-effect registrations. Without these the component registry is empty
// and every graph load fails at reference checking.
import './executor/components-state.js';
import './executor/components-sources.js';
import { graphExecutor, catalogSync } from './executor.js';

export { registerRoutes } from './routes.js';
export { graphExecutor, catalogSync };

/**
 * Component implementations, wired to the writers that give them effect.
 *
 * This was index.ts-only until 16 Aug, and the symptom was specific:
 * `CatalogSync failed to hydrate "graphs/vis-probe": Graph references
 * components with no registered implementation: log -> symbia.sink.log`.
 * The routes were mounted, the sync loop ran, the graph was found and
 * published — and it could not load, because nothing had told the registry
 * what `symbia.sink.log` does. Registration is part of the service, not
 * part of one entrypoint.
 *
 * Guarded so a host that imports both this module and index.ts registers
 * once.
 */
let wired = false;
let store: StateStore | undefined;

/** The state store this service wired, for a host that must flush on exit. */
export function stateStore(): StateStore | undefined {
  return store;
}
export { isDurable };

export function wireComponents(): void {
  if (wired) return;
  wired = true;

  const stateStore = new StateStore({
    pool: pool as never,
    durable: isDurable,
    flushIntervalMs: parseInt(process.env.RUNTIME_STATE_FLUSH_MS || '2000', 10),
  });
  setStateStore(stateStore);
  store = stateStore;

  const telemetry = createTelemetryClient({
    serviceId: process.env.TELEMETRY_SERVICE_ID || config.serviceId,
  });
  const metricWriter = new MetricWriter({ serviceId: config.serviceId });

  registerSinkComponents({
    metric: (name, value, labels, orgId) => metricWriter.write({ name, value, labels, orgId }),
    log: (level, message, metadata) => {
      telemetry.log(level, message, metadata);
      return telemetry.getLastError() === null;
    },
  });
}

export interface StartResult {
  graphsLoaded: number;
  graphsStarted: number;
  errors: Array<{ key: string; error: string }>;
}

/**
 * Publish manifests, hydrate published graphs, start the declared ones,
 * then keep reconciling. Idempotent enough for a host to call after
 * bootstrap; returns what it did rather than logging into the void.
 */
export async function start(): Promise<StartResult> {
  wireComponents();
  const report = await catalogSync!.start();
  return {
    graphsLoaded: report.graphsLoaded.length,
    graphsStarted: report.graphsStarted.length,
    errors: report.errors,
  };
}

export async function stop(): Promise<void> {
  catalogSync?.stop();
}
