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
export function canonicalJson(v, depth = 0) {
    // `toJSON` FIRST, because JSON.stringify consults it first.
    //
    // Everything that writes one of these values to disk goes through
    // JSON.stringify. A canonicalizer that skips `toJSON` therefore commits to a
    // different value than the one that gets stored, and the two can never be
    // reconciled by a reader.
    //
    // Measured 25 Aug 2026 on one imagine session's body store: 60 of 838 bodies
    // could not be verified against the digest they were filed under. All 60
    // were database rows carrying `createdAt`/`updatedAt` as `Date`. A `Date` is
    // `typeof "object"` and not an `Array` and has no own enumerable keys, so it
    // canonicalized to `{}` while `JSON.stringify` stored the ISO string.
    // Reviving those fields as `Date` explained 60 of 60 with none left over.
    //
    // The verification failure was the smaller half. The larger one: a timestamp
    // inside a signed payload was not covered by the signature over it, because
    // two records differing only in their timestamps canonicalized identically.
    // `Date`, `URL` and `Buffer` all reach here, and all three were wrong.
    if (v && typeof v === 'object' && typeof v.toJSON === 'function') {
        if (depth > 64) {
            // A `toJSON` returning something that also has one is legal and
            // terminates; one that returns itself does not. Bound it rather than
            // overflowing the stack on a value someone controls.
            throw new TypeError('canonicalJson: toJSON did not terminate');
        }
        return canonicalJson(v.toJSON(), depth + 1);
    }
    if (Array.isArray(v)) {
        // Index rather than `.map`, because `.map` preserves holes: a sparse array
        // `[1,,3]` came out as the literal `[1,,3]`, which is not JSON and cannot
        // be parsed by anything that later tries to verify it. JSON.stringify
        // writes `null` for a hole, and this now agrees.
        const parts = [];
        for (let i = 0; i < v.length; i++)
            parts.push(canonicalJson(v[i], depth + 1));
        return '[' + parts.join(',') + ']';
    }
    if (v && typeof v === 'object') {
        const o = v;
        return '{' + Object.keys(o).sort()
            // Absent and explicit-null are different statements. `undefined` is
            // dropped so an optional field that was never set does not become a
            // positive claim of null.
            .filter((k) => o[k] !== undefined)
            .map((k) => JSON.stringify(k) + ':' + canonicalJson(o[k], depth + 1))
            .join(',') + '}';
    }
    if (typeof v === 'number' && !Number.isFinite(v)) {
        // NaN and Infinity have no JSON representation; JSON.stringify silently
        // turns them into null, which would sign a value nobody wrote.
        throw new TypeError(`canonicalJson: ${v} is not representable`);
    }
    return JSON.stringify(v === undefined ? null : v);
}
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
//# sourceMappingURL=canonical.js.map