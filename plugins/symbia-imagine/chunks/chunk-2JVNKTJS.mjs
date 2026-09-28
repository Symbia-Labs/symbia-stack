import { createRequire as __symbiaCreateRequire } from "node:module";globalThis.require ??= __symbiaCreateRequire(import.meta.url);

// build/plugin/symbia-imagine/vendor/symbia-crypto/dist/canonical.js
function canonicalJson(v, depth = 0) {
  if (v && typeof v === "object" && typeof v.toJSON === "function") {
    if (depth > 64) {
      throw new TypeError("canonicalJson: toJSON did not terminate");
    }
    return canonicalJson(v.toJSON(), depth + 1);
  }
  if (Array.isArray(v)) {
    const parts = [];
    for (let i = 0; i < v.length; i++)
      parts.push(canonicalJson(v[i], depth + 1));
    return "[" + parts.join(",") + "]";
  }
  if (v && typeof v === "object") {
    const o = v;
    return "{" + Object.keys(o).sort().filter((k) => o[k] !== void 0).map((k) => JSON.stringify(k) + ":" + canonicalJson(o[k], depth + 1)).join(",") + "}";
  }
  if (typeof v === "number" && !Number.isFinite(v)) {
    throw new TypeError(`canonicalJson: ${v} is not representable`);
  }
  return JSON.stringify(v === void 0 ? null : v);
}

// build/plugin/symbia-imagine/vendor/symbia-crypto/dist/identity.js
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign as edSign, verify as edVerify } from "node:crypto";
function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}
function documentDigest(doc) {
  return createHash("sha256").update(canonicalJson(doc)).digest();
}
function generateIdentity() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return describe(privateKey, publicKey);
}
function identityFromPrivatePem(pem) {
  const privateKey = createPrivateKey(pem);
  return describe(privateKey, createPublicKey(privateKey));
}
function identityFromPublicPem(pem) {
  const publicKey = createPublicKey(pem);
  return describe(null, publicKey);
}
function describe(privateKey, publicKey) {
  const der = publicKey.export({ type: "spki", format: "der" });
  return {
    privateKey,
    publicKey,
    fingerprint: sha256Hex(der),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).trim()
  };
}
function identityId(prefix, fingerprint) {
  return `${prefix}:${fingerprint.slice(0, 16)}`;
}
function exportPrivatePem(id) {
  if (!id.privateKey)
    throw new Error("identity has no private key");
  return id.privateKey.export({ type: "pkcs8", format: "pem" });
}
function signDocument(doc, id, field = "signature") {
  if (!id.privateKey)
    throw new Error("identity has no private key");
  const { [field]: _omit, ...rest } = doc;
  return "ed25519:" + edSign(null, documentDigest(rest), id.privateKey).toString("base64");
}
function verifyDocument(doc, publicKey, field = "signature") {
  const d = doc;
  const sig = d[field];
  if (typeof sig !== "string")
    return false;
  const { [field]: _omit, ...rest } = d;
  try {
    return edVerify(null, documentDigest(rest), publicKey, Buffer.from(sig.replace(/^ed25519:/, ""), "base64"));
  } catch {
    return false;
  }
}

// build/plugin/symbia-imagine/vendor/symbia-crypto/dist/service-identity.js
import fs from "node:fs";
import path from "node:path";
function loadServiceIdentity(opts) {
  const dir = opts.dir ?? process.env.SYMBIA_IDENTITY_DIR ?? path.join(process.cwd(), ".identity");
  const keyPath = path.join(dir, "service.key.pem");
  const pubPath = path.join(dir, "service.pub.pem");
  fs.mkdirSync(dir, { recursive: true, mode: 448 });
  let identity;
  let created = false;
  if (fs.existsSync(keyPath)) {
    identity = identityFromPrivatePem(fs.readFileSync(keyPath));
  } else {
    identity = generateIdentity();
    fs.writeFileSync(keyPath, exportPrivatePem(identity), { mode: 384 });
    fs.writeFileSync(pubPath, identity.publicKeyPem + "\n", { mode: 420 });
    created = true;
  }
  return {
    id: identityId("symbia:service", identity.fingerprint),
    role_claimed: opts.role,
    fingerprint: identity.fingerprint,
    publicKeyPem: identity.publicKeyPem,
    identity,
    created,
    keyPath
  };
}

// build/plugin/symbia-imagine/vendor/symbia-crypto/dist/keyed-hash.js
import { createHmac, timingSafeEqual } from "crypto";
function hmacSha256Hex(secret, input) {
  return createHmac("sha256", secret).update(input).digest("hex");
}
function verifyHmacSha256Hex(secret, input, expectedHex) {
  const actual = createHmac("sha256", secret).update(input).digest();
  let expected;
  try {
    expected = Buffer.from(expectedHex, "hex");
  } catch {
    return false;
  }
  if (expected.length !== actual.length)
    return false;
  return timingSafeEqual(actual, expected);
}

