#!/usr/bin/env tsx
/**
 * Which source files does the shipped bundle actually contain?
 *
 * Written because grep got it wrong. On 6 Aug 2026 I reported
 * ServiceObservationPanel (989 lines) and six chart components as unreachable
 * and archived them, from a grep for `panels/ServiceObservationPanel'`. The
 * file is imported by OverviewPanel as `./ServiceObservationPanel` — relative,
 * so the pattern missed it — and the build broke immediately.
 *
 * The grep shared my assumption about how imports are written. This does not
 * ask a pattern what it can find; it asks esbuild what it included. The module
 * graph is the same one that produces the bundle, so it cannot disagree with
 * what ships.
 *
 * Still not infallible, and the limit is worth stating rather than discovering:
 * a component reached only by dynamic `import()` with a computed specifier,
 * or by a string key resolved at runtime, is invisible here too. It reports
 * what the bundler linked, which is a fact about the build, not a proof of
 * deadness. Treat output as a list to check, not a list to delete.
 */
import { build } from 'esbuild';
import { glob } from 'node:fs/promises';
import path from 'node:path';

const IGNORE = /(^archive\/|\.d\.ts$)/;

async function main() {
  const result = await build({
    entryPoints: ['src/main.tsx'],
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    platform: 'browser',
    jsx: 'automatic',
    alias: { '@': path.resolve('src') },
    // The tailwind entry is preprocessed by the real build; here it only needs
    // to resolve, and its contents do not affect the module graph.
    external: ['*.css'],
    logLevel: 'silent',
  });

  const linked = new Set(
    Object.keys(result.metafile!.inputs)
      .filter((f) => f.startsWith('src/'))
      .map((f) => path.normalize(f))
  );

  const onDisk: string[] = [];
  for await (const f of glob('src/**/*.{ts,tsx}')) {
    if (!IGNORE.test(f)) onDisk.push(path.normalize(f));
  }

  const orphans = onDisk.filter((f) => !linked.has(f)).sort();

  console.log(`linked into the bundle: ${linked.size}`);
  console.log(`on disk under src/:     ${onDisk.length}`);

  if (orphans.length === 0) {
    console.log('\nNo files on disk that the bundle does not link.');
    return;
  }

  console.log(`\n${orphans.length} file(s) on disk but NOT in the bundle:`);
  for (const f of orphans) console.log(`  ${f}`);
  console.log(
    '\nNot a verdict. See the header — dynamic imports are invisible here.\n' +
      'Check each one before concluding anything.'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
