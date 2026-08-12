/**
 * @symbia/crypto — the primitives everything provable is built from.
 *
 * Deliberately small and deliberately opinionated: one canonical serialization
 * (RFC 8785), one signature algorithm (ed25519), one place identities are
 * derived from keys. Anything that needs to prove something — an observation
 * entering as context, a reply's provenance envelope, a call crossing the mesh
 * — uses these rather than growing its own.
 *
 * The alternative is what the codebase has today in more than one place: a
 * digest over a shared secret. That detects accidents. It cannot be checked by
 * anyone who does not already hold the secret, and anyone who does hold it can
 * forge. These primitives are for the other job — evidence for a party who does
 * not trust the process that produced it.
 */
export { canonicalJson, type Json } from './canonical.js';
export {
  sha256Hex,
  documentDigest,
  generateIdentity,
  identityFromPrivatePem,
  identityFromPublicPem,
  identityId,
  exportPrivatePem,
  signDocument,
  verifyDocument,
  type Identity,
} from './identity.js';

export {
  loadServiceIdentity,
  describeServiceIdentity,
  type ServiceIdentity,
  type LoadServiceIdentityOptions,
} from './service-identity.js';
