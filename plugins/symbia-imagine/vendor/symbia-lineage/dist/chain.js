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
import { signDocument, verifyDocument, sha256Hex, canonicalJson } from '@symbia/crypto';
import { createHash } from 'node:crypto';
/** 32 zero bytes, so the first entry has a parent like every other entry. */
export const GENESIS = '0'.repeat(64);
/** chain(n) = sha256( chain(n-1) ‖ digest(n) ) */
export function advance(chainHex, digestHex) {
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
function normalizeEvent(ev) {
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
/**
 * The digest an event contributes to the chain: canonical JSON of the
 * NORMALIZED event minus its seal fields (checksum, signature). Exported so
 * every producer and verifier computes the same bytes — the spike that found
 * the round-trip defect had its own JSON.stringify version of this, and it
 * broke for exactly the reason this module now normalizes.
 */
export function eventDigest(ev) {
    const { checksum: _c, signature: _s, ...unsealed } = normalizeEvent(ev);
    return sha256Hex(canonicalJson(unsealed));
}
export function signEvent(ev, identity) {
    if (!identity?.privateKey)
        return null;
    return signDocument(normalizeEvent(ev), identity);
}
export function verifyEvent(ev, publicKey) {
    return verifyDocument(normalizeEvent(ev), publicKey);
}
/** JSONL line with a fixed top-level key order, so ledgers stay readable. */
export function lineageLine(ev) {
    return JSON.stringify(normalizeEvent(ev)) + '\n';
}
//# sourceMappingURL=chain.js.map