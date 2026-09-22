import { type Identity } from './identity.js';
export interface ServiceIdentity {
    /** Derived from the public key. Proves a holder, not a role. */
    id: string;
    /** What this process says it is. Unverified. Never render as established. */
    role_claimed: string;
    fingerprint: string;
    publicKeyPem: string;
    identity: Identity;
    /** True only on the boot that created the key. */
    created: boolean;
    keyPath: string;
}
export interface LoadServiceIdentityOptions {
    /** The service's own name, e.g. 'assistants'. A claim, not a credential. */
    role: string;
    /**
     * Directory the keypair lives in. Should be a mounted volume: a container
     * that regenerates its key every boot has a new identity every boot, and
     * while already-signed records stay verifiable (the public key travels with
     * them), attribution to a current service is lost.
     */
    dir?: string;
}
/**
 * Load the service's keypair, generating it once on first run.
 *
 * Generated ONCE and persisted, never per boot. A key regenerated at startup
 * gives up the only thing a local key buys, which is continuity — every restart
 * would be a stranger.
 */
export declare function loadServiceIdentity(opts: LoadServiceIdentityOptions): ServiceIdentity;
/**
 * One line for the boot log.
 *
 * Says `role_claimed=` rather than naming the role bare, because the whole
 * point is that the key does not prove it.
 */
export declare function describeServiceIdentity(s: ServiceIdentity): string;
//# sourceMappingURL=service-identity.d.ts.map