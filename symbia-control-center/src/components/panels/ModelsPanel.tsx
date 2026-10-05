/**
 * Models panel.
 *
 * The models service is the platform's model orchestrator — selection,
 * application, management — and until 15 Aug 2026 it had no page: digests,
 * availability, and the pull path existed only as JSON. This panel is the
 * registry made visible, and it shows the epistemic fields FIRST, because
 * they are the point:
 *
 *   - the DIGEST is the model's identity (names are refs; the digest is the
 *     commit), shown short, copied whole on click;
 *   - AVAILABILITY is never inferred — `unknown` renders as unknown with its
 *     reason, not as a hopeful green;
 *   - a card/file DIGEST MISMATCH is a visible banner on the row, because a
 *     disclosure the console does not surface is not disclosed.
 *
 * The pull form hands the fetch to the platform (models → integrations →
 * egress → vault) and renders the receipt that comes back: digest, bytes,
 * and the signed registration event id. On failure it shows the failure —
 * an empty table meaning "the request failed" is the confident-zero defect
 * (see CatalogPanel's header), and a provenance console must not have one.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { getServiceUrl } from '@/config/services';

interface RegistryModel {
  id: string;
  owned_by: string;
  capabilities?: string[];
  context_length?: number;
  status?: string;
  symbia: {
    source: 'local' | 'remote';
    provider: string;
    brokered: boolean;
    availability: 'available' | 'standby' | 'unavailable' | 'unknown';
    availabilityReason: string;
    idSource?: string;
    verified?: boolean;
    digest?: string;
    digestMismatch?: { card: string; file: string };
  };
}

interface PullReceipt {
  id: string;
  digest: string;
  bytes: number;
  alreadyPresent?: boolean;
  registered?: { eventId: string; checksum: string; signed: boolean } | null;
}

// Four states, four colours. `standby` is not a failure — it is the
// resting state of a model on disk — so it must not wear the red one.
const AVAILABILITY_STYLE: Record<string, string> = {
  available: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  standby: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  unavailable: 'bg-red-500/15 text-red-300 ring-red-500/30',
  unknown: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
};

function ShortDigest({ digest }: { digest?: string }) {
  const [copied, setCopied] = useState(false);
  if (!digest) return <span className="text-slate-500">no digest</span>;
  const short = digest.replace(/^sha256:/, '').slice(0, 12);
  return (
    <button
      title={`${digest} — click to copy`}
      onClick={() => {
        void navigator.clipboard.writeText(digest);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="font-mono text-sm px-2 py-0.5 rounded bg-scc-elevated ring-1 ring-scc-border hover:ring-scc-primary transition-colors"
    >
      {copied ? 'copied' : `sha256:${short}…`}
    </button>
  );
}

export function ModelsPanel() {
  const token = useAuthStore((s) => s.token);
  const [models, setModels] = useState<RegistryModel[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [repo, setRepo] = useState('Qwen/Qwen2.5-0.5B-Instruct-GGUF');
  const [file, setFile] = useState('qwen2.5-0.5b-instruct-q4_k_m.gguf');
  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<PullReceipt | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(`${getServiceUrl('models')}/api/models`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error(`models service returned ${res.status}`);
      const body = (await res.json()) as { data: RegistryModel[] };
      setModels(body.data);
    } catch (err) {
      // The failure is the content. models === null renders as "could not
      // ask", never as an empty registry.
      setModels(null);
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pull = useCallback(async () => {
    setPulling(true);
    setPullError(null);
    setReceipt(null);
    try {
      const res = await fetch(`${getServiceUrl('models')}/api/models/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ repo: repo.trim(), file: file.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? `pull returned ${res.status}`);
      setReceipt(body as PullReceipt);
      await refresh();
    } catch (err) {
      setPullError(err instanceof Error ? err.message : String(err));
    } finally {
      setPulling(false);
    }
  }, [repo, file, token, refresh]);

  const locals = models?.filter((m) => m.symbia.source === 'local') ?? [];
  const remotes = models?.filter((m) => m.symbia.source === 'remote') ?? [];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <header className="shrink-0 px-8 pt-6 pb-4 border-b border-scc-border bg-scc-surface">
        <h1 className="text-2xl font-semibold text-slate-100">Models</h1>
        <p className="text-slate-400 mt-1">
          The registry, by digest. Listing is not offering: <code className="text-slate-300">brokered</code> says
          what this platform can execute, and availability is measured, never assumed.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8">
        {/* Pull — acquisition through the platform */}
        <section className="rounded-xl ring-1 ring-scc-border bg-scc-elevated p-5">
          <h2 className="text-lg font-medium text-slate-200">Pull weights</h2>
          <p className="text-slate-400 mt-1 mb-4">
            models decides what; integrations opens the socket and holds any credential; the bytes are
            digested in the stream and registered as a signed event in the ledger beside the weights.
          </p>
          <div className="flex flex-wrap gap-3 items-end">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-slate-400">HuggingFace repo</span>
              <input
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                className="w-80 px-3 py-2 rounded-lg bg-scc-surface ring-1 ring-scc-border focus:ring-scc-primary outline-none text-slate-100"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-slate-400">GGUF file</span>
              <input
                value={file}
                onChange={(e) => setFile(e.target.value)}
                className="w-96 px-3 py-2 rounded-lg bg-scc-surface ring-1 ring-scc-border focus:ring-scc-primary outline-none text-slate-100 font-mono text-sm"
              />
            </label>
            <button
              onClick={() => void pull()}
              disabled={pulling || !repo.trim() || !file.trim()}
              className="px-4 py-2 rounded-lg bg-scc-primary/20 ring-1 ring-scc-primary text-scc-primary hover:bg-scc-primary/30 disabled:opacity-40 transition-colors"
            >
              {pulling ? 'Pulling… (streams and hashes, can take a while)' : 'Pull'}
            </button>
          </div>

          {pullError && (
            <div className="mt-4 px-4 py-3 rounded-lg bg-red-500/10 ring-1 ring-red-500/30 text-red-300">
              {pullError}
            </div>
          )}
          {receipt && (
            <div className="mt-4 px-4 py-3 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/30 text-emerald-200 space-y-1">
              <div>
                {receipt.alreadyPresent ? 'Already present' : 'Pulled'} — <ShortDigest digest={receipt.digest} />
                {typeof receipt.bytes === 'number' && (
                  <span className="text-emerald-300/80"> · {(receipt.bytes / 1e6).toFixed(0)} MB</span>
                )}
              </div>
              {receipt.registered ? (
                <div className="text-sm text-emerald-300/80">
                  registration event <code>{receipt.registered.eventId.slice(0, 8)}…</code>
                  {receipt.registered.signed ? ' · signed' : ' · UNSIGNED'}
                </div>
              ) : receipt.alreadyPresent ? null : (
                <div className="text-sm text-amber-300">no registration event — service identity unavailable</div>
              )}
            </div>
          )}
        </section>

        {/* Load failure is content */}
        {loadError && (
          <div className="px-4 py-3 rounded-lg bg-red-500/10 ring-1 ring-red-500/30 text-red-300">
            Could not read the registry: {loadError}. This page does not render an empty list it cannot
            stand behind.
          </div>
        )}

        {models && (
          <>
            <ModelTable title={`Local (${locals.length})`} models={locals} />
            <ModelTable title={`Remote (${remotes.length})`} models={remotes} />
          </>
        )}
      </div>
    </div>
  );
}

