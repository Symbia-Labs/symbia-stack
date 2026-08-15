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

/**
 * The one shape that gets signed, verified, and serialized.
 *
 * Signing and serialization used to disagree about absent optional fields:
 * `signDocument` canonicalizes what it is given, and `lineageLine` wrote
 * `continuity_context: null` for an event that had no such key — so an event
 * signed without the field failed verification after a round-trip through
 * this module's own serializer. Found 15 Aug 2026 by the model-derivation
 * spike (3/3 signatures failed until the caller materialized the field).
 *
 * The fix is normalize-before-sign: sign, verify, and serialize all pass
 * through here, so there is exactly one answer to "what bytes does the
 * signature cover". Absent and null are the same statement — "no continuity
 * context" — and now they are the same bytes.
 */
function normalizeEvent(ev: LineageEvent): LineageEvent {
  return {
    event_id: ev.event_id,
    timestamp: ev.timestamp,
    actor_identity: ev.actor_identity,
    event_type: ev.event_type,
    payload: ev.payload,
    continuity_context: ev.continuity_context ?? null,
    parent_links: ev.parent_links,
    checksum: ev.checksum,
    signature: ev.signature ?? null,
  };
}

export function signEvent(ev: LineageEvent, identity: Identity | null): string | null {
  if (!identity?.privateKey) return null;
  return signDocument(normalizeEvent(ev), identity);
}

export function verifyEvent(ev: LineageEvent, publicKey: KeyObject): boolean {
  return verifyDocument(normalizeEvent(ev), publicKey);
}

/** JSONL line with a fixed top-level key order, so ledgers stay readable. */
export function lineageLine(ev: LineageEvent): string {
  return JSON.stringify(normalizeEvent(ev)) + '\n';
}
