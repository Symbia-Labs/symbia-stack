#!/usr/bin/env node
/**
 * Import a genesis and rotate the instrument identity onto it.
 *
 *   node scripts/import-genesis.js <genesis-dir> --sign-with <genesis-private.pem>
 *
 * Turns a self-attested instrument into an attested one. What "attested" buys
 * is narrow and worth stating: it means a named genesis signed a statement
 * binding this instrument's public key. Trust is then exactly as good as that
 * genesis and how it was obtained — no better.
 *
 * ROTATION GENERATES A NEW KEY. This is the whole design, so it is worth being
 * explicit about why, because the easier implementation is to keep the existing
 * key and simply raise its level:
 *
 *   Clips already recorded were signed by the OLD key. The genesis certifies
 *   only the NEW one. So those clips cannot be upgraded to attested by anyone,
 *   including a verifier that wants to, including this project — the genesis
 *   says nothing whatsoever about the key that signed them. Non-retroactivity
 *   stops being a rule someone has to remember and becomes arithmetic.
 *
 * The old key is retained, not deleted: GKS identity §6 requires the old
 * identity to remain in lineage, and old clips must stay verifiable forever.
 *
 * The genesis private key is read to sign the certificate and is never copied,
 * moved, or written anywhere by this script.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const args = process.argv.slice(2);
const genesisDir = args.find((a) => !a.startsWith('--'));
const signWith = args[args.indexOf('--sign-with') + 1];
const appData = process.env.SPYGLASS_USER_DATA ||
  path.join(os.homedir(), 'Library', 'Application Support', '@symbia', 'spyglass-agent');
const KEY_DIR = path.join(appData, 'identity');

if (!genesisDir || !signWith || signWith.startsWith('--')) {
  console.error('usage: import-genesis.js <genesis-dir> --sign-with <genesis-private.pem>');
  process.exit(2);
}

const say = (s) => console.log(s);
const die = (s) => { console.error('refused: ' + s); process.exit(1); };

// --- 1. verify the anchor before anything depends on it ---------------------
const genesisJsonPath = path.join(genesisDir, 'genesis.json');
const genesisPubPath = path.join(genesisDir, 'genesis.pub');
const genesisPubPem = path.join(genesisDir, 'genesis.pub.pem');
const genesisSig = path.join(genesisDir, 'genesis.sig');
for (const f of [genesisJsonPath, genesisPubPath, genesisPubPem, genesisSig, signWith]) {
  if (!fs.existsSync(f)) die('missing ' + f);
}

const genesis = JSON.parse(fs.readFileSync(genesisJsonPath, 'utf8'));
const pubLine = fs.readFileSync(genesisPubPath, 'utf8').trim();

// The genesis signs itself. An unverified anchor is just a file, so this is
// checked with ssh-keygen rather than with our own code.
const allowed = path.join(os.tmpdir(), `allowed_signers.${process.pid}`);
fs.writeFileSync(allowed, `genesis@symbia ${pubLine}\n`);
try {
  const out = execFileSync('ssh-keygen',
    ['-Y', 'verify', '-f', allowed, '-I', 'genesis@symbia', '-n', 'symbia', '-s', genesisSig],
    { input: fs.readFileSync(genesisJsonPath) }).toString().trim();
  say('  anchor: ' + out);
} catch (err) {
  die('genesis self-signature did not verify — ' + (err.stderr?.toString().trim() || err.message));
} finally {
  fs.unlinkSync(allowed);
}

// The fingerprint the document claims must be the fingerprint of the key that
// signed it, or the document is describing some other key.
const fpOut = execFileSync('ssh-keygen', ['-lf', genesisPubPath]).toString().trim();
const fp = fpOut.split(/\s+/)[1];
if (fp !== genesis.fingerprint) die(`fingerprint mismatch: key is ${fp}, genesis.json claims ${genesis.fingerprint}`);
say('  fingerprint matches the document: ' + fp);

// The signing key offered must be the private half of that same public key.
const genesisPriv = crypto.createPrivateKey(fs.readFileSync(signWith));
const derivedPub = crypto.createPublicKey(genesisPriv).export({ type: 'spki', format: 'pem' }).toString().trim();
const declaredPub = fs.readFileSync(genesisPubPem, 'utf8').trim();
if (derivedPub !== declaredPub) die('--sign-with is not the private half of this genesis public key');
say('  signing key is the private half of the anchor');

// --- 2. rotate: a NEW instrument key, certified by the genesis --------------
if (!fs.existsSync(KEY_DIR)) die('no instrument identity at ' + KEY_DIR + ' — run the agent once first');
const oldPriv = crypto.createPrivateKey(fs.readFileSync(path.join(KEY_DIR, 'instrument.key.pem')));
const oldPubDer = crypto.createPublicKey(oldPriv).export({ type: 'spki', format: 'der' });
const oldFp = crypto.createHash('sha256').update(oldPubDer).digest('hex');
const oldId = `spyglass:instrument:${oldFp.slice(0, 16)}`;

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const newPubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString().trim();
const newFp = crypto.createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
const newId = `spyglass:instrument:${newFp.slice(0, 16)}`;

// Deterministic key order: the bytes signed must be reproducible by anyone
// re-serializing this certificate.
const cert = {
  version: 1,
  genesis_id: genesis.id,
  genesis_epoch: genesis.epoch,
  genesis_fingerprint: genesis.fingerprint,
  genesis_public_key: pubLine,
  instrument: newId,
  instrument_public_key: newPubPem,
  issued_at: new Date().toISOString(),
};
const certBytes = Buffer.from(JSON.stringify(cert, Object.keys(cert), 2));
const certSig = crypto.sign(null, certBytes, genesisPriv);
if (!crypto.verify(null, certBytes, crypto.createPublicKey(fs.readFileSync(genesisPubPem)), certSig)) {
  die('certificate failed to verify immediately after signing');
}

// --- 3. install, retaining the old identity ---------------------------------
// Retained, never deleted: clips signed by it must stay verifiable forever, and
// GKS identity §6 requires the old identity to remain in lineage.
const archived = path.join(KEY_DIR, `instrument-${oldFp.slice(0, 16)}.key.pem`);
fs.copyFileSync(path.join(KEY_DIR, 'instrument.key.pem'), archived);
fs.chmodSync(archived, 0o600);
fs.writeFileSync(path.join(KEY_DIR, 'instrument.key.pem'), privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
fs.writeFileSync(path.join(KEY_DIR, 'instrument.pub.pem'), newPubPem + '\n', { mode: 0o644 });
fs.copyFileSync(genesisJsonPath, path.join(KEY_DIR, 'genesis.json'));
fs.copyFileSync(genesisPubPem, path.join(KEY_DIR, 'genesis.pub.pem'));
fs.copyFileSync(genesisSig, path.join(KEY_DIR, 'genesis.sig'));
fs.writeFileSync(path.join(KEY_DIR, 'instrument-cert.json'), certBytes, { mode: 0o644 });
fs.writeFileSync(path.join(KEY_DIR, 'instrument-cert.sig'), certSig, { mode: 0o644 });

// --- 4. rotation event ------------------------------------------------------
// The old key may predate the identity ledger, in which case there is no
// creation event to link back to. Writing the rotation with a parent that does
// not exist would be a dangling pointer dressed as provenance; instead record
// what is actually known — the key was found on disk, its creation is not in
// the record — and link to that.
const ledgerPath = path.join(KEY_DIR, 'lineage.jsonl');
const existing = fs.existsSync(ledgerPath)
  ? fs.readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : [];
const createdId = `event:identity:${oldFp.slice(0, 16)}:created`;
let parentId = createdId;
if (!existing.some((e) => e.event_id === createdId)) {
  parentId = `event:identity:${oldFp.slice(0, 16)}:observed`;
  fs.appendFileSync(ledgerPath, JSON.stringify({
    event_id: parentId,
    timestamp: new Date().toISOString(),
    actor_identity: oldId,
    event_type: 'identity.observed',
    payload: {
      instrument: oldId,
      level: 'self-attested',
      note: 'Key found on disk with no creation event in this ledger; it '
          + 'predates the ledger. Its existence is observed, its creation is '
          + 'not attested by this record.',
    },
    continuity_context: { instrument: oldId },
    parent_links: [],
    checksum: `sha256:${oldFp}`,
    signature: null,
  }) + '\n');
  say('  note: no creation event for the outgoing key — recorded as observed');
}

const ev = {
  event_id: `event:identity:${newFp.slice(0, 16)}:rotated`,
  timestamp: new Date().toISOString(),
  actor_identity: newId,
  event_type: 'identity.rotated',
  payload: {
    from: oldId,
    to: newId,
    from_level: 'self-attested',
    to_level: 'attested',
    genesis: { id: genesis.id, epoch: genesis.epoch, fingerprint: genesis.fingerprint },
    // Recorded because it is the property most likely to be assumed away
    // later, by someone reading a green tick on an old clip.
    retroactive: false,
    note: 'Captures made before this event were signed by ' + oldId + ', which '
        + 'this genesis has not certified. They remain self-attested and cannot '
        + 'be raised by any later import.',
  },
  continuity_context: { instrument: newId },
  parent_links: [parentId],
  checksum: `sha256:${newFp}`,
  signature: 'ed25519:' + certSig.toString('base64'),
};
fs.appendFileSync(path.join(KEY_DIR, 'lineage.jsonl'),
  JSON.stringify(ev) + '\n');

say('');
say('  rotated  ' + oldId + '  (self-attested, retained)');
say('        →  ' + newId + '  (attested by ' + genesis.id + ')');
say('');
say('  Clips recorded before now stay self-attested. The genesis certified only');
say('  the new key, so nothing can raise them — not this tool, not the verifier.');
