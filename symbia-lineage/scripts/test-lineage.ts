/**
 * Tests for the lineage substrate.
 *
 * These try to BREAK the thing rather than confirm it. Every check that only
 * demonstrates the library agreeing with itself is worth very little — the two
 * real defects found in this work so far (a signature that covered no payload,
 * a verifier that republished a claim it had refuted) both survived a full
 * suite of self-agreeing checks and were caught by attacking the output.
 */
import { generateIdentity, canonicalJson, verifyDocument } from '@symbia/crypto';
import { Observation, verifyEvent, advance, GENESIS, substantiate, CLAIMS } from '../dist/index.js';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  (' + detail + ')' : ''}`); }
};

// --- canonical JSON ---------------------------------------------------------
ok('canonical: keys sort', canonicalJson({ z: 1, a: 2 }) === '{"a":2,"z":1}');
ok('canonical: nested keys sort', canonicalJson({ b: { d: 1, c: 2 } }) === '{"b":{"c":2,"d":1}}');
ok('canonical: RFC 8785 number form (1.0 → 1)', canonicalJson({ n: 1.0 }) === '{"n":1}');
ok('canonical: exponent form', canonicalJson({ n: 1e21 }) === '{"n":1e+21}');
ok('canonical: undefined dropped, null kept',
  canonicalJson({ a: undefined, b: null }) === '{"b":null}');
let threw = false;
try { canonicalJson({ n: NaN }); } catch { threw = true; }
ok('canonical: refuses NaN rather than silently writing null', threw);

// --- chain ------------------------------------------------------------------
const d1 = 'a'.repeat(64), d2 = 'b'.repeat(64);
ok('chain: order matters', advance(advance(GENESIS, d1), d2) !== advance(advance(GENESIS, d2), d1));
ok('chain: deterministic', advance(GENESIS, d1) === advance(GENESIS, d1));

// --- observation ------------------------------------------------------------
const id = generateIdentity();
const lines: string[] = [];
const obs = new Observation({
  kind: 'upload',
  idPrefix: 'test:observer',
  identity: id,
  level: 'self-attested',
  source: {
    kind: 'upload', filename_claimed: 'statement.pdf', media_type_claimed: 'application/pdf',
    media_type_detected: 'application/pdf', bytes: 9, principal: 'user:abc',
  },
  sink: (l) => lines.push(l),
});
obs.chunk(Buffer.from('hello'));
obs.chunk(Buffer.from(' you'));
const sealed = obs.close({ complete: true });

const evs = lines.map((l) => JSON.parse(l));
ok('observation: open + chunks + close', evs.length === 4);
ok('observation: every event signed', evs.every((e) => e.signature));
ok('observation: every signature verifies', evs.every((e) => verifyEvent(e, id.publicKey)));
ok('observation: bytes counted', sealed.bytes === 9);
ok('observation: parents chain within the observation',
  evs[1].parent_links[0] === evs[0].event_id && evs[2].parent_links[0] === evs[1].event_id);

// The claim must be present AND must state what it does not assert. An upload
// record that omits this is the exact failure mode being guarded against.
ok('observation: upload states it is receipt, not authenticity',
  evs[0].payload.claim.does_not_assert.includes('authenticity')
  && CLAIMS.upload.does_not_assert.length > 0);

// --- tamper: the whole point ------------------------------------------------
const t1 = JSON.parse(lines[0]);
t1.payload.attestation.level = 'attested';
ok('tamper: rewriting the attestation level breaks the signature',
  !verifyEvent(t1, id.publicKey));

const t2 = JSON.parse(lines[0]);
t2.payload.source.filename_claimed = 'other.pdf';
ok('tamper: rewriting the source breaks the signature', !verifyEvent(t2, id.publicKey));

const t3 = JSON.parse(lines[2]);
t3.payload.digest = 'sha256:' + '0'.repeat(64);
ok('tamper: rewriting a chunk digest breaks the signature', !verifyEvent(t3, id.publicKey));

// A different key must not verify. Trivial, and it has to be stated: the
// signature is only meaningful if the WRONG key fails.
const other = generateIdentity();
ok('tamper: another key does not verify', !verifyEvent(evs[0], other.publicKey));

// Reformatting must NOT break it — that is what canonicalization is for.
//
// The first version of this check used JSON.stringify(ev, Object.keys(ev)) and
// failed. The library was right and the check was wrong: a replacer ARRAY is a
// filter applied at every depth, so it quietly dropped every nested payload key
// and the signature correctly refused a truncated object. Recorded rather than
// silently fixed — it is the third time in this work that a probe has measured
// its own assumptions instead of the thing in front of it.
const reversed: Record<string, unknown> = {};
for (const k of Object.keys(evs[1]).reverse()) reversed[k] = evs[1][k];
ok('key insertion order does not affect the signature', verifyEvent(reversed as never, id.publicKey));
ok('whitespace does not affect the signature',
  verifyEvent(JSON.parse(JSON.stringify(evs[1], null, 2)), id.publicKey));

// --- substantiation ---------------------------------------------------------
ok('substantiate: attested claim with no genesis offered is not substantiated',
  substantiate({ claimed: 'attested', signaturesVerify: true, genesisVouches: null }).level === 'self-attested');
ok('substantiate: attested claim refused by genesis is not substantiated',
  substantiate({ claimed: 'attested', signaturesVerify: true, genesisVouches: false }).level === 'self-attested');
ok('substantiate: attested claim vouched for stands',
  substantiate({ claimed: 'attested', signaturesVerify: true, genesisVouches: true }).level === 'attested');
ok('substantiate: broken signatures fall to unsigned',
  substantiate({ claimed: 'attested', signaturesVerify: false, genesisVouches: true }).level === 'unsigned');

// --- incomplete must not read as complete -----------------------------------
const lines2: string[] = [];
const partial = new Observation({
  kind: 'retrieval', idPrefix: 'test:observer', identity: id, level: 'self-attested',
  source: {
    kind: 'retrieval', url_requested: 'https://x/y', url_final: 'https://x/y', redirects: [],
    status: 200, media_type: 'text/html', bytes: 0, tls: null, server_date: null,
  },
  sink: (l) => lines2.push(l),
});
partial.chunk(Buffer.from('abc'));
const cut = partial.close({ complete: false, note: 'connection closed mid-body' });
const closeEv = JSON.parse(lines2[lines2.length - 1]);
ok('incomplete observation records complete:false explicitly',
  closeEv.payload.complete === false && !cut.complete);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
