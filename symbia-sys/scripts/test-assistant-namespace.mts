#!/usr/bin/env npx tsx
/**
 * `@assistant` namespace — conformance.
 *
 * Small and deliberately runnable without a stack: the namespace resolves
 * against an INJECTED registry, so testing it needs no services, which is the
 * point of keeping `symbia-sys` a grammar rather than a client.
 */
import { resolveRef, getNamespaces, interpolate, type ResolutionContext } from '../src/script.js';

const ctx: ResolutionContext = {
  assistants: [
    {
      key: 'calculator',
      alias: 'calc',
      name: 'Calculator',
      description: 'Performs mathematical calculations.',
      routing: { handles: 'arithmetic written as an expression', precedence: 100 },
    },
    {
      key: 'smart-calc',
      alias: 'smartcalc',
      name: 'Smart Calculator',
      routing: { handles: 'arithmetic described in words', precedence: 50 },
    },
  ],
};

let pass = 0;
const fail: string[] = [];

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  ok    ${label}`);
  } else {
    fail.push(`${label}\n        expected ${e}\n        got      ${a}`);
    console.log(`  FAIL  ${label}`);
  }
}

console.log('@assistant namespace\n');

check('by alias', resolveRef('@assistant.calc.routing.handles', ctx).value,
  'arithmetic written as an expression');
check('by short key', resolveRef('@assistant.calculator.routing.precedence', ctx).value, 100);
// A CONSTRAINT, ASSERTED SO IT IS NOT REDISCOVERED.
//
// `splitPath` treats `/` as the start of a URL-like path — that is what makes
// `@service.logging./logs?limit=10` work — so a full catalog key parses as
// ['assistants', '/calculator'] and cannot resolve. Not a bug to route around;
// it is why the alias is the only script-expressible handle an assistant has.
check(
  'full catalog key is NOT addressable (grammar reserves /)',
  resolveRef('@assistant.assistants/calculator.name', ctx).success,
  false
);
// The short key, however, is exactly what the registry stores.
check('by short key from a nested key', resolveRef('@assistant.calculator.name', ctx).value,
  'Calculator');
check('case-insensitive', resolveRef('@assistant.SmartCalc.name', ctx).value, 'Smart Calculator');
check('whole assistant', (resolveRef('@assistant.calc', ctx).value as any)?.alias, 'calc');
check('whole registry', (resolveRef('@assistant', ctx).value as any[])?.length, 2);

// FAILS rather than returning empty. An unresolved ref renders as '' and that
// is how a template once produced a prompt with every label present and every
// value blank; a misspelled assistant is an authoring error and must say so.
const missing = resolveRef('@assistant.nope.name', ctx);
check('unknown assistant fails', missing.success, false);
check('and names what exists', /calc/.test(missing.error ?? ''), true);

const noRegistry = resolveRef('@assistant.calc', {} as ResolutionContext);
check('no registry fails', noRegistry.success, false);

check(
  'interpolates',
  interpolate('{{@assistant.calc.alias}} handles {{@assistant.calc.routing.handles}}', ctx),
  'calc handles arithmetic written as an expression'
);

// The reason the namespace exists: typeahead can only offer what is listed.
check('offered by getNamespaces', getNamespaces().some((n) => n.name === 'assistant'), true);

console.log(`\n${pass} passed, ${fail.length} failed`);
for (const f of fail) console.log(`\n  FAIL ${f}`);
process.exit(fail.length ? 1 : 0);
