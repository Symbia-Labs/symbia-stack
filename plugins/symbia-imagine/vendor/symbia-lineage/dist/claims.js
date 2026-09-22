/**
 * What an observer is allowed to claim.
 *
 * This file exists because the likeliest way to get provenance wrong is not a
 * broken hash — it is a correct hash presented as more than it is. Every
 * observer here produces a signed, chained record of equal cryptographic
 * strength, and they attest completely different things:
 *
 *   - The spyglass observed pixels it framed. It asserts an act of observation.
 *   - An upload observed BYTES SOMEONE HANDED OVER. It asserts receipt. It can
 *     never assert that an uploaded bank statement is a real bank statement,
 *     however well signed the record is.
 *   - A retrieval observed what an endpoint returned. It asserts what came back
 *     from a URL at a time, and nothing whatsoever about whether the page is
 *     true.
 *
 * A single "verified" badge over all three would be a lie told by omission, and
 * would be the same defect as a green tick on a self-attested clip. So the claim
 * travels inside the record, in words, and every observer must state one.
 */
export const CLAIMS = {
    capture: {
        asserts: 'This instrument framed a region of a display and captured these bytes from it at this time.',
        does_not_assert: 'Nothing about whether what was on screen was accurate, current, or itself genuine. A screen can show a forgery, and this would faithfully record the forgery.',
    },
    upload: {
        asserts: 'This instrument received these exact bytes from the named principal at this time, and they have not changed since.',
        does_not_assert: 'Anything about the authenticity, authorship or origin of the file. This is a record of RECEIPT, not of provenance before receipt. A signed record of a forged document is a faithful record of a forged document.',
    },
    retrieval: {
        asserts: 'This endpoint returned these exact bytes to this instrument at this time, over the recorded transport.',
        does_not_assert: 'That the content is true, that the endpoint is who its name suggests beyond what the TLS chain shows, or that the same request would return the same bytes again. A page can lie, and this records the lie exactly.',
    },
};
//# sourceMappingURL=claims.js.map