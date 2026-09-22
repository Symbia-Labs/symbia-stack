/**
 * @symbia/crypto — CredentialCrypto (L1/L2/L3 of
 * docs/proposals/2026-08-14-lift-wallet-credentials-into-identity.md)
 *
 * A TS port of the mcp-wallet credential core (`wallet-core`), native
 * `node:crypto` only. The whole surface sits behind ONE interface —
 * `CredentialCrypto` — so a future `wallet-core`→WASM module can implement the
 * same seam and be swapped in (see §7 of the proposal). Do NOT inline
 * `createCipheriv` elsewhere; go through this module.
 *
 * Mechanisms:
 * - deriveKek     : password/secret + salt → 32-byte key (scrypt today,
 *                   memory-hard; Argon2id can implement the same signature later).
 * - wrap/unwrap   : envelope — a random data key (DEK) is wrapped by a
 *                   key-encryption key (KEK), AES-256-GCM.
 * - createSession : the wallet's session model — a random token wraps a master
 *                   key; the client holds the token, never the password. The
 *                   stored session keeps only a token HASH (not the raw token, a
 *                   deliberate hardening over the wallet's local-file model), so
 *                   a leaked session record cannot unlock anything without the
 *                   token the caller was handed once.
 *
 * Zeroization caveat (proposal §3/§7): Node cannot wipe a `string`. Secrets are
 * held in `Buffer`s here; `SecretString.destroy()` fills them. This is best-
 * effort, not the guarantee Rust `zeroize` gives — which is the reason the WASM
 * swap exists.
 */
export declare class CredentialCryptoError extends Error {
    constructor(message: string);
}
/** scrypt cost parameters. Tuned for a server (throughput), not a desktop unlock. */
export interface KdfParams {
    /** CPU/memory cost, power of two. Default 2^15 (~32 MB). */
    N?: number;
    /** block size. Default 8. */
    r?: number;
    /** parallelization. Default 1. */
    p?: number;
    /** derived key length in bytes. Default 32. */
    keyLen?: number;
}
/** A stored session record. Holds a token HASH, never the raw token. */
export interface StoredSession {
    sessionId: string;
    /** sha256(token) hex — for lookup/verification, not a secret. */
    tokenHash: string;
    /** master key wrapped by the token (iv:tag:ct hex). */
    encryptedMasterKey: string;
    /** Unix seconds. */
    expiresAt: number;
}
/**
 * The seam. Native implementation below; a wallet-core→WASM module can implement
 * this same interface and be swapped in without touching callers.
 */
export interface CredentialCrypto {
    generateSalt(bytes?: number): string;
    deriveKek(secret: string, saltHex: string, params?: KdfParams): Buffer;
    generateDek(): Buffer;
    wrap(dek: Buffer, kek: Buffer): string;
    unwrap(wrapped: string, kek: Buffer): Buffer;
    createSession(masterKey: Buffer, ttlSecs?: number): {
        session: StoredSession;
        token: string;
    };
    resolveSession(session: StoredSession, token: string, nowSecs?: number): Buffer;
}
export declare const nodeCredentialCrypto: CredentialCrypto;
/** True if the session is past its expiry. */
export declare function sessionExpired(session: StoredSession, nowSecs?: number): boolean;
export declare class SecretString {
    #private;
    constructor(value: string | Buffer);
    /** Run fn with the plaintext; keep the closure tight and do not retain the value. */
    use<T>(fn: (value: string) => T): T;
    bytes(): Buffer;
    /** Best-effort wipe of the backing buffer. */
    destroy(): void;
    toString(): string;
    toJSON(): string;
    get [Symbol.toStringTag](): string;
}
//# sourceMappingURL=credential-crypto.d.ts.map