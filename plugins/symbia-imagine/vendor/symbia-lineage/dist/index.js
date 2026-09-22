/**
 * @symbia/lineage — signed, chained records for anything entering as context.
 *
 * The spyglass is one observer, not the category. A file a user uploads and a
 * page fetched from a URL are observations too, and an answer composed over
 * them is only as good as what is known about how they arrived. This library is
 * the common substrate: identical cryptographic strength for every observer,
 * with the differences between them expressed as CLAIMS rather than smoothed
 * away into one badge.
 *
 * See src/claims.ts — the claim vocabulary is the load-bearing part, not the
 * hashing.
 */
export { GENESIS, advance, sha256Hex, signEvent, verifyEvent, lineageLine, eventDigest, } from './chain.js';
export { ARTIFACT_CLAIMS, sealArtifactEvent, registeredPayload, derivedPayload, artifactDigest, } from './artifact.js';
export { CLAIMS, } from './claims.js';
export { ATTESTATION_MEANS, substantiate, } from './attestation.js';
export { Observation } from './observation.js';
export { retrieve, } from './observers/retrieval.js';
export { verifyBundle, } from './bundle.js';
//# sourceMappingURL=index.js.map