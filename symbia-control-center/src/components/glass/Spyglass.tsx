/**
 * The spyglass — a small window showing another tab, another application, or
 * another screen, live, while you work in this one.
 *
 * Deliberately independent of the chat window: its own position, its own
 * lifetime, and it knows nothing about chat. It is an instrument, and
 * instruments should be movable to whatever you want to look at.
 *
 * IT NO LONGER CAPTURES THIS TAB. That mode was the source of every problem it
 * had, 6–7 Aug 2026:
 *
 *   - a magnifier over its own page cannot show what is beneath it, because
 *     what is beneath it is the magnifier. Sampling a square beside itself was
 *     the workaround, and the crop maths for that was wrong twice.
 *   - the outline marking that square was drawn ON the square, so the lens
 *     magnified its own marker.
 *   - Chrome announces a self-capture from both ends, so the page carried two
 *     "is sharing" bars and looked like it had leaked a stream. It had not,
 *     but I diagnosed it as a leak, which is its own lesson.
 *
 * None of those were bugs in the shape. They were all consequences of pointing
 * an instrument at itself. Removing the mode removes the whole class, and what
 * is left has no interesting geometry at all: whatever you picked, fitted into
 * a rectangle, at the source's own aspect ratio.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { connectSpyglassNode, publishFrame, classifyFrame } from './spyglassNode';

type GlassState = 'idle' | 'requesting' | 'live' | 'denied' | 'unsupported' | 'self';
type Surface = 'browser' | 'window' | 'monitor' | 'unknown';

const STORE = 'symbia:spyglass';
/** One width. Height follows the source, so the panel is never letterboxed. */
const W = 360;
const FALLBACK_H = 220;

interface Pos {
  x: number;
  y: number;
}

