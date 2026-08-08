#!/usr/bin/env node
/**
 * Staleness detector — is the running thing the written thing?
 *
 * WHY THIS EXISTS. On 8 Aug 2026 four separate staleness failures were found in
 * one session, and not one of them presented as an error:
 *
 *   1. The catalog container was stale while its source was current. A manifest
 *      write returned 2xx, the version bumped, and both new fields were silently
 *      stripped — because the validator on the far side of the call did not know
 *      them and zod discards unknown keys.
 *   2. The runtime container, before rebuild, would have "verified" old
 *      behaviour as new.
 *   3. The installed MCP server reports 0 log streams against 883,496 entries,
 *      and network on 5054 against a container healthy on 5009.
 *   4. `symbia-mcp-server/dist` on 7 Aug — same class, observed and left.
 *
 * Staleness on this platform does not present as a failure. It presents as a
 * confident answer from the wrong build. That is the product thesis pointed
 * inward, and it is why this is an instrument rather than a habit.
 *
 * WHAT IT WILL NOT DO. It does not rebuild, restart or repair anything. It
 * reports. Choosing a remedy requires knowing which rung of
 * reboot/rebuild/reinstall applies (docs 2026-08-08 §11.2), and a detector that
 * also acts is a detector that can talk itself into having succeeded.
 *
 * THREE RESULTS, NOT TWO. Every check returns DRIFT, CLEAN, or UNCHECKED.
 * UNCHECKED is never folded into CLEAN and never affects the exit code beyond
 * being printed loudly. A confident pass that means "never asked" is the exact
 * defect this platform exists to prevent, and this file would be a poor place
 * to reintroduce it.
 *
 *   npx tsx scripts/check-staleness.mts [--json]
 *
 * Exit 1 on DRIFT. Exit 0 otherwise — including when everything was UNCHECKED,
 * because "I could not look" is not "I looked and it was fine", and the caller
 * is told which it was.
 */

const CATALOG = process.env.CATALOG_URL || 'http://localhost:5003';
const IDENTITY = process.env.IDENTITY_URL || 'http://localhost:5001';
const RUNTIME = process.env.RUNTIME_URL || 'http://localhost:5006';
const JSON_OUT = process.argv.includes('--json');

type State = 'DRIFT' | 'CLEAN' | 'UNCHECKED';
interface Finding {
  check: string;
  state: State;
  /** What was observed. Never a diagnosis — see discipline 7. */
  detail: string;
}
const findings: Finding[] = [];
const record = (check: string, state: State, detail: string) =>
  findings.push({ check, state, detail });

/**
 * Shared contracts, and the services that embed a copy of one.
 *
 * `token` must be a string present in the CURRENT source of the contract and
 * absent from any build predating it. Grepping it inside a RUNNING container's
 * bundle is the check — an image tag, a healthy status and a build's own exit
 * code all describe intent, not what is loaded.
 *
 * THIS LIST IS HAND-MAINTAINED AND THEREFORE INCOMPLETE. A service absent from
 * it is UNCHECKED, not clean. Adding a field to a shared contract without adding
 * its consumers here produces exactly the silence this file was written about.
 */
const SHARED_CONTRACTS: {
  name: string;
  source: string;
  token: string;
  consumers: { service: string; container: string; bundle: string }[];
}[] = [
  {
    name: 'ComponentManifest',
    source: 'catalog/shared/schema.ts',
    token: 'laneNote',
    consumers: [
      { service: 'catalog', container: 'symbia-stack-catalog-1', bundle: 'dist/index.mjs' },
      { service: 'runtime', container: 'symbia-stack-runtime-1', bundle: 'dist/index.mjs' },
    ],
  },
];

async function token(): Promise<string | undefined> {
  try {
    const r = await fetch(`${IDENTITY}/api/auth/me`);
    return ((await r.json()) as { token?: string }).token;
  } catch {
    return undefined;
  }
}

/** Mirror of runtime buildManifests(): how a component SHOULD appear once published. */
function expectedManifest(c: any) {
  const lane = (name: string) =>
    c.lanes?.[name]?.lane ?? (c.emitsApocryphal ? 'apocryphal' : 'inherit');
  return {
    outputs: (c.outputs ?? []).map((n: string) => ({ name: n, lane: lane(n) })),
    inputs: (c.inputs ?? []).map((n: string) => ({ name: n })),
    config: c.config,
  };
}

/**
 * CHECK 1 — what the runtime is running vs what the catalog publishes.
 *
 * Pure API, both sides already exposed. This is the check that would have
 * caught failure 1 above BEFORE it was written up as a success.
 */
