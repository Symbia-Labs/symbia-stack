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

/** Must match D in Spyglass.tsx. The lens is one fixed size now. */
const D = 280;

interface Case {
  name: string;
  pos: { x: number; y: number };
  vw: number;
  vh: number;
}

const cases: Case[] = [
  { name: 'default position', pos: { x: 80, y: 120 }, vw: 1600, vh: 1000 },
  { name: 'hard left, y=0', pos: { x: 0, y: 0 }, vw: 1600, vh: 1000 },
  { name: 'hard right', pos: { x: 1320, y: 300 }, vw: 1600, vh: 1000 },
  { name: 'centred', pos: { x: 600, y: 300 }, vw: 1600, vh: 1000 },
  { name: 'bottom right corner', pos: { x: 1300, y: 700 }, vw: 1600, vh: 1000 },
  { name: 'dragged half off the left edge', pos: { x: -140, y: 400 }, vw: 1600, vh: 1000 },
  { name: 'window narrower than the sample', pos: { x: 10, y: 10 }, vw: 120, vh: 700 },
];

let failures = 0;
let refusals = 0;

for (const c of cases) {
  const geo = { x: c.pos.x, y: c.pos.y, d: D };
  const r = tabSampleRect(c.pos, c.vw, c.vh);
  if (!r) {
    refusals++;
    console.log(`  REFUSED  ${c.name}  (lens ${D}px in ${c.vw}x${c.vh})`);
    continue;
  }
  const overlaps = !(
    r.x + r.size <= geo.x ||
    r.x >= geo.x + geo.d ||
    r.y + r.size <= geo.y ||
    r.y >= geo.y + geo.d
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
