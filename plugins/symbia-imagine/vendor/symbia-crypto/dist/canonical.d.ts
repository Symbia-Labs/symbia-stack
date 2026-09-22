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
export type Json = null | boolean | number | string | Json[] | {
    [k: string]: Json | undefined;
};
export declare function canonicalJson(v: unknown, depth?: number): string;
/**
 * WHAT THIS STILL DOES NOT COVER, stated rather than left to be rediscovered.
 *
 * `Map`, `Set`, `RegExp`, `Error` and any class with only private fields have
 * no `toJSON` and no own enumerable keys, so they canonicalize to `{}`.
 * `JSON.stringify` does the same, so digest and stored form agree and nothing
 * above catches it — but two different `Map`s sign identically, which is the
 * same defect as the `Date` case with the mismatch removed.
 *
 * By the argument three lines above — `NaN` throws because turning it into
 * `null` "would sign a value nobody wrote" — these should throw too. That is
 * not done here because it converts a silent wrong answer into a runtime
 * failure in live services, and which call sites pass such values has not been
 * measured. Recorded as an open decision, not an oversight.
 */
//# sourceMappingURL=canonical.d.ts.map