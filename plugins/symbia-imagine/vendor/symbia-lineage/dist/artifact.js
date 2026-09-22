/**
 * Artifact events: registration and derivation.
 *
 * Settled 15 Aug 2026 (models-defect-closure stage 3), after the
 * model-derivation spike invented these shapes ad hoc and proved the
 * mechanism: quantization is a pure function of parent + recipe, so a
 * derivation can be a CHECKABLE claim — re-run the recipe, compare the
 * digest — rather than an asserted one. The vocabulary lives here so the
 * next producer does not invent a third shape.
 *
 * The distinction that matters is carried in `parentLink`:
 *
 *   - `verified`  — the transform is deterministic and the link can be
 *     recomputed by anyone holding the parent and the recipe. Quantization
 *     with a pinned tool and args qualifies. This is the claims vocabulary's
 *     strongest artifact-to-artifact statement.
 *   - `asserted`  — the producer says this came from that, and nothing can
 *     recompute it. Distillation and fine-tuning are here BY CONSTRUCTION:
 *     training is not bit-reproducible, so a distilled child is a new root
 *     with a stated ancestor, not a derived copy. Writing `verified` on one
 *     of these would be the "correct hash presented as more than it is"
 *     defect claims.ts exists to prevent.
 */
import { createHash } from 'node:crypto';
import { advance, eventDigest, signEvent, } from './chain.js';
/** What an artifact event asserts, in words, per the claims discipline. */
export const ARTIFACT_CLAIMS = {
    registered: {
        asserts: 'These exact bytes, named by this digest, were registered by this actor at this time, from the stated source.',
        does_not_assert: 'Anything about what the bytes do, whether the stated source is authentic, or that the source would serve the same bytes again. A faithfully registered forgery is still a forgery.',
    },
    derived_verified: {
        asserts: 'The child bytes are the output of the stated deterministic recipe applied to the parent bytes. Anyone holding the parent and the recipe can recompute the child digest.',
        does_not_assert: 'Anything about the parent\'s own provenance, or about the quality of the child. A perfect derivation of a corrupted parent is a perfect copy of the corruption.',
    },
    derived_asserted: {
        asserts: 'The producer states that the child was made from the parent by the stated process.',
        does_not_assert: 'That the link can be recomputed or checked by anyone. Training-derived artifacts (distillation, fine-tuning) are always this, not `verified` — the process is not bit-reproducible.',
    },
};
/** Build payload helpers that refuse the likeliest misuse. */
export function derivedPayload(p) {
    if (p.parentLink === 'verified' && p.deterministic === false) {
        throw new Error('parentLink "verified" with deterministic:false is a contradiction — a measured non-reproduction downgrades the link to "asserted"');
    }
    return {
        ...p,
        claim: p.parentLink === 'verified' ? ARTIFACT_CLAIMS.derived_verified : ARTIFACT_CLAIMS.derived_asserted,
    };
}
export function registeredPayload(p) {
    return { ...p, claim: ARTIFACT_CLAIMS.registered };
}
/**
 * Seal one artifact event onto a chain: digest → advance → checksum → sign.
 * The digest convention is `eventDigest` (normalized canonical JSON), the
 * same bytes a verifier recomputes after a JSONL round-trip.
 */
export function sealArtifactEvent(opts) {
    const ev = {
        event_id: opts.eventId ?? crypto.randomUUID(),
        timestamp: opts.timestamp ?? new Date().toISOString(),
        actor_identity: opts.actor,
        event_type: opts.eventType,
        payload: opts.payload,
        parent_links: opts.parents,
        checksum: '',
        signature: null,
    };
    const chain = advance(opts.chain, eventDigest(ev));
    ev.checksum = `sha256:${chain}`;
    ev.signature = signEvent(ev, opts.identity);
    return { event: ev, chain };
}
/** Convenience: `sha256:<hex>` for a buffer or string. */
export function artifactDigest(data) {
    return `sha256:${createHash('sha256').update(data).digest('hex')}`;
}
//# sourceMappingURL=artifact.js.map