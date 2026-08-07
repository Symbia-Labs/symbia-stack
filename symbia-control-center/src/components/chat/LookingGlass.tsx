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
 * FEEDBACK. getDisplayMedia captures the COMPOSITED tab — including this
 * canvas. If the source rectangle overlaps the glass, each frame draws the
 * previous one and you get video feedback rather than a view of the page. The
 * first version did exactly that: it showed its output, not its input.
 *
 * The caller is responsible for handing over a rectangle the glass does not
 * sit in. When it cannot (the glass pushed against the left edge), it passes
 * selfCapture and the badge says 'feedback', because a mirror that has started
 * photographing itself should say so rather than look like a design choice.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

type GlassState = 'idle' | 'requesting' | 'live' | 'denied' | 'unsupported';

/**
 * What the user actually shared.
 *
 * 'browser' is a tab — the only surface whose pixels map to this page's
 * viewport coordinates. 'monitor' and 'window' are the whole screen or another
 * app, and cropping those with viewport coordinates samples a sliver of the
 * wrong image and stretches it: the glass showed a smeared diagonal streak and
 * looked like a rendering bug rather than a wrong source.
 */
type Surface = 'browser' | 'window' | 'monitor' | 'unknown';

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
  selfCapture = false,
}: {
  region: GlassRegion;
  width: number;
  height: number;
  /** >1 magnifies. The point of a looking glass. */
  zoom?: number;
  /**
   * The source rectangle now overlaps the glass itself, so the capture is
   * feeding back into itself. Shown, not silently tolerated.
   */
  selfCapture?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [surface, setSurface] = useState<Surface>('unknown');
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

      // ASK WHAT WAS SHARED. Do not assume it is this tab.
      //
      // preferCurrentTab is a hint, not a guarantee — the picker still lets
      // the user choose a window or a whole monitor, and this page cannot map
      // its own viewport coordinates onto either of those. Reading
      // displaySurface is the difference between showing a wrong picture and
      // saying which picture would be right.
      const track = stream.getVideoTracks()[0];
      const s = (track?.getSettings() as { displaySurface?: string } | undefined)?.displaySurface;
      setSurface(
        s === 'browser' || s === 'window' || s === 'monitor' ? (s as Surface) : 'unknown'
      );

      // The user can revoke from Chrome's own sharing bar. Notice that rather
      // than sitting on a frozen last frame pretending to be live.
      track?.addEventListener('ended', () => stop());

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
          // Viewport coordinates only mean anything if the captured surface
          // IS this tab. For a window or a monitor they refer to a different
          // image entirely, so the glass shows the frame whole rather than
          // cropping the wrong rectangle out of it.
          const isTab = surface === 'browser';
          const sx = isTab ? video.videoWidth / window.innerWidth : 1;
          const sy = isTab ? video.videoHeight / window.innerHeight : 1;

          const srcW = isTab ? (region.w / zoom) * sx : video.videoWidth / zoom;
          const srcH = isTab ? (region.h / zoom) * sy : video.videoHeight / zoom;
          const srcX = isTab
            ? region.x * sx + (region.w * sx - srcW) / 2
            : (video.videoWidth - srcW) / 2;
          const srcY = isTab
            ? region.y * sy + (region.h * sy - srcH) / 2
            : (video.videoHeight - srcH) / 2;

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
  }, [state, region, zoom, surface]);

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
          {surface !== 'browser' && (
            <span
              className="text-[12px] text-amber-300/90"
              title="You shared a window or a screen, not this tab. This page cannot line its own coordinates up with that image, so the glass shows the whole frame instead of the region beside it. Stop and re-share, choosing THIS TAB."
            >
              · {surface === 'unknown' ? 'unknown source' : `whole ${surface}`}
            </span>
          )}
          {selfCapture && (
            <span className="text-[12px] text-amber-300/90" title="The source rectangle overlaps the glass — it is capturing its own output">
              · feedback
            </span>
          )}
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
