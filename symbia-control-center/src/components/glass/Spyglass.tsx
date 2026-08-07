/**
 * The spyglass — a round, draggable, resizable lens onto captured pixels.
 *
 * Deliberately independent of the chat window. It has its own position, size,
 * source and lifetime, and knows nothing about chat. The first version was a
 * rectangle bolted to the side of the chat popout, which made it a chat
 * feature; it is not — it is an instrument, and instruments should be movable
 * to whatever you want to look at.
 *
 * SOURCE. getDisplayMedia's picker offers this tab, ANY OTHER TAB, any
 * application window, or the whole screen. So the spyglass already works
 * across tabs and across the desktop — that was never a limitation of the API,
 * only of the first version's cropping, which assumed the captured surface was
 * this page.
 *
 * Two modes follow from that, and which one is in force is displayed rather
 * than inferred:
 *
 *   TAB (this page)  the lens is a magnifier over its own viewport. The crop
 *                    follows the lens position, so it shows what is underneath
 *                    it — offset to avoid photographing itself.
 *   ANYTHING ELSE    viewport coordinates are meaningless against another tab,
 *                    a window or a monitor. The lens becomes a pannable
 *                    viewport onto that image: drag inside it to move around.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { connectSpyglassNode, publishFrame, classifyFrame } from './spyglassNode';

type GlassState = 'idle' | 'requesting' | 'live' | 'denied' | 'unsupported';
type Surface = 'browser' | 'window' | 'monitor' | 'unknown';

const STORE = 'symbia:spyglass';
const MIN_D = 160;
const MAX_D = 900;

interface Geo {
  x: number;
  y: number;
  /** Diameter. It is a circle; one number is the whole size. */
  d: number;
}

/**
 * Where a tab-mode lens is allowed to sample from.
 *
 * A magnifier over its own page CANNOT show what is underneath it — what is
 * underneath it is the magnifier. So it samples a nearby rectangle instead, and
 * that rectangle must not intersect the lens or the canvas photographs itself
 * and recurses.
 *
 * The first version always offset one diameter to the LEFT and clamped the
 * result with Math.max(0, …). Near the left edge — or with a lens wider than
 * its own margin — the clamp put the rectangle back at x=0, which is exactly
 * where the lens was sitting. Straight into feedback. The clamp that was
 * supposed to keep the sample on screen was what walked it back onto the lens.
 *
 * Now every side is a candidate and the first one that fits ON screen and CLEAR
 * of the lens wins. If none fits, this returns null and the lens says so rather
 * than drawing a recursion and letting it read as an effect.
 */
export function tabSampleRect(
  geo: Geo,
  zoom: number,
  vw: number,
  vh: number
): { x: number; y: number; size: number } | null {
  const size = geo.d / zoom;
  const gap = 12;
  const cx = geo.x + geo.d / 2;
  const cy = geo.y + geo.d / 2;

  const candidates = [
    { x: geo.x - gap - size, y: cy - size / 2 }, // left
    { x: geo.x + geo.d + gap, y: cy - size / 2 }, // right
    { x: cx - size / 2, y: geo.y - gap - size }, // above
    { x: cx - size / 2, y: geo.y + geo.d + gap }, // below
  ];

  for (const c of candidates) {
    const x = Math.min(Math.max(0, c.x), vw - size);
    const y = Math.min(Math.max(0, c.y), vh - size);
    if (x < 0 || y < 0 || size > vw || size > vh) continue;
    // Overlap is tested AFTER clamping, because clamping is what reintroduced
    // the overlap last time. Testing the unclamped candidate would pass a
    // rectangle that then gets moved onto the lens.
    const clear =
      x + size <= geo.x || x >= geo.x + geo.d || y + size <= geo.y || y >= geo.y + geo.d;
    if (clear) return { x, y, size };
  }
  return null;
}

