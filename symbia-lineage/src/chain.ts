/**
 * The chain, and the event shape it links.
 *
 * A chain is not there to let anything be reconstructed — the artifact
 * reconstructs itself, it is a file. It is there to STAMP RELIABLY. The head
 * commits to every entry in order, so altering, dropping or reordering any
 * entry breaks the chain from that point forward.
 *
 * The break is LOCAL, which is the property worth having: everything before the
 * damage stays verifiable, so a corrupted record degrades to a shorter
 * trustworthy record rather than to nothing at all.
 */
import { signDocument, verifyDocument, sha256Hex, type Identity } from '@symbia/crypto';
import { createHash, type KeyObject } from 'node:crypto';

/** 32 zero bytes, so the first entry has a parent like every other entry. */
export const GENESIS = '0'.repeat(64);

export interface LineageEvent {
  event_id: string;
  timestamp: string;
  actor_identity: string;
  event_type: string;
  payload: unknown;
  continuity_context?: unknown;
  parent_links: (string | null)[];
  /** The chain value this event commits to, `sha256:<hex>`. */
  checksum: string;
  /** `ed25519:<base64>` over the canonical event minus this field. */
  signature?: string | null;
}

/** chain(n) = sha256( chain(n-1) ‖ digest(n) ) */
export function advance(chainHex: string, digestHex: string): string {
  return createHash('sha256')
    .update(Buffer.from(chainHex, 'hex'))
    .update(Buffer.from(digestHex, 'hex'))
    .digest('hex');
}

export { sha256Hex };

export function signEvent(ev: LineageEvent, identity: Identity | null): string | null {
  if (!identity?.privateKey) return null;
  return signDocument(ev, identity);
}

export function verifyEvent(ev: LineageEvent, publicKey: KeyObject): boolean {
  return verifyDocument(ev, publicKey);
}

/** JSONL line with a fixed top-level key order, so ledgers stay readable. */
export function lineageLine(ev: LineageEvent): string {
  return JSON.stringify({
    event_id: ev.event_id,
    timestamp: ev.timestamp,
    actor_identity: ev.actor_identity,
    event_type: ev.event_type,
    payload: ev.payload,
    continuity_context: ev.continuity_context ?? null,
    parent_links: ev.parent_links,
    checksum: ev.checksum,
    signature: ev.signature ?? null,
  }) + '\n';
}
