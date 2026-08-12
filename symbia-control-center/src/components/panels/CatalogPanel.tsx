/**
 * Catalog panel.
 *
 * The catalog is the platform's registry — 79 resources across six types — and
 * it had no page. `CatalogList` was imported nowhere; `ResourceEditor` was
 * reachable only through AssistantsPanel, so 20 of 79 resources were visible in
 * the console and the other 59 were not.
 *
 * DESIGNED FOR NARROWING, NOT SCROLLING. Base type is 16px and this console is
 * read at 150% zoom, which means roughly a dozen rows fit on screen. A flat
 * scrolling list of 79 is therefore not a small problem, it is the wrong shape:
 * the first version was exactly that and was unusable. So search and type are
 * the primary controls, the list is grouped with sticky headers, rows are one
 * line, and the detail pane does the talking.
 *
 * WHAT IS NOT SHOWN IS A DECISION. Every resource in this catalog is
 * `published`, so a status badge on every row is 79 repetitions of one fact.
 * Status appears only when it is NOT published — a constant is not information,
 * and printing it anyway trains the eye to skip the place where the exception
 * will eventually appear.
 *
 * ON FAILURE. This fetches the catalog directly rather than through
 * platformClient.listCatalogResources(), which catches errors and returns [].
 * An empty array meaning "the request failed" is the confident-zero defect this
 * platform exists to prevent, and a page that reports registry hygiene must not
 * be built on one.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import {
  GraphFlowPreview,
  type GraphDefinition,
  type ComponentPorts,
} from './catalog/GraphFlowPreview';
import { OperationDiagram } from './catalog/OperationDiagram';
import { RoutineFlowPreview } from './catalog/type-sections/RoutineFlowPreview';
import type { Routine } from './catalog/type-sections/RoutineEditor';
import { getDefaultRoutines } from './catalog/type-sections/defaultRoutines';

type Tab = 'registry' | 'contracts' | 'hygiene';
/** What you can do with one object once you have found it. */
type Mode = 'inspect' | 'test';

interface ManifestPort {
  name: string;
  lane?: 'inherit' | 'canonical' | 'apocryphal' | 'conditional';
  laneNote?: string;
}
interface ManifestConfigField {
  type: string;
  required?: boolean;
  default?: unknown;
  enum?: string[];
  description: string;
}
interface ComponentManifest {
  key: string;
  version: string;
  implementation: string;
  inputs: ManifestPort[];
  outputs: ManifestPort[];
  config?: Record<string, ManifestConfigField>;
  capability?: string;
  description?: string;
}
interface Resource {
  id: string;
  key: string;
  name: string;
  type: string;
  status: string;
  description?: string;
  tags?: string[];
  orgId?: string | null;
  updatedAt?: string;
  metadata?: { manifest?: ComponentManifest } & Record<string, unknown>;
}

const TYPE_ORDER = ['component', 'integration', 'assistant', 'graph', 'app', 'context'] as const;

const TYPE_BLURB: Record<string, string> = {
  component: 'Graph building blocks. Each publishes a contract.',
  integration: 'Outbound capability, and declared inbound surfaces.',
  assistant: 'Rule sets that fetch, then reason.',
  graph: 'Wired components with a declared role.',
  app: 'Portable artifacts: what installs into an org.',
  context: 'Shared, versioned shapes.',
};

const LANE_STYLE: Record<string, string> = {
  canonical: 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30',
  apocryphal: 'bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30',
  conditional: 'bg-violet-500/10 text-violet-300 ring-1 ring-violet-500/30',
  inherit: 'bg-slate-500/10 text-slate-400 ring-1 ring-slate-500/25',
};

const LANE_MEANING: Record<string, string> = {
  canonical: 'recomputable from the graph',
  apocryphal: 'cannot be verified by recomputation',
  conditional: 'decided by the data',
  inherit: 'carries whatever arrived',
};

function Pill({ children, tone = 'quiet' }: { children: React.ReactNode; tone?: 'quiet' | 'loud' }) {
  return (
    <span
      className={`inline-block px-2.5 py-1 rounded-full whitespace-nowrap ${
        tone === 'loud'
          ? 'bg-scc-primary/15 text-scc-primary ring-1 ring-scc-primary/30'
          : 'bg-slate-500/10 text-slate-400 ring-1 ring-slate-500/20'
      }`}
    >
      {children}
    </span>
  );
}

