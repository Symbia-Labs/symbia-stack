/**
 * The looking glass — a live view of the pixels beside the chat window.
 *
 * Uses getDisplayMedia with preferCurrentTab, so what you see is the actual
 * rendered tab at video framerate, not a redraw of the DOM. That matters for
 * exactly the thing most worth looking at: the network graph is a canvas, and
 * every DOM-snapshot approach renders canvases worst.
 *
 * THE PERMISSION IS NOT A BUG TO BE ENGINEERED AROUND. A page cannot read its
 * own rendered pixels without the user granting it, and Chrome shows a sharing
 * indicator for as long as it does. That is deliberate browser design, and a
 * "looking glass" that tried to be silent about capturing the screen would be
 * a thing worth distrusting. So: it asks, it says why, and it shows plainly
 * when it is live and when it is not.
 *
 * Recursion: the glass renders the region to the LEFT of the chat window, and
 * the window is not in that region, so it does not photograph itself. Drag the
 * window far enough left and it will — that is a real edge and the mirror is
 * left visible rather than hidden, because the alternative is guessing at a
 * crop rectangle that quietly stops matching.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

type GlassState = 'idle' | 'requesting' | 'live' | 'denied' | 'unsupported';

export interface GlassRegion {
  /** CSS pixels, viewport coordinates — the area to show. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export function LookingGlass({
  region,
  width,
  height,
  zoom = 1,
}: {
  region: GlassRegion;
  width: number;
  height: number;
  /** >1 magnifies. The point of a looking glass. */
  zoom?: number;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [state, setState] = useState<GlassState>(() =>
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function'
      ? 'idle'
      : 'unsupported'
  );

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
        // Chrome-only hint. Without it the user has to pick this tab from a
        // list, which they will get wrong, and the glass will show their inbox.
        // @ts-expect-error preferCurrentTab is not in the DOM lib yet
        preferCurrentTab: true,
        video: { frameRate: 30 },
        audio: false,
      });
      streamRef.current = stream;

      // The user can revoke from Chrome's own sharing bar. Notice that rather
      // than sitting on a frozen last frame pretending to be live.
      stream.getVideoTracks()[0]?.addEventListener('ended', () => stop());

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      setState('live');
    } catch {
      setState('denied');
    }
  }, [stop]);

  useEffect(() => () => stop(), [stop]);

  // Draw loop. Crops the requested region out of the full-tab frame.
  useEffect(() => {
    if (state !== 'live') return;

    const draw = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.videoWidth) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // The captured frame is in device pixels of the whole tab; the region
          // is in CSS pixels of the viewport. Scale between them rather than
          // assuming they match — they do not on a retina display, and
          // assuming they did would put the crop in the wrong place on exactly
          // the machines this is being built on.
          const sx = video.videoWidth / window.innerWidth;
          const sy = video.videoHeight / window.innerHeight;
          const srcW = (region.w / zoom) * sx;
          const srcH = (region.h / zoom) * sy;
          const srcX = region.x * sx + ((region.w * sx) - srcW) / 2;
          const srcY = region.y * sy + ((region.h * sy) - srcH) / 2;

          ctx.imageSmoothingEnabled = zoom < 2;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height);
        }
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [state, region, zoom]);

  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;

  return (
    <div
      className="relative overflow-hidden rounded-[20px] border border-white/12 bg-black/60 shadow-2xl"
      style={{ width, height }}
    >
      <video ref={videoRef} className="hidden" muted playsInline />
      <canvas
        ref={canvasRef}
        width={Math.round(width * dpr)}
        height={Math.round(height * dpr)}
        style={{ width, height }}
        className={state === 'live' ? 'block' : 'hidden'}
      />

      {state !== 'live' && (
        <div className="absolute inset-0 grid place-items-center p-4 text-center">
          {state === 'unsupported' ? (
            <p className="text-[14px] text-white/45">
              This browser cannot capture the tab.
            </p>
          ) : (
            <div>
              <p className="text-[14px] text-white/55 leading-snug">
                {state === 'denied'
                  ? 'Capture was declined.'
                  : 'Show the live pixels beside this window.'}
              </p>
              <p className="mt-1 text-[13px] text-white/35 leading-snug">
                Chrome will ask, and show that it is sharing. It cannot be silent.
              </p>
              <button
                onClick={start}
                disabled={state === 'requesting'}
                className="mt-3 px-3 py-1.5 rounded-full border border-white/20 text-[14px] text-white/80 hover:bg-white/10 disabled:opacity-50"
              >
                {state === 'requesting' ? 'Asking…' : 'Open the glass'}
              </button>
            </div>
          )}
        </div>
      )}

      {state === 'live' && (
        <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-[3px] backdrop-blur">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" aria-hidden />
          <span className="text-[12px] text-white/70">live{zoom !== 1 && ` · ${zoom}×`}</span>
          <button
            onClick={stop}
            className="ml-1 text-[12px] text-white/45 hover:text-white/85"
            aria-label="Stop the looking glass"
          >
            stop
          </button>
        </div>
      )}
    </div>
  );
}
