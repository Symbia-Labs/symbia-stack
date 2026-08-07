/**
 * The spyglass as a first-class network node.
 *
 * It registers itself on the mesh like any other participant, and the frames
 * it captures travel the messaging bus rather than being POSTed straight at
 * whatever wants them. That is the platform's own rule applied to a feature
 * that could easily have skipped it: a capability that enters without a
 * recorded gate is the thing this codebase exists to refuse, and "it's just a
 * screenshot" is exactly the argument that would have let it through.
 *
 * So a frame grab is an EVENT with a source, a run id and a digest, visible in
 * the topology and the traces alongside everything else.
 */
import { io, type Socket } from 'socket.io-client';
import { socketPath } from '@/config/endpoints';
import { useAuthStore } from '@/stores/authStore';

export const SPYGLASS_NODE_ID = 'client:spyglass';

let socket: Socket | null = null;
let registered = false;

/** Connect and register. Idempotent. */
export async function connectSpyglassNode(): Promise<boolean> {
  if (registered && socket?.connected) return true;

  const token = useAuthStore.getState().token;
  socket =
    socket ??
    io(window.location.origin, {
      path: socketPath('network'),
      auth: token ? { token } : undefined,
      reconnection: true,
      transports: ['websocket', 'polling'],
    });

  return new Promise((resolve) => {
    const done = (ok: boolean) => resolve(ok);

    const register = () => {
      socket!.emit(
        'node:register',
        {
          id: SPYGLASS_NODE_ID,
          name: 'Spyglass',
          type: 'client',
          // Declared, not assumed. The mesh can see what this node claims to
          // do before it does any of it.
          capabilities: ['capture.frame', 'vision.request'],
          endpoint: window.location.origin,
          metadata: { surface: 'browser', tool: 'spyglass' },
        },
        (r: { ok?: boolean }) => {
          registered = Boolean(r?.ok);
          done(registered);
        }
      );
    };

    if (socket!.connected) register();
    else socket!.once('connect', register);
    socket!.once('connect_error', () => done(false));
    setTimeout(() => done(registered), 6000);
  });
}

export interface FrameEnvelope {
  runId: string;
  digest: string;
  bytes: number;
  width: number;
  height: number;
  source: string;
  capturedAt: string;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

/**
 * Publish a captured frame on the bus and return its envelope.
 *
 * The PNG itself is NOT put on the socket. Socket.IO's default payload cap is
 * 1MB and a full-resolution frame regularly exceeds it — a frame that silently
 * fails to send would look exactly like a frame nobody asked about. The event
 * carries the envelope (digest, size, source, run id); the bytes go to the
 * vision endpoint over HTTP, keyed by that digest, so both halves refer to the
 * same frame and either one alone is checkable.
 */
export async function publishFrame(
  pngBase64: string,
  meta: { width: number; height: number; source: string }
): Promise<FrameEnvelope> {
  const digest = await sha256Hex(pngBase64);
  const envelope: FrameEnvelope = {
    runId: `spyglass_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    digest,
    bytes: Math.round((pngBase64.length * 3) / 4),
    width: meta.width,
    height: meta.height,
    source: meta.source,
    capturedAt: new Date().toISOString(),
  };

  if (socket?.connected) {
    socket.emit('event:emit', {
      type: 'capture.frame',
      data: envelope,
      source: SPYGLASS_NODE_ID,
      boundary: 'intra',
      runId: envelope.runId,
    });
  }

  return envelope;
}

/** Ask the models service to look at a frame. Returns its verdict verbatim. */
export async function classifyFrame(
  pngBase64: string,
  envelope: FrameEnvelope,
  prompt?: string
): Promise<unknown> {
  const token = useAuthStore.getState().token;
  const res = await fetch('/svc/models/api/vision/classify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      imageBase64: pngBase64,
      prompt,
      source: `${envelope.source}#${envelope.digest}`,
    }),
  });
  return res.json();
}

export function disconnectSpyglassNode(): void {
  socket?.disconnect();
  socket = null;
  registered = false;
}
