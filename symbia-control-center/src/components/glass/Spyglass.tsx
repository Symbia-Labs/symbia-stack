/**
 * The spyglass — an aperture, not a viewer.
 *
 * A transparent circle with a ring. You drag it over the thing you want Symbia
 * to look at and press the shutter; the pixels under the ring become an
 * attachment on your next chat message. It shows nothing of its own, because
 * there is nothing to show: the interior is a hole, and what you see through it
 * is the page itself.
 *
 * THAT IS THE WHOLE DESIGN, and it arrives after three wrong ones. It was a
 * rectangle bolted to the chat window, then a magnifier that fed back on
 * itself, then a picture-in-picture panel showing some other surface. Every one
 * of those tried to DISPLAY captured pixels, and displaying captured pixels
 * inside the thing being captured is what produced the recursion, the offset
 * crop, and the marker that contaminated the region it marked. An aperture has
 * none of those problems because it draws nothing. The instrument that does not
 * render its own subject cannot corrupt it.
 *
 * The interior is pointer-transparent, so the console underneath stays fully
 * usable with the circle parked on it — this is a sight, not a window you have
 * to work around.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  connectSpyglassNode,
  disconnectSpyglassNode,
  publishEnvelope,
  classifyHeldFrame,
  frameDigest,
} from './spyglassNode';
import { deposit, forget } from './pixelVault';
import { useFrameStore } from './frameStore';

type Shot = 'idle' | 'requesting' | 'ready' | 'shooting' | 'denied' | 'unsupported';
/** What the shutter takes. See the `mode` state for why it is not inferred. */
type Mode = 'aperture' | 'surface';
type Surface = 'browser' | 'window' | 'monitor' | 'unknown';

const STORE = 'symbia:spyglass';
/** One size. Every knob this thing has had was a way to make it look broken. */
const D = 260;
/**
 * How long the ring stays hidden before the shutter reads a frame.
 *
 * A screen capture pipeline is several frames behind the DOM. One
 * requestAnimationFrame is not enough — the ring is still in the captured
 * buffer — and the first version of this in the magnifier proved it by
 * photographing itself. This is a delay, and it is a guess at a lower bound
 * rather than a measurement, which is why the ring visibly blinks: the operator
 * can see the frame being taken.
 */
const BLINK_MS = 180;

interface Pos {
  x: number;
  y: number;
}

