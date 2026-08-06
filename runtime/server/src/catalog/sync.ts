/**
 * Catalog -> runtime hydration and reconciliation (roadmap Phase 1).
 *
 * The gap this closes, stated plainly: graphs used to exist only once
 * something POSTed them, were lost on restart, and no external producer could
 * reach a graph until an actor had first loaded *and* executed it. That forced
 * every feed to carry orchestration it had no business carrying — energy's
 * `feeder.py` had to probe the ingress and stand the pipeline up itself.
 *
 * Now: the catalog is the source of truth and the runtime is the handler. On
 * boot the runtime publishes its component manifests, hydrates published graph
 * resources, and stands up the ones declared as pipelines/services. A
 * reconcile pass converges the loaded set on catalog state thereafter.
 *
 * Reconciliation polls. The roadmap's end state drives it off Network service
 * events instead; polling is named as interim here rather than left to look
 * like the design.
 */
import type { GraphExecutor } from '../executor/graph-executor.js';
import type { GraphDefinition } from '../types/graph.js';
import { config } from '../config.js';
import { CatalogUnavailableError, RuntimeCatalogClient, type CatalogResource } from './client.js';
import { fetchManifestedComponentKeys, syncComponentManifests } from './manifests.js';
import { INGRESS_KEY_PREFIX, readIngress, registerIngress } from './ingress.js';
import { getStateStore } from '../executor/state-store.js';

/** Roles that mean "this graph should be running", not "this graph exists". */
const STANDING_ROLES = new Set(['pipeline', 'service']);

interface HydratedGraph {
  /** Catalog resource id. */
  resourceId: string;
  /** Runtime graph id assigned by the executor. */
  graphId: string;
  /** Catalog's updatedAt at the time we loaded it, for change detection. */
  revision: string;
  name: string;
  /** Catalog key — the graph's stable identity, and its operator-state key. */
  key: string;
  /** Org that owns the graph; governs ingress authorization and metric attribution. */
  orgId?: string;
}

export interface SyncReport {
  manifests?: { registered: number; updated: number; unchanged: number; failed: number };
  graphsLoaded: string[];
  graphsUnloaded: string[];
  graphsStarted: string[];
  errors: { key: string; error: string }[];
}

function definitionOf(resource: CatalogResource): GraphDefinition | undefined {
  const meta = (resource.metadata ?? {}) as Record<string, unknown>;
  const candidate = (meta.definition ?? meta.graph ?? meta) as unknown;
  const def = candidate as GraphDefinition;
  if (def && typeof def === 'object' && Array.isArray(def.nodes) && Array.isArray(def.edges)) {
    return def;
  }
  return undefined;
}

function roleOf(resource: CatalogResource, definition: GraphDefinition): string | undefined {
  const fromDef = (definition.metadata ?? {}) as Record<string, unknown>;
  const fromRes = (resource.metadata ?? {}) as Record<string, unknown>;
  const role = (fromRes.role ?? fromDef.role) as string | undefined;
  return role;
}

function hasIngress(definition: GraphDefinition): boolean {
  const meta = (definition.metadata ?? {}) as Record<string, unknown>;
  return Boolean(meta.ingress);
}

function revisionOf(resource: CatalogResource): string {
  return String(resource.updatedAt ?? resource.createdAt ?? '');
}

export class CatalogSync {
  private readonly catalog: RuntimeCatalogClient;
  private readonly executor: GraphExecutor;
  private hydrated = new Map<string, HydratedGraph>();
  /** undefined = catalog never successfully read; distinct from empty. */
  private manifestedKeys: Set<string> | undefined;
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(executor: GraphExecutor, catalog = new RuntimeCatalogClient()) {
    this.executor = executor;
    this.catalog = catalog;
  }

  /**
   * The set of component keys the catalog manifests, for the executor's
   * load-time resolution. Undefined until a successful read — the executor
   * treats that as "cannot verify" rather than "nothing is manifested".
   */
  getManifestedKeys = (): Set<string> | undefined => this.manifestedKeys;

  /**
   * Owning org for a hydrated graph, by graph name. The ingress gate needs it
   * to decide whether a caller may deliver. Undefined for graphs loaded ad hoc
   * rather than hydrated from the catalog.
   */
  getGraphOrg = (graphName: string): string | undefined => {
    for (const entry of this.hydrated.values()) {
      if (entry.name === graphName) return entry.orgId;
    }
    return undefined;
  };

