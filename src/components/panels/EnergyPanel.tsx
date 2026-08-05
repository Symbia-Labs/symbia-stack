/**
 * Symbia Energy — Board
 *
 * SYMBIA_MARKER_ENERGY_BOARD_20260805
 *
 * The design rule for this panel, and the reason it exists:
 * NO TILE RENDERS A NUMBER IT DID NOT FETCH, and no tile renders a number
 * whose inputs it cannot name. Every value carries a provenance chip showing
 * method, quality and age. When a derived value cannot be computed it says
 * UNCOMPUTABLE and names the input that failed — it does not estimate, hold
 * the last value over, or show zero.
 *
 * That is the whole product argument, on one screen. A dead meter reporting
 * 0 kW makes PUE look excellent; every conventional trend draws that as an
 * improvement. This one refuses.
 */
import { useEffect, useState, useCallback } from 'react';

const ENERGY = '/svc/energy';
const POLL_MS = 2000;

type Reading = {
  point?: string; value: number | string | null; unit?: string; ts?: string;
  method?: string; lane?: string; quality?: string; age_s?: number | null;
  uncomputable_reason?: string | null;
};
type Derived = Reading & {
  port?: 'value' | 'incomplete' | 'undefined';
  expression?: string; inputs?: { point: string; value: unknown; ts: string; quality: string }[];
  input_count?: number; exact?: boolean; inputs_verified?: boolean;
  degraded?: string[]; missing?: string[]; have?: number; expected?: number;
  pct_used?: number | null; redundancy?: string | null; members?: string;
  window_s?: number;
  /** Set when an independent check contradicts this point. A meter can be
   *  alive, fresh and wrong; freshness cannot detect bias. */
  disputed_by?: string; disputed_reason?: string | null;
};
type Balance = {
  status: 'ok' | 'breach' | 'unknown'; parent?: number; branch_sum?: number;
  residual_pct?: number | null; tolerance_pct?: number; branches?: number;
  reason?: string | null;
};
type Board = {
  site: string; served_at: string; points_known: number; points_reporting: number;
  sim_state: { value: string; ts: string | null };
  unmapped_points: string[];
  sink: { kind: string; lines_written?: number; mb_written?: number; dir?: string };
  tiles: Record<string, Derived | null>;
  balance: { it: Balance; mech: Balance };
  redundancy: { chillers: { available: number; total: number; rule: string; degraded: boolean } };
};

function qualityColor(q?: string) {
  switch (q) {
    case 'good': return 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10';
    case 'stale': return 'text-amber-400 border-amber-400/40 bg-amber-400/10';
    case 'uncertain': return 'text-amber-400 border-amber-400/40 bg-amber-400/10';
    case 'missing': return 'text-red-400 border-red-400/40 bg-red-400/10';
    case 'override': return 'text-violet-400 border-violet-400/40 bg-violet-400/10';
    default: return 'text-slate-400 border-slate-600 bg-slate-700/40';
  }
}

/** The provenance chip. Present on every number, without exception. */
function Chip({ r }: { r?: Reading | Derived | null }) {
  if (!r) return null;
  const method = r.method ?? 'measured';
  const d = r as Derived;

  // SYMBIA_MARKER_CHIP_NO_ASSUMED_GOOD_20260805
  // This line used to read: r.quality ?? (method === 'computed' ? 'good' : undefined)
  // — i.e. it ASSUMED a computed value was good whenever it carried no quality
  // of its own. Caught live on the pod-partition scenario: 40 rack meters had
  // gone silent and aged to `stale`, the service correctly reported
  // inputs_verified:false with 40 degraded inputs, and the tile rendered a
  // green `good` chip over a number built from stale data.
  //
  // Assuming good in the absence of information is the exact defect fixed in
  // the main dashboard this morning, rewritten into a new panel within the
  // hour. A computed value is only as good as its worst input.
  const q = r.quality ?? (
    method === 'computed'
      ? (d.inputs_verified === false ? 'stale' : d.inputs_verified ? 'good' : undefined)
      : undefined);
  const degradedCount = d.degraded?.length ?? 0;
  const apocryphal = r.lane === 'apocryphal';
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      <span className={`text-[13px] px-2 py-0.5 rounded border ${qualityColor(q)}`}>
        {q ?? 'unknown'}
      </span>
      <span className="text-[13px] px-2 py-0.5 rounded border border-slate-600 text-slate-300">
        {method}
      </span>
      {apocryphal && (
        <span className="text-[13px] px-2 py-0.5 rounded border border-violet-400/40 text-violet-300">
          apocryphal
        </span>
      )}
      {typeof r.age_s === 'number' && (
        <span className="text-[13px] text-slate-400">{r.age_s.toFixed(1)}s old</span>
      )}
      {degradedCount > 0 && (
        <span
          className="text-[13px] px-2 py-0.5 rounded border border-amber-400/50 text-amber-400"
          title={d.degraded!.slice(0, 8).join(', ')}
        >
          {degradedCount} degraded {degradedCount === 1 ? 'input' : 'inputs'}
        </span>
      )}
      {(r as Derived).disputed_by && (
        <span
          className="text-[13px] px-2 py-0.5 rounded border border-red-400/50 text-red-400"
          title={(r as Derived).disputed_reason ?? ''}
        >
          disputed
        </span>
      )}
    </div>
  );
}

