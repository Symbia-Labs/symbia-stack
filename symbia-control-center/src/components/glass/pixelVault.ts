/**
 * Captured pixels, and the gate in front of them.
 *
 * THE RULING (Brian, 7 Aug 2026): frames travel a private path, isolated from
 * chat messages. Chat may hold the PROCESSED METADATA and nothing else, and
 * would need a positive permission to ever come close to the pixels.
 *
 * The previous version attached the PNG to the chat composer and rendered it as
 * a thumbnail. That is the opposite of the claim: it demonstrated that chat had
 * the bytes in hand. A platform whose central assertion is that capabilities
 * enter only through recorded gates cannot ship a feature that hands an image
 * to the least privileged surface in the product because it looked nice there.
 *
 * So the bytes live here, keyed by digest, and come out only against a grant.
 * The grant names a holder, and the holder must be on an explicit allowlist —
 * default deny. Chat is not on it and cannot be added by asking. Every denial
 * is recorded as an OBSERVATION ("holder X requested digest Y, not on the
 * allowlist"), never as a verdict about intent.
 *
 * HONEST LIMIT, stated because the alternative is a comforting lie: this is a
 * module boundary in a single JavaScript bundle. It stops accidental coupling —
 * a component reaching for pixels because they were convenient — and it makes
 * any deliberate reach visible as an import of this file and a denied grant in
 * the console. It does NOT stop code that decides to bypass it, and it is not a
 * security boundary. The real boundary is the service one: pixels are POSTed to
 * the models service and never touch the messaging service at all.
 */

export interface PixelGrant {
  holder: string;
  digest: string;
  issuedAt: string;
}

/**
 * Who may withdraw bytes. Explicit, short, and not extensible at runtime.
 *
 * `glass:spyglass` captured them. `service:models` is the vision endpoint they
 * are sent to. Nothing else has a reason, and "chat" is deliberately absent —
 * that absence is the feature.
 */
const ALLOWED_HOLDERS: ReadonlySet<string> = new Set(['glass:spyglass', 'service:models']);

/** Bytes are transient. A vault that never empties is a leak with a nice name. */
const TTL_MS = 120_000;

interface Held {
  bytes: string;
  at: number;
}

const held = new Map<string, Held>();

function sweep(): void {
  const now = Date.now();
  for (const [digest, h] of held) {
    if (now - h.at > TTL_MS) held.delete(digest);
  }
}

export function deposit(digest: string, bytes: string): void {
  sweep();
  held.set(digest, { bytes, at: Date.now() });
}

/**
 * Ask for permission to read a frame's bytes.
 *
 * Returns null on denial. The caller gets no detail about why beyond what is
 * logged, because a denial that explains how to satisfy the check is a hint,
 * and this gate is not negotiating.
 */
export function requestGrant(holder: string, digest: string): PixelGrant | null {
  if (!ALLOWED_HOLDERS.has(holder)) {
    // Observation, not inference. What happened, not what it means.
    console.warn(
      `[pixelVault] DENIED — holder "${holder}" requested frame ${digest}; ` +
        `holder is not on the allowlist. No bytes were released.`
    );
    return null;
  }
  if (!held.has(digest)) {
    console.warn(`[pixelVault] holder "${holder}" requested frame ${digest}; not held.`);
    return null;
  }
  return { holder, digest, issuedAt: new Date().toISOString() };
}

/** Withdraw bytes against a grant. A forged grant fails the same check again. */
export function withdraw(grant: PixelGrant | null): string | null {
  if (!grant || !ALLOWED_HOLDERS.has(grant.holder)) return null;
  sweep();
  return held.get(grant.digest)?.bytes ?? null;
}

/** Forget a frame. Called as soon as the pixels have been where they are going. */
export function forget(digest: string): void {
  held.delete(digest);
}

/** How many frames are currently held. For the operator, not for logic. */
export function heldCount(): number {
  sweep();
  return held.size;
}
