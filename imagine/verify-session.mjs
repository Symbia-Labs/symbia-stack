#!/usr/bin/env node
/**
 * Verify a session's record independently of the process that wrote it.
 *
 * The host verifies its own ledger before sealing, which is worth something
 * and is not this. This runs afterwards, in a different process, over the
 * file at rest, using the public key the bundle carries — so it answers the
 * question a skeptic actually asks: not "does the system say it is
 * consistent" but "does it hold up when I check it myself".
 *
 * Three things are checked, and they fail for different reasons:
 *   chain      each event's checksum follows from the previous head
 *   signature  each event was signed by the key this session published
 *   coverage   the events claimed present are the events held
 *
 * Usage:
 *   node imagine/verify-session.mjs <bundle.json>
 *   node imagine/verify-session.mjs <ledger.jsonl> <session.pub.pem>
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createPublicKey } from 'node:crypto';
import { GENESIS, advance, eventDigest, verifyEvent } from '@symbia/lineage';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('usage: node verify-session.mjs <bundle.json> | <ledger.jsonl> <session.pub.pem>');
  process.exit(2);
}

let events, publicKeyPem, label;
if (args[0].endsWith('.json')) {
  const bundle = JSON.parse(readFileSync(args[0], 'utf8'));
  events = bundle.trace ?? [];
  publicKeyPem = bundle.publicKeyPem;
  label = `bundle ${args[0].split('/').pop()}`;
  console.log(`\n  ${label}`);
  console.log(`  sealed at   ${bundle.sealedAt ?? '(not stated)'}`);
  console.log(`  session     ${bundle.session?.actor ?? '(not stated)'}`);
  if (bundle.completeness) {
    const c = bundle.completeness;
    console.log(`  completeness ${c.state}: ${c.held} of ${c.declared}, gaps ${JSON.stringify(c.gaps ?? [])}`);
  }
  if (bundle.claim?.does_not_assert) {
    console.log(`\n  what this bundle explicitly does NOT assert:`);
    console.log(`  ${bundle.claim.does_not_assert}`);
  }
} else {
  events = readFileSync(args[0], 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  publicKeyPem = args[1] ? readFileSync(args[1], 'utf8') : null;
  label = `ledger ${args[0].split('/').pop()}`;
  console.log(`\n  ${label}`);
}

if (events.length === 0) {
  console.log('\n  no events — nothing to verify\n');
  process.exit(1);
}

const key = publicKeyPem ? createPublicKey(publicKeyPem) : null;
if (!key) console.log('\n  NOTE: no public key supplied — signatures cannot be checked, only the chain.');

let chain = GENESIS;
let chainBad = 0, sigBad = 0, unsigned = 0;
const firstFailures = [];

for (const [i, ev] of events.entries()) {
  chain = advance(chain, eventDigest(ev));
  if (ev.checksum !== `sha256:${chain}`) {
    chainBad++;
    if (firstFailures.length < 5) firstFailures.push(`#${ev.payload?.seq ?? i} chain: expected sha256:${chain.slice(0, 16)}…, holds ${String(ev.checksum).slice(7, 23)}…`);
    // Resync so one break does not cascade into a wall of noise about
    // events that are individually fine.
    chain = String(ev.checksum).replace(/^sha256:/, '');
  }
  if (!ev.signature) {
    unsigned++;
  } else if (key && !verifyEvent(ev, key)) {
    sigBad++;
    if (firstFailures.length < 5) firstFailures.push(`#${ev.payload?.seq ?? i} signature does not verify against the session key`);
  }
}

// What the record says about its own completeness.
const closing = [...events].reverse().find((e) => e.event_type === 'imagine.session.closed');
const sealed = [...events].reverse().find((e) => e.event_type === 'imagine.session.sealed');
const declared = closing?.payload?.total ?? sealed?.payload?.total ?? null;

console.log(`\n  events held      ${events.length}`);
console.log(`  chain            ${chainBad === 0 ? 'INTACT — every checksum follows from the previous head' : `BROKEN at ${chainBad} position(s)`}`);
console.log(`  signatures       ${key ? (sigBad === 0 ? `VALID — ${events.length - unsigned} signed by this session's key` : `${sigBad} INVALID`) : 'not checked'}`);
if (unsigned) console.log(`  unsigned         ${unsigned} event(s) carry no signature`);
if (declared !== null) {
  console.log(`  declared total   ${declared} ${declared === events.length ? '(matches what is held)' : `(HELD ${events.length} — this trace is a CUT, not the whole session)`}`);
} else {
  console.log(`  declared total   none — the session neither closed nor sealed here, so truncation cannot be ruled out`);
}

if (firstFailures.length) {
  console.log('\n  first failures:');
  for (const f of firstFailures) console.log(`    ${f}`);
}

// A per-kind census makes narrated runs obvious: a real document review
// leaves mutations against /api/graphs, /api/ingress, /api/contexts and
// /api/resources. A described one leaves an empty or boot-only ledger.
const kinds = new Map();
const paths = new Map();
for (const e of events) {
  kinds.set(e.event_type, (kinds.get(e.event_type) ?? 0) + 1);
  const p = e.payload?.path;
  if (p) {
    const key2 = String(p).replace(/\/[0-9a-f-]{8,}/g, '/{id}');
    paths.set(key2, (paths.get(key2) ?? 0) + 1);
  }
}
console.log('\n  what this session actually did:');
for (const [k, n] of [...kinds.entries()].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(5)}  ${k}`);
if (paths.size) {
  console.log('\n  routes exercised:');
  for (const [p, n] of [...paths.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`    ${String(n).padStart(5)}  ${p}`);
}

// ── continuity: which chain this one follows ──────────────────────────────
//
// Added 17 Aug after a t0 walkthrough registered its predictions, reloaded
// the connector mid-run, and sealed a bundle in which the predictions could
// not be found — they were signed and sealed in the PREVIOUS chain. Both
// halves were sound; neither could reach the other. The successor now names
// its predecessor's head, and this reports it: the sequence becomes
// checkable without anyone's word about which conversation these came from.
const opened = events.find((e) => e.event_type === 'imagine.session.opened');
const continues = opened?.payload?.continues;
console.log('\n  continuity');
if (!continues) {
  console.log('    this chain cites no predecessor — either it is the first, or it');
  console.log('    predates continuity citation. Order across chains is NOT checkable here.');
} else {
  console.log(`    follows        ${continues.session}`);
  console.log(`    at head        ${String(continues.head).slice(0, 30)}…`);
  console.log(`    which ended    ${continues.endedWith}${continues.declaredTotal ? ` (declared ${continues.declaredTotal})` : ' (no declared total — it did not end on its own terms)'}`);
  // If the predecessor's ledger sits beside this bundle, confirm the cited
  // head is really its last event. A citation nobody checks is a hyperlink.
  try {
    const dir = dirname(resolve(args[0]));
    const short = String(continues.session).split(':').pop();
    const p = join(dir, `ledger.${short}.jsonl`);
    if (existsSync(p)) {
      // A CITED HEAD NEED NOT BE THE LAST ONE.
      //
      // The first version compared against the predecessor's final event and
      // reported DOES NOT MATCH on a perfectly honest pair: the predecessor
      // was still running, kept appending, and moved past the point that was
      // cited. Caught on the first real test. A verifier that cries wolf on
      // ordinary growth teaches people to ignore it, which is worse than not
      // checking. The right question is whether the cited head appears
      // ANYWHERE in that chain — that is what fixes the order.
      const lines = readFileSync(p, 'utf8').split('\n').filter(Boolean);
      let at = -1;
      for (const [i, l] of lines.entries()) {
        try { if (JSON.parse(l).checksum === continues.head) { at = i + 1; break; } } catch { /* skip */ }
      }
      console.log(`    predecessor    found on disk, ${lines.length} events`);
      if (at > 0) {
        console.log(`    cited head     FOUND at event ${at} of ${lines.length} — the order is confirmed:`);
        console.log(`                   that chain had reached ${at} events when this one opened`);
        if (lines.length > at) {
          console.log(`                   and continued to ${lines.length} afterwards. Citation fixes a point,`);
          console.log('                   it does not freeze the file — both can be true at once.');
        }
      } else {
        console.log('    cited head     NOT FOUND in that chain — the citation names a head this');
        console.log('                   predecessor never held. Different chain, or tampering.');
      }
    } else {
      console.log('    predecessor    not beside this bundle — fetch it to complete the order');
    }
  } catch { /* best effort */ }
}

const ok = chainBad === 0 && sigBad === 0;
console.log(`\n  ${ok ? 'VERIFIED — this record is internally consistent and signed by the key it publishes.' : 'FAILED — do not trust this record.'}`);
console.log('  Note what that does and does not mean: the bytes are authentic to this');
console.log('  session. Whether the work recorded here was any good is a separate');
console.log('  question, and this tool has no opinion about it.\n');
process.exit(ok ? 0 : 1);