function ModelTable({ title, models }: { title: string; models: RegistryModel[] }) {
  if (models.length === 0) return null;
  return (
    <section>
      <h2 className="text-lg font-medium text-slate-200 mb-3">{title}</h2>
      <div className="rounded-xl ring-1 ring-scc-border overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-scc-elevated text-slate-400 text-sm">
            <tr>
              <th className="px-4 py-2 font-medium">id</th>
              <th className="px-4 py-2 font-medium">provider</th>
              <th className="px-4 py-2 font-medium">digest</th>
              <th className="px-4 py-2 font-medium">availability</th>
              <th className="px-4 py-2 font-medium">brokered</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-scc-border">
            {models.map((m) => (
              <>
                <tr key={m.id} className="bg-scc-surface hover:bg-scc-elevated/60 transition-colors">
                  <td className="px-4 py-2 text-slate-100">{m.id}</td>
                  <td className="px-4 py-2 text-slate-300">{m.symbia.provider}</td>
                  <td className="px-4 py-2">
                    <ShortDigest digest={m.symbia.digest} />
                  </td>
                  <td className="px-4 py-2">
                    <span
                      title={m.symbia.availabilityReason}
                      className={`px-2 py-0.5 rounded-full text-sm ring-1 ${AVAILABILITY_STYLE[m.symbia.availability] ?? AVAILABILITY_STYLE.unknown}`}
                    >
                      {m.symbia.availability}
                    </span>
                    <span className="ml-2 text-sm text-slate-500">{m.symbia.availabilityReason}</span>
                  </td>
                  <td className="px-4 py-2 text-slate-300">{m.symbia.brokered ? 'yes' : 'no'}</td>
                </tr>
                {m.symbia.digestMismatch && (
                  <tr key={`${m.id}-mismatch`} className="bg-red-500/10">
                    <td colSpan={5} className="px-4 py-2 text-red-300 text-sm">
                      DIGEST MISMATCH — the catalog card claims{' '}
                      <code>{m.symbia.digestMismatch.card.slice(0, 26)}…</code> but the loaded file is{' '}
                      <code>{m.symbia.digestMismatch.file.slice(0, 26)}…</code>. Loaded anyway, by the
                      disclose-now ruling; this row is the disclosure.
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
