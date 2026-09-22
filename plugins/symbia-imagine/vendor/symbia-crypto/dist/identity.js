/**
 * ed25519 identity, and signatures over whole documents.
 *
 * The identity is derived FROM the key — `sha256(SPKI DER)` — so an id cannot
 * be claimed by anyone who does not hold the private half. A public-key
 * fingerprint must be derivable by anybody holding the public key, which is why
 * it is a plain digest and not a keyed one: a keyed construction would mean
 * only secret-holders could name a public identity.
 *
 * Signatures cover a digest of the WHOLE canonical document, never one field
 * inside it. That is not a preference; it is a defect that shipped and was
 * caught by attacking it. Signing a single chain value left every other field
 * unprotected, so the attestation level in a capture record could be rewritten
 * from `self-attested` to `attested` while every signature still verified — and
 * because the chain value of a first entry is a constant, that signature was
 * byte-identical across every record a key ever produced and attested nothing
 * about any of them. See docs/2026-08-10-spyglass-video-lineage.md §4.7.
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign as edSign, verify as edVerify, } from 'node:crypto';
import { canonicalJson } from './canonical.js';
export function sha256Hex(data) {
    return createHash('sha256').update(data).digest('hex');
}
/** Digest of a document under canonical serialization. */
export function documentDigest(doc) {
    return createHash('sha256').update(canonicalJson(doc)).digest();
}
export function generateIdentity() {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    return describe(privateKey, publicKey);
}
export function identityFromPrivatePem(pem) {
    const privateKey = createPrivateKey(pem);
    return describe(privateKey, createPublicKey(privateKey));
}
/** Verify-only identity, for a party that holds the public half alone. */
export function identityFromPublicPem(pem) {
    const publicKey = createPublicKey(pem);
    return describe(null, publicKey);
}
function describe(privateKey, publicKey) {
    const der = publicKey.export({ type: 'spki', format: 'der' });
    return {
        privateKey,
        publicKey,
        fingerprint: sha256Hex(der),
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).trim(),
    };
}
/** `<prefix>:<first 16 hex of fingerprint>` — e.g. `spyglass:instrument:490a…`. */
export function identityId(prefix, fingerprint) {
    return `${prefix}:${fingerprint.slice(0, 16)}`;
}
export function exportPrivatePem(id) {
    if (!id.privateKey)
        throw new Error('identity has no private key');
    return id.privateKey.export({ type: 'pkcs8', format: 'pem' });
}
/**
 * Sign a document, excluding the field the signature will be written into, so
 * signing and verifying see identical bytes.
 */
export function signDocument(doc, id, field = 'signature') {
    if (!id.privateKey)
        throw new Error('identity has no private key');
    const { [field]: _omit, ...rest } = doc;
    return 'ed25519:' + edSign(null, documentDigest(rest), id.privateKey).toString('base64');
}
export function verifyDocument(doc, publicKey, field = 'signature') {
    const d = doc;
    const sig = d[field];
    if (typeof sig !== 'string')
        return false;
    const { [field]: _omit, ...rest } = d;
    try {
        return edVerify(null, documentDigest(rest), publicKey, Buffer.from(sig.replace(/^ed25519:/, ''), 'base64'));
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=identity.js.map