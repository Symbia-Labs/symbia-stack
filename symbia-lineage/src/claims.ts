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

export type ObserverKind = 'capture' | 'upload' | 'retrieval';

/** What the observer asserts, and — as importantly — what it does not. */
export interface Claim {
  /** One line, present tense, stating the assertion. */
  asserts: string;
  /** The misreading this claim is most likely to invite. Never omitted. */
  does_not_assert: string;
}

export const CLAIMS: Record<ObserverKind, Claim> = {
  capture: {
    asserts:
      'This instrument framed a region of a display and captured these bytes from it at this time.',
    does_not_assert:
      'Nothing about whether what was on screen was accurate, current, or itself genuine. A screen can show a forgery, and this would faithfully record the forgery.',
  },
  upload: {
    asserts:
      'This instrument received these exact bytes from the named principal at this time, and they have not changed since.',
    does_not_assert:
      'Anything about the authenticity, authorship or origin of the file. This is a record of RECEIPT, not of provenance before receipt. A signed record of a forged document is a faithful record of a forged document.',
  },
  retrieval: {
    asserts:
      'This endpoint returned these exact bytes to this instrument at this time, over the recorded transport.',
    does_not_assert:
      'That the content is true, that the endpoint is who its name suggests beyond what the TLS chain shows, or that the same request would return the same bytes again. A page can lie, and this records the lie exactly.',
  },
};

/**
 * Source binding per observer kind. Structural only — what was observed and
 * from where, never the content itself.
 */
export interface CaptureSource {
  kind: 'capture';
  display?: { width: number; height: number } | null;
  aperture?: { x: number; y: number; diameter: number } | null;
}

export interface UploadSource {
  kind: 'upload';
  /** As supplied by the client. Attacker-controlled; recorded, never trusted. */
  filename_claimed: string | null;
  /** As supplied by the client. Also attacker-controlled. */
  media_type_claimed: string | null;
  /** Determined by the receiver from the bytes, when it can be. */
  media_type_detected: string | null;
  bytes: number;
  /** Who handed it over, as authenticated by identity — not self-reported. */
  principal: string | null;
}

export interface RetrievalSource {
  kind: 'retrieval';
  url_requested: string;
  /** After redirects. Differs from the request more often than people expect. */
  url_final: string;
  redirects: string[];
  status: number;
  media_type: string | null;
  bytes: number;
  /**
   * The one place a third party's signature enters an observation. Present only
   * for TLS; absent for plain http, which is itself worth seeing in the record.
   */
  tls: {
    subject: string | null;
    issuer: string | null;
    /** SHA-256 of the DER leaf certificate. */
    fingerprint256: string | null;
    valid_from: string | null;
    valid_to: string | null;
    /** Chain length as presented by the server. */
    chain_length: number | null;
  } | null;
  /** The server's own claim about when. Recorded as a claim, not as truth. */
  server_date: string | null;
}

export type ObservationSource = CaptureSource | UploadSource | RetrievalSource;