function Tile({
  label, r, unit, format, big,
}: {
  label: string; r?: Derived | null; unit?: string;
  format?: (v: number) => string; big?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const refused = r && (r.port === 'undefined' || r.port === 'incomplete');
  const noData = !r || (r.value === null && !refused);
  const reason = r?.uncomputable_reason;

  return (
    <div className={`scc-card p-4 border ${
      refused ? 'border-amber-400/50' : 'border-scc-border'}`}>
      <p className="text-[13px] text-slate-400 uppercase tracking-wider">{label}</p>

      {refused || noData ? (
        <>
          <p className={`${big ? 'text-3xl' : 'text-2xl'} font-bold text-amber-400 mt-1`}>
            {refused ? 'UNCOMPUTABLE' : '—'}
          </p>
          {reason && (
            <p className="text-[14px] text-amber-300/90 mt-2 leading-snug">{reason}</p>
          )}
          {r?.missing && r.missing.length > 0 && (
            <p className="text-[13px] text-slate-400 mt-1">
              {r.have}/{r.expected} inputs present
            </p>
          )}
        </>
      ) : (
        <>
          <p className={`${big ? 'text-4xl' : 'text-2xl'} font-bold text-scc-primary mt-1`}>
            {typeof r!.value === 'number'
              ? (format ? format(r!.value as number) : (r!.value as number).toLocaleString())
              : String(r!.value)}
            {unit && <span className="text-base text-slate-400 ml-1.5">{unit}</span>}
          </p>
          {r?.expression && (
            <button
              onClick={() => setOpen((o) => !o)}
              className="text-[14px] text-scc-primary mt-2 hover:underline"
            >
              {open ? 'hide the receipt' : 'the receipt →'}
            </button>
          )}
        </>
      )}

      <Chip r={r} />

      {open && r?.expression && (
        <div className="mt-3 pt-3 border-t border-slate-700 text-[14px]">
          <p className="text-slate-300 font-mono break-all">{r.expression}</p>
          {r.inputs && (
            <div className="mt-2 space-y-1">
              {r.inputs.map((i) => (
                <div key={i.point} className="flex justify-between gap-3 text-slate-400">
                  <span className="font-mono truncate">{i.point}</span>
                  <span className="shrink-0">
                    {String(i.value)}{' '}
                    <span className={qualityColor(i.quality).split(' ')[0]}>
                      {i.quality}
                    </span>
                  </span>
                </div>
              ))}
              {r.input_count && r.input_count > (r.inputs?.length ?? 0) && (
                <p className="text-slate-500">
                  …and {r.input_count - r.inputs.length} more inputs
                </p>
              )}
            </div>
          )}
          <p className="text-slate-500 mt-2">
            exact: {String(r.exact)} · inputs verified: {String(r.inputs_verified)}
          </p>
        </div>
      )}
    </div>
  );
}

function BalanceCard({ title, b, note }: { title: string; b: Balance; note: string }) {
  const color = b.status === 'ok' ? 'border-emerald-400/40'
    : b.status === 'breach' ? 'border-red-400/50' : 'border-slate-600';
  return (
    <div className={`scc-card p-4 border ${color}`}>
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-slate-400 uppercase tracking-wider">{title}</p>
        <span className={`text-[13px] px-2 py-0.5 rounded border ${
          b.status === 'ok' ? qualityColor('good')
            : b.status === 'breach' ? qualityColor('missing') : qualityColor(undefined)}`}>
          {b.status}
        </span>
      </div>
      {b.status !== 'unknown' && (
        <p className="text-[15px] text-slate-300 mt-2">
          parent <span className="font-mono">{b.parent?.toLocaleString()}</span> kW ·
          branches <span className="font-mono">{b.branch_sum?.toLocaleString()}</span> kW
          {b.residual_pct !== null && b.residual_pct !== undefined && (
            <> · residual <span className={Math.abs(b.residual_pct) > (b.tolerance_pct ?? 2)
              ? 'text-red-400' : 'text-emerald-400'}>{b.residual_pct}%</span></>
          )}
        </p>
      )}
      {b.reason && <p className="text-[14px] text-red-300/90 mt-2 leading-snug">{b.reason}</p>}
      <p className="text-[13px] text-slate-500 mt-2 leading-snug">{note}</p>
    </div>
  );
}

export function EnergyPanel() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${ENERGY}/api/energy/board`);
      if (!res.ok) throw new Error(`energy service returned ${res.status}`);
      setBoard(await res.json());
      setError(null);
    } catch (e) {
      // Never leave the previous board on screen pretending to be current.
      setError(e instanceof Error ? e.message : 'energy service unreachable');
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  if (error && !board) {
    return (
      <div className="p-6">
        <div className="scc-card p-4 border border-amber-400/50">
          <p className="text-[15px] text-amber-400">Energy service: {error}</p>
          <p className="text-[14px] text-slate-400 mt-2">
            Start it with{' '}
            <code className="font-mono">python3 ~/symbia-stack/energy/service/server.py</code>{' '}
            and the simulator with{' '}
            <code className="font-mono">python3 ~/symbia-stack/energy/sim/site_sim.py</code>.
          </p>
          <button onClick={load} className="text-[14px] text-scc-primary mt-3 hover:underline">
            retry
          </button>
        </div>
      </div>
    );
  }
  if (!board) return <div className="p-6 text-slate-400 text-[15px]">Loading…</div>;

  const t = board.tiles;
  const stale = error !== null;

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 p-6 border-b border-scc-border">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">Energy — {board.site}</h1>
            <p className="text-[15px] text-slate-400 mt-1">
              Every number shows where it came from. Anything that can&apos;t is refused.
            </p>
          </div>
          <div className="text-right text-[13px] text-slate-400">
            <div>
              feed:{' '}
              <span className={board.sim_state.value === 'ONLINE'
                ? 'text-emerald-400' : 'text-red-400'}>
                {board.sim_state.value}
              </span>
            </div>
            <div>{board.points_reporting}/{board.points_known} points reporting</div>
            <div>sink: {board.sink.kind} · {board.sink.lines_written?.toLocaleString()} rows</div>
            {stale && <div className="text-amber-400">refresh failed — values may be stale</div>}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Tile label="PUE" r={t.pue} big format={(v) => v.toFixed(4)} />
          <Tile label="IT load" r={t.it_load} unit="kW" format={(v) => v.toLocaleString()} />
          <Tile label="Utility" r={t.utility} unit="kW" format={(v) => v.toLocaleString()} />
          <Tile label="Mechanical" r={t.mech_total} unit="kW" format={(v) => v.toLocaleString()} />
        </div>

        <h2 className="text-[13px] font-medium text-slate-400 uppercase tracking-wider mb-3">
          Rollups &amp; capacity
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Tile label="Rack rollup" r={t.rack_rollup} unit="kW" format={(v) => v.toLocaleString()} />
          <Tile label="Mech rollup" r={t.mech_rollup} unit="kW" format={(v) => v.toLocaleString()} />
          <Tile label="Utility headroom" r={t.headroom} unit="kW" format={(v) => v.toLocaleString()} />
          <Tile label="IT load rate" r={t.dpdt} unit="kW/s" format={(v) => v.toFixed(2)} />
        </div>

        <h2 className="text-[13px] font-medium text-slate-400 uppercase tracking-wider mb-3">
          Energy balance — the independent check
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          <BalanceCard
            title="IT: racks vs IT main" b={board.balance.it}
            note="No quality code catches a meter that is alive, fresh and biased. Only this does — it reconciles 160 rack meters against the separately-metered IT main."
          />
          <BalanceCard
            title="Mechanical: branches vs total" b={board.balance.mech}
            note="Chillers, CDUs, CRAH and dry cooler summed against the mechanical total meter."
          />
        </div>

        {board.unmapped_points.length > 0 && (
          <div className="scc-card p-4 border border-amber-400/40">
            <p className="text-[15px] text-amber-400">
              {board.unmapped_points.length} unmapped points arriving
            </p>
            <p className="text-[14px] text-slate-400 mt-1">
              A point nobody modelled is a finding, not noise. Silent discard is how site
              models rot.
            </p>
            <p className="text-[13px] font-mono text-slate-500 mt-2">
              {board.unmapped_points.slice(0, 6).join(', ')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