// build/plugin/symbia-imagine/vendor/symbia-crypto/dist/vault.js
import { createCipheriv, createDecipheriv, randomBytes, hkdfSync } from "crypto";
var HKDF_SALT = Buffer.from("symbia-credential-vault-v2", "utf8");
var HKDF_INFO = Buffer.from("aes-256-gcm-key", "utf8");
var DEV_FALLBACK_SECRET = "symbia-vault-dev-only";
var LEGACY_HARDCODED_FALLBACK = "dev-secret-key-32chars-minimum!!";
var warnedDevFallback = false;
function resolveVaultSecret(env = process.env) {
  const secret = env.CREDENTIAL_ENCRYPTION_KEY;
  if (secret)
    return secret;
  if ((env.NODE_ENV || "development") === "production") {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY is required in production");
  }
  if (!warnedDevFallback) {
    warnedDevFallback = true;
    console.warn("[symbia-crypto] CREDENTIAL_ENCRYPTION_KEY unset \u2014 using dev-only vault key. Stored secrets are NOT protected. Set CREDENTIAL_ENCRYPTION_KEY.");
  }
  return DEV_FALLBACK_SECRET;
}
function deriveVaultKey(secret) {
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret, "utf8"), HKDF_SALT, HKDF_INFO, 32));
}
function encryptSecret(plaintext, secret = resolveVaultSecret()) {
  const key = deriveVaultKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}
function legacyKey(secret) {
  return Buffer.from(secret.padEnd(32).slice(0, 32));
}
function gcmDecrypt(key, ivHex, tagHex, dataHex) {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}
function decryptSecret(stored, secret = resolveVaultSecret(), env = process.env) {
  const parts = stored.split(":");
  if (parts[0] === "v2" && parts.length === 4) {
    return gcmDecrypt(deriveVaultKey(secret), parts[1], parts[2], parts[3]);
  }
  if (parts.length === 3) {
    const candidates = [secret, env.JWT_SECRET, LEGACY_HARDCODED_FALLBACK].filter((c) => Boolean(c));
    let lastError;
    for (const candidate of candidates) {
      try {
        return gcmDecrypt(legacyKey(candidate), parts[0], parts[1], parts[2]);
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(`Failed to decrypt legacy credential with any candidate key: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  }
  throw new Error("Unrecognized encrypted credential format");
}

// build/plugin/symbia-imagine/vendor/symbia-crypto/dist/credential-crypto.js
import { createCipheriv as createCipheriv2, createDecipheriv as createDecipheriv2, randomBytes as randomBytes2, randomUUID, scryptSync, createHash as createHash2, timingSafeEqual as timingSafeEqual2 } from "node:crypto";
var CredentialCryptoError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "CredentialCryptoError";
  }
};
var IV_LEN = 12;
var KEY_LEN = 32;
function gcmEncrypt(key, plaintext) {
  if (key.length !== KEY_LEN)
    throw new CredentialCryptoError(`key must be ${KEY_LEN} bytes`);
  const iv = randomBytes2(IV_LEN);
  const cipher = createCipheriv2("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${ct.toString("hex")}`;
}
function gcmDecrypt2(key, stored) {
  if (key.length !== KEY_LEN)
    throw new CredentialCryptoError(`key must be ${KEY_LEN} bytes`);
  const parts = stored.split(":");
  if (parts.length !== 3)
    throw new CredentialCryptoError("bad ciphertext format (expected iv:tag:ct)");
  const [ivHex, tagHex, ctHex] = parts;
  const decipher = createDecipheriv2("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(ctHex, "hex")), decipher.final()]);
}
function sha256Hex2(s) {
  return createHash2("sha256").update(s, "utf8").digest("hex");
}
var nodeCredentialCrypto = {
  generateSalt(bytes = 16) {
    return randomBytes2(bytes).toString("hex");
  },
  deriveKek(secret, saltHex, params) {
    const { N = 1 << 15, r = 8, p = 1, keyLen = KEY_LEN } = params ?? {};
    return scryptSync(secret, Buffer.from(saltHex, "hex"), keyLen, {
      N,
      r,
      p,
      maxmem: 256 * 1024 * 1024
    });
  },
  generateDek() {
    return randomBytes2(KEY_LEN);
  },
  wrap(dek, kek) {
    return gcmEncrypt(kek, dek);
  },
  unwrap(wrapped, kek) {
    return gcmDecrypt2(kek, wrapped);
  },
  createSession(masterKey, ttlSecs = 24 * 60 * 60) {
    if (masterKey.length !== KEY_LEN)
      throw new CredentialCryptoError(`masterKey must be ${KEY_LEN} bytes`);
    const tokenBytes = randomBytes2(KEY_LEN);
    const token = tokenBytes.toString("hex");
    const session = {
      sessionId: randomUUID(),
      tokenHash: sha256Hex2(token),
      encryptedMasterKey: gcmEncrypt(tokenBytes, masterKey),
      expiresAt: Math.floor(Date.now() / 1e3) + ttlSecs
    };
    return { session, token };
  },
  resolveSession(session, token, nowSecs) {
    const now = nowSecs ?? Math.floor(Date.now() / 1e3);
    if (now > session.expiresAt)
      throw new CredentialCryptoError("session expired");
    const presented = Buffer.from(sha256Hex2(token), "hex");
    const expected = Buffer.from(session.tokenHash, "hex");
    if (presented.length !== expected.length || !timingSafeEqual2(presented, expected)) {
      throw new CredentialCryptoError("invalid session token");
    }
    const tokenBytes = Buffer.from(token, "hex");
    if (tokenBytes.length !== KEY_LEN)
      throw new CredentialCryptoError("invalid token length");
    return gcmDecrypt2(tokenBytes, session.encryptedMasterKey);
  }
};

export {
  canonicalJson,
  sha256Hex,
  generateIdentity,
  identityFromPublicPem,
  identityId,
  signDocument,
  verifyDocument,
  loadServiceIdentity,
  hmacSha256Hex,
  verifyHmacSha256Hex,
  encryptSecret,
  decryptSecret,
  nodeCredentialCrypto
};
