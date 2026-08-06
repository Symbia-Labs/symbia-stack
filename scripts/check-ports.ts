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
  'docker-compose.override.yml',
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

// Every running service must expose its port to compose under the documented
// ${SERVICE_PORT:-default} form, with the default matching the registry.
console.log('Checking docker-compose port mappings against the registry...');
if (existsSync('docker-compose.yml')) {
  const compose = readFileSync('docker-compose.yml', 'utf8');
  for (const id of RunningServices) {
    const port = ServicePorts[id];
    if (!new RegExp(`(?<!\\d)${port}(?!\\d)`).test(compose)) {
      failures++;
      console.error(
        `  docker-compose.yml  no mapping found for ${id} (${port}) — ` +
          `registered services should be reachable, or the absence should be deliberate`
      );
    }
  }
}

if (failures) {
  console.error(`\n${failures} port drift problem(s). @symbia/sys is the source.`);
  process.exit(1);
}
console.log('\nNo drift.');
