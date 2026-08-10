/**
 * Canonical JSON — RFC 8785 (JCS).
 *
 * Two parties must agree byte-for-byte on what was signed, or a signature is a
 * statement about a serializer rather than about content. RFC 8785 fixes the
 * three places serializers drift: key order, number formatting and string
 * escaping.
 *
 * JavaScript is unusually well placed here, and it is worth stating why rather
 * than leaving it as folklore:
 *
 *   - §3.2.3 requires numbers to serialize as ECMAScript `Number::toString`.
 *     `JSON.stringify` IS that algorithm, so `1.0` correctly becomes `1` and
 *     `1e21` becomes `1e+21`. Implementations in other languages have to
 *     reimplement it, and commonly do not: a `json.dumps` in Python emits
 *     `1.0`, which is NOT conformant and will not verify against a signature
 *     produced here. Measured, not assumed — 10 Aug 2026.
 *   - §3.2.3 orders keys by UTF-16 code unit, which is exactly what
 *     `Array.prototype.sort` does on strings.
 *   - String escaping follows JSON.stringify, which since ES2019 is
 *     well-formed and never emits lone surrogates.
 *
 * So the correct implementation here is thin. The value is in having said what
 * it conforms to, so a second implementation has something to conform *to*.
 */

/** Values that can appear in a canonicalizable document. */
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json | undefined };

export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return '{' + Object.keys(o).sort()
      // Absent and explicit-null are different statements. `undefined` is
      // dropped so an optional field that was never set does not become a
      // positive claim of null.
      .filter((k) => o[k] !== undefined)
      .map((k) => JSON.stringify(k) + ':' + canonicalJson(o[k]))
      .join(',') + '}';
  }
  if (typeof v === 'number' && !Number.isFinite(v)) {
    // NaN and Infinity have no JSON representation; JSON.stringify silently
    // turns them into null, which would sign a value nobody wrote.
    throw new TypeError(`canonicalJson: ${v} is not representable`);
  }
  return JSON.stringify(v === undefined ? null : v);
}