function load(): Pos {
  const fallback: Pos = { x: 80, y: 120 };
  try {
    const raw = localStorage.getItem(`${STORE}:pos`);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Is this stream a picture of the page requesting it?
 *
 * getDisplayMedia will happily hand back the current tab if that is what was
 * picked in the chooser, and nothing about the returned stream says "this is
 * you" — displaySurface only says 'browser', which is also true of every OTHER
 * tab. The browsingContextId in getSettings is the identifying part where it
 * exists; where it does not, this returns false and the operator gets the
 * feedback rather than the explanation. Detecting it wrongly in the safe
 * direction is preferable to refusing a legitimate capture of another tab.
 */
function isSelfCapture(track: MediaStreamTrack | undefined): boolean {
  const s = track?.getSettings() as
    | { displaySurface?: string; browsingContextId?: unknown }
    | undefined;
  if (!s || s.displaySurface !== 'browser') return false;
  // Chromium exposes the captured context's id here. Comparing it to nothing
  // would be a guess, so this only fires when the browser volunteers that the
  // captured context is the one doing the capturing.
  const self = (window as unknown as { browsingContextId?: unknown }).browsingContextId;
  return s.browsingContextId !== undefined && self !== undefined && s.browsingContextId === self;
}

export function Spyglass({ open, onClose }: { open: boolean; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const [pos, setPos] = useState<Pos>(() =>
    typeof window === 'undefined' ? { x: 80, y: 120 } : load()
  );
  const [surface, setSurface] = useState<Surface>('unknown');
  const [grab, setGrab] = useState<{ busy: boolean; verdict?: string; digest?: string }>({
    busy: false,
  });
  /** Actual captured frame size. Measured from the video, never assumed. */
  const [dims, setDims] = useState<{ vw: number; vh: number } | null>(null);
  const [state, setState] = useState<GlassState>(() =>
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function'
      ? 'idle'
      : 'unsupported'
  );

  const drag = useRef<{ dx: number; dy: number } | null>(null);

  // The panel takes the source's shape. Fitting a 16:9 desktop into a fixed
  // box would either letterbox it or crop it, and a cropped picture that does
  // not say it is cropped is a small lie about what you are looking at.
  const height = dims ? Math.round((W * dims.vh) / dims.vw) : FALLBACK_H;

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setDims(null);
  }, []);

  const start = useCallback(async () => {
    // Release the previous capture FIRST, so changing source cannot leave an
    // orphaned stream running that this UI has no way to stop.
    stop();
    setState('requesting');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });
      const track = stream.getVideoTracks()[0];

      if (isSelfCapture(track)) {
        stream.getTracks().forEach((t) => t.stop());
        setState('self');
        return;
      }

      streamRef.current = stream;
      const s = (track?.getSettings() as { displaySurface?: string } | undefined)?.displaySurface;
      setSurface(s === 'browser' || s === 'window' || s === 'monitor' ? (s as Surface) : 'unknown');
      // Chrome's own Stop Sharing button ends the track without telling this
      // component. Without this the panel would sit on its last frame looking
      // live.
      track?.addEventListener('ended', () => {
        stop();
        setState('idle');
      });
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play();
      }
      setState('live');
      // Join the mesh only once there is something to capture. Registering a
      // node that cannot do its job would put a lie in the topology.
      void connectSpyglassNode();
    } catch {
      setState('denied');
    }
  }, [stop]);

  useEffect(() => () => stop(), [stop]);

  // Closing releases the capture. A closed panel that is still capturing is a
  // camera the operator believes is off.
  useEffect(() => {
    if (!open && streamRef.current) {
      stop();
      setState('idle');
    }
  }, [open, stop]);

  // Drag.
  useEffect(() => {
    if (!open) return;
    const move = (e: PointerEvent) => {
      if (!drag.current) return;
      setPos({
        x: Math.min(Math.max(-W + 80, e.clientX - drag.current.dx), window.innerWidth - 80),
        y: Math.min(Math.max(0, e.clientY - drag.current.dy), window.innerHeight - 60),
      });
    };
    const up = () => {
      if (!drag.current) return;
      drag.current = null;
      setPos((p) => {
        try {
          localStorage.setItem(`${STORE}:pos`, JSON.stringify(p));
        } catch {
          /* storage disabled — it still works, it just forgets */
        }
        return p;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [open]);

  // Draw loop. The whole frame, one to one into a panel of the same shape —
  // no crop, no offset, no scale factors to get wrong.
  useEffect(() => {
    if (state !== 'live' || !open) return;
    const draw = () => {
      const v = videoRef.current;
      const c = canvasRef.current;
      const ctx = c?.getContext('2d');
      if (v && c && ctx && v.videoWidth) {
        setDims((d) =>
          d && d.vw === v.videoWidth && d.vh === v.videoHeight
            ? d
            : { vw: v.videoWidth, vh: v.videoHeight }
        );
        ctx.drawImage(v, 0, 0, c.width, c.height);
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [state, open]);

  /**
   * Grab the current frame, publish it on the bus, and ask the models service
   * what it is. Whatever comes back is shown VERBATIM — including a refusal,
   * which is the current expected answer since no vision model is loaded.
   */
  const grabFrame = useCallback(async () => {
    const c = canvasRef.current;
    if (!c || state !== 'live') return;
    setGrab({ busy: true });
    try {
      const b64 = c.toDataURL('image/png').split(',')[1] ?? '';
      const env = await publishFrame(b64, { width: c.width, height: c.height, source: surface });
      const r = (await classifyFrame(b64, env)) as {
        ok?: boolean;
        description?: string;
        reason?: string;
        missing?: string[];
      };
      setGrab({
        busy: false,
        digest: env.digest,
        verdict: r.ok
          ? r.description
          : `${r.reason ?? 'refused'}${r.missing?.length ? ` (${r.missing[0]})` : ''}`,
      });
    } catch (e) {
      setGrab({ busy: false, verdict: e instanceof Error ? e.message : 'grab failed' });
    }
  }, [state, surface]);

  if (!open) return null;
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;

  const label =
    surface === 'monitor' ? 'screen' : surface === 'window' ? 'window' : surface === 'browser' ? 'tab' : 'source';

  const node = (
    <div
      className="fixed z-[10000] rounded-[14px] overflow-hidden border border-white/20 bg-black/85 shadow-[0_8px_40px_rgba(0,0,0,0.6)] backdrop-blur"
      style={{ left: pos.x, top: pos.y, width: W }}
    >
      <video ref={videoRef} className="hidden" muted playsInline />

      {/* Title bar — the drag handle, and the only chrome there is. */}
      <div
        onPointerDown={(e) => {
          drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        className="flex items-center gap-2 px-3 py-1.5 cursor-grab active:cursor-grabbing select-none border-b border-white/10"
      >
        <span className="text-[13px] text-white/70">Spyglass</span>
        {state === 'live' && <span className="text-[12px] text-white/35">{label}</span>}
        <div className="ml-auto flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
          {state === 'live' && (
            <button
              onClick={start}
              title="Change source"
              className="px-1.5 py-0.5 rounded text-[13px] text-white/50 hover:text-white hover:bg-white/10"
            >
              ⇄
            </button>
          )}
          {state === 'live' && (
            <button
              onClick={grabFrame}
              disabled={grab.busy}
              title="Grab this frame, publish it on the bus, and ask the vision model"
              className="px-1.5 py-0.5 rounded text-[13px] text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-40"
            >
              {grab.busy ? '…' : '⎘'}
            </button>
          )}
          <button
            onClick={() => {
              stop();
              onClose();
            }}
            title="Close spyglass"
            className="px-1.5 py-0.5 rounded text-[13px] text-white/50 hover:text-white hover:bg-white/10"
          >
            ✕
          </button>
        </div>
      </div>

      {/* The picture */}
      <div className="relative bg-black" style={{ height }}>
        <canvas
          ref={canvasRef}
          width={Math.round(W * dpr)}
          height={Math.round(height * dpr)}
          style={{ width: W, height }}
          className={state === 'live' ? 'block' : 'hidden'}
        />

        {state !== 'live' && (
          <div className="absolute inset-0 grid place-items-center p-5 text-center">
            {state === 'unsupported' ? (
              <p className="text-[14px] text-white/45">This browser cannot capture.</p>
            ) : (
              <div>
                <p className="text-[14px] text-white/55 leading-snug">
                  {state === 'denied'
                    ? 'Capture declined.'
                    : state === 'self'
                      ? 'That is this tab — it would only show itself. Pick a different tab, a window, or a screen.'
                      : 'Pick another tab, a window, or a screen.'}
                </p>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={start}
                  disabled={state === 'requesting'}
                  className="mt-3 px-3 py-1.5 rounded-full border border-white/25 text-[14px] text-white/85 hover:bg-white/10 disabled:opacity-50"
                >
                  {state === 'requesting' ? 'Asking…' : 'Choose a source'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Measurement, not conclusion: what was actually captured. */}
      {state === 'live' && dims && (
        <p className="px-3 py-1 text-[12px] text-white/30 tabular-nums border-t border-white/10">
          {dims.vw}×{dims.vh}
        </p>
      )}

      {/* What the vision model said. Shown verbatim, refusals included — a
          refusal is the answer right now, and dressing it up as anything else
          would be the failure this whole mechanism is against. */}
      {grab.verdict && (
        <div className="px-3 py-2 border-t border-amber-500/30">
          <p className="text-[13px] text-white/80 leading-snug">{grab.verdict}</p>
          {grab.digest && <p className="mt-1 text-[12px] text-white/40">frame · {grab.digest}</p>}
        </div>
      )}
    </div>
  );

  return typeof document === 'undefined' ? node : createPortal(node, document.body);
}
