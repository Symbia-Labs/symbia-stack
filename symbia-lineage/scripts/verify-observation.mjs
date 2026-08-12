#!/usr/bin/env node
/**
 * Verify an observation from its ledger alone.
 *
 *   node scripts/verify-observation.mjs <ledger.jsonl> [--content <file>]
 *
 * Takes nothing on trust from the process that wrote the record — including,
 * pointedly, the level it claims for itself. Reports what can be
 * SUBSTANTIATED and prints the claim separately when the two differ.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { canonicalJson } from '@symbia/crypto';
import { ATTESTATION_MEANS, substantiate } from '@symbia/lineage';

const args = process.argv.slice(2);
const ledger = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--content');
const contentPath = args.includes('--content') ? args[args.indexOf('--content') + 1] : null;
if (!ledger) {
  console.error('usage: verify-observation.mjs <ledger.jsonl> [--content <file>]');
  process.exit(2);
}

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });
const note = (name, detail) => results.push({ name, ok: 'note', detail });
const hex = (s) => String(s).replace(/^sha256:/, '');

const evs = fs.readFileSync(ledger, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const open = evs.find((e) => e.event_type === 'observation.open');
const close = evs.find((e) => e.event_type === 'observation.close');
const chunks = evs.filter((e) => e.event_type === 'observation.chunk');

check('open and close events present', Boolean(open && close));
const att = open.payload.attestation;
const claim = open.payload.claim;

// The claim must state BOTH halves. An observer that only says what it asserts
// is the failure this vocabulary exists to prevent.
check('claim states what is asserted', Boolean(claim?.asserts));
check('claim states what is NOT asserted', Boolean(claim?.does_not_assert));

// Ordering and parentage.
check('chunks strictly ordered with single parent links',
  chunks.every((e, i) => e.payload.seq === i + 1 &&
    e.parent_links.length === 1 &&
    e.parent_links[0] === (i === 0 ? open.event_id : chunks[i - 1].event_id)));

// Offsets tile without gap or overlap.
let cursor = 0, tiled = true;
for (const e of chunks) {
  if (e.payload.offset !== cursor) { tiled = false; break; }
  cursor += e.payload.bytes;
}
check('offsets tile with no gap or overlap', tiled);
check('byte counts agree with the close event', cursor === close.payload.bytes,
  `${cursor} vs ${close.payload.bytes}`);

// Chain recomputes from digests alone.
const advance = (c, d) => crypto.createHash('sha256').update(c).update(d).digest();
let chain = Buffer.alloc(32);
const per = [];
for (const e of chunks) {
  chain = advance(chain, Buffer.from(hex(e.payload.digest), 'hex'));
  per.push(chain.toString('hex'));
}
check('chain recomputes to the recorded head',
  chain.toString('hex') === hex(close.payload.content_head));
check('every chunk checksum matches its position', chunks.every((e, i) => hex(e.checksum) === per[i]));

// Signatures.
const key = crypto.createPublicKey(att.public_key);
const fp = crypto.createHash('sha256')
  .update(key.export({ type: 'spki', format: 'der' })).digest('hex');
check('observer id is derived from the public key',
  att.observer.endsWith(fp.slice(0, 16)), att.observer);

const verifyEvent = (ev) => {
  if (!ev.signature) return false;
  const { signature, ...rest } = ev;
  return crypto.verify(null,
    crypto.createHash('sha256').update(canonicalJson(rest)).digest(), key,
    Buffer.from(String(signature).replace(/^ed25519:/, ''), 'base64'));
};
check('every event signed', evs.every((e) => e.signature));
check('every signature verifies', evs.every(verifyEvent));

// Tamper probes — the checks that can actually object.
const t1 = JSON.parse(JSON.stringify(open));
t1.payload.attestation.level = 'attested';
check('rewriting the attestation level breaks the signature', !verifyEvent(t1));
const t2 = JSON.parse(JSON.stringify(open));
t2.payload.source.url_final = 'https://elsewhere.example/';
check('rewriting the retrieved URL breaks the signature', !verifyEvent(t2));

// Content, if supplied.
if (contentPath) {
  const buf = fs.readFileSync(contentPath);
  check('content file size matches the record', buf.length === close.payload.bytes,
    `${buf.length} vs ${close.payload.bytes}`);
  let ok = true;
  for (const e of chunks) {
    const slice = buf.subarray(e.payload.offset, e.payload.offset + e.payload.bytes);
    if (crypto.createHash('sha256').update(slice).digest('hex') !== hex(e.payload.digest)) { ok = false; break; }
  }
  check('content bytes hash to the digests the ledger claims', ok);
} else {
  note('content not supplied', 'chain verified from the ledger alone; bytes not checked');
}

// Completeness is stated, never inferred.
if (close.payload.complete === false) {
  note('observation is INCOMPLETE', close.payload.note || 'no reason recorded');
}

const s = open.payload.source;
console.log(`observation ${open.payload.observation_id}  [${open.payload.observer_kind}]`);
if (s.kind === 'retrieval') {
  console.log(`  ${s.status}  ${s.url_requested}`);
  if (s.url_final !== s.url_requested) console.log(`  final: ${s.url_final}  (${s.redirects.length} redirect(s))`);
  console.log(`  ${s.media_type ?? 'no content-type'}  ${close.payload.bytes} bytes  ${chunks.length} chunks`);
  console.log(s.tls
    ? `  TLS: ${s.tls.subject} issued by ${s.tls.issuer}, chain of ${s.tls.chain_length}, expires ${s.tls.valid_to}`
    : '  TLS: none — plaintext http, nobody vouched for this name');
}
console.log();
let failed = 0;
for (const r of results) {
  if (r.ok === false) failed++;
  console.log(`  ${r.ok === 'note' ? 'NOTE' : r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
}

const sub = substantiate({
  claimed: att.level,
  signaturesVerify: evs.every(verifyEvent),
  genesisVouches: null,
});
console.log(failed === 0
  ? `\nintegrity verified — attestation: ${sub.level}`
  : `\n${failed} check(s) failed — attestation: ${sub.level}`);
if (sub.level !== att.level) console.log(`  the record claims: ${att.level} — not substantiated`);
console.log('  ' + ATTESTATION_MEANS[sub.level]);
console.log('\n  asserts: ' + claim.asserts);
console.log('  does NOT assert: ' + claim.does_not_assert);
process.exit(failed === 0 ? 0 : 1);
