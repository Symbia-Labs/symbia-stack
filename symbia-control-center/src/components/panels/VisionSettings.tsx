/**
 * Which model looks at captured frames — configured here, on the Integrations
 * panel, because this is where providers live.
 *
 * It shows every provider that offers a vision-capable model AND whether that
 * provider currently has a working credential, because those are different
 * facts and conflating them is what sent the first version of this feature to
 * OpenAI — ten vision models, no key, first in the list.
 *
 * A provider with models but no credential is shown, greyed, with the reason.
 * Hiding it would answer "why isn't HuggingFace here?" with silence; showing it
 * as selectable would answer a click with an error. Neither is as useful as
 * saying what is missing.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  fetchCapabilities,
  visionOptions,
  type CapabilityModel,
} from '@/components/glass/capabilities';
import { useVisionConfig } from '@/components/glass/visionConfig';

interface Row {
  provider: string;
  available: boolean;
  models: CapabilityModel[];
}

export function VisionSettings() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selection = useVisionConfig((s) => s.selection);
  const choose = useVisionConfig((s) => s.choose);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(visionOptions(await fetchCapabilities()));
    } catch (e) {
      // Blank beats green. A failed lookup is reported as a failed lookup, not
      // rendered as an empty list that reads as "no providers do vision".
      setRows(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const usable = rows?.filter((r) => r.available && r.models.length > 0) ?? [];
  const autoPick = usable[0];

  return (
    <section className="rounded-[14px] border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[16px] text-white/85">Vision</h3>
        <button
          onClick={() => void load()}
          className="text-[13px] text-white/40 hover:text-white/80"
        >
          refresh
        </button>
      </div>
      <p className="mt-1 text-[14px] text-white/45 leading-snug">
        The model the spyglass sends captured frames to. Requests go through the
        integrations gateway like any other model call.
      </p>

      {error && (
        <p className="mt-3 text-[14px] text-amber-300/80">
          Could not read provider capabilities: {error}
        </p>
      )}

      {rows === null && !error && (
        <p className="mt-3 text-[14px] text-white/40">Not checked yet.</p>
      )}

      {rows && (
        <div className="mt-3 space-y-2">
          {/* Automatic */}
          <label className="flex items-start gap-3 rounded-[10px] border border-white/10 p-3 cursor-pointer hover:bg-white/[0.03]">
            <input
              type="radio"
              name="vision-model"
              className="mt-1"
              checked={selection === null}
              onChange={() => choose(null)}
            />
            <span className="min-w-0">
              <span className="block text-[15px] text-white/80">Automatic</span>
              <span className="block text-[13px] text-white/40">
                {autoPick
                  ? `First available provider with a vision model — currently ${autoPick.provider} · ${autoPick.models[0]?.id}`
                  : 'No provider currently has both a credential and a vision model.'}
              </span>
            </span>
          </label>

          {rows
            .filter((r) => r.models.length > 0)
            .map((r) => (
              <div key={r.provider} className="rounded-[10px] border border-white/10 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] text-white/80">{r.provider}</span>
                  {r.available ? (
                    <span className="text-[12px] text-emerald-300/70">credential resolved</span>
                  ) : (
                    <span className="text-[12px] text-amber-300/70">
                      no credential — add an API key to use this provider
                    </span>
                  )}
                  <span className="ml-auto text-[12px] text-white/30">
                    {r.models.length} vision {r.models.length === 1 ? 'model' : 'models'}
                  </span>
                </div>

                <div className="mt-2 space-y-1">
                  {r.models.map((m) => {
                    const active =
                      selection?.provider === r.provider && selection?.model === m.id;
                    return (
                      <label
                        key={m.id}
                        className={`flex items-center gap-3 rounded-[8px] px-2 py-1.5 ${
                          r.available ? 'cursor-pointer hover:bg-white/[0.04]' : 'opacity-40'
                        }`}
                      >
                        <input
                          type="radio"
                          name="vision-model"
                          disabled={!r.available}
                          checked={active}
                          onChange={() => choose({ provider: r.provider, model: m.id })}
                        />
                        <span className="text-[14px] text-white/70 truncate">{m.id}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}

          {rows.every((r) => r.models.length === 0) && (
            <p className="text-[14px] text-white/40">
              No registered provider offers a model declaring the vision capability.
            </p>
          )}
        </div>
      )}

      {/* The stopgap, stated. See F5 in
          docs/2026-08-07-spyglass-vision-via-integrations.md. */}
      <p className="mt-3 text-[13px] text-white/30 leading-snug">
        Stored in this browser only. The platform has no operator-preference
        store yet, so this choice does not travel between machines or users.
      </p>
    </section>
  );
}
