/**
 * ed25519 identity, and signatures over whole documents.
 *
 * The identity is derived FROM the key — `sha256(SPKI DER)` — so an id cannot
 * be claimed by anyone who does not hold the private half. A public-key
 * fingerprint must be derivable by anybody holding the public key, which is why
 * it is a plain digest and not a keyed one: a keyed construction would mean
 * only secret-holders could name a public identity.
 *
 * Signatures cover a digest of the WHOLE canonical document, never one field
 * inside it. That is not a preference; it is a defect that shipped and was
 * caught by attacking it. Signing a single chain value left every other field
 * unprotected, so the attestation level in a capture record could be rewritten
 * from `self-attested` to `attested` while every signature still verified — and
 * because the chain value of a first entry is a constant, that signature was
 * byte-identical across every record a key ever produced and attested nothing
 * about any of them. See docs/2026-08-10-spyglass-video-lineage.md §4.7.
 */
import { type KeyObject } from 'node:crypto';
export interface Identity {
    privateKey: KeyObject | null;
    publicKey: KeyObject;
    /** sha256 of the SPKI DER, hex. */
    fingerprint: string;
    publicKeyPem: string;
}
export declare function sha256Hex(data: Buffer | string): string;
/** Digest of a document under canonical serialization. */
export declare function documentDigest(doc: unknown): Buffer;
export declare function generateIdentity(): Identity;
export declare function identityFromPrivatePem(pem: string | Buffer): Identity;
/** Verify-only identity, for a party that holds the public half alone. */
export declare function identityFromPublicPem(pem: string | Buffer): Identity;
/** `<prefix>:<first 16 hex of fingerprint>` — e.g. `spyglass:instrument:490a…`. */
export declare function identityId(prefix: string, fingerprint: string): string;
export declare function exportPrivatePem(id: Identity): string;
/**
 * Sign a document, excluding the field the signature will be written into, so
 * signing and verifying see identical bytes.
 */
export declare function signDocument(doc: object, id: Identity, field?: string): string;
export declare function verifyDocument(doc: object, publicKey: KeyObject, field?: string): boolean;
//# sourceMappingURL=identity.d.ts.map