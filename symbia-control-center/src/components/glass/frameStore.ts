/**
 * The frame the operator has parked the spyglass over and captured, waiting to
 * be sent with their next message.
 *
 * This is a one-slot store, not a queue. A queue would let attachments pile up
 * unseen and travel with a message the operator was no longer thinking about
 * when they grabbed them. One slot, visible in the composer, cleared on send.
 *
 * The IMAGE lives here only long enough to be sent. What survives in the
 * message is the envelope — digest, size, source, run id — because that is what
 * makes the frame checkable later. A picture with no digest is a picture nobody
 * can prove was the one that was looked at.
 */
import { create } from 'zustand';
import type { FrameEnvelope } from './spyglassNode';

export interface PendingFrame {
  envelope: FrameEnvelope;
  /** PNG bytes, base64. Dropped as soon as the message is sent. */
  imageBase64: string;
  /** Whatever the vision model said, verbatim. A refusal is a legitimate value. */
  verdict?: string;
  /** True when the model refused. Not inferred from an empty verdict. */
  refused?: boolean;
}

interface FrameState {
  pending: PendingFrame | null;
  setPending: (f: PendingFrame | null) => void;
  clear: () => void;
}

export const useFrameStore = create<FrameState>((set) => ({
  pending: null,
  setPending: (pending) => set({ pending }),
  clear: () => set({ pending: null }),
}));
