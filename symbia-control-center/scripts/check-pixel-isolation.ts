#!/usr/bin/env node
/**
 * Does chat actually have no path to the pixels?
 *
 * The claim is structural, so the check is structural. It does two things that
 * a comment cannot: it exercises the gate against a real denial, and it reads
 * the chat sources looking for the bytes rather than trusting that they are
 * absent.
 *
 * The second half matters more. The gate could be perfect and chat could still
 * hold an image, because the way it held one before was not by asking the gate
 * — it was handed the base64 in a store and rendered it. A test that only
 * probed the gate would have passed that entire time. So this greps for the
 * shapes that failure takes: a data: image URL, an imageBase64 field, a
 * toDataURL call, anywhere under components/chat or in ChatPanel.
 *
 * It reports observations. "ChatPanel.tsx contains no base64 image expression"
 * is what it can say; "chat cannot see pixels" is a conclusion about a whole
 * bundle and this script is not entitled to it.
 *
 *   npx tsx scripts/check-pixel-isolation.ts
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
const say = (ok: boolean, line: string) => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok      ' : 'FAIL    '} ${line}`);
};

// ---------------------------------------------------------------- the gate
const vault = await import('../src/components/glass/pixelVault.js').catch(() =>
  import(path.join(root, 'src/components/glass/pixelVault.ts'))
);

const DIGEST = 'deadbeefdeadbeef';
vault.deposit(DIGEST, 'PRETEND_PNG_BYTES');

const chatGrant = vault.requestGrant('chat', DIGEST);
say(chatGrant === null, 'holder "chat" is refused a grant');
say(vault.withdraw(chatGrant) === null, 'holder "chat" withdraws nothing');

// A caller that forges the grant object rather than asking for one.
const forged = { holder: 'chat', digest: DIGEST, issuedAt: new Date().toISOString() };
say(vault.withdraw(forged) === null, 'a forged grant naming "chat" withdraws nothing');

const modelsGrant = vault.requestGrant('service:models', DIGEST);
say(modelsGrant !== null, 'holder "service:models" is granted');
say(vault.withdraw(modelsGrant) === 'PRETEND_PNG_BYTES', 'holder "service:models" withdraws bytes');

vault.forget(DIGEST);
say(vault.withdraw(modelsGrant) === null, 'a forgotten frame withdraws nothing');
say(vault.heldCount() === 0, 'vault is empty after forget');

// ------------------------------------------------------- the chat sources
//
// The gate is only half of it. Chat held pixels once by being handed them, not
// by asking, so look for the bytes themselves.
const PIXEL_SHAPES: { name: string; re: RegExp }[] = [
  { name: 'data: image URL', re: /data:image\/[a-z]+;base64/ },
  { name: 'imageBase64 field', re: /imageBase64/ },
  { name: 'toDataURL call', re: /toDataURL/ },
  { name: 'canvas element', re: /<canvas/ },
];

/**
 * Comments are prose, not behaviour.
 *
 * The first run of this script failed frameStore.ts because the comment
 * explaining why there is no `imageBase64` field contains the words
 * "imageBase64". A check that cannot tell the difference between code and a
 * note about code will punish documentation, which is a good way to end up
 * with none.
 *
 * Block comments go entirely. For line comments only whole lines are dropped —
 * stripping from `//` mid-line would eat the rest of any line containing a URL
 * and could hide real code behind a false pass.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}

const chatFiles = [
  ...walk(path.join(root, 'src/components/chat')),
  path.join(root, 'src/components/panels/ChatPanel.tsx'),
];

for (const file of chatFiles) {
  const src = stripComments(readFileSync(file, 'utf8'));
  const hits = PIXEL_SHAPES.filter((s) => s.re.test(src)).map((s) => s.name);
  say(
    hits.length === 0,
    `${path.relative(root, file)}${hits.length ? ` — contains ${hits.join(', ')}` : ' — no pixel-bearing expression'}`
  );
}

// The store chat reads must not have a field capable of carrying an image.
const storeSrc = stripComments(
  readFileSync(path.join(root, 'src/components/glass/frameStore.ts'), 'utf8')
);
say(
  !/imageBase64|data:image|bytes:\s*string/.test(storeSrc),
  'frameStore has no field that can carry image bytes'
);

console.log(`\n${failures === 0 ? 'no failures' : `${failures} failure(s)`}`);
console.log(
  'NOTE: this checks the gate and the chat sources. It does not prove the\n' +
    'bundle has no other path to the vault — that is a claim about all code,\n' +
    'and this script only read some of it.'
);
process.exit(failures === 0 ? 0 : 1);
