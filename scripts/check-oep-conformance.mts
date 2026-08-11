#!/usr/bin/env npx tsx
/**
 * Run the Open Epistemic Protocol's own conformance fixtures against this
 * platform's implementation.
 *
 * The fixtures are vendored from `open-epistemic-protocol/tests/` (Apache 2.0)
 * into `assistants/server/src/engine/oep-fixtures/`. They are copied rather
 * than referenced because a conformance suite that only runs when a sibling
 * checkout happens to be present is a suite that does not run.
 *
 * WHY THE SPEC'S VALIDATOR IS NOT USED. It is a stub:
 * `validator/detector.py` returns `False` unconditionally and
 * `validator/classifier.py` returns `None`. Adopting it would adopt a function
 * that always says fine, which is worse than nothing — it is a green tick over
 * an unexamined claim. The fixtures are the part with content, so they are the
 * part that was taken.
 *
 * Usage: npx tsx scripts/check-oep-conformance.mts
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkAwareness,
  checkHypothesisLabeling,
  checkProvenance,
} from '../assistants/server/src/engine/oep.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'assistants', 'server', 'src', 'engine', 'oep-fixtures');

/**
 * Minimal YAML reader for exactly the shape these fixtures use.
 *
 * Not a YAML parser, and it must not become one. Adding a dependency to read
 * three files with a known shape is how a build acquires a supply chain, and
 * this reads only `- input:` / `expect_*:` pairs. If a fixture arrives that
 * this cannot read, it FAILS LOUDLY rather than silently skipping — a
 * conformance runner that quietly ignores a case it does not understand
 * reports a pass it did not earn.
 */
function readFixture(path: string): Array<{ input: string; expect: Record<string, boolean> }> {
  const cases: Array<{ input: string; expect: Record<string, boolean> }> = [];
  let current: { input: string; expect: Record<string, boolean> } | null = null;

  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const input = line.match(/^\s*-\s*input:\s*"(.*)"\s*$/);
    if (input) {
      if (current) cases.push(current);
      current = { input: input[1], expect: {} };
      continue;
    }

    const expect = line.match(/^\s*(expect_\w+):\s*(true|false)\s*$/);
    if (expect && current) {
      current.expect[expect[1]] = expect[2] === 'true';
      continue;
    }

    // Structural lines the fixtures do use, and that carry no assertions.
    if (/^\s*(description:|tests:|\s+\S.*)/.test(line)) continue;

    throw new Error(`Unrecognised line in ${path} — refusing to skip it silently:\n  ${line}`);
  }
  if (current) cases.push(current);
  return cases;
}

let pass = 0;
const failures: string[] = [];

function assert(file: string, input: string, key: string, expected: boolean, actual: boolean) {
  if (expected === actual) {
    pass++;
    return;
  }
  failures.push(
    `${file}\n    input:    ${JSON.stringify(input)}\n    ${key}: expected ${expected}, got ${actual}`
  );
}

console.log('OEP conformance — the spec\'s own fixtures, against this implementation\n');

for (const file of readdirSync(FIXTURES).filter((f) => f.endsWith('.yaml')).sort()) {
  const cases = readFixture(join(FIXTURES, file));
  console.log(`${file}  (${cases.length} cases)`);

  for (const c of cases) {
    for (const [key, expected] of Object.entries(c.expect)) {
      switch (key) {
        case 'expect_awareness_violation':
          assert(file, c.input, key, expected, checkAwareness(c.input).verdict === 'violation');
          break;
        case 'expect_requires_labeling':
          assert(file, c.input, key, expected, checkHypothesisLabeling(c.input).verdict === 'violation');
          break;
        case 'expect_provenance_ok':
          assert(file, c.input, key, expected, checkProvenance(c.input).verdict === 'ok');
          break;
        default:
          // An assertion this runner does not implement is a GAP, not a pass.
          throw new Error(`No implementation for assertion '${key}' in ${file}`);
      }
    }
  }
}

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`\n  FAIL ${f}`);

if (failures.length > 0) {
  console.log(
    '\nA failure here means this platform and the protocol disagree about what a rule means.\n' +
      'Fix the implementation, or raise the fixture with the spec — do not edit the fixture to agree.'
  );
}
process.exit(failures.length > 0 ? 1 : 0);
