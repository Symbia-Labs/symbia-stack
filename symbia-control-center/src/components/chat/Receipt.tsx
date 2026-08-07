/**
 * The arena badge and its receipt.
 *
 * Every assistant reply now arrives with a sealed provenance envelope in
 * message metadata (see assistants/server/src/engine/provenance.ts). Until
 * this component existed, none of it was visible: the console rendered "42"
 * and "Why don't scientists trust atoms?" identically, and the platform's
 * central claim — that an answer shows where it came from — was true in the
 * data and invisible to the person reading it.
 *
 * The colours are load-bearing, not decorative. They rank how much an answer
 * stands on, and GENERATED is deliberately the one that looks like a warning,
 * because an answer resting on nothing but model weights is the one a reader
 * most needs to treat differently.
 */
import { useState } from 'react';

export interface ProvenanceStep {
  id: string;
  action: string;
  source: string;
  ok: boolean;
  ms?: number;
  outputDigest?: string;
  error?: string;
}

export interface Provenance {
  arena: 'COMPUTED' | 'RETRIEVED' | 'COMPOSED' | 'GENERATED' | 'REFUSED';
  basis: string;
  steps: ProvenanceStep[];
  rule?: string;
  assistant?: string;
  runId?: string;
  causedBy?: string;
  timestamp: string;
  hash: string | null;
}

const ARENA: Record<
  Provenance['arena'],
  { label: string; badge: string; dot: string; blurb: string }
> = {
  COMPUTED: {
    label: 'Computed',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    dot: 'bg-emerald-400',
    blurb: 'Deterministic. Reproducible. No model was involved.',
  },
  RETRIEVED: {
    label: 'Retrieved',
    badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    dot: 'bg-sky-400',
    blurb: 'Returned verbatim from a named source.',
  },
  COMPOSED: {
    label: 'Composed',
    badge: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    dot: 'bg-violet-400',
    blurb:
      'A model wrote this over material that was supplied to it. The material is recorded; whether the model represented it faithfully is NOT checked.',
  },
  GENERATED: {
    label: 'Generated',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/35',
    dot: 'bg-amber-400',
    blurb:
      'A model answered from its own weights. Nothing was supplied and nothing was verified. This answer stands on no source.',
  },
  REFUSED: {
    label: 'Refused',
    badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    dot: 'bg-rose-400',
    blurb: 'The system declined rather than guess.',
  },
};

function StepRow({ step }: { step: ProvenanceStep }) {
  return (
    <li className="flex items-start gap-2 py-1.5">
      <span
        className={`mt-[6px] w-1.5 h-1.5 rounded-full shrink-0 ${
          step.ok ? 'bg-emerald-400' : 'bg-rose-400'
        }`}
        aria-hidden
      />
      <div className="min-w-0">
        <div className="text-[15px] text-white/85 break-words">{step.source}</div>
        <div className="text-[13px] text-white/40">
          {step.action}
          {typeof step.ms === 'number' && ` · ${step.ms}ms`}
          {/* A digest, not the output. A receipt should not become a second
              copy of the data it describes. */}
          {step.outputDigest && ` · ${step.outputDigest}`}
        </div>
        {step.error && (
          <div className="text-[13px] text-rose-300/90 break-words">{step.error}</div>
        )}
      </div>
    </li>
  );
}

export function Receipt({ provenance }: { provenance: Provenance }) {
  const [open, setOpen] = useState(false);
  const a = ARENA[provenance.arena] ?? ARENA.GENERATED;

  return (
    <div className="mt-1.5">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full border text-[13px] ${a.badge} hover:brightness-125 transition`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${a.dot}`} aria-hidden />
        {a.label}
        {provenance.steps.length > 0 && (
          <span className="opacity-60">· {provenance.steps.length}</span>
        )}
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={`opacity-70 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="mt-2 rounded-[14px] border border-white/12 bg-black/40 p-3">
          <p className="text-[14px] text-white/70 leading-snug">{a.blurb}</p>

          {provenance.basis && (
            <p className="mt-2 text-[14px] text-white/55 leading-snug break-words">
              {provenance.basis}
            </p>
          )}

          {provenance.steps.length > 0 && (
            <>
              <div className="mt-3 text-[12px] uppercase tracking-wider text-white/35">
                What it stood on
              </div>
              <ul className="mt-0.5 divide-y divide-white/8">
                {provenance.steps.map((s, i) => (
                  <StepRow key={`${s.id}-${i}`} step={s} />
                ))}
              </ul>
            </>
          )}

          <div className="mt-3 pt-2 border-t border-white/8 space-y-0.5">
            {provenance.rule && (
              <div className="text-[13px] text-white/40">rule · {provenance.rule}</div>
            )}
            {/*
              A missing hash is shown as missing, not hidden. An unsealed
              envelope and a sealed one must not look the same — that is the
              confident-zero failure this whole mechanism exists to prevent.
            */}
            <div className="text-[13px] text-white/40 break-all">
              {provenance.hash ? (
                <>seal · {provenance.hash.slice(0, 32)}…</>
              ) : (
                <span className="text-amber-300/80">unsealed — no hash on this reply</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
