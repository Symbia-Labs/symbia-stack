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

import { createCipheriv, createDecipheriv, randomBytes, hkdfSync } from "crypto";

const HKDF_SALT = Buffer.from("symbia-credential-vault-v2", "utf8");
const HKDF_INFO = Buffer.from("aes-256-gcm-key", "utf8");
const DEV_FALLBACK_SECRET = "symbia-vault-dev-only";
/** The historical hardcoded fallback — retained ONLY for legacy decryption. */
const LEGACY_HARDCODED_FALLBACK = "dev-secret-key-32chars-minimum!!";

let warnedDevFallback = false;

/**
 * Resolve the vault secret from the environment.
 * Throws in production when CREDENTIAL_ENCRYPTION_KEY is unset.
 */
export function resolveVaultSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.CREDENTIAL_ENCRYPTION_KEY;
  if (secret) return secret;
  if ((env.NODE_ENV || "development") === "production") {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY is required in production");
  }
  if (!warnedDevFallback) {
    warnedDevFallback = true;
    console.warn(
      "[symbia-crypto] CREDENTIAL_ENCRYPTION_KEY unset — using dev-only vault key. " +
      "Stored secrets are NOT protected. Set CREDENTIAL_ENCRYPTION_KEY."
    );
  }
  return DEV_FALLBACK_SECRET;
}

/** HKDF-SHA256 derivation of the AES-256 key from an operator secret. */
export function deriveVaultKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret, "utf8"), HKDF_SALT, HKDF_INFO, 32));
}

/** Encrypt a secret value. Output format: `v2:<iv-hex>:<tag-hex>:<data-hex>`. */
export function encryptSecret(plaintext: string, secret: string = resolveVaultSecret()): string {
  const key = deriveVaultKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/** True for pre-v2 (`iv:tag:data`) ciphertexts that should be re-encrypted. */
export function isLegacyCiphertext(stored: string): boolean {
  return !stored.startsWith("v2:");
}

/** The legacy raw-string key derivation, kept only for reading old data. */
function legacyKey(secret: string): Buffer {
  return Buffer.from(secret.padEnd(32).slice(0, 32));
}

function gcmDecrypt(key: Buffer, ivHex: string, tagHex: string, dataHex: string): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Decrypt a stored secret. Handles v2 (HKDF) and legacy (raw-key) formats.
 * For legacy values, candidate secrets are tried in order; GCM authentication
 * rejects wrong keys, so this cannot silently return garbage.
 */
export function decryptSecret(
  stored: string,
  secret: string = resolveVaultSecret(),
  env: NodeJS.ProcessEnv = process.env
): string {
  const parts = stored.split(":");

  if (parts[0] === "v2" && parts.length === 4) {
    return gcmDecrypt(deriveVaultKey(secret), parts[1], parts[2], parts[3]);
  }

  if (parts.length === 3) {
    const candidates = [secret, env.JWT_SECRET, LEGACY_HARDCODED_FALLBACK].filter(
      (c): c is string => Boolean(c)
    );
    let lastError: unknown;
    for (const candidate of candidates) {
      try {
        return gcmDecrypt(legacyKey(candidate), parts[0], parts[1], parts[2]);
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(
      `Failed to decrypt legacy credential with any candidate key: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`
    );
  }

  throw new Error("Unrecognized encrypted credential format");
}
