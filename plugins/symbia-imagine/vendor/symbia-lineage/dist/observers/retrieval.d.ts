import type { Identity } from '@symbia/crypto';
import type { RetrievalSource } from '../claims.js';
import type { AttestationLevel } from '../attestation.js';
export interface RetrieveOptions {
    url: string;
    identity: Identity;
    level: AttestationLevel;
    genesis?: {
        id: string;
        epoch?: string;
        fingerprint?: string;
    } | null;
    idPrefix?: string;
    sink: (line: string) => void;
    /** Where the retrieved bytes go. Omit to observe without storing. */
    onData?: (chunk: Buffer) => void;
    maxRedirects?: number;
    /** Refuse bodies over this size rather than filling memory or disk. */
    maxBytes?: number;
    timeoutMs?: number;
    headers?: Record<string, string>;
    /**
     * Target bytes per chained chunk. Arriving data is coalesced to roughly this
     * before a lineage event is written.
     *
     * This matters more than it looks. Signing each `data` event directly means
     * chunking at whatever size TCP happened to deliver — measured at ~1.4 KB,
     * which produced 11.4 KB of ledger for 19 KB of content, 60% overhead, and
     * 148 signatures for a 200 KB page. At 64 KB the same page is four events.
     *
     * The floor on this is the crash case: chunks are the granularity at which a
     * dead transfer stays attested, so a very large value trades recoverable
     * evidence for a smaller ledger.
     */
    chunkBytes?: number;
}
export interface RetrieveResult {
    observation_id: string;
    source: RetrievalSource;
    chunks: number;
    bytes: number;
    head: string;
    complete: boolean;
    note: string | null;
}
/**
 * Fetch a URL and produce a signed, chained observation of what came back.
 *
 * Resolves even when the retrieval fails partway: a truncated observation is
 * still evidence about what arrived, and throwing it away would lose exactly
 * the information a reader most needs.
 */
export declare function retrieve(opts: RetrieveOptions): Promise<RetrieveResult>;
//# sourceMappingURL=retrieval.d.ts.map