/**
 * A spyglass instance as a first-class network node.
 *
 * Each spawn mints its OWN id and registers separately. The instance id is what
 * ties a chat message to the frame it is asking about: the message carries the
 * node id and the digest, the mesh carries the capture event under that same
 * node id, and the vision request is keyed by the same digest. Three records,
 * one identity, and none of them is the picture.
 *
 * That is also why the id is created by the SPAWN rather than by this module —
 * whoever opens the aperture is the thing that brought the capability into
 * existence, and the record should say so.
 *
 * TWO PATHS, DELIBERATELY SEPARATE:
 *
 *   METADATA  goes on the messaging bus as a `capture.frame` event — digest,
 *             dimensions, source, run id, node id. Visible in the topology and
 *             the traces like any other event.
 *   PIXELS    go over HTTP to the models service and nowhere else. They do not
 *             touch the messaging service, they are not in any socket frame,
 *             and they are keyed by the same digest so the two halves refer to
 *             the same frame and either one alone is checkable.
 *
 * The separation is not an optimisation. Putting the bytes on the bus would put
 * them in reach of every participant in a conversation, which is the thing this
 * design exists to prevent.
 */
import { io, type Socket } from 'socket.io-client';
import { socketPath } from '@/config/endpoints';
import { useAuthStore } from '@/stores/authStore';
import { requestGrant, withdraw, forget } from './pixelVault';
import { describeFrame, type VisionOutcome } from './visionClient';

export type { VisionOutcome };

/** Mint an id for a new aperture. Called by whatever spawns it. */
export function mintSpyglassId(): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `client:spyglass:${rand}`;
}

let socket: Socket | null = null;
const registered = new Set<string>();

/** Connect and register this instance. Idempotent per id. */
export async function connectSpyglassNode(nodeId: string): Promise<boolean> {
  if (registered.has(nodeId) && socket?.connected) return true;

  const token = useAuthStore.getState().token;
  socket =
    socket ??
    io(window.location.origin, {
      path: socketPath('network'),
      auth: token ? { token } : undefined,
      reconnection: true,
      // NO explicit `transports`.
      //
      // This was ['websocket', 'polling'], copied from networkClient.ts, whose
      // comment reads "Force websocket transport to avoid polling issues" — a
      // conclusion with no measurement behind it. Measured 7 Aug 2026 through
      // the control center proxy: the socket reports
      // `connect_error: websocket error` and never registers. Naming websocket
      // first does not mean "prefer"; it means the handshake starts there, and
      // when the upgrade path through the proxy fails, the connection fails
      // with it rather than quietly downgrading.
      //
      // messagingBridge.ts omits the option entirely and its socket works.
      // Default order is polling first, then upgrade — which survives a proxy
      // that cannot carry the upgrade, and uses websockets when it can.
    });

  return new Promise((resolve) => {
    const done = (ok: boolean) => resolve(ok);

    const register = () => {
      socket!.emit(
        'node:register',
        {
          id: nodeId,
          name: 'Spyglass',
          type: 'client',
          // Declared, not assumed. The mesh can see what this node claims to
          // do before it does any of it. Note what is NOT claimed: this node
          // does not offer pixels to anyone.
          capabilities: ['capture.frame', 'vision.request'],
          endpoint: window.location.origin,
          metadata: { surface: 'browser', tool: 'spyglass', pixelsOnBus: false },
        },
        (r: { ok?: boolean; error?: string }) => {
          if (r?.ok) {
            registered.add(nodeId);
            console.log(`[spyglass] registered on the mesh as ${nodeId}`);
          } else {
            console.warn(`[spyglass] mesh refused registration:`, r?.error ?? r);
          }
          done(Boolean(r?.ok));
        }
      );
    };

    // Emit unconditionally, and re-emit on every future connect.
    //
    // This was `if (connected) register(); else once('connect', register)`,
    // which loses the race whenever the socket finishes connecting between the
    // `connected` check and the listener being attached: the branch takes the
    // `else`, the connect event has already fired, and `once` waits for a
    // second one that never comes. Measured 7 Aug 2026 — the socket reported
    // connected=true, capture.frame events from the SAME socket reached the
    // service, and node:register never arrived at all. The service logged
    // nothing because nothing was sent.
    //
    // Socket.IO buffers emits until the transport is up, so calling it
    // unconditionally is simply correct. `on`, not `once`, so the node
    // re-registers after a reconnect — which matters here, because the
    // network service has been crash-looping and a node that registers only
    // once disappears from the topology the first time it restarts.
    register();
    socket!.on('connect', register);
    socket!.once('connect_error', (err) => {
      console.warn('[spyglass] mesh connect_error', (err as Error)?.message ?? err);
      done(false);
    });
    setTimeout(() => {
      if (!registered.has(nodeId)) {
        console.warn(
          `[spyglass] not registered on the mesh after 6s (connected=${socket?.connected}). ` +
            'Frames will still capture and classify; they will not appear in the topology.'
        );
      }
      done(registered.has(nodeId));
    }, 6000);
  });
}

export function disconnectSpyglassNode(nodeId: string): void {
  registered.delete(nodeId);
  if (registered.size === 0) {
    socket?.disconnect();
    socket = null;
  }
}

