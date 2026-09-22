import { type Identity } from '@symbia/crypto';
import { type ObserverKind, type ObservationSource } from './claims.js';
import { type AttestationLevel } from './attestation.js';
export interface ObservationInit {
    kind: ObserverKind;
    /** Prefix for the observer's id, e.g. `spyglass:instrument`. */
    idPrefix: string;
    identity: Identity;
    level: AttestationLevel;
    genesis?: {
        id: string;
        epoch?: string;
        fingerprint?: string;
    } | null;
    source: ObservationSource;
    /** Where lineage lines are written. Injected so this stays storage-agnostic. */
    sink: (line: string) => void;
    /** Overridable for tests. */
    now?: () => Date;
}
export declare class Observation {
    readonly id: string;
    readonly observer: string;
    private chain;
    private seq;
    private bytes;
    private lastEventId;
    private readonly init;
    private readonly now;
    constructor(init: ObservationInit);
    /** Append a chunk of the observed content. Hashed and chained on arrival. */
    chunk(buf: Buffer): {
        seq: number;
        digest: string;
        chain: string;
    };
    /**
     * Seal the observation.
     *
     * `complete` is explicit and is not inferred from the absence of an error.
     * A truncated download and a finished one produce identical-looking ledgers
     * otherwise, and "it stopped" must never read as "it finished" — that is the
     * failure this whole apparatus exists to prevent.
     */
    close(opts?: {
        complete: boolean;
        note?: string;
    }): {
        id: string;
        chunks: number;
        bytes: number;
        head: string;
        complete: boolean;
    };
}
//# sourceMappingURL=observation.d.ts.map