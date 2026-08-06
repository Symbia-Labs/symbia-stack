#!/usr/bin/env tsx
/**
 * Control center build — esbuild, matching the shape every service uses in
 * scripts/build.ts. Replaces Vite.
 *
 * The point is not that Vite is unwanted. It is that a build with a dev mode
 * and a prod mode kept producing the same defect: `import.meta.env.DEV`
 * measured FALSE in the running page even under `npm run dev`, so URL
 * decisions gated on it silently took the wrong branch. That was fixed twice,
 * in two files, because it was written twice. This build has one mode, so the
 * decision does not exist to get wrong.
 *
 * Outputs, all served by server/ on 8000 from the same origin as the API
 * calls the page makes:
 *
 *   dist/app.js               bundle
 *   dist/app.css              tailwind, preprocessed
 *   dist/index.html           script/link tags rewritten to the built names
 *   dist/favicon.svg          from public/
 *   dist/vendor/monaco/vs/    the editor, vendored (see F8)
 *
 * Monaco is copied here rather than fetched. @monaco-editor/react does not
 * bundle the editor; it ships a loader that pulls it from cdn.jsdelivr.net at
 * runtime, so opening a catalog resource made a cross-origin request to a
 * third party and ran whatever version the CDN served. Vendoring makes the
 * locked version the running one and removes the network dependency.
 */
import { build as esbuild, type Plugin } from 'esbuild';
import { rm, mkdir, cp, readFile, writeFile, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import path from 'node:path';

const run = promisify(execFile);
const require = createRequire(import.meta.url);

const WATCH = process.argv.includes('--watch');
const OUT = 'dist';
const TMP = '.build';
const CSS_ENTRY = 'src/styles/globals.css';
const CSS_BUILT = path.join(TMP, 'globals.built.css');

/**
 * esbuild does not understand `@tailwind` / `@apply`, so Tailwind's own CLI
 * preprocesses the stylesheet first and this plugin points the source import
 * at the result. Source is left untouched: main.tsx still says
 * `import './styles/globals.css'`.
 */
const tailwindPlugin: Plugin = {
  name: 'tailwind-preprocessed',
  setup(b) {
    b.onResolve({ filter: /styles\/globals\.css$/ }, () => ({
      path: path.resolve(CSS_BUILT),
    }));
  },
};

async function buildCss() {
  // Tailwind's CLI resolves @import (globals.css pulls in the shared design
  // tokens from website/design-system) and expands the directives.
  await run('npx', [
    'tailwindcss',
    '-i', CSS_ENTRY,
    '-o', CSS_BUILT,
    '--minify',
  ]);
}

async function copyMonaco() {
  // Resolve through node rather than assuming a path, so a hoisted install and
  // a nested one both work.
  const pkg = require.resolve('monaco-editor/package.json');
  const vs = path.join(path.dirname(pkg), 'min', 'vs');
  await access(vs); // fail loudly if the package moved
  await cp(vs, path.join(OUT, 'vendor', 'monaco', 'vs'), { recursive: true });
}

async function emitHtml() {
  // The dev server rewrote `/src/main.tsx` on the fly. Nothing rewrites it now,
  // so the built names are written in explicitly.
  const html = await readFile('index.html', 'utf8');
  const out = html
    .replace(
      '<script type="module" src="/src/main.tsx"></script>',
      '<script type="module" src="/app.js"></script>'
    )
    .replace('</head>', '  <link rel="stylesheet" href="/app.css" />\n  </head>');

  if (out === html) {
    throw new Error(
      'index.html did not contain the expected entry script tag. ' +
        'Rewriting silently did nothing, which would ship a blank page.'
    );
  }
  await writeFile(path.join(OUT, 'index.html'), out);
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await rm(TMP, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  await mkdir(TMP, { recursive: true });

  console.log('css...');
  await buildCss();

  console.log('bundle...');
  const ctx = {
    entryPoints: ['src/main.tsx'],
    bundle: true,
    format: 'esm' as const,
    platform: 'browser' as const,
    target: ['es2022'],
    outfile: path.join(OUT, 'app.js'),
    jsx: 'automatic' as const,
    minify: !WATCH,
    sourcemap: true,
    alias: { '@': path.resolve('src') },
    plugins: [tailwindPlugin],
    loader: {
      '.svg': 'dataurl' as const,
      '.png': 'dataurl' as const,
      '.woff': 'file' as const,
      '.woff2': 'file' as const,
    },
    // The dev/prod branch this rebuild removes. Defined so any surviving
    // reference fails loudly at build rather than evaluating to undefined and
    // silently taking the production path in development, which is exactly how
    // the original defect presented.
    define: {
      'process.env.NODE_ENV': WATCH ? '"development"' : '"production"',
    },
    logLevel: 'info' as const,
  };

  await esbuild(ctx);

  console.log('assets...');
  await cp('public', OUT, { recursive: true });
  await emitHtml();

  console.log('monaco...');
  await copyMonaco();

  console.log(`built -> ${OUT}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