function load(): Geo {
  const fallback: Geo = { x: 80, y: 120, d: 320 };
  try {
    const raw = localStorage.getItem(`${STORE}:geo`);
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

  const [geo, setGeo] = useState<Geo>(() => (typeof window === 'undefined' ? { x: 80, y: 120, d: 320 } : load()));
  const [surface, setSurface] = useState<Surface>('unknown');
  const [zoom, setZoom] = useState(2);
  /** Pan offset, used only when the source is not this tab. Normalised 0..1. */
  const [pan, setPan] = useState({ x: 0.5, y: 0.5 });
  const [grab, setGrab] = useState<{ busy: boolean; verdict?: string; digest?: string }>({ busy: false });
  const [state, setState] = useState<GlassState>(() =>
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function'
      ? 'idle'
      : 'unsupported'
  );

  // Viewport size is an input to where the lens may sample from, so a resize
  // has to re-render the marker, not just the canvas.
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
  const resize = useRef<{ x: number; y: number; d: number } | null>(null);
  const panning = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setState('idle');
  }, []);

  const start = useCallback(async () => {
    setState('requesting');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        // NOT preferCurrentTab. The whole point is that you choose — another
        // tab, another app, the whole desktop. Defaulting to this tab would
        // quietly narrow an instrument whose value is that it can look
        // anywhere.
        video: { frameRate: 30 },
        audio: false,
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      const s = (track?.getSettings() as { displaySurface?: string } | undefined)?.displaySurface;
      setSurface(s === 'browser' || s === 'window' || s === 'monitor' ? (s as Surface) : 'unknown');
      track?.addEventListener('ended', () => stop());
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

  // Pointer handling for drag, resize and pan.
  useEffect(() => {
    if (!open) return;
    const move = (e: PointerEvent) => {
      if (drag.current) {
        setGeo((g) => ({ ...g, x: e.clientX - drag.current!.dx, y: e.clientY - drag.current!.dy }));
      } else if (resize.current) {
        // Distance from the lens centre sets the radius — a circle resizes
        // radially, not by a corner.
        const cx = resize.current.x;
        const cy = resize.current.y;
        const dist = Math.hypot(e.clientX - cx, e.clientY - cy) * 2;
        setGeo((g) => ({ ...g, d: Math.min(MAX_D, Math.max(MIN_D, dist)) }));
      } else if (panning.current) {
        const p = panning.current;
        setPan({
          x: Math.min(1, Math.max(0, p.px - (e.clientX - p.x) / (geo.d * zoom))),
          y: Math.min(1, Math.max(0, p.py - (e.clientY - p.y) / (geo.d * zoom))),
        });
      }
    };
    const up = () => {
      if (drag.current || resize.current) {
        drag.current = null;
        resize.current = null;
        setGeo((g) => {
          try {
            localStorage.setItem(`${STORE}:geo`, JSON.stringify(g));
          } catch { /* storage disabled */ }
          return g;
        });
      }
      panning.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [open, geo.d, zoom]);

  // Draw loop.
  useEffect(() => {
    if (state !== 'live' || !open) return;
    const draw = () => {
      const v = videoRef.current;
      const c = canvasRef.current;
      if (v && c && v.videoWidth) {
        const ctx = c.getContext('2d');
        if (ctx) {
          const isTab = surface === 'browser';
          let sx: number, sy: number, sw: number, sh: number;

          if (isTab) {
            // Magnifier over this page. It samples a rectangle beside the lens,
            // never one containing it. If there is nowhere clear, it draws
            // NOTHING — a blank lens is honest, a recursive one is not.
            const rect = tabSampleRect(geo, zoom, window.innerWidth, window.innerHeight);
            if (!rect) {
              ctx.clearRect(0, 0, c.width, c.height);
              rafRef.current = requestAnimationFrame(draw);
              return;
            }
            const k = v.videoWidth / window.innerWidth;
            sx = rect.x * k;
            sy = rect.y * k;
            sw = rect.size * k;
            sh = rect.size * k;
          } else {
            // Another tab, a window, or a monitor. Pan around it.
            sw = v.videoWidth / zoom;
            sh = v.videoHeight / zoom;
            sx = Math.min(Math.max(0, pan.x * v.videoWidth - sw / 2), v.videoWidth - sw);
            sy = Math.min(Math.max(0, pan.y * v.videoHeight - sh / 2), v.videoHeight - sh);
          }

          ctx.imageSmoothingEnabled = zoom < 2;
          ctx.clearRect(0, 0, c.width, c.height);
          ctx.drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
        }
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [state, open, surface, geo, zoom, pan]);

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
      const dataUrl = c.toDataURL('image/png');
      const b64 = dataUrl.split(',')[1] ?? '';
      const env = await publishFrame(b64, {
        width: c.width,
        height: c.height,
        source: surface === 'browser' ? 'tab' : surface,
      });
      const r = (await classifyFrame(b64, env)) as {
        ok?: boolean; description?: string; reason?: string; missing?: string[];
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
  const sample = isTab && state === 'live' ? tabSampleRect(geo, zoom, vp.w, vp.h) : null;

  const node = (
    <>
    {/* Where the pixels are coming from.
        Without this the lens is a magnifier showing something that is not
        underneath it, which reads as a bug even when it is working. The outline
        makes the offset visible instead of mysterious. */}
    {sample && (
      <div
        aria-hidden
        className="fixed z-[9999] pointer-events-none rounded-[4px] border border-dashed border-cyan-300/60"
        style={{ left: sample.x, top: sample.y, width: sample.size, height: sample.size }}
      />
    )}
    <div className="fixed z-[10000]" style={{ left: geo.x, top: geo.y }}>
      <video ref={videoRef} className="hidden" muted playsInline />

      {/* The lens */}
      <div
        onPointerDown={(e) => {
          // Inside the lens: drag to PAN when looking at another surface,
          // because there is nothing else that gesture could usefully mean.
          if (!isTab && state === 'live') {
            panning.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
          }
        }}
        className={`relative rounded-full overflow-hidden border-[3px] border-white/25 bg-black/70 shadow-[0_8px_40px_rgba(0,0,0,0.6)] ${
          !isTab && state === 'live' ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
        style={{ width: geo.d, height: geo.d }}
      >
        <canvas
          ref={canvasRef}
          width={Math.round(geo.d * dpr)}
          height={Math.round(geo.d * dpr)}
          style={{ width: geo.d, height: geo.d }}
          className={state === 'live' ? 'block' : 'hidden'}
        />

        {/* Live, on this tab, and nowhere left to sample from. Say so. The
            alternative is drawing the lens into itself, which is what shipped
            and what made it unusable. */}
        {state === 'live' && isTab && !sample && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <p className="text-[14px] text-white/55 leading-snug">
              Nowhere clear to sample.<br />
              <span className="text-white/40">
                Make the lens smaller, raise the zoom, or move it away from the edge.
              </span>
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
                    : 'Pick a tab, a window, or a screen. Chrome will show it is sharing.'}
                </p>
                <button
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

      {/* Handle bar — drag, zoom, source, close. Outside the lens so the lens
          stays a clean circle. */}
      <div className="mt-2 flex items-center justify-center gap-1">
        <button
          onPointerDown={(e) => {
            drag.current = { dx: e.clientX - geo.x, dy: e.clientY - geo.y };
          }}
          title="Drag the spyglass"
          className="px-2 py-1 rounded-full bg-black/60 text-white/70 text-[13px] cursor-grab active:cursor-grabbing backdrop-blur"
        >
          ✥
        </button>
        {[2, 4, 8].map((z) => (
          <button
            key={z}
            onClick={() => setZoom(z)}
            className={`px-2 py-1 rounded-full text-[13px] backdrop-blur ${
              z === zoom ? 'bg-white/25 text-white' : 'bg-black/60 text-white/45 hover:text-white/80'
            }`}
          >
            {z}×
          </button>
        ))}
        {state === 'live' && (
          <span className="px-2 py-1 rounded-full bg-black/60 text-[12px] text-white/55 backdrop-blur">
            {isTab ? 'this tab' : surface === 'unknown' ? 'source' : surface}
          </span>
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
          onClick={state === 'live' ? start : onClose}
          title={state === 'live' ? 'Change source' : 'Close'}
          className="px-2 py-1 rounded-full bg-black/60 text-white/60 text-[13px] hover:text-white backdrop-blur"
        >
          {state === 'live' ? '⇄' : '✕'}
        </button>
        <button
          onClick={() => { stop(); onClose(); }}
          title="Close spyglass"
          className="px-2 py-1 rounded-full bg-black/60 text-white/60 text-[13px] hover:text-white backdrop-blur"
        >
          ✕
        </button>
      </div>

      {/* What the vision model said. Shown verbatim, refusals included — a
          refusal is the answer right now, and dressing it up as anything else
          would be the failure this whole mechanism is against. */}
      {grab.verdict && (
        <div className="mt-2 max-w-[340px] rounded-[14px] border border-amber-500/30 bg-black/75 px-3 py-2 backdrop-blur">
          <p className="text-[14px] text-white/80 leading-snug">{grab.verdict}</p>
          {grab.digest && (
            <p className="mt-1 text-[12px] text-white/40">frame · {grab.digest}</p>
          )}
        </div>
      )}

      {/* Resize grip, on the rim at 45°. */}
      <div
        onPointerDown={(e) => {
          resize.current = { x: geo.x + geo.d / 2, y: geo.y + geo.d / 2, d: geo.d };
          e.stopPropagation();
        }}
        title="Resize"
        className="absolute w-5 h-5 rounded-full bg-white/25 border border-white/40 cursor-nwse-resize"
        style={{
          left: geo.d / 2 + (geo.d / 2) * 0.707 - 10,
          top: geo.d / 2 + (geo.d / 2) * 0.707 - 10,
        }}
      />
    </div>
    </>
  );

  return typeof document === 'undefined' ? node : createPortal(node, document.body);
}
