/**
 * What chat is allowed to know about a captured frame.
 *
 * METADATA ONLY. There is no image in this type and there must never be one.
 * The previous version carried `imageBase64` here and the composer rendered it
 * as a thumbnail, which demonstrated precisely the opposite of the claim being
 * made: that chat had the pixels in hand and was one line away from doing
 * anything with them. The bytes now live behind pixelVault and chat is not on
 * its allowlist.
 *
 * What survives is the envelope plus whatever the vision service concluded —
 * digest, dimensions, source, run id, the node that captured it, and the
 * verdict verbatim. That is enough to ask a question about the frame, to find
 * the same frame again in the traces, and to check that the thing the assistant
 * answered about is the thing that was photographed. It is not enough to look
 * at it, which is the point.
 *
 * One slot, not a queue. A queue lets attachments pile up unseen and travel
 * with a message the operator was no longer thinking about when they took them.
 */
import { create } from 'zustand';
import type { FrameEnvelope } from './spyglassNode';

export interface FrameMetadata {
  envelope: FrameEnvelope;
  /** The spyglass instance that captured it. Minted at spawn, registered on the mesh. */
  nodeId: string;
  /** Whatever the vision service said, verbatim. A refusal is a legitimate value. */
  verdict?: string;
  /** True when the service refused. Recorded, never inferred from an empty verdict. */
  refused?: boolean;
  /**
   * The platform's own vocabulary for what kind of answer this is. COMPOSED
   * means a model looked at the frame; REFUSED means nothing did. Carried
   * rather than derived so the receipt says what happened, not what the shape
   * of the string suggests.
   */
  arena?: 'COMPOSED' | 'REFUSED';
  /** Which provider and model answered, when one did. */
  provider?: string;
  model?: string;
  /** Which door it came through: the integrations gateway, or the local models service. */
  path?: 'integrations' | 'models' | 'none';
  /** Set once the pixels have been released from the vault. */
  pixelsDropped?: boolean;
}

interface FrameState {
  pending: FrameMetadata | null;
  setPending: (f: FrameMetadata | null) => void;
  clear: () => void;
}

export const useFrameStore = create<FrameState>((set) => ({
  pending: null,
  setPending: (pending) => set({ pending }),
  clear: () => set({ pending: null }),
}));
