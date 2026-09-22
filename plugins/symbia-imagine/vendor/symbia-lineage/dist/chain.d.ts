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
import { sha256Hex, type Identity } from '@symbia/crypto';
import { type KeyObject } from 'node:crypto';
/** 32 zero bytes, so the first entry has a parent like every other entry. */
export declare const GENESIS: string;
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
export declare function advance(chainHex: string, digestHex: string): string;
export { sha256Hex };
/**
 * The digest an event contributes to the chain: canonical JSON of the
 * NORMALIZED event minus its seal fields (checksum, signature). Exported so
 * every producer and verifier computes the same bytes — the spike that found
 * the round-trip defect had its own JSON.stringify version of this, and it
 * broke for exactly the reason this module now normalizes.
 */
export declare function eventDigest(ev: LineageEvent): string;
export declare function signEvent(ev: LineageEvent, identity: Identity | null): string | null;
export declare function verifyEvent(ev: LineageEvent, publicKey: KeyObject): boolean;
/** JSONL line with a fixed top-level key order, so ledgers stay readable. */
export declare function lineageLine(ev: LineageEvent): string;
//# sourceMappingURL=chain.d.ts.map