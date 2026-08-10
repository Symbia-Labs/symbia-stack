#!/usr/bin/env node
/**
 * Verify a spyglass clip against its lineage ledger.
 *
 *   node scripts/verify-clip.js /tmp/symbia-spyglass/clip-<id>
 *
 * Reads ONLY the ledger and the files on disk — never the app's own account of
 * what it did. The point of the ledger is that a third party who has the clip
 * and the sidecar, and nothing else, can decide for themselves whether the clip
 * is intact. So this script takes nothing on trust, including from the process
 * that wrote the files.
 *
 * Each TRACK is its own chain. The clip is a binding over track heads, not one
 * interleaved sequence, which is what allows a track to be withheld: run this
 * with `--absent audio` and it verifies everything it still has, confirms the
 * binding using the withheld track's head from the ledger, and reports the
 * audio as present-but-not-held rather than missing. Someone can be handed the
 * video and shown that the audio belonged to the same capture without being
 * given the audio.
 *
 * Checks:
 *   - structure: one open and one close event; segments in strict order within
 *     each track, single parent links chaining back to the open event;
 *   - completeness: each track's segment bytes tile its file exactly;
 *   - integrity: each chain recomputed from digests alone reproduces its head,
 *     and the bytes on disk hash to the digests claimed;
 *   - binding: the recorded binding is reproducible from the track heads;
 *   - tamper locality: flipping a bit in one segment digest breaks that track's
 *     chain at that segment and no earlier;
 *   - the non-epistemic rule: no event carries media, only digests, device
 *     labels and structure.
 *
 * Exits non-zero if any check fails.
 *
 * Note on completeness: byte-sum agreement means the file and the ledger agree,
 * NOT that the recording is whole. A clip that lost its tail before either was
 * written agrees with itself perfectly. That failure is real and has happened
 * (docs/2026-08-10-spyglass-video-lineage.md §4.1); it is caught at record time,
 * not here.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
const absent = new Set();
for (let i = 0; i < args.length; i++) if (args[i] === '--absent') absent.add(args[i + 1]);
if (!dir) {
  console.error('usage: verify-clip.js <clip-dir> [--absent <track>]');
  process.exit(2);
}

const TRACK_FILES = { video: 'clip.webm', audio: 'audio.webm' };
const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });
const hex = (s) => String(s).replace(/^sha256:/, '');
const advance = (chain, digest) => crypto.createHash('sha256').update(chain).update(digest).digest();

// What each attestation level is allowed to claim. Kept as prose because the
// failure this guards against is a UI rendering a signature as a tick and a
// reader concluding "verified" — the word has to travel with the result.
const MEANS = {
  'unsigned':
    'Nothing attests this clip. The chain shows it is internally consistent; anyone could have written it.',
  'self-attested':
    'Signed by a key generated on the capturing machine. Proves every event came from one holder of that key and has not been altered since. Does NOT establish which machine, which person, or any external trust.',
  'attested':
    'Signed by a key chaining to an imported genesis. Trust is only as good as that genesis and how it was obtained.',
  'hardware-attested':
    'Signed by a key that cannot be exported from the machine that holds it.',
};

const evs = fs.readFileSync(path.join(dir, 'lineage.jsonl'), 'utf8').trim().split('\n')
  .map((l, i) => {
    try { return JSON.parse(l); }
    catch { console.error(`line ${i + 1} is not valid JSON`); process.exit(2); }
  });

const open = evs.find((e) => e.event_type === 'capture.clip.open');
const close = evs.find((e) => e.event_type === 'capture.clip.close');
check('open and close events present', Boolean(open && close));
if (!open || !close) { report(); }

const declared = (open.payload.tracks ?? []).map((t) => t.id);
const inClose = Object.keys(close.payload.tracks ?? {});
check('declared tracks match the close event', declared.slice().sort().join(',') === inClose.slice().sort().join(','),
  `declared [${declared}] vs closed [${inClose}]`);

const heads = {};
for (const id of inClose.slice().sort()) {
  const segs = evs.filter((e) => e.event_type === 'capture.segment' && e.payload.track === id);
  const summary = close.payload.tracks[id];
  heads[id] = hex(summary.chain_head);
  const held = !absent.has(id);
  const file = path.join(dir, TRACK_FILES[id] ?? `${id}.webm`);
  const exists = held && fs.existsSync(file);

  check(`[${id}] close reports the segment count the ledger has`,
    summary.segments === segs.length, `close ${summary.segments}, ledger ${segs.length}`);

  // Ordering and parentage within the track.
  const ordered = segs.every((e, i) =>
    e.payload.seq === i + 1 &&
    Array.isArray(e.parent_links) && e.parent_links.length === 1 &&
    e.parent_links[0] === (i === 0 ? open.event_id : segs[i - 1].event_id));
  check(`[${id}] segments strictly ordered with single parent links`, ordered);

  // Offsets must tile the track's file exactly.
  let cursor = 0, tiled = true;
  for (const e of segs) {
    if (e.payload.offset !== cursor) { tiled = false; break; }
    cursor += e.payload.bytes;
  }
  check(`[${id}] segment offsets tile with no gap or overlap`, tiled);
  check(`[${id}] byte counts sum to the close event's total`, cursor === summary.bytes,
    `${cursor} vs ${summary.bytes}`);

  // Recompute this track's chain from its digests alone.
  let chain = Buffer.alloc(32); // genesis
  const perSegment = [];
  for (const e of segs) { chain = advance(chain, Buffer.from(hex(e.payload.digest), 'hex')); perSegment.push(chain.toString('hex')); }
  check(`[${id}] chain recomputes to the recorded head`, chain.toString('hex') === heads[id],
    `${chain.toString('hex').slice(0, 16)}… vs ${heads[id].slice(0, 16)}…`);
  check(`[${id}] every segment checksum matches its position in the chain`,
    segs.every((e, i) => hex(e.checksum) === perSegment[i]));

  if (!held) {
    check(`[${id}] withheld — binding still checkable from its head alone`, true,
      'track not present, head taken from the ledger');
    continue;
  }
  if (!exists) {
    check(`[${id}] track file present`, false, `${file} missing (pass --absent ${id} if withheld deliberately)`);
    continue;
  }
  check(`[${id}] byte counts sum to the file size`, cursor === fs.statSync(file).size,
    `${cursor} vs ${fs.statSync(file).size}`);

  // The bytes on disk must hash to the digests the ledger claims.
  const fd = fs.openSync(file, 'r');
  let bytesOk = true;
  for (const e of segs) {
    const buf = Buffer.alloc(e.payload.bytes);
    fs.readSync(fd, buf, 0, e.payload.bytes, e.payload.offset);
    if (crypto.createHash('sha256').update(buf).digest('hex') !== hex(e.payload.digest)) { bytesOk = false; break; }
  }
  fs.closeSync(fd);
  check(`[${id}] bytes on disk hash to the digests the ledger claims`, bytesOk);

  // Tamper locality. Target a segment that exists — an earlier version of this
  // script always tampered with segment 4 and reported a failure on any clip
  // shorter than that, which was the script agreeing with the clip it was
  // written against rather than testing anything.
  if (segs.length) {
    const target = Math.min(4, segs.length); // 1-based
    let t = Buffer.alloc(32), divergedAt = null;
    segs.forEach((e, i) => {
      let d = Buffer.from(hex(e.payload.digest), 'hex');
      if (i === target - 1) { d = Buffer.from(d); d[0] ^= 1; }
      t = advance(t, d);
      if (divergedAt === null && t.toString('hex') !== perSegment[i]) divergedAt = i + 1;
    });
    check(`[${id}] tampering with segment ${target} diverges at segment ${target}`,
      divergedAt === target, `diverged at ${divergedAt}`);
  }
}

// The binding commits to every track head in sorted order.
const b = crypto.createHash('sha256');
for (const id of inClose.slice().sort()) b.update(id).update(Buffer.from(heads[id], 'hex'));
check('binding reproduces from the track heads', b.digest('hex') === hex(close.payload.binding));

// --- signatures ------------------------------------------------------------
// A chain proves the clip is internally consistent. It does not say who made
// it: a forger can produce a perfectly consistent chain over bytes they chose.
// The signature is what makes the ledger evidence to someone who does not trust
// the process that wrote it — and only as far as the level allows.
const att = open.payload.attestation ?? null;
const level = att?.level ?? 'unsigned';
if (!att) {
  check('attestation declared', false, 'no attestation block — treating as unsigned');
} else {
  let key = null;
  try { key = crypto.createPublicKey(att.public_key); } catch { /* reported below */ }
  check('public key in the ledger is usable', Boolean(key));

  // The instrument id must be derived from the key it travels with, or the id
  // is just another string the writer chose.
  if (key) {
    const fp = crypto.createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex');
    check('instrument id is derived from the public key',
      att.instrument === `spyglass:instrument:${fp.slice(0, 16)}`,
      att.instrument);
  }

  // Every event that carries a checksum must carry a signature over it.
  const signable = evs.filter((e) => e.checksum);
  const unsigned = signable.filter((e) => !e.signature);
  check('every event is signed', unsigned.length === 0,
    unsigned.length ? `${unsigned.length} unsigned of ${signable.length}` : `${signable.length} events`);

  if (key) {
    let bad = null;
    for (const e of signable) {
      if (!e.signature) continue;
      const sig = Buffer.from(String(e.signature).replace(/^ed25519:/, ''), 'base64');
      const ok = crypto.verify(null, Buffer.from(hex(e.checksum), 'hex'), key, sig);
      if (!ok) { bad = e.event_id; break; }
    }
    check('every signature verifies against that key', !bad, bad ? `first bad: ${bad}` : '');

    // A signature over a value that is not the recomputed chain would verify
    // while attesting nothing about the bytes. The chain checks above already
    // recompute each head; this confirms the signed value is that head.
    const closeSigOk = close.signature
      ? crypto.verify(null, Buffer.from(hex(close.payload.binding), 'hex'), key,
          Buffer.from(String(close.signature).replace(/^ed25519:/, ''), 'base64'))
      : false;
    check('the close signature covers the binding, not some other value', closeSigOk);
  }
}