export interface FrameEnvelope {
  runId: string;
  digest: string;
  bytes: number;
  width: number;
  height: number;
  source: string;
  nodeId: string;
  capturedAt: string;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

/**
 * Publish a frame's ENVELOPE on the bus and return it.
 *
 * The PNG is not a parameter here by design — this function could not put the
 * bytes on the socket if it wanted to. It takes a digest that has already been
 * computed and deposited in the vault.
 */
export async function publishEnvelope(
  digest: string,
  meta: { width: number; height: number; source: string; nodeId: string; bytes: number }
): Promise<FrameEnvelope> {
  const envelope: FrameEnvelope = {
    runId: `spyglass_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    digest,
    bytes: meta.bytes,
    width: meta.width,
    height: meta.height,
    source: meta.source,
    nodeId: meta.nodeId,
    capturedAt: new Date().toISOString(),
  };

  if (socket?.connected) {
    // 'event:send'. NOT 'event:emit'.
    //
    // 'event:emit' is a name I invented. The network service listens for
    // 'event:send' (socket.ts:359) and nothing else, so every frame published
    // for a day went into a socket that had no listener for it — emitted
    // successfully, delivered nowhere, zero errors. Measured: 0 capture.frame
    // events on the bus while the code said it was publishing them.
    //
    // Socket.IO will happily emit any string. That is the whole failure: an
    // event name is an API, and I wrote a client against one I had assumed
    // instead of one I had read.
    socket.emit(
      'event:send',
      {
        // The `payload` WRAPPER is required. Sending { type, data } flat is
        // what crashed the network service — it dereferenced data.payload.type
        // outside its try block and the process exited. Shape read from
        // network/server/src/socket.ts:359, not guessed at this time.
        payload: { type: 'capture.frame', data: envelope },
        source: meta.nodeId,
        boundary: 'intra',
        runId: envelope.runId,
      },
      (ack: { ok?: boolean; error?: string } | undefined) => {
        // The service acks. Reading it is the difference between "published"
        // and "handed to a socket".
        if (ack?.ok) console.log(`[spyglass] capture.frame ${envelope.digest} accepted by the mesh`);
        else console.warn(`[spyglass] capture.frame ${envelope.digest} not accepted:`, ack?.error ?? ack);
      }
    );
  } else {
    // Say so. Measured 7 Aug 2026: zero capture.frame events were on the bus
    // and no spyglass node was in the topology, while every commit message
    // said frames travel the mesh. A silent `if (connected)` turns "the mesh
    // is not connected" into "the mesh has nothing to show", which are the
    // same picture and completely different problems.
    console.warn(
      `[spyglass] capture.frame ${envelope.digest} NOT published — no mesh socket. ` +
        'The frame is still captured and still classified; it is simply not on the bus.'
    );
  }

  return envelope;
}

/** Compute a frame's digest. Exported so the caller can deposit before publishing. */
export const frameDigest = sha256Hex;

/**
 * Send a frame to be looked at.
 *
 * The bytes are withdrawn from the vault against a grant issued to
 * `service:models`, used once, and forgotten. Nothing returns the image to the
 * caller — this function's return type is the outcome, so a caller that wanted
 * the pixels back would have to go to the vault itself and be refused there.
 *
 * TWO DOORS, TRIED IN ORDER, and which one answered is recorded rather than
 * inferred:
 *
 *   integrations  the LLM gateway, the same door assistants use. Credential
 *                 from identity, circuit breaker in front, usage logged.
 *   models        the local GGUF service. Currently refuses — no vision model
 *                 is on disk — and that refusal is a real answer.
 *
 * The local service is tried only after the gateway declines, and its refusal
 * is returned as the refusal. There is no arrangement in which both decline
 * and something plausible comes back anyway.
 */
export async function classifyHeldFrame(
  envelope: FrameEnvelope,
  prompt?: string
): Promise<VisionOutcome> {
  const grant = requestGrant('service:models', envelope.digest);
  const bytes = withdraw(grant);
  if (!bytes) {
    return {
      arena: 'REFUSED',
      reason: 'Pixels were not released from the vault.',
      path: 'none',
    };
  }

  try {
    const viaGateway = await describeFrame(bytes, prompt);
    if (viaGateway.arena === 'COMPOSED') return viaGateway;

    // The gateway declined. Ask the local service, and if it also declines,
    // report BOTH refusals — "no vision model locally" and "no vision-capable
    // provider" are different problems with different fixes, and collapsing
    // them into one message would send the reader to the wrong one.
    const token = useAuthStore.getState().token;
    const res = await fetch('/svc/models/api/vision/classify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        imageBase64: bytes,
        prompt,
        source: `${envelope.source}#${envelope.digest}`,
      }),
    });
    const local = (await res.json()) as {
      ok?: boolean;
      description?: string;
      reason?: string;
      missing?: string[];
    };

    if (local.ok && local.description) {
      return { arena: 'COMPOSED', description: local.description, path: 'models' };
    }

    return {
      arena: 'REFUSED',
      reason: `Gateway: ${viaGateway.reason ?? 'declined'} · Local: ${
        local.reason ?? 'declined'
      }${local.missing?.length ? ` (${local.missing[0]})` : ''}`,
      provider: viaGateway.provider,
      model: viaGateway.model,
      path: viaGateway.path,
    };
  } finally {
    // The pixels have been where they were going. Holding them longer would
    // widen the window in which something could reach for them, for no gain.
    forget(envelope.digest);
  }
}
