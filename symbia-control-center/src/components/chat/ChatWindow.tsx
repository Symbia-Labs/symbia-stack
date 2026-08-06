/**
 * The chat popout — a phone-shaped floating window.
 *
 * Draggable by the header, resizable from the bottom-right grip, and it keeps
 * a phone aspect ratio (9:19.5) while scaling so the messenger skins inside it
 * always lay out the way they would on a handset.
 *
 * Deliberately NOT modal. There is no backdrop and nothing behind it is
 * disabled: this is an operator console, and a chat window that blocks the
 * panel you are reading is a chat window you close. Position, size and
 * open/closed state persist, so it comes back where you left it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { SKINS, SKIN_ORDER, loadSkin, saveSkin, type SkinId } from './skins';

/** Modern phone. Width is derived from height so the frame is always a phone. */
const ASPECT = 9 / 19.5;
const MIN_H = 480;
const MAX_H = 1100;
const STORAGE = 'symbia:chat:window';

interface Geometry {
  x: number;
  y: number;
  h: number;
}

function clampToViewport(g: Geometry): Geometry {
  const h = Math.min(Math.max(g.h, MIN_H), Math.min(MAX_H, window.innerHeight - 24));
  const w = h * ASPECT;
  return {
    h,
    // Keep at least a strip on screen. A window dragged fully off-screen is
    // indistinguishable from a window that failed to open.
    x: Math.min(Math.max(g.x, -w + 120), window.innerWidth - 120),
    y: Math.min(Math.max(g.y, 0), window.innerHeight - 60),
  };
}

function loadGeometry(): Geometry {
  const fallback: Geometry = {
    h: Math.min(760, window.innerHeight - 80),
    x: window.innerWidth - 460,
    y: 60,
  };
  try {
    const raw = localStorage.getItem(STORAGE);
    return clampToViewport(raw ? { ...fallback, ...JSON.parse(raw) } : fallback);
  } catch {
    return clampToViewport(fallback);
  }
}

export function ChatWindow({
  open,
  onClose,
  children,
  title = 'Chat',
  status,
}: {
  open: boolean;
  onClose: () => void;
  children: (skin: (typeof SKINS)[SkinId]) => React.ReactNode;
  title?: string;
  status?: React.ReactNode;
}) {
  const [geo, setGeo] = useState<Geometry>(() =>
    typeof window === 'undefined' ? { x: 0, y: 0, h: 760 } : loadGeometry()
  );
  const [skinId, setSkinId] = useState<SkinId>(loadSkin);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const resize = useRef<{ startY: number; startH: number } | null>(null);

  const skin = SKINS[skinId];
  const width = geo.h * ASPECT;

  const persist = useCallback((g: Geometry) => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(g));
    } catch {
      /* storage disabled — the window still works, it just forgets */
    }
  }, []);

  // Pointer handlers live on window, not on the header, so a fast drag that
  // outruns the cursor does not drop the window mid-move.
  useEffect(() => {
    if (!open) return;

    const move = (e: PointerEvent) => {
      if (drag.current) {
        setGeo((g) => clampToViewport({ ...g, x: e.clientX - drag.current!.dx, y: e.clientY - drag.current!.dy }));
      } else if (resize.current) {
        const dy = e.clientY - resize.current.startY;
        setGeo((g) => clampToViewport({ ...g, h: resize.current!.startH + dy }));
      }
    };
    const up = () => {
      if (drag.current || resize.current) {
        drag.current = null;
        resize.current = null;
        setGeo((g) => {
          persist(g);
          return g;
        });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [open, persist]);

  // Re-clamp on viewport resize so a window parked at the right edge does not
  // end up off-screen when the browser shrinks.
  useEffect(() => {
    const onResize = () => setGeo((g) => clampToViewport(g));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const chooseSkin = (id: SkinId) => {
    setSkinId(id);
    saveSkin(id);
  };

  return (
    <div
      role="dialog"
      aria-label="Chat"
      className="fixed z-50 flex flex-col overflow-hidden rounded-[28px] shadow-2xl ring-1 ring-white/10"
      style={{ left: geo.x, top: geo.y, width, height: geo.h }}
    >
      {/* Header — drag handle, skin switcher, close */}
      <div
        onPointerDown={(e) => {
          drag.current = { dx: e.clientX - geo.x, dy: e.clientY - geo.y };
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        className={`shrink-0 cursor-grab active:cursor-grabbing select-none px-4 py-3 ${skin.header}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`truncate ${skin.headerTitle}`}>{title}</span>
            {status}
          </div>
          <button
            onClick={onClose}
            aria-label="Close chat"
            className="shrink-0 w-8 h-8 grid place-items-center rounded-full text-white/60 hover:text-white hover:bg-white/10"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="mt-2 flex gap-1" onPointerDown={(e) => e.stopPropagation()}>
          {SKIN_ORDER.map((id) => (
            <button
              key={id}
              onClick={() => chooseSkin(id)}
              className={`px-3 py-1 rounded-full text-[14px] transition-colors ${
                id === skinId
                  ? 'bg-white/20 text-white'
                  : 'text-white/45 hover:text-white/80 hover:bg-white/10'
              }`}
            >
              {SKINS[id].label}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation surface */}
      <div className={`flex-1 min-h-0 flex flex-col ${skin.surface}`}>{children(skin)}</div>

      {/* Resize grip. Height drives width, so the frame stays a phone. */}
      <div
        onPointerDown={(e) => {
          resize.current = { startY: e.clientY, startH: geo.h };
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        aria-label="Resize chat"
        className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize opacity-40 hover:opacity-80"
      >
        <svg viewBox="0 0 24 24" className="w-full h-full text-white" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 10L10 20M20 16l-4 4" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
