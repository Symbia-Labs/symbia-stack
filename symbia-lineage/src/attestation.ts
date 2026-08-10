/**
 * Attestation levels, and the rule that a reader is told what can be
 * SUBSTANTIATED rather than what a record claims about itself.
 *
 * Three-valued and recorded at capture time, never a boolean: "signed" and
 * "trusted" are different claims, and collapsing them is how a pseudonym gets
 * read as an identity.
 *
 * Importing a genesis must never raise records already written. In the spyglass
 * that rule is enforced by arithmetic rather than by good intentions — rotation
 * generates a NEW key and the genesis certifies only that one, so earlier
 * records were signed by a key the genesis says nothing about and cannot be
 * raised by anyone, including a verifier that wants to.
 */
export type AttestationLevel =
  | 'unsigned'
  | 'self-attested'
  | 'attested'
  | 'hardware-attested';

/**
 * Prose, not an enum, because the failure this guards against is a UI rendering
 * a signature as a tick. The sentence has to travel with the result.
 */
export const ATTESTATION_MEANS: Record<AttestationLevel, string> = {
  'unsigned':
    'Nothing attests this record. The chain shows it is internally consistent; anyone could have written it.',
  'self-attested':
    'Signed by a key generated on the observing machine. Proves every event came from one holder of that key and has not been altered since. Does NOT establish which machine, which person, or any external trust.',
  'attested':
    'Signed by a key chaining to an imported genesis. Trust is only as good as that genesis and how it was obtained.',
  'hardware-attested':
    'Signed by a key that cannot be exported from the machine that holds it.',
};

export interface Attestation {
  level: AttestationLevel;
  /** Derived from the public key, so it cannot be claimed by a non-holder. */
  observer: string;
  public_key: string;
  algorithm: 'ed25519';
  /** Names what a signature covers, so a verifier can tell. */
  signature_scheme: 'canonical-event-v2';
  genesis?: { id: string; epoch?: string; fingerprint?: string } | null;
  means: string;
}

/**
 * Reduce a claimed level to what the evidence actually supports.
 *
 * A record states its own level in its payload. Echoing that back is how a
 * verifier ends up republishing a claim it has just failed to confirm — which
 * happened, and was caught by forging a clip: the body correctly reported that
 * the genesis did not vouch for it, while the headline read "attested" straight
 * out of the payload. Claimed and substantiated are separate values and are
 * reported separately whenever they differ.
 */
export function substantiate(input: {
  claimed: AttestationLevel;
  signaturesVerify: boolean;
  /** null = no genesis was offered, so the claim is untested, not refuted. */
  genesisVouches: boolean | null;
}): { level: AttestationLevel; why: string | null } {
  if (!input.signaturesVerify) {
    return { level: 'unsigned', why: 'Signatures did not verify; treat this record as unattested.' };
  }
  if (input.claimed !== 'attested') return { level: input.claimed, why: null };

  if (input.genesisVouches === true) return { level: 'attested', why: null };
  if (input.genesisVouches === false) {
    return {
      level: 'self-attested',
      why: 'This record claims to be attested, but the genesis offered does not vouch for the key that signed it. Importing a genesis does not reach backwards.',
    };
  }
  return {
    level: 'self-attested',
    why: 'This record claims to be attested. Nothing here can confirm that, because no genesis was offered to check it against. Test the claim rather than accept it.',
  };
}
