#!/usr/bin/env node
/** Boot an owned imagine host, load PAC-MAN, and play it. */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const T = '/tmp/pacman';
const addr = JSON.parse(readFileSync(`${T}/host.json`, 'utf8'));
const BASE = addr.base, TOK = addr.token;
const lvl = JSON.parse(readFileSync(`${T}/level.json`, 'utf8'));
const graph = JSON.parse(readFileSync(`${T}/pacman.graph.json`, 'utf8'));

const login = await (await fetch(`${BASE}/svc/identity/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-imagine-token': TOK },
  body: JSON.stringify({ email: 'dev@example.com', password: 'password123' }),
})).json();
const H = {
  'content-type': 'application/json',
  'x-imagine-token': TOK,
  authorization: `Bearer ${login.token ?? ''}`,
};
const call = async (m, p, b) => {
  const r = await fetch(`${BASE}${p}`, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

// ── predictions, before a single move ─────────────────────────────────────
await call('POST', '/svc/catalog/api/contexts', {
  key: 'context/predictions.pacman', name: 'MAP predictions — PAC-MAN as a graph',
  type: 'context', tags: ['map', 'predictions', 'pacman'],
  content: {
    subject: 'Can sixteen provenance components play a maze game, and does the rollup make winning a lane transition?',
    predictions: [
      { id: 'P1', claim: 'A move into a wall lands on the blocked port and never reaches the board rollup.', expectation: 'holds' },
      { id: 'P2', claim: 'Each legal move advances rollup coverage by exactly 1/dots and names the remaining tiles in missing.', expectation: 'holds' },
      { id: 'P3', claim: 'Eating the final dot flips the board from apocryphal to canonical — winning IS the lane transition.', expectation: 'holds' },
      { id: 'P4', claim: 'transform.map can synthesise the constant 1 by mapping value from arithmetic\'s exact:true field.', expectation: 'holds; Number(true) === 1 and rollup only requires a finite number' },
      { id: 'P5', claim: 'EXPECTED TO BREAK — revisiting an already-eaten dot leaves coverage unchanged and is indistinguishable, in the output, from eating a fresh one. rollup stores latest-per-key, so a second visit overwrites with the same value and reports the same coverage. A game needs to know you scored nothing; the component was built to answer a different question and will not tell you.', expectation: 'BREAKS' },
    ],
  },
});

const g = await call('POST', '/svc/runtime/api/graphs', graph);
if (g.status >= 400) { console.log('LOAD FAILED', JSON.stringify(g.body)); process.exit(1); }
await call('POST', `/svc/runtime/api/graphs/${g.body.id}/execute`);
console.log(`loaded pacman — ${g.body.nodeCount} nodes, ${g.body.edgeCount} edges\n`);

// ── board rendering ───────────────────────────────────────────────────────
const eaten = new Set();
function render(pos, note) {
  const rows = [];
  for (let y = 0; y < lvl.H; y++) {
    let r = '';
    for (let x = 0; x < lvl.W; x++) {
      const i = y * lvl.W + x;
      r += i === pos ? ' C' : lvl.MAZE[i] === '#' ? ' #' : eaten.has(i) ? '  ' : ' .';
    }
    rows.push(r);
  }
  console.log(rows.join('\n') + (note ? `\n${note}` : '') + '\n');
}

let pos = lvl.pacStart;
eaten.add(pos);
console.log('start');
render(pos);

async function move(dir) {
  const r = await call('POST', '/svc/runtime/api/ingress/pacman', { dir, pos });
  const o = r.body.outputs ?? {};
  const won = o['moved:out'], wall = o['blocked:out'];
  if (wall) {
    render(pos, `${dir.padEnd(5)} BLOCKED — tile ${wall.value.pos} is a wall; the switch had no such port, so it took default`);
    return { blocked: true };
  }
  if (!won) { console.log(`${dir}: no output`, JSON.stringify(r.body).slice(0, 200)); return {}; }
  pos = won.value ? Number(Object.keys(o).length && wonPos(o)) : pos;
  return { board: won };
}
function wonPos(o) { return o['moved:out'] && o['moved:out'].valuePos; }

// The rollup's output does not carry the position, so track it from the move.
async function step(dir) {
  const next = { up: pos - lvl.W, down: pos + lvl.W, left: pos - 1, right: pos + 1 }[dir];
  const r = await call('POST', '/svc/runtime/api/ingress/pacman', { dir, pos });
  const o = r.body.outputs ?? {};
  if (o['blocked:out']) {
    render(pos, `${dir.padEnd(5)}  BLOCKED at ${next} — no port for that tile, so it took "default"`);
    return null;
  }
  const b = o['moved:out'];
  if (!b) { console.log(`${dir}: unexpected`, JSON.stringify(r.body).slice(0, 260)); return null; }
  pos = next;
  const fresh = !eaten.has(pos);
  eaten.add(pos);
  const v = b.value;
  render(pos, `${dir.padEnd(5)}  -> ${pos}   coverage ${v.coverage.toFixed(3)}  eaten ${v.present}/${lvl.dots.length}  lane ${b.lane}` +
    (fresh ? '' : '   (revisit — watch coverage)'));
  return b;
}

// ── a route that clears the board ─────────────────────────────────────────
const route = [
  'right','right','right','right',              // top corridor
  'up',                                          // into the wall
  'down','down',                                 // 12 -> 19 -> 26
  'left','left','left','left',                   // 25 24 23 22
  'down','down',                                 // 29 -> 36
  'right','right','right','right',               // 37 38 39 40
  'up','up',                                     // 33 -> 26  (revisit)
  'left','left',                                 // 25 24 revisit
  'up','up',                                     // 17 -> 10 revisit
  'left','left',                                 // 9 8 revisit
  'down','down',                                 // 15 -> 22 revisit
  'right','down','down',                         // 23 -> 30? wall -> then
  'right','right','up','up',                     // wander
  'left','down','right','up',
];
let last = null;
for (const d of route) { const b = await step(d); if (b) last = b; }

// ── result ────────────────────────────────────────────────────────────────
if (last) {
  const v = last.value;
  console.log('FINAL BOARD');
  console.log(`  lane      ${last.lane}`);
  console.log(`  coverage  ${v.coverage.toFixed(3)}   (${v.present} of ${lvl.dots.length} dots)`);
  console.log(`  missing   ${JSON.stringify(v.missing)}`);
  console.log(`  ${v.missing.length === 0 ? 'BOARD CLEARED — the rollup went canonical. That is the win.' : 'NOT WON — the rollup names what is left, on the apocryphal lane.'}`);
  writeFileSync(`${T}/final.json`, JSON.stringify(last, null, 2));
}
