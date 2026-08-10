#!/usr/bin/env node
/**
 * Verify a spyglass clip against its lineage ledger.
 *
 *   node scripts/verify-clip.js /tmp/symbia-spyglass/clip-<id>
 *
 * Reads ONLY the ledger and the file on disk — never the app's own account of
 * what it did. The point of the ledger is that a third party who has the clip
 * and the sidecar, and nothing else, can decide for themselves whether the clip
 * is intact. So this script takes nothing on trust, including from the process
 * that wrote the files.
 *
 * It checks:
 *   - structure: one open event, one close event, segments in strict order with
 *     single parent links forming a chain back to the open event;
 *   - completeness: the segment byte counts sum to the size of the clip file;
 *   - integrity: the chain recomputed from the segment digests alone reproduces
 *     the recorded head;
 *   - tamper locality: flipping a bit in one segment digest breaks the chain at
 *     that segment and no earlier;
 *   - the non-epistemic rule: no event carries media, only digests and
 *     structural metadata.
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

const dir = process.argv[2];
if (!dir) {
  console.error('usage: verify-clip.js <clip-dir>');
  process.exit(2);
}

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); };

const ledgerPath = path.join(dir, 'lineage.jsonl');
const videoPath = path.join(dir, 'clip.webm');
const lines = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n');
const evs = lines.map((l, i) => {
  try { return JSON.parse(l); }
  catch { console.error(`line ${i + 1} is not valid JSON`); process.exit(2); }
});

const open = evs.find((e) => e.event_type === 'capture.clip.open');
const close = evs.find((e) => e.event_type === 'capture.clip.close');
const segs = evs.filter((e) => e.event_type === 'capture.segment');
const size = fs.statSync(videoPath).size;

check('open and close events present', Boolean(open && close));
check('line count = segments + 2', lines.length === segs.length + 2,
  `${lines.length} lines, ${segs.length} segments`);
check('close reports the segment count it has', close.payload.segments === segs.length,
  `close says ${close.payload.segments}, ledger has ${segs.length}`);

// Ordering and parentage: seq is 1..n with no gaps, and each event links to
// exactly one parent — the previous segment, or the open event for the first.
const ordered = segs.every((e, i) =>
  e.payload.seq === i + 1 &&
  Array.isArray(e.parent_links) && e.parent_links.length === 1 &&
  e.parent_links[0] === (i === 0 ? open.event_id : segs[i - 1].event_id));
check('segments strictly ordered with single parent links', ordered);

// Offsets must tile the file exactly, with no gap and no overlap.
let cursor = 0, tiled = true;
for (const e of segs) {
  if (e.payload.offset !== cursor) { tiled = false; break; }
  cursor += e.payload.bytes;
}
check('segment offsets tile the file with no gap or overlap', tiled);
check('byte counts sum to the clip file size', cursor === size,
  `${cursor} vs ${size}`);

// Recompute the chain from the digests alone.
const digestOf = (e) => Buffer.from(e.payload.digest.replace(/^sha256:/, ''), 'hex');
const advance = (chain, digest) =>
  crypto.createHash('sha256').update(chain).update(digest).digest();

let chain = Buffer.alloc(32); // genesis: 32 zero bytes
const perSegment = [];
for (const e of segs) { chain = advance(chain, digestOf(e)); perSegment.push(chain.toString('hex')); }
const head = `sha256:${chain.toString('hex')}`;
check('chain recomputes to the recorded head', head === close.payload.chain_head,
  `${head.slice(0, 22)}… vs ${String(close.payload.chain_head).slice(0, 22)}…`);
check('every segment checksum matches its position in the chain',
  segs.every((e, i) => e.checksum === `sha256:${perSegment[i]}`));

// Each segment's own bytes must hash to the digest the ledger claims.
const fd = fs.openSync(videoPath, 'r');
let bytesOk = true;
for (const e of segs) {
  const buf = Buffer.alloc(e.payload.bytes);
  fs.readSync(fd, buf, 0, e.payload.bytes, e.payload.offset);
  if (crypto.createHash('sha256').update(buf).digest('hex') !== e.payload.digest.replace(/^sha256:/, '')) {
    bytesOk = false; break;
  }
}
fs.closeSync(fd);
check('clip bytes hash to the digests the ledger claims', bytesOk);

// Tamper locality. Pick a segment that exists — an earlier version of this
// script always tampered with segment 4 and reported a failure on any clip
// shorter than that, which was the script agreeing with the clip it was written
// against rather than testing anything.
if (segs.length >= 1) {
  const target = Math.min(4, segs.length); // 1-based
  let t = Buffer.alloc(32), divergedAt = null;
  segs.forEach((e, i) => {
    let d = digestOf(e);
    if (i === target - 1) { d = Buffer.from(d); d[0] ^= 1; }
    t = advance(t, d);
    if (divergedAt === null && t.toString('hex') !== perSegment[i]) divergedAt = i + 1;
  });
  check(`tampering with segment ${target} diverges at segment ${target}`,
    divergedAt === target, `diverged at ${divergedAt}`);
}

// Non-epistemic rule: structural metadata only, never content.
const leak = evs.find((e) => /data:|base64|[A-Za-z0-9+/]{200,}/.test(JSON.stringify(e)));
check('ledger carries no media, only digests and structure', !leak,
  leak ? `event ${leak.event_id}` : '');

let failed = 0;
console.log(`clip ${open.payload.clip_id}  ${open.payload.frame.width}×${open.payload.frame.height}  ` +
  `${segs.length} segments  ${size} bytes  ${(close.payload.duration_ms / 1000).toFixed(1)}s`);
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
}
console.log(failed === 0 ? '\nverified' : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