async function checkManifestConformance(auth?: string) {
  let running: any[];
  let published: any[];

  try {
    const r = await fetch(`${RUNTIME}/api/components`);
    if (!r.ok) return record('manifest-conformance', 'UNCHECKED', `runtime /api/components -> ${r.status}`);
    const d = await r.json();
    running = d.components ?? d;
  } catch (e) {
    return record('manifest-conformance', 'UNCHECKED', `runtime unreachable: ${(e as Error).message}`);
  }

  try {
    const r = await fetch(`${CATALOG}/api/resources?type=component&limit=200`, {
      headers: auth ? { Authorization: `Bearer ${auth}` } : {},
    });
    if (!r.ok) return record('manifest-conformance', 'UNCHECKED', `catalog /api/resources -> ${r.status}`);
    const d = await r.json();
    published = d.resources ?? d.data ?? d;
  } catch (e) {
    return record('manifest-conformance', 'UNCHECKED', `catalog unreachable: ${(e as Error).message}`);
  }

  const byKey = new Map<string, any>();
  for (const r of published) {
    const m = r.metadata?.manifest;
    if (m?.key) byKey.set(m.key, m);
  }

  const drift: string[] = [];

  for (const c of running) {
    const m = byKey.get(c.id);
    if (!m) {
      drift.push(`${c.id}: running, not published`);
      continue;
    }
    const want = expectedManifest(c);

    const wantPorts = want.outputs.map((p: any) => `${p.name}:${p.lane}`).join(',');
    const gotPorts = (m.outputs ?? [])
      .map((p: any) => `${p.name}:${p.lane ?? 'inherit'}`)
      .join(',');
    if (wantPorts !== gotPorts) drift.push(`${c.id}: outputs — running [${wantPorts}] vs published [${gotPorts}]`);

    // undefined and {} are different claims and must not compare equal.
    const wantCfg = want.config === undefined ? 'undeclared' : JSON.stringify(Object.keys(want.config).sort());
    const gotCfg = m.config === undefined ? 'undeclared' : JSON.stringify(Object.keys(m.config).sort());
    if (wantCfg !== gotCfg) drift.push(`${c.id}: config keys — running ${wantCfg} vs published ${gotCfg}`);
  }

  const runningIds = new Set(running.map((c) => c.id));
  for (const key of byKey.keys()) {
    if (!runningIds.has(key)) drift.push(`${key}: published, not running`);
  }

  if (drift.length === 0) {
    record('manifest-conformance', 'CLEAN', `${running.length} components agree with the catalog on ports, lanes and config keys`);
  } else {
    record('manifest-conformance', 'DRIFT', drift.join('\n    '));
  }
}

/**
 * CHECK 2 — does the RUNNING bundle contain the code on disk?
 *
 * The only check here that looks past the API. A 2xx proves a service answered,
 * not that it answered with the current contract; failure 1 above returned 2xx
 * throughout while discarding the payload.
 */
async function checkBundleMarkers() {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);

  try {
    await run('docker', ['version', '--format', '{{.Server.Version}}']);
  } catch {
    return record(
      'bundle-markers',
      'UNCHECKED',
      'docker not available to this caller — every consumer below is unchecked, not clean:\n    ' +
        SHARED_CONTRACTS.flatMap((c) => c.consumers.map((s) => `${c.name} in ${s.service}`)).join('\n    ')
    );
  }

  const drift: string[] = [];
  const unchecked: string[] = [];
  let checked = 0;

  for (const contract of SHARED_CONTRACTS) {
    for (const s of contract.consumers) {
      try {
        const { stdout } = await run('docker', [
          'exec', s.container, 'sh', '-c', `grep -c "${contract.token}" ${s.bundle} || true`,
        ]);
        const n = Number(stdout.trim().split('\n').pop());
        checked++;
        if (!Number.isFinite(n) || n === 0) {
          drift.push(
            `${s.service}: running bundle has no "${contract.token}" — it predates ${contract.source}. ` +
              `Producers on this contract: ${contract.consumers.map((x) => x.service).join(', ')}`
          );
        }
      } catch (e) {
        unchecked.push(`${s.service}: ${(e as Error).message.split('\n')[0]}`);
      }
    }
  }

  if (drift.length) record('bundle-markers', 'DRIFT', drift.join('\n    '));
  else if (checked > 0) record('bundle-markers', 'CLEAN', `${checked} running bundle(s) contain the current contract marker`);
  if (unchecked.length) record('bundle-markers', 'UNCHECKED', unchecked.join('\n    '));

  // Say out loud what was never in scope. Silence here reads as coverage.
  const covered = new Set(SHARED_CONTRACTS.flatMap((c) => c.consumers.map((s) => s.service)));
  record(
    'bundle-markers-coverage',
    'UNCHECKED',
    `only ${[...covered].join(', ')} are declared in SHARED_CONTRACTS. Every other service is unchecked, ` +
      `not clean — including the MCP server, which is configured outside this repo and has drifted before.`
  );
}

const auth = await token();
if (!auth) record('auth', 'UNCHECKED', `no token from ${IDENTITY}/api/auth/me — catalog reads may be unauthorised`);
await checkManifestConformance(auth);
await checkBundleMarkers();

if (JSON_OUT) {
  console.log(JSON.stringify({ findings }, null, 2));
} else {
  const icon = { DRIFT: '✗ DRIFT    ', CLEAN: '✓ CLEAN    ', UNCHECKED: '? UNCHECKED' };
  console.log('\nStaleness check — is the running thing the written thing?\n');
  for (const f of findings) console.log(`${icon[f.state]}  ${f.check}\n    ${f.detail}\n`);
  const d = findings.filter((f) => f.state === 'DRIFT').length;
  const u = findings.filter((f) => f.state === 'UNCHECKED').length;
  console.log(`${d} drift, ${findings.filter((f) => f.state === 'CLEAN').length} clean, ${u} unchecked.`);
  if (d === 0 && u > 0) console.log('No drift found in what was checked. That is not the same as no drift.');
}

process.exit(findings.some((f) => f.state === 'DRIFT') ? 1 : 0);
