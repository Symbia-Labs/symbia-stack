import { build as esbuild } from 'esbuild';
import { rm, readFile } from 'fs/promises';

/**
 * Deps bundled INTO the output (everything the service imports at runtime that
 * is not an @symbia/* workspace package). @symbia/* stay external and resolve
 * from node_modules, matching the other services' build.
 */
const allowlist = ['cookie-parser', 'cors', 'express'];

async function buildAll() {
  await rm('dist', { recursive: true, force: true });

  const pkg = JSON.parse(await readFile('package.json', 'utf-8'));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter(
    (dep) => !allowlist.includes(dep) && !dep.startsWith('@symbia/')
  );

  console.log('building server...');
  await esbuild({
    entryPoints: ['server/src/index.ts'],
    platform: 'node',
    bundle: true,
    format: 'esm',
    outfile: 'dist/index.mjs',
    banner: {
      js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
    },
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    minify: true,
    external: externals,
    logLevel: 'info',
  });

  console.log('built -> dist/index.mjs');
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