// Non-epistemic rule: structural metadata only, never content. Device labels
// are structural (which microphone), not content (what it heard). The public
// key is exempt: it is long and opaque, and it is the one thing here that must
// travel in the clear.
const leak = evs.find((e) => {
  const s = JSON.stringify({ ...e, payload: { ...e.payload, attestation: undefined } });
  return /data:|base64,|[A-Za-z0-9+/]{200,}/.test(s);
});
check('ledger carries no media, only digests and structure', !leak, leak ? `event ${leak.event_id}` : '');

report();

function report() {
  const tracks = Object.entries(close?.payload?.tracks ?? {})
    .map(([k, v]) => `${k} ${v.segments}seg/${v.bytes}B${absent.has(k) ? ' (withheld)' : ''}`).join('  ');
  console.log(`clip ${open?.payload?.clip_id ?? '?'}  ${tracks}  ${((close?.payload?.duration_ms ?? 0) / 1000).toFixed(1)}s`);
  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed++;
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
  }
  // Never print a bare "verified" for a signed clip. What was verified is
  // integrity; what the signature adds depends on the level, and the level has
  // to be said out loud or the tick gets read as identity.
  const lvl = open?.payload?.attestation?.level ?? 'unsigned';
  if (failed === 0) {
    console.log(`\nintegrity verified — attestation: ${lvl}`);
    console.log(wrap(MEANS[lvl] ?? 'Unknown attestation level; treat as unsigned.', 76, '  '));
  } else {
    console.log(`\n${failed} check(s) failed — attestation: ${lvl}`);
  }
  process.exit(failed === 0 ? 0 : 1);
}

function wrap(s, width, indent) {
  const words = s.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width) { lines.push(line.trim()); line = w; }
    else line += ' ' + w;
  }
  if (line.trim()) lines.push(line.trim());
  return lines.map((l) => indent + l).join('\n');
}
