/**
 * The spyglass — a round window onto captured pixels.
 *
 * Deliberately independent of the chat window: its own position, its own
 * lifetime, and it knows nothing about chat. It is an instrument, and
 * instruments should be movable to whatever you want to look at.
 *
 * SIMPLIFIED 7 Aug 2026, on the report "it's unusable". The first version had a
 * radial resize handle, three zoom levels and a drag-to-pan mode, and every one
 * of those knobs was a way to put it into a state that looked broken. A fixed
 * circle at a fixed magnification has no bad states to get into. Size and zoom
 * can come back later if their absence is ever actually felt — that is a
 * cheaper mistake than shipping controls nobody wanted.
 *
 * WHAT IT SHOWS depends on the source, and which one is in force is displayed
 * rather than inferred:
 *
 *   THIS TAB        a 2x magnifier. It cannot show what is directly underneath
 *                   it — what is underneath it is the lens — so it samples a
 *                   square beside itself and outlines where that square is.
 *   ANYTHING ELSE   the whole captured surface, fitted into the circle.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { connectSpyglassNode, publishFrame, classifyFrame } from './spyglassNode';

type GlassState = 'idle' | 'requesting' | 'live' | 'denied' | 'unsupported';
type Surface = 'browser' | 'window' | 'monitor' | 'unknown';

const STORE = 'symbia:spyglass';
/** One size. Chosen to be readable at 2x without covering a panel. */
const D = 280;
/** One magnification, and only in tab mode. */
const ZOOM = 2;

interface Pos {
  x: number;
  y: number;
}

/**
 * Where a tab-mode lens is allowed to sample from.
 *
 * A magnifier over its own page CANNOT show what is underneath it. So it
 * samples a nearby square instead, and that square must not intersect the lens
 * or the canvas photographs itself and recurses.
 *
 * The first version always offset one diameter LEFT and clamped with
 * Math.max(0, …). Near the left edge the clamp put the square back at x=0 —
 * exactly where the lens was. Straight into feedback. The clamp that was
 * supposed to keep the sample on screen was what walked it back onto the lens.
 *
 * Now every side is a candidate and the first one that fits on screen AND clear
 * of the lens wins. If none fits, this returns null and the lens says so rather
 * than drawing a recursion and letting it read as an effect.
 */
