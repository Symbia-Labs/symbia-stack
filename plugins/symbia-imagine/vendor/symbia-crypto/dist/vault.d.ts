/**
 * Credential vault primitives (A2, 13 Aug 2026).
 *
 * Replaces the copy-pasted AES-256-GCM blocks that lived at 5+ call sites in
 * the identity service, each with `padEnd(32).slice(0,32)` raw-string keying
 * and a repo-visible fallback (`CREDENTIAL_ENCRYPTION_KEY || JWT_SECRET ||
 * "dev-secret-key-32chars-minimum!!"`). See
 * docs/2026-08-13-adversarial-analysis.md, finding A2.
 *
 * Properties of the v2 format:
 * - key material goes through HKDF-SHA256 (no raw-string keys, no trailing
 *   spaces, short operator secrets still yield full-entropy keys)
 * - CREDENTIAL_ENCRYPTION_KEY is required in production (throws at resolve
 *   time); a clearly-labeled dev-only fallback is used elsewhere, with a loud
 *   warning — mirroring the NETWORK_HASH_SECRET precedent
 * - JWT_SECRET is never used for encryption (secret-domain coupling removed)
 * - ciphertexts are versioned (`v2:` prefix) so legacy ciphertexts remain
 *   readable during migration: decryptSecret() transparently tries the legacy
 *   key derivations for 3-part `iv:tag:data` values. GCM authentication makes
 *   wrong-key attempts fail closed, so trying candidates is safe.
 *
 * Re-encryption path: read → isLegacyCiphertext() → write back encryptSecret().
 */
/**
 * Resolve the vault secret from the environment.
 * Throws in production when CREDENTIAL_ENCRYPTION_KEY is unset.
 */
export declare function resolveVaultSecret(env?: NodeJS.ProcessEnv): string;
/** HKDF-SHA256 derivation of the AES-256 key from an operator secret. */
export declare function deriveVaultKey(secret: string): Buffer;
/** Encrypt a secret value. Output format: `v2:<iv-hex>:<tag-hex>:<data-hex>`. */
export declare function encryptSecret(plaintext: string, secret?: string): string;
/** True for pre-v2 (`iv:tag:data`) ciphertexts that should be re-encrypted. */
export declare function isLegacyCiphertext(stored: string): boolean;
/**
 * Decrypt a stored secret. Handles v2 (HKDF) and legacy (raw-key) formats.
 * For legacy values, candidate secrets are tried in order; GCM authentication
 * rejects wrong keys, so this cannot silently return garbage.
 */
export declare function decryptSecret(stored: string, secret?: string, env?: NodeJS.ProcessEnv): string;
//# sourceMappingURL=vault.d.ts.map