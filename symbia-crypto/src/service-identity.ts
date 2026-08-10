/**
 * Service identity — an ed25519 keypair a service holds and keeps.
 *
 * Stage 0 of docs/2026-08-10-envelope-signatures-proposal.md. This deliberately
 * signs NOTHING. It gives each service a durable key and an id derived from it,
 * so that when envelopes start carrying signatures there is already an identity
 * to sign with, and the operational questions — where the key lives, whether it
 * survives a restart — have been answered separately from the cryptographic
 * ones.
 *
 * ## What this does and does not establish
 *
 * The id is `symbia:service:<first 16 hex of sha256(SPKI)>`. It is derived from
 * the public key, so it cannot be claimed by anyone who does not hold the
 * private half.
 *
 * It does NOT establish which service the key belongs to. A key proves a
 * holder, exactly as the spyglass instrument key proves a holder and says
 * nothing about which machine it sits on. `role` here is therefore a CLAIM the
 * process makes about itself — the same string it would print in a log — and is
 * recorded as `role_claimed` wherever it travels. Binding a role to a key needs
 * someone to vouch for it, which is the certificate pattern the genesis
 * rotation already uses, and which is an open decision at the time of writing.
 *
 * Printing `role_claimed` without that qualification would invite a reader to
 * treat it as established. That is the failure mode this whole line of work
 * exists to prevent, so the field is named to resist it.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  generateIdentity,
  identityFromPrivatePem,
  exportPrivatePem,
  identityId,
  type Identity,
} from './identity.js';

export interface ServiceIdentity {
  /** Derived from the public key. Proves a holder, not a role. */
  id: string;
  /** What this process says it is. Unverified. Never render as established. */
  role_claimed: string;
  fingerprint: string;
  publicKeyPem: string;
  identity: Identity;
  /** True only on the boot that created the key. */
  created: boolean;
  keyPath: string;
}

export interface LoadServiceIdentityOptions {
  /** The service's own name, e.g. 'assistants'. A claim, not a credential. */
  role: string;
  /**
   * Directory the keypair lives in. Should be a mounted volume: a container
   * that regenerates its key every boot has a new identity every boot, and
   * while already-signed records stay verifiable (the public key travels with
   * them), attribution to a current service is lost.
   */
  dir?: string;
}

/**
 * Load the service's keypair, generating it once on first run.
 *
 * Generated ONCE and persisted, never per boot. A key regenerated at startup
 * gives up the only thing a local key buys, which is continuity — every restart
 * would be a stranger.
 */
export function loadServiceIdentity(opts: LoadServiceIdentityOptions): ServiceIdentity {
  const dir = opts.dir
    ?? process.env.SYMBIA_IDENTITY_DIR
    ?? path.join(process.cwd(), '.identity');
  const keyPath = path.join(dir, 'service.key.pem');
  const pubPath = path.join(dir, 'service.pub.pem');

  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  let identity: Identity;
  let created = false;
  if (fs.existsSync(keyPath)) {
    identity = identityFromPrivatePem(fs.readFileSync(keyPath));
  } else {
    identity = generateIdentity();
    fs.writeFileSync(keyPath, exportPrivatePem(identity), { mode: 0o600 });
    fs.writeFileSync(pubPath, identity.publicKeyPem + '\n', { mode: 0o644 });
    created = true;
  }

  return {
    id: identityId('symbia:service', identity.fingerprint),
    role_claimed: opts.role,
    fingerprint: identity.fingerprint,
    publicKeyPem: identity.publicKeyPem,
    identity,
    created,
    keyPath,
  };
}

/**
 * One line for the boot log.
 *
 * Says `role_claimed=` rather than naming the role bare, because the whole
 * point is that the key does not prove it.
 */
export function describeServiceIdentity(s: ServiceIdentity): string {
  return `identity ${s.id} role_claimed=${s.role_claimed}`
    + (s.created ? ' (key generated this boot)' : '');
}
