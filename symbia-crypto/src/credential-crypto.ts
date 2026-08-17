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

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
  scryptSync,
  createHash,
  timingSafeEqual,
} from "node:crypto";

export class CredentialCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialCryptoError";
  }
}

const IV_LEN = 12; // GCM standard nonce
const KEY_LEN = 32; // AES-256

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
  createSession(masterKey: Buffer, ttlSecs?: number): { session: StoredSession; token: string };
  resolveSession(session: StoredSession, token: string, nowSecs?: number): Buffer;
}

// ---- AES-256-GCM envelope, string form `iv:tag:ct` (hex), 12-byte IV --------

function gcmEncrypt(key: Buffer, plaintext: Buffer): string {
  if (key.length !== KEY_LEN) throw new CredentialCryptoError(`key must be ${KEY_LEN} bytes`);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${ct.toString("hex")}`;
}

function gcmDecrypt(key: Buffer, stored: string): Buffer {
  if (key.length !== KEY_LEN) throw new CredentialCryptoError(`key must be ${KEY_LEN} bytes`);
  const parts = stored.split(":");
  if (parts.length !== 3) throw new CredentialCryptoError("bad ciphertext format (expected iv:tag:ct)");
  const [ivHex, tagHex, ctHex] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  // Wrong key/token → GCM auth failure throws here. That is the real gate.
  return Buffer.concat([decipher.update(Buffer.from(ctHex, "hex")), decipher.final()]);
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

// ---- native implementation --------------------------------------------------

export const nodeCredentialCrypto: CredentialCrypto = {
  generateSalt(bytes = 16): string {
    return randomBytes(bytes).toString("hex");
  },

  deriveKek(secret: string, saltHex: string, params?: KdfParams): Buffer {
    const { N = 1 << 15, r = 8, p = 1, keyLen = KEY_LEN } = params ?? {};
    // maxmem must exceed 128*N*r bytes; give generous headroom.
    return scryptSync(secret, Buffer.from(saltHex, "hex"), keyLen, {
      N,
      r,
      p,
      maxmem: 256 * 1024 * 1024,
    });
  },

  generateDek(): Buffer {
    return randomBytes(KEY_LEN);
  },

  wrap(dek: Buffer, kek: Buffer): string {
    return gcmEncrypt(kek, dek);
  },

  unwrap(wrapped: string, kek: Buffer): Buffer {
    return gcmDecrypt(kek, wrapped);
  },

  createSession(masterKey: Buffer, ttlSecs = 24 * 60 * 60): { session: StoredSession; token: string } {
    if (masterKey.length !== KEY_LEN) throw new CredentialCryptoError(`masterKey must be ${KEY_LEN} bytes`);
    const tokenBytes = randomBytes(KEY_LEN);
    const token = tokenBytes.toString("hex"); // 64 hex chars, returned once
    const session: StoredSession = {
      sessionId: randomUUID(),
      tokenHash: sha256Hex(token),
      encryptedMasterKey: gcmEncrypt(tokenBytes, masterKey),
      expiresAt: Math.floor(Date.now() / 1000) + ttlSecs,
    };
    return { session, token };
  },

  resolveSession(session: StoredSession, token: string, nowSecs?: number): Buffer {
    const now = nowSecs ?? Math.floor(Date.now() / 1000);
    if (now > session.expiresAt) throw new CredentialCryptoError("session expired");
    // Constant-time token-hash check for fast rejection; GCM auth is the real gate.
    const presented = Buffer.from(sha256Hex(token), "hex");
    const expected = Buffer.from(session.tokenHash, "hex");
    if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
      throw new CredentialCryptoError("invalid session token");
    }
    const tokenBytes = Buffer.from(token, "hex");
    if (tokenBytes.length !== KEY_LEN) throw new CredentialCryptoError("invalid token length");
    return gcmDecrypt(tokenBytes, session.encryptedMasterKey);
  },
};

/** True if the session is past its expiry. */
export function sessionExpired(session: StoredSession, nowSecs?: number): boolean {
  const now = nowSecs ?? Math.floor(Date.now() / 1000);
  return now > session.expiresAt;
}

// ---- SecretString: redaction wrapper (best-effort hygiene, proposal §3/§5) ---

export class SecretString {
  #buf: Buffer;
  constructor(value: string | Buffer) {
    this.#buf = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(value, "utf8");
  }
  /** Run fn with the plaintext; keep the closure tight and do not retain the value. */
  use<T>(fn: (value: string) => T): T {
    return fn(this.#buf.toString("utf8"));
  }
  bytes(): Buffer {
    return this.#buf;
  }
  /** Best-effort wipe of the backing buffer. */
  destroy(): void {
    this.#buf.fill(0);
  }
  toString(): string {
    return "[secret]";
  }
  toJSON(): string {
    return "[secret]";
  }
  get [Symbol.toStringTag](): string {
    return "SecretString";
  }
}