export function tabSampleRect(
  pos: Pos,
  vw: number,
  vh: number
): { x: number; y: number; size: number } | null {
  const size = D / ZOOM;
  const gap = 12;
  const cx = pos.x + D / 2;
  const cy = pos.y + D / 2;

  const candidates = [
    { x: pos.x - gap - size, y: cy - size / 2 }, // left
    { x: pos.x + D + gap, y: cy - size / 2 }, // right
    { x: cx - size / 2, y: pos.y - gap - size }, // above
    { x: cx - size / 2, y: pos.y + D + gap }, // below
  ];

  for (const c of candidates) {
    if (size > vw || size > vh) return null;
    const x = Math.min(Math.max(0, c.x), vw - size);
    const y = Math.min(Math.max(0, c.y), vh - size);
    // Overlap is tested AFTER clamping, because clamping is what reintroduced
    // the overlap last time. Testing the unclamped candidate would pass a
    // square that then gets moved onto the lens.
    const clear = x + size <= pos.x || x >= pos.x + D || y + size <= pos.y || y >= pos.y + D;
    if (clear) return { x, y, size };
  }
  return null;
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

  // Viewport size is an input to where the lens may sample from, so a resize
  // has to re-render the outline, not just the canvas.
  const [vp, setVp] = useState(() =>
    typeof window === 'undefined'
      ? { w: 1280, h: 800 }
      : { w: window.innerWidth, h: window.innerHeight }
  );
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    // Release the previous capture FIRST.
    //
    // Without this, changing source left the old stream running and Chrome
    // showed two "is sharing your screen" bars — two live captures, one of
    // them invisible and unstoppable from this UI. A capture the operator
    // cannot see or end is exactly the kind of thing this platform is not
    // allowed to leave running.
    stop();
    setState('requesting');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        // NOT preferCurrentTab. The whole point is that you choose — another
        // tab, another app, the whole desktop.
        video: { frameRate: 30 },
        audio: false,
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      const s = (track?.getSettings() as { displaySurface?: string } | undefined)?.displaySurface;
      setSurface(s === 'browser' || s === 'window' || s === 'monitor' ? (s as Surface) : 'unknown');
      // Chrome's own "Stop sharing" button ends the track without telling this
      // component. Without this the lens would keep drawing the last frame.
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

  // Closing releases the camera. A closed lens that is still capturing is the
  // same defect as the double share bar, just harder to notice.
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
        x: Math.min(Math.max(-D / 2, e.clientX - drag.current.dx), window.innerWidth - D / 2),
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

  // Draw loop.
  useEffect(() => {
    if (state !== 'live' || !open) return;
    const draw = () => {
      const v = videoRef.current;
      const c = canvasRef.current;
      const ctx = c?.getContext('2d');
      if (v && c && ctx && v.videoWidth) {
        // Record the frame size rather than assume it. When the lens showed
        // content from the wrong part of the page there was no way to tell
        // whether the crop maths or the capture geometry was at fault, and a
        // screenshot cannot answer it. Now the numbers are on screen.
        setDims((d) =>
          d && d.vw === v.videoWidth && d.vh === v.videoHeight
            ? d
            : { vw: v.videoWidth, vh: v.videoHeight }
        );
        ctx.clearRect(0, 0, c.width, c.height);

        if (surface === 'browser') {
          // Magnifier over this page. Samples beside itself, never a square
          // containing itself. Nowhere clear means draw NOTHING — a blank lens
          // is honest, a recursive one is not.
          const rect = tabSampleRect(pos, window.innerWidth, window.innerHeight);
          if (rect) {
            // Separate horizontal and vertical scale.
            //
            // A single k derived from width assumes the captured frame has the
            // same aspect ratio as the viewport. Chrome may constrain or pad a
            // tab capture, and when it does, one k puts the vertical crop in
            // the wrong place — the lens shows content from somewhere else on
            // the page and looks like it is reading stale pixels.
            const kx = v.videoWidth / window.innerWidth;
            const ky = v.videoHeight / window.innerHeight;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(
              v,
              rect.x * kx,
              rect.y * ky,
              rect.size * kx,
              rect.size * ky,
              0,
              0,
              c.width,
              c.height
            );
          }
        } else {
          // Another tab, a window, or a monitor: the whole surface, fitted.
          // Fitted rather than cropped so the circle never implies there is
          // nothing outside it — you are looking at all of it.
          const scale = Math.min(c.width / v.videoWidth, c.height / v.videoHeight);
          const w = v.videoWidth * scale;
          const h = v.videoHeight * scale;
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(v, (c.width - w) / 2, (c.height - h) / 2, w, h);
        }
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [state, open, surface, pos]);

  /**
   * Grab the current lens contents, publish it on the bus, and ask the models
   * service what it is. Whatever comes back is shown VERBATIM — including a
   * refusal, which is the current expected answer since no vision model is
   * loaded.
   */
  const grabFrame = useCallback(async () => {
    const c = canvasRef.current;
    if (!c || state !== 'live') return;
    setGrab({ busy: true });
    try {
      const b64 = c.toDataURL('image/png').split(',')[1] ?? '';
      const env = await publishFrame(b64, {
        width: c.width,
        height: c.height,
        source: surface === 'browser' ? 'tab' : surface,
      });
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
  const isTab = surface === 'browser';
  const sample = isTab && state === 'live' ? tabSampleRect(pos, vp.w, vp.h) : null;

  const node = (
    <>
      {/* The dashed outline that used to mark the sample square is GONE.
          It was drawn on top of the exact region the lens samples, so the lens
          magnified the marker along with the content — a marker that changes
          the thing it marks. It is the same mistake as the feedback loop in a
          smaller frame. Where the sample comes from is now stated as numbers
          under the lens, which cannot contaminate the image. */}

      <div className="fixed z-[10000]" style={{ left: pos.x, top: pos.y }}>
        <video ref={videoRef} className="hidden" muted playsInline />

        {/* The lens. The ring IS the drag handle — there is nothing else to
            grab, and nothing else a drag on a circle could mean. */}
        <div
          onPointerDown={(e) => {
            drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          }}
          className="relative rounded-full overflow-hidden border-[3px] border-white/30 bg-black/75 shadow-[0_8px_40px_rgba(0,0,0,0.6)] cursor-grab active:cursor-grabbing"
          style={{ width: D, height: D }}
        >
          <canvas
            ref={canvasRef}
            width={Math.round(D * dpr)}
            height={Math.round(D * dpr)}
            style={{ width: D, height: D }}
            className={state === 'live' ? 'block' : 'hidden'}
          />

          {/* Live, on this tab, and nowhere left to sample from. Say so. The
              alternative is drawing the lens into itself, which is what
              shipped and what made it unusable. */}
          {state === 'live' && isTab && !sample && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center">
              <p className="text-[14px] text-white/55 leading-snug">
                Nowhere clear to sample.
                <br />
                <span className="text-white/40">Move the lens away from the edge.</span>
              </p>
            </div>
          )}

          {state !== 'live' && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center">
              {state === 'unsupported' ? (
                <p className="text-[14px] text-white/45">This browser cannot capture.</p>
              ) : (
                <div>
                  <p className="text-[15px] text-white/70">Spyglass</p>
                  <p className="mt-1 text-[13px] text-white/40 leading-snug">
                    {state === 'denied'
                      ? 'Capture declined.'
                      : 'Pick a tab, a window, or a screen.'}
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

        {/* Three buttons. What it is looking at, grab a frame, close. */}
        <div className="mt-2 flex items-center justify-center gap-1">
          {state === 'live' && (
            <button
              onClick={start}
              title="Change source"
              className="px-2 py-1 rounded-full bg-black/60 text-[12px] text-white/55 hover:text-white backdrop-blur"
            >
              {isTab ? 'this tab' : surface === 'unknown' ? 'source' : surface} ⇄
            </button>
          )}
          {state === 'live' && (
            <button
              onClick={grabFrame}
              disabled={grab.busy}
              title="Grab this frame, publish it on the bus, and ask the vision model"
              className="px-2 py-1 rounded-full bg-black/60 text-white/70 text-[13px] hover:text-white backdrop-blur disabled:opacity-50"
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
            className="px-2 py-1 rounded-full bg-black/60 text-white/60 text-[13px] hover:text-white backdrop-blur"
          >
            ✕
          </button>
        </div>

        {/* Measurements, not conclusions.
            Captured frame size, viewport size, and the square being sampled.
            If the lens ever shows the wrong part of the page again, these four
            numbers say whether the capture geometry or the crop maths is at
            fault — which a screenshot on its own cannot. */}
        {state === 'live' && dims && (
          <p className="mt-1 text-center text-[12px] leading-tight text-white/35 tabular-nums">
            frame {dims.vw}×{dims.vh} · view {vp.w}×{vp.h}
            {sample && (
              <>
                <br />
                sample {Math.round(sample.x)},{Math.round(sample.y)} · {Math.round(sample.size)}px
              </>
            )}
          </p>
        )}

        {/* What the vision model said. Shown verbatim, refusals included — a
            refusal is the answer right now, and dressing it up as anything
            else would be the failure this whole mechanism is against. */}
        {grab.verdict && (
          <div className="mt-2 max-w-[300px] rounded-[14px] border border-amber-500/30 bg-black/75 px-3 py-2 backdrop-blur">
            <p className="text-[14px] text-white/80 leading-snug">{grab.verdict}</p>
            {grab.digest && <p className="mt-1 text-[12px] text-white/40">frame · {grab.digest}</p>}
          </div>
        )}
      </div>
    </>
  );

  return typeof document === 'undefined' ? node : createPortal(node, document.body);
}
