/**
 * Does the lens ever sample itself?
 *
 * This imports the REAL tabSampleRect out of Spyglass.tsx — not a copy of it.
 * A copy would share whatever the original got wrong, which is the failure this
 * project keeps catching: a check that agrees with the code because it is the
 * code.
 *
 * It asserts one property and nothing else: the returned rectangle does not
 * intersect the lens. Whether the resulting image is USEFUL is not something a
 * geometry test can answer, and this does not claim to.
 *
 *   npx esbuild --bundle scripts/check-spyglass-geometry.ts --format=esm \
 *     --outfile=/tmp/spy.mjs --alias:@=./src --packages=external
 *   node /tmp/spy.mjs
 */
import { tabSampleRect } from '../src/components/glass/Spyglass';

interface Case {
  name: string;
  geo: { x: number; y: number; d: number };
  zoom: number;
  vw: number;
  vh: number;
}

const cases: Case[] = [
  // The one in the screenshot, 7 Aug 2026: large lens parked at the left edge.
  // The old code offset one diameter left, clamped to 0, and landed on itself.
  { name: 'screenshot: big lens, left edge', geo: { x: 85, y: 130, d: 670 }, zoom: 2, vw: 2000, vh: 1150 },
  { name: 'default position', geo: { x: 80, y: 120, d: 320 }, zoom: 2, vw: 1600, vh: 1000 },
  { name: 'hard left, y=0', geo: { x: 0, y: 0, d: 400 }, zoom: 2, vw: 1600, vh: 1000 },
  { name: 'hard right', geo: { x: 1180, y: 300, d: 400 }, zoom: 2, vw: 1600, vh: 1000 },
  { name: 'centred', geo: { x: 600, y: 300, d: 400 }, zoom: 4, vw: 1600, vh: 1000 },
  { name: 'max lens in a small window', geo: { x: 20, y: 20, d: 900 }, zoom: 2, vw: 1000, vh: 700 },
  { name: 'bottom right corner', geo: { x: 1400, y: 800, d: 160 }, zoom: 8, vw: 1600, vh: 1000 },
];

let failures = 0;
let refusals = 0;

for (const c of cases) {
  const r = tabSampleRect(c.geo, c.zoom, c.vw, c.vh);
  if (!r) {
    refusals++;
    console.log(`  REFUSED  ${c.name}  (lens ${c.geo.d}px in ${c.vw}x${c.vh})`);
    continue;
  }
  const overlaps = !(
    r.x + r.size <= c.geo.x ||
    r.x >= c.geo.x + c.geo.d ||
    r.y + r.size <= c.geo.y ||
    r.y >= c.geo.y + c.geo.d
  );
  const onScreen = r.x >= 0 && r.y >= 0 && r.x + r.size <= c.vw && r.y + r.size <= c.vh;
  const bad = overlaps || !onScreen;
  if (bad) failures++;
  console.log(
    `  ${bad ? 'FAIL    ' : 'ok      '} ${c.name}  sample=(${Math.round(r.x)},${Math.round(r.y)}) ${Math.round(r.size)}px` +
      `${overlaps ? '  OVERLAPS LENS' : ''}${onScreen ? '' : '  OFF SCREEN'}`
  );
}

console.log(`\n${cases.length} cases · ${failures} sampling the lens · ${refusals} refused`);
process.exit(failures === 0 ? 0 : 1);