export function CatalogPanel() {
  const authToken = useAuthStore((s) => s.token);
  const [tab, setTab] = useState<Tab>('registry');
  const [resources, setResources] = useState<Resource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/svc/catalog/api/resources?limit=200', {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (!res.ok) {
        setError(`catalog GET /api/resources → ${res.status}${authToken ? '' : ' (no token sent)'}`);
        setResources(null);
        return;
      }
      const data = await res.json();
      setResources(data.resources ?? data.data ?? data);
    } catch (e) {
      setError(`catalog unreachable — ${(e as Error).message}`);
      setResources(null);
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of resources ?? []) c[r.type] = (c[r.type] ?? 0) + 1;
    return c;
  }, [resources]);

  /**
   * Published ports by component key, so a node drawn inside a graph uses the
   * same contract the catalog shows when that component is inspected alone.
   * This is the lookup that makes "the same object" literal rather than a
   * resemblance.
   */
  const manifests = useMemo(() => {
    const m = new Map<string, ComponentPorts>();
    for (const r of resources ?? []) {
      const man = r.metadata?.manifest;
      if (r.type === 'component' && man?.key) {
        m.set(man.key, {
          inputs: man.inputs ?? [],
          outputs: man.outputs ?? [],
          version: man.version,
          implementation: man.implementation,
        });
      }
    }
    return m;
  }, [resources]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (resources ?? []).filter(
      (r) =>
        (typeFilter === 'all' || r.type === typeFilter) &&
        (!q ||
          r.key.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          (r.description ?? '').toLowerCase().includes(q) ||
          (r.tags ?? []).some((t) => t.toLowerCase().includes(q))),
    );
  }, [resources, typeFilter, query]);

  const selected = useMemo(
    () => (resources ?? []).find((r) => r.id === selectedId) ?? null,
    [resources, selectedId],
  );

  /** Jump from a hygiene finding straight to the offending resources. */
  const inspect = useCallback((q: string, type?: string) => {
    setTab('registry');
    setQuery(q);
    setTypeFilter(type ?? 'all');
    setSelectedId(null);
  }, []);

  return (
    <div className="h-full flex flex-col bg-scc-surface text-text-primary text-base">
      <header className="shrink-0 px-8 pt-6 border-b border-scc-border bg-scc-surface">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-semibold text-slate-100 tracking-tight">Catalog</h1>
            <p className="text-slate-400 mt-1.5 max-w-2xl">
              The registry. Nothing becomes real by sitting in a directory — capability enters only
              through a gated, ledgered write.
            </p>
          </div>
          <div className="flex items-center gap-4 shrink-0 pt-1">
            {resources && (
              <span className="text-slate-500">
                <span className="text-slate-200 text-xl font-medium">{resources.length}</span> resources
              </span>
            )}
            <button
              onClick={() => void load()}
              className="px-4 py-2 rounded-lg ring-1 ring-scc-border hover:bg-scc-elevated text-slate-200 transition-colors"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        <nav className="flex flex-wrap gap-2 mt-6 -mb-px">
          {(
            [
              ['registry', 'Library', resources ? String(resources.length) : ''],
              ['contracts', 'Contracts', String(counts.component ?? '')],
              ['hygiene', 'Hygiene', ''],
            ] as [Tab, string, string][]
          ).map(([id, label, badge]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-2 rounded-t-lg border-b-2 transition-colors ${
                tab === id
                  ? 'border-scc-primary bg-scc-elevated text-slate-100'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {label}
              {badge && <span className="ml-2 text-slate-500">{badge}</span>}
            </button>
          ))}
        </nav>
      </header>

      {error && (
        <div className="shrink-0 mx-8 mt-5 px-4 py-3 rounded-lg ring-1 ring-amber-500/40 bg-amber-500/10 text-amber-200">
          {error}
        </div>
      )}

      {!resources && !error && (
        <p className="px-8 py-8 text-slate-500">Reading the catalog…</p>
      )}

      {resources && tab === 'registry' && (
        <RegistryView
          counts={counts}
          total={resources.length}
          filtered={filtered}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          query={query}
          setQuery={setQuery}
          selected={selected}
          setSelectedId={setSelectedId}
          manifests={manifests}
        />
      )}
      {resources && tab === 'contracts' && (
        <ContractsView
          components={resources.filter((r) => r.type === 'component' && r.metadata?.manifest)}
        />
      )}
      {resources && tab === 'hygiene' && <HygieneView resources={resources} onInspect={inspect} />}
    </div>
  );
}

