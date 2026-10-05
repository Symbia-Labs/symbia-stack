/**
 * The first tests in this package.
 *
 * WHY THERE WERE NONE, AND WHY THAT MATTERED. Component handlers are
 * `(input, ctx) => ports` — near-pure functions with a declared contract, and
 * about as testable as code gets. Nothing tested them, so the only way anyone
 * had ever validated a component was to boot a host and drive it. That is how
 * an ephemeral sketch became the default proving ground for primitives that
 * ship in the persistent stack too, running in-process with the host's full
 * authority. The harness was missing, not the discipline.
 *
 * `node:test` is built in, and `tsx` is already this package's TS runner, so
 * the harness adds no dependency at all:
 *   npm run test          (runtime/)
 *
 * Not `node --experimental-strip-types`: this codebase writes its relative
 * imports with `.js` extensions, the TypeScript/ESM convention that a bundler
 * resolves. Node's type stripping does no such remapping and dies on the
 * first transitive import. tsx already resolves them, which is why it runs
 * the dev server.
 *
 * These cases come from an external review that attacked check-v1 and found
 * two ways through. Each one failed before the fix and passes after; that is
 * the only property that makes a regression test worth keeping.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkClaimsCore, numberInCanon, numbersOf, normV1 } from './components.js';

/** A corpus whose only digits belong to a phone number — the review's case. */
const CANON = {
  'src-a.txt':
    'The department reported findings on the matter. The office reviewed the register and the appendix.',
  'src-b.txt':
    'Overpayments accounted for $153 billion, roughly 82 percent. Contact the office at (202) 514-3435.',
};

test('an honest, distinctive, correctly-cited claim passes', () => {
  const { results, failed } = checkClaimsCore(
    [{ id: 'ok', claim: 'Overpayments were roughly 82 percent.', source: 'src-b.txt', quote: 'roughly 82 percent' }],
    CANON
  );
  assert.equal(failed, 0, results[0].problems.join('; '));
});

test('a quote that occurs everywhere is refused — it locates nothing', () => {
  // v1 accepted this: "the" occurs in the cited source, and that was the
  // whole test. The claim itself is unsupported by anything in the corpus.
  const { results } = checkClaimsCore(
    [{ id: 'ubiquitous', claim: 'The department admitted wrongdoing.', source: 'src-a.txt', quote: 'the' }],
    CANON
  );
  assert.equal(results[0].status, 'FAIL');
  assert.match(results[0].problems.join(' '), /occurs \d+ times/);
});

test('distinctiveness is about occurrence, not length', () => {
  // A short quote that appears once locates a passage perfectly well and must
  // still pass. Refusing on length would break honest citation of short
  // phrases, which is why the rule counts matches instead.
  const { results } = checkClaimsCore(
    [{ id: 'short-but-unique', claim: 'A register was reviewed.', source: 'src-a.txt', quote: 'register' }],
    CANON
  );
  assert.equal(results[0].status, 'PASS', results[0].problems.join('; '));
});

test('a number inside another number does not support a claim', () => {
  // The review's case: "14" hiding in the "514" of a phone number.
  const { results } = checkClaimsCore(
    [{ id: 'substring', claim: '14 employees were disciplined.', source: 'src-b.txt', quote: 'roughly 82 percent' }],
    CANON
  );
  assert.equal(results[0].status, 'FAIL');
  assert.match(results[0].problems.join(' '), /number "14" does not appear/);
});

test('numbers that genuinely appear are still accepted', () => {
  assert.equal(numberInCanon('$153 billion', normV1(CANON['src-b.txt'])), true);
  assert.equal(numberInCanon('82 percent', normV1(CANON['src-b.txt'])), true);
  // and ones that only exist as fragments of other numbers are not
  assert.equal(numberInCanon('14', normV1(CANON['src-b.txt'])), false);
  assert.equal(numberInCanon('43', normV1(CANON['src-b.txt'])), false);
  assert.equal(numberInCanon('202', normV1(CANON['src-b.txt'])), true); // stands alone in (202)
});

test('a real quote cited to the wrong source is named as misattribution', () => {
  const { results } = checkClaimsCore(
    [{ id: 'wrong-src', claim: 'Overpayments were roughly 82 percent.', source: 'src-a.txt', quote: 'roughly 82 percent' }],
    CANON
  );
  assert.equal(results[0].status, 'FAIL');
  assert.match(results[0].problems.join(' '), /misattribution/);
});

test('a fabricated quote is distinguished from a misplaced one', () => {
  const { results } = checkClaimsCore(
    [{ id: 'invented', claim: 'The office denied it.', source: 'src-a.txt', quote: 'the office denied everything' }],
    CANON
  );
  assert.match(results[0].problems.join(' '), /does not appear verbatim in any/);
});

test('a claim with no quote is unchecked, which is not the same as false', () => {
  const { results } = checkClaimsCore([{ id: 'bare', claim: 'Something happened.', source: 'src-a.txt' }], CANON);
  assert.equal(results[0].status, 'FAIL');
  assert.match(results[0].problems.join(' '), /cannot be checked, which is not the same as being false/);
});

test('THE BOUNDARY: a correctly-cited quote that contradicts its claim still passes', () => {
  // This is not a defect and must not be "fixed" quietly. The checker
  // establishes that a citation exists and is correctly located. It does not
  // read for support, and a version that tried would trade an unarguable
  // mechanical check for a judgement call. The test exists so the boundary is
  // asserted rather than assumed — if someone later makes this fail, they
  // have changed what the component means and should have to say so here.
  const { results, failed } = checkClaimsCore(
    [{
      id: 'contradicted',
      claim: 'Underpayments accounted for the majority.',
      source: 'src-b.txt',
      quote: 'Overpayments accounted for $153 billion',
    }],
    CANON
  );
  assert.equal(failed, 0, 'a located citation passes even when it argues the opposite');
  assert.equal(results[0].status, 'PASS');
});

test('numbersOf extracts figures with their units', () => {
  assert.deepEqual(numbersOf('about $186 billion across 64 programs'), ['$186 billion', '64']);
});
