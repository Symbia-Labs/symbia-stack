#!/usr/bin/env tsx
/**
 * Port drift check.
 *
 * @symbia/sys is the registry. Compose files, .env.example files, start
 * scripts and Dockerfiles cannot import it, so they restate ports as literals.
 * That restatement is the F2/F4 defect class: a hand-maintained copy of a
 * derived fact, which drifts silently.
 *
 * This does not generate those files. It asserts they agree with the registry,
 * so the drift becomes a failing check rather than a service answering on a
 * port nobody expected. Run by `npm run check:ports` and by the pre-commit
 * hook.
 *
 * What it deliberately does NOT do: assert anything about docs, READMEs or
 * the website. Those drift too, and that is worth knowing, but a doc naming an
 * old port misleads a reader while a compose file naming one breaks a stack.
 * Mixing the two would make this check noisy enough to be disabled.
 */
import { readFileSync, existsSync } from 'node:fs';
import { ServicePorts, ServiceId, RunningServices } from '@symbia/sys';

/** Ports that have been retired. Finding one is always a defect. */
const RETIRED: Record<string, string> = {
  '5054': 'network moved to 5009 on 6 Aug 2026',
  '5173': 'the Vite dev server was removed; the console is served on 8000',
  '3000': 'service-admin moved to 9000 and was registered as ServiceId.API',
};

/** Files that must not contain a retired port. */
const OPERATIONAL = [
  'docker-compose.yml',
  'docker-compose.dev.yml',
  'start.sh',
  'start-local.sh',
  '.env.example',
  'network/Dockerfile',
  ...[
    'identity', 'logging', 'catalog', 'assistants', 'messaging',
    'network', 'runtime', 'integrations', 'models',
  ].map((s) => `${s}/.env.example`),
];

let failures = 0;
const note = (file: string, line: number, msg: string) => {
  failures++;
  console.error(`  ${file}:${line}  ${msg}`);
};

console.log('Registry:');
for (const id of RunningServices) {
  console.log(`  ${id.padEnd(16)} ${ServicePorts[id]}`);
}
console.log(
  `  ${ServiceId.SERVER.padEnd(16)} ${ServicePorts[ServiceId.SERVER]}  (reserved, not running)`
);

console.log('\nChecking operational config for retired ports...');
for (const file of OPERATIONAL) {
  if (!existsSync(file)) continue;
  readFileSync(file, 'utf8').split('\n').forEach((text, i) => {
    for (const [port, why] of Object.entries(RETIRED)) {
      // Word-boundary match so 5054 does not fire on 15054 or 50543.
      if (new RegExp(`(?<!\\d)${port}(?!\\d)`).test(text)) {
        note(file, i + 1, `retired port ${port} — ${why}`);
      }
    }
  });
}

/**
 * Published-port assertions.
 *
 * This used to test whether the port NUMBER appeared anywhere in
 * docker-compose.yml. After the 8 Aug 2026 exposure change it would still have
 * passed — every number survives in `IDENTITY_SERVICE_URL: http://identity:5001`
 * and in the header comment — while nothing was published at all. A check that
 * a comment can satisfy is not a check. It now matches published mappings only.
 */
const PUBLISHED = /^\s*-\s*"\$\{[A-Z_]+:-(\d+)\}:(\d+)"/gm;
const publishedIn = (file: string): Set<number> => {
  const out = new Set<number>();
  if (!existsSync(file)) return out;
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(PUBLISHED)) out.add(Number(m[1]));
  return out;
};

console.log('\nChecking published ports...');
const base = publishedIn('docker-compose.yml');
const dev = publishedIn('docker-compose.dev.yml');

// The default surface is one door. Anything else published by default is a
// door somebody opened without saying so.
const API_PORT = ServicePorts[ServiceId.API];
for (const port of base) {
  if (port !== API_PORT) {
    note(
      'docker-compose.yml',
      0,
      `publishes ${port} by default — only ${API_PORT} (api) should be public; ` +
        `move it to docker-compose.dev.yml`
    );
  }
}
if (!base.has(API_PORT)) {
  note('docker-compose.yml', 0, `does not publish ${API_PORT} (api) — nothing reaches the host`);
}

// Every running service must still be reachable by a developer who opts in.
const reachable = new Set([...base, ...dev]);
for (const id of RunningServices) {
  const port = ServicePorts[id];
  if (!reachable.has(port)) {
    note(
      'docker-compose.dev.yml',
      0,
      `${id} (${port}) is published by neither file — a developer cannot reach it at all`
    );
  }
}
console.log(`  default surface: ${[...base].join(', ') || 'nothing'}`);
console.log(`  dev overlay adds: ${[...dev].filter((p) => !base.has(p)).sort((a, b) => a - b).join(', ')}`);

if (failures) {
  console.error(`\n${failures} port drift problem(s). @symbia/sys is the source.`);
  process.exit(1);
}
console.log('\nNo drift.');
