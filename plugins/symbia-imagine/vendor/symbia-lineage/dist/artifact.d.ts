import type { Identity } from '@symbia/crypto';
import { type LineageEvent } from './chain.js';
import type { Claim } from './claims.js';
/** What an artifact event asserts, in words, per the claims discipline. */
export declare const ARTIFACT_CLAIMS: Record<'registered' | 'derived_verified' | 'derived_asserted', Claim>;
export interface ArtifactSource {
    type: 'local' | 'huggingface' | 'url';
    repo?: string;
    file?: string;
    url?: string;
}
export interface DerivationRecipe {
    /** Tool name as invoked, e.g. `llama-quantize`. */
    tool: string;
    toolVersion?: string;
    toolchain?: string;
    args: string[];
    /** Digests of any secondary inputs (calibration sets, imatrix files). */
    inputDigests?: Record<string, string>;
}
export interface ArtifactRegisteredPayload {
    /** `sha256:<hex>` of the bytes. */
    digest: string;
    bytes?: number;
    format?: string;
    precision?: string;
    source?: ArtifactSource;
    claim: Claim;
    /** Producer-specific additions, kept out of the typed vocabulary. */
    extra?: Record<string, unknown>;
}
export interface ArtifactDerivedPayload {
    parentDigest: string;
    childDigest: string;
    recipe: DerivationRecipe;
    /**
     * `verified` only when the recipe is deterministic. If you cannot hand a
     * stranger the parent and the recipe and have them reproduce the child
     * digest, this is `asserted`.
     */
    parentLink: 'verified' | 'asserted';
    /** True when reproduction was actually measured; null when not attempted. */
    deterministic: boolean | null;
    /** The digest a reproduction run produced, when one was run. */
    reproductionDigest?: string;
    claim: Claim;
    /** Producer-specific additions, kept out of the typed vocabulary. */
    extra?: Record<string, unknown>;
}
export interface SealArtifactOptions {
    eventType: 'artifact.registered' | 'artifact.derived';
    payload: ArtifactRegisteredPayload | ArtifactDerivedPayload;
    actor: string;
    /** Current chain head (GENESIS for a fresh chain). */
    chain: string;
    parents: (string | null)[];
    identity: Identity | null;
    timestamp?: string;
    eventId?: string;
}
export interface SealedArtifactEvent {
    event: LineageEvent;
    /** The new chain head, to thread into the next seal. */
    chain: string;
}
/** Build payload helpers that refuse the likeliest misuse. */
export declare function derivedPayload(p: Omit<ArtifactDerivedPayload, 'claim'>): ArtifactDerivedPayload;
export declare function registeredPayload(p: Omit<ArtifactRegisteredPayload, 'claim'>): ArtifactRegisteredPayload;
/**
 * Seal one artifact event onto a chain: digest → advance → checksum → sign.
 * The digest convention is `eventDigest` (normalized canonical JSON), the
 * same bytes a verifier recomputes after a JSONL round-trip.
 */
export declare function sealArtifactEvent(opts: SealArtifactOptions): SealedArtifactEvent;
/** Convenience: `sha256:<hex>` for a buffer or string. */
export declare function artifactDigest(data: Buffer | string): string;
//# sourceMappingURL=artifact.d.ts.map