function load(): Pos {
  const fallback: Pos = { x: 120, y: 160 };
  try {
    const raw = localStorage.getItem(`${STORE}:pos`);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function Spyglass({
  open,
  onClose,
  nodeId,
}: {
  open: boolean;
  onClose: () => void;
  /**
   * Minted by whatever spawned this aperture, not by the aperture itself.
   * Whoever opened it is the thing that brought the capability into existence,
   * and the mesh record should say so. It is also the id chat carries to refer
   * to a frame it is not allowed to look at.
   */
  nodeId: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const [pos, setPos] = useState<Pos>(() =>
    typeof window === 'undefined' ? { x: 120, y: 160 } : load()
  );
  const [shot, setShot] = useState<Shot>(() =>
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function'
      ? 'idle'
      : 'unsupported'
  );
  const [note, setNote] = useState<string | null>(null);
  /**
   * What the shutter will capture, and it is decided by HOW the capture was
   * armed rather than by inspecting the stream.
   *
   *   aperture  this tab. The ring is a frame: the pixels underneath it are
   *             what gets captured.
   *   surface   another tab, a window, or a screen. The ring cannot point at a
   *             region of a surface it is not drawn on — a circle at x=120 on
   *             this page means nothing on a second monitor — so the shutter
   *             takes the WHOLE frame and the ring is only a button.
   *
   * Derived from the arming call, not from `displaySurface`, because
   * displaySurface returns 'browser' for this tab AND for every other tab, and
   * telling them apart needs browsingContextId which is not always there.
   * Guessing which mode to use from an ambiguous signal is how the crop maths
   * went wrong twice. How it was armed is never ambiguous.
   */
  const [mode, setMode] = useState<Mode>('aperture');
  const [surface, setSurface] = useState<Surface>('unknown');
  const setPending = useFrameStore((s) => s.setPending);
  const pending = useFrameStore((s) => s.pending);

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  /**
   * Get permission to read pixels.
   *
   * `pick: false` asks for this tab directly — one click, no chooser to
   * navigate, which is the common case and the demo path. `pick: true` opens
   * Chrome's full chooser: any other tab, any application window, any screen.
   *
   * Escaping the tab was possible in an earlier version, then lost when the
   * aperture was built around preferCurrentTab. It is back because the point of
   * an instrument is that you can point it at things, and most of what an
   * operator wants Symbia to look at is not inside this page.
   *
   * Capturing this tab makes Chrome show two sharing bars — one saying the tab
   * is captured, one saying it is capturing. Both are true. Capturing anything
   * else shows one.
   */
  const arm = useCallback(async (pick: boolean) => {
    if (streamRef.current && !pick) return true;
    // Changing source releases the old capture first, so the browser is never
    // left holding a stream this UI can no longer stop.
    if (pick) release();
    setShot('requesting');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        // Only when NOT picking. With it set, Chrome offers this tab alone.
        ...(pick ? {} : { preferCurrentTab: true }),
        audio: false,
      } as MediaStreamConstraints);
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      const ds = (track?.getSettings() as { displaySurface?: string } | undefined)?.displaySurface;
      setSurface(
        ds === 'browser' || ds === 'window' || ds === 'monitor' ? (ds as Surface) : 'unknown'
      );
      setMode(pick ? 'surface' : 'aperture');
      track?.addEventListener('ended', () => {
        release();
        setShot('idle');
        setNote('Sharing stopped.');
      });
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play();
      }
      setShot('ready');
      setNote(null);
      // Join the mesh only once there is something to capture. Registering a
      // node that cannot do its job would put a lie in the topology.
      void connectSpyglassNode(nodeId);
      return true;
    } catch (e) {
      // Keep the reason.
      //
      // This was a bare `catch { setState('denied') }`, which turned every
      // possible failure — the user cancelling, a permissions policy, an
      // unsupported constraint, no capture source available — into the single
      // word "declined". That is a conclusion written into a probe: it names
      // one cause for an event with several, and it cost a full driving run to
      // discover that the failure was not a decline at all.
      const err = e as { name?: string; message?: string };
      setShot('denied');
      setNote(
        `Capture did not start — ${err?.name ?? 'Error'}: ${err?.message ?? String(e)}`
      );
      console.warn('[spyglass] getDisplayMedia failed', err?.name, err?.message);
      return false;
    }
  }, [release, nodeId]);

  useEffect(
    () => () => {
      release();
      disconnectSpyglassNode(nodeId);
    },
    [release, nodeId]
  );

  // Closing releases the capture. A closed aperture that is still capturing is
  // a camera the operator believes is off.
  useEffect(() => {
    if (!open && streamRef.current) {
      release();
      setShot('idle');
    }
  }, [open, release]);

  // Drag. The ring is the handle; the hole is not.
  useEffect(() => {
    if (!open) return;
    const move = (e: PointerEvent) => {
      if (!drag.current) return;
      setPos({
        x: Math.min(Math.max(0, e.clientX - drag.current.dx), window.innerWidth - D),
        y: Math.min(Math.max(0, e.clientY - drag.current.dy), window.innerHeight - D),
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

  /**
   * The shutter.
   *
   * Hides the ring, waits for the capture pipeline to catch up, reads the
   * circle's worth of pixels, publishes the envelope on the bus, asks the
   * vision model, and parks the result on the chat composer. The image is
   * cropped to the CIRCLE, not the bounding square, so what gets attached is
   * exactly what the operator framed.
   */
  const capture = useCallback(async () => {
    if (!(await arm(false))) return;
    const v = videoRef.current;
    if (!v || !v.videoWidth) {
      setNote('No frame available yet.');
      return;
    }

    setShot('shooting');
    setNote(null);
    await new Promise((r) => setTimeout(r, BLINK_MS));

    try {
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('no 2d context');

      if (mode === 'aperture') {
        // This tab: crop the region under the ring.
        //
        // Horizontal and vertical scale computed separately. A single factor
        // assumes the captured frame shares the viewport's aspect ratio, and
        // when Chrome constrains a tab capture it does not — that assumption
        // put the crop in the wrong place once already.
        const kx = v.videoWidth / window.innerWidth;
        const ky = v.videoHeight / window.innerHeight;
        const dpr = window.devicePixelRatio || 1;
        c.width = Math.round(D * dpr);
        c.height = Math.round(D * dpr);

        // Clip to the circle first, so the attachment is the aperture and not
        // its bounding box.
        ctx.beginPath();
        ctx.arc(c.width / 2, c.height / 2, c.width / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(v, pos.x * kx, pos.y * ky, D * kx, D * ky, 0, 0, c.width, c.height);
      } else {
        // Another tab, a window, a screen: the whole frame, uncropped and
        // unrotated, at its own size (capped so a 5K display does not produce
        // a 20MB PNG for a model that will downscale it anyway).
        //
        // NO CIRCULAR CLIP HERE. Punching a circle out of someone's entire
        // desktop would throw away almost all of it and imply the ring had
        // selected something, which on a surface this page is not drawn on it
        // cannot have done.
        const MAX = 1600;
        const scale = Math.min(1, MAX / Math.max(v.videoWidth, v.videoHeight));
        c.width = Math.round(v.videoWidth * scale);
        c.height = Math.round(v.videoHeight * scale);
        ctx.drawImage(v, 0, 0, c.width, c.height);
      }

      // The bytes go straight into the vault and are referred to by digest
      // from here on. They are never held in component state, never put in a
      // store, and never handed to a caller — the only local variable holding
      // them goes out of scope at the end of this function.
      const b64 = c.toDataURL('image/png').split(',')[1] ?? '';
      const digest = await frameDigest(b64);
      deposit(digest, b64);

      const envelope = await publishEnvelope(digest, {
        width: c.width,
        height: c.height,
        // What was actually photographed, on the record. "aperture" for a
        // region of this page, otherwise the surface the browser named. A
        // frame of someone's whole desktop and a 260px circle from a dashboard
        // are different things and the envelope should not call them the same.
        source: mode === 'aperture' ? 'aperture' : `surface:${surface}`,
        nodeId,
        bytes: Math.round((b64.length * 3) / 4),
      });

      // Park the METADATA on the composer immediately. The verdict is useful
      // but it is not what makes the reference valid — the envelope is — so
      // this must not wait on a service currently expected to refuse.
      setPending({ envelope, nodeId });

      const r = await classifyHeldFrame(envelope);
      // classifyHeldFrame forgets the frame on its way out, so by the time this
      // runs the pixels are already gone. Recorded as a fact, not assumed.
      setPending({
        envelope,
        nodeId,
        verdict: r.arena === 'COMPOSED' ? r.description : r.reason,
        refused: r.arena === 'REFUSED',
        arena: r.arena,
        provider: r.provider,
        model: r.model,
        path: r.path,
        pixelsDropped: true,
      });
      setShot('ready');
    } catch (e) {
      setShot('ready');
      setNote(e instanceof Error ? e.message : 'capture failed');
    }
  }, [arm, pos.x, pos.y, setPending, nodeId, mode, surface]);

  // A frame the operator abandoned must not sit in the vault waiting for
  // something to reach for it. Dropping the attachment drops the bytes.
  const pendingDigest = pending?.envelope.digest;
  useEffect(() => {
    if (!pendingDigest) return;
    return () => forget(pendingDigest);
  }, [pendingDigest]);

  if (!open) return null;

  const hidden = shot === 'shooting';
  const surfaceWord =
    surface === 'monitor' ? 'screen' : surface === 'window' ? 'window' : surface === 'browser' ? 'tab' : 'source';

  const node = (
    <div
      className="fixed z-[10000]"
      style={{
        left: pos.x,
        top: pos.y,
        width: D,
        height: D,
        // The whole assembly disappears for the length of the blink. Opacity
        // is not enough — a translucent ring still lands in the frame.
        visibility: hidden ? 'hidden' : 'visible',
      }}
    >
      <video ref={videoRef} className="hidden" muted playsInline />

      {/* The aperture. Interior is a hole: no background, no canvas, and
          pointer-events off so the console underneath stays clickable with the
          circle sitting on it.

          In `surface` mode the ring goes dashed and dim. It is not framing
          anything then — the shutter takes the whole surface — and a solid
          ring that looks like a selection while selecting nothing is the same
          class of lie as a green dot that means "never asked". */}
      <div
        className={`absolute inset-0 rounded-full pointer-events-none shadow-[0_0_0_1px_rgba(0,0,0,0.5),0_0_24px_rgba(0,0,0,0.45)] ${
          mode === 'aperture'
            ? 'ring-[3px] ring-white/70'
            : 'border-[3px] border-dashed border-white/30'
        }`}
        style={{ boxSizing: 'border-box' }}
      />

      {/* Crosshair, only when the ring is actually framing something. */}
      {mode === 'aperture' && (
        <div className="absolute inset-0 pointer-events-none grid place-items-center">
          <div className="w-3 h-px bg-white/50" />
          <div className="h-3 w-px bg-white/50 -mt-[6px]" />
        </div>
      )}

      {/* What the shutter will take. Stated, because in surface mode the ring
          no longer answers it. */}
      {shot === 'ready' && (
        <div className="absolute inset-0 pointer-events-none grid place-items-center">
          <span
            className={`px-2 py-0.5 rounded-full bg-black/70 text-[12px] backdrop-blur ${
              mode === 'aperture' ? 'text-white/0' : 'text-white/60'
            }`}
          >
            {mode === 'aperture' ? '' : `whole ${surfaceWord}`}
          </span>
        </div>
      )}

      {/* Drag handle — a band on the rim. The interior has to stay pointer
          transparent, so the grab target is the ring itself. */}
      <div
        onPointerDown={(e) => {
          drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        title="Drag the aperture over what you want Symbia to see"
        className="absolute left-1/2 -translate-x-1/2 -top-3 px-3 py-1 rounded-full bg-black/80 border border-white/25 text-[13px] text-white/70 cursor-grab active:cursor-grabbing select-none backdrop-blur"
      >
        ⠿
      </div>

      {/* Shutter, source and close, on the rim below. */}
      <div className="absolute left-1/2 -translate-x-1/2 -bottom-4 flex items-center gap-1">
        <button
          onClick={capture}
          disabled={shot === 'shooting' || shot === 'requesting'}
          title={
            mode === 'aperture'
              ? 'Capture what is inside the ring and attach it to your next message'
              : `Capture the whole ${surfaceWord} and attach it to your next message`
          }
          className="px-3 py-1 rounded-full bg-black/80 border border-white/25 text-[13px] text-white/85 hover:bg-white/15 backdrop-blur disabled:opacity-50"
        >
          {shot === 'requesting' ? 'Asking…' : shot === 'shooting' ? '…' : 'Capture'}
        </button>

        {/* Escape the tab.
            The aperture was built around preferCurrentTab and lost the ability
            to look anywhere else. Most of what an operator wants Symbia to see
            is not inside this page. */}
        <button
          onClick={() => void arm(true)}
          disabled={shot === 'shooting' || shot === 'requesting'}
          title="Choose a different source — another tab, an application window, or a whole screen"
          className="px-2 py-1 rounded-full bg-black/80 border border-white/25 text-[13px] text-white/60 hover:text-white backdrop-blur disabled:opacity-50"
        >
          ⇄
        </button>
        <button
          onClick={() => {
            release();
            onClose();
          }}
          title="Close the spyglass"
          className="px-2 py-1 rounded-full bg-black/80 border border-white/25 text-[13px] text-white/60 hover:text-white backdrop-blur"
        >
          ✕
        </button>
      </div>

      {/* Status. Observations only — what happened, never what it means. */}
      {(note || pending || shot === 'unsupported') && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-9 w-[280px] rounded-[12px] border border-white/15 bg-black/85 px-3 py-2 backdrop-blur">
          {shot === 'unsupported' ? (
            <p className="text-[13px] text-white/50">This browser cannot capture.</p>
          ) : note ? (
            <p className="text-[13px] text-white/60">{note}</p>
          ) : pending ? (
            <p className="text-[13px] text-white/60">
              Attached to your next message · {pending.envelope.digest}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );

  return typeof document === 'undefined' ? node : createPortal(node, document.body);
}
