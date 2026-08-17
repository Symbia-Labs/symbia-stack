/**
 * CredentialCrypto — measurement vs docs/2026-08-14-credential-crypto-predictions.md.
 * Run: npm run test:security:credcrypto. Native crypto, no stack needed.
 */

import { createHash } from "node:crypto";
import {
  nodeCredentialCrypto as cc,
  sessionExpired,
  SecretString,
} from "../../symbia-crypto/dist/index.js";

let pass = 0,
  fail = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}`, detail !== undefined ? JSON.stringify(detail) : ""); }
}
function throws(fn: () => unknown): boolean {
  try { fn(); return false; } catch { return true; }
}

// ---- deriveKek ----
const salt = cc.generateSalt();
const kek = cc.deriveKek("master-secret", salt);
check("K1 deriveKek deterministic", cc.deriveKek("master-secret", salt).equals(kek));
check("K2 different salt ⇒ different key", !cc.deriveKek("master-secret", cc.generateSalt()).equals(kek));
check("K3 kek is 32 bytes", kek.length === 32, kek.length);
check("K4 generateSalt distinct", cc.generateSalt() !== cc.generateSalt());

// ---- wrap / unwrap ----
const dek = cc.generateDek();
const wrapped = cc.wrap(dek, kek);
check("W1 wrap/unwrap round-trip", cc.unwrap(wrapped, kek).equals(dek));
check("W2 wrong KEK throws", throws(() => cc.unwrap(wrapped, cc.deriveKek("other", salt))));
check("W3 tampered ciphertext throws", throws(() => cc.unwrap(wrapped.slice(0, -2) + "00", kek)));
check("W4 generateDek 32 bytes + distinct", dek.length === 32 && !cc.generateDek().equals(dek));

// ---- Session ----
const masterKey = cc.generateDek();
const { session, token } = cc.createSession(masterKey, 3600);
check("S1 resolveSession round-trip", cc.resolveSession(session, token).equals(masterKey));
check("S2 wrong token throws", throws(() => cc.resolveSession(session, cc.generateDek().toString("hex"))));
check("S3 expired session throws", throws(() => cc.resolveSession({ ...session, expiresAt: 1 }, token)));
check("S4 stored session has no raw token", !("token" in session) && !JSON.stringify(session).includes(token));
check("S5 tokenHash === sha256(token)", session.tokenHash === createHash("sha256").update(token).digest("hex"));
{
  const a = cc.createSession(masterKey);
  const b = cc.createSession(masterKey);
  check("S6 sessions distinct", a.token !== b.token && a.session.sessionId !== b.session.sessionId);
}
check("S7 tampered encryptedMasterKey throws", throws(() =>
  cc.resolveSession({ ...session, encryptedMasterKey: session.encryptedMasterKey.slice(0, -2) + "00" }, token)));
check("sessionExpired helper", sessionExpired({ ...session, expiresAt: 1 }) && !sessionExpired(session));

// ---- SecretString ----
{
  const s = new SecretString("sk-ant-secret");
  check("SS1 toString/toJSON redacted", String(s) === "[secret]" && JSON.stringify(s) === '"[secret]"');
  check("SS2 use yields plaintext", s.use((v) => v === "sk-ant-secret"));
  const buf = s.bytes();
  s.destroy();
  check("SS3 destroy zeroes buffer", buf.every((b) => b === 0));
}

console.log(`\nCRED-CRYPTO: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