/* ── Registry ─────────────────────────────────────────────────────────── */

function RegistryView(props: {
  counts: Record<string, number>;
  total: number;
  filtered: Resource[];
  typeFilter: string;
  setTypeFilter: (t: string) => void;
  query: string;
  setQuery: (q: string) => void;
  selected: Resource | null;
  setSelectedId: (id: string | null) => void;
  manifests: Map<string, ComponentPorts>;
}) {
  const { counts, total, filtered, typeFilter, setTypeFilter, query, setQuery, selected, setSelectedId, manifests } =
    props;

  const groups = useMemo(() => {
    const g = new Map<string, Resource[]>();
    for (const r of filtered) {
      if (!g.has(r.type)) g.set(r.type, []);
      g.get(r.type)!.push(r);
    }
    for (const list of g.values()) list.sort((a, b) => a.key.localeCompare(b.key));
    return [...g.entries()].sort(
      (a, b) => TYPE_ORDER.indexOf(a[0] as never) - TYPE_ORDER.indexOf(b[0] as never),
    );
  }, [filtered]);

  return (
    <div className="flex-1 min-h-0 flex">
      {/* left: narrow, then browse */}
      <div className="w-[26rem] shrink-0 border-r border-scc-border flex flex-col min-h-0">
        <div className="shrink-0 p-5 space-y-4">
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, key, tag…"
              className="w-full pl-4 pr-10 py-2.5 rounded-lg bg-scc-elevated ring-1 ring-scc-border focus:ring-scc-primary/60 outline-none text-slate-100 placeholder-slate-500 transition-shadow"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <TypeChip label="All" n={total} active={typeFilter === 'all'} onClick={() => setTypeFilter('all')} />
            {TYPE_ORDER.filter((t) => counts[t]).map((t) => (
              <TypeChip
                key={t}
                label={t}
                n={counts[t]}
                active={typeFilter === t}
                onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}
              />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto pb-6">
          {filtered.length === 0 && (
            <p className="px-5 text-slate-500">
              Nothing matches. The catalog holds {total} resources — clear the search to see them.
            </p>
          )}
          {groups.map(([type, items]) => (
            <section key={type}>
              <h2 className="sticky top-0 z-10 px-5 py-2 bg-scc-surface/95 backdrop-blur text-slate-500 uppercase tracking-wider border-y border-scc-border/60">
                {type} <span className="text-slate-600">· {items.length}</span>
              </h2>
              <ul>
                {items.map((r) => {
                  const active = selected?.id === r.id;
                  return (
                    <li key={r.id}>
                      <button
                        onClick={() => setSelectedId(active ? null : r.id)}
                        className={`w-full text-left px-5 py-2.5 flex items-center gap-3 border-l-2 transition-colors ${
                          active
                            ? 'border-scc-primary bg-scc-elevated'
                            : 'border-transparent hover:bg-scc-elevated/60'
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-slate-200">{r.name}</span>
                          <span className="block truncate font-mono text-slate-500">{r.key}</span>
                        </span>
                        {/* A constant is not information: shown only when it is not the norm. */}
                        {r.status !== 'published' && <Pill tone="loud">{r.status}</Pill>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>

      {/* right: detail */}
      <div className="flex-1 min-w-0 overflow-auto">
        {!selected ? (
          <EmptyDetail counts={counts} typeFilter={typeFilter} onPick={setTypeFilter} />
        ) : (
          <ResourceDetail
            resource={selected}
            manifests={manifests}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}

function TypeChip({
  label,
  n,
  active,
  onClick,
}: {
  label: string;
  n: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg transition-colors ${
        active
          ? 'bg-scc-primary/15 text-scc-primary ring-1 ring-scc-primary/40'
          : 'text-slate-400 ring-1 ring-scc-border hover:text-slate-200 hover:bg-scc-elevated'
      }`}
    >
      {label} <span className={active ? 'text-scc-primary/70' : 'text-slate-600'}>{n}</span>
    </button>
  );
}

function EmptyDetail({
  counts,
  typeFilter,
  onPick,
}: {
  counts: Record<string, number>;
  typeFilter: string;
  onPick: (t: string) => void;
}) {
  return (
    <div className="h-full flex items-center justify-center p-10">
      <div className="max-w-lg">
        <h2 className="text-xl text-slate-300">Pick a resource to read its record.</h2>
        <p className="text-slate-500 mt-2">
          {typeFilter === 'all'
            ? 'Or start from a type — each answers a different question about the platform.'
            : `Showing ${typeFilter}. ${TYPE_BLURB[typeFilter] ?? ''}`}
        </p>
        <div className="mt-6 space-y-2">
          {TYPE_ORDER.filter((t) => counts[t]).map((t) => (
            <button
              key={t}
              onClick={() => onPick(t)}
              className="w-full text-left px-4 py-3 rounded-lg ring-1 ring-scc-border hover:bg-scc-elevated transition-colors"
            >
              <span className="flex items-baseline justify-between gap-4">
                <span className="text-slate-200">{t}</span>
                <span className="text-slate-500">{counts[t]}</span>
              </span>
              <span className="block text-slate-500 mt-0.5">{TYPE_BLURB[t]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-200 mt-0.5 break-words">{children}</dd>
    </div>
  );
}

function ResourceDetail({
  resource: r,
  manifests,
  onClose,
}: {
  resource: Resource;
  manifests: Map<string, ComponentPorts>;
  onClose: () => void;
}) {
  const [rawOpen, setRawOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('inspect');
  const manifest = r.metadata?.manifest;

  // A graph resource keeps its definition under metadata.definition, and the
  // runtime's hydration falls back to metadata.graph and then to metadata
  // itself — mirrored here so the preview draws whatever the runtime would load.
  const m = (r.metadata ?? {}) as Record<string, unknown>;
  const definition = (m.definition ?? m.graph ?? m) as GraphDefinition;
  const isGraph = r.type === 'graph' && Array.isArray(definition?.nodes);

  // An assistant's routines are its graph. They render on the live assistant
  // views and in the editable catalog config, but the read-only inspect view
  // drew nothing for them — components get an Operation diagram (from their
  // manifest) and graphs get a flow preview, while assistants fell through.
  // Draw the same routine flow the live views use. Derive routines exactly as
  // AssistantConfigSection does: stored routines if present, otherwise the
  // defaults for this assistant's alias — seeded assistants (e.g. Intent
  // Router) carry no stored routines and render defaults on the live views.
  const assistantAlias = (m.alias as string) || r.key.split('/').pop() || '';
  const storedRoutines = (Array.isArray(m.routines) ? m.routines : []) as Routine[];
  const routines = storedRoutines.length > 0 ? storedRoutines : getDefaultRoutines(assistantAlias);
  const isAssistant = r.type === 'assistant' && routines.some((rt) => (rt?.steps?.length ?? 0) > 0);

  return (
    <article className="p-8 max-w-4xl">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold text-slate-100">{r.name}</h2>
          <p className="font-mono text-slate-500 mt-1 break-all">{r.key}</p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-scc-elevated"
        >
          Close
        </button>
      </div>

      <div className="flex gap-2 mt-5">
        {(
          [
            ['inspect', 'Inspect'],
            ['test', 'Test'],
          ] as [Mode, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            className={`px-4 py-1.5 rounded-lg transition-colors ${
              mode === id
                ? 'bg-scc-primary/15 text-scc-primary ring-1 ring-scc-primary/40'
                : 'text-slate-400 ring-1 ring-scc-border hover:bg-scc-elevated'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'test' && <SandboxStub resource={r} />}
      {mode === 'inspect' && (
        <>
      {r.description && <p className="text-slate-300 mt-5 leading-relaxed">{r.description}</p>}

      {isGraph && (
        <section className="mt-7">
          <h3 className="text-lg text-slate-200 mb-1">Behaviour</h3>
          <p className="text-slate-500 mb-4">
            {(definition.nodes ?? []).length} nodes, {(definition.edges ?? []).length} edges.
            Each node is the same object the catalog draws on its own — edges attach to the named
            port they leave from, and a refusal path is drawn amber.
          </p>
          <GraphFlowPreview definition={definition} manifests={manifests} />
        </section>
      )}

      {isAssistant && (
        <section className="mt-7">
          <h3 className="text-lg text-slate-200 mb-1">Behaviour</h3>
          <p className="text-slate-500 mb-4">
            {routines.reduce((sum, rt) => sum + (rt.steps?.length ?? 0), 0)} steps across{' '}
            {routines.length} routine{routines.length !== 1 ? 's' : ''}. The same routine flow the
            live assistant views draw.
          </p>
          <RoutineFlowPreview routines={routines} />
        </section>
      )}

      <dl className="grid grid-cols-2 gap-x-8 gap-y-5 mt-7 pt-7 border-t border-scc-border">
        <Fact label="type">{r.type}</Fact>
        <Fact label="status">{r.status}</Fact>
        <Fact label="organisation">
          {r.orgId ? (
            <span className="font-mono break-all">{r.orgId}</span>
          ) : (
            <span className="text-slate-500">none — not bound to an installation</span>
          )}
        </Fact>
        <Fact label="last written">
          {r.updatedAt ? new Date(r.updatedAt).toLocaleString() : <span className="text-slate-500">—</span>}
        </Fact>
      </dl>

      {r.tags && r.tags.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {r.tags.map((t) => (
            <Pill key={t}>{t}</Pill>
          ))}
        </div>
      )}

      {manifest && (
        <>
          <section className="mt-8 pt-7 border-t border-scc-border">
            <h3 className="text-lg text-slate-200 mb-1">Operation</h3>
            <p className="text-slate-500 mb-4">
              One operation, its named ports, and the provenance lane each output carries.
            </p>
            <OperationDiagram
              componentKey={manifest.key}
              inputs={manifest.inputs ?? []}
              outputs={manifest.outputs ?? []}
              implementation={manifest.implementation}
              capability={manifest.capability}
              version={manifest.version}
            />
          </section>

          <section className="mt-8 pt-7 border-t border-scc-border">
            <h3 className="text-lg text-slate-200 mb-1">Configuration</h3>
            <p className="text-slate-500 mb-4">
              Declared so a graph node can be checked against it before it runs.
            </p>
            <ConfigTable config={manifest.config} />
          </section>
        </>
      )}

      <section className="mt-8 pt-7 border-t border-scc-border">
        <button
          onClick={() => setRawOpen((v) => !v)}
          className="text-slate-400 hover:text-slate-200"
        >
          {rawOpen ? '▾' : '▸'} Raw metadata
        </button>
        {rawOpen && (
          <pre className="mt-4 p-4 rounded-lg bg-scc-elevated ring-1 ring-scc-border overflow-auto text-slate-300 whitespace-pre-wrap break-all">
            {JSON.stringify(r.metadata ?? {}, null, 2)}
          </pre>
        )}
      </section>
        </>
      )}
    </article>
  );
}

/**
 * Sandbox — stubbed.
 *
 * The intent: load this object into an ephemeral, memory-only graph, run one
 * input through it, and throw the graph away. Nothing registered, nothing
 * persisted, nothing reaching a real execution.
 *
 * Deliberately a stub rather than a half-built runner. A Test button that
 * quietly executed against the live runtime, or that reported success without
 * having run anything, would be the Save-button defect in the one place an
 * operator is most likely to trust it. It says what it does not do.
 */
function SandboxStub({ resource }: { resource: Resource }) {
  return (
    <section className="mt-6">
      <div className="p-5 rounded-lg ring-1 ring-scc-border bg-scc-elevated/30">
        <h3 className="text-lg text-slate-200">Sandbox — not built yet</h3>
        <p className="text-slate-400 mt-2 leading-relaxed">
          The intent is a memory-only load of <span className="font-mono text-slate-300">{resource.key}</span>{' '}
          into an ephemeral graph: one input, one result, nothing registered and nothing persisted.
          It would let you find out what this object does without giving it anywhere to do it.
        </p>
        <p className="text-slate-500 mt-3 leading-relaxed">
          Stubbed on purpose. A Test button that ran against the live runtime, or that reported a
          result it had not actually produced, would be worse than one that does nothing and says so.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            disabled
            className="px-4 py-2 rounded-lg ring-1 ring-scc-border text-slate-600 cursor-not-allowed"
          >
            Run in sandbox
          </button>
          <span className="self-center text-slate-500">
            needs: ephemeral graph load · input form from the config contract · result with its lane
          </span>
        </div>
      </div>
    </section>
  );
}

/* ── Contracts ────────────────────────────────────────────────────────── */

function Lanes({ ports }: { ports: ManifestPort[] }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {ports.map((p) => {
          const lane = p.lane ?? 'inherit';
          return (
            <span key={p.name} className={`px-3 py-1.5 rounded-lg ${LANE_STYLE[lane]}`}>
              <span className="font-mono">{p.name}</span>
              <span className="opacity-60"> · </span>
              {lane}
            </span>
          );
        })}
      </div>
      {ports
        .filter((p) => p.laneNote)
        .map((p) => (
          <p key={p.name} className="text-slate-400 leading-relaxed">
            <span className="font-mono text-slate-300">{p.name}</span> — {p.laneNote}
          </p>
        ))}
    </div>
  );
}

function ConfigTable({ config }: { config?: Record<string, ManifestConfigField> }) {
  if (config === undefined) {
    return (
      <p className="text-amber-300/90">
        Configuration undeclared — nobody has said whether this takes any. That is not the same as
        taking none.
      </p>
    );
  }
  const keys = Object.keys(config);
  if (keys.length === 0) return <p className="text-slate-500">Takes no configuration.</p>;

  return (
    <dl className="divide-y divide-scc-border ring-1 ring-scc-border rounded-lg overflow-hidden">
      {keys.map((k) => {
        const f = config[k];
        return (
          <div key={k} className="p-4 bg-scc-elevated/30">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <dt className="font-mono text-slate-200">{k}</dt>
              <span className="text-slate-500">{f.type}</span>
              {f.required ? (
                <span className="text-amber-300/90">required</span>
              ) : (
                <span className="text-slate-600">
                  optional{f.default !== undefined && <> · defaults to {JSON.stringify(f.default)}</>}
                </span>
              )}
              {f.enum && <span className="text-slate-500 font-mono">{f.enum.join(' | ')}</span>}
            </div>
            <dd className="text-slate-400 mt-1.5 leading-relaxed">{f.description}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function ContractsView({ components }: { components: Resource[] }) {
  const [active, setActive] = useState<string | null>(null);

  const families = useMemo(() => {
    const f = new Map<string, Resource[]>();
    for (const c of components) {
      const fam = c.metadata!.manifest!.key.split('.')[1] ?? 'other';
      if (!f.has(fam)) f.set(fam, []);
      f.get(fam)!.push(c);
    }
    return [...f.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [components]);

  const current =
    components.find((c) => c.metadata!.manifest!.key === active) ?? components[0] ?? null;

  if (!current) {
    return (
      <p className="px-8 py-8 text-slate-500">
        No component carries a manifest. That is a finding, not an empty state — the runtime
        publishes them on boot.
      </p>
    );
  }
  const m = current.metadata!.manifest!;

  return (
    <div className="flex-1 min-h-0 flex">
      <nav className="w-72 shrink-0 border-r border-scc-border overflow-auto py-5">
        {families.map(([fam, items]) => (
          <div key={fam} className="mb-4">
            <h3 className="px-5 py-1.5 text-slate-500 uppercase tracking-wider">{fam}</h3>
            {items.map((c) => {
              const key = c.metadata!.manifest!.key;
              const on = key === m.key;
              return (
                <button
                  key={key}
                  onClick={() => setActive(key)}
                  className={`w-full text-left px-5 py-2 font-mono truncate border-l-2 transition-colors ${
                    on
                      ? 'border-scc-primary bg-scc-elevated text-slate-100'
                      : 'border-transparent text-slate-400 hover:bg-scc-elevated/60'
                  }`}
                >
                  {key.replace(`symbia.${fam}.`, '')}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <article className="flex-1 min-w-0 overflow-auto p-8 max-w-4xl">
        <h2 className="text-2xl font-mono text-slate-100 break-all">{m.key}</h2>
        <p className="text-slate-500 mt-1.5">
          v{m.version} · {m.implementation}
          {m.capability && <> · requires {m.capability}</>}
        </p>
        {m.description && <p className="text-slate-300 mt-5 leading-relaxed">{m.description}</p>}

        <section className="mt-8 pt-7 border-t border-scc-border">
          <h3 className="text-lg text-slate-200">Output lanes</h3>
          <p className="text-slate-500 mt-1 mb-4">
            Lanes only tighten. One apocryphal hop marks everything downstream.
          </p>
          <Lanes ports={m.outputs} />
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-slate-600">
            {Object.entries(LANE_MEANING).map(([lane, meaning]) => (
              <span key={lane}>
                <span className="text-slate-500">{lane}</span> — {meaning}
              </span>
            ))}
          </div>
        </section>

        <section className="mt-8 pt-7 border-t border-scc-border">
          <h3 className="text-lg text-slate-200">Configuration</h3>
          <p className="text-slate-500 mt-1 mb-4">
            Declared so a graph node can be checked against it before it runs.
          </p>
          <ConfigTable config={m.config} />
        </section>
      </article>
    </div>
  );
}

/* ── Hygiene ──────────────────────────────────────────────────────────── */

interface Check {
  title: string;
  state: 'clean' | 'flag' | 'unchecked';
  headline: string;
  detail: string;
  offenders?: { label: string; query: string; type?: string }[];
}

function buildChecks(rs: Resource[]): Check[] {
  const checks: Check[] = [];

  const statuses = new Map<string, number>();
  for (const r of rs) statuses.set(r.status, (statuses.get(r.status) ?? 0) + 1);
  checks.push({
    title: 'Status carries information',
    state: statuses.size <= 1 ? 'flag' : 'clean',
    headline:
      statuses.size <= 1
        ? `all ${rs.length} are “${[...statuses.keys()][0]}”`
        : [...statuses.entries()].map(([s, n]) => `${s} ${n}`).join(' · '),
    detail:
      statuses.size <= 1
        ? 'The schema defines draft, published and deprecated. A field whose value never varies carries no information, and nothing has ever been deprecated.'
        : 'More than one status is in use.',
  });

  const path = rs.filter((r) => r.key.includes('/'));
  const dotted = rs.filter((r) => !r.key.includes('/') && r.key.includes('.'));
  const bare = rs.filter((r) => !r.key.includes('/') && !r.key.includes('.'));
  const styles = [path, dotted, bare].filter((g) => g.length > 0).length;
  checks.push({
    title: 'One key convention',
    state: styles > 1 ? 'flag' : 'clean',
    headline: `path ${path.length} · dotted ${dotted.length} · bare ${bare.length}`,
    detail:
      'Anything resolving a resource by key must know every style in use, or silently miss the ones it does not.',
    offenders: [...dotted, ...bare].map((r) => ({ label: r.key, query: r.key })),
  });

  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
  const slugs = rs.filter((r) => !uuid.test(r.id));
  checks.push({
    title: 'One id scheme',
    state: slugs.length > 0 && slugs.length < rs.length ? 'flag' : 'clean',
    headline: `${rs.length - slugs.length} uuid · ${slugs.length} slug`,
    detail:
      'Two id schemes coexist. Slugs are the majority here, so uuid is the exception rather than the standard — the reverse of what the newer resources suggest.',
  });

  const allTags = new Set<string>();
  for (const r of rs) for (const t of r.tags ?? []) allTags.add(t);
  const prefixed = [...allTags].filter((t) => t.includes(':'));
  checks.push({
    title: 'Tag vocabulary is namespaced',
    state: prefixed.length > 0 && prefixed.length < allTags.size ? 'flag' : 'clean',
    headline: `${allTags.size} tags · ${prefixed.length} namespaced`,
    detail:
      'Tags are the only query axis besides type and free text, and the vocabulary is unenforced. Only contexts use a prefix:value form.',
  });

  const comps = rs.filter((r) => r.type === 'component');
  const noManifest = comps.filter((r) => !r.metadata?.manifest);
  const undeclared = comps.filter((r) => r.metadata?.manifest && r.metadata.manifest.config === undefined);
  const bad = [...noManifest, ...undeclared];
  checks.push({
    title: 'Components declare a config contract',
    state: comps.length === 0 ? 'unchecked' : bad.length ? 'flag' : 'clean',
    headline: comps.length === 0 ? 'no components found' : `${comps.length - bad.length}/${comps.length}`,
    detail:
      'Undeclared is not the same as declaring none — the first says nobody has said. Configuration described only in prose cannot reject a typo.',
    offenders: bad.map((r) => ({ label: r.key, query: r.key, type: 'component' })),
  });

  const ports = comps.flatMap((r) => r.metadata?.manifest?.outputs ?? []);
  const laneless = ports.filter((p) => !p.lane);
  checks.push({
    title: 'Output ports publish a provenance lane',
    state: ports.length === 0 ? 'unchecked' : laneless.length ? 'flag' : 'clean',
    headline: ports.length === 0 ? 'no ports found' : `${ports.length - laneless.length}/${ports.length}`,
    detail:
      'Without a lane in the published contract, a consumer cannot tell a canonical component from an apocryphal one without reading English.',
  });

  checks.push({
    title: 'Cross-resource references resolve',
    state: 'unchecked',
    headline: 'not checked',
    detail:
      'Graph→component and app→graph references are not walked here, so nothing is asserted about them. Blank beats a green that was inferred.',
  });

  return checks;
}

function HygieneView({
  resources,
  onInspect,
}: {
  resources: Resource[];
  onInspect: (q: string, type?: string) => void;
}) {
  const checks = useMemo(() => buildChecks(resources), [resources]);
  const [open, setOpen] = useState<string | null>(null);
  const flags = checks.filter((c) => c.state === 'flag').length;
  const clean = checks.filter((c) => c.state === 'clean').length;
  const unchecked = checks.filter((c) => c.state === 'unchecked').length;

  const GLYPH = {
    clean: <span className="text-emerald-400">✓</span>,
    flag: <span className="text-amber-400">!</span>,
    unchecked: <span className="text-slate-500">?</span>,
  };

  return (
    <div className="flex-1 overflow-auto px-8 py-7">
      <div className="max-w-4xl">
        <div className="flex flex-wrap gap-8 pb-6 mb-2 border-b border-scc-border">
          <Stat n={clean} label="clean" tone="text-emerald-400" />
          <Stat n={flags} label="flagged" tone="text-amber-400" />
          <Stat n={unchecked} label="not checked" tone="text-slate-400" />
          <p className="text-slate-500 self-end max-w-md">
            Computed from the live catalog. A flag is an observation, not a verdict — and “not
            checked” is a result, not a pass.
          </p>
        </div>

        <ul className="divide-y divide-scc-border">
          {checks.map((c) => {
            const isOpen = open === c.title;
            return (
              <li key={c.title}>
                <button
                  onClick={() => setOpen(isOpen ? null : c.title)}
                  className="w-full text-left py-4 flex items-baseline gap-4 hover:bg-scc-elevated/40 px-2 -mx-2 rounded transition-colors"
                >
                  <span className="w-4 shrink-0 font-mono">{GLYPH[c.state]}</span>
                  <span className="flex-1 min-w-0 text-slate-200">{c.title}</span>
                  <span className="shrink-0 font-mono text-slate-400">{c.headline}</span>
                  <span className="shrink-0 w-4 text-slate-600">{isOpen ? '▾' : '▸'}</span>
                </button>
                {isOpen && (
                  <div className="pb-5 pl-8 pr-2">
                    <p className="text-slate-400 leading-relaxed max-w-2xl">{c.detail}</p>
                    {c.offenders && c.offenders.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {c.offenders.map((o) => (
                          <button
                            key={o.label}
                            onClick={() => onInspect(o.query, o.type)}
                            className="px-3 py-1.5 rounded-lg font-mono ring-1 ring-scc-border text-slate-300 hover:bg-scc-elevated hover:text-slate-100 transition-colors"
                            title="Open in Registry"
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div>
      <div className={`text-3xl font-semibold ${tone}`}>{n}</div>
      <div className="text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}