  /** Boot sequence: register manifests, then hydrate, then start reconciling. */
  async start(): Promise<SyncReport> {
    const report = await this.syncOnce({ registerManifests: config.catalog.registerManifests });

    if (config.catalog.reconcileIntervalMs > 0) {
      this.timer = setInterval(() => {
        if (this.running) return; // never overlap passes
        void this.syncOnce({ registerManifests: false }).catch((err) => {
          console.error('[CatalogSync] reconcile failed:', (err as Error).message);
        });
      }, config.catalog.reconcileIntervalMs);
      // Do not hold the process open for the reconcile loop alone.
      this.timer.unref?.();
      console.log(
        `[CatalogSync] reconciling every ${config.catalog.reconcileIntervalMs}ms (polling — Network-event-driven is the target)`
      );
    }

    return report;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async syncOnce(opts: { registerManifests: boolean }): Promise<SyncReport> {
    this.running = true;
    const report: SyncReport = {
      graphsLoaded: [],
      graphsUnloaded: [],
      graphsStarted: [],
      errors: [],
    };

    try {
      if (opts.registerManifests) {
        const result = await syncComponentManifests(this.catalog);
        report.manifests = {
          registered: result.registered.length,
          updated: result.updated.length,
          unchanged: result.unchanged.length,
          failed: result.failed.length,
        };
        for (const f of result.failed) {
          report.errors.push({ key: `component:${f.key}`, error: f.error });
        }
        console.log(
          `[CatalogSync] component manifests — registered ${result.registered.length}, updated ${result.updated.length}, unchanged ${result.unchanged.length}, failed ${result.failed.length}`
        );
      }

      // Refresh the manifest authority before validating any graph against it.
      this.manifestedKeys = await fetchManifestedComponentKeys(this.catalog);

      if (config.catalog.hydrateGraphs) {
        await this.reconcileGraphs(report);
      }
    } catch (error) {
      if (error instanceof CatalogUnavailableError) {
        console.error(`[CatalogSync] ${error.message}`);
        report.errors.push({ key: 'catalog', error: error.message });
        if (config.catalog.failFast) throw error;
      } else {
        throw error;
      }
    } finally {
      this.running = false;
    }

    return report;
  }

  private async reconcileGraphs(report: SyncReport): Promise<void> {
    const resources = (await this.catalog.listResources({ type: 'graph', status: 'published' }))
      .filter((r) => r.type === 'graph');

    // Existing ingress records, so re-registration updates rather than 400s on
    // a duplicate key.
    const ingressResources = new Map<string, CatalogResource>();
    if (config.catalog.registerIngress) {
      for (const r of await this.catalog.listResources({ type: 'integration' })) {
        if (r.key.startsWith(INGRESS_KEY_PREFIX)) ingressResources.set(r.key, r);
      }
    }

    const seen = new Set<string>();

    for (const resource of resources) {
      seen.add(resource.id);
      const definition = definitionOf(resource);
      if (!definition) {
        report.errors.push({
          key: resource.key,
          error: 'graph resource has no usable definition under metadata.definition',
        });
        continue;
      }

      const existing = this.hydrated.get(resource.id);
      const revision = revisionOf(resource);
      if (existing && existing.revision === revision) continue; // converged

      try {
        if (existing) {
          // Updated in the catalog — unload the old one (which stops its
          // executions) before loading the new definition.
          await this.executor.unloadGraph(existing.graphId);
          this.hydrated.delete(resource.id);
          report.graphsUnloaded.push(existing.name);
        }

        // Values this graph derives belong to the org that owns it, not to the
        // runtime's system identity. A graph resource with no org falls back to
        // the system org — and says so, because that is a registration gap, not
        // a default worth hiding.
        if (!resource.orgId) {
          console.warn(
            `[CatalogSync] graph "${resource.key}" has no orgId — anything it derives will be attributed to the system org`
          );
        }
        const loaded = await this.executor.loadGraph(definition, {
          orgId: resource.orgId ?? undefined,
          // The catalog key is the graph's stable identity across restarts,
          // and is what its operator state is keyed on.
          key: resource.key,
        });
        this.hydrated.set(resource.id, {
          resourceId: resource.id,
          graphId: loaded.id,
          revision,
          name: definition.name,
          key: resource.key,
          orgId: resource.orgId ?? undefined,
        });
        report.graphsLoaded.push(definition.name);

        // Declare the delivery surface in the registry (Phase 2 / D4). An
        // ingress that is not registered cannot be discovered or governed.
        const ingress = readIngress(definition);
        if (ingress && config.catalog.registerIngress) {
          try {
            await registerIngress(this.catalog, {
              graphName: definition.name,
              graphKey: resource.key,
              orgId: resource.orgId ?? undefined,
              // Inherit the graph's owning app so the ingress is claimed too.
              app: ((resource.metadata ?? {}) as Record<string, unknown>).app as string | undefined,
              ingress,
              existing: ingressResources.get(`${INGRESS_KEY_PREFIX}${definition.name}`),
            });
          } catch (error) {
            report.errors.push({
              key: `ingress:${definition.name}`,
              error: (error as Error).message,
            });
          }
        }

        const role = roleOf(resource, definition);
        const shouldStand =
          config.catalog.autoExecute && role !== undefined && STANDING_ROLES.has(role);

        if (shouldStand) {
          if (!hasIngress(definition)) {
            // A standing graph with no declared ingress can be started, but
            // nothing can ever deliver to it. Say so rather than let it sit
            // there looking healthy.
            console.warn(
              `[CatalogSync] graph "${definition.name}" declares role=${role} but no metadata.ingress — starting it, but nothing can deliver to it`
            );
          }
          await this.executor.startExecution(loaded.id);
          report.graphsStarted.push(definition.name);
          console.log(
            `[CatalogSync] stood up "${definition.name}" (role=${role}) — external producers can POST /api/ingress/${definition.name}`
          );
        }
      } catch (error) {
        // A graph that fails manifest resolution lands here. That is the
        // intended loud failure, not an incident to paper over.
        report.errors.push({ key: resource.key, error: (error as Error).message });
        console.error(`[CatalogSync] failed to hydrate "${resource.key}": ${(error as Error).message}`);
      }
    }

    // Removed from the catalog (or unpublished) => unload here, and drop the
    // operator state with it. This is the one case where discarding state is
    // right: the graph itself is gone. An ordinary restart, or a graph being
    // updated in place, must keep it.
    for (const [resourceId, entry] of Array.from(this.hydrated.entries())) {
      if (seen.has(resourceId)) continue;
      await this.executor.unloadGraph(entry.graphId);
      await getStateStore().clearGraph(entry.key);
      this.hydrated.delete(resourceId);
      report.graphsUnloaded.push(entry.name);
      console.log(
        `[CatalogSync] unloaded "${entry.name}" and dropped its operator state — no longer published in the catalog`
      );
    }
  }
}
