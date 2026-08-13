/**
 * A2+A3 regression: vault and keyed-hash (docs/2026-08-13-adversarial-analysis.md).
 * Run from repo root: `npm run test:security:crypto`.
 *
 * Covers: v2 HKDF round-trip, wrong-key rejection (GCM fail-closed), legacy
 * ciphertext decryption under the historical fallback key, production guard,
 * HMAC correctness against node:crypto, constant-time verify rejections, and
 * network event hashes being real HMAC with timestamp coverage.
 */
import { createCipheriv, randomBytes, createHmac } from 'crypto';

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}`, detail ?? ''); }
}

async function main() {
  const lib = await import('../../symbia-crypto/dist/index.js');
  const { encryptSecret, decryptSecret, isLegacyCiphertext, deriveVaultKey, hmacSha256Hex, verifyHmacSha256Hex, resolveVaultSecret } = lib;

  // --- A2: vault ---
  const ct = encryptSecret('sk-test-12345', 'operator-secret');
  check('v2 format prefix', ct.startsWith('v2:'), ct.slice(0, 10));
  check('v2 round-trip', decryptSecret(ct, 'operator-secret') === 'sk-test-12345');
  check('isLegacyCiphertext false for v2', !isLegacyCiphertext(ct));

  let wrongKeyThrew = false;
  try { decryptSecret(ct, 'other-secret'); } catch { wrongKeyThrew = true; }
  check('wrong key rejected', wrongKeyThrew);

  const k1 = deriveVaultKey('short');
  check('HKDF key is 32 bytes and not the raw string', k1.length === 32 && !k1.toString('utf8').startsWith('short'));

  // Legacy decrypt: simulate a credential stored under the old hardcoded fallback
  const legacyKey = Buffer.from('dev-secret-key-32chars-minimum!!'.padEnd(32).slice(0, 32));
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', legacyKey, iv);
  let enc = cipher.update('legacy-api-key', 'utf8', 'hex'); enc += cipher.final('hex');
  const legacyCt = `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc}`;
  check('legacy ciphertext detected', isLegacyCiphertext(legacyCt));
  check('legacy decrypt via candidate keys', decryptSecret(legacyCt, 'operator-secret', {} as NodeJS.ProcessEnv) === 'legacy-api-key');

  let prodThrew = false;
  try { resolveVaultSecret({ NODE_ENV: 'production' } as NodeJS.ProcessEnv); } catch { prodThrew = true; }
  check('prod throws without CREDENTIAL_ENCRYPTION_KEY', prodThrew);
  check('prod ok with key set', resolveVaultSecret({ NODE_ENV: 'production', CREDENTIAL_ENCRYPTION_KEY: 'x' } as NodeJS.ProcessEnv) === 'x');

  // --- A3: HMAC primitives ---
  const mac = hmacSha256Hex('secret', 'payload');
  const expected = createHmac('sha256', 'secret').update('payload').digest('hex');
  check('hmacSha256Hex is real HMAC', mac === expected);
  check('verify accepts valid', verifyHmacSha256Hex('secret', 'payload', mac));
  check('verify rejects tampered payload', !verifyHmacSha256Hex('secret', 'payload2', mac));
  check('verify rejects wrong secret', !verifyHmacSha256Hex('secret2', 'payload', mac));
  check('verify rejects malformed hex', !verifyHmacSha256Hex('secret', 'payload', 'zz'));

  // --- A3: network policy uses it, covers timestamp ---
  process.env.NETWORK_HASH_SECRET = 'test-net-secret';
  const policy = await import('../../network/server/src/services/policy.js');
  const payload = { type: 'test.event', data: { a: 1 } };
  const wrapper = { id: 'ev-1', runId: 'run-1', timestamp: '2026-08-13T00:00:00Z', source: 'n1', boundary: 'intra' as const, target: 'n2' };
  const hash = policy.computeEventHash(payload, wrapper as never);
  check('event hash verifies', policy.verifyEventHash({ payload, wrapper: { ...wrapper, path: [] }, hash } as never));
  const tamperedTs = policy.computeEventHash(payload, { ...wrapper, timestamp: '2026-08-13T00:00:01Z' } as never);
  check('timestamp is covered by hash', hash !== tamperedTs);
  check('tampered data rejected', !policy.verifyEventHash({ payload: { type: 'test.event', data: { a: 2 } }, wrapper: { ...wrapper, path: [] }, hash } as never));
  const expectedNet = createHmac('sha256', 'test-net-secret').update(JSON.stringify({
    type: payload.type, data: payload.data, id: wrapper.id, timestamp: wrapper.timestamp,
    source: wrapper.source, runId: wrapper.runId, boundary: wrapper.boundary, target: wrapper.target,
  })).digest('hex');
  check('network hash is HMAC over documented input', hash === expectedNet);

  console.log(`\nA2+A3: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main();
