#!/usr/bin/env node
/**
 * Symbia service functional probe — OBSERVATION ONLY.
 *
 * Records what each service did when asked. It does not decide whether that
 * was correct. There are no pass/fail verdicts in this file, by design:
 * a conclusion baked into a probe rots the moment the code underneath changes.
 *
 * Rules this script obeys:
 *   - Blank beats green. A check that did not run records `null`, never 0 and
 *     never "ok". Absence of evidence is its own state, spelled "not_checked".
 *   - Observation, not inference. "status 404" is recorded. "endpoint missing"
 *     is not.
 *   - Ports come from what is actually published by Docker, then fall back to
 *     the declared map. A disagreement between the two is itself recorded.
 *
 * Usage:  node ops/functional-probe.mjs [--json-only] [--out <dir>]
 * Output: ops/functional-runs.jsonl        (one line per run, appended)
 *         ops/functional-tests/<ts>.md     (dated human-readable report)
 */

import { writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT_MS = 6000;
const MAX_ENDPOINTS_PER_SERVICE = 6;

/** Declared port map — from the project system map. May disagree with reality. */
const DECLARED = {
  identity: 5001,
  logging: 5002,
  catalog: 5003,
  assistants: 5004,
  messaging: 5005,
  runtime: 5006,
  integrations: 5007,
  models: 5008,
  network: 5054,
};

/**
 * The control center is probed separately. It is a single-page app: a dev
 * server answers 200 with index.html for paths that do not exist, so an HTTP
 * status from it says almost nothing about whether the UI works. Recorded as
 * reachability only, explicitly labelled as such. Whether the UI functions is
 * a browser question, not a curl question.
 */
const UI_SURFACES = [
  { label: 'control-center (vite dev)', url: 'http://localhost:5173/' },
  { label: 'control-center (container build)', url: 'http://localhost:8000/' },
  { label: 'control-center proxy -> identity', url: 'http://localhost:5173/svc/identity/health' },
];

// ---------------------------------------------------------------- observation

const now = () => new Date().toISOString();

/** Perform one HTTP GET. Returns an observation, never a judgement. */
async function probe(url, { fullBody = false } = {}) {
  const started = performance.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: 'manual' });
    const latencyMs = Math.round(performance.now() - started);
    let body = null;
    try {
      body = await res.text();
    } catch {
      body = null;
    }
    return {
      url,
      checked: true,
      status: res.status,
      latencyMs,
      bodyHead: body === null ? null : body.slice(0, 200),
      body: fullBody ? body : null,
      error: null,
    };
  } catch (err) {
    return {
      url,
      checked: true,
      status: null,
      latencyMs: Math.round(performance.now() - started),
      bodyHead: null,
      body: null,
      error: err?.name === 'AbortError' ? `timeout after ${TIMEOUT_MS}ms` : String(err?.message ?? err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** What Docker says is actually published, keyed by container name fragment. */
function observedPorts() {
  try {
    const raw = execSync('docker ps --format "{{.Names}}\t{{.Ports}}"', {
      encoding: 'utf8',
      timeout: 15000,
    });
    const map = {};
    for (const line of raw.trim().split('\n')) {
      if (!line) continue;
      const [name, ports = ''] = line.split('\t');
      const hostPorts = [...ports.matchAll(/0\.0\.0\.0:(\d+)->/g)].map((m) => Number(m[1]));
      if (hostPorts.length) map[name] = [...new Set(hostPorts)];
    }
    return { checked: true, map, error: null };
  } catch (err) {
    // Docker not reachable is not a failure of the services. It means this
    // particular question was not answered.
    return { checked: false, map: null, error: String(err?.message ?? err) };
  }
}

/** Resolve the port to probe for a service, recording any disagreement. */
function resolvePort(service, docker) {
  const declared = DECLARED[service];
  if (!docker.checked || !docker.map) {
    return { port: declared, source: 'declared', portAgreement: 'not_checked' };
  }
  const entry = Object.entries(docker.map).find(([name]) =>
    name.includes(`-${service}-`) || name.endsWith(`-${service}`) || name === service,
  );
  if (!entry) return { port: declared, source: 'declared', portAgreement: 'no_container_matched' };
  const ports = entry[1];
  if (ports.includes(declared)) return { port: declared, source: 'docker', portAgreement: 'agrees' };
  return {
    port: ports[0],
    source: 'docker',
    portAgreement: `disagrees: declared ${declared}, published ${ports.join(',')}`,
  };
}

/**
 * Parameterless GET paths declared by the service's own OpenAPI document,
 * prefixed with the base path the document itself declares in `servers`.
 * Ignoring that prefix produces a page of 404s that describe the probe's
 * assumption rather than the service — which this script did on its first run.
 */
function parameterlessGets(spec) {
  if (!spec || typeof spec.paths !== 'object') return { basePath: '', paths: [] };
  const declared = spec?.servers?.[0]?.url ?? '';
  // Only a path-relative server url is usable here; an absolute url points
  // somewhere this probe was not asked to reach.
  const basePath = declared.startsWith('/') ? declared.replace(/\/$/, '') : '';
  const paths = Object.entries(spec.paths)
    .filter(([p, ops]) => !p.includes('{') && ops && typeof ops.get === 'object')
    .map(([p]) => p);
  return { basePath, paths, declaredServer: declared };
}

async function probeService(service, docker) {
  const { port, source, portAgreement } = resolvePort(service, docker);
  const base = `http://localhost:${port}`;

  const health = await probe(`${base}/health`);

  // Only ask the spec question if the service answered at all. Asking a dead
  // port for its OpenAPI document produces noise, not information.
  let spec = { checked: false, title: null, version: null, pathCount: null, error: 'not_checked: health did not return a status' };
  let endpoints = null;

  if (health.status !== null) {
    const specRes = await probe(`${base}/docs/openapi.json`, { fullBody: true });
    if (specRes.status === 200) {
      try {
        const parsed = JSON.parse(specRes.body ?? '{}');
        const { basePath, paths, declaredServer } = parameterlessGets(parsed);
        spec = {
          checked: true,
          title: parsed?.info?.title ?? null,
          version: parsed?.info?.version ?? null,
          pathCount: Object.keys(parsed?.paths ?? {}).length,
          declaredServer: declaredServer ?? null,
          basePath,
          error: null,
        };
        endpoints = [];
        for (const p of paths.slice(0, MAX_ENDPOINTS_PER_SERVICE)) {
          const url = `${base}${basePath}${p}`;
          const r = await probe(url);
          endpoints.push({ path: `${basePath}${p}`, url, status: r.status, latencyMs: r.latencyMs, error: r.error });
        }
      } catch (err) {
        spec = { checked: false, title: null, version: null, pathCount: null, error: `spec parse failed: ${err?.message}` };
      }
    } else {
      spec = {
        checked: false,
        title: null,
        version: null,
        pathCount: null,
        error: `not_checked: /docs/openapi.json returned ${specRes.status ?? specRes.error}`,
      };
    }
  }

  return { service, port, portSource: source, portAgreement, health, spec, endpoints };
}

// -------------------------------------------------------------------- reports

function toMarkdown(run) {
  const L = [];
  L.push(`# Symbia functional probe — ${run.ts}`);
  L.push('');
  L.push('Observation only. Status codes are recorded; no endpoint is declared');
  L.push('working or broken here. `not_checked` means the question was not asked,');
  L.push('which is different from asked-and-answered-badly.');
  L.push('');
  L.push(`Repo HEAD: \`${run.repo.head}\` — ${run.repo.branch}${run.repo.dirty ? ' (uncommitted changes present)' : ''}`);
  L.push('');
  L.push('## Services');
  L.push('');
  L.push('| service | port | /health | latency | spec title | version | GET paths probed |');
  L.push('|---|---|---|---|---|---|---|');
  for (const s of run.services) {
    const h = s.health.status === null ? `no response (${s.health.error})` : String(s.health.status);
    const eps = s.endpoints === null ? 'not_checked' : `${s.endpoints.length}`;
    L.push(
      `| ${s.service} | ${s.port} | ${h} | ${s.health.latencyMs}ms | ${s.spec.title ?? '—'} | ${s.spec.version ?? '—'} | ${eps} |`,
    );
  }
  L.push('');

  const disagreements = run.services.filter((s) => String(s.portAgreement).startsWith('disagrees'));
  if (disagreements.length) {
    L.push('## Port map disagreements');
    L.push('');
    L.push('The declared system map and the published container ports differ. Recorded, not resolved.');
    L.push('');
    for (const s of disagreements) L.push(`- **${s.service}** — ${s.portAgreement}`);
    L.push('');
  }

  L.push('## Endpoint observations');
  L.push('');
  for (const s of run.services) {
    L.push(`### ${s.service} (:${s.port})`);
    L.push('');
    if (s.endpoints === null) {
      L.push(`_not_checked_ — ${s.spec.error ?? 'no reason recorded'}`);
      L.push('');
      continue;
    }
    if (!s.endpoints.length) {
      L.push('_no parameterless GET operations declared in the service\'s own OpenAPI document_');
      L.push('');
      continue;
    }
    L.push('| path | status | latency |');
    L.push('|---|---|---|');
    for (const e of s.endpoints) {
      L.push(`| \`${e.path}\` | ${e.status === null ? `no response (${e.error})` : e.status} | ${e.latencyMs}ms |`);
    }
    L.push('');
  }

  L.push('## UI surfaces (reachability only)');
  L.push('');
  L.push('A single-page app answers 200 for paths that do not exist. These rows say');
  L.push('a server responded, and nothing about whether any button works.');
  L.push('');
  L.push('| surface | status | latency |');
  L.push('|---|---|---|');
  for (const u of run.uiSurfaces) {
    L.push(`| ${u.label} | ${u.status === null ? `no response (${u.error})` : u.status} | ${u.latencyMs}ms |`);
  }
  L.push('');
  L.push('## Counts');
  L.push('');
  L.push(`- services asked: ${run.counts.asked}`);
  L.push(`- services that returned any HTTP status on /health: ${run.counts.responded}`);
  L.push(`- services that returned no status at all: ${run.counts.silent}`);
  L.push(`- endpoint probes recorded: ${run.counts.endpointProbes}`);
  L.push(`- docker port inspection: ${run.docker.checked ? 'answered' : `not_checked (${run.docker.error})`}`);
  L.push('');
  L.push('UI is not covered by this script. Browser observations are appended by the');
  L.push('scheduled task that calls this script.');
  L.push('');
  return L.join('\n');
}

function repoState() {
  const git = (cmd) => {
    try {
      return execSync(`git -C "${REPO}" ${cmd}`, { encoding: 'utf8', timeout: 10000 }).trim();
    } catch {
      return null;
    }
  };
  return {
    head: git('rev-parse --short HEAD'),
    branch: git('rev-parse --abbrev-ref HEAD'),
    dirty: (git('status --porcelain') ?? '').length > 0,
  };
}

// ----------------------------------------------------------------------- main

const docker = observedPorts();
const services = [];
for (const name of Object.keys(DECLARED)) {
  services.push(await probeService(name, docker));
}

const uiSurfaces = [];
for (const s of UI_SURFACES) {
  const r = await probe(s.url);
  uiSurfaces.push({ label: s.label, url: s.url, status: r.status, latencyMs: r.latencyMs, error: r.error });
}

const run = {
  ts: now(),
  repo: repoState(),
  docker: { checked: docker.checked, error: docker.error },
  services,
  uiSurfaces,
  browser: { checked: false, note: 'not_checked by this script — appended by the scheduled task' },
  counts: {
    asked: services.length,
    responded: services.filter((s) => s.health.status !== null).length,
    silent: services.filter((s) => s.health.status === null).length,
    endpointProbes: services.reduce((n, s) => n + (s.endpoints?.length ?? 0), 0),
  },
};

const outDir = join(REPO, 'ops', 'functional-tests');
mkdirSync(outDir, { recursive: true });

const stamp = run.ts.replace(/[:.]/g, '-').slice(0, 19);
const mdPath = join(outDir, `${stamp}-functional-probe.md`);
const jsonlPath = join(REPO, 'ops', 'functional-runs.jsonl');

appendFileSync(jsonlPath, JSON.stringify(run) + '\n');
if (!process.argv.includes('--json-only')) writeFileSync(mdPath, toMarkdown(run));

console.log(JSON.stringify({ jsonl: jsonlPath, markdown: mdPath, counts: run.counts }, null, 2));
