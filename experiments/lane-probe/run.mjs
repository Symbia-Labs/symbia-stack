#!/usr/bin/env node
/**
 * D10 measurement: can a graph branch on the lane it received?
 *
 * Predictions are registered in docs/2026-08-14-lane-visibility-predictions.md
 * and were committed BEFORE this script was run. Read them first; this file
 * deliberately contains no expected values, so it cannot quietly agree with
 * itself.
 *
 * Loads the probe graph through POST /api/graphs (the ad-hoc path, which has no
 * owning catalog resource) rather than scripts/register-graph.mjs. That is a
 * deliberate exception for a throwaway probe: the governed path hydrates on
 * boot, and restarting the stack to measure a semantics question would change
 * more than it measures. Nothing here is a platform capability.
 *
 * Usage: node experiments/lane-probe/run.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME = (process.env.RUNTIME_ENDPOINT || 'http://localhost:5006').replace(/\/$/, '');
const IDENTITY = (process.env.IDENTITY_ENDPOINT || 'http://localhost:5001').replace(/\/$/, '');

/**
 * Under DEV_NO_AUTH, identity issues a REAL signed token to an untokened
 * request at /api/auth/me. Using it is the supported local path: every other
 * service keeps checking auth exactly as it always has, and the bypass stays
 * confined to who gets issued a token — which is what logging in is. Do not
 * replace this with a service-token header; that would be a second auth path.
 */
let TOKEN = null;
async function devToken() {
  const res = await fetch(`${IDENTITY}/api/auth/me`);
  if (!res.ok) throw new Error(`identity /api/auth/me -> ${res.status}`);
  const body = await res.json();
  if (!body.token) {
    throw new Error(
      'identity returned no token. DEV_NO_AUTH is probably off, or a cookie/header was sent.'
    );
  }
  return { token: body.token, issuedBy: body.tokenIssuedBy, as: body.user?.email };
}

async function call(method, url, body) {
  const res = await fetch(`${RUNTIME}${url}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

function describe(outputs) {
  // Report which collect node received a value, and the lane each carries.
  const seen = {};
  for (const [node, fv] of Object.entries(outputs ?? {})) {
    seen[node] = fv && typeof fv === 'object' && 'lane' in fv
      ? { lane: fv.lane, value: fv.value }
      : { lane: '(absent from output)', value: fv };
  }
  return seen;
}

const def = JSON.parse(fs.readFileSync(path.join(here, 'lane-probe.graph.json'), 'utf8'));

console.log('# D10 lane-visibility measurement');
console.log(`# runtime: ${RUNTIME}`);
console.log(`# utc: ${new Date().toISOString()}`);

const auth = await devToken();
TOKEN = auth.token;
console.log(`# auth: ${auth.issuedBy} as ${auth.as}\n`);

const load = await call('POST', '/api/graphs', def);
console.log(`load  -> ${load.status} ${JSON.stringify(load.body).slice(0, 200)}`);
if (load.status >= 400) process.exit(1);

const graphId = load.body.id ?? load.body.graphId;
const exec = await call('POST', `/api/graphs/${graphId}/execute`);
console.log(`exec  -> ${exec.status} ${JSON.stringify(exec.body).slice(0, 200)}\n`);
if (exec.status >= 400) process.exit(1);

// Delivery 1: only key "a". Expected set is ["a","b"], so "b" is missing and
// the rollup must emit apocryphal.
const d1 = await call('POST', '/api/ingress/lane-probe', { key: 'a', value: 1 });
console.log('— delivery 1: {key:"a",value:1} — expected key "b" absent —');
console.log(`  http ${d1.status}, hops ${d1.body?.hops}`);
console.log(`  outputs: ${JSON.stringify(describe(d1.body?.outputs), null, 2)}\n`);

// Delivery 2: key "b" completes the expected set. Same port, canonical lane.
const d2 = await call('POST', '/api/ingress/lane-probe', { key: 'b', value: 2 });
console.log('— delivery 2: {key:"b",value:2} — expected set now complete —');
console.log(`  http ${d2.status}, hops ${d2.body?.hops}`);
console.log(`  outputs: ${JSON.stringify(describe(d2.body?.outputs), null, 2)}\n`);

console.log('# Read the two output blocks against P1-P6. Which collect node');
console.log('# fired is the answer; the lane field on each output answers P6.');
