/**
 * Verifying a sealed imagine bundle.
 *
 * WHY THIS IS A LIBRARY AND NOT A FUNCTION IN THE IMPORTER. The bundle carries
 * two digests — one over its artifacts, one over its bodies — and both are only
 * protective if somebody recomputes them. Measured 19 Aug: the promote path in
 * the MCP server declared `artifactsDigest` in its type annotation and never
 * compared it, so the tamper protection added on 16 Aug had been available and
 * unexercised since the day it shipped. A check that each consumer is expected
 * to remember is a check that some consumer will not have.
 *
 * WHAT THE TWO LAYERS DO, measured against a real sealed bundle:
 *
 *   edit a body                              chain walks, bodies digest breaks
 *   remove a body                            chain walks, bodies digest breaks
 *   edit an artifact                         chain walks, artifacts digest breaks
 *   edit the seal event to match the edit    chain BREAKS
 *
 * So the digest comparison catches the content edit, and the chain walk catches
 * the attempt to update the digest to cover it. Neither alone is sufficient and
 * the chain walk alone is what an importer would naturally reach for, because
 * the chain is the part that looks like the security mechanism.
 */
import { type LineageEvent } from './chain.js';
export interface SealedBundle {
    trace?: LineageEvent[];
    artifacts?: unknown;
    bodies?: unknown;
    seal?: {
        checksum?: string;
        artifactsDigest?: string;
        bodiesDigest?: string;
    };
    completeness?: {
        held?: number;
        declared?: number;
        complete?: boolean;
        state?: string;
    };
    content?: {
        held?: number;
        addressable?: number;
        complete?: boolean;
    };
}
export interface BundleVerdict {
    ok: boolean;
    chain: {
        ok: boolean;
        at?: number;
        of: number;
        reason?: string;
    };
    artifacts: {
        checked: boolean;
        ok: boolean;
    };
    bodies: {
        checked: boolean;
        ok: boolean;
    };
    /** Everything that failed, in the words a caller can show a user. */
    problems: string[];
    /** True findings that are not failures. A reader needs both, separated. */
    notes: string[];
}
export declare function verifyBundle(bundle: SealedBundle): BundleVerdict;
//# sourceMappingURL=bundle.d.ts.map