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
import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scryptSync, createHash, timingSafeEqual, } from "node:crypto";
export class CredentialCryptoError extends Error {
    constructor(message) {
        super(message);
        this.name = "CredentialCryptoError";
    }
}
const IV_LEN = 12; // GCM standard nonce
const KEY_LEN = 32; // AES-256
// ---- AES-256-GCM envelope, string form `iv:tag:ct` (hex), 12-byte IV --------
function gcmEncrypt(key, plaintext) {
    if (key.length !== KEY_LEN)
        throw new CredentialCryptoError(`key must be ${KEY_LEN} bytes`);
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${tag.toString("hex")}:${ct.toString("hex")}`;
}
function gcmDecrypt(key, stored) {
    if (key.length !== KEY_LEN)
        throw new CredentialCryptoError(`key must be ${KEY_LEN} bytes`);
    const parts = stored.split(":");
    if (parts.length !== 3)
        throw new CredentialCryptoError("bad ciphertext format (expected iv:tag:ct)");
    const [ivHex, tagHex, ctHex] = parts;
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    // Wrong key/token → GCM auth failure throws here. That is the real gate.
    return Buffer.concat([decipher.update(Buffer.from(ctHex, "hex")), decipher.final()]);
}
function sha256Hex(s) {
    return createHash("sha256").update(s, "utf8").digest("hex");
}
// ---- native implementation --------------------------------------------------
export const nodeCredentialCrypto = {
    generateSalt(bytes = 16) {
        return randomBytes(bytes).toString("hex");
    },
    deriveKek(secret, saltHex, params) {
        const { N = 1 << 15, r = 8, p = 1, keyLen = KEY_LEN } = params ?? {};
        // maxmem must exceed 128*N*r bytes; give generous headroom.
        return scryptSync(secret, Buffer.from(saltHex, "hex"), keyLen, {
            N,
            r,
            p,
            maxmem: 256 * 1024 * 1024,
        });
    },
    generateDek() {
        return randomBytes(KEY_LEN);
    },
    wrap(dek, kek) {
        return gcmEncrypt(kek, dek);
    },
    unwrap(wrapped, kek) {
        return gcmDecrypt(kek, wrapped);
    },
    createSession(masterKey, ttlSecs = 24 * 60 * 60) {
        if (masterKey.length !== KEY_LEN)
            throw new CredentialCryptoError(`masterKey must be ${KEY_LEN} bytes`);
        const tokenBytes = randomBytes(KEY_LEN);
        const token = tokenBytes.toString("hex"); // 64 hex chars, returned once
        const session = {
            sessionId: randomUUID(),
            tokenHash: sha256Hex(token),
            encryptedMasterKey: gcmEncrypt(tokenBytes, masterKey),
            expiresAt: Math.floor(Date.now() / 1000) + ttlSecs,
        };
        return { session, token };
    },
    resolveSession(session, token, nowSecs) {
        const now = nowSecs ?? Math.floor(Date.now() / 1000);
        if (now > session.expiresAt)
            throw new CredentialCryptoError("session expired");
        // Constant-time token-hash check for fast rejection; GCM auth is the real gate.
        const presented = Buffer.from(sha256Hex(token), "hex");
        const expected = Buffer.from(session.tokenHash, "hex");
        if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
            throw new CredentialCryptoError("invalid session token");
        }
        const tokenBytes = Buffer.from(token, "hex");
        if (tokenBytes.length !== KEY_LEN)
            throw new CredentialCryptoError("invalid token length");
        return gcmDecrypt(tokenBytes, session.encryptedMasterKey);
    },
};
/** True if the session is past its expiry. */
export function sessionExpired(session, nowSecs) {
    const now = nowSecs ?? Math.floor(Date.now() / 1000);
    return now > session.expiresAt;
}
// ---- SecretString: redaction wrapper (best-effort hygiene, proposal §3/§5) ---
export class SecretString {
    #buf;
    constructor(value) {
        this.#buf = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(value, "utf8");
    }
    /** Run fn with the plaintext; keep the closure tight and do not retain the value. */
    use(fn) {
        return fn(this.#buf.toString("utf8"));
    }
    bytes() {
        return this.#buf;
    }
    /** Best-effort wipe of the backing buffer. */
    destroy() {
        this.#buf.fill(0);
    }
    toString() {
        return "[secret]";
    }
    toJSON() {
        return "[secret]";
    }
    get [Symbol.toStringTag]() {
        return "SecretString";
    }
}
//# sourceMappingURL=credential-crypto.js.map