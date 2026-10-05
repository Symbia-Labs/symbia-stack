/**
 * Keyed integrity hashes (A3, 13 Aug 2026).
 *
 * Real HMAC-SHA256 with constant-time verification, replacing the
 * `SHA256(data ‖ secret)` secret-suffix construction and short-circuiting
 * string compare in the network service. See
 * docs/2026-08-13-adversarial-analysis.md, finding A3, and
 * docs/2026-08-10-provenance-envelope-shared-secret.md which diagnosed the
 * same construction on a sibling path.
 *
 * Scope note (from the package header): an HMAC under a shared secret detects
 * tampering by parties without the secret. It is not evidence for a party who
 * does not trust the holder — that job belongs to the ed25519 primitives.
 */

import { createHmac, timingSafeEqual } from "crypto";

/** HMAC-SHA256 over input, hex-encoded. */
export function hmacSha256Hex(secret: string | Buffer, input: string | Buffer): string {
  return createHmac("sha256", secret).update(input).digest("hex");
}

/** Constant-time verification of a hex-encoded HMAC-SHA256. */
export function verifyHmacSha256Hex(
  secret: string | Buffer,
  input: string | Buffer,
  expectedHex: string
): boolean {
  const actual = createHmac("sha256", secret).update(input).digest();
  let expected: Buffer;
  try {
    expected = Buffer.from(expectedHex, "hex");
  } catch {
    return false;
  }
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(actual, expected);
}